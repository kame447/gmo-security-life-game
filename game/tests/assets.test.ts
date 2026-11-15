import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../src/data/items';
import { PROTOTYPE_STARTING_MONEY_YEN } from '../src/data/player-defaults';
import { normalizeAssets, PlayerAssets } from '../src/state/assets';

describe('money and inventory', () => {
  it('starts with the temporary balance and an empty independent inventory', () => {
    const first = new PlayerAssets(), second = new PlayerAssets();
    expect(first.snapshot()).toEqual({ moneyYen: PROTOTYPE_STARTING_MONEY_YEN, items: [] });
    expect(first.quantity('notebook')).toBe(0);
    expect(first.quantity('missing')).toBe(0);
    first.addItem('notebook', 1);
    first.changeMoney(-1);
    expect(second.snapshot()).toEqual({ moneyYen: PROTOTYPE_STARTING_MONEY_YEN, items: [] });
  });

  it('credits and debits integer yen, allowing an exact zero balance', () => {
    const assets = new PlayerAssets({ moneyYen: 0, items: [] });
    expect(assets.changeMoney(500)).toEqual({ ok: true });
    expect(assets.moneyYen).toBe(500);
    expect(assets.changeMoney(-500)).toEqual({ ok: true });
    expect(assets.moneyYen).toBe(0);
    expect(assets.changeMoney(-1)).toEqual({ ok: false, reason: 'insufficient-funds' });
    expect(assets.moneyYen).toBe(0);
  });

  it.each([0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid money delta %s without changes', delta => {
    const assets = new PlayerAssets(), before = assets.snapshot();
    expect(assets.changeMoney(delta)).toEqual({ ok: false, reason: 'invalid-amount' });
    expect(assets.snapshot()).toEqual(before);
  });

  it('rejects balance overflow without changing money or items', () => {
    const assets = new PlayerAssets({ moneyYen: Number.MAX_SAFE_INTEGER, items: [] });
    const before = assets.snapshot();
    expect(assets.apply({ moneyDeltaYen: 1, itemDeltas: [{ itemId: 'pencil', quantityDelta: 1 }] }))
      .toEqual({ ok: false, reason: 'money-limit' });
    expect(assets.snapshot()).toEqual(before);
  });

  it('aggregates repeated acquisitions, removes quantities, and drops an empty stack', () => {
    const assets = new PlayerAssets();
    expect(assets.addItem('notebook', 2)).toEqual({ ok: true });
    expect(assets.addItem('notebook', 3)).toEqual({ ok: true });
    expect(assets.snapshot().items).toEqual([{ itemId: 'notebook', quantity: 5 }]);
    expect(assets.removeItem('notebook', 4)).toEqual({ ok: true });
    expect(assets.quantity('notebook')).toBe(1);
    expect(assets.removeItem('notebook', 1)).toEqual({ ok: true });
    expect(assets.snapshot().items).toEqual([]);
    expect(assets.removeItem('notebook', 1)).toEqual({ ok: false, reason: 'insufficient-items' });
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid add/remove quantity %s', quantity => {
    const assets = new PlayerAssets(), before = assets.snapshot();
    expect(assets.addItem('pencil', quantity)).toEqual({ ok: false, reason: 'invalid-amount' });
    expect(assets.removeItem('pencil', quantity)).toEqual({ ok: false, reason: 'invalid-amount' });
    expect(assets.snapshot()).toEqual(before);
  });

  it('rejects unknown items and enforces each data-defined limit', () => {
    const assets = new PlayerAssets();
    expect(assets.addItem('missing', 1)).toEqual({ ok: false, reason: 'unknown-item' });
    expect(assets.removeItem('missing', 1)).toEqual({ ok: false, reason: 'unknown-item' });
    for (const item of ITEM_DEFINITIONS) {
      expect(assets.addItem(item.id, item.maxQuantity)).toEqual({ ok: true });
      expect(assets.addItem(item.id, 1)).toEqual({ ok: false, reason: 'quantity-limit' });
      expect(assets.quantity(item.id)).toBe(item.maxQuantity);
    }
  });

  it('commits a purchase atomically and leaves everything unchanged on failed checks', () => {
    const assets = new PlayerAssets({ moneyYen: 300, items: [] });
    expect(assets.apply({ moneyDeltaYen: -200, itemDeltas: [
      { itemId: 'notebook', quantityDelta: 1 }, { itemId: 'notebook', quantityDelta: 2 },
    ] })).toEqual({ ok: true });
    expect(assets.snapshot()).toEqual({ moneyYen: 100, items: [{ itemId: 'notebook', quantity: 3 }] });
    const before = assets.snapshot();
    const cases = [
      { change: { moneyDeltaYen: -101, itemDeltas: [{ itemId: 'pencil', quantityDelta: 1 }] }, reason: 'insufficient-funds' },
      { change: { moneyDeltaYen: -50, itemDeltas: [{ itemId: 'pencil', quantityDelta: 1 }, { itemId: 'notebook', quantityDelta: 99 }] }, reason: 'quantity-limit' },
      { change: { moneyDeltaYen: 50, itemDeltas: [{ itemId: 'notebook', quantityDelta: -4 }] }, reason: 'insufficient-items' },
      { change: { moneyDeltaYen: -50, itemDeltas: [{ itemId: 'missing', quantityDelta: 1 }] }, reason: 'unknown-item' },
      { change: { moneyDeltaYen: -50, itemDeltas: [{ itemId: 'pencil', quantityDelta: 0.5 }] }, reason: 'invalid-amount' },
      { change: { itemDeltas: [{ itemId: 'pencil', quantityDelta: 0 }] }, reason: 'invalid-amount' },
    ];
    for (const { change, reason } of cases) {
      expect(assets.apply(change)).toEqual({ ok: false, reason });
      expect(assets.snapshot()).toEqual(before);
    }
  });

  it('evaluates combined item deltas and rejects overflowing duplicate deltas', () => {
    const assets = new PlayerAssets();
    expect(assets.apply({ itemDeltas: [
      { itemId: 'pencil', quantityDelta: 101 }, { itemId: 'pencil', quantityDelta: -100 },
    ] })).toEqual({ ok: true });
    expect(assets.quantity('pencil')).toBe(1);
    const before = assets.snapshot();
    expect(assets.apply({ itemDeltas: [
      { itemId: 'pencil', quantityDelta: Number.MAX_SAFE_INTEGER }, { itemId: 'pencil', quantityDelta: 1 },
    ] })).toEqual({ ok: false, reason: 'invalid-amount' });
    expect(assets.snapshot()).toEqual(before);
  });

  it('keeps input objects and returned snapshots separate from live state', () => {
    const raw = { moneyYen: 123, items: [{ itemId: 'notebook', quantity: 2 }] };
    const assets = new PlayerAssets(raw);
    raw.moneyYen = 999; raw.items[0].quantity = 99;
    const snapshot = assets.snapshot();
    snapshot.moneyYen = 999; snapshot.items[0].quantity = 99; snapshot.items.push({ itemId: 'pencil', quantity: 1 });
    expect(assets.snapshot()).toEqual({ moneyYen: 123, items: [{ itemId: 'notebook', quantity: 2 }] });
  });
});

