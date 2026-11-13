import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy, errorResponse, LocalSaveJournal, MAX_PENDING, MAX_SAVE_BYTES, MemorySaveStorage, SaveRepository, SaveService,
  type GameData, type HttpResponse, type KeyValueStorage, type SaveEnvelope, type SaveRemote, type WriteSaveRequest } from '../src/save-api';

const now = '2026-11-13T20:30:00.000Z';
const owner = { sub: 'alice' };
const data = (n = 1): GameData => ({ v: 1, x: n, areaId: 'town', appearance: { hairColor: 'black' },
  assets: { moneyYen: 2480, items: [{ itemId: 'pencil', quantity: 3 }],
    layout: { v: 1, bag: [null], hotbar: ['pencil', null], selectedHotbar: 0 } },
  phone: { v: 1, owned: false, dataBudget: { v: 1, remainingMb: 123.75, capacityMb: 5000 },
    chat: { v: 1, contacts: [], threads: [] } }, unknown: ['keep'] });
function disk() {
  const values = new Map<string, string>();
  const storage: KeyValueStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  return { values, storage };
}
function setup() {
  const { storage, values } = disk();
  const service = new SaveService(new MemorySaveStorage(), () => now);
  const remote: SaveRemote = { read: slot => service.read(owner, slot), write: (slot, request) => service.write(owner, slot, request) };
  let sequence = 0;
  const id = () => `device-${String(++sequence).padStart(8, '0')}`;
  const journal = () => new LocalSaveJournal(owner.sub, 'auto', () => storage);
  return { service, remote, storage, values, id, journal, repository: new SaveRepository(journal(), remote, id) };
}
afterEach(() => vi.useRealTimers());

