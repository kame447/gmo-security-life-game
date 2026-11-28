import { describe, expect, it } from 'vitest';
import { createReviewSave, REVIEW_SCENES, reviewSaveKey, seedLocalReview } from '../src/app/local-review-fixtures';
import { SAVE_KEY, type SaveStorage } from '../src/app/local-save';
import { parseStorySave } from '../src/story/state';
import { parseSave } from '../src/state/save';
import { buildWorld } from '../src/world';

const world = buildWorld();
function storage() {
  const values = new Map<string, string>();
  const reads: string[] = [];
  const store: SaveStorage = {
    getItem: key => { reads.push(key); return values.get(key) ?? null; },
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  return { values, reads, store };
}

describe('isolated local review scenes', () => {
  it('creates a readable scene at each actual place with supported story progress', () => {
    for (const id of Object.keys(REVIEW_SCENES) as (keyof typeof REVIEW_SCENES)[]) {
      const fixture = createReviewSave(world, id), parsed = parseSave(fixture, world);
      expect(parsed?.areaId).toBe(REVIEW_SCENES[id].areaId);
      expect(parsed?.x).toBe(fixture.x);
      expect(parsed?.y).toBe(fixture.y);
      const story = parseStorySave(parsed?.story);
      expect(story?.phase).toBe(id === 'ending' ? 'finished' : 'milestone');
      expect(story?.stageIndex).toBe(REVIEW_SCENES[id].stageIndex);
    }
  });

  it('writes only the requested review key and never reads the ordinary save', () => {
    const s = storage(); s.values.set(SAVE_KEY, 'ordinary-save-sentinel');
    expect(seedLocalReview(world, '?localReview=high-school', { hostname: '127.0.0.1', storage: () => s.store })).toBe('created');
    expect(s.values.get(SAVE_KEY)).toBe('ordinary-save-sentinel');
    expect(s.reads).not.toContain(SAVE_KEY);
    expect([...s.values.keys()]).toEqual([SAVE_KEY, reviewSaveKey('high-school')]);
  });

  it('keeps played progress unchanged across reloads and does not touch another scene', () => {
    const s = storage();
    seedLocalReview(world, '?localReview=university', { hostname: 'localhost', storage: () => s.store });
    const key = reviewSaveKey('university'), original = JSON.parse(s.values.get(key)!);
    original.assets.moneyYen = 777; original.story.choices['story.optional.univ.project'] = 'research';
    s.values.set(key, JSON.stringify(original));
    expect(seedLocalReview(world, '?localReview=university', { hostname: 'localhost', storage: () => s.store })).toBe('existing');
    expect(JSON.parse(s.values.get(key)!)).toEqual(original);
    expect(s.values.has(reviewSaveKey('office'))).toBe(false);
  });

  it('leaves corrupt review data for recovery rather than overwriting it', () => {
    const s = storage(), key = reviewSaveKey('cafe'); s.values.set(key, '{broken');
    expect(seedLocalReview(world, '?localReview=cafe', { hostname: 'localhost', storage: () => s.store })).toBe('blocked');
    expect(s.values.get(key)).toBe('{broken');
  });

  it('does not seed unknown slots, the intro, normal play, or nonlocal hosts', () => {
    const s = storage();
    for (const query of ['', '?story=1', '?localReview=unknown', '?localReview=intro', '?localReview=__proto__']) {
      expect(seedLocalReview(world, query, { hostname: 'localhost', storage: () => s.store })).toBe('not-requested');
    }
    expect(seedLocalReview(world, '?localReview=office', { hostname: 'game.example', storage: () => s.store })).toBe('not-requested');
    expect(s.values.size).toBe(0); expect(s.reads.length).toBe(0);
  });

  it('provides a ready mail link instead of making the reviewer wait for delivery', () => {
    const data = createReviewSave(world, 'mail');
    expect(data.phone?.mail?.messages[0]?.links[0]?.href).toBe('https://town-library.example/events');
    expect(data.phone?.mail?.messages[0]?.read).toBe(false);
    expect(data.phone?.mail?.pending).toEqual([]);
  });

  it('reports blocked storage without throwing or falsely reporting a prepared scene', () => {
    expect(seedLocalReview(world, '?localReview=save', { hostname: 'localhost', storage: () => { throw new Error('blocked'); } })).toBe('blocked');
  });
});
