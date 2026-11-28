import type { Game } from '../session/game';
import type { StoryDirector } from '../story/director';
import { STORY_STAGES } from '../story/config';
import { LocalSaveStore, saveFailureMessage } from './local-save';
import { reviewSaveKey } from './local-review-fixtures';
import { LOCAL_EVENT_REVIEW_SCENES, localEventReviewScene, localEventReviewUrl, type LocalEventReviewScene } from './local-event-review-catalog';
import './local-event-review.css';

/** Starts the regular event flow without walking, advancing the clock, or skipping the introduction. */
export function beginLocalEventReview(game: Game, story: StoryDirector, scene: LocalEventReviewScene): boolean {
  if (Object.hasOwn(story.choices, scene.eventId) || game.dialog) return false;
  if (scene.group === 'optional') {
    const actor = game.area.interactions.find(item => item.eventKey === scene.eventKey);
    if (!actor || !scene.eventKey) return false;
    const begun = story.onMapEvent({ type: 'interact', areaId: scene.areaId, interactionId: actor.id, eventKey: scene.eventKey });
    return !!begun && game.say(begun.speaker ?? actor.name, begun.lines);
  }
  if (story.currentStep?.eventId !== scene.eventId) return false;
  story.tick(0, true);
  return !!game.dialog;
}

/** The bar lives outside #stage so normal choice input does not intercept its navigation. */
export function installLocalEventReview(game: Game, story: StoryDirector | undefined,
  search = location.search, hostname = location.hostname): { freezeProgress: true } | undefined {
  if (!story || !['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return;
  const scene = localEventReviewScene(new URLSearchParams(search).get('localReview'));
  if (!scene) return;
  const bar = document.createElement('aside');
  bar.id = 'local-event-review';
  bar.setAttribute('aria-label', 'イベントの確認');
  const heading = document.createElement('div');
  heading.className = 'review-event-heading';
  const label = document.createElement('span');
  label.textContent = `${STORY_STAGES[scene.stageIndex].name} · ${scene.group === 'optional' ? '追加イベント' : '選択肢の改善確認'}`;
  const title = document.createElement('strong'); title.textContent = scene.title;
  heading.append(label, title);
  const actions = document.createElement('nav');
  const back = document.createElement('a'); back.href = `/review.html#${scene.group === 'optional' ? 'events' : 'choices'}`; back.textContent = '一覧へ';
  const restart = document.createElement('button'); restart.type = 'button'; restart.dataset.reviewRestart = scene.id; restart.textContent = 'この場面をやり直す';
  const sameGroup = LOCAL_EVENT_REVIEW_SCENES.filter(item => item.group === scene.group);
  const nextScene = sameGroup[(sameGroup.findIndex(item => item.id === scene.id) + 1) % sameGroup.length];
  const next = document.createElement('a'); next.href = localEventReviewUrl(nextScene.id); next.textContent = '次の場面へ';
  actions.append(back, restart, next);
  const status = document.createElement('p'); status.className = 'review-event-status'; status.setAttribute('role', 'status'); status.hidden = true;
  const startOver = (id: typeof scene.id, href: string) => {
    try {
      const key = reviewSaveKey(id), store = new LocalSaveStore(key);
      const result = store.clearForNew(localStorage.getItem(key));
      if (!result.ok) { status.textContent = saveFailureMessage(result.reason); status.hidden = false; return; }
      location.assign(href);
    } catch { status.textContent = 'この確認用の場面をやり直せませんでした。'; status.hidden = false; }
  };
  restart.addEventListener('click', () => startOver(scene.id, localEventReviewUrl(scene.id)));
  next.addEventListener('click', event => { event.preventDefault(); startOver(nextScene.id, next.href); });
  bar.append(heading, actions, status);
  document.body.append(bar); document.body.classList.add('review-event-mode');
  if (Object.hasOwn(story.choices, scene.eventId)) {
    status.textContent = 'この場面は選択済みです。「この場面をやり直す」で、別の選び方も確認できます。'; status.hidden = false;
  } else if (!beginLocalEventReview(game, story, scene)) {
    status.textContent = 'この場面の導入を開けませんでした。「この場面をやり直す」を押してください。'; status.hidden = false;
  }
  const reserveSpace = () => document.documentElement.style.setProperty('--local-event-review-height', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  reserveSpace();
  new ResizeObserver(reserveSpace).observe(bar);
  return { freezeProgress: true };
}
