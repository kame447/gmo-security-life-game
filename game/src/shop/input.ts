/** DOM 非依存の買い物キー判定。パネルが前面のときだけ controller から呼ぶ。 */
import { ACTION_KEYS, DIRECTION_KEYS } from '../input/controls';
import type { ShopFlow } from './flow';

export function handleShopKey(flow: ShopFlow, code: string, repeat: boolean): boolean {
  const dir = DIRECTION_KEYS[code];
  if (!dir && !ACTION_KEYS.has(code) && code !== 'Escape') return false;
  if (repeat) return true;
  if (dir) flow.move(dir === 'up' || dir === 'left' ? -1 : 1);
  else if (code === 'Escape') flow.back();
  else flow.primaryAction();
  return true;
}
