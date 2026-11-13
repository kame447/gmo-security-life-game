import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { MemorySaveStorage, type SaveStorage } from '../src/save-api/server';
import { readSaveServerConfig, SaveStartupError, type SaveServerConfig } from '../src/save-server/config.mjs';
import type { RunningSaveServer, SignalSource } from '../src/save-server/lifecycle.mjs';
import { runSaveServerEntry } from '../src/save-server/runtime.mjs';
import { startSaveServer, type SaveBackendFactory } from '../src/save-server/startup';
import { signer } from './save-server-fixtures.mjs';

// Narrow structural ports keep this browser project's existing dependency set intact.
const fs = await vi.importActual<{
  mkdtemp(prefix: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
}>('node:fs/promises');
interface TestChild {
  stdout: { on(event: string, callback: (value: unknown) => void): unknown };
  stderr: { on(event: string, callback: (value: unknown) => void): unknown };
  on(event: string, callback: (...values: unknown[]) => void): unknown;
  off(event: string, callback: (...values: unknown[]) => void): unknown;
  send(message: unknown): boolean;
  kill(signal: string): boolean;
  exitCode: number | null;
  signalCode: string | null;
}
const { fork } = await vi.importActual<{ fork(path: string, args: string[], options: {
  execArgv: string[]; env: Record<string, string>; stdio: ['ignore', 'pipe', 'pipe', 'ipc'];
}): TestChild }>('node:child_process');
const keys = signer();
const environment = () => ({ SAVE_API_HOST: '127.0.0.1', SAVE_API_PORT: '0', SAVE_API_TABLE_NAME: 'local-save-test',
  AWS_REGION: 'ap-northeast-1', COGNITO_ISSUER: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_TestPool',
  COGNITO_CLIENT_ID: 'localTestClient', SAVE_API_JWKS_PARAMETER: '/local/test/cognito/jwks', SAVE_API_HEALTH_PATH: '/api/health' });
const required = Object.keys(environment());
const token = () => keys.token({ iss: environment().COGNITO_ISSUER, aud: environment().COGNITO_CLIENT_ID,
  exp: Math.floor(Date.now() / 1000) + 3600 });
const handles: RunningSaveServer[] = [];
const directories: string[] = [];
const children: TestChild[] = [];
function signals() {
  const callbacks = new Map<string, Set<() => void>>();
  const source: SignalSource = {
    on(signal, callback) { const list = callbacks.get(signal) ?? new Set(); list.add(callback); callbacks.set(signal, list); },
    off(signal, callback) { callbacks.get(signal)?.delete(callback); },
  };
  return { source, emit(signal: string) { for (const callback of callbacks.get(signal) ?? []) callback(); },
    count: () => [...callbacks.values()].reduce((sum, list) => sum + list.size, 0) };
}
async function local(storage: SaveStorage = new MemorySaveStorage(), getJwks: () => unknown = () => keys.jwks,
  close = vi.fn(async () => {}), config = readSaveServerConfig(environment())) {
  const events = signals();
  const factory = vi.fn(async (_config: SaveServerConfig) => ({ storage, getJwks, close }));
  const handle = await startSaveServer(config, factory, { signals: events.source }); handles.push(handle);
  return { handle, events, factory, close, base: `http://127.0.0.1:${handle.address.port}` };
}
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  await Promise.all(handles.splice(0).map(handle => handle.stop().catch(() => undefined)));
  await Promise.all(directories.splice(0).map(path => fs.rm(path, { recursive: true, force: true })));
});

