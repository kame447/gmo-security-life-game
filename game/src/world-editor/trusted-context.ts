import type { EditorRailLink, EditorValidationContext } from '../editor/types';
import { TRAIN_NETWORK } from '../travel/network';
import { stationGateLinks, type World } from '../world';
import { START_PORTAL_ID } from '../world/landmark-resolve';
import { inside } from '../world/runtime';

/** Trusted rail/gate links applicable to areas present in `world`. */
export function worldRailLinks(world: World): EditorRailLink[] {
  return [...stationGateLinks(world), ...TRAIN_NETWORK.railLinks()].filter(link => {
    const from = world.areas.get(link.from.areaId), to = world.areas.get(link.to.areaId);
    return !!from && !!to && inside(from, link.from.x, link.from.y) && inside(to, link.to.x, link.to.y);
  });
}

/** Only the application's loaded World can supply validation context. */
export function trustedContext(world: World, railLinks?: readonly EditorRailLink[]): EditorValidationContext {
  return {baselineWorld:structuredClone(world),derived:{startPortalId:START_PORTAL_ID,placedNpcEventKeys:true},
    ...(railLinks ? {railLinks:structuredClone(railLinks)} : {})};
}
