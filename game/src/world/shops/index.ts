import type { AreaDef, PortalDef } from '../../core/types';
import { T } from '../tiles';
import { SHOP_INTERIORS, type ShopInteriorDefinition } from './definitions';

export { SHOP_INTERIORS, type ShopInteriorDefinition } from './definitions';

/** town.tsの担当者が既存ポータルへ追加する入口。座標は既存の6店舗のドア。 */
export const SHOP_ENTRANCES: readonly PortalDef[] = SHOP_INTERIORS.map(shop => ({
  id: `${shop.id}-enter`, facilityId: `shop-${shop.id}`, from: { ...shop.outdoorDoor },
  to: { areaId: `shop-${shop.id}-interior`, x: shop.doorX, y: shop.height - 2, facing: 'up' },
}));

/** 宣言データから毎回独立した定義を作り、編集や年代差分が別セッションへ漏れないようにする。 */
export function createShopInterior(shop: ShopInteriorDefinition): AreaDef {
  const { width, height } = shop, id = `shop-${shop.id}-interior`;
  const ground = new Uint8Array(width * height).fill(shop.floor);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x === 0 || x === width - 1 || y === height - 1) ground[y * width + x] = T.WALL_TOP;
    if (y === 0) ground[y * width + x] = T.WALL;
  }
  ground[(height - 1) * width + shop.doorX] = T.MAT;
  ground[(height - 1) * width + shop.doorX + 1] = T.MAT;

  return {
    id, name: shop.name, kind: 'indoor', width, height, ground,
    objects: shop.furnishings.map(item => ({
      id: `${id}-${item.id}`, kind: item.kind, x: item.x, y: item.y, w: item.w, h: item.h,
      solid: item.solid ?? true, layer: item.solid === false ? 'decal' : 'sorted',
    })),
    interactions: [
      { id: `${shop.id}-indoor-clerk`, kind: 'npc', name: shop.clerk.name,
        x: shop.clerk.x, y: shop.clerk.y, sprite: shop.clerk.sprite, facing: 'down', solid: true,
        eventKey: `shopping.${shop.id}.clerk`, lines: [shop.clerk.line] },
      ...shop.furnishings.flatMap(item => item.name && item.line ? [{
        id: `${id}-${item.id}-inspect`, kind: 'object' as const, name: item.name,
        x: item.x, y: item.y, w: item.w, h: item.h, solid: item.solid ?? true,
        eventKey: `shopping.${shop.id}.${item.id}`, lines: [item.line],
      }] : []),
    ],
    portals: [{ id: `${shop.id}-exit`, facilityId: `shop-${shop.id}`,
      from: { x: shop.doorX, y: height - 1, w: 2 },
      to: { areaId: 'town-main', x: shop.outdoorDoor.x, y: shop.outdoorDoor.y + 1, facing: 'down' } }],
  };
}

/** world/index.tsの担当者がAREA_FACTORIESへ追加する6店。コンビニは既存定義のまま。 */
export const SHOP_AREA_FACTORIES: readonly (() => AreaDef)[] = SHOP_INTERIORS.map(shop => () => createShopInterior(shop));