describe('required startup configuration', () => {
  it('returns the explicitly supplied values and leaves the environment unchanged', () => {
    const env = environment(); const before = { ...env }; const config = readSaveServerConfig(env);
    expect(config).toEqual({ host: '127.0.0.1', port: 0, tableName: env.SAVE_API_TABLE_NAME, region: env.AWS_REGION,
      issuer: env.COGNITO_ISSUER, clientId: env.COGNITO_CLIENT_ID, jwksParameterName: env.SAVE_API_JWKS_PARAMETER,
      healthPath: env.SAVE_API_HEALTH_PATH });
    expect(Object.isFrozen(config)).toBe(true); expect(env).toEqual(before);
  });
  it.each(required)('requires %s without choosing a default', field => {
    const env: Record<string, string> = environment(); delete env[field];
    expect(() => readSaveServerConfig(env)).toThrow(`INVALID_CONFIGURATION: ${field}`);
  });
  it.each([
    ['SAVE_API_HOST', 'localhost'], ['SAVE_API_HOST', '127.0.0.999'], ['SAVE_API_HOST', '::1%lo0'],
    ['SAVE_API_PORT', '-1'], ['SAVE_API_PORT', '65536'], ['SAVE_API_PORT', '1.5'], ['SAVE_API_PORT', ' 80'],
    ['SAVE_API_TABLE_NAME', 'ab'], ['SAVE_API_TABLE_NAME', 'bad/table'], ['AWS_REGION', 'other'],
    ['COGNITO_ISSUER', 'http://example.invalid/pool'],
    ['COGNITO_ISSUER', 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Other'],
    ['COGNITO_ISSUER', environment().COGNITO_ISSUER + '?token=opaque'],
    ['COGNITO_CLIENT_ID', 'client with spaces'], ['SAVE_API_JWKS_PARAMETER', 'https://example.invalid/jwks'],
    ['SAVE_API_JWKS_PARAMETER', '/local/../jwks'], ['SAVE_API_JWKS_PARAMETER', '/local/test/jwks\n'],
    ['SAVE_API_HEALTH_PATH', '/health'], ['SAVE_API_HEALTH_PATH', '/api/saves/auto'],
  ])('rejects invalid %s using only the item name (%#)', (field, value) => {
    expect(() => readSaveServerConfig({ ...environment(), [field]: value })).toThrow(`INVALID_CONFIGURATION: ${field}`);
  });
  it('lists all missing fields and does not echo supplied tokens or key text', () => {
    expect(() => readSaveServerConfig({})).toThrow('INVALID_CONFIGURATION: ' + required.join(', '));
    const secret = `Authorization: Bearer ${token()}`;
    try { readSaveServerConfig({ ...environment(), SAVE_API_HOST: secret, SAVE_API_JWKS_PARAMETER: JSON.stringify(keys.jwks) }); }
    catch (error) {
      expect(error).toBeInstanceOf(SaveStartupError);
      expect((error as Error).message).toBe('INVALID_CONFIGURATION: SAVE_API_HOST, SAVE_API_JWKS_PARAMETER');
      expect((error as Error).message.includes(secret)).toBe(false);
    }
  });
});

describe('injected startup and graceful lifecycle', () => {
  it('starts only with an explicit backend factory and passes validated configuration to it', async () => {
    const s = await local();
    expect(s.factory).toHaveBeenCalledExactlyOnceWith(readSaveServerConfig(environment()),
      expect.objectContaining({ createDynamoStorage: expect.any(Function) }));
    expect((await fetch(`${s.base}/api/health`)).status).toBe(200);
    await expect(startSaveServer(readSaveServerConfig(environment()), undefined as unknown as SaveBackendFactory))
      .rejects.toThrow('BACKEND_INITIALIZATION_FAILED');
    await s.handle.stop(); expect(s.close).toHaveBeenCalledTimes(1); expect(s.events.count()).toBe(0);
  });
  it('uses the explicitly injected memory store and generated key for a local save round trip', async () => {
    const s = await local(); const credential = token();
    const put = await fetch(`${s.base}/api/saves/auto`, { method: 'PUT', headers: {
      Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ schemaVersion: 1, expectedRevision: 0, idempotencyKey: 'local-key-0001', data: { v: 1, keep: 'local' } }) });
    expect(put.status).toBe(200); await put.arrayBuffer();
    const get = await fetch(`${s.base}/api/saves/auto`, { headers: { Authorization: `Bearer ${credential}` } });
    expect(await get.json()).toMatchObject({ save: { revision: 1, data: { keep: 'local' } } });
  });
  it('fails closed when trusted key acquisition fails, without reading storage', async () => {
    const storage = new MemorySaveStorage(); const read = vi.spyOn(storage, 'read');
    const s = await local(storage, () => { throw new Error(`Authorization: Bearer ${token()}`); });
    const response = await fetch(`${s.base}/api/saves/auto`, { headers: { Authorization: `Bearer ${token()}` } });
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: { code: 'UNAVAILABLE' } });
    expect(read).not.toHaveBeenCalled();
  });
  it('sanitizes factory initialization errors', async () => {
    const error = new Error(JSON.stringify(keys.jwks));
    await expect(startSaveServer(readSaveServerConfig(environment()), () => { throw error; }))
      .rejects.toMatchObject({ code: 'BACKEND_INITIALIZATION_FAILED', message: 'BACKEND_INITIALIZATION_FAILED' });
  });
  it('sanitizes shutdown-provider errors and still removes signal handlers', async () => {
    const s = await local(new MemorySaveStorage(), () => keys.jwks,
      vi.fn(async () => { throw new Error(`Authorization: Bearer ${token()}`); }));
    await expect(s.handle.stop()).rejects.toMatchObject({ code: 'STOP_FAILED', message: 'STOP_FAILED' });
    await expect(s.handle.closed).rejects.toThrow('STOP_FAILED'); expect(s.events.count()).toBe(0);
  });
  it('refuses an occupied port, removes startup listeners and releases the initialized backend', async () => {
    const first = await local(); const dispose = vi.fn(async () => {}); const events = signals();
    await expect(startSaveServer({ ...readSaveServerConfig(environment()), port: first.handle.address.port },
      () => ({ storage: new MemorySaveStorage(), getJwks: () => keys.jwks, close: dispose }), { signals: events.source }))
      .rejects.toMatchObject({ code: 'ADDRESS_IN_USE', message: 'ADDRESS_IN_USE' });
    expect(dispose).toHaveBeenCalledTimes(1); expect(events.count()).toBe(0);
    expect((await fetch(`${first.base}/api/health`)).status).toBe(200);
  });
  it.each(['SIGTERM', 'SIGINT'])('stops new connections on %s and waits for the active request before releasing its backend', async signal => {
    let entered!: () => void; let release!: () => void;
    const active = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const closeBackend = vi.fn(async () => {});
    const s = await local({ read: async () => { entered(); await gate; return undefined; }, compareAndSwap: async () => false },
      () => keys.jwks, closeBackend);
    const pending = fetch(`${s.base}/api/saves/auto`, { headers: { Authorization: `Bearer ${token()}` } });
    await active; s.events.emit(signal); s.events.emit(signal);
    try {
      expect(closeBackend).not.toHaveBeenCalled();
      let rejected = false;
      try { await fetch(`${s.base}/api/health`); } catch { rejected = true; }
      expect(rejected).toBe(true);
    } finally { release(); }
    const response = await pending; expect(response.status).toBe(404); await response.arrayBuffer();
    await s.handle.closed; expect(closeBackend).toHaveBeenCalledTimes(1); expect(s.events.count()).toBe(0);
    expect(s.handle.stop()).toBe(s.handle.stop());
  });
});

