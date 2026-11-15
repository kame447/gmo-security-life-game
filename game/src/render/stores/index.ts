import type { ObjectDef } from '../../core/types';
import type { StoreSprite } from './art';
import { foodStoreSprite } from './fixtures-food';
import { retailStoreSprite } from './fixtures-retail';

export { drawShopExterior, type ExteriorHelpers } from './exteriors';
export type { StoreSprite } from './art';
export {
  FOOD_STORE_ROTATION_ENTRIES,
  RETAIL_STORE_ROTATION_ENTRIES,
  STORE_FLOOR_BASE_RULE,
  STORE_FLOOR_REASON,
  STORE_ROTATE_ALL_RULE,
  STORE_ROTATION_RULES,
  STORE_SIDE_AND_FRONT_RULE,
  STORE_WALL_SIDE_REASON,
  storeRotationRule,
} from './rotation';

/** Resolve bespoke store interior pixel-art sprite, or null for non-store objects. */
export function storeFurnishingSprite(o: ObjectDef): StoreSprite | null {
  return foodStoreSprite(o) ?? retailStoreSprite(o);
}
