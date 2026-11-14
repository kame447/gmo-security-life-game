import type { EditorRailLink, EditorValidationContext } from '../editor/types';
import type { World } from '../world/runtime';
import { START_PORTAL_ID } from '../world/landmark-resolve';

/** Only the application's loaded World can supply validation context. */
export function trustedContext(world: World, railLinks?: readonly EditorRailLink[]): EditorValidationContext {
  return {baselineWorld:structuredClone(world),derived:{startPortalId:START_PORTAL_ID,placedNpcEventKeys:true},
    ...(railLinks ? {railLinks:structuredClone(railLinks)} : {})};
}
