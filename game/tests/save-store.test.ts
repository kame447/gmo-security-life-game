import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSaveStore, loadSave, saveStatus, writeSave } from '../src/app/save-store';
import { INVENTORY_PROTOTYPE } from '../src/data/inventory-config';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const world = buildWorld();
const KEY = 'slg-map-save-v1';
const BACKUP = `${KEY}.protected`;
const fresh = () => new Game(world).serialize();
afterEach(() => vi.unstubAllGlobals());

function setup(initial?: unknown, maxBytes?: number) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(KEY, typeof initial === 'string' ? initial : JSON.stringify(initial));
  const state = { readError: undefined as Error | undefined, writeError: undefined as Error | undefined,
    failKey: undefined as string | undefined };
  const storage = {
    getItem: vi.fn((key: string) => { if (state.readError) throw state.readError; return values.get(key) ?? null; }),
    setItem: vi.fn((key: string, value: string) => {
      if (state.writeError && (!state.failKey || key === state.failKey)) throw state.writeError;
      values.set(key, value);
    }),
  };
  return { values, state, storage, store: createSaveStore({ storage: () => storage, maxBytes }) };
}

describe('save failure reporting and retry', () => {
  it('keeps the existing public functions and boolean result from the earlier candidate', () => {
    const s = setup(); vi.stubGlobal('localStorage', s.storage);
    expect(writeSave(fresh())).toBe(true);
    expect(saveStatus()).toMatchObject({ failed: false, pending: false, reason: null });
    expect(loadSave(world)).toEqual(fresh());
  });

  it('captures a failed purchase snapshot, keeps the last good save and retries without mutating the live game', () => {
    const s = setup(); const game = new Game(world);
    expect(s.store.writeSave(game.serialize())).toBe(true);
    const good = s.values.get(KEY);
    game.assets.apply({ moneyDeltaYen: -300, itemDeltas: [{ itemId: 'notebook', quantityDelta: 1 }] });
    s.state.writeError = new DOMException('private details', 'QuotaExceededError');
    const pending = game.serialize();
    expect(s.store.writeSave(pending)).toBe(false);
    expect(s.store.saveStatus()).toMatchObject({ failed: true, reason: 'quota-exceeded', pending: true, retryable: true });
    expect(s.values.get(KEY)).toBe(good);
    // Evidence: reloading before a successful retry still restores the previous purchase state.
    expect(new Game(world, { save: s.store.loadSave(world) }).assets.moneyYen).toBe(1000);
    expect(game.assets.moneyYen).toBe(700);
    expect(game.assets.quantity('notebook')).toBe(1);
    pending.assets!.moneyYen = 1;
    s.state.writeError = undefined;
    expect(s.store.retrySave()).toBe(true);
    expect(s.store.saveStatus()).toMatchObject({ failed: false, reason: null, pending: false });
    expect(s.store.loadSave(world)?.assets).toEqual(game.assets.snapshot());
  });

  it('queues only the latest valid attempt and never replays an older snapshot after a successful write', () => {
    const s = setup(); const game = new Game(world);
    s.state.writeError = new DOMException('quota', 'QuotaExceededError');
    expect(s.store.writeSave(game.serialize())).toBe(false);
    game.assets.changeMoney(-100);
    expect(s.store.writeSave(game.serialize())).toBe(false);
    s.state.writeError = undefined;
    expect(s.store.retrySave()).toBe(true);
    expect(s.store.loadSave(world)?.assets?.moneyYen).toBe(900);
    game.assets.changeMoney(-100);
    expect(s.store.writeSave(game.serialize())).toBe(true);
    const calls = s.storage.setItem.mock.calls.length;
    expect(s.store.retrySave()).toBe(true);
    expect(s.storage.setItem).toHaveBeenCalledTimes(calls);
    expect(s.store.loadSave(world)?.assets?.moneyYen).toBe(800);
  });

  it.each(['SecurityError', 'ReferenceError', 'Error'])('keeps exploration available when storage throws %s', name => {
    const s = setup();
    s.state.readError = Object.assign(new Error('sensitive message'), { name });
    s.state.writeError = s.state.readError;
    expect(s.store.loadSave(world)).toBeUndefined();
    expect(s.store.writeSave(fresh())).toBe(false);
    expect(s.store.saveStatus().reason).toBe(name === 'Error' ? 'storage-error' : 'storage-unavailable');
    expect(JSON.stringify(s.store.saveStatus())).not.toContain('sensitive');
    expect(() => new Game(world).update(0.1, { dir: 'right', run: false })).not.toThrow();
  });

  it('handles a throwing localStorage getter and returns detached status objects', () => {
    const store = createSaveStore({ storage: () => { throw new DOMException('disabled', 'SecurityError'); } });
    expect(store.writeSave(fresh())).toBe(false);
    const status = store.saveStatus();
    expect(status.reason).toBe('storage-unavailable');
    Object.assign(status, { reason: null, failed: false });
    expect(store.saveStatus().failed).toBe(true);
  });
});

