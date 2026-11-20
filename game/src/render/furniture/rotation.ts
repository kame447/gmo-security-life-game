import type { Facing } from '../../core/coords';
import type { ObjectDef } from '../../core/types';
import { effectiveObjectFacing, STORE_ROTATION_RULES } from '../stores/rotation';
import { furnitureById, furnitureVariant, nextFacing } from './catalog';

export const FOUR_DIRECTIONS: readonly Facing[] = Object.freeze(['down', 'left', 'up', 'right']);
export const WALL_ROTATION_REASON = '壁に掛ける物は奥の壁向きだけのため回せません';
export const UNKNOWN_ROTATION_REASON = 'この家具の回転用の絵は、まだカタログにありません';

export type ObjectPlacement = 'floor' | 'rug' | 'wall';

export interface RotationRule {
  readonly placement: ObjectPlacement;
  readonly directions: readonly Facing[];
  readonly reason: string;
}

const WALL_RULE: RotationRule = Object.freeze({
  placement: 'wall',
  directions: Object.freeze(['down'] as Facing[]),
  reason: WALL_ROTATION_REASON,
});

const RUG_RULE: RotationRule = Object.freeze({
  placement: 'rug',
  directions: Object.freeze(['down', 'left'] as Facing[]),
  reason: '',
});

/** 階段は上下階の出入口と重なるため、向きを固定する。 */
const STAIRS_RULE: RotationRule = Object.freeze({
  placement: 'floor',
  directions: Object.freeze(['down'] as Facing[]),
  reason: '階段は出入口と重なるため回せません',
});

const FLOOR_RULE: RotationRule = Object.freeze({
  placement: 'floor',
  directions: FOUR_DIRECTIONS,
  reason: '',
});

/** Kind-keyed rotation contract shared with legacy rooms and upcoming store fixtures. */
export const LEGACY_ROTATION_RULES: ReadonlyMap<string, RotationRule> = new Map<string, RotationRule>([
  ['tdesk', FLOOR_RULE],
  ['sdesk', FLOOR_RULE],
  ['shelf', FLOOR_RULE],
  ['shopshelf', FLOOR_RULE],
  ['cooler', FLOOR_RULE],
  ['magazine', FLOOR_RULE],
  ['counter', FLOOR_RULE],
  ['bench', FLOOR_RULE],
  ['bed', FLOOR_RULE],
  ['desk', FLOOR_RULE],
  ['lowtable', FLOOR_RULE],
  ['table', FLOOR_RULE],
  ['bookshelf', FLOOR_RULE],
  ['sofa', FLOOR_RULE],
  ['tv', FLOOR_RULE],
  ['kitchen', FLOOR_RULE],
  ['kitchen-sink', FLOOR_RULE],
  ['kitchen-stove', FLOOR_RULE],
  ['cabinet-low', FLOOR_RULE],
  ['fridge', FLOOR_RULE],
  ['toybox', FLOOR_RULE],
  ['plant', FLOOR_RULE],
  ['chair-wood', FLOOR_RULE],
  ['sofa-2seat', FLOOR_RULE],
  ['table-dining', FLOOR_RULE],
  ['table-low', FLOOR_RULE],
  ['desk-study', FLOOR_RULE],
  ['bed-single', FLOOR_RULE],
  ['bookshelf-tall', FLOOR_RULE],
  ['tv-stand', FLOOR_RULE],
  ['plant-tall', FLOOR_RULE],
  ['rug', RUG_RULE],
  ['rug-large', RUG_RULE],
  ['blackboard', WALL_RULE],
  ['window', WALL_RULE],
  ['window-wall', WALL_RULE],
  ['stairs', STAIRS_RULE],
]);

export const isSidewaysFacing = (facing?: Facing): boolean => facing === 'left' || facing === 'right';

export function uprightDimensions(object: Pick<ObjectDef, 'facing' | 'w' | 'h'>): { w: number; h: number } {
  return isSidewaysFacing(object.facing) ? { w: object.h, h: object.w } : { w: object.w, h: object.h };
}

export function rotatedDimensions(object: Pick<ObjectDef, 'facing' | 'w' | 'h'>, target: Facing): { w: number; h: number } {
  const base = uprightDimensions(object);
  return isSidewaysFacing(target) ? { w: base.h, h: base.w } : base;
}

export function objectRotationRule(object: Pick<ObjectDef, 'catalogId' | 'kind'>): RotationRule | undefined {
  if (object.catalogId) {
    const entry = furnitureById(object.catalogId);
    if (!entry) return undefined;
    const directions = entry.variants.map(variant => variant.facing);
    if (entry.placement === 'wall') return { placement: 'wall', directions, reason: WALL_ROTATION_REASON };
    if (directions.length <= 1) return { placement: entry.placement, directions, reason: 'この家具は向きを変えられません' };
    return { placement: entry.placement, directions, reason: '' };
  }
  return LEGACY_ROTATION_RULES.get(object.kind) ?? STORE_ROTATION_RULES.get(object.kind);
}

export function objectRotationReason(object: Pick<ObjectDef, 'catalogId' | 'kind'>): string {
  const rule = objectRotationRule(object);
  if (!rule) return UNKNOWN_ROTATION_REASON;
  return rule.directions.length <= 1 ? rule.reason : '';
}

export function objectRotationTargetReason(object: Pick<ObjectDef, 'catalogId' | 'kind'>, target: Facing): string {
  const rule = objectRotationRule(object);
  if (!rule) return UNKNOWN_ROTATION_REASON;
  if (rule.directions.length <= 1) return rule.reason;
  return rule.directions.includes(target) ? '' : (rule.reason || 'この家具は指定された向きに回せません');
}

/** UI restriction notice covering both non-rotatable items and partial-direction rules like Type B. */
export function objectRotationRestrictionReason(object: Pick<ObjectDef, 'catalogId' | 'kind'>): string {
  const fixedReason = objectRotationReason(object);
  if (fixedReason) return fixedReason;
  const rule = objectRotationRule(object);
  if (!rule || rule.directions.length <= 1 || !rule.reason) return '';
  const blocked = FOUR_DIRECTIONS.find(facing => !rule.directions.includes(facing));
  return blocked ? objectRotationTargetReason(object, blocked) : '';
}

export function canRotateObject(object: Pick<ObjectDef, 'catalogId' | 'kind'>): boolean {
  return objectRotationReason(object) === '';
}

export function rotatedObjectVariant(
  object: Pick<ObjectDef, 'catalogId' | 'kind' | 'facing' | 'style' | 'w' | 'h'>,
): { facing: Facing; w: number; h: number } {
  const rule = objectRotationRule(object);
  if (!rule) throw new Error(UNKNOWN_ROTATION_REASON);
  if (rule.directions.length <= 1) throw new Error(rule.reason);
  if (object.catalogId) {
    const facing = nextFacing(object.catalogId, object.facing);
    const variant = furnitureVariant(object.catalogId, facing)!;
    return { facing: variant.facing, w: variant.w, h: variant.h };
  }
  const current = effectiveObjectFacing(object);
  const index = rule.directions.indexOf(current);
  const facing = rule.directions[(index >= 0 ? index + 1 : 1) % rule.directions.length];
  return { facing, ...rotatedDimensions(object, facing) };
}
