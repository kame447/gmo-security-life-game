import { describe, expect, it } from 'vitest';
import { LocalCloudReviewGateway, REVIEW_CLOUD_PREFIX, copyReviewSave, type ReviewCloudStorage } from '../src/app/local-cloud-review';
import type { SaveData } from '../src/state/save';

const save = (money = 12345): SaveData => ({ v: 1, variantId: 'childhood', areaId: 'town-main',
  x: 100, y: 200, facing: 'down', assets: { moneyYen: money, items: [] },
  story: { phase: 'stage', choices: ['choice-1'] } });
function setup() {
  const rows = new Map<string, string>([['slg-map-save-v1', 'normal local save']]);
  const storage: ReviewCloudStorage = {
    getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => { rows.set(key, value); },
  };
  let id = 0;
  const options = { storage: () => storage, locks: null, now: () => '2026-11-28T00:00:00.000Z', newId: () => `review-request-${++id}` };
  const make = () => new LocalCloudReviewGateway(options);
  return { rows, storage, options, make };
}
const key = (account = 'account-a') => `${REVIEW_CLOUD_PREFIX}${account}:main`;

function queuedLocks() {
  const jobs: { run(): void; finish(): void }[] = [];
  const locks = { request: (_name: string, callback: () => unknown) => new Promise(resolve => {
    let result: unknown;
    jobs.push({ run: () => { result = callback(); }, finish: () => resolve(result) });
  }) } as unknown as Pick<LockManager, 'request'>;
  const next = () => { const job = jobs.shift(); if (!job) throw new Error('No lock job'); return job; };
  const flush = () => { const job = next(); job.run(); job.finish(); };
  return { locks, next, flush };
}

