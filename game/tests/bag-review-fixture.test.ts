import { describe, expect, it } from 'vitest';
import { applyBagReviewFixture, BAG_REVIEW_ASSETS } from '../src/data/bag-review-fixture';
import { ITEM_DEFINITIONS } from '../src/data/items';
import { PlayerAssets } from '../src/state/assets';

describe('shared bag comparison state', () => {
  it('reproduces the same valid state after acquisitions, purchases and repeated seeding', () => {
    const assets = new PlayerAssets();
    assets.addItem('pencil', 99);
    assets.changeMoney(-700);
    expect(applyBagReviewFixture(assets)).toEqual({ ok: true });
    expect(assets.snapshot()).toEqual(BAG_REVIEW_ASSETS);
    assets.removeItem('key', 1);
    assets.addItem('shirt', 2);
    expect(applyBagReviewFixture(assets)).toEqual({ ok: true });
    expect(assets.snapshot()).toEqual(BAG_REVIEW_ASSETS);
    expect(applyBagReviewFixture(assets)).toEqual({ ok: true });
    expect(assets.snapshot()).toEqual(BAG_REVIEW_ASSETS);
  });

  it('keeps old item IDs and limits while making clothes ordinary owned items', () => {
    expect(ITEM_DEFINITIONS.slice(0, 3).map(item => [item.id, item.maxQuantity])).toEqual([
      ['notebook', 99], ['pencil', 99], ['bottled-water', 20],
    ]);
    expect(ITEM_DEFINITIONS.find(item => item.id === 'shirt')?.category).toBe('normal');
    expect(new Set(ITEM_DEFINITIONS.map(item => item.category))).toEqual(new Set(['normal', 'important']));
    expect(new PlayerAssets().snapshot()).toEqual({ moneyYen: 1000, items: [] });
  });
});
