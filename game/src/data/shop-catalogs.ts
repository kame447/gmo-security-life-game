/** 候補比較用の暫定品ぞろえ・価格。シナリオやまとめ買いの採用を決めるものではない。 */
import type { ShopOffer } from '../shop/purchase';

export interface ShopCatalog { readonly id: string; readonly name: string; readonly offers: readonly ShopOffer[] }
export const SHOP_CATALOGS: readonly ShopCatalog[] = [
  { id: 'konbini', name: 'コンビニ', offers: [
    { itemId: 'bottled-water', priceYen: 120 },
    { itemId: 'notebook', priceYen: 160 },
    { itemId: 'pencil', priceYen: 80 },
  ] },
];
export function shopCatalog(id: string): ShopCatalog | undefined { return SHOP_CATALOGS.find(catalog => catalog.id === id); }
