/**
 * 暫定・統合リハーサル専用。品ぞろえ、商品名、価格の採用を決めない。
 * 製品 src からは import しない。起動側のテスト用 provider が注入する。
 * #33 の参照元: feat/store-interiors-wiring bed878f3248bae0167c76b0437994a9705ba3a0a。
 */
import { getItemDefinition } from '../../src/data/items';
import { SHOP_CATALOGS, type ShopCatalog } from '../../src/data/shop-catalogs';
import type { StoreContact } from '../../src/data/stores';
import type { ShopOffer } from '../../src/shop/purchase';

export const STORE_CONTRACT_SOURCE = 'bed878f3248bae0167c76b0437994a9705ba3a0a';

/** bed878f の五つ組の固定写し。既存マップの契約を改名・推測しない。 */
export const PROVISIONAL_STORE_CONTACTS = [
  { storeId: 'shop-konbini', interiorAreaId: 'shop-konbini-interior', entrancePortalId: 'konbini-enter', clerkEventKey: 'shopping.konbini.clerk', catalogId: 'konbini', provisional: true },
  { storeId: 'shop-greengrocer', interiorAreaId: 'shop-greengrocer-interior', entrancePortalId: 'greengrocer-enter', clerkEventKey: 'shopping.greengrocer.clerk', catalogId: 'greengrocer', provisional: true },
  { storeId: 'shop-bookstore', interiorAreaId: 'shop-bookstore-interior', entrancePortalId: 'bookstore-enter', clerkEventKey: 'shopping.bookstore.clerk', catalogId: 'bookstore', provisional: true },
  { storeId: 'shop-candy', interiorAreaId: 'shop-candy-interior', entrancePortalId: 'candy-enter', clerkEventKey: 'shopping.candy.clerk', catalogId: 'candy', provisional: true },
  { storeId: 'shop-bakery', interiorAreaId: 'shop-bakery-interior', entrancePortalId: 'bakery-enter', clerkEventKey: 'shopping.bakery.clerk', catalogId: 'bakery', provisional: true },
  { storeId: 'shop-cafe', interiorAreaId: 'shop-cafe-interior', entrancePortalId: 'cafe-enter', clerkEventKey: 'shopping.cafe.clerk', catalogId: 'cafe', provisional: true },
  { storeId: 'shop-pharmacy', interiorAreaId: 'shop-pharmacy-interior', entrancePortalId: 'pharmacy-enter', clerkEventKey: 'shopping.pharmacy.clerk', catalogId: 'pharmacy', provisional: true },
] as const satisfies readonly (StoreContact & { readonly provisional: true })[];

export type ProvisionalCatalogId = typeof PROVISIONAL_STORE_CONTACTS[number]['catalogId'];
interface ProvisionalRemoval { readonly itemId: string; readonly provisional: true }
export interface ProvisionalOffer extends ShopOffer { readonly name: string; readonly provisional: true }
interface CatalogDelta {
  readonly name: string;
  readonly provisional: true;
  readonly remove: readonly ProvisionalRemoval[];
  readonly add: readonly ProvisionalOffer[];
}
export interface ProvisionalCatalog extends ShopCatalog {
  readonly provisional: true;
  readonly offers: readonly ProvisionalOffer[];
}

const remove = (itemId: string): ProvisionalRemoval => ({ itemId, provisional: true });
const offer = (itemId: string, priceYen: number): ProvisionalOffer => {
  const item = getItemDefinition(itemId);
  if (!item) throw new Error(`Unknown provisional item: ${itemId}`);
  return { itemId, priceYen, name: `暫定 ${item.name}`, provisional: true };
};

/**
 * コンビニを基準にした除外・追加だけを記録する。追加の価格も試験用。
 * 既存 ID だけで配線を試すための代用品であり、各店の正式商品ではない。
 */
export const PROVISIONAL_CATALOG_DELTAS: Readonly<Record<ProvisionalCatalogId, CatalogDelta>> = {
  konbini: { name: '暫定 コンビニ', provisional: true, remove: [], add: [] },
  greengrocer: { name: '暫定 やおや', provisional: true,
    remove: [remove('notebook'), remove('pencil')], add: [offer('hand-towel', 90)] },
  bookstore: { name: '暫定 ほんや', provisional: true, remove: [remove('bottled-water')], add: [] },
  candy: { name: '暫定 だがしや', provisional: true,
    remove: [remove('notebook'), remove('pencil')], add: [offer('small-snack', 60)] },
  bakery: { name: '暫定 パンや', provisional: true,
    remove: [remove('notebook'), remove('pencil')], add: [offer('bread', 100)] },
  cafe: { name: '暫定 きっさてん', provisional: true,
    remove: [remove('notebook'), remove('pencil')], add: [offer('bread', 140)] },
  pharmacy: { name: '暫定 くすりや', provisional: true,
    remove: [remove('notebook'), remove('pencil')], add: [offer('hand-towel', 110)] },
};

/** Resolves fresh DTOs without mutating the production base or sharing mutable offer objects. */
export function buildProvisionalStoreCatalogs(base: readonly ShopCatalog[] = SHOP_CATALOGS): readonly ProvisionalCatalog[] {
  const konbini = base.find(catalog => catalog.id === 'konbini');
  if (!konbini) throw new Error('The provisional catalogues require the existing konbini base');
  return PROVISIONAL_STORE_CONTACTS.map(({ catalogId }) => {
    const delta = PROVISIONAL_CATALOG_DELTAS[catalogId];
    const excluded = new Set(delta.remove.map(item => item.itemId));
    const additions = new Set(delta.add.map(item => item.itemId));
    return { id: catalogId, name: delta.name, provisional: true,
      offers: [...konbini.offers.filter(item => !excluded.has(item.itemId) && !additions.has(item.itemId))
        .map(item => offer(item.itemId, item.priceYen)), ...delta.add.map(item => ({ ...item }))] };
  });
}

export const PROVISIONAL_STORE_CATALOGS = buildProvisionalStoreCatalogs();
