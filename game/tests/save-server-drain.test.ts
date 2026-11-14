import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemorySaveStorage, type SaveStorage } from '../src/save-api/server';
import { readSaveServerConfig, type SaveServerConfig } from '../src/save-server/config.mjs';
import type { RunningSaveServer, SignalSource } from '../src/save-server/lifecycle.mjs';
import { startSaveServer } from '../src/save-server/startup';
import { signer } from './save-server-fixtures.mjs';

// Behavior of stopping (SIGTERM/SIGINT) while connections are in various receive states.
// Node's own handling of pipelined/keep-alive requests during close() is pinned here as observed.
interface RawSocket {
  write(chunk: string): unknown; destroy(): unknown;
  on(event: string, callback: (value: { toString(encoding: 'latin1'): string }) => void): unknown;
}
const { connect: rawConnect } = await vi.importActual<{ connect(port: number, host: string): RawSocket }>('node:net');
const keys = signer();
const env = { SAVE_API_HOST: '127.0.0.1', SAVE_API_PORT: '0', SAVE_API_TABLE_NAME: 'local-save-test',
  AWS_REGION: 'ap-northeast-1', COGNITO_ISSUER: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_TestPool',
  COGNITO_CLIENT_ID: 'localTestClient', SAVE_API_JWKS_PARAMETER: '/local/test/cognito/jwks', SAVE_API_HEALTH_PATH: '/api/health' };
const token = () => keys.token({ iss: env.COGNITO_ISSUER, aud: env.COGNITO_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 3600 });
const handles: RunningSaveServer[] = [];
const sockets: RawSocket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(handles.splice(0).map(handle => handle.stop().catch(() => undefined)));
});

async function local(storage: SaveStorage = new MemorySaveStorage()) {
  const callbacks = new Map<string, Set<() => void>>();
  const source: SignalSource = {
    on(signal, callback) { const list = callbacks.get(signal) ?? new Set(); list.add(callback); callbacks.set(signal, list); },
    off(signal, callback) { callbacks.get(signal)?.delete(callback); },
  };
  const close = vi.fn(async () => {});
  const handle = await startSaveServer(readSaveServerConfig(env),
    async (_config: SaveServerConfig) => ({ storage, getJwks: () => keys.jwks, close }), { signals: source });
  handles.push(handle);
  const stop = () => { for (const callback of callbacks.get('SIGTERM') ?? []) callback(); };
  return { handle, close, stop, port: handle.address.port };
}
function client(port: number) {
  const socket = rawConnect(port, '127.0.0.1'); sockets.push(socket);
  let text = ''; let closedAt: number | undefined; const started = Date.now();
  const waiters = new Set<() => void>();
  const notify = () => waiters.forEach(waiter => waiter());
  socket.on('data', value => { text += value.toString('latin1'); notify(); });
  socket.on('error', () => undefined);
  socket.on('close', () => { closedAt = Date.now() - started; notify(); });
  const until = (done: () => boolean, ms = 8000) => new Promise<void>((resolve, reject) => {
    const check = () => { if (done()) { waiters.delete(check); clearTimeout(timer); resolve(); } };
    const timer = setTimeout(() => { waiters.delete(check); reject(new Error('TEST_WAIT_TIMEOUT')); }, ms);
    waiters.add(check); check();
  });
  return { socket, text: () => text, responses: () => (text.match(/HTTP\/1\.1 \d{3}/g) ?? []),
    closed: () => closedAt, until, waitClosed: (ms?: number) => until(() => closedAt !== undefined, ms) };
}
const health = 'GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n';
const getSave = () => `GET /api/saves/auto HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${token()}\r\n\r\n`;
const putBody = JSON.stringify({ schemaVersion: 1, expectedRevision: 0, idempotencyKey: 'drain-key-00001', data: { v: 1 } });
const putSave = () => `PUT /api/saves/auto HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${token()}\r\n` +
  `Content-Type: application/json\r\nContent-Length: ${putBody.length}\r\n\r\n${putBody}`;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function gated(memory = new MemorySaveStorage()) {
  let entered!: () => void; let release!: () => void;
  const reading = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const storage: SaveStorage = { read: async key => { entered(); await gate; return memory.read(key); },
    compareAndSwap: (key, expected, next) => memory.compareAndSwap(key, expected, next) };
  const read = vi.spyOn(storage, 'read'); const write = vi.spyOn(storage, 'compareAndSwap');
  return { storage, reading, release, read, write };
}

