import type { ObjectDef } from '../../core/types';
import type { StoreSprite } from './art';
import { foodStoreSprite } from './fixtures-food';
import { retailStoreSprite } from './fixtures-retail';

export { drawShopExterior, type ExteriorHelpers } from './exteriors';
export type { StoreSprite } from './art';

/** Resolve bespoke store interior pixel-art sprite, or null for non-store objects. */
export function storeFurnishingSprite(o: ObjectDef): StoreSprite | null {
  return foodStoreSprite(o) ?? retailStoreSprite(o);
}
