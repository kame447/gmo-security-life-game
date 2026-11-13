import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSave, writeSave } from '../src/app/save-store';
import { DEFAULT_APPEARANCE } from '../src/core/appearance';
import { INVENTORY_PROTOTYPE } from '../src/data/inventory-config';
import { PROTOTYPE_STARTING_MONEY_YEN } from '../src/data/player-defaults';
import { PHONE_BUDGET_PROTOTYPE } from '../src/phone/budget-config';
import type { PhoneSave } from '../src/phone/save';
import { Game } from '../src/session/game';
import type { AssetSnapshot, ItemStack } from '../src/state/assets';
import type { InventoryLayoutSave } from '../src/state/inventory';
import { parseSave, type SaveData } from '../src/state/save';
import { buildWorld } from '../src/world';
import mainV1 from './fixtures/save-v1/main-era-v1.json';
import bagV1 from './fixtures/save-v1/bag-layout-v1.json';
import shopV1 from './fixtures/save-v1/shop-no-layout-v1.json';
import phoneV1 from './fixtures/save-v1/phone-chat-v1.json';
import corruptEntries from './fixtures/save-v1/corrupt-layout-entries-v1.json';
import corruptShape from './fixtures/save-v1/corrupt-layout-shape-v1.json';

/** Run unchanged against the rehearsal's Game, including its live PhoneModel. */
const fixtures = [
  { name: 'main-era', data: mainV1 }, { name: 'bag-layout', data: bagV1 },
  { name: 'shop-no-layout', data: shopV1 }, { name: 'phone-chat', data: phoneV1 },
  { name: 'corrupt-entries', data: corruptEntries }, { name: 'corrupt-shape', data: corruptShape },
];
type Fixture = typeof fixtures[number];
const world = buildWorld();
const options = { initialPhoneOwned: true, phoneDataConfig: PHONE_BUDGET_PROTOTYPE };
const key = 'slg-map-save-v1';

beforeEach(() => {
  // Persistence tests do not advance gameplay. A live phone must not consume its
  // pending reply delay between serializations just because this test takes time.
  vi.spyOn(performance, 'now').mockReturnValue(1234);
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_001_234);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function source(fixture: Fixture): Record<string, unknown> {
  const { _fixture, ...save } = structuredClone(fixture.data);
  void _fixture;
  return save;
}
function rawAssets(raw: Record<string, unknown>): Pick<AssetSnapshot, 'moneyYen' | 'items'> {
  return raw.assets as Pick<AssetSnapshot, 'moneyYen' | 'items'> ?? { moneyYen: PROTOTYPE_STARTING_MONEY_YEN, items: [] };
}
function expectPreserved(saved: SaveData, raw: Record<string, unknown>): void {
  const assets = rawAssets(raw);
  expect(saved.assets?.moneyYen).toBe(assets.moneyYen);
  expect(saved.assets?.items).toEqual(assets.items);
  expect(saved.appearance).toEqual(raw.appearance ?? DEFAULT_APPEARANCE);
  const phone = raw.phone as PhoneSave | undefined;
  expect(saved.phone?.owned).toBe(phone?.owned ?? options.initialPhoneOwned);
  expect(saved.phone?.dataBudget).toEqual(phone?.dataBudget ?? {
    v: 1, remainingMb: PHONE_BUDGET_PROTOTYPE.capacityMb, capacityMb: PHONE_BUDGET_PROTOTYPE.capacityMb,
  });
  if (phone?.chat) expect(saved.phone?.chat).toEqual(phone.chat);
}
function expectUniquePlacement(game: Game): void {
  const view = game.assets.inventory();
  const placed = [...view.bag, ...view.hotbar].filter((item): item is ItemStack => item !== null);
  expect(new Set(placed.map(item => item.itemId)).size).toBe(placed.length);
  expect(placed.sort((a, b) => a.itemId.localeCompare(b.itemId)))
    .toEqual(game.assets.snapshot().items.sort((a, b) => a.itemId.localeCompare(b.itemId)));
}
function expectDefaultLayout(game: Game, items: readonly ItemStack[]): void {
  const layout = game.assets.inventoryLayout;
  expect(layout.hotbar).toEqual(Array(INVENTORY_PROTOTYPE.hotbarSlots).fill(null));
  expect(layout.selectedHotbar).toBe(0);
  expect(layout.bag.slice(0, items.length)).toEqual(items.map(item => item.itemId));
  expect(layout.bag.slice(items.length).every(item => item === null)).toBe(true);
  expect(layout.bag.length).toBeGreaterThanOrEqual(INVENTORY_PROTOTYPE.columns * INVENTORY_PROTOTYPE.bagRows);
  expectUniquePlacement(game);
}
function memoryStorage(raw: unknown): Map<string, string> {
  const memory = new Map([[key, JSON.stringify(raw)]]);
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => memory.get(name) ?? null,
    setItem: (name: string, value: string) => { memory.set(name, value); },
  });
  return memory;
}

