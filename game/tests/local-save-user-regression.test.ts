import { describe, expect, it, vi } from 'vitest';
import { createSaveStore } from '../src/app/save-store';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const KEY = 'slg-map-save-v1';
const world = buildWorld();
const clocks = { phoneClock: () => 0, phoneEpochClock: () => 0 };

/** Keep owned fields and extensions together when checking user-visible save/load flows. */
function checkpoint() {
  const baseline = new Game(world, clocks).serialize();
  return { ...baseline,
    appearance: { ...baseline.appearance!, hairColor: 'black' as const, futurePalette: { v: 7, colors: [1, 2] } },
    assets: { moneyYen: 2480, items: [{ itemId: 'notebook', quantity: 1 }, { itemId: 'pencil', quantity: 3 }],
      layout: { v: 1, bag: ['pencil', ...Array<null>(14).fill(null)], hotbar: [null, 'notebook', null, null, null], selectedHotbar: 1 },
      futureWallet: { enabled: false } },
    phone: { v: 1 as const, owned: true, futurePhone: { carrier: 'keep' },
      dataBudget: { v: 1 as const, remainingMb: 123.75, capacityMb: 5000, futurePolicy: { v: 7 } },
      chat: { v: 1 as const, contacts: [{ id: 'family', name: '家族', icon: 'person' }],
        threads: [{ id: 'family-chat', contactId: 'family', messages: [
          { id: 'saved-message', from: 'family', text: '保存済みの会話', atMs: 5, read: false }],
          pending: [], nextSequence: 1, replyCursor: 0 }], futureChat: [false, null] } },
    life: { v: 7, history: [{ eventId: 'future-event', choiceId: null }] },
    future: { keep: ['未知欄', null, false] } };
}

function fixture() {
  const original = checkpoint();
  const values = new Map<string, string>([[KEY, JSON.stringify(original)]]);
  const faults = { read: false, write: false };
  const storage = {
    getItem: vi.fn((key: string) => {
      if (faults.read) throw new DOMException('test denied', 'SecurityError');
      return values.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (faults.write) throw new DOMException('test quota', 'QuotaExceededError');
      values.set(key, value);
    }),
  };
  const store = () => createSaveStore({ storage: () => storage });
  return { original, values, faults, storage, store };
}

