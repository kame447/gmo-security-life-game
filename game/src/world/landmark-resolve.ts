import type { AreaDef } from '../core/types';
import { LANDMARKS } from './landmarks';

/** ゲームの開始位置と、エディタのderived.startPortalIdで共有する出口。 */
export const START_PORTAL_ID = 'home-exit';

const DOOR_FRONT_EXITS = {
  homeFront: START_PORTAL_ID,
  schoolDoorFront: 'school-exit',
  konbiniDoorFront: 'konbini-exit',
} as const;

/** 配置適用後の出口の戻り先を使う。生成用の定数と固定の目印は変えない。 */
export function resolveLandmarks(areas: readonly AreaDef[]): typeof LANDMARKS {
  const resolved = structuredClone(LANDMARKS);
  const portals = areas.flatMap(area => area.portals);
  for (const name of Object.keys(DOOR_FRONT_EXITS) as (keyof typeof DOOR_FRONT_EXITS)[]) {
    const portalId = DOOR_FRONT_EXITS[name];
    const exit = portals.find(portal => portal.id === portalId);
    if (!exit) throw new Error(`Missing landmark exit: ${portalId}`);
    resolved[name] = { x: exit.to.x, y: exit.to.y };
  }
  return resolved;
}
