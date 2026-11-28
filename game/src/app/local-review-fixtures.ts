import { DEFAULT_APPEARANCE } from '../core/appearance';
import type { SpawnPoint } from '../core/types';
import { canStand, positionAt } from '../map/explorer';
import { createSave, type SaveData } from '../state/save';
import { STORY_ERRANDS, STORY_STAGES } from '../story/config';
import { STORY_EVENTS } from '../story/events';
import { newStoryState, type StorySave } from '../story/state';
import type { World } from '../world';
import { LocalSaveStore, SAVE_KEY, type SaveStorage } from './local-save';
import { localEventReviewScene, type LocalEventReviewId, type LocalEventReviewScene } from './local-event-review-catalog';

export const REVIEW_SCENES = {
  'junior-high': { title: '中学校の昼休み', areaId: 'school-classroom-interior', x: 8, y: 10, stageIndex: 0 },
  'high-school': { title: '高校の放課後', areaId: 'high-school-interior', x: 9, y: 12, stageIndex: 1 },
  university: { title: '大学の交流室', areaId: 'university-interior', x: 11, y: 14, stageIndex: 2 },
  office: { title: '会社の休憩時間', areaId: 'office-interior', x: 10, y: 12, stageIndex: 3 },
  cafe: { title: '喫茶店で昔の友達と', areaId: 'shop-cafe-interior', x: 8, y: 12, stageIndex: 4 },
  ending: { title: '人生の振り返り', areaId: 'home-family-2f', x: 3, y: 2, stageIndex: 4 },
  mail: { title: 'メールとWebの往復', areaId: 'home-family-2f', x: 3, y: 2, stageIndex: 0 },
  save: { title: '保存と復元', areaId: 'home-family-2f', x: 3, y: 2, stageIndex: 0 },
} as const;
export type ReviewSceneId = keyof typeof REVIEW_SCENES | LocalEventReviewId;

export const isReviewScene = (id: string): id is ReviewSceneId => Object.hasOwn(REVIEW_SCENES, id) || !!localEventReviewScene(id);

export function reviewSaveKey(id: ReviewSceneId | 'intro'): string { return `${SAVE_KEY}.review.${id}`; }

/** Review-only sample choices; no claim that the user has played these events. */
function endingChoices(): Record<string, string> {
  const selected: Record<string, string> = {
    'story.bike-purchase': 'site-a', 'story.jh.club': 'culture',
    'story.hs.festival': 'cafe', 'story.hs.photo': 'public',
    'story.univ.thesis': 'deep', 'story.work.usb': 'report',
    'story.work.partner': 'marry', 'story.later.grandchild': 'safety',
  };
  return Object.fromEntries(Object.entries(selected).filter(([eventId, choiceId]) =>
    STORY_EVENTS.some(event => event.id === eventId && event.choices?.some(choice => choice.id === choiceId))));
}

export function createReviewSave(world: World, id: ReviewSceneId): SaveData {
  const eventScene = localEventReviewScene(id);
  if (eventScene) return createEventReviewSave(world, eventScene);
  const scene = REVIEW_SCENES[id as keyof typeof REVIEW_SCENES];
  if (!scene) throw new Error(`Unknown review scene: ${id}`);
  const point: SpawnPoint = { areaId: scene.areaId, x: scene.x, y: scene.y, facing: 'up' };
  if (!world.areas.has(point.areaId)) throw new Error(`Review area unavailable: ${point.areaId}`);
  const state: StorySave = {
    ...newStoryState(), phase: id === 'ending' ? 'finished' : 'milestone',
    stageIndex: scene.stageIndex, bikeChoice: 'site-a',
    errandsDone: STORY_ERRANDS.map(errand => errand.id),
    stepsDone: STORY_STAGES[scene.stageIndex].steps.map(step => step.eventId),
    choices: id === 'ending' ? endingChoices() : {},
  };
  const data = createSave(world, positionAt(point), DEFAULT_APPEARANCE,
    { moneyYen: id === 'ending' ? 2_340_000 : 12_000, items: [] });
  data.story = state;
  if (id === 'mail' && data.phone) {
    data.phone.mail = { v: 1, pending: [], messages: [{
      id: 'local-review-library', from: 'まちの図書館', fromAddress: 'info@town-library.example', to: '',
      subject: 'おはなし会のご案内', body: '土曜日のおはなし会について、詳しい案内をお送りします。',
      links: [{ label: '図書館のおはなし会を見る', href: 'https://town-library.example/events' }],
      atMs: 0, read: false,
    }] };
  }
  return data;
}

function eventReviewPoint(world: World, scene: LocalEventReviewScene): SpawnPoint {
  const area = world.areas.get(scene.areaId);
  if (!area) throw new Error(`Review area unavailable: ${scene.areaId}`);
  const actor = scene.eventKey && area.interactions.find(item => item.eventKey === scene.eventKey);
  const center = actor || { x: Math.floor(area.width / 2), y: Math.floor(area.height * .65) };
  const candidates: SpawnPoint[] = [];
  for (let y = 1; y < area.height - 1; y++) for (let x = 1; x < area.width - 1; x++) {
    const point: SpawnPoint = { areaId: scene.areaId, x, y,
      facing: Math.abs(center.x - x) > Math.abs(center.y - y) ? (center.x > x ? 'right' : 'left') : (center.y > y ? 'down' : 'up') };
    const position = positionAt(point);
    if (canStand(area, position.x, position.y) && !area.portalAt.has(y * area.width + x)) candidates.push(point);
  }
  candidates.sort((a, b) => (Math.abs(a.x - center.x) + Math.abs(a.y - center.y)) - (Math.abs(b.x - center.x) + Math.abs(b.y - center.y)));
  if (!candidates[0]) throw new Error(`No review position: ${scene.areaId}`);
  return candidates[0];
}

function createEventReviewSave(world: World, scene: LocalEventReviewScene): SaveData {
  const data = createSave(world, positionAt(eventReviewPoint(world, scene)), DEFAULT_APPEARANCE, { moneyYen: 120_000, items: [] });
  data.story = {
    ...newStoryState(), phase: scene.group === 'optional' ? 'milestone' : 'stage',
    stageIndex: scene.stageIndex, bikeChoice: 'site-a', errandsDone: STORY_ERRANDS.map(errand => errand.id),
    stepsDone: STORY_STAGES[scene.stageIndex].steps.filter(step => step.eventId !== scene.eventId).map(step => step.eventId),
    stepElapsed: scene.afterSeconds, choices: { ...scene.requiredChoices },
  } satisfies StorySave;
  return data;
}

export type ReviewSeedResult = 'not-requested' | 'existing' | 'created' | 'blocked';

/** Seed only an empty, named review slot on a loopback host; ordinary saves are never read or written. */
export function seedLocalReview(world: World, search = location.search,
  options: { hostname?: string; storage?: () => SaveStorage } = {}): ReviewSeedResult {
  const hostname = options.hostname ?? location.hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) return 'not-requested';
  const requested = new URLSearchParams(search).get('localReview');
  if (!requested || !isReviewScene(requested)) return 'not-requested';
  const id = requested as ReviewSceneId;
  const store = new LocalSaveStore(reviewSaveKey(id), options.storage);
  const current = store.inspect(world);
  if (current.kind !== 'empty') return current.kind === 'valid' ? 'existing' : 'blocked';
  try { return store.save(createReviewSave(world, id)).ok ? 'created' : 'blocked'; }
  catch { return 'blocked'; }
}
