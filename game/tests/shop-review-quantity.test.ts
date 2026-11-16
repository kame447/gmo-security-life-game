import { describe, expect, it } from 'vitest';
import { SHOP_CATALOGS } from '../src/data/shop-catalogs';
import { ClerkFlow } from '../src/shop/clerk-flow';
import { PlayerAssets } from '../src/state/assets';

function setup(moneyYen = 5000) {
  const assets = new PlayerAssets({ moneyYen, items: [] });
  const flow = ClerkFlow.openShop(SHOP_CATALOGS[0], { speaker: '店員', lines: ['こんにちは。'] }, assets);
  return { assets, flow };
}
describe('quantity for the next purchase', () => {
  it('starts at one after a successful receipt, without changing the completed transaction', () => {
    const { assets, flow } = setup(); flow.setBuyQuantity(5); flow.reviewPurchase();
    expect(flow.confirmPurchase()?.ok).toBe(true);
    const purchased = assets.snapshot();
    expect(assets.quantity(flow.offer!.itemId)).toBe(5);
    flow.browseAgain(); flow.reviewPurchase();
    expect(flow.buyQuantity).toBe(1);
    expect(flow.totalYen).toBe(flow.offer!.priceYen);
    expect(assets.snapshot()).toEqual(purchased);
  });
  it('keeps the chosen quantity when cancelling a confirmation', () => {
    const { assets, flow } = setup(); const before = assets.snapshot();
    flow.setBuyQuantity(5); flow.reviewPurchase(); flow.back(); flow.reviewPurchase();
    expect(flow.buyQuantity).toBe(5); expect(assets.snapshot()).toEqual(before);
  });
  it('keeps the chosen quantity after a refused purchase and does not charge', () => {
    const { assets, flow } = setup(0); const before = assets.snapshot();
    flow.setBuyQuantity(5); flow.reviewPurchase(); expect(flow.confirmPurchase()?.ok).toBe(false);
    flow.browseAgain(); expect(flow.buyQuantity).toBe(5); expect(assets.snapshot()).toEqual(before);
  });
});