describe('local save regression floor for user-operated saves (independent tests)', () => {
  it('reads a checkpoint without writing or modifying any primary/backup value', () => {
    const f = fixture(); f.values.set(`${KEY}.protected`, 'an older protected copy');
    const before = [...f.values];
    const store = f.store();
    const selected = store.loadSave(world)!;
    const game = new Game(world, { ...clocks, save: selected });
    game.assets.changeMoney(-100);
    expect(store.loadSave(world)?.assets?.moneyYen).toBe(2480);
    expect([...f.values]).toEqual(before);
    expect(f.storage.setItem).not.toHaveBeenCalled();
    expect(store.saveStatus()).toMatchObject({ failed: false, pending: false });
  });

  it('carries full assets, phone, layout and extensions through a save and a separate reload session', () => {
    const f = fixture(); const first = f.store();
    const game = new Game(world, { ...clocks, save: first.loadSave(world) });
    game.assets.changeMoney(-300);
    game.phone.setOwned(false);
    expect(first.writeSave(game.serialize())).toBe(true);
    const next = f.store();
    const saved = next.loadSave(world)!;
    expect(saved).toMatchObject({ assets: { ...f.original.assets, moneyYen: 2180 },
      phone: { ...f.original.phone, owned: false }, appearance: f.original.appearance,
      life: f.original.life, future: f.original.future });
    const reloaded = new Game(world, { ...clocks, save: saved });
    expect(reloaded.assets.moneyYen).toBe(2180);
    expect(reloaded.assets.quantity('notebook')).toBe(1);
    expect(reloaded.phone.isOwned).toBe(false);
    expect(next.writeSave(reloaded.serialize())).toBe(true);
    expect(JSON.parse(f.values.get(KEY)!)).toEqual(saved);
  });

  it('keeps unknown members inside an otherwise supported v1 layout when loading and saving known state', () => {
    const f = fixture();
    const expected = { ...f.original, assets: { ...f.original.assets,
      layout: { ...f.original.assets.layout, futureLayout: { v: 7, mode: 'preserve-me' } } } };
    f.values.set(KEY, JSON.stringify(expected));
    const store = f.store();
    const loaded = store.loadSave(world);
    const game = new Game(world, { ...clocks, save: loaded });
    game.assets.changeMoney(-100);
    expect(store.writeSave(game.serialize())).toBe(true);
    const persisted = JSON.parse(f.values.get(KEY)!);
    console.info('LAYOUT_EXTENSION', JSON.stringify({
      readKept: Object.hasOwn(JSON.parse(JSON.stringify(loaded)).assets.layout, 'futureLayout'),
      writeKept: Object.hasOwn(persisted.assets.layout, 'futureLayout') }));
    expect(loaded).toEqual(expected);
    expect(persisted).toEqual({ ...expected, assets: { ...expected.assets, moneyYen: 2380 } });
  });

  it('keeps the last good checkpoint across a failed save and reload; only a successful retry commits the new state', () => {
    const f = fixture(); const first = f.store();
    const game = new Game(world, { ...clocks, save: first.loadSave(world) });
    const old = f.values.get(KEY);
    game.assets.apply({ moneyDeltaYen: -300, itemDeltas: [{ itemId: 'notebook', quantityDelta: 1 }] });
    game.phone.setOwned(false);
    f.faults.write = true;
    expect(first.writeSave(game.serialize())).toBe(false);
    expect(first.saveStatus()).toMatchObject({ reason: 'quota-exceeded', pending: true });
    const reloaded = f.store();
    expect(reloaded.loadSave(world)).toMatchObject({ assets: f.original.assets, phone: f.original.phone });
    expect(reloaded.saveStatus()).toMatchObject({ failed: false, pending: false });
    expect(f.values.get(KEY)).toBe(old);
    f.faults.write = false;
    expect(first.retrySave()).toBe(true);
    const committed = f.store().loadSave(world)!;
    expect(committed).toMatchObject({ assets: { moneyYen: 2180,
      items: [{ itemId: 'notebook', quantity: 2 }, { itemId: 'pencil', quantity: 3 }], layout: f.original.assets.layout },
      phone: { ...f.original.phone, owned: false }, life: f.original.life, future: f.original.future });
  });

  it('retains the newest disk extensions when an autosave snapshot supersedes a failed manual attempt', () => {
    const f = fixture(); const store = f.store();
    const game = new Game(world, { ...clocks, save: store.loadSave(world) });
    f.faults.write = true; game.assets.changeMoney(-100);
    expect(store.writeSave(game.serialize())).toBe(false);
    game.assets.changeMoney(-200);
    expect(store.writeSave(game.serialize())).toBe(false);
    const latestLife = { v: 9, history: ['another-tab'] };
    f.values.set(KEY, JSON.stringify({ ...f.original, life: latestLife,
      assets: { ...f.original.assets, futureWallet: { enabled: true } } }));
    f.faults.write = false;
    expect(store.retrySave()).toBe(true);
    expect(store.saveStatus()).toMatchObject({ changed: true, pending: false });
    expect(JSON.parse(f.values.get(KEY)!)).toMatchObject({ life: latestLife,
      assets: { moneyYen: 2180, futureWallet: { enabled: true }, layout: f.original.assets.layout },
      phone: f.original.phone });
  });

  it('protects a previously unreadable checkpoint before saving when storage access recovers', () => {
    const f = fixture(); const store = f.store(); const raw = f.values.get(KEY);
    f.faults.read = true;
    expect(store.loadSave(world)).toBeUndefined();
    expect(store.writeSave(new Game(world, clocks).serialize())).toBe(false);
    expect(store.saveStatus()).toMatchObject({ reason: 'storage-unavailable', pending: true });
    f.faults.read = false;
    expect(store.retrySave()).toBe(true);
    expect(f.values.get(`${KEY}.protected`)).toBe(raw);
    expect(store.saveStatus()).toMatchObject({ failed: false, backedUp: true, pending: false });
  });
});