async function temporary() {
  const directory = await fs.mkdtemp('/private/tmp/slg-save-startup-'); directories.push(directory); return directory;
}
async function entryBundle(directory: string) {
  const result = await build({ entryPoints: [new URL('../src/save-server/entry.ts', import.meta.url).pathname],
    bundle: true, platform: 'node', target: 'node24', format: 'esm', write: false });
  const path = `${directory}/entry.mjs`; await fs.writeFile(path, result.outputFiles![0].text); return path;
}
async function backendModule(directory: string, contents: string) {
  const result = await build({ stdin: { contents, sourcefile: 'test-backend.ts',
    resolveDir: new URL('..', import.meta.url).pathname }, bundle: true, platform: 'node', target: 'node24', format: 'esm', write: false });
  const path = `${directory}/backend.mjs`; await fs.writeFile(path, result.outputFiles![0].text); return path;
}
function launch(path: string, env: Record<string, string>) {
  const child = fork(path, [], { execArgv: [], env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }); children.push(child);
  let output = ''; const messages: unknown[] = []; const waiters = new Set<() => void>();
  const changed = () => { for (const callback of waiters) callback(); };
  const exited = new Promise<{ code: unknown; signal: unknown }>((resolve, reject) => {
    child.on('exit', (code, signal) => { resolve({ code, signal }); changed(); });
    child.on('error', () => reject(new Error('TEST_CHILD_FAILED')));
  });
  child.stdout.on('data', value => { output += String(value); }); child.stderr.on('data', value => { output += String(value); });
  child.on('message', value => { messages.push(value); changed(); });
  const message = (type: string): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiters.delete(check); reject(new Error('TEST_CHILD_MESSAGE_TIMEOUT')); }, 3000);
    const check = () => {
      const result = messages.find(item => item !== null && typeof item === 'object' && (item as { type?: unknown }).type === type);
      if (result) { clearTimeout(timer); waiters.delete(check); resolve(result as Record<string, unknown>); }
    };
    waiters.add(check); check();
  });
  return { child, exited, message, output: () => output };
}

