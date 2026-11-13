/** 日常の購入処理。資産の更新はポートの原子的な apply に1回だけ渡す。DOM 非依存。 */
export interface ShopOffer {
  readonly itemId: string;
  readonly priceYen: number;
}

export interface ShopAssetsPort {
  readonly moneyYen: number;
  quantity(itemId: string): number;
  /** A failure must leave both money and items unchanged. */
  apply(change: { moneyDeltaYen: number; itemDeltas: { itemId: string; quantityDelta: number }[] }):
    { ok: true } | { ok: false; reason: string };
}

export type PurchaseResult =
  | { ok: true; itemId: string; paidYen: number; balanceYen: number; quantity: number }
  | { ok: false; reason: 'insufficient-funds' | 'quantity-limit' | 'unavailable' };

/** One item per purchase. Reusable by another shop or an event without a panel. */
export function purchase(assets: ShopAssetsPort, offer: ShopOffer): PurchaseResult {
  if (!Number.isSafeInteger(offer.priceYen) || offer.priceYen <= 0) return { ok: false, reason: 'unavailable' };
  const result = assets.apply({ moneyDeltaYen: -offer.priceYen, itemDeltas: [{ itemId: offer.itemId, quantityDelta: 1 }] });
  if (!result.ok) {
    const reason = result.reason === 'insufficient-funds' || result.reason === 'quantity-limit' ? result.reason : 'unavailable';
    return { ok: false, reason };
  }
  return { ok: true, itemId: offer.itemId, paidYen: offer.priceYen, balanceYen: assets.moneyYen, quantity: assets.quantity(offer.itemId) };
}
