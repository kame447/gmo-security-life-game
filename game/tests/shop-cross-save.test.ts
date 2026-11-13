import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSave, writeSave } from '../src/app/save-store';
import { prepareShopReview } from '../src/app/shop-review';
import { ClerkFlow } from '../src/shop/clerk-flow';
import { SHOP_CATALOGS } from '../src/data/shop-catalogs';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const phone = { v: 1, owned: false, dataBudget: { v: 1, remainingMb: 123, capacityMb: 5000 } };
afterEach(() => vi.unstubAllGlobals());

function storedSession(damagedPosition = false) {
  const world = buildWorld(), initial = new Game(world);
  prepareShopReview(initial);
  initial.setAppearance({ ...initial.appearance, hairColor: 'black', outfitColor: 'red' });
  const valid = initial.serialize();
  let stored = JSON.stringify({ ...valid, ...(damagedPosition ? { x: -100 } : {}), phone });
  vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
  const read = () => new Game(world, { save: loadSave(world) });
  return { world, valid, read, stored: () => JSON.parse(stored) };
}

describe('normal shop saves preserve the shared phone field', () => {
  it('keeps ownership, data budget, appearance and position through purchase and reload', () => {
    const fixture = storedSession(), game = fixture.read(), position = { ...game.player };
    const flow = new ClerkFlow(SHOP_CATALOGS[0], { speaker: 'テスト用', lines: [] }, game.assets);
    flow.chooseBuy(); flow.reviewPurchase(); flow.setBuyQuantity(2);
    expect(flow.confirmPurchase()?.ok).toBe(true);
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(phone);
    expect(fixture.stored().assets).toEqual(game.assets.snapshot());
    const restored = fixture.read();
    expect(restored.player).toEqual(position);
    expect(restored.appearance).toEqual(fixture.valid.appearance);
    expect(restored.assets.moneyYen).toBe(2240);
    expect(restored.assets.quantity('bottled-water')).toBe(5);
    writeSave(restored.serialize());
    expect(fixture.stored().phone).toEqual(phone);
  });

  it('keeps every shared field when cancellation is followed by ordinary saving', () => {
    const fixture = storedSession(), game = fixture.read(), before = game.assets.snapshot();
    const flow = new ClerkFlow(SHOP_CATALOGS[0], { speaker: 'テスト用', lines: [] }, game.assets);
    flow.chooseBuy(); flow.reviewPurchase(); flow.back(); flow.close();
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(phone);
    expect(fixture.stored().assets).toEqual(before);
    expect(fixture.stored().appearance).toEqual(fixture.valid.appearance);
  });

  it('repairs a damaged position while preserving valid assets, appearance and phone', () => {
    const fixture = storedSession(true), game = fixture.read();
    expect(game.player).toEqual(new Game(fixture.world).player);
    expect(game.assets.snapshot()).toEqual(fixture.valid.assets);
    expect(game.appearance).toEqual(fixture.valid.appearance);
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(phone);
  });
});
