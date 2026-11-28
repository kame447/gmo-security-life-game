import { describe, expect, it } from 'vitest';
import { LOCAL_EVENT_REVIEW_SCENES, localEventReviewScene } from '../src/app/local-event-review-catalog';
import { beginLocalEventReview } from '../src/app/local-event-review';
import { createReviewSave, reviewSaveKey, seedLocalReview } from '../src/app/local-review-fixtures';
import { activeSaveKey } from '../src/app/save-slot';
import { SAVE_KEY, type SaveStorage } from '../src/app/local-save';
import { LifeEventDirector } from '../src/events/director';
import { Game } from '../src/session/game';
import { StoryDirector } from '../src/story/director';
import { STORY_EVENTS } from '../src/story/events';
import { OPTIONAL_STORY_EVENTS } from '../src/story/optional';
import { parseStorySave, type StorySave } from '../src/story/state';
import { buildWorld } from '../src/world';

const world = buildWorld();
function setup(id: typeof LOCAL_EVENT_REVIEW_SCENES[number]['id'], savedState?: StorySave) {
  const saved = createReviewSave(world, id);
  if (savedState) saved.story = savedState;
  const game = new Game(world, { save: saved });
  const life = new LifeEventDirector(STORY_EVENTS);
  const story = StoryDirector.resume(parseStorySave(saved.story)!, life);
  story.attach({
    say: (speaker, lines) => game.say(speaker, lines), warp: spawn => game.warp(spawn),
    areaId: () => game.player.areaId, setPhoneOwned: owned => game.phone.setOwned(owned),
    changeMoney: amount => game.assets.changeMoney(amount).ok, addItem: () => true,
    money: () => game.assets.moneyYen, itemCount: () => 0, notice: () => {}, deliverMail: () => {},
  });
  return { game, life, story };
}

describe('direct review of one event', () => {
  it('covers exactly the added optional events and gives every scene a distinct isolated save key', () => {
    const optional = LOCAL_EVENT_REVIEW_SCENES.filter(scene => scene.group === 'optional');
    expect(optional).toHaveLength(12);
    expect(optional.map(scene => scene.eventId).sort()).toEqual(OPTIONAL_STORY_EVENTS.map(item => item.event.id).sort());
    expect(new Set(LOCAL_EVENT_REVIEW_SCENES.map(scene => scene.id)).size).toBe(LOCAL_EVENT_REVIEW_SCENES.length);
    for (const scene of LOCAL_EVENT_REVIEW_SCENES) {
      expect(activeSaveKey(`?localReview=${scene.id}`)).toBe(reviewSaveKey(scene.id));
      expect(reviewSaveKey(scene.id)).not.toBe(SAVE_KEY);
    }
    expect(localEventReviewScene('event-unknown')).toBeUndefined();
  });

  it.each(LOCAL_EVENT_REVIEW_SCENES)('starts $title at its introduction and records the ordinary choice without walking or waiting', scene => {
    const { game, life, story } = setup(scene.id);
    const position = { ...game.player }, elapsed = story.save().stepElapsed;
    expect(game.player.areaId).toBe(scene.areaId);
    expect(beginLocalEventReview(game, story, scene)).toBe(true);
    expect(game.dialog?.index).toBe(0);
    expect(game.dialog?.lines).toEqual(STORY_EVENTS.find(event => event.id === scene.eventId)!.intro);
    expect(life.pending?.event.id).toBe(scene.eventId);
    expect(game.player).toEqual(position);
    expect(story.save().stepElapsed).toBe(elapsed);
    const outcome = life.choose(life.pending!.event.choices![0].id)!;
    story.onLifeOutcome(outcome);
    expect(story.choices[scene.eventId]).toBe(outcome.choice.id);
    const resumed = setup(scene.id, story.save());
    expect(beginLocalEventReview(resumed.game, resumed.story, scene)).toBe(false);
    expect(resumed.life.pending).toBeNull();
  });

  it('can replay a different choice from a new review fixture while preserving the first scene data', () => {
    const scene = LOCAL_EVENT_REVIEW_SCENES[0], first = setup(scene.id);
    beginLocalEventReview(first.game, first.story, scene);
    first.story.onLifeOutcome(first.life.choose(first.life.pending!.event.choices![0].id)!);
    const preserved = first.story.save(), second = setup(scene.id);
    beginLocalEventReview(second.game, second.story, scene);
    second.story.onLifeOutcome(second.life.choose(second.life.pending!.event.choices![1].id)!);
    expect(second.story.choices[scene.eventId]).not.toBe(preserved.choices[scene.eventId]);
    expect(first.story.save()).toEqual(preserved);
  });

  it('seeds all event slots without reading or writing the ordinary save and preserves reloads', () => {
    const values = new Map([[SAVE_KEY, 'ordinary-save-sentinel']]);
    const reads: string[] = [];
    const storage: SaveStorage = { getItem: key => { reads.push(key); return values.get(key) ?? null; },
      setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
    for (const scene of LOCAL_EVENT_REVIEW_SCENES) {
      const query = `?localReview=${scene.id}`, options = { hostname: 'localhost', storage: () => storage };
      expect(seedLocalReview(world, query, options)).toBe('created');
      const raw = values.get(reviewSaveKey(scene.id));
      expect(seedLocalReview(world, query, options)).toBe('existing');
      expect(values.get(reviewSaveKey(scene.id))).toBe(raw);
    }
    expect(values.get(SAVE_KEY)).toBe('ordinary-save-sentinel');
    expect(reads).not.toContain(SAVE_KEY);
    expect(seedLocalReview(world, '?localReview=event-unknown', { hostname: 'localhost', storage: () => storage })).toBe('not-requested');
    expect(seedLocalReview(world, `?localReview=${LOCAL_EVENT_REVIEW_SCENES[0].id}`, { hostname: 'game.example', storage: () => storage })).toBe('not-requested');
  });
});
