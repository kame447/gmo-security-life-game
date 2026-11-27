import type { MinimapGoals, MinimapTarget } from '../minimap/goals';
import { STORY_BED_KEY, STORY_ERRANDS, STORY_HOME_FACILITY, STORY_MOTHER_KEY } from './config';
import type { StoryDirector } from './director';

/** 進行側の施設IDを保ち、地図に表示する相手・場所の情報だけを補う。 */
export function storyMapGoals(story: StoryDirector | undefined): MinimapGoals | undefined {
  if (!story) return undefined;
  const goals = story.mapGoals();
  const errands: MinimapTarget[] = STORY_ERRANDS.map(errand => ({ id: errand.facilityId, eventKey: errand.eventKey }));
  if (story.phase === 'meet-mother') {
    return { pending: [STORY_HOME_FACILITY], done: [], targets: [{ id: STORY_HOME_FACILITY, eventKey: STORY_MOTHER_KEY }] };
  }
  if (!goals) return undefined;
  if (story.phase === 'errands') return { ...goals, targets: errands };
  if (story.phase === 'return-home') {
    return { ...goals, targets: [{ id: STORY_HOME_FACILITY, eventKey: STORY_MOTHER_KEY }, ...errands] };
  }
  if (story.phase === 'milestone') return { ...goals, targets: [{ id: STORY_HOME_FACILITY, eventKey: STORY_BED_KEY }] };
  const step = story.currentStep;
  if (step?.trigger.kind === 'place' && step.trigger.place.facilityId) {
    return { ...goals, targets: [{ id: step.trigger.place.facilityId, areaIds: step.trigger.place.areaIds }] };
  }
  return goals;
}
