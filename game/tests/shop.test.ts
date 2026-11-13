import { describe, expect, it } from 'vitest';
import { SHOPS, shopForEvent } from '../src/data/shops';
import { getItemDefinition } from '../src/data/items';
import { Game } from '../src/session/game';
import { ShopFlow } from '../src/shop/flow';
import { purchase, type ShopAssetsPort } from '../src/shop/purchase';
import { PlayerAssets } from '../src/state/assets';
import { buildWorld } from '../src/world';

/** A tiny atomic port double: the shop must not perform independent money/item writes. */
class Wallet implements ShopAssetsPort {
  private count = 0;
  calls = 0;
  constructor(public moneyYen = 200, private readonly limit = 20) {}
  quantity(): number { return this.count; }
  apply(change: { moneyDeltaYen: number; itemDeltas: { itemId: string; quantityDelta: number }[] }) {
    this.calls++;
    const money = this.moneyYen + change.moneyDeltaYen;
    const count = this.count + change.itemDeltas[0].quantityDelta;
    if (money < 0) return { ok: false as const, reason: 'insufficient-funds' };
    if (count > this.limit) return { ok: false as const, reason: 'quantity-limit' };
    this.moneyYen = money;
    this.count = count;
    return { ok: true as const };
  }
}

const shop = SHOPS[0];

describe('atomic purchases through the assets port', () => {
  it('changes money and items together on a successful purchase', () => {
    const assets = new Wallet();
    expect(purchase(assets, shop.offers[0])).toEqual({ ok: true, itemId: 'small-snack', paidYen: 30, balanceYen: 170, quantity: 1 });
    expect(assets.moneyYen).toBe(170);
    expect(assets.quantity()).toBe(1);
    expect(assets.calls).toBe(1);
  });

  it.each([
    { money: 29, limit: 20, reason: 'insufficient-funds' },
    { money: 200, limit: 0, reason: 'quantity-limit' },
  ])('does not change either asset for $reason', ({ money, limit, reason }) => {
    const assets = new Wallet(money, limit);
    expect(purchase(assets, shop.offers[0])).toEqual({ ok: false, reason });
    expect(assets.moneyYen).toBe(money);
    expect(assets.quantity()).toBe(0);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid prices (%s) before touching assets', priceYen => {
    const assets = new Wallet();
    expect(purchase(assets, { itemId: 'small-snack', priceYen })).toEqual({ ok: false, reason: 'unavailable' });
    expect(assets.calls).toBe(0);
  });
});

describe('shop flow', () => {
  it('requires selecting and confirming; cancel at either step leaves assets unchanged', () => {
    const assets = new Wallet();
    const flow = new ShopFlow(shop, assets);
    flow.confirm();
    expect(assets.calls).toBe(0);
    flow.move(1);
    expect(flow.selectedIndex).toBe(1);
    flow.select();
    expect(flow.phase).toBe('confirm');
    expect(flow.balanceYen).toBe(200);
    expect(flow.balanceAfterYen).toBe(100);
    flow.back();
    expect(flow.phase).toBe('browse');
    flow.back();
    expect(flow.phase).toBe('closed');
    expect(assets.calls).toBe(0);
    expect(assets.moneyYen).toBe(200);
  });

  it('cannot buy twice by repeatedly confirming or pressing the primary action on a result', () => {
    const assets = new Wallet();
    const flow = new ShopFlow(shop, assets);
    flow.primaryAction();
    flow.primaryAction();
    for (let i = 0; i < 10; i++) { flow.confirm(); flow.primaryAction(); flow.select(); }
    expect(flow.phase).toBe('result');
    expect(assets.calls).toBe(1);
    expect(assets.quantity()).toBe(1);
    flow.back();
    flow.primaryAction();
    flow.primaryAction();
    expect(assets.quantity()).toBe(2);
  });

  it('reports failure once and supports explicitly returning to the list', () => {
    const assets = new Wallet(0);
    const flow = new ShopFlow(shop, assets);
    flow.select();
    flow.confirm();
    expect(flow.result).toEqual({ ok: false, reason: 'insufficient-funds' });
    flow.back();
    expect(flow.result).toBeNull();
    expect(flow.phase).toBe('browse');
    flow.close();
    flow.select();
    flow.confirm();
    expect(flow.phase).toBe('closed');
    expect(assets.calls).toBe(1);
  });

  it('maps each existing shopping interaction to a catalog without mapping other dialogs', () => {
    for (const key of ['shopping.candy', 'shopping.vending', 'shopping.konbini.snacks', 'shopping.konbini.drinks', 'shopping.konbini.clerk']) {
      expect(shopForEvent(key)?.offers.length).toBeGreaterThan(0);
    }
    expect(shopForEvent('test.friend')).toBeUndefined();
  });
});

describe('shop and #20 asset/save integration', () => {
  it('uses defined items and positive integer yen prices in every catalog', () => {
    for (const shop of SHOPS) for (const offer of shop.offers) {
      expect(getItemDefinition(offer.itemId), `${shop.id}/${offer.itemId}`).toBeDefined();
      expect(Number.isSafeInteger(offer.priceYen) && offer.priceYen > 0).toBe(true);
    }
  });

  it('keeps the wallet and inventory unchanged when the real item cap is reached', () => {
    const item = getItemDefinition('small-snack')!;
    const assets = new PlayerAssets({ moneyYen: 500, items: [{ itemId: item.id, quantity: item.maxQuantity }] });
    const before = assets.snapshot();
    expect(purchase(assets, shop.offers[0])).toEqual({ ok: false, reason: 'quantity-limit' });
    expect(assets.snapshot()).toEqual(before);
  });

  it('restores successful purchases together with position and appearance from JSON', () => {
    const world = buildWorld();
    const game = new Game(world);
    expect(purchase(game.assets, shop.offers[0]).ok).toBe(true);
    expect(purchase(game.assets, shop.offers[1]).ok).toBe(true);
    const saved = JSON.parse(JSON.stringify(game.serialize()));
    const restored = new Game(world, { save: saved });
    expect(restored.serialize()).toEqual(saved);
    expect(restored.assets.moneyYen).toBe(game.assets.moneyYen);
    expect(restored.assets.quantity('small-snack')).toBe(1);
    expect(restored.assets.quantity('bottled-water')).toBe(1);
    restored.reset();
    expect(restored.assets.snapshot()).toEqual(game.assets.snapshot());
  });
});