describe('saved asset repair', () => {
  it('uses defaults only for missing legacy assets, and retains a valid zero balance', () => {
    expect(normalizeAssets(undefined)).toEqual({ moneyYen: PROTOTYPE_STARTING_MONEY_YEN, items: [] });
    for (const raw of [null, [], 'broken', {}]) expect(normalizeAssets(raw)).toEqual({ moneyYen: 0, items: [] });
    expect(normalizeAssets({ moneyYen: 0, items: [] }).moneyYen).toBe(0);
  });

  it('repairs only damaged fields, aggregates duplicates and clamps valid large counts', () => {
    const items: unknown[] = [
      { itemId: 'notebook', quantity: 2 }, { itemId: 'notebook', quantity: 3 },
      { itemId: 'bottled-water', quantity: Number.MAX_SAFE_INTEGER }, { itemId: 'bottled-water', quantity: 10 },
      { itemId: 'pencil', quantity: 0 }, { itemId: 'pencil', quantity: -1 }, { itemId: 'pencil', quantity: 1.5 },
      { itemId: 'pencil', quantity: NaN }, { itemId: 'pencil', quantity: Infinity },
      { itemId: 'pencil', quantity: Number.MAX_SAFE_INTEGER + 1 }, { itemId: 'missing', quantity: 1 },
      { itemId: 12, quantity: 1 }, null, 'pencil', {},
    ];
    const expectedItems = [{ itemId: 'notebook', quantity: 5 }, { itemId: 'bottled-water', quantity: 20 }];
    for (const moneyYen of [-1, 0.5, NaN, Infinity, '500', Number.MAX_SAFE_INTEGER + 1]) {
      expect(normalizeAssets({ moneyYen, items })).toEqual({ moneyYen: 0, items: expectedItems });
    }
    expect(normalizeAssets({ moneyYen: 500, items: 'broken' })).toEqual({ moneyYen: 500, items: [] });
    expect(normalizeAssets({ moneyYen: 500, items })).toEqual({ moneyYen: 500, items: expectedItems });
  });
});
