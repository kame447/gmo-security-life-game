import { describe, expect, it } from 'vitest';
import { authorize, copy, MemorySaveStorage, readSave, SaveService, writeSave,
  type HttpResponse, type SaveEnvelope, type SaveKey, type SaveStorage, type StoredSave } from '../src/save-api';

const alice = { sub: 'alice-sub' }; const bob = { sub: 'bob-sub' };
const now = '2026-11-13T20:30:00.000Z';
const request = (revision = 0, id = 'device-0001', n = 1) => ({ schemaVersion: 1, expectedRevision: revision,
  idempotencyKey: id, data: { v: 1, n, phone: { v: 1, owned: false }, assets: { moneyYen: 100, items: [] } } });
const saved = (response: HttpResponse) => (response.body as { save: SaveEnvelope }).save;

describe('save-api server authorization and atomicity', () => {
  it('derives both read/write keys only from the verified sub', async () => {
    const service = new SaveService(new MemorySaveStorage(), () => now);
    expect((await service.write(alice, 'auto', { ...request(), userId: bob.sub, ownerSub: bob.sub })).status).toBe(200);
    expect(saved(await service.read(alice, 'auto')).data.n).toBe(1);
    expect((await service.read(bob, 'auto')).status).toBe(404);
    await service.write(bob, 'auto', request(0, 'bob-00001', 2));
    expect(saved(await service.read(alice, 'auto')).data.n).toBe(1);
    expect(saved(await service.read(bob, 'auto')).data.n).toBe(2);
    expect(authorize(alice, 'auto')).toEqual({ pk: 'USER#alice-sub', sk: 'SAVE#auto' });
    expect((await service.read(alice, '../bob-sub')).status).toBe(400);
  });
  it.each([null, { sub: '' }, { sub: 'x'.repeat(129) }])('rejects unauthenticated access: %j', async principal => {
    const storage = new MemorySaveStorage(); const service = new SaveService(storage, () => now);
    expect((await service.read(principal, 'auto')).status).toBe(401);
    expect((await service.write(principal, 'auto', request())).status).toBe(401);
  });
  it('returns 403 without storage access for a denied verified principal', async () => {
    const storage: SaveStorage = { read: () => { throw Error('must not read'); }, compareAndSwap: () => { throw Error('must not write'); } };
    const service = new SaveService(storage, () => now);
    expect((await service.write({ ...alice, canSave: false }, 'auto', request())).status).toBe(403);
    expect((await service.read({ ...alice, canSave: false }, 'auto')).status).toBe(403);
  });
  it('keeps the pure transition deterministic and protects an accidentally misrouted row', () => {
    const decision = writeSave(alice, 'auto', request(), undefined, now);
    const row = copy(decision.next!);
    expect(writeSave(alice, 'auto', request(), undefined, now)).toEqual(decision);
    expect(writeSave(bob, 'auto', request(1), row, now).response.status).toBe(403);
    expect(readSave(bob, 'auto', row).status).toBe(403);
    expect(row).toEqual(decision.next);
  });
  it('uses server time and detaches storage snapshots', async () => {
    const service = new SaveService(new MemorySaveStorage(), () => now);
    const first = saved(await service.write(alice, 'auto', { ...request(), updatedAt: 'fake', revision: 99 }));
    expect(first).toMatchObject({ revision: 1, updatedAt: now }); first.data.n = 99;
    expect(saved(await service.read(alice, 'auto')).data.n).toBe(1);
  });
  it('replays an exact idempotent retry without increment, rejects a changed request', async () => {
    const service = new SaveService(new MemorySaveStorage(), () => now);
    const first = await service.write(alice, 'auto', request());
    expect(await service.write(alice, 'auto', request())).toEqual(first);
    const changed = await service.write(alice, 'auto', request(0, 'device-0001', 2));
    expect(changed).toMatchObject({ status: 409, body: { error: { code: 'IDEMPOTENCY_CONFLICT' } } });
    expect(saved(await service.read(alice, 'auto')).revision).toBe(1);
  });
  it('returns current revision/snapshot for an old device, without overwriting it', async () => {
    const service = new SaveService(new MemorySaveStorage(), () => now);
    await service.write(alice, 'auto', request());
    await service.write(alice, 'auto', request(1, 'device-0002', 2));
    expect(await service.write(alice, 'auto', request(0, 'old-device', 9))).toMatchObject({ status: 409,
      body: { error: { code: 'REVISION_CONFLICT', current: { revision: 2, data: { n: 2 } } } } });
    // A retry older than the retained receipt still cannot overwrite a later save.
    expect((await service.write(alice, 'auto', request())).status).toBe(409);
    expect(saved(await service.read(alice, 'auto')).data.n).toBe(2);
  });
  it('allows only one of two concurrent writes at the same revision', async () => {
    const service = new SaveService(new MemorySaveStorage(), () => now);
    const responses = await Promise.all([service.write(alice, 'auto', request()), service.write(alice, 'auto', request(0, 'device-0002', 2))]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(saved(await service.read(alice, 'auto')).revision).toBe(1);
  });
  it('handles two simultaneous identical retries as one write', async () => {
    const service = new SaveService(new MemorySaveStorage(), () => now);
    const responses = await Promise.all([service.write(alice, 'auto', request()), service.write(alice, 'auto', request())]);
    expect(responses[0]).toEqual(responses[1]); expect(responses[0].status).toBe(200);
  });
  it('does not mutate a corrupt or future stored version', async () => {
    for (const patch of [{ schemaVersion: 2 }, { data: { v: 2 } }, { updatedAt: 'broken' }]) {
      const row = writeSave(alice, 'auto', request(), undefined, now).next!;
      const damaged = { ...row, save: { ...row.save, ...patch } } as StoredSave;
      const before = JSON.stringify(damaged);
      const result = writeSave(alice, 'auto', request(1, 'device-0002'), damaged, now);
      expect(result.next).toBeUndefined(); expect([422, 500]).toContain(result.response.status);
      expect(JSON.stringify(damaged)).toBe(before);
    }
  });
  it('maps validation, versions, size and storage outages to HTTP errors', async () => {
    const service = new SaveService(new MemorySaveStorage(), () => now);
    expect((await service.write(alice, 'auto', {})).status).toBe(400);
    expect((await service.write(alice, 'auto', { ...request(), data: { v: 2 } })).status).toBe(422);
    expect((await service.write(alice, 'auto', { ...request(), data: { v: 1, text: 'x'.repeat(140000) } })).status).toBe(413);
    const broken: SaveStorage = { read: async () => { throw Error('offline'); }, compareAndSwap: async () => false };
    expect((await new SaveService(broken, () => now).read(alice, 'auto')).status).toBe(503);
    expect((await new SaveService(broken, () => now).write(alice, 'auto', request())).status).toBe(503);
  });
  it('uses conditional revision equality in the storage port', async () => {
    const storage = new MemorySaveStorage(); const key = authorize(alice, 'auto') as SaveKey;
    const row = writeSave(alice, 'auto', request(), undefined, now).next!;
    expect(await storage.compareAndSwap(key, 0, row)).toBe(true);
    expect(await storage.compareAndSwap(key, 0, { ...row, save: { ...row.save, revision: 2 } })).toBe(false);
    expect(await storage.read(key)).toEqual(row);
  });
});
