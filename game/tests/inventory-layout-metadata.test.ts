import { describe, expect, it } from 'vitest';
import { createSaveStore } from '../src/app/save-store';
import { Game } from '../src/session/game';
import { PlayerAssets } from '../src/state/assets';
import { moveInventoryStack, normalizeInventoryLayout } from '../src/state/inventory';
import { buildWorld } from '../src/world';

const items = [{ itemId: 'notebook', quantity: 1 }, { itemId: 'pencil', quantity: 3 }];
const futureLayout = { v: 7, mode: 'preserve-me', values: [false, null, { text: '未知欄' }] };
function layout() {
  return { v: 1 as const, bag: ['pencil', ...Array<null>(14).fill(null)],
    hotbar: [null, 'notebook', null, null, null], selectedHotbar: 1,
    futureLayout: structuredClone(futureLayout) };
}

describe('v1 inventory layout extensions in the combined save preview', () => {
  it('keeps detached JSON metadata while repairing owned fields and duplicate or unknown stacks', () => {
    const raw = { ...layout(), bag: ['notebook', 'pencil', 'pencil', 'missing'],
      hotbar: ['notebook', 'missing', null], selectedHotbar: -1 };
    const normalized = normalizeInventoryLayout(raw, items);
    expect(normalized).toMatchObject({ v: 1, futureLayout, selectedHotbar: 0 });
    expect(normalized.bag).toHaveLength(15);
    expect(normalized.hotbar).toEqual(['notebook', null, null, null, null]);
    expect([...normalized.bag, ...normalized.hotbar].filter(Boolean).sort()).toEqual(['notebook', 'pencil']);
    (normalized.futureLayout as typeof futureLayout).values.push(false);
    expect(raw.futureLayout).toEqual(futureLayout);
  });

  it('keeps metadata through moves, swaps, selection, successful purchases and failed operations', () => {
    const assets = new PlayerAssets({ moneyYen: 2480, items, layout: layout() });
    expect(assets.snapshot().layout).toMatchObject({ futureLayout });
    expect(assets.moveStack({ section: 'bag', index: 0 }, { section: 'hotbar', index: 1 })).toEqual({ ok: true });
    expect(assets.selectHotbar(1)).toBe(true);
    expect(assets.apply({ moneyDeltaYen: -100, itemDeltas: [{ itemId: 'pencil', quantityDelta: 1 }] })).toEqual({ ok: true });
    const saved = assets.snapshot();
    expect(saved).toMatchObject({ moneyYen: 2380, layout: { futureLayout,
      bag: ['notebook', ...Array<null>(14).fill(null)], hotbar: [null, 'pencil', null, null, null], selectedHotbar: 1 } });
    expect(assets.moveStack({ section: 'bag', index: 99 }, { section: 'hotbar', index: 1 })).toEqual({ ok: false, reason: 'invalid-slot' });
    expect(assets.changeMoney(-9999)).toEqual({ ok: false, reason: 'insufficient-funds' });
    expect(assets.snapshot()).toEqual(saved);
    (saved.layout!.futureLayout as typeof futureLayout).values.push(null);
    expect(assets.snapshot().layout).toMatchObject({ futureLayout });
  });

  it('detaches metadata in a successful pure move without modifying the source layout', () => {
    const source = layout();
    const moved = moveInventoryStack(source, { section: 'bag', index: 0 }, { section: 'hotbar', index: 0 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    (moved.layout.futureLayout as typeof futureLayout).values.push(false);
    expect(source.futureLayout).toEqual(futureLayout);
    expect(source.bag[0]).toBe('pencil');
  });

  it('carries moved layout metadata through load, Game.serialize, write and a separate reload', () => {
    const world = buildWorld();
    const clocks = { phoneClock: () => 0, phoneEpochClock: () => 0 };
    const original = { ...new Game(world, clocks).serialize(), assets: { moneyYen: 2480, items, layout: layout() } };
    const values = new Map([['slg-map-save-v1', JSON.stringify(original)]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, text: string) => { values.set(key, text); } };
    const store = createSaveStore({ storage: () => storage });
    const game = new Game(world, { ...clocks, save: store.loadSave(world) });
    expect(game.serialize().assets?.layout).toMatchObject({ futureLayout });
    game.assets.moveStack({ section: 'bag', index: 0 }, { section: 'hotbar', index: 0 });
    game.assets.selectHotbar(0);
    const snapshot = game.serialize();
    expect(snapshot.assets?.layout).toMatchObject({ futureLayout, selectedHotbar: 0 });
    expect(store.writeSave(snapshot)).toBe(true);
    const next = createSaveStore({ storage: () => storage });
    expect(new Game(world, { ...clocks, save: next.loadSave(world) }).serialize()).toEqual(snapshot);
    expect(snapshot.assets?.moneyYen).toBe(2480);
    expect(snapshot.assets?.items).toEqual(items);
  });
});
