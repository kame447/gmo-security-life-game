/** 商品・品ぞろえ・価格は試作用の暫定例で、シナリオの確定ではない。#21が管理する。 */
import type { ShopOffer } from '../shop/purchase';

export interface ShopCatalog { readonly id: string; readonly name: string; readonly offers: readonly ShopOffer[] }
export const SHOP_CATALOGS: readonly ShopCatalog[] = [
  { id: 'konbini', name: 'コンビニ', offers: [
    { itemId: 'small-snack', priceYen: 50 },
    { itemId: 'bottled-water', priceYen: 120 },
    { itemId: 'notebook', priceYen: 160 },
  ] },
];
export function shopCatalog(id: string): ShopCatalog | undefined { return SHOP_CATALOGS.find(catalog => catalog.id === id); }
