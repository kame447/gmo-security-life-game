/**
 * 保存データの形式と検証。保存先（localStorage など）は app/ 側が持つ。
 * 現在の形式はマップ上の位置と外見のみ。人生の状態（年齢・能力・資産など）は仕様が未決定のため含めない。
 */
import { normalizeAppearance, type PlayerAppearance } from '../core/appearance';
import type { Facing } from '../core/coords';
import { canStand, type PlayerPosition } from '../map/explorer';
import { PHONE_INITIAL_OWNED } from '../phone/config';
import { PHONE_BUDGET_PROTOTYPE, type PhoneBudgetConfig } from '../phone/budget-config';
import { parsePhoneSave, type PhoneSave } from '../phone/model';
import type { World } from '../world';

export interface SaveData {
  v: 1;
  variantId: string;
  areaId: string;
  x: number;
  y: number;
  facing: Facing;
  /** Optional for v1 saves made before appearance customization was added. */
  appearance?: PlayerAppearance;
  /** Optional for v1 saves from before the phone prototype. */
  phone?: PhoneSave;
}

const FACINGS: readonly unknown[] = ['up', 'down', 'left', 'right'];

export function createSave(world: World, player: PlayerPosition, appearance: PlayerAppearance,
  _reservedForAssets?: never, phone?: PhoneSave, config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE): SaveData {
  return { v: 1, variantId: world.variant.id, ...player, appearance: normalizeAppearance(appearance),
    phone: parsePhoneSave(phone, PHONE_INITIAL_OWNED, config) };
}

/** Returns a normalized save, or null when it is corrupt or does not fit this world. */
export function parseSave(raw: unknown, world: World, initialPhoneOwned = PHONE_INITIAL_OWNED,
  config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<SaveData>;
  if (s.v !== 1 || s.variantId !== world.variant.id || typeof s.areaId !== 'string' ||
      typeof s.x !== 'number' || typeof s.y !== 'number' ||
      !Number.isFinite(s.x) || !Number.isFinite(s.y) || !FACINGS.includes(s.facing)) return null;
  const area = world.areas.get(s.areaId);
  if (!area || !canStand(area, s.x, s.y)) return null;
  return { v: 1, variantId: world.variant.id, areaId: s.areaId, x: s.x, y: s.y,
    facing: s.facing as Facing, appearance: normalizeAppearance(s.appearance),
    phone: parsePhoneSave(s.phone, initialPhoneOwned, config) };
}