describe('bundled executable entry (local child Node processes)', () => {
  it('requires explicit configuration and an explicit local backend module, with no memory fallback', async () => {
    const directory = await temporary(); const entry = await entryBundle(directory);
    const missingConfig = launch(entry, {}); expect((await missingConfig.exited).code).toBe(1);
    expect(missingConfig.output().startsWith('INVALID_CONFIGURATION: SAVE_API_HOST')).toBe(true);
    const noFactory = launch(entry, environment()); expect((await noFactory.exited).code).toBe(1);
    expect(noFactory.output()).toBe('INVALID_CONFIGURATION: SAVE_API_BACKEND_MODULE\n');
    const invalidFactory = launch(entry, { ...environment(), SAVE_API_BACKEND_MODULE: 'https://example.invalid/backend.mjs' });
    expect((await invalidFactory.exited).code).toBe(1);
    expect(invalidFactory.output()).toBe('INVALID_CONFIGURATION: SAVE_API_BACKEND_MODULE\n');
  });
  it('sanitizes module-load and backend-factory errors in the actual executable output', async () => {
    const directory = await temporary(); const entry = await entryBundle(directory);
    const credential = token(); const sensitive = `Authorization: Bearer ${credential} ${JSON.stringify(keys.jwks)}`;
    const modulePath = `${directory}/broken.mjs`; await fs.writeFile(modulePath, `throw new Error(${JSON.stringify(sensitive)});`);
    const broken = launch(entry, { ...environment(), SAVE_API_BACKEND_MODULE: modulePath });
    expect((await broken.exited).code).toBe(1); expect(broken.output()).toBe('BACKEND_MODULE_FAILED\n');
    const factoryPath = `${directory}/factory.mjs`;
    await fs.writeFile(factoryPath, `export function createBackend() { throw new Error(${JSON.stringify(sensitive)}); }`);
    const factory = launch(entry, { ...environment(), SAVE_API_BACKEND_MODULE: factoryPath });
    expect((await factory.exited).code).toBe(1); expect(factory.output()).toBe('BACKEND_INITIALIZATION_FAILED\n');
    expect((broken.output() + factory.output()).includes(credential)).toBe(false);
    expect((broken.output() + factory.output()).includes(JSON.stringify(keys.jwks))).toBe(false);
  });
  it.each(['SIGTERM', 'SIGINT'])('handles real %s without terminating an active HTTP request', async signal => {
    const directory = await temporary(); const entry = await entryBundle(directory);
    const backend = await backendModule(directory, `
      import { MemorySaveStorage } from './src/save-api/server.ts';
      export function createBackend() {
        const memory = new MemorySaveStorage();
        const observe = () => process.send({ type: 'signal' });
        process.on('SIGTERM', observe); process.on('SIGINT', observe);
        return { getJwks: () => (${JSON.stringify(keys.jwks)}),
          storage: { compareAndSwap: (...args) => memory.compareAndSwap(...args),
            async read(key) {
              if(key.sk === 'SAVE#hold') {
                await new Promise(resolve => {
                  const release = message => { if(message === 'release') { process.off('message', release); resolve(); } };
                  process.on('message', release); process.send({ type: 'active' });
                });
              }
              return memory.read(key);
            }
          },
          close() { process.off('SIGTERM', observe); process.off('SIGINT', observe); if(process.connected) process.disconnect(); }
        };
      }
    `);
    const wrapper = `${directory}/wrapper.mjs`;
    await fs.writeFile(wrapper, `import { runningServer } from ${JSON.stringify(entry)};
      if(runningServer) process.send({ type: 'ready', port: runningServer.address.port });`);
    const s = launch(wrapper, { ...environment(), SAVE_API_BACKEND_MODULE: backend });
    const ready = await s.message('ready'); const base = `http://127.0.0.1:${ready.port}`; const credential = token();
    const pending = fetch(`${base}/api/saves/hold`, { headers: { Authorization: `Bearer ${credential}` } });
    await s.message('active'); s.child.kill(signal); await s.message('signal');
    try {
      expect(s.child.exitCode).toBeNull();
      let rejected = false; try { await fetch(`${base}/api/health`); } catch { rejected = true; }
      expect(rejected).toBe(true);
    } finally { s.child.send('release'); }
    const response = await pending; expect(response.status).toBe(404); await response.arrayBuffer();
    expect(await s.exited).toEqual({ code: 0, signal: null });
    expect(s.output()).toBe('SAVE_API_STARTED\nSAVE_API_STOPPED\n');
    expect(s.output().includes(credential)).toBe(false); expect(s.output().includes(String(keys.jwks.keys[0].n))).toBe(false);
  });
  it('sanitizes entry errors even if the injected start function rejects with provider text', async () => {
    const events: string[] = []; const fail = vi.fn(); const directory = await temporary();
    const modulePath = `${directory}/factory.mjs`; await fs.writeFile(modulePath, 'export function createBackend() {}');
    await runSaveServerEntry(async () => { throw new Error(`Authorization: Bearer ${token()}`); }, {
      environment: { ...environment(), SAVE_API_BACKEND_MODULE: modulePath }, report: event => events.push(event), fail,
    });
    expect(events).toEqual(['BACKEND_INITIALIZATION_FAILED']); expect(fail).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['broken row', '{broken', 500, 'CORRUPT_SAVE'],
    ['future row', '{"schemaVersion":2}', 422, 'UNSUPPORTED_VERSION'],
  ] as const)('uses the entry-owned Dynamo driver across module boundaries for a %s', async (_name, saveJson, status, code) => {
    const directory = await temporary();
    const backend = await backendModule(directory, `
      export function createBackend(config, { createDynamoStorage }) {
        return { getJwks: () => (${JSON.stringify(keys.jwks)}), storage: createDynamoStorage({
          async getItem(input) {
            return { Item: { ...input.Key, ownerSub: { S:'alice' }, revision: { N:'1' },
              saveJson: { S:${JSON.stringify(saveJson)} }, idempotencyKey: { S:'mock-key-0001' }, expectedRevision: { N:'0' } } };
          },
          async putItem() { throw new Error('MUST_NOT_WRITE'); }
        }) };
      }
    `);
    const events: string[] = []; const fail = vi.fn(); const localSignals = signals();
    const handle = await runSaveServerEntry((config, factory) => startSaveServer(config, factory, { signals: localSignals.source }), {
      environment: { ...environment(), SAVE_API_BACKEND_MODULE: backend }, report: event => events.push(event), fail,
    });
    if (!handle) throw new Error('TEST_ENTRY_DID_NOT_START'); handles.push(handle);
    const response = await fetch(`http://127.0.0.1:${handle.address.port}/api/saves/auto`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ error: { code } });
    await handle.stop(); expect(events).toEqual(['SAVE_API_STARTED', 'SAVE_API_STOPPED']); expect(fail).not.toHaveBeenCalled();
  });
});
