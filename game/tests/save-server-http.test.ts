import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy, LocalSaveJournal, MAX_SAVE_BYTES, MAX_SAVE_WIRE_BYTES, SaveError, SaveRepository,
  type WriteSaveRequest } from '../src/save-api';
import { DynamoSaveStorage, type DynamoSaveGetInput, type DynamoSavePutInput } from '../src/save-api/dynamodb';
import { HttpSaveRemote } from '../src/save-api/http';
import type { SaveHttpServer } from '../src/save-server/http.mjs';
import { createCognitoIdTokenVerifier } from '../src/save-server/jwt.mjs';
import { createSaveServer } from '../src/save-server/service';
import { authConfig, close, listen, rawRequest, signer } from './save-server-fixtures.mjs';

const keys = signer();
const serverNow = '2026-11-13T22:30:00.000Z';
const servers: SaveHttpServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(close)); });
const request = (expectedRevision = 0, idempotencyKey = 'device-0001', n = 1): WriteSaveRequest => ({
  schemaVersion: 1, expectedRevision, idempotencyKey, data: { v: 1, n,
    assets: { moneyYen: 50 }, phone: { chat: ['こんにちは'] }, unknown: { keep: true } },
});

async function setup() {
  const rows = new Map<string, Record<string, unknown>>();
  const getItem = vi.fn(async (input: DynamoSaveGetInput): Promise<{ Item?: Record<string, unknown> }> => {
    const row = rows.get(`${input.Key.pk.S}|${input.Key.sk.S}`);
    return row ? { Item: copy(row) } : {};
  });
  const putItem = vi.fn(async (input: DynamoSavePutInput) => {
    const id = `${(input.Item.pk as { S: string }).S}|${(input.Item.sk as { S: string }).S}`;
    const old = rows.get(id); const values = input.ExpressionAttributeValues;
    const matches = values ? old !== undefined && JSON.stringify(old.revision) === JSON.stringify(values[':expected']) &&
      JSON.stringify(old.ownerSub) === JSON.stringify(values[':owner']) : old === undefined;
    if (!matches) throw Object.assign(new Error('CONDITIONAL_FAILURE'), { name: 'ConditionalCheckFailedException' });
    rows.set(id, copy(input.Item)); return {};
  });
  const storage = new DynamoSaveStorage({ getItem, putItem }, 'test-save-table');
  const getJwks = vi.fn(async (): Promise<unknown> => keys.jwks);
  const verifyToken = createCognitoIdTokenVerifier({ ...authConfig, getJwks, nowSeconds: () => authConfig.nowSeconds });
  const server = createSaveServer({ storage, verifyToken, now: () => serverNow });
  servers.push(server);
  const base = await listen(server);
  const statuses: number[] = []; const sentBodies: string[] = []; let dropNextPut = false;
  const fetcher: typeof fetch = async (input, init) => {
    if (init?.body !== undefined) sentBodies.push(String(init.body));
    const response = await fetch(`${base}${String(input)}`, init); statuses.push(response.status);
    if (dropNextPut && init?.method === 'PUT') {
      dropNextPut = false; await response.arrayBuffer(); throw new Error('TEST_RESPONSE_LOST');
    }
    return response;
  };
  const token = keys.token();
  const remote = (value: string | null = token) => new HttpSaveRemote({ getToken: () => value, fetch: fetcher });
  const repository = (owner = 'alice', value: string | null = token) => {
    const disk = new Map<string, string>(); let sequence = 0;
    return new SaveRepository(new LocalSaveJournal(owner, 'auto', () => ({ getItem: key => disk.get(key) ?? null,
      setItem: (key, text) => { disk.set(key, text); } })), remote(value), () => `repo-key-${++sequence}`);
  };
  const api = async (method = 'GET', body?: unknown, value: string | null = token, path = '/api/saves/auto') => {
    const response = await fetch(`${base}${path}`, { method, headers: {
      ...(value === null ? {} : { Authorization: `Bearer ${value}` }), 'Content-Type': 'application/json',
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as unknown, cache: response.headers.get('Cache-Control'),
      allow: response.headers.get('Allow') };
  };
  return { rows, getItem, putItem, getJwks, base, token, api, remote, repository, statuses, sentBodies,
    dropNextResponse: () => { dropNextPut = true; } };
}

describe('Node HTTP boundary with real loopback HTTP, repository and injected DynamoDB', () => {
  it('serves the ALB health path without credentials or storage, with no-store', async () => {
    const s = await setup(); s.getItem.mockRejectedValue(new Error('STORAGE_OFFLINE'));
    expect(await s.api('GET', undefined, null, '/api/health')).toMatchObject({ status: 200, body: { ok: true }, cache: 'no-store' });
    expect(s.getJwks).not.toHaveBeenCalled(); expect(s.getItem).not.toHaveBeenCalled();
  });
  it('writes and reloads opaque game data through the existing repository and HTTP remote', async () => {
    const s = await setup();
    expect(await s.repository().save(request().data)).toMatchObject({ confirmed: { revision: 1, updatedAt: serverNow },
      data: request().data, pendingCount: 0, durable: true });
    expect(await s.repository().load()).toMatchObject({ data: request().data, confirmed: { revision: 1 } });
    expect(s.statuses).toEqual([200, 200]);
    expect(s.getItem.mock.calls.every(([input]) => input.ConsistentRead && input.TableName === 'test-save-table')).toBe(true);
    expect(s.putItem.mock.calls[0][0].ConditionExpression).toBe('attribute_not_exists(#pk)');
    expect((await s.api()).cache).toBe('no-store');
  });
  it('rejects absent authorization on both methods and keeps unsigned local progress', async () => {
    const s = await setup();
    for (const method of ['GET', 'PUT']) {
      expect(await s.api(method, method === 'PUT' ? request() : undefined, null)).toMatchObject({
        status: 401, cache: 'no-store', body: { error: { code: 'UNAUTHENTICATED' } } });
    }
    expect(await s.repository('alice', null).save(request().data)).toMatchObject({ pendingCount: 1, problem: 'UNAUTHENTICATED' });
    expect(s.getItem).not.toHaveBeenCalled(); expect(s.putItem).not.toHaveBeenCalled();
  });
  it('rejects forged, expired, wrong-pool and wrong-client tokens before accessing storage', async () => {
    const s = await setup(); const foreign = signer();
    for (const token of [foreign.token(), keys.token({ exp: 0 }), keys.token({ iss: 'different-pool' }),
      keys.token({ aud: 'different-client' }), keys.token({ token_use: 'access' }), keys.token({}, { alg: 'HS256' })]) {
      expect(await s.api('PUT', request(), token)).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } });
    }
    expect(s.getItem).not.toHaveBeenCalled(); expect(s.putItem).not.toHaveBeenCalled();
  });
  it('uses verified sub even when body, query or token claims name another owner', async () => {
    const s = await setup();
    expect((await s.api('PUT', { ...request(), userId: 'bob', ownerSub: 'bob' }, keys.token({ userId: 'bob' }),
      '/api/saves/auto?userId=bob')).status).toBe(200);
    const bobToken = keys.token({ sub: 'bob' });
    expect((await s.remote(bobToken).read('auto')).status).toBe(404);
    expect(await s.repository('bob', bobToken).save(request(0, 'bob-key-0001', 2).data)).toMatchObject({ confirmed: { revision: 1 } });
    expect((await s.repository().load()).data?.n).toBe(1);
    expect((await s.repository('bob', bobToken).load()).data?.n).toBe(2);
    expect(s.rows.size).toBe(2);
  });
  it('returns a real 409 to a stale repository and retains both snapshots', async () => {
    const s = await setup(); const first = s.repository(); const stale = s.repository();
    await first.save(request().data); await stale.load();
    await first.save(request(1, 'next-key-0001', 2).data);
    expect(await stale.save(request(1, 'stale-0001', 3).data)).toMatchObject({ pendingCount: 1,
      data: { n: 3 }, problem: 'REVISION_CONFLICT', conflict: { revision: 2, data: { n: 2 } } });
    expect(s.statuses.at(-1)).toBe(409);
    expect((await s.repository().load()).data?.n).toBe(2);
  });
  it('retries the same idempotency key after an HTTP response is lost after commit', async () => {
    const s = await setup(); const repository = s.repository(); s.dropNextResponse();
    expect(await repository.save(request().data)).toMatchObject({ pendingCount: 1, problem: 'NETWORK' });
    expect(await repository.sync()).toMatchObject({ pendingCount: 0, confirmed: { revision: 1 } });
    expect(s.sentBodies).toHaveLength(2); expect(s.sentBodies[0]).toBe(s.sentBodies[1]);
    expect(s.putItem).toHaveBeenCalledTimes(1);
  });
  it('returns 409 for changed content under the same retained key', async () => {
    const s = await setup(); await s.remote().write('auto', request());
    expect(await s.remote().write('auto', request(0, 'device-0001', 2))).toMatchObject({
      status: 409, body: { error: { code: 'IDEMPOTENCY_CONFLICT' } } });
    expect(s.putItem).toHaveBeenCalledTimes(1);
  });
  it('allows one concurrent conditional write and isolates per-request error observation', async () => {
    const s = await setup();
    const results = await Promise.all([s.remote().write('auto', request()), s.remote().write('auto', request(0, 'parallel-0001', 2))]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    s.getItem.mockRejectedValueOnce(new SaveError('CORRUPT_SAVE'));
    const responses = await Promise.all([s.api(), s.api()]);
    expect(responses.map(result => result.status).sort()).toEqual([200, 500]);
  });
  it('accepts exactly the data bound and then saves again through the repository', async () => {
    const s = await setup(); const repository = s.repository(); const data = { v: 1, pad: '' };
    const remaining = MAX_SAVE_BYTES - new TextEncoder().encode(JSON.stringify(data)).length;
    data.pad = '界'.repeat(Math.floor(remaining / 3)) + 'x'.repeat(remaining % 3);
    expect(await repository.save(data)).toMatchObject({ pendingCount: 0, confirmed: { revision: 1 } });
    expect((await s.repository().load()).data).toEqual(data);
    expect(await repository.save(request().data)).toMatchObject({ pendingCount: 0, confirmed: { revision: 2 } });
  });
  it('enforces the full wire byte limit before parsing, even when chunked JSON never ends', async () => {
    const s = await setup();
    const result = await rawRequest(`${s.base}/api/saves/auto`, { headers: {
      Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked',
    }, chunks: [' '.repeat(MAX_SAVE_WIRE_BYTES), '界'], finish: false });
    expect(result).toMatchObject({ status: 413, body: { error: { code: 'TOO_LARGE' } } });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(s.getItem).not.toHaveBeenCalled(); expect(s.putItem).not.toHaveBeenCalled();
  });
  it('rejects an oversized declared length before receiving the body', async () => {
    const s = await setup();
    expect(await rawRequest(`${s.base}/api/saves/auto`, { headers: { Authorization: `Bearer ${s.token}`,
      'Content-Type': 'application/json', 'Content-Length': String(MAX_SAVE_WIRE_BYTES + 1) }, finish: false }))
      .toMatchObject({ status: 413, body: { error: { code: 'TOO_LARGE' } } });
    expect(s.getItem).not.toHaveBeenCalled();
  });
  it('accepts a request exactly at the wire bound and rejects valid JSON exceeding the data bound', async () => {
    const s = await setup(); const json = JSON.stringify(request());
    const result = await rawRequest(`${s.base}/api/saves/auto`, { headers: {
      Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json',
    }, chunks: [json, ' '.repeat(MAX_SAVE_WIRE_BYTES - new TextEncoder().encode(json).length)] });
    expect(result.status).toBe(200);
    expect(await s.api('PUT', { ...request(1, 'large-0001'), data: { v: 1, pad: 'x'.repeat(MAX_SAVE_BYTES) } }))
      .toMatchObject({ status: 413, body: { error: { code: 'TOO_LARGE' } } });
    expect(s.putItem).toHaveBeenCalledTimes(1);
  });
  it.each(['{broken', '', Uint8Array.from([0xc3, 0x28])])('maps invalid JSON or UTF-8 to 400 (%#)', async body => {
    const s = await setup();
    expect(await rawRequest(`${s.base}/api/saves/auto`, { headers: {
      Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json',
    }, chunks: [body] })).toMatchObject({ status: 400, body: { error: { code: 'INVALID_REQUEST' } } });
    expect(s.getItem).not.toHaveBeenCalled();
  });
  it('rejects duplicate Authorization headers without choosing one credential', async () => {
    const s = await setup();
    expect(await rawRequest(`${s.base}/api/saves/auto`, { method: 'GET', headers: [
      'Authorization', `Bearer ${s.token}`, 'Authorization', `Bearer ${keys.token({ sub: 'bob' })}`,
    ] })).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } });
    expect(s.getItem).not.toHaveBeenCalled();
  });
  it('returns 404/405 for paths and methods without normalizing paths', async () => {
    const s = await setup();
    expect(await s.api('GET', undefined, null, '/other')).toMatchObject({ status: 404, cache: 'no-store' });
    expect(await s.api('POST', {}, null)).toMatchObject({ status: 405, allow: 'GET, PUT', cache: 'no-store' });
    expect(await s.api('PUT', {}, null, '/api/health')).toMatchObject({ status: 405, allow: 'GET' });
    expect((await s.api('GET', undefined, s.token, '/api/saves/AUTO')).status).toBe(400);
    expect((await s.api('GET', undefined, s.token, '/api/saves/a/other')).status).toBe(404);
    expect((await s.api('GET', undefined, s.token, '/api/saves/%2e%2e%2fother')).status).toBe(400);
    expect(s.getItem).not.toHaveBeenCalled();
  });
  it.each([
    ['damaged JSON', { S: '{broken' }, 500, 'CORRUPT_SAVE'],
    ['future envelope', { S: JSON.stringify({ schemaVersion: 2 }) }, 422, 'UNSUPPORTED_VERSION'],
  ] as const)('preserves %s and distinguishes it from an outage on reads and writes', async (_name, attribute, status, code) => {
    const s = await setup(); await s.remote().write('auto', request());
    const row = s.rows.get('USER#alice|SAVE#auto')!; row.saveJson = attribute; const before = copy(row);
    expect(await s.api()).toMatchObject({ status, cache: 'no-store', body: { error: { code } } });
    expect(await s.repository().load()).toMatchObject({ problem: code });
    expect(await s.repository().save(request(1).data)).toMatchObject({ pendingCount: 1, problem: code });
    expect(s.rows.get('USER#alice|SAVE#auto')).toEqual(before); expect(s.putItem).toHaveBeenCalledTimes(1);
  });
  it('rejects future game data on input and on a stored row without overwriting', async () => {
    const s = await setup();
    expect(await s.api('PUT', { ...request(), data: { v: 2 } })).toMatchObject({ status: 422, body: { error: { code: 'UNSUPPORTED_VERSION' } } });
    await s.api('PUT', request());
    const row = s.rows.get('USER#alice|SAVE#auto')!;
    const envelope = JSON.parse((row.saveJson as { S: string }).S); envelope.data.v = 2;
    row.saveJson = { S: JSON.stringify(envelope) };
    expect(await s.api()).toMatchObject({ status: 422, body: { error: { code: 'UNSUPPORTED_VERSION' } } });
    expect(s.putItem).toHaveBeenCalledTimes(1);
  });
  it('maps read and write outages to 503 and retains pending data for retry', async () => {
    const s = await setup();
    s.getItem.mockRejectedValueOnce(new Error('STORAGE_DETAIL'));
    expect(await s.api()).toMatchObject({ status: 503, cache: 'no-store', body: { error: { code: 'UNAVAILABLE' } } });
    const repository = s.repository(); s.putItem.mockRejectedValueOnce(new Error('STORAGE_DETAIL'));
    expect(await repository.save(request().data)).toMatchObject({ pendingCount: 1, problem: 'UNAVAILABLE' });
    expect(await repository.sync()).toMatchObject({ pendingCount: 0, confirmed: { revision: 1 } });
  });
  it('maps an unavailable JWKS source to 503 without attempting storage access', async () => {
    const s = await setup(); s.getJwks.mockRejectedValueOnce(new Error('CONFIG_PROVIDER_DETAIL'));
    expect(await s.api()).toMatchObject({ status: 503, body: { error: { code: 'UNAVAILABLE' } } });
    expect(s.getItem).not.toHaveBeenCalled();
  });
});
