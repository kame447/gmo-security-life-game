import { describe, expect, it } from 'vitest';
import { getItemDefinition } from '../src/data/items';
import { SHOP_CATALOGS } from '../src/data/shop-catalogs';
import { ClerkFlow } from '../src/shop/clerk-flow';
import { purchase } from '../src/shop/purchase';
import { PlayerAssets } from '../src/state/assets';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const catalog = SHOP_CATALOGS[0];
describe('direct shop entry', () => {
  it('offers products with the first greeting immediately, without changing assets or advancing speech', () => {
    const assets = new PlayerAssets(), before = assets.snapshot();
    const greeting = { speaker: '店員', lines: ['いらっしゃい。', '二行目'] };
    const flow = ClerkFlow.openShop(catalog, greeting, assets);
    expect(flow.phase).toBe('catalog'); expect(flow.greetingLine).toBe(greeting.lines[0]);
    expect(flow.confirmPurchase()).toBeNull(); expect(assets.snapshot()).toEqual(before);
    flow.selectOffer(1);
    expect(flow.offer).toEqual(catalog.offers[1]); expect(assets.snapshot()).toEqual(before);
    flow.reviewPurchase(); expect(flow.phase).toBe('confirm'); expect(assets.snapshot()).toEqual(before);
    expect(flow.confirmPurchase()).toMatchObject({ ok: true, itemId: 'notebook', paidYen: 160 });
    expect(flow.confirmPurchase()).toBeNull(); expect(assets.quantity('notebook')).toBe(1);
    expect(greeting.lines).toEqual(['いらっしゃい。', '二行目']);
  });
  it('cancels the immediately available product or confirmation without charging', () => {
    const assets = new PlayerAssets(), before = assets.snapshot();
    for (const confirm of [false, true]) {
      const flow = ClerkFlow.openShop(catalog, { speaker: '店員', lines: ['いらっしゃい。'] }, assets);
      if (confirm) { flow.reviewPurchase(); flow.back(); expect(flow.phase).toBe('catalog'); }
      flow.close(); expect(flow.phase).toBe('closed'); expect(assets.snapshot()).toEqual(before);
    }
  });
});
function setup(moneyYen = 1000) {
  const assets = new PlayerAssets({ moneyYen, items: [] });
  const greeting = { speaker: '仮の店員', lines: ['仮の挨拶です。', '元の台詞は変更しません。'] };
  return { assets, greeting, flow: new ClerkFlow(catalog, greeting, assets) };
}
function browse(flow: ClerkFlow) {
  flow.advanceGreeting(); flow.advanceGreeting(); flow.chooseBuy();
}
describe('clerk conversation and atomic purchase', () => {
  it('requires the original greeting, buy choice, product and confirmation before spending', () => {
    const { flow, assets, greeting } = setup();
    expect(flow.phase).toBe('greeting');
    expect(flow.greetingLine).toBe(greeting.lines[0]);
    flow.chooseBuy(); flow.confirmPurchase(); flow.reviewPurchase();
    expect(flow.phase).toBe('greeting');
    flow.advanceGreeting();
    expect(flow.greetingLine).toBe(greeting.lines[1]);
    flow.advanceGreeting();
    expect(flow.phase).toBe('choice');
    flow.chooseBuy();
    flow.selectOffer(0);
    expect(flow.phase).toBe('catalog');
    expect(flow.balanceAfterYen).toBe(880);
    expect(assets.quantity('bottled-water')).toBe(0);
    flow.reviewPurchase();
    expect(flow.phase).toBe('confirm');
    expect(flow.confirmPurchase()).toEqual({ ok: true, itemId: 'bottled-water', paidYen: 120, balanceYen: 880, quantity: 1, boughtQuantity: 1 });
    expect(flow.phase).toBe('receipt');
    expect(greeting.lines).toEqual(['仮の挨拶です。', '元の台詞は変更しません。']);
  });
  it('never purchases twice through repeated confirmation; finishing returns to the room', () => {
    const { flow, assets } = setup(); browse(flow); flow.reviewPurchase(); flow.confirmPurchase();
    for (let i = 0; i < 10; i++) flow.confirmPurchase();
    expect(assets.moneyYen).toBe(880);
    expect(assets.quantity('bottled-water')).toBe(1);
    flow.primaryAction();
    expect(flow.phase).toBe('closed');
    flow.primaryAction();
    expect(assets.quantity('bottled-water')).toBe(1);
  });
  it('cancels at conversation or confirmation without changing assets', () => {
    for (const stage of ['greeting', 'choice', 'catalog', 'confirm']) {
      const { flow, assets } = setup(); const before = assets.snapshot();
      if (stage !== 'greeting') { flow.advanceGreeting(); flow.advanceGreeting(); }
      if (stage === 'catalog' || stage === 'confirm') flow.chooseBuy();
      if (stage === 'confirm') flow.reviewPurchase();
      flow.back(); flow.close();
      expect(assets.snapshot()).toEqual(before);
    }
    const { flow, assets } = setup(); flow.advanceGreeting(); flow.advanceGreeting(); flow.move(1); flow.primaryAction();
    expect(flow.phase).toBe('closed'); expect(assets.moneyYen).toBe(1000);
  });
  it('lets the player cancel using the confirmation choice and browse again', () => {
    const { flow, assets } = setup(); browse(flow); flow.reviewPurchase(); flow.move(1); flow.primaryAction();
    expect(flow.phase).toBe('catalog'); expect(assets.moneyYen).toBe(1000);
    flow.reviewPurchase(); flow.confirmPurchase(); flow.browseAgain();
    expect(flow.phase).toBe('catalog'); expect(flow.result).toBeNull();
  });
  it.each(['insufficient-funds', 'quantity-limit'] as const)('reports %s without partial changes', reason => {
    const { flow, assets } = setup(reason === 'insufficient-funds' ? 10 : 1000);
    if (reason === 'quantity-limit') assets.addItem('bottled-water', getItemDefinition('bottled-water')!.maxQuantity);
    const before = assets.snapshot(); browse(flow); flow.reviewPurchase();
    expect(flow.confirmPurchase()).toEqual({ ok: false, reason });
    expect(assets.snapshot()).toEqual(before);
  });
  it('handles an empty catalog and unknown products without a purchase', () => {
    const assets = new PlayerAssets();
    const empty = new ClerkFlow({ id: 'empty', name: '仮店舗', offers: [] }, { speaker: '仮店員', lines: [] }, assets);
    empty.chooseBuy(); empty.reviewPurchase(); empty.confirmPurchase();
    expect(empty.phase).toBe('catalog'); expect(assets.moneyYen).toBe(1000);
    expect(purchase(assets, { itemId: 'missing', priceYen: 50 })).toEqual({ ok: false, reason: 'unavailable' });
    expect(assets.moneyYen).toBe(1000);
  });
  it.each([-1, 0, 0.5, NaN, Infinity])('rejects invalid price %s atomically', priceYen => {
    const assets = new PlayerAssets(); const before = assets.snapshot();
    expect(purchase(assets, { itemId: 'bottled-water', priceYen }).ok).toBe(false);
    expect(assets.snapshot()).toEqual(before);
  });
  it('restores the purchase with #20 saving and does not persist the conversation', () => {
    const world = buildWorld(); const game = new Game(world);
    const flow = new ClerkFlow(catalog, { speaker: 'テスト', lines: [] }, game.assets);
    flow.chooseBuy(); flow.reviewPurchase(); flow.confirmPurchase();
    const saved = JSON.parse(JSON.stringify(game.serialize()));
    const restored = new Game(world, { save: saved });
    expect(restored.serialize()).toEqual(saved); expect(restored.assets.quantity('bottled-water')).toBe(1);
    expect(restored.dialog).toBeNull();
  });
  it('reviews a chosen quantity, applies one combined transaction, and saves the exact totals', () => {
    const { flow, assets } = setup(); browse(flow);
    flow.reviewPurchase();
    flow.setBuyQuantity(3);
    expect(flow.totalYen).toBe(360); expect(flow.balanceAfterYen).toBe(640);
    expect(flow.confirmPurchase()).toMatchObject({ ok: true, boughtQuantity: 3, paidYen: 360, balanceYen: 640 });
    expect(assets.quantity('bottled-water')).toBe(3);
    flow.confirmPurchase(); expect(assets.moneyYen).toBe(640);
  });
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid purchase quantity %s atomically', quantity => {
    const assets = new PlayerAssets(), before = assets.snapshot();
    expect(purchase(assets, catalog.offers[0], quantity)).toEqual({ ok: false, reason: 'unavailable' });
    expect(assets.snapshot()).toEqual(before);
  });
  it('fails a whole multi-item quantity if funds or remaining capacity are insufficient', () => {
    for (const assets of [new PlayerAssets({ moneyYen: 200, items: [] }),
      new PlayerAssets({ moneyYen: 1000, items: [{ itemId: 'bottled-water', quantity: 19 }] })]) {
      const before = assets.snapshot();
      expect(purchase(assets, catalog.offers[0], 2).ok).toBe(false);
      expect(assets.snapshot()).toEqual(before);
    }
  });
  it('resets quantity when changing products and keeps cancellation free of side effects', () => {
    const { flow, assets } = setup(); browse(flow); flow.setBuyQuantity(3); flow.selectOffer(1);
    expect(flow.buyQuantity).toBe(1);
    flow.setBuyQuantity(2); const before = assets.snapshot(); flow.reviewPurchase(); flow.back();
    expect(assets.snapshot()).toEqual(before); expect(flow.buyQuantity).toBe(2);
  });
});
