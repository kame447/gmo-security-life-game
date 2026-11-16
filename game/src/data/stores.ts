/** #33のマップ/NPC担当が追加する店舗の接続データ。配置・台詞はこのファイルで定義しない。 */
export interface StoreContact {
  readonly storeId: string;
  readonly interiorAreaId: string;
  readonly entrancePortalId: string;
  readonly clerkEventKey: string;
  readonly catalogId: string;
}

export const STORE_CONTACTS: readonly StoreContact[] = [
  { storeId: 'shop-konbini', interiorAreaId: 'shop-konbini-interior', entrancePortalId: 'konbini-enter',
    clerkEventKey: 'shopping.konbini.clerk', catalogId: 'konbini' },
];

export function storeForClerk(areaId: string, eventKey: string): StoreContact | undefined {
  return STORE_CONTACTS.find(store => store.interiorAreaId === areaId && store.clerkEventKey === eventKey);
}