describe('stopping with connections in unusual receive states', () => {
  it('lets a request whose headers finish after the stop (within the deadline) complete normally', async () => {
    const s = await local(); const c = client(s.port);
    c.socket.write('GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Pending: ');
    await wait(100); s.stop(); await wait(3000);
    c.socket.write('x\r\n\r\n');
    await c.until(() => c.text().includes('"ok":true'));
    expect(c.responses()).toEqual(['HTTP/1.1 200']);
    await s.handle.closed; expect(s.close).toHaveBeenCalledTimes(1);
  }, 10000);

  it('also completes a second request that was already fully received (pipelined) before the stop, then closes', async () => {
    const g = gated(); const s = await local(g.storage); const c = client(s.port);
    c.socket.write(getSave() + putSave());
    await g.reading; s.stop(); g.release();
    await c.waitClosed(); await s.handle.closed;
    // As observed on Node 24: requests that were completely received are both served; nothing is cut midway.
    expect(c.responses()).toEqual(['HTTP/1.1 404', 'HTTP/1.1 200']);
    expect(g.read).toHaveBeenCalledTimes(2); expect(g.write).toHaveBeenCalledTimes(1);
    expect(s.close).toHaveBeenCalledTimes(1);
  }, 10000);

  it('tolerates server.close being called again while stopping', async () => {
    const s = await local(); const first = s.handle.stop();
    const second = await new Promise<unknown>(resolve => s.handle.server.close(error => resolve(error)));
    expect(second).toBeInstanceOf(Error);
    await first; await s.handle.closed; expect(s.close).toHaveBeenCalledTimes(1);
  });

  it('closes a keep-alive connection that is mid-way through its next request without a response or a write', async () => {
    const memory = new MemorySaveStorage(); const write = vi.spyOn(memory, 'compareAndSwap');
    const s = await local(memory); const c = client(s.port);
    c.socket.write(health); await c.until(() => c.responses().length === 1);
    c.socket.write(`PUT /api/saves/auto HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${token()}\r\nContent-Type: application/json\r\n`);
    await wait(100); s.stop();
    await c.waitClosed(3000); await s.handle.closed;
    // As observed on Node 24: no 400, and well before the 5 second receive deadline.
    expect(c.responses()).toEqual(['HTTP/1.1 200']);
    expect(c.closed()).toBeLessThan(3000);
    expect(write).not.toHaveBeenCalled(); expect(s.close).toHaveBeenCalledTimes(1);
  }, 10000);

  it('writes nothing for a complete PUT sent after the stop began, on a new or an already-idle keep-alive connection', async () => {
    const memory = new MemorySaveStorage(); const write = vi.spyOn(memory, 'compareAndSwap');
    const s = await local(memory); const idle = client(s.port);
    idle.socket.write(health); await idle.until(() => idle.responses().length === 1);
    s.stop(); await idle.waitClosed(3000); await s.handle.closed;
    idle.socket.write(putSave());
    const fresh = client(s.port); fresh.socket.write(putSave());
    await fresh.waitClosed(3000);
    expect(fresh.responses()).toEqual([]); expect(idle.responses()).toEqual(['HTTP/1.1 200']);
    expect(write).not.toHaveBeenCalled(); expect(s.close).toHaveBeenCalledTimes(1);
  }, 10000);

  it('writes a PUT that was in progress at the stop exactly once and answers it before the backend closes', async () => {
    const memory = new MemorySaveStorage(); const g = gated(memory);
    const s = await local(g.storage); const c = client(s.port);
    c.socket.write(putSave()); await g.reading; s.stop(); await wait(200);
    expect(s.close).not.toHaveBeenCalled();
    g.release(); await c.waitClosed(); await s.handle.closed;
    expect(c.responses()).toEqual(['HTTP/1.1 200']);
    expect(g.write).toHaveBeenCalledTimes(1); expect(await memory.read(g.write.mock.calls[0][0])).toBeDefined();
    expect(s.close).toHaveBeenCalledTimes(1);
  }, 10000);
});

describe('without a stop', () => {
  it('answers a normal request while another connection with unfinished headers is answered with 400 after the receive deadline', async () => {
    const s = await local(); const slow = client(s.port);
    slow.socket.write('GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Pending: ');
    const normal = client(s.port); normal.socket.write(health);
    await normal.until(() => normal.responses().length === 1);
    expect(normal.responses()).toEqual(['HTTP/1.1 200']);
    await slow.waitClosed(7000);
    expect(slow.responses()).toEqual(['HTTP/1.1 400']);
    expect(slow.closed()).toBeGreaterThanOrEqual(4500); expect(slow.closed()).toBeLessThan(7000);
  }, 10000);
});
