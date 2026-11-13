import { describe, expect, it } from 'vitest';
import { prepareShopReview } from '../src/app/shop-review';
import { BAG_REVIEW_ASSETS } from '../src/data/bag-review-fixture';
import { shopLayout } from '../src/shop/layout';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

describe('review-only shop candidates', () => {
  it('uses an explicit query and a stable fallback for both layouts', () => {
    expect(shopLayout('?shop=compact&review=1')).toBe('compact');
    for (const search of ['', '?shop=split', '?shop=unknown', '?shop=COMPACT']) expect(shopLayout(search)).toBe('split');
  });
  it('prepares the shared assets at a reachable real clerk without changing the world', () => {
    const world = buildWorld(), before = structuredClone(world), game = new Game(world);
    expect(prepareShopReview(game)).toBe(true);
    expect(game.player.areaId).toBe('shop-konbini-interior');
    expect(game.facingInteraction()?.eventKey).toBe('shopping.konbini.clerk');
    expect(game.assets.snapshot()).toEqual(BAG_REVIEW_ASSETS);
    expect(world).toEqual(before);
  });
  it('leaves the session alone if the existing clerk is unavailable', () => {
    const world = buildWorld(); world.areas.delete('shop-konbini-interior');
    const game = new Game(world), before = game.serialize();
    expect(prepareShopReview(game)).toBe(false);
    expect(game.serialize()).toEqual(before);
  });
});