describe('save-api local-first repository', () => {
  it('persists a full snapshot locally before delivering and restores it after recreation', async () => {
    const s = setup(); const write = s.remote.write;
    s.remote.write = async (slot, request) => {
      const pending = JSON.parse(s.values.get(s.journal().key)!).pending;
      expect(pending[0].data).toEqual(data()); return write(slot, request);
    };
    expect(await s.repository.save(data())).toMatchObject({ data: data(), pendingCount: 0, durable: true, confirmed: { revision: 1 } });
    const restored = new SaveRepository(s.journal(), s.remote, s.id);
    expect((await restored.load()).data).toEqual(data());
    const snapshot = restored.snapshot(); snapshot.data!.phone = null;
    expect(restored.snapshot().data).toEqual(data());
  });
  it('handles a remote slot that does not exist and keeps a confirmed copy on an unexpected 404', async () => {
    const s = setup(); expect(await s.repository.load()).toEqual({ pendingCount: 0, durable: true });
    await s.repository.save(data()); s.remote.read = async () => errorResponse('NOT_FOUND');
    expect(await s.repository.load()).toMatchObject({ data: data(), problem: 'NOT_FOUND' });
  });
  it('does not apply the wire depth limit again to internal journal wrappers', async () => {
    const s = setup(); let nested: unknown = null;
    for (let i = 0; i < 61; i++) nested = [nested];
    const raw = { v: 1, nested };
    expect(await s.repository.save(raw)).toMatchObject({ data: raw, pendingCount: 0, durable: true, confirmed: { revision: 1 } });
  });
  it('does not strand a near-limit save at the head of the pending queue', async () => {
    const s = setup();
    const first = await s.repository.save({ v: 1, text: 'x'.repeat(131000) });
    expect(first.problem).toBeUndefined(); expect(first.pendingCount).toBe(0);
    const next = await s.repository.save(data());
    expect(next.problem).toBeUndefined(); expect(next.pendingCount).toBe(0);
    expect((await s.repository.sync()).confirmed?.revision).toBe(2);
    expect((await s.service.read(owner, 'auto')).body).toMatchObject({ save: { revision: 2, data: data() } });
  });
  it('sends exactly the data limit, rejects one byte more before enqueue, and keeps saving', async () => {
    const s = setup();
    const overhead = new TextEncoder().encode(JSON.stringify({ v: 1, text: '' })).length;
    const text = 'x'.repeat(MAX_SAVE_BYTES - overhead);
    const exact = await s.repository.save({ v: 1, text });
    expect(exact.problem).toBeUndefined(); expect(exact.pendingCount).toBe(0);
    const oversized = await s.repository.save({ v: 1, text: text + 'x' });
    expect(oversized.problem).toBe('TOO_LARGE'); expect(oversized.pendingCount).toBe(0);
    expect(oversized.confirmed?.revision).toBe(1);
    expect((await s.repository.save(data())).confirmed?.revision).toBe(2);
    expect((await s.repository.sync()).pendingCount).toBe(0);
  });
  it.each([
    ['network', () => Promise.reject(Error('offline')), 'NETWORK'],
    ['401', async () => ({ status: 401, body: null }), 'UNAUTHENTICATED'],
    ['403', async () => ({ status: 403, body: null }), 'FORBIDDEN'],
    ['409', async () => ({ status: 409, body: null }), 'REVISION_CONFLICT'],
    ['500', async () => ({ status: 500, body: null }), 'UNAVAILABLE'],
    ['503', async () => errorResponse('UNAVAILABLE'), 'UNAVAILABLE'],
    ['corrupt', async () => ({ status: 200, body: { save: '{bad' } }), 'INVALID_RESPONSE'],
    ['future', async () => ({ status: 200, body: { save: { schemaVersion: 2 } } }), 'UNSUPPORTED_VERSION'],
  ] as const)('retains pending data/key across %s and retries after recreation', async (_name, fail, problem) => {
    const s = setup(); const write = s.remote.write;
    s.remote.write = fail;
    expect(await s.repository.save(data())).toMatchObject({ data: data(), pendingCount: 1, durable: true, problem });
    const before = JSON.parse(s.values.get(s.journal().key)!).pending[0];
    s.remote.write = write;
    const restored = new SaveRepository(s.journal(), s.remote, s.id);
    expect(await restored.sync()).toMatchObject({ data: data(), pendingCount: 0, confirmed: { revision: 1 } });
    expect(JSON.parse(s.values.get(s.journal().key)!).confirmed.data).toEqual(before.data);
  });
  it('retains latest local progress and the separate server snapshot on a real conflict', async () => {
    const s = setup(); await s.repository.save(data());
    await s.service.write(owner, 'auto', { schemaVersion: 1, expectedRevision: 1, idempotencyKey: 'other-device', data: data(5) });
    const result = await s.repository.save(data(2));
    expect(result).toMatchObject({ data: data(2), pendingCount: 1, problem: 'REVISION_CONFLICT', conflict: { revision: 2, data: data(5) } });
    expect((await s.repository.load()).data).toEqual(data(2));
    expect((await s.repository.sync()).problem).toBe('REVISION_CONFLICT');
    expect((await s.service.read(owner, 'auto')).body).toMatchObject({ save: { revision: 2, data: data(5) } });
  });
  it('replays an acknowledged-by-server write whose response was lost, only once', async () => {
    const s = setup(); const write = s.remote.write;
    s.remote.write = async (slot, request) => { await write(slot, request); throw Error('response lost'); };
    expect((await s.repository.save(data())).pendingCount).toBe(1);
    s.remote.write = write;
    expect(await s.repository.sync()).toMatchObject({ pendingCount: 0, confirmed: { revision: 1 } });
    expect((await s.service.read(owner, 'auto')).body).toMatchObject({ save: { revision: 1 } });
  });
  it('times out without accepting a late response and retries the same key safely', async () => {
    vi.useFakeTimers();
    const s = setup(); const write = s.remote.write;
    let finish!: (response: HttpResponse) => void; let response!: HttpResponse;
    s.remote.write = async (slot, request) => {
      response = await write(slot, request);
      return await new Promise(resolve => { finish = resolve; });
    };
    const repo = new SaveRepository(s.journal(), s.remote, s.id, 50);
    const pending = repo.save(data());
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toMatchObject({ data: data(), pendingCount: 1, problem: 'TIMEOUT' });
    finish(response); await Promise.resolve();
    expect(repo.snapshot().pendingCount).toBe(1);
    s.remote.write = write;
    expect(await repo.sync()).toMatchObject({ pendingCount: 0, confirmed: { revision: 1 } });
  });
  it('keeps ordered complete unsent snapshots, including progress after an uncertain save', async () => {
    const s = setup(); const write = s.remote.write;
    s.remote.write = async () => { throw Error('offline'); };
    await s.repository.save(data(1)); await s.repository.save(data(2)); await s.repository.save(data(3));
    const pending: WriteSaveRequest[] = JSON.parse(s.values.get(s.journal().key)!).pending;
    expect(pending.map(p => p.expectedRevision)).toEqual([0, 1]);
    expect(pending.map(p => p.data.x)).toEqual([1, 3]);
    expect((await s.repository.load()).data).toEqual(data(3));
    const delivered: WriteSaveRequest[] = [];
    s.remote.write = async (slot, request) => { delivered.push(copy(request)); return write(slot, request); };
    expect(await s.repository.sync()).toMatchObject({ pendingCount: 0, data: data(3), confirmed: { revision: 2 } });
    expect(delivered).toEqual(pending);
  });
  it('serializes overlapping saves and reads so a slow response cannot replace newer progress', async () => {
    const s = setup();
    const results = await Promise.all([s.repository.save(data(1)), s.repository.save(data(2)), s.repository.load()]);
    expect(results[2]).toMatchObject({ data: data(2), confirmed: { revision: 2 }, pendingCount: 0 });
  });
  it.each(['missing', 'getter', 'read', 'quota'] as const)('stays usable with %s local storage and reports volatile data', async failure => {
    const s = setup(); const write = s.remote.write; s.remote.write = async () => { throw Error('offline'); };
    const storage: KeyValueStorage = {
      getItem: () => { if (failure === 'read') throw Error('denied'); return null; },
      setItem: () => { throw Error('quota'); },
    };
    const local = new LocalSaveJournal(owner.sub, 'auto', () => {
      if (failure === 'getter') throw Error('SecurityError');
      return failure === 'missing' ? undefined : storage;
    });
    const repo = new SaveRepository(local, s.remote, s.id);
    expect(await repo.save(data())).toMatchObject({ data: data(), pendingCount: 1, durable: false });
    s.remote.write = write;
    expect(await repo.sync()).toMatchObject({ data: data(), pendingCount: 0, durable: false, problem: 'LOCAL_UNAVAILABLE' });
  });
  it.each(['{broken', '{"v":2,"future":"untouched"}',
    '{"v":1,"ownerSub":"bob","slotId":"auto","pending":[]}'])('protects corrupt/future/foreign raw local bytes: %s', async raw => {
    const s = setup(); s.values.set(s.journal().key, raw);
    const write = vi.spyOn(s.remote, 'write'); const read = vi.spyOn(s.remote, 'read');
    const repo = new SaveRepository(s.journal(), s.remote, s.id);
    const result = await repo.save(data());
    expect(result).toMatchObject({ data: data(), pendingCount: 1, durable: false });
    expect(['CORRUPT_LOCAL', 'FUTURE_LOCAL']).toContain(result.problem);
    await repo.load(); await repo.sync();
    expect(s.values.get(s.journal().key)).toBe(raw); expect(write).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it('never writes over unread original bytes after an initial storage read failure', async () => {
    const s = setup(); const setItem = vi.fn();
    const local = new LocalSaveJournal(owner.sub, 'auto', () => ({
      getItem: () => { throw Error('permission temporarily denied'); }, setItem,
    }));
    const repo = new SaveRepository(local, s.remote, s.id);
    expect(await repo.save(data())).toMatchObject({ data: data(), durable: false, problem: 'LOCAL_UNAVAILABLE' });
    expect(setItem).not.toHaveBeenCalled();
  });
  it('rejects a future payload inside the journal without overwriting it', async () => {
    const s = setup(); await s.repository.save(data());
    const key = s.journal().key; const stored = JSON.parse(s.values.get(key)!); stored.confirmed.data.v = 2;
    const raw = JSON.stringify(stored); s.values.set(key, raw);
    const repo = new SaveRepository(s.journal(), s.remote, s.id);
    expect((await repo.save(data(3))).problem).toBe('FUTURE_LOCAL'); expect(s.values.get(key)).toBe(raw);
  });
  it('separates local journals by owner and slot', async () => {
    const s = setup(); await s.repository.save(data());
    const otherOwner = new LocalSaveJournal('bob', 'auto', () => s.storage);
    const otherSlot = new LocalSaveJournal(owner.sub, 'manual-1', () => s.storage);
    expect(otherOwner.read().journal.confirmed).toBeUndefined(); expect(otherSlot.read().journal.confirmed).toBeUndefined();
    expect(otherOwner.key).not.toBe(s.journal().key); expect(otherSlot.key).not.toBe(s.journal().key);
  });
  it('does not replace good data with malformed, wrong-slot, stale or mismatched remote data', async () => {
    const s = setup(); await s.repository.save(data());
    const good = s.repository.snapshot().confirmed!;
    for (const bad of [null, { ...good, slotId: 'another' }, { ...good, revision: 0 }, { ...good, data: data(9) }]) {
      s.remote.read = async () => ({ status: 200, body: { save: bad } });
      expect(await s.repository.load()).toMatchObject({ data: data(), problem: 'INVALID_RESPONSE' });
    }
    s.remote.write = async () => ({ status: 200, body: { save: { ...good, revision: 2, data: data(9) } } });
    expect(await s.repository.save(data(2))).toMatchObject({ data: data(2), pendingCount: 1, problem: 'INVALID_RESPONSE' });
  });
  it('keeps previous progress on invalid input and retains latest progress through prolonged offline saving', async () => {
    const s = setup(); s.remote.write = async () => errorResponse('UNAVAILABLE');
    await s.repository.save(data());
    expect(await s.repository.save({ v: 2 })).toMatchObject({ data: data(), pendingCount: 1, problem: 'UNSUPPORTED_VERSION' });
    for (let n = 2; n <= 50; n++) await s.repository.save(data(n));
    expect(s.repository.snapshot()).toMatchObject({ data: data(50), pendingCount: MAX_PENDING, problem: 'UNAVAILABLE' });
  });
  it('rejects a corrupted pending-revision chain and never sends it', () => {
    const s = setup(); const key = s.journal().key;
    s.values.set(key, JSON.stringify({ v: 1, ownerSub: owner.sub, slotId: 'auto', pending: [
      { schemaVersion: 1, expectedRevision: 4, idempotencyKey: 'bad-00001', data: data() },
    ] }));
    expect(s.journal().read().problem).toBe('CORRUPT_LOCAL');
  });
  it('keeps confirmed local data on a failed remote read', async () => {
    const s = setup(); await s.repository.save(data());
    s.remote.read = async () => { throw Error('offline'); };
    expect(await s.repository.load()).toMatchObject({ data: data(), problem: 'NETWORK' });
    s.remote.read = async () => ({ status: 200, body: { save: { schemaVersion: 2 } as unknown as SaveEnvelope } });
    expect(await s.repository.load()).toMatchObject({ data: data(), problem: 'UNSUPPORTED_VERSION' });
  });
});