describe('v1 assets layout compatibility fixtures', () => {
  it('labels every fixture as synthetic and provisional with its schema provenance', () => {
    expect(new Set(fixtures.map(fixture => fixture.data._fixture.id)).size).toBe(fixtures.length);
    for (const fixture of fixtures) {
      expect(fixture.data._fixture).toMatchObject({ synthetic: true, provisional: true });
      expect(fixture.data._fixture.schemaSource).not.toBe('');
      expect(fixture.data.v).toBe(1);
    }
  });

  it.each(fixtures)('$name: shared codec retains ownership, money, appearance, phone and chat', fixture => {
    const raw = source(fixture); const before = structuredClone(raw);
    const parsed = parseSave(raw, world, options.initialPhoneOwned, options.phoneDataConfig);
    expect(parsed).not.toBeNull();
    expectPreserved(parsed!, raw);
    expect(parsed).toMatchObject({ variantId: raw.variantId, areaId: raw.areaId, x: raw.x, y: raw.y, facing: raw.facing });
    if (fixture.name === 'bag-layout' || fixture.name === 'phone-chat') {
      expect(parsed?.assets?.layout).toEqual((raw.assets as AssetSnapshot).layout);
    }
    const game = new Game(world, { ...options, save: parsed });
    expectUniquePlacement(game);
    expect(raw).toEqual(before);
  });

  it.each(fixtures)('$name: materialized layout stays unchanged through storage save/reload', fixture => {
    const raw = source(fixture); const memory = memoryStorage(raw);
    const first = new Game(world, { ...options, save: loadSave(world, options) });
    // This is the same public materialization step used by the bag UI, without DOM.
    expect(first.assets.selectHotbar(first.assets.inventoryLayout.selectedHotbar)).toBe(true);
    const expected = first.serialize(); expectPreserved(expected, raw);
    expect(expected.assets?.layout).toBeDefined(); writeSave(expected);
    for (let cycle = 0; cycle < 3; cycle++) {
      const restored = new Game(world, { ...options, save: loadSave(world, options) });
      expect(restored.serialize()).toEqual(expected);
      expectUniquePlacement(restored);
      writeSave(restored.serialize());
      expect(JSON.parse(memory.get(key)!)).toEqual(expected);
    }
  });

  it.each(fixtures.filter(fixture => fixture.name === 'main-era' || fixture.name === 'shop-no-layout'))
    ('$name: missing layout defaults to the bag with an empty hotbar', fixture => {
      const raw = source(fixture); const game = new Game(world, { ...options, save: raw });
      expectDefaultLayout(game, rawAssets(raw).items);
      expectPreserved(game.serialize(), raw);
    });

  it('repairs duplicate/unknown locations and the invalid selection without touching valid data', () => {
    const raw = source(fixtures[4]); const game = new Game(world, { ...options, save: raw });
    const expectedBag: (string | null)[] = Array(INVENTORY_PROTOTYPE.columns * INVENTORY_PROTOTYPE.bagRows).fill(null);
    expectedBag[0] = 'notebook'; expectedBag[1] = 'small-snack'; expectedBag[3] = 'pencil';
    expect(game.assets.inventoryLayout).toEqual({ v: 1, bag: expectedBag,
      hotbar: ['key', null, null, null, 'bottled-water'], selectedHotbar: 0 });
    expectPreserved(game.serialize(), raw); expectUniquePlacement(game);
  });

  it('repairs an unsupported/broken layout envelope to default locations only', () => {
    const raw = source(fixtures[5]); const game = new Game(world, { ...options, save: raw });
    expectDefaultLayout(game, rawAssets(raw).items);
    expectPreserved(game.serialize(), raw);
  });

  it.each(fixtures.slice(4))('$name: damaged position and layout repair independently of chat/assets', fixture => {
    const raw = source(fixture);
    const game = new Game(world, { ...options, save: { ...raw, areaId: 'compat-missing-area', x: -9999 } });
    expect(game.player).toEqual(new Game(world, options).player);
    expectPreserved(game.serialize(), raw); expectUniquePlacement(game);
  });

  it('retains placement, selection and chat after a public atomic purchase and storage round trip', () => {
    const raw = source(fixtures[3]); const memory = memoryStorage(raw);
    const game = new Game(world, { ...options, save: loadSave(world, options) });
    const original = game.serialize();
    expect(game.assets.moveStack({ section: 'bag', index: 1 }, { section: 'hotbar', index: 1 })).toEqual({ ok: true });
    game.assets.selectHotbar(1);
    // Transaction values are test-only; no seller, product price or event is adopted.
    expect(game.assets.apply({ moneyDeltaYen: -120, itemDeltas: [{ itemId: 'bottled-water', quantityDelta: 1 }] })).toEqual({ ok: true });
    expect(game.assets.inventory().hotbar[2]).toEqual({ itemId: 'bottled-water', quantity: 4 });
    const expected = game.serialize();
    expect(game.assets.apply({ moneyDeltaYen: -999999, itemDeltas: [{ itemId: 'shirt', quantityDelta: 1 }] }))
      .toEqual({ ok: false, reason: 'insufficient-funds' });
    expect(game.serialize()).toEqual(expected);
    writeSave(game.serialize());
    const restored = new Game(world, { ...options, save: loadSave(world, options) });
    expect(restored.serialize()).toEqual(expected);
    expect(restored.serialize().phone).toEqual(original.phone);
    expect(restored.serialize().assets?.layout).toEqual(expected.assets!.layout as InventoryLayoutSave);
    expect(restored.assets.moneyYen).toBe(rawAssets(raw).moneyYen - 120);
    expectUniquePlacement(restored);
    expect(JSON.parse(memory.get(key)!)).toEqual(expected);
  });
});
