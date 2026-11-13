/** b219414の現状棚卸し。新店舗のID/名前/室内対応を決めるデータではない。 */
export const STORE_INVENTORY = [
  { objectId: 'town-shop-30-47', style: 'greengrocer', facilityId: 'shop-greengrocer', name: 'やおや', status: 'interior-pending' },
  { objectId: 'town-shop-37-47', style: 'bookstore', facilityId: 'shop-bookstore', name: 'ほんや', status: 'interior-pending' },
  { objectId: 'town-shop-44-47', style: 'candy', facilityId: 'shop-candy', name: 'だがしや', status: 'interior-pending' },
  { objectId: 'town-shop-51-47', style: 'konbini', facilityId: 'shop-konbini', name: 'コンビニ', status: 'connected' },
  { objectId: 'town-shop-58-47', style: 'bakery', facilityId: 'shop-bakery', name: 'パンや', status: 'interior-pending' },
  { objectId: 'town-shop-65-47', style: 'cafe', facilityId: 'shop-cafe', name: 'きっさてん', status: 'interior-pending' },
  { objectId: 'town-shop-72-47', style: 'pharmacy', facilityId: 'shop-pharmacy', name: 'くすりや', status: 'interior-pending' },
  // 施設や表示名を持たないcafe外観。既存のshop-cafeと同一店舗だとは扱わない。
  { objectId: 'town-shop-60-59', style: 'cafe', facilityId: undefined, name: undefined, status: 'interior-pending' },
] as const;