describe('old save protection', () => {
  it.each(['{broken', '[]', 'null', JSON.stringify({ ...fresh(), v: 2 }),
    JSON.stringify({ ...fresh(), variantId: 'future-world' }), JSON.stringify({ ...fresh(), phone: { v: 2 } })])
  ('backs up an unreadable or unsupported value before continuing normal saves: %s', raw => {
    const s = setup(raw);
    expect(s.store.loadSave(world)).toBeUndefined();
    expect(s.store.writeSave(fresh())).toBe(true);
    expect(s.values.get(BACKUP)).toBe(raw);
    expect(JSON.parse(s.values.get(KEY)!)).toEqual(fresh());
    expect(s.storage.setItem.mock.calls.map(([key]) => key)).toEqual([BACKUP, KEY]);
    expect(s.store.retrySave()).toBe(true);
    expect(s.store.saveStatus()).toMatchObject({ failed: false, backedUp: true, pending: false });
  });

  it('keeps normal last-writer behavior and merges the latest disk extensions on retry', () => {
    const s = setup({ ...fresh(), life: { v: 7, history: ['old-event'] } }); s.store.loadSave(world);
    const current = { ...fresh(), assets: { moneyYen: 900, items: [] } };
    s.state.writeError = new DOMException('quota', 'QuotaExceededError');
    expect(s.store.writeSave(current)).toBe(false);
    const life = { v: 7, history: ['newer-event'] };
    const other = JSON.stringify({ ...fresh(), assets: { moneyYen: 42, items: [] }, life });
    s.values.set(KEY, other); s.state.writeError = undefined;
    expect(s.store.retrySave()).toBe(true);
    expect(s.store.saveStatus()).toMatchObject({ failed: false, changed: true, pending: false });
    expect(JSON.parse(s.values.get(KEY)!)).toEqual({ ...current, life });
    expect(s.values.has(BACKUP)).toBe(false);
  });

  it('retains life, layout and future fields through the unchanged Game.serialize path', () => {
    const saved = { ...fresh(), life: { v: 7, history: ['event-1'] },
      assets: { moneyYen: 900, items: [], layout: { v: 1,
        bag: Array<null>(INVENTORY_PROTOTYPE.columns * INVENTORY_PROTOTYPE.bagRows).fill(null),
        hotbar: Array<null>(INVENTORY_PROTOTYPE.hotbarSlots).fill(null), selectedHotbar: 0 } },
      future: { value: [1, false, null] } };
    const s = setup(saved);
    const game = new Game(world, { save: s.store.loadSave(world) });
    game.assets.changeMoney(-100);
    expect(s.store.writeSave(game.serialize())).toBe(true);
    expect(JSON.parse(s.values.get(KEY)!)).toEqual({ ...saved, assets: { ...saved.assets, moneyYen: 800 } });
  });

  it('backs up an existing save if startup could not read it, then saves the new progress', () => {
    const saved = { ...fresh(), assets: { moneyYen: 42, items: [] } };
    const s = setup(saved); s.state.readError = new DOMException('disabled', 'SecurityError');
    expect(s.store.loadSave(world)).toBeUndefined();
    expect(s.store.writeSave(fresh())).toBe(false);
    s.state.readError = undefined;
    expect(s.store.retrySave()).toBe(true);
    expect(s.values.get(BACKUP)).toBe(JSON.stringify(saved));
    expect(JSON.parse(s.values.get(KEY)!)).toEqual(fresh());
    expect(s.store.saveStatus()).toMatchObject({ failed: false, backedUp: true });
  });

  it('keeps both saved values when a different backup already occupies the single backup key', () => {
    const raw = '{broken'; const s = setup(raw); s.values.set(BACKUP, 'older protected value');
    expect(s.store.writeSave(fresh())).toBe(false);
    expect(s.store.saveStatus()).toMatchObject({ reason: 'protected-save', pending: true });
    expect(s.values.get(KEY)).toBe(raw);
    expect(s.values.get(BACKUP)).toBe('older protected value');
    expect(s.storage.setItem).not.toHaveBeenCalled();
  });

  it('uses an identical backup without rewriting it and continues after a reload', () => {
    const raw = JSON.stringify({ ...fresh(), v: 2 }); const s = setup(raw); s.values.set(BACKUP, raw);
    expect(s.store.writeSave(fresh())).toBe(true);
    expect(s.storage.setItem.mock.calls.map(([key]) => key)).toEqual([KEY]);
    const nextSession = createSaveStore({ storage: () => s.storage });
    const game = new Game(world, { save: nextSession.loadSave(world) }); game.assets.changeMoney(-100);
    expect(nextSession.writeSave(game.serialize())).toBe(true);
    expect(JSON.parse(s.values.get(KEY)!).assets.moneyYen).toBe(900);
    expect(s.values.get(BACKUP)).toBe(raw);
  });

  it('keeps the original primary value when backup writing fails and recovers on retry', () => {
    const raw = '{broken'; const s = setup(raw);
    s.state.writeError = new DOMException('quota', 'QuotaExceededError'); s.state.failKey = BACKUP;
    expect(s.store.writeSave(fresh())).toBe(false);
    expect(s.store.saveStatus()).toMatchObject({ reason: 'protected-save', pending: true, backedUp: false });
    expect(s.values.get(KEY)).toBe(raw); expect(s.values.has(BACKUP)).toBe(false);
    s.state.writeError = undefined;
    expect(s.store.retrySave()).toBe(true);
    expect(s.values.get(BACKUP)).toBe(raw); expect(JSON.parse(s.values.get(KEY)!)).toEqual(fresh());
  });

  it('retains the backup and original if primary writing fails after backup succeeded', () => {
    const raw = JSON.stringify({ ...fresh(), v: 2 }); const s = setup(raw);
    s.state.writeError = new DOMException('quota', 'QuotaExceededError'); s.state.failKey = KEY;
    expect(s.store.writeSave(fresh())).toBe(false);
    expect(s.store.saveStatus()).toMatchObject({ reason: 'quota-exceeded', pending: true, backedUp: true });
    expect(s.values.get(KEY)).toBe(raw); expect(s.values.get(BACKUP)).toBe(raw);
    s.state.writeError = undefined;
    expect(s.store.retrySave()).toBe(true);
    expect(s.values.get(BACKUP)).toBe(raw); expect(JSON.parse(s.values.get(KEY)!)).toEqual(fresh());
  });

  it('backs up a future value written by another tab before flushing a pending snapshot', () => {
    const s = setup(fresh()); s.store.loadSave(world);
    s.state.writeError = new DOMException('quota', 'QuotaExceededError');
    expect(s.store.writeSave(fresh())).toBe(false);
    const raw = JSON.stringify({ ...fresh(), phone: { v: 2 } });
    s.values.set(KEY, raw); s.state.writeError = undefined;
    expect(s.store.retrySave()).toBe(true);
    expect(s.store.saveStatus()).toMatchObject({ failed: false, changed: true, backedUp: true });
    expect(s.values.get(BACKUP)).toBe(raw); expect(JSON.parse(s.values.get(KEY)!)).toEqual(fresh());
  });

  it('rejects invalid or oversized new extensions without modifying the last save', () => {
    const initial = fresh(); const s = setup(initial, new TextEncoder().encode(JSON.stringify(initial)).length + 20);
    const good = s.values.get(KEY);
    expect(s.store.writeSave({ ...initial, future: 'あ'.repeat(30) })).toBe(false);
    expect(s.store.saveStatus().reason).toBe('too-large');
    expect(s.store.writeSave({ ...initial, future: new Map([['x', 1]]) })).toBe(false);
    expect(s.store.saveStatus().reason).toBe('invalid-data');
    expect(s.values.get(KEY)).toBe(good);
    expect(s.storage.setItem).not.toHaveBeenCalled();
  });
});
