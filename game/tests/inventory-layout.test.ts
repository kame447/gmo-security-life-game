import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSave, writeSave } from '../src/app/save-store';
import { BAG_REVIEW_ASSETS } from '../src/data/bag-review-fixture';
import { INVENTORY_PROTOTYPE } from '../src/data/inventory-config';
import { PlayerAssets, normalizeAssets } from '../src/state/assets';
import { normalizeInventoryLayout, type SlotAddress } from '../src/state/inventory';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const bag = (index: number): SlotAddress => ({ section: 'bag', index });
const hotbar = (index: number): SlotAddress => ({ section: 'hotbar', index });
const make = () => new PlayerAssets(BAG_REVIEW_ASSETS);
const ids = (assets: PlayerAssets) => { const view = assets.inventory(); return [...view.bag, ...view.hotbar].flatMap(item => item ? [item.itemId] : []); };
afterEach(() => vi.unstubAllGlobals());

describe('one inventory across backpack and hotbar', () => {
  it('migrates old assets without adding quantities or making hotbar registrations', () => {
    const assets = make();
    expect(assets.snapshot()).toEqual(BAG_REVIEW_ASSETS);
    expect(assets.inventory().bag.filter(Boolean)).toEqual(BAG_REVIEW_ASSETS.items);
    expect(assets.inventory().hotbar.every(item => item === null)).toBe(true);
    expect(new Set(ids(assets)).size).toBe(ids(assets).length);
  });
  it('moves into an empty slot and swaps occupied slots without changing money or counts', () => {
    const assets = make(); const before = assets.snapshot();
    expect(assets.moveStack(bag(0), hotbar(2))).toEqual({ ok: true });
    expect(assets.inventory().bag[0]).toBeNull();
    expect(assets.inventory().hotbar[2]).toEqual({ itemId: 'notebook', quantity: 2 });
    expect(assets.moveStack(bag(1), hotbar(2))).toEqual({ ok: true });
    expect(assets.inventory().bag[1]?.itemId).toBe('notebook');
    expect(assets.inventory().hotbar[2]?.itemId).toBe('pencil');
    expect(assets.snapshot().items).toEqual(before.items);
    expect(assets.moneyYen).toBe(before.moneyYen);
    expect(ids(assets)).toHaveLength(before.items.length);
  });
  it('treats category as an attribute independent of placement in this prototype', () => {
    const assets = make(); assets.moveStack(bag(8), hotbar(0));
    expect(assets.inventory().hotbar[0]).toEqual({ itemId: 'key', quantity: 1 });
    expect(assets.quantity('key')).toBe(1);
  });
  it('rejects invalid or empty sources atomically and accepts a same-slot move', () => {
    const assets = make(); const before = assets.snapshot();
    for (const address of [bag(-1), bag(9999), hotbar(0.5), { section: 'bad', index: 0 } as unknown as SlotAddress]) {
      expect(assets.moveStack(bag(0), address)).toEqual({ ok: false, reason: 'invalid-slot' });
    }
    expect(assets.moveStack(hotbar(0), bag(0))).toEqual({ ok: false, reason: 'empty-slot' });
    expect(assets.snapshot()).toEqual(before);
    expect(assets.moveStack(bag(0), bag(0))).toEqual({ ok: true });
    expect(assets.snapshot().items).toEqual(before.items);
  });
  it('updates a moved stack in place during purchases and removes only exhausted stacks', () => {
    const assets = make(); assets.moveStack(bag(2), hotbar(0)); assets.selectHotbar(0);
    const before = assets.snapshot();
    expect(assets.apply({ moneyDeltaYen: -120, itemDeltas: [{ itemId: 'bottled-water', quantityDelta: 1 }] })).toEqual({ ok: true });
    expect(assets.inventory().hotbar[0]).toEqual({ itemId: 'bottled-water', quantity: 4 });
    const acquired = assets.snapshot();
    expect(assets.apply({ moneyDeltaYen: -999999, itemDeltas: [{ itemId: 'shirt', quantityDelta: 1 }] })).toEqual({ ok: false, reason: 'insufficient-funds' });
    expect(assets.snapshot()).toEqual(acquired);
    assets.removeItem('bottled-water', 4);
    expect(assets.inventory().hotbar[0]).toBeNull();
    expect(assets.inventoryLayout.bag[0]).toBe(before.layout!.bag[0]);
    assets.addItem('bottled-water', 1);
    expect(assets.inventory().bag.some(item => item?.itemId === 'bottled-water')).toBe(true);
  });
  it('repairs layout only, retaining selected access and all valid ownership', () => {
    const assets = make(); const saved = assets.snapshot();
    const repaired = normalizeAssets({ ...saved, layout: { v: 1,
      bag: ['notebook', 'notebook', 'missing'], hotbar: ['notebook', 'missing', 'pencil'], selectedHotbar: 2 } });
    expect(repaired.items).toEqual(saved.items); expect(repaired.moneyYen).toBe(saved.moneyYen);
    const restored = new PlayerAssets(repaired);
    expect(restored.inventoryLayout.hotbar.slice(0, 3)).toEqual(['notebook', null, 'pencil']);
    expect(restored.inventoryLayout.selectedHotbar).toBe(2);
    expect(new Set(ids(restored)).size).toBe(saved.items.length);
    expect(ids(restored)).toHaveLength(saved.items.length);
    expect(normalizeAssets(repaired)).toEqual(repaired);
  });
  it('grows rows instead of imposing a new gameplay capacity', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ itemId: `future-${i}`, quantity: 1 }));
    const layout = normalizeInventoryLayout(undefined, items);
    expect(layout.bag.filter(Boolean)).toHaveLength(40);
    expect(layout.bag.length % INVENTORY_PROTOTYPE.columns).toBe(0);
  });
  it('returns detached views and saves', () => {
    const assets = make(); assets.moveStack(bag(0), hotbar(0));
    assets.inventory().hotbar[0]!.quantity = 999;
    assets.inventoryLayout.hotbar[0] = null;
    const saved = assets.snapshot(); saved.layout!.hotbar[0] = null;
    expect(assets.inventory().hotbar[0]).toEqual({ itemId: 'notebook', quantity: 2 });
  });
  it('persists layout and selected slot through actual storage, position repair and reset', () => {
    const world = buildWorld(); const game = new Game(world, { save: { ...new Game(world).serialize(), assets: BAG_REVIEW_ASSETS } });
    game.assets.moveStack(bag(0), hotbar(3)); game.assets.selectHotbar(3);
    let stored = '';
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    writeSave(game.serialize());
    expect(new Game(world, { save: loadSave(world) }).serialize()).toEqual(game.serialize());
    stored = JSON.stringify({ ...game.serialize(), x: -9999 });
    const restored = new Game(world, { save: loadSave(world) }); restored.reset();
    expect(restored.assets.snapshot()).toEqual(game.assets.snapshot());
  });
});
