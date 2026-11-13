/**
 * Issue #21 の試作用データ。商品・品ぞろえ・価格はすべて暫定例で、シナリオの確定ではない。
 * アイテム名・説明・所持上限は data/items.ts、価格はここだけで管理する。
 */
import type { ShopOffer } from '../shop/purchase';

export interface ShopDefinition {
  readonly id: string;
  readonly name: string;
  readonly eventKeys: readonly string[];
  readonly offers: readonly ShopOffer[];
}

export const SHOPS: readonly ShopDefinition[] = [
  { id: 'candy', name: 'だがしやさん', eventKeys: ['shopping.candy'], offers: [
    { itemId: 'small-snack', priceYen: 30 }, { itemId: 'bottled-water', priceYen: 100 },
  ] },
  { id: 'vending', name: 'じどうはんばいき', eventKeys: ['shopping.vending'], offers: [
    { itemId: 'bottled-water', priceYen: 120 },
  ] },
  { id: 'konbini-snacks', name: 'コンビニ・おかし', eventKeys: ['shopping.konbini.snacks'], offers: [
    { itemId: 'small-snack', priceYen: 50 },
  ] },
  { id: 'konbini-drinks', name: 'コンビニ・のみもの', eventKeys: ['shopping.konbini.drinks'], offers: [
    { itemId: 'bottled-water', priceYen: 120 },
  ] },
  { id: 'konbini-clerk', name: 'コンビニ・レジ', eventKeys: ['shopping.konbini.clerk'], offers: [
    { itemId: 'small-snack', priceYen: 50 }, { itemId: 'bottled-water', priceYen: 120 },
  ] },
];

export function shopForEvent(eventKey: string): ShopDefinition | undefined {
  return SHOPS.find(shop => shop.eventKeys.includes(eventKey));
}
