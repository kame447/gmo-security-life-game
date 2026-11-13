/** 再利用する内部取引処理。UI・会話・マップに依存しない。 */
export interface ShopOffer { readonly itemId: string; readonly priceYen: number }
export interface ShopAssetsPort {
  readonly moneyYen: number;
  quantity(itemId: string): number;
  /** Failed transactions leave the entire state unchanged. */
  apply(change: { moneyDeltaYen: number; itemDeltas: { itemId: string; quantityDelta: number }[] }):
    { ok: true } | { ok: false; reason: string };
}
export type PurchaseResult =
  | { ok: true; itemId: string; paidYen: number; balanceYen: number; quantity: number; boughtQuantity: number }
  | { ok: false; reason: 'insufficient-funds' | 'quantity-limit' | 'unavailable' };

/** quantity > 1は数量操作の比較用。まとめ買いの正式な範囲は未決定。 */
export function purchase(assets: ShopAssetsPort, offer: ShopOffer, quantity = 1): PurchaseResult {
  const paidYen = offer.priceYen * quantity;
  if (!Number.isSafeInteger(offer.priceYen) || offer.priceYen <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 ||
      !Number.isSafeInteger(paidYen)) return { ok: false, reason: 'unavailable' };
  const result = assets.apply({ moneyDeltaYen: -paidYen, itemDeltas: [{ itemId: offer.itemId, quantityDelta: quantity }] });
  if (!result.ok) return { ok: false, reason: result.reason === 'insufficient-funds' || result.reason === 'quantity-limit' ? result.reason : 'unavailable' };
  return { ok: true, itemId: offer.itemId, paidYen, balanceYen: assets.moneyYen, quantity: assets.quantity(offer.itemId), boughtQuantity: quantity };
}
