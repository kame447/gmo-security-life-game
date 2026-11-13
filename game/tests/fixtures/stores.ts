import { buildWorld, type World } from '../../src/world';
import { toRuntime } from '../../src/world/runtime';
import { SHOP_AREA_FACTORIES, SHOP_ENTRANCES } from '../../src/world/shops';

/** #33の7店対応予定。施設未紐付けの外観は独立して未対応のまま残す。 */
export const STORE_INVENTORY = [
  { objectId: 'town-shop-30-47', style: 'greengrocer', facilityId: 'shop-greengrocer', name: 'やおや', status: 'connected' },
  { objectId: 'town-shop-37-47', style: 'bookstore', facilityId: 'shop-bookstore', name: 'ほんや', status: 'connected' },
  { objectId: 'town-shop-44-47', style: 'candy', facilityId: 'shop-candy', name: 'だがしや', status: 'connected' },
  { objectId: 'town-shop-51-47', style: 'konbini', facilityId: 'shop-konbini', name: 'コンビニ', status: 'connected' },
  { objectId: 'town-shop-58-47', style: 'bakery', facilityId: 'shop-bakery', name: 'パンや', status: 'connected' },
  { objectId: 'town-shop-65-47', style: 'cafe', facilityId: 'shop-cafe', name: 'きっさてん', status: 'connected' },
  { objectId: 'town-shop-72-47', style: 'pharmacy', facilityId: 'shop-pharmacy', name: 'くすりや', status: 'connected' },
  // 施設や表示名を持たないcafe外観。既存のshop-cafeと同一店舗だとは扱わない。
  { objectId: 'town-shop-60-59', style: 'cafe', facilityId: undefined, name: undefined, status: 'interior-pending' },
] as const;

/**
 * 単独のモジュール枝では公開された入口/factoryを組み合わせる単体テスト用World。
 * 通常ワールドへの登録が1件でも存在すれば実Worldをそのまま検査し、部分的な結線を補修しない。
 * 実ブラウザE2Eはこのfixtureを使わず、Coralの結線枝のbuildWorldを直接検査する。
 */
export function buildStoreFixtureWorld(): World {
  const world = buildWorld(), town = world.areas.get('town-main')!;
  const definitions = SHOP_AREA_FACTORIES.map(create => create());
  if (definitions.some(def => world.areas.has(def.id)) ||
      town.def.portals.some(portal => SHOP_ENTRANCES.some(entry => entry.id === portal.id))) return world;
  world.areas.set(town.def.id, toRuntime({ ...town.def, portals: [...town.def.portals, ...SHOP_ENTRANCES] }));
  for (const def of definitions) world.areas.set(def.id, toRuntime(def));
  for (const portal of SHOP_ENTRANCES) world.facilities.get(portal.facilityId!)!.interior = 'full';
  return world;
}
