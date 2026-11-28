/** 候補比較用の暫定品ぞろえ・価格。シナリオやまとめ買いの採用を決めるものではない。 */
import type { ShopOffer } from '../shop/purchase';

export interface ShopCatalog { readonly id: string; readonly name: string; readonly offers: readonly ShopOffer[] }
export const SHOP_CATALOGS: readonly ShopCatalog[] = [
  { id: 'konbini', name: 'コンビニ', offers: [
    { itemId: 'bottled-water', priceYen: 120 },
    { itemId: 'notebook', priceYen: 160 },
    { itemId: 'pencil', priceYen: 80 },
  ] },
  { id: 'greengrocer', name: '八百屋', offers: [
    { itemId: 'apple', priceYen: 180 },
    { itemId: 'carrot', priceYen: 100 },
  ] },
  { id: 'bookstore', name: '本屋', offers: [
    { itemId: 'paperback-book', priceYen: 680 },
    { itemId: 'notebook', priceYen: 160 },
    { itemId: 'pencil', priceYen: 80 },
  ] },
  { id: 'candy', name: '駄菓子屋', offers: [
    { itemId: 'small-snack', priceYen: 80 },
    { itemId: 'juice-drink', priceYen: 130 },
  ] },
  { id: 'bakery', name: 'パン屋', offers: [
    { itemId: 'bread', priceYen: 150 },
    { itemId: 'sandwich-bread', priceYen: 280 },
  ] },
  { id: 'cafe', name: 'カフェ', offers: [
    { itemId: 'coffee-drink', priceYen: 300 },
    { itemId: 'tea-drink', priceYen: 280 },
    { itemId: 'bread', priceYen: 180 },
  ] },
  { id: 'pharmacy', name: '薬局', offers: [
    { itemId: 'bandage', priceYen: 180 },
    { itemId: 'mask', priceYen: 150 },
    { itemId: 'hand-towel', priceYen: 300 },
  ] },
];
export function shopCatalog(id: string): ShopCatalog | undefined { return SHOP_CATALOGS.find(catalog => catalog.id === id); }
