import type { Facing } from '../../core/coords';
import type { ObjectDef } from '../../core/types';
import type { RotationRule } from '../furniture/rotation';

const VALID_FACINGS: ReadonlySet<string> = new Set<Facing>(['down', 'left', 'up', 'right']);

function isFacingValue(value: string | undefined): value is Facing {
  return value !== undefined && VALID_FACINGS.has(value);
}

/**
 * Resolve the effective facing of an object: explicit `facing` takes precedence,
 * legacy `cafe-chair` layouts fall back to directional `style`, otherwise `'down'`.
 */
export function effectiveObjectFacing(
  object: Pick<ObjectDef, 'kind' | 'facing' | 'style'>,
): Facing {
  if (isFacingValue(object.facing)) return object.facing;
  if (object.kind === 'cafe-chair' && isFacingValue(object.style)) {
    return object.style;
  }
  return 'down';
}

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

const RUG_DIRECTIONS: readonly Facing[] = Object.freeze(['down', 'left']);

export const STORE_RUG_RULE: RotationRule = Object.freeze({
  placement: 'rug',
  directions: RUG_DIRECTIONS,
  reason: '',
});

/**
 * Rotation rules for Bookstore, Candy Shop, and Pharmacy fixtures (`fixtures-retail.ts`).
 * A kind is added here only after all permitted directional artwork is complete.
 */
export const RETAIL_STORE_ROTATION_ENTRIES: readonly (readonly [string, RotationRule])[] = [
  // Bookstore
  ['bookstore-counter', STORE_ROTATE_ALL_RULE],
  ['bookstore-tall-shelf', STORE_ROTATE_ALL_RULE],
  ['bookstore-picture-shelf', STORE_ROTATE_ALL_RULE],
  ['bookstore-flat-table', STORE_ROTATE_ALL_RULE],
  ['bookstore-magazine-rack', STORE_ROTATE_ALL_RULE],
  // Candy shop
  ['candy-counter', STORE_ROTATE_ALL_RULE],
  ['candy-box-rack', STORE_ROTATE_ALL_RULE],
  ['candy-jar-stand', STORE_ROTATE_ALL_RULE],
  ['candy-hanging-rack', STORE_SIDE_AND_FRONT_RULE],
  ['candy-low-bins', STORE_ROTATE_ALL_RULE],
  ['candy-bench', STORE_ROTATE_ALL_RULE],
  // Pharmacy
  ['pharmacy-counter', STORE_ROTATE_ALL_RULE],
  ['pharmacy-med-shelf', STORE_ROTATE_ALL_RULE],
  ['pharmacy-care-shelf', STORE_ROTATE_ALL_RULE],
  ['pharmacy-low-care', STORE_ROTATE_ALL_RULE],
  ['pharmacy-daily-shelf', STORE_ROTATE_ALL_RULE],
  ['pharmacy-bench', STORE_ROTATE_ALL_RULE],
];

/**
 * Rotation rules for Bakery, Greengrocer, Cafe, Konbini fixtures and `shop-rug` (`fixtures-food.ts`).
 * Populated as directional artwork in `fixtures-food.ts` is completed.
 */
export const FOOD_STORE_ROTATION_ENTRIES: readonly (readonly [string, RotationRule])[] = [
  ['shop-rug', STORE_RUG_RULE],
  // Bakery
  ['bakery-oven', STORE_SIDE_AND_FRONT_RULE],
  ['bakery-bread-rack', STORE_ROTATE_ALL_RULE],
  ['bakery-pastry-table', STORE_ROTATE_ALL_RULE],
  ['bakery-showcase', STORE_ROTATE_ALL_RULE],
  ['bakery-tray-stand', STORE_ROTATE_ALL_RULE],
  ['bakery-counter', STORE_ROTATE_ALL_RULE],
  // Greengrocer
  ['greengrocer-produce-stand', STORE_ROTATE_ALL_RULE],
  ['greengrocer-fruit-table', STORE_ROTATE_ALL_RULE],
  ['greengrocer-basket-rack', STORE_ROTATE_ALL_RULE],
  ['greengrocer-chill-case', STORE_ROTATE_ALL_RULE],
  ['greengrocer-counter', STORE_ROTATE_ALL_RULE],
  // Cafe
  ['cafe-brew-bar', STORE_ROTATE_ALL_RULE],
  ['cafe-cake-case', STORE_ROTATE_ALL_RULE],
  ['cafe-counter', STORE_ROTATE_ALL_RULE],
  ['cafe-table', STORE_ROTATE_ALL_RULE],
  ['cafe-chair', STORE_ROTATE_ALL_RULE],
  ['cafe-sofa', STORE_ROTATE_ALL_RULE],
  ['cafe-menu-board', STORE_ROTATE_ALL_RULE],
  ['cafe-plant', STORE_ROTATE_ALL_RULE],
  // Konbini
  ['konbini-cooler', STORE_ROTATE_ALL_RULE],
  ['konbini-magazine', STORE_ROTATE_ALL_RULE],
  ['konbini-snack-shelf', STORE_ROTATE_ALL_RULE],
  ['konbini-food-shelf', STORE_ROTATE_ALL_RULE],
  ['konbini-daily-shelf', STORE_ROTATE_ALL_RULE],
  ['konbini-ice-freezer', STORE_ROTATE_ALL_RULE],
  ['konbini-counter', STORE_ROTATE_ALL_RULE],
];

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
