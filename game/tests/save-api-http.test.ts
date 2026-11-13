import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERROR_HTTP, errorResponse, LocalSaveJournal, MAX_SAVE_BYTES, MAX_SAVE_WIRE_BYTES,
  MemorySaveStorage, SaveRepository, SaveService, type ApiErrorCode, type SaveEnvelope, type WriteSaveRequest } from '../src/save-api';
import { HttpSaveRemote, SaveHttpError } from '../src/save-api/http';

const now = '2026-11-13T20:30:00.000Z';
const token = 'current.id.token';
const request = (): WriteSaveRequest => ({ schemaVersion: 1, expectedRevision: 0, idempotencyKey: 'device-0001',
  data: { v: 1, x: 5, assets: { moneyYen: 100 }, phone: { chat: ['hello'] }, future: { untouched: true } } });
const save = (): SaveEnvelope => ({ schemaVersion: 1, slotId: 'auto', revision: 1, updatedAt: now, data: request().data });
const response = (body: unknown = { save: save() }, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
function setup() {
  const getToken = vi.fn(() => token);
  const fetcher = vi.fn<typeof fetch>(async () => response());
  return { getToken, fetcher, remote: new HttpSaveRemote({ getToken, fetch: fetcher }) };
}
afterEach(() => vi.useRealTimers());

describe('HTTP SaveRemote', () => {
  it('GETs the slot with an injected Bearer token and disables caching/cookies/redirects', async () => {
    const s = setup();
    expect(await s.remote.read('auto')).toEqual({ status: 200, body: { save: save() } });
    const [url, init] = s.fetcher.mock.calls[0];
    expect(url).toBe('/api/saves/auto');
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit', mode: 'same-origin', redirect: 'error' });
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(init?.body).toBeUndefined(); expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it('PUTs the full validated snapshot without changing the idempotency key', async () => {
    const s = setup(); const original = request();
    await s.remote.write('manual-1', original);
    const [url, init] = s.fetcher.mock.calls[0];
    expect(url).toBe('/api/saves/manual-1'); expect(init?.method).toBe('PUT');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual(original); expect(original).toEqual(request());
  });
  it('obtains a fresh token for every request and snapshots the payload before awaiting it', async () => {
    const s = setup(); s.getToken.mockReturnValueOnce('first.token').mockReturnValueOnce('second.token');
    const original = request(); const pending = s.remote.write('auto', original);
    original.idempotencyKey = 'changed-0001'; original.data.x = 99;
    await pending; await s.remote.read('auto');
    expect(s.getToken).toHaveBeenCalledTimes(2);
    expect(s.fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get('Authorization')))
      .toEqual(['Bearer first.token', 'Bearer second.token']);
    expect(JSON.parse(String(s.fetcher.mock.calls[0][1]?.body))).toEqual(request());
  });
  it.each([null, undefined, '', '  ', 'Bearer token', 'token\r\nInjected: value'])('skips fetch without a usable token: %j', async value => {
    const fetcher = vi.fn<typeof fetch>();
    const remote = new HttpSaveRemote({ getToken: () => value, fetch: fetcher });
    expect(await remote.read('auto')).toEqual(errorResponse('UNAUTHENTICATED'));
    expect(await remote.write('auto', request())).toEqual(errorResponse('UNAUTHENTICATED'));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('supports asynchronous token acquisition', async () => {
    const s = setup(); const remote = new HttpSaveRemote({ getToken: async () => token, fetch: s.fetcher });
    expect((await remote.read('auto')).status).toBe(200);
  });
  it('hides provider exceptions and never sends a request when acquisition fails', async () => {
    const s = setup(); const remote = new HttpSaveRemote({ getToken: async () => { throw Error('sensitive provider detail'); }, fetch: s.fetcher });
    await expect(remote.read('auto')).rejects.toMatchObject({ problem: 'NETWORK', message: 'NETWORK' });
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it.each(['../other', 'AUTO', 'auto?user=bob', 'x'.repeat(33)])('rejects invalid slot %s before authentication/fetch', async slot => {
    const s = setup();
    expect(await s.remote.read(slot)).toEqual(errorResponse('INVALID_REQUEST'));
    expect(await s.remote.write(slot, request())).toEqual(errorResponse('INVALID_REQUEST'));
    expect(s.getToken).not.toHaveBeenCalled(); expect(s.fetcher).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity, 2 ** 31])('rejects unsupported timeout %s', timeoutMs => {
    expect(() => new HttpSaveRemote({ getToken: () => token, timeoutMs })).toThrow('INVALID_REQUEST');
  });
  it.each([200, 201, 202])('preserves the actual HTTP %i status and parsed JSON', async status => {
    const s = setup(); s.fetcher.mockResolvedValueOnce(response({ save: save() }, status));
    expect(await s.remote.read('auto')).toEqual({ status, body: { save: save() } });
  });
  it.each(Object.keys(ERROR_HTTP) as ApiErrorCode[])('preserves the %s API error structure and status', async code => {
    const s = setup(); const expected = errorResponse(code, code === 'REVISION_CONFLICT' ? save() : undefined);
    s.fetcher.mockResolvedValueOnce(response(expected.body, expected.status));
    expect(await s.remote.write('auto', request())).toEqual(expected);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500, 502, 504])('returns JSON HTTP %i failures without an implicit retry', async status => {
    const s = setup(); const body = { error: { code: 'UPSTREAM_ERROR' } };
    s.fetcher.mockResolvedValueOnce(response(body, status));
    expect(await s.remote.read('auto')).toEqual({ status, body }); expect(s.fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects network failures without exposing their message', async () => {
    const s = setup(); s.fetcher.mockRejectedValueOnce(Error('token or game data in an upstream message'));
    await expect(s.remote.read('auto')).rejects.toMatchObject({ problem: 'NETWORK', message: 'NETWORK' });
  });
  it.each(['', '{broken', '<html>gateway failure</html>', '{"error":'])('rejects invalid JSON: %j', async text => {
    const s = setup(); s.fetcher.mockResolvedValueOnce(new Response(text));
    await expect(s.remote.read('auto')).rejects.toMatchObject({ problem: 'INVALID_RESPONSE' });
  });
  it('rejects invalid UTF-8 rather than silently replacing saved text', async () => {
    const s = setup(); s.fetcher.mockResolvedValueOnce(new Response(Uint8Array.from([0xc3, 0x28])));
    await expect(s.remote.read('auto')).rejects.toMatchObject({ problem: 'INVALID_RESPONSE' });
  });
  it('rejects an empty 204 response because the save API requires JSON', async () => {
    const s = setup(); s.fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(s.remote.read('auto')).rejects.toBeInstanceOf(SaveHttpError);
  });
  it('accepts exactly 128KiB of game data in both a request and a response wrapper', async () => {
    const s = setup(); const data = { v: 1, pad: '' };
    data.pad = 'x'.repeat(MAX_SAVE_BYTES - new TextEncoder().encode(JSON.stringify(data)).length);
    const input = { ...request(), data }; const saved = { ...save(), data };
    s.fetcher.mockResolvedValueOnce(response({ save: saved }));
    expect(await s.remote.write('auto', input)).toEqual({ status: 200, body: { save: saved } });
    expect(new TextEncoder().encode(String(s.fetcher.mock.calls[0][1]?.body)).length).toBeLessThan(MAX_SAVE_WIRE_BYTES);
  });
  it('rejects oversized UTF-8 data and oversized request metadata before fetch', async () => {
    const s = setup();
    expect(await s.remote.write('auto', { ...request(), data: { v: 1, pad: '界'.repeat(Math.ceil(MAX_SAVE_BYTES / 3)) } }))
      .toEqual(errorResponse('TOO_LARGE'));
    expect(await s.remote.write('auto', { ...request(), extra: 'x'.repeat(MAX_SAVE_WIRE_BYTES) } as WriteSaveRequest))
      .toEqual(errorResponse('TOO_LARGE'));
    expect(s.fetcher).not.toHaveBeenCalled(); expect(s.getToken).not.toHaveBeenCalled();
  });
  it('rejects an unsupported outgoing data version without changing it', async () => {
    const s = setup(); const input = { ...request(), data: { v: 2, future: true } };
    expect(await s.remote.write('auto', input)).toEqual(errorResponse('UNSUPPORTED_VERSION'));
    expect(input.data).toEqual({ v: 2, future: true }); expect(s.fetcher).not.toHaveBeenCalled();
  });
  it('accepts an HTTP body exactly at the wire byte limit', async () => {
    const s = setup(); const json = JSON.stringify({ save: save() });
    s.fetcher.mockResolvedValueOnce(new Response(json + ' '.repeat(MAX_SAVE_WIRE_BYTES - new TextEncoder().encode(json).length)));
    expect((await s.remote.read('auto')).body).toEqual({ save: save() });
  });
  it('rejects an oversized Content-Length and cancels the body', async () => {
    const s = setup(); const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    s.fetcher.mockResolvedValueOnce(new Response(body, { headers: { 'Content-Length': String(MAX_SAVE_WIRE_BYTES + 1) } }));
    await expect(s.remote.read('auto')).rejects.toMatchObject({ problem: 'TOO_LARGE' }); expect(cancel).toHaveBeenCalled();
  });
  it.each([undefined, '1'])('counts actual stream bytes with Content-Length %j', async declared => {
    const s = setup(); const cancel = vi.fn(); let count = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode(count++ === 0 ? ' '.repeat(MAX_SAVE_WIRE_BYTES) : '界')); }, cancel,
    });
    s.fetcher.mockResolvedValueOnce(new Response(body, { headers: declared ? { 'Content-Length': declared } : {} }));
    await expect(s.remote.read('auto')).rejects.toMatchObject({ problem: 'TOO_LARGE' }); expect(cancel).toHaveBeenCalled();
  });
  it('decodes multibyte UTF-8 split across stream chunks', async () => {
    const s = setup(); const json = { save: { ...save(), data: { v: 1, message: 'こんにちは' } } };
    const bytes = new TextEncoder().encode(JSON.stringify(json));
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.subarray(i, i + 1));
      controller.close();
    } });
    s.fetcher.mockResolvedValueOnce(new Response(stream)); expect((await s.remote.read('auto')).body).toEqual(json);
  });
  it('aborts a stalled fetch and ignores a late response even when fetch ignores AbortSignal', async () => {
    vi.useFakeTimers(); let finish!: (value: Response) => void; let signal: AbortSignal | null | undefined;
    const fetcher = vi.fn<typeof fetch>((_url, init) => { signal = init?.signal; return new Promise(resolve => { finish = resolve; }); });
    const remote = new HttpSaveRemote({ getToken: () => token, fetch: fetcher, timeoutMs: 50 });
    const result = expect(remote.write('auto', request())).rejects.toMatchObject({ problem: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(51); await result; expect(signal?.aborted).toBe(true);
    const cancel = vi.fn(); finish(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('times out stalled token acquisition and never fetches with a late token', async () => {
    vi.useFakeTimers(); let finish!: (value: string) => void; const s = setup();
    const remote = new HttpSaveRemote({ getToken: () => new Promise(resolve => { finish = resolve; }), fetch: s.fetcher, timeoutMs: 50 });
    const result = expect(remote.read('auto')).rejects.toMatchObject({ problem: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(51); await result; finish(token);
    await vi.advanceTimersByTimeAsync(0); expect(s.fetcher).not.toHaveBeenCalled();
  });
  it('keeps the timeout active after headers and cancels a stalled response stream', async () => {
    vi.useFakeTimers(); const s = setup(); const cancel = vi.fn();
    s.fetcher.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"save":')); }, cancel,
    })));
    const remote = new HttpSaveRemote({ getToken: () => token, fetch: s.fetcher, timeoutMs: 50 });
    const result = expect(remote.read('auto')).rejects.toMatchObject({ problem: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(51); await result; expect(cancel).toHaveBeenCalled();
    expect(s.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it('clears its deadline after completion', async () => {
    vi.useFakeTimers(); const s = setup(); await s.remote.read('auto');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('replays identical PUT bytes through SaveRepository after the server commits but the response is lost', async () => {
    const service = new SaveService(new MemorySaveStorage(), () => now); const sent: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      sent.push(String(init?.body));
      const result = await service.write({ sub: 'alice' }, 'auto', JSON.parse(String(init?.body)));
      if (sent.length === 1) throw Error('response lost after commit');
      return response(result.body, result.status);
    });
    const values = new Map<string, string>();
    const local = new LocalSaveJournal('alice', 'auto', () => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }));
    const repository = new SaveRepository(local, new HttpSaveRemote({ getToken: () => token, fetch: fetcher }), () => 'stable-key-0001');
    expect(await repository.save(request().data)).toMatchObject({ pendingCount: 1, problem: 'NETWORK', data: request().data });
    expect(await repository.sync()).toMatchObject({ pendingCount: 0, confirmed: { revision: 1, data: request().data } });
    expect(sent).toHaveLength(2); expect(sent[1]).toBe(sent[0]);
    expect((await service.read({ sub: 'alice' }, 'auto')).body).toMatchObject({ save: { revision: 1 } });
  });
});
