/**
 * 保存データの形式と検証。保存先（localStorage など）は app/ 側が持つ。
 * v1 の位置・外見・資産・スマホを欄ごとに復旧する。
 */
import { APPEARANCE_FIELDS, normalizeAppearance, type PlayerAppearance } from '../core/appearance';
import type { Facing } from '../core/coords';
import { canStand, positionAt, type PlayerPosition } from '../map/explorer';
import { PHONE_INITIAL_OWNED } from '../phone/config';
import { PHONE_BUDGET_PROTOTYPE, type PhoneBudgetConfig } from '../phone/budget-config';
import { parsePhoneSave, type PhoneSave } from '../phone/save';
import type { World } from '../world';
import { normalizeAssets, type AssetSnapshot } from './assets';
import { checkSaveTree, copySaveJson, saveRecord, type SaveValidationOptions } from './save-json';

export type { SaveValidationOptions } from './save-json';

export interface SaveData {
  /** Extensions are transported as validated JSON and are not gameplay state here. */
  [key: string]: unknown;
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
  /** Kept raw so the life adapter can recover supported fields and protect unreadable versions. */
  life?: unknown;
}

const FACINGS: readonly unknown[] = ['up', 'down', 'left', 'right'];

type FieldShape = { [key: string]: FieldShape | null };
const ASSET_FIELDS: FieldShape = { moneyYen: null, items: null };
// Known optional fields must be removed when their codec omits them (e.g. invalid
// clock metadata). Unknown object members remain opaque JSON, including `life`.
const SAVE_FIELDS: FieldShape = {
  v: null, variantId: null, areaId: null, x: null, y: null, facing: null,
  appearance: Object.fromEntries(APPEARANCE_FIELDS.map(field => [field, null])),
  assets: ASSET_FIELDS,
  phone: { v: null, owned: null,
    dataBudget: { v: null, remainingMb: null, capacityMb: null, savedAtEpochMs: null, activeAtSave: null },
    chat: { v: null, contacts: null, threads: null } },
};

function retainFields(previous: unknown, current: unknown, fields: FieldShape): unknown {
  if (!saveRecord(current)) return current;
  const old = saveRecord(previous) ? previous : {};
  const result: Record<string, unknown> = { ...old, ...current };
  for (const [key, nested] of Object.entries(fields)) {
    delete result[key];
    if (Object.hasOwn(current, key)) result[key] = nested
      ? retainFields(old[key], current[key], nested) : current[key];
  }
  return result;
}

/** Versions of owned codecs cannot be interpreted or overwritten by this build. */
export function hasFutureSaveSection(raw: unknown): boolean {
  if (!saveRecord(raw) || !saveRecord(raw.phone)) return false;
  return [raw.phone, raw.phone.dataBudget, raw.phone.chat]
    .some(value => saveRecord(value) && typeof value.v === 'number' && value.v > 1);
}

/** Merge only extensions; the current snapshot owns all fields this build knows. */
export function preserveSaveExtensions(previous: unknown, current: SaveData,
  options?: SaveValidationOptions): SaveData {
  checkSaveTree(previous, true);
  checkSaveTree(current);
  // Older builds transport layout opaquely; inventory-aware builds normalize its
  // owned fields while still preserving metadata introduced by a newer caller.
  // A life-aware snapshot owns its complete section, including its JSON field
  // position. Older callers that omit life still transport it opaquely.
  const ownedFields = Object.hasOwn(current, 'life') ? { ...SAVE_FIELDS, life: null } : SAVE_FIELDS;
  const fields = saveRecord(current.assets) && Object.hasOwn(current.assets, 'layout')
    ? { ...ownedFields, assets: { ...ASSET_FIELDS,
      layout: { v: null, bag: null, hotbar: null, selectedHotbar: null } } }
    : ownedFields;
  return copySaveJson(retainFields(previous, current, fields), options) as SaveData;
}

export function createSave(world: World, player: PlayerPosition, appearance: PlayerAppearance,
  assets?: AssetSnapshot, phone?: PhoneSave, config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE): SaveData {
  const current: SaveData = { v: 1, variantId: world.variant.id, ...player, appearance: normalizeAppearance(appearance),
    assets: normalizeAssets(assets), phone: parsePhoneSave(phone, PHONE_INITIAL_OWNED, config) };
  return preserveSaveExtensions({ appearance, assets, phone }, current);
}

/** Unsupported envelopes are rejected; damaged position fields reset only the position. */
export function parseSave(raw: unknown, world: World, initialPhoneOwned = PHONE_INITIAL_OWNED,
  config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE, options?: SaveValidationOptions): SaveData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  try { checkSaveTree(raw, true); } catch { return null; }
  const s = raw as Partial<SaveData>;
  if (s.v !== 1 || s.variantId !== world.variant.id || hasFutureSaveSection(raw)) return null;
  const area = typeof s.areaId === 'string' ? world.areas.get(s.areaId) : undefined;
  const player: PlayerPosition = area && typeof s.x === 'number' && typeof s.y === 'number' &&
    Number.isFinite(s.x) && Number.isFinite(s.y) && FACINGS.includes(s.facing) && canStand(area, s.x, s.y)
    ? { areaId: area.def.id, x: s.x, y: s.y, facing: s.facing as Facing }
    : positionAt(world.start);
  const current: SaveData = { v: 1, variantId: world.variant.id, ...player,
    appearance: normalizeAppearance(s.appearance), assets: normalizeAssets(s.assets),
    phone: parsePhoneSave(s.phone, initialPhoneOwned, config) };
  try { return preserveSaveExtensions(raw, current, options); } catch { return null; }
}