describe('local-only cloud review gateway', () => {
  it('requires a review login and never reads or overwrites the normal game save', async () => {
    const s = setup(), gateway = s.make();
    expect((await gateway.save(save())).problem).toBe('UNAUTHENTICATED');
    expect(await gateway.loadCandidate()).toBeUndefined();
    expect(s.rows.size).toBe(1);
    await gateway.signIn('account-a');
    const result = await gateway.save(save());
    expect(result).toMatchObject({ account: 'account-a', confirmed: { revision: 1, data: save() } });
    expect(s.rows.get('slg-map-save-v1')).toBe('normal local save');
    gateway.signOut();
    expect(gateway.snapshot()).toEqual({});
    expect(s.rows.has(key())).toBe(true);
  });

  it('keeps two accounts separate across logout and new gateway instances', async () => {
    const s = setup(), gateway = s.make();
    await gateway.signIn('account-a'); await gateway.save(save(100)); gateway.signOut();
    await gateway.signIn('account-b');
    expect(await gateway.loadCandidate()).toBeUndefined();
    expect(gateway.snapshot().problem).toBe('NOT_FOUND');
    await gateway.save(save(200)); gateway.signOut();
    const next = s.make();
    await next.signIn('account-a'); expect((await next.loadCandidate())?.data).toEqual(save(100));
    await next.signIn('account-b'); expect((await next.loadCandidate())?.data).toEqual(save(200));
    expect(s.rows.get('slg-map-save-v1')).toBe('normal local save');
  });

  it('preserves unknown JSON fields and makes independent snapshots', async () => {
    const s = setup(), gateway = s.make(), data = Object.assign(save(), { futureExtension: { value: 'keep me', list: [1, 2] } });
    await gateway.signIn('account-a'); await gateway.save(data);
    const candidate = (await gateway.loadCandidate())!;
    expect(candidate.data).toEqual(data);
    candidate.data.x = 999;
    expect((await gateway.loadCandidate())?.data.x).toBe(100);
    const state = gateway.snapshot(); state.confirmed!.data.x = 888;
    expect(gateway.snapshot().confirmed!.data.x).toBe(100);
  });

  it('returns 409 for an old revision without replacing either game progress or the latest saved version', async () => {
    const s = setup(), first = s.make(), second = s.make(), myProgress = save(200);
    await first.signIn('account-a'); await second.signIn('account-a');
    await first.save(save(100)); const raw = s.rows.get(key());
    const conflict = await second.save(myProgress);
    expect(conflict).toMatchObject({ problem: 'REVISION_CONFLICT', conflict: { revision: 1, data: save(100) } });
    expect(conflict.confirmed).toBeUndefined();
    expect(s.rows.get(key())).toBe(raw);
    expect(myProgress).toEqual(save(200));
    expect((await second.save(myProgress)).problem).toBe('REVISION_CONFLICT');
    expect(s.rows.get(key())).toBe(raw);
  });

  it('does not rebase by previewing a candidate; only an accepted restore advances the expected revision', async () => {
    const s = setup(), gateway = s.make();
    await gateway.signIn('account-a'); await gateway.save(save(100));
    await gateway.simulateOtherDevice(save(200));
    expect(gateway.snapshot().confirmed?.revision).toBe(1);
    const candidate = (await gateway.loadCandidate())!;
    expect(candidate.envelope.revision).toBe(2);
    expect((await gateway.save(save(300))).problem).toBe('REVISION_CONFLICT');
    expect(gateway.snapshot().confirmed?.revision).toBe(1);
    expect(gateway.acceptRestored(candidate)).toBe(true);
    expect((await gateway.save(save(300))).confirmed?.revision).toBe(3);
  });

  it('rejects a candidate from a different account or a prior session of the same account', async () => {
    const s = setup(), gateway = s.make();
    await gateway.signIn('account-a'); await gateway.save(save());
    const candidate = (await gateway.loadCandidate())!;
    gateway.signOut(); await gateway.signIn('account-b');
    expect(gateway.isCurrent(candidate)).toBe(false);
    expect(gateway.acceptRestored(candidate)).toBe(false);
    await gateway.signIn('account-a');
    expect(gateway.acceptRestored(candidate)).toBe(false);
    expect(gateway.snapshot().account).toBe('account-a');
  });

  it('does not run a queued save after logout, even if another account logs in before its lock is granted', async () => {
    const s = setup(), queue = queuedLocks(), gateway = new LocalCloudReviewGateway({ ...s.options, locks: queue.locks });
    const loginA = gateway.signIn('account-a'); queue.flush(); await loginA;
    const delayed = gateway.save(save(100));
    gateway.signOut(); const loginB = gateway.signIn('account-b');
    queue.flush(); queue.flush();
    await Promise.all([delayed, loginB]);
    expect(gateway.snapshot()).toEqual({ account: 'account-b' });
    expect(s.rows.has(key('account-a'))).toBe(false);
    expect(s.rows.has(key('account-b'))).toBe(false);
  });

  it('discards a delayed read result after logout and account switch', async () => {
    const s = setup(), seed = s.make();
    await seed.signIn('account-a'); await seed.save(save(100));
    const queue = queuedLocks(), gateway = new LocalCloudReviewGateway({ ...s.options, locks: queue.locks });
    const loginA = gateway.signIn('account-a'); queue.flush(); await loginA;
    const delayed = gateway.loadCandidate(); const job = queue.next(); job.run();
    gateway.signOut(); const loginB = gateway.signIn('account-b'); queue.flush(); await loginB;
    job.finish();
    expect(await delayed).toBeUndefined();
    expect(gateway.snapshot()).toEqual({ account: 'account-b' });
  });

  it.each(['not-json', JSON.stringify({ ownerSub: 'account-a', save: { schemaVersion: 99 }, lastWrite: {} })])('preserves unreadable or future data', async raw => {
    const s = setup(), gateway = s.make(); s.rows.set(key(), raw);
    await gateway.signIn('account-a'); await gateway.save(save());
    expect(gateway.snapshot().problem).toBeDefined();
    expect(s.rows.get(key())).toBe(raw);
  });

  it('keeps the previous stored save when browser storage fails', async () => {
    const s = setup(), gateway = s.make();
    await gateway.signIn('account-a'); await gateway.save(save(100));
    const raw = s.rows.get(key());
    s.storage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect((await gateway.save(save(200))).problem).toBe('LOCAL_UNAVAILABLE');
    expect(s.rows.get(key())).toBe(raw);
    expect(gateway.snapshot().confirmed?.data).toEqual(save(100));
  });

  it('rejects future, lossy, malformed and oversized snapshots without writing', async () => {
    const s = setup(), gateway = s.make(); await gateway.signIn('account-a');
    expect(() => copyReviewSave({ ...save(), v: 2 })).toThrow();
    expect(() => copyReviewSave({ ...save(), x: undefined })).toThrow();
    expect(() => copyReviewSave({ ...save(), facing: ['up'] })).toThrow();
    const tooLarge = Object.assign(save(), { text: 'x'.repeat(330 * 1024) });
    expect((await gateway.save(tooLarge)).problem).toBe('TOO_LARGE');
    expect(s.rows.has(key())).toBe(false);
  });
});
