import type { AssetResult, ItemStack, PlayerAssets } from '../state/assets';

/** Same temporary state for every bag candidate; never a new-game or story default. */
export const BAG_REVIEW_ASSETS: Readonly<{
  moneyYen: number;
  items: readonly Readonly<ItemStack>[];
}> = Object.freeze({
  moneyYen: 2480,
  items: Object.freeze([
    { itemId: 'notebook', quantity: 2 },
    { itemId: 'pencil', quantity: 12 },
    { itemId: 'bottled-water', quantity: 3 },
    { itemId: 'small-snack', quantity: 2 },
    { itemId: 'hand-towel', quantity: 1 },
    { itemId: 'bread', quantity: 2 },
    { itemId: 'shirt', quantity: 1 },
    { itemId: 'umbrella', quantity: 1 },
    { itemId: 'key', quantity: 1 },
    { itemId: 'card', quantity: 1 },
  ].map(item => Object.freeze(item))),
});

/** Reset a temporary session through the public atomic API, without touching saves. */
export function applyBagReviewFixture(assets: PlayerAssets): AssetResult {
  return assets.apply({
    moneyDeltaYen: BAG_REVIEW_ASSETS.moneyYen - assets.moneyYen,
    itemDeltas: [
      ...assets.snapshot().items.map(item => ({ itemId: item.itemId, quantityDelta: -item.quantity })),
      ...BAG_REVIEW_ASSETS.items.map(item => ({ itemId: item.itemId, quantityDelta: item.quantity })),
    ],
  });
}
