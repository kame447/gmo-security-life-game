import { describe, expect, it, vi } from 'vitest';
import { copy, MAX_SAVE_BYTES, MAX_SAVE_WIRE_BYTES, SaveService, type SaveKey, type StoredSave } from '../src/save-api';
import { DynamoSaveStorage, type DynamoSaveClient, type DynamoSaveGetInput, type DynamoSavePutInput } from '../src/save-api/dynamodb';

const now = '2026-11-13T20:30:00.000Z';
const key = { pk: 'USER#alice', sk: 'SAVE#auto' };
const request = (expectedRevision = 0, idempotencyKey = 'device-0001', x = 1) => ({ schemaVersion: 1,
  expectedRevision, idempotencyKey, data: { v: 1, x, assets: { moneyYen: 100 }, phone: { chat: ['hello'] }, unknown: ['kept'] } });
const stored = (revision = 1): StoredSave => ({ ownerSub: 'alice',
  save: { schemaVersion: 1, slotId: 'auto', revision, updatedAt: now, data: request().data },
  lastWrite: { idempotencyKey: 'device-0001', expectedRevision: revision - 1 } });
const id = (key: SaveKey) => JSON.stringify([key.pk, key.sk]);
const conditionalFailure = () => Object.assign(Error('condition did not match'), { name: 'ConditionalCheckFailedException' });

function setup() {
  const rows = new Map<string, Record<string, unknown>>();
  const getItem = vi.fn(async (input: DynamoSaveGetInput) => {
    const row = rows.get(id({ pk: input.Key.pk.S, sk: input.Key.sk.S }));
    return row ? { Item: copy(row) } : {};
  });
  const putItem = vi.fn(async (input: DynamoSavePutInput) => {
    const item = input.Item; const rowId = id({ pk: (item.pk as { S: string }).S, sk: (item.sk as { S: string }).S });
    const previous = rows.get(rowId); const values = input.ExpressionAttributeValues;
    const matches = values ? previous !== undefined &&
      JSON.stringify(previous.revision) === JSON.stringify(values[':expected']) &&
      JSON.stringify(previous.ownerSub) === JSON.stringify(values[':owner']) : previous === undefined;
    if (!matches) throw conditionalFailure();
    rows.set(rowId, copy(item)); return {};
  });
  const client: DynamoSaveClient = { getItem, putItem };
  const storage = new DynamoSaveStorage(client, 'test-save-table');
  return { rows, client, storage, getItem, putItem, service: new SaveService(storage, () => now) };
}

