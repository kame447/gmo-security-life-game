import type { Facing } from '../../core/coords';
import type { RotationRule } from '../furniture/rotation';

/** Store floor decals (shop-floor) span an entire room and are not rotatable. */
export const STORE_FLOOR_REASON = '床の下地のため回せません';

/** Wall-mounted or built-in store fixtures (Type B) allow down, left, and right only. */
export const STORE_WALL_SIDE_REASON = '壁に付ける物なので、奥向きにはできません';

const ALL_DIRECTIONS: readonly Facing[] = Object.freeze(['down', 'left', 'up', 'right']);
const FRONT_AND_SIDE_DIRECTIONS: readonly Facing[] = Object.freeze(['down', 'left', 'right']);
const DOWN_ONLY: readonly Facing[] = Object.freeze(['down']);

export const STORE_ROTATE_ALL_RULE: RotationRule = Object.freeze({
  placement: 'floor',
  directions: ALL_DIRECTIONS,
  reason: '',
});

export const STORE_SIDE_AND_FRONT_RULE: RotationRule = Object.freeze({
  placement: 'floor',
  directions: FRONT_AND_SIDE_DIRECTIONS,
  reason: STORE_WALL_SIDE_REASON,
});

export const STORE_FLOOR_BASE_RULE: RotationRule = Object.freeze({
  placement: 'floor',
  directions: DOWN_ONLY,
  reason: STORE_FLOOR_REASON,
});

/**
 * Rotation rules for Bookstore, Candy Shop, and Pharmacy fixtures (`fixtures-retail.ts`).
 * A kind is added here only after all permitted directional artwork is complete.
 */
export const RETAIL_STORE_ROTATION_ENTRIES: readonly (readonly [string, RotationRule])[] = [];

/**
 * Rotation rules for Bakery, Greengrocer, Cafe, Konbini fixtures and `shop-rug` (`fixtures-food.ts`).
 * Populated as directional artwork in `fixtures-food.ts` is completed.
 */
export const FOOD_STORE_ROTATION_ENTRIES: readonly (readonly [string, RotationRule])[] = [];

const BASE_STORE_ENTRIES: readonly (readonly [string, RotationRule])[] = [
  ['shop-floor', STORE_FLOOR_BASE_RULE],
];

export const STORE_ROTATION_RULES: ReadonlyMap<string, RotationRule> = new Map<string, RotationRule>([
  ...BASE_STORE_ENTRIES,
  ...RETAIL_STORE_ROTATION_ENTRIES,
  ...FOOD_STORE_ROTATION_ENTRIES,
]);

export function storeRotationRule(kind: string): RotationRule | undefined {
  return STORE_ROTATION_RULES.get(kind);
}
