import type { EditorRailLink, EditorValidationContext } from '../editor/types';
import type { World } from '../world/runtime';

/** Only the application's loaded World can supply validation context. */
export function trustedContext(world: World, railLinks?: readonly EditorRailLink[]): EditorValidationContext {
  return {baselineWorld:structuredClone(world),derived:{startPortalId:'home-exit',placedNpcEventKeys:true},
    ...(railLinks ? {railLinks:structuredClone(railLinks)} : {})};
}