describe('server-only injected DynamoDB SaveStorage', () => {
  it('reads the exact string pk/sk composite key with strong consistency and handles missing items', async () => {
    const s = setup(); expect(await s.storage.read(key)).toBeUndefined();
    expect(s.getItem).toHaveBeenCalledExactlyOnceWith({ TableName: 'test-save-table',
      Key: { pk: { S: key.pk }, sk: { S: key.sk } }, ConsistentRead: true });
  });
  it('atomically creates the envelope, revision and last idempotency metadata in one conditional PutItem', async () => {
    const s = setup(); expect(await s.storage.compareAndSwap(key, 0, stored())).toBe(true);
    const input = s.putItem.mock.calls[0][0];
    expect(input).toEqual({ TableName: 'test-save-table', ConditionExpression: 'attribute_not_exists(#pk)',
      ExpressionAttributeNames: { '#pk': 'pk' }, Item: { pk: { S: key.pk }, sk: { S: key.sk }, ownerSub: { S: 'alice' },
        revision: { N: '1' }, saveJson: { S: JSON.stringify(stored().save) }, idempotencyKey: { S: 'device-0001' }, expectedRevision: { N: '0' } } });
    expect(await s.storage.read(key)).toEqual(stored()); expect(s.putItem).toHaveBeenCalledTimes(1);
  });
  it('conditions replacements on both the numeric revision and owner and rejects stale writers', async () => {
    const s = setup(); await s.storage.compareAndSwap(key, 0, stored());
    expect(await s.storage.compareAndSwap(key, 1, stored(2))).toBe(true);
    expect(s.putItem.mock.calls[1][0]).toMatchObject({
      ConditionExpression: '#revision = :expected AND #owner = :owner',
      ExpressionAttributeNames: { '#revision': 'revision', '#owner': 'ownerSub' },
      ExpressionAttributeValues: { ':expected': { N: '1' }, ':owner': { S: 'alice' } },
      Item: { revision: { N: '2' }, expectedRevision: { N: '1' } },
    });
    expect(await s.storage.compareAndSwap(key, 1, stored(2))).toBe(false);
    expect((await s.storage.read(key))?.save.revision).toBe(2);
  });
  it('never replaces an existing item with an expected revision of zero', async () => {
    const s = setup(); await s.storage.compareAndSwap(key, 0, stored());
    expect(await s.storage.compareAndSwap(key, 0, stored())).toBe(false);
    expect(await s.storage.read(key)).toEqual(stored());
  });
  it('returns false only for the modeled conditional failure; infrastructure errors remain errors', async () => {
    const s = setup();
    s.putItem.mockRejectedValueOnce(conditionalFailure()); expect(await s.storage.compareAndSwap(key, 0, stored())).toBe(false);
    const failure = Object.assign(Error('throttled'), { name: 'ProvisionedThroughputExceededException' });
    s.putItem.mockRejectedValueOnce(failure); await expect(s.storage.compareAndSwap(key, 0, stored())).rejects.toBe(failure);
    s.getItem.mockRejectedValueOnce(failure); await expect(s.storage.read(key)).rejects.toBe(failure);
  });
  it('does not allow the same owner in another slot to prevent a new composite-key item', async () => {
    const s = setup(); await s.storage.compareAndSwap(key, 0, stored());
    const otherKey = { ...key, sk: 'SAVE#manual-1' }; const other = stored(); other.save.slotId = 'manual-1';
    expect(await s.storage.compareAndSwap(otherKey, 0, other)).toBe(true);
    expect(s.rows.size).toBe(2);
  });
  it('separates different verified owners and slots through SaveService', async () => {
    const s = setup();
    expect((await s.service.write({ sub: 'alice' }, 'auto', request())).status).toBe(200);
    expect((await s.service.read({ sub: 'bob' }, 'auto')).status).toBe(404);
    expect((await s.service.write({ sub: 'bob' }, 'auto', request(0, 'bob-00001', 2))).status).toBe(200);
    expect((await s.service.read({ sub: 'alice' }, 'auto')).body).toMatchObject({ save: { data: { x: 1 } } });
    expect((await s.service.read({ sub: 'bob' }, 'auto')).body).toMatchObject({ save: { data: { x: 2 } } });
    expect(s.getItem.mock.calls.every(([input]) => input.ConsistentRead === true)).toBe(true);
  });
  it('allows only one simultaneous new write and returns the committed snapshot on conflict', async () => {
    const s = setup(); const principal = { sub: 'alice' };
    const results = await Promise.all([s.service.write(principal, 'auto', request()),
      s.service.write(principal, 'auto', request(0, 'other-device', 2))]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(results.find(result => result.status === 409)?.body).toMatchObject({ error: { code: 'REVISION_CONFLICT', current: { revision: 1 } } });
    expect((await s.storage.read(key))?.save.revision).toBe(1);
  });
  it('resolves simultaneous identical retries to the same revision', async () => {
    const s = setup(); const principal = { sub: 'alice' };
    const results = await Promise.all([s.service.write(principal, 'auto', request()), s.service.write(principal, 'auto', request())]);
    expect(results[0]).toEqual(results[1]); expect(results[0].status).toBe(200);
    expect((await s.storage.read(key))?.save.revision).toBe(1);
  });
  it('replays the same successful request after a storage response is lost without writing twice', async () => {
    const s = setup(); const realPut = s.client.putItem;
    s.client.putItem = async input => { await realPut(input); throw Error('response lost'); };
    expect((await s.service.write({ sub: 'alice' }, 'auto', request())).status).toBe(503);
    s.client.putItem = realPut;
    expect((await s.service.write({ sub: 'alice' }, 'auto', request())).body).toMatchObject({ save: { revision: 1 } });
    expect(s.putItem).toHaveBeenCalledTimes(1);
    expect((await s.service.write({ sub: 'alice' }, 'auto', request(0, 'device-0001', 99))).body)
      .toEqual({ error: { code: 'IDEMPOTENCY_CONFLICT' } });
  });
  it.each(['saveJson', 'revision', 'ownerSub', 'pk', 'sk', 'idempotencyKey', 'expectedRevision'])('protects a corrupt %s attribute without overwriting', async name => {
    const s = setup(); await s.storage.compareAndSwap(key, 0, stored());
    const item = s.rows.get(id(key))!;
    const invalid: Record<string, unknown> = { saveJson: { S: '{broken' }, revision: { N: '999' }, ownerSub: { S: 'bob' },
      pk: { S: 'USER#bob' }, sk: { S: 'SAVE#other' }, idempotencyKey: { S: 'bad' }, expectedRevision: { N: '99' } };
    item[name] = invalid[name]; const before = copy(item);
    await expect(s.storage.read(key)).rejects.toMatchObject({ code: 'CORRUPT_SAVE' });
    expect((await s.service.write({ sub: 'alice' }, 'auto', request(1, 'next-00001'))).status).toBe(503);
    expect(s.putItem).toHaveBeenCalledTimes(1); expect(s.rows.get(id(key))).toEqual(before);
  });
  it('rejects missing attributes and unsupported stored versions without treating them as absent slots', async () => {
    const s = setup(); s.rows.set(id(key), {});
    await expect(s.storage.read(key)).rejects.toMatchObject({ code: 'CORRUPT_SAVE' });
    s.rows.clear(); await s.storage.compareAndSwap(key, 0, stored());
    s.rows.get(id(key))!.saveJson = { S: JSON.stringify({ ...stored().save, schemaVersion: 2 }) };
    await expect(s.storage.read(key)).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' });
    expect((await s.service.write({ sub: 'alice' }, 'auto', request())).status).toBe(503);
    expect(s.putItem).toHaveBeenCalledTimes(1);
  });
  it('checks serialized envelope bytes before parsing a corrupt stored value', async () => {
    const s = setup(); await s.storage.compareAndSwap(key, 0, stored());
    s.rows.get(id(key))!.saveJson = { S: ' '.repeat(MAX_SAVE_WIRE_BYTES + 1) };
    await expect(s.storage.read(key)).rejects.toMatchObject({ code: 'CORRUPT_SAVE' });
  });
  it('round-trips 128KiB data including JSON escapes while keeping scalar item size below 400KiB', async () => {
    const s = setup(); const next = stored(); const data = { v: 1, pad: '' };
    const remaining = MAX_SAVE_BYTES - new TextEncoder().encode(JSON.stringify(data)).length;
    data.pad = '"'.repeat(Math.floor(remaining / 2)) + 'x'.repeat(remaining % 2); next.save.data = data;
    expect(new TextEncoder().encode(JSON.stringify(data)).length).toBe(MAX_SAVE_BYTES);
    expect(await s.storage.compareAndSwap(key, 0, next)).toBe(true);
    expect(await s.storage.read(key)).toEqual(next);
    const item = s.putItem.mock.calls[0][0].Item;
    const bytes = Object.entries(item).reduce((sum, [name, value]) => sum + new TextEncoder().encode(name).length +
      new TextEncoder().encode('S' in value ? value.S : value.N).length + 1, 0);
    expect(bytes).toBeLessThan(400 * 1024);
  });
  it('rejects oversized game data, mismatched CAS metadata and foreign owner/key before the SDK', async () => {
    const s = setup(); const tooLarge = stored(); tooLarge.save.data = { v: 1, pad: 'x'.repeat(MAX_SAVE_BYTES) };
    await expect(s.storage.compareAndSwap(key, 0, tooLarge)).rejects.toMatchObject({ code: 'TOO_LARGE' });
    await expect(s.storage.compareAndSwap(key, 1, stored())).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(s.storage.compareAndSwap({ ...key, pk: 'USER#bob' }, 0, stored())).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    const badLastWrite = stored(); badLastWrite.lastWrite.expectedRevision = 5;
    await expect(s.storage.compareAndSwap(key, 0, badLastWrite)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(s.putItem).not.toHaveBeenCalled();
  });
  it('returns detached decoded snapshots rather than sharing stored JSON', async () => {
    const s = setup(); const next = stored(); await s.storage.compareAndSwap(key, 0, next);
    next.save.data.x = 77; const first = (await s.storage.read(key))!; first.save.data.x = 99;
    expect((await s.storage.read(key))?.save.data.x).toBe(1);
  });
  it('requires an explicit nonempty table name', () => {
    const s = setup(); expect(() => new DynamoSaveStorage(s.client, '  ')).toThrow('INVALID_REQUEST');
  });
});
