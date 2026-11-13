/** ブラウザの localStorage への保存と読込。保存できない環境でも探索は続けられるよう、失敗は握りつぶす。 */
import { parseSave, type SaveData } from '../state/save';
import { PHONE_INITIAL_OWNED } from '../phone/config';
import type { World } from '../world';

const SAVE_KEY = 'slg-map-save-v1';

export function loadSave(world: World, initialPhoneOwned = PHONE_INITIAL_OWNED): SaveData | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? parseSave(JSON.parse(raw), world, initialPhoneOwned) ?? undefined : undefined;
  } catch { return undefined; }
}

export function writeSave(data: SaveData): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }
  catch { /* Exploration remains available when storage is disabled or full. */ }
}
