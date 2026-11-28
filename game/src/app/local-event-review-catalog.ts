import { STORY_STAGES, type StoryCondition } from '../story/config';
import { STORY_EVENTS } from '../story/events';
import { OPTIONAL_STORY_EVENTS } from '../story/optional';

export type LocalEventReviewId = `event-${string}`;
export interface LocalEventReviewScene {
  id: LocalEventReviewId;
  eventId: string;
  title: string;
  group: 'optional' | 'security';
  stageIndex: number;
  areaId: string;
  eventKey?: string;
  afterSeconds: number;
  requiredChoices: Readonly<Record<string, string>>;
}

const STAGE_AREAS = ['school-classroom-interior', 'high-school-interior', 'university-interior', 'office-interior', 'shop-cafe-interior'];
const sceneId = (eventId: string): LocalEventReviewId => `event-${eventId.replace(/^story\./, '').replaceAll('.', '-')}`;

function choicesFor(condition?: StoryCondition): Record<string, string> {
  if (!condition) return {};
  if ('all' in condition) return Object.assign({}, ...condition.all.map(choicesFor));
  if ('any' in condition) return choicesFor(condition.any[0]);
  return { [condition.eventId]: condition.choiceIds[0] };
}

/** Review-only scene preparation. Production timing and branch requirements stay unchanged. */
export const LOCAL_EVENT_REVIEW_SCENES: readonly LocalEventReviewScene[] = [
  ...OPTIONAL_STORY_EVENTS.map(item => ({
    id: sceneId(item.event.id), eventId: item.event.id, title: item.event.title, group: 'optional' as const,
    stageIndex: STORY_STAGES.findIndex(stage => stage.id === item.stageIds[0]), areaId: item.areaId,
    eventKey: item.eventKey, afterSeconds: 0, requiredChoices: {},
  })),
  ...STORY_STAGES.flatMap((stage, stageIndex) => stage.steps.flatMap(step => {
    const event = STORY_EVENTS.find(item => item.id === step.eventId);
    if (event?.category !== 'security' || !event.choices?.length) return [];
    return [{
      id: sceneId(event.id), eventId: event.id, title: event.title, group: 'security' as const, stageIndex,
      areaId: step.trigger.kind === 'place' ? step.trigger.place.areaIds[0]
        : event.id === 'story.univ.free-wifi' ? 'shop-cafe-interior' : STAGE_AREAS[stageIndex],
      afterSeconds: step.trigger.kind === 'anywhere' ? step.trigger.afterSeconds : 0,
      requiredChoices: choicesFor(step.when),
    }];
  })),
];

export function localEventReviewScene(id: string | null): LocalEventReviewScene | undefined {
  return id ? LOCAL_EVENT_REVIEW_SCENES.find(scene => scene.id === id) : undefined;
}

export function localEventReviewUrl(id: LocalEventReviewId): string {
  return `/?${new URLSearchParams({ skipOpening: '1', localReview: id })}`;
}
