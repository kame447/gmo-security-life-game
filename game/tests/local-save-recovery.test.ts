import { describe, expect, it } from 'vitest';
import { LocalSaveStore, SAVE_KEY, readableSaveVersion, type SaveStorage } from '../src/app/local-save';
import { activeSaveKey } from '../src/app/save-slot';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const world = buildWorld();
const seed = (moneyYen: number) => ({ ...new Game(world).serialize(), assets: { moneyYen, items: [] } });
class MemoryStorage implements SaveStorage {
  values = new Map<string, string>();
  failKey = '';
  onSet?: (key: string) => void;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error('quota');
    this.values.set(key, value); this.onSet?.(key);
  }
  removeItem(key: string) { this.values.delete(key); }
}
function setup() {
  const storage = new MemoryStorage(); let now = 1000;
  return { storage, store: new LocalSaveStore(SAVE_KEY, () => storage, () => now++) };
}

describe('local saves and bounded recovery', () => {
  it('retains three past generations independently from the current save', () => {
    const { store, storage } = setup();
    for (let amount = 0; amount <= 6; amount++) expect(store.save(seed(amount), true).ok).toBe(true);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).assets.moneyYen).toBe(6);
    expect(store.history().map(p => JSON.parse(p.raw).assets.moneyYen)).toEqual([5, 4, 3]);
    for (let amount = 7; amount < 30; amount++) store.save(seed(amount));
    expect(store.history().map(p => JSON.parse(p.raw).assets.moneyYen)).toEqual([5, 4, 3]);
  });

  it('backs up the exact previous value on the first changed autosave after resume', () => {
    const { store, storage } = setup();
    const original = JSON.stringify({ ...seed(100), futureExtension: { label: '残す' } });
    storage.setItem(SAVE_KEY, original);
    expect(store.inspect(world).kind).toBe('valid');
    expect(store.save(seed(200))).toMatchObject({ ok: true });
    expect(store.history()[0].raw).toBe(original);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).futureExtension).toEqual({ label: '残す' });
  });

  it('deduplicates identical content with different save timestamps', () => {
    const { store, storage } = setup();
    store.save(seed(1)); store.save(seed(2), true); store.save(seed(1), true); store.save(seed(3), true);
    expect(store.history()).toHaveLength(2);
    expect(store.history().map(p => JSON.parse(p.raw).assets.moneyYen)).toEqual([1, 2]);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).assets.moneyYen).toBe(3);
  });

  it('keeps the original if a backup fails, including before starting a new game', () => {
    const { store, storage } = setup();
    store.save(seed(20)); const original = storage.getItem(SAVE_KEY)!;
    storage.failKey = store.recoveryKey;
    expect(store.save(seed(30), true)).toEqual({ ok: false, reason: 'backup' });
    expect(store.clearForNew(original)).toEqual({ ok: false, reason: 'backup' });
    expect(storage.getItem(SAVE_KEY)).toBe(original);
  });

  it('keeps the current value and a recovery copy when the primary write fails', () => {
    const { store, storage } = setup();
    store.save(seed(20)); const original = storage.getItem(SAVE_KEY)!;
    storage.failKey = SAVE_KEY;
    expect(store.save(seed(30), true)).toEqual({ ok: false, reason: 'storage' });
    expect(storage.getItem(SAVE_KEY)).toBe(original);
    expect(store.history()[0].raw).toBe(original);
  });

  it('does not replace another tab’s save, even when it changes during archiving', () => {
    const { store, storage } = setup();
    store.save(seed(20)); const other = JSON.stringify(seed(99));
    storage.onSet = key => { if (key === store.recoveryKey) storage.values.set(SAVE_KEY, other); };
    expect(store.save(seed(30), true)).toEqual({ ok: false, reason: 'changed' });
    expect(storage.getItem(SAVE_KEY)).toBe(other);
    expect(store.clearForNew(other)).toEqual({ ok: false, reason: 'changed' });
  });

  it.each([
    { v: 2 }, { phone: { v: 2 } }, { story: { v: 99 } }, { story: { v: '2' } },
  ])('blocks unknown versions without changing the stored bytes: %s', patch => {
    const { store, storage } = setup();
    const raw = JSON.stringify({ ...seed(20), ...patch }); storage.setItem(SAVE_KEY, raw);
    expect(store.inspect(world).kind).toBe('blocked');
    expect(store.save(seed(30))).toEqual({ ok: false, reason: 'unsupported' });
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
  });

  it('restores an older record and rejects stale autosaves until the game reloads', () => {
    const { store, storage } = setup();
    store.save(seed(1)); store.save(seed(2), true); store.save(seed(3), true);
    const point = store.history().find(p => JSON.parse(p.raw).assets.moneyYen === 1)!;
    expect(store.restore(point.id, world).ok).toBe(true);
    expect(storage.getItem(SAVE_KEY)).toBe(point.raw);
    expect(store.save(seed(3))).toEqual({ ok: false, reason: 'reload' });
    expect(store.history().some(p => JSON.parse(p.raw).assets.moneyYen === 3)).toBe(true);
    expect(new LocalSaveStore(SAVE_KEY, () => storage).inspect(world)).toMatchObject({ kind: 'valid', data: { assets: { moneyYen: 1 } } });
  });

  it('does not clear the current record when recovery history is damaged', () => {
    const { store, storage } = setup();
    store.save(seed(20)); const raw = storage.getItem(SAVE_KEY)!;
    storage.setItem(store.recoveryKey, '{broken');
    expect(store.clearForNew(raw)).toEqual({ ok: false, reason: 'backup' });
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    expect(storage.getItem(store.recoveryKey)).toBe('{broken');
  });

  it('isolates review scenes and rejects arbitrary key names', () => {
    expect(activeSaveKey('?localReview=school')).toBe(`${SAVE_KEY}.review.school`);
    expect(activeSaveKey('?localReview=../ordinary')).toBe(SAVE_KEY);
    expect(activeSaveKey('')).toBe(SAVE_KEY);
    expect(readableSaveVersion(seed(1))).toBe(true);
  });
});
