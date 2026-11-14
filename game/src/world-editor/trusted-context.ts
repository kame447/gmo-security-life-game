import type { EditorValidationContext } from '../editor/types';
import type { World } from '../world/runtime';

/** Only the application's loaded World can supply validation context. */
export function trustedContext(world: World): EditorValidationContext {
  return {baselineWorld:structuredClone(world),derived:{startPortalId:'home-exit',placedNpcEventKeys:true}};
}
