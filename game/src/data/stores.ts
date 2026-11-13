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

/** 現存するコンビニ1件。catalogIdは参照文字列であり、カタログの実装・採用を意味しない。 */
export const STORE_CONTACTS: readonly StoreContact[] = [
  { storeId: 'shop-konbini', interiorAreaId: 'shop-konbini-interior', entrancePortalId: 'konbini-enter',
    clerkEventKey: 'shopping.konbini.clerk', catalogId: 'konbini' },
];

export function storeForClerk(areaId: string, eventKey: string): StoreContact | undefined {
  return STORE_CONTACTS.find(store => store.interiorAreaId === areaId && store.clerkEventKey === eventKey);
}
