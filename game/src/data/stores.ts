/**
 * 店舗と既存マップの接続だけを持つ。配置・台詞・商品・価格・UIは定義しない。
 * #33で店内を追加した際の編集手順は docs/features/stores.md（提案／要検証）を参照。
 */
export interface StoreContact {
  readonly storeId: string;
  readonly interiorAreaId: string;
  readonly entrancePortalId: string;
  readonly clerkEventKey: string;
  readonly catalogId: string;
}

/**
 * 既存コンビニと#33の名前付き6店。追加店の通常ワールドへの登録はworldの結線担当が行う。
 * catalogIdは参照文字列であり、カタログや購入UIの実装・採用を意味しない。
 */
export const STORE_CONTACTS: readonly StoreContact[] = [
  { storeId: 'shop-konbini', interiorAreaId: 'shop-konbini-interior', entrancePortalId: 'konbini-enter',
    clerkEventKey: 'shopping.konbini.clerk', catalogId: 'konbini' },
  ...['greengrocer', 'bookstore', 'candy', 'bakery', 'cafe', 'pharmacy'].map(id => ({
    storeId: `shop-${id}`, interiorAreaId: `shop-${id}-interior`, entrancePortalId: `${id}-enter`,
    clerkEventKey: `shopping.${id}.clerk`, catalogId: id,
  })),
];

export function storeForClerk(areaId: string, eventKey: string): StoreContact | undefined {
  return STORE_CONTACTS.find(store => store.interiorAreaId === areaId && store.clerkEventKey === eventKey);
}
