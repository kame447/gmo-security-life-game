/**
 * 保存データの形式と検証。保存先（localStorage など）は app/ 側が持つ。
 * v1 の位置・外見・資産・スマホを欄ごとに復旧する。
 */
import { normalizeAppearance, type PlayerAppearance } from '../core/appearance';
import type { Facing } from '../core/coords';
import { canStand, positionAt, type PlayerPosition } from '../map/explorer';
import { PHONE_INITIAL_OWNED } from '../phone/config';
import { PHONE_BUDGET_PROTOTYPE, type PhoneBudgetConfig } from '../phone/budget-config';
import { parsePhoneSave, type PhoneSave } from '../phone/save';
import type { World } from '../world';
import { normalizeAssets, type AssetSnapshot } from './assets';

export interface SaveData {
  v: 1;
  variantId: string;
  areaId: string;
  x: number;
  y: number;
  facing: Facing;
  /** Optional for v1 saves made before appearance customization was added. */
  appearance?: PlayerAppearance;
  /** Optional for v1 saves made before money/inventory was added. */
  assets?: AssetSnapshot;
  /** Optional for saves from before the phone prototype. */
  phone?: PhoneSave;
}

const FACINGS: readonly unknown[] = ['up', 'down', 'left', 'right'];

export function createSave(world: World, player: PlayerPosition, appearance: PlayerAppearance,
  assets?: AssetSnapshot, phone?: PhoneSave, config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE): SaveData {
  return { v: 1, variantId: world.variant.id, ...player, appearance: normalizeAppearance(appearance),
    assets: normalizeAssets(assets), phone: parsePhoneSave(phone, PHONE_INITIAL_OWNED, config) };
}

/** Unsupported envelopes are rejected; damaged position fields reset only the position. */
export function parseSave(raw: unknown, world: World, initialPhoneOwned = PHONE_INITIAL_OWNED,
  config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE): SaveData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Partial<SaveData>;
  if (s.v !== 1 || s.variantId !== world.variant.id) return null;
  const area = typeof s.areaId === 'string' ? world.areas.get(s.areaId) : undefined;
  const player: PlayerPosition = area && typeof s.x === 'number' && typeof s.y === 'number' &&
    Number.isFinite(s.x) && Number.isFinite(s.y) && FACINGS.includes(s.facing) && canStand(area, s.x, s.y)
    ? { areaId: area.def.id, x: s.x, y: s.y, facing: s.facing as Facing }
    : positionAt(world.start);
  return { v: 1, variantId: world.variant.id, ...player,
    appearance: normalizeAppearance(s.appearance), assets: normalizeAssets(s.assets),
    phone: parsePhoneSave(s.phone, initialPhoneOwned, config) };
}
