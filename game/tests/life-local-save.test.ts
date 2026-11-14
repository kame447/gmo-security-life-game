import { describe, expect, it, vi } from 'vitest';
import { LocalSaveSession } from '../src/app/local-save-session';
import { createSaveStore } from '../src/app/save-store';
import { LifeEventDirector } from '../src/events/director';
import type { LifeEventDef } from '../src/events/life-events';
import { CHILDHOOD_SAMPLE_EVENTS } from '../src/events/samples/childhood';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const world = buildWorld();
const KEY = 'slg-map-save-v1';
const clocks = { phoneClock: () => 0, phoneEpochClock: () => 0 };
const fresh = () => new Game(world, clocks).serialize();
const emptyLife = { v: 1, stats: {}, flags: {}, history: [] };
const event = (eventKey: string) => ({ type: 'interact' as const, areaId: 'home-family-interior', interactionId: 'test', eventKey });
const repeat: LifeEventDef = { ...CHILDHOOD_SAMPLE_EVENTS[0], id: 'test.repeat', once: false,
  trigger: { eventKey: 'test.repeat' } };
const defs = [...CHILDHOOD_SAMPLE_EVENTS, repeat];

function setup(initial = JSON.stringify(fresh()), maxBytes?: number) {
  const values = new Map([[KEY, initial]]);
  const faults = { write: false };
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      if (faults.write) throw new DOMException('test quota', 'QuotaExceededError');
      values.set(key, value);
    }),
  };
  const options = { storage: () => storage, maxBytes };
  const session = new LocalSaveSession(world, options);
  const game = new Game(world, { ...clocks, save: session.initialSave });
  const director = new LifeEventDirector(defs, game.life.state);
  return { values, faults, storage, options, session, game, director,
    read: () => JSON.parse(values.get(KEY)!) };
}

function choose(director: LifeEventDirector, eventKey: string, choiceId: string): void {
  expect(director.onMapEvent(event(eventKey))).toBeTruthy();
  expect(director.choose(choiceId)).not.toBeNull();
}

describe('Game / Director / local storage life integration', () => {
  it('keeps a Game snapshot byte-stable when the outgoing normal page saves before entering review mode', () => {
    const snapshot = fresh(); const raw = JSON.stringify(snapshot); const s = setup(raw);
    expect(s.session.save(() => s.game.serialize())).toEqual({ ok: true });
    expect(s.values.get(KEY)).toBe(raw);
  });

  it('uses one state and persists event choices beside position, appearance, wallet, layout and phone', () => {
    const s = setup();
    expect(s.director.state).toBe(s.game.life.state);
    s.game.update(0.1, { dir: 'right', run: false });
    s.game.setAppearance({ ...s.game.appearance, hairColor: 'black' });
    s.game.assets.apply({ moneyDeltaYen: -300, itemDeltas: [{ itemId: 'notebook', quantityDelta: 1 }] });
    s.game.phone.setOwned(false);
    choose(s.director, 'park.friend', 'sandbox');
    choose(s.director, 'home.tablet', 'ask-parent');
    const snapshot = s.game.serialize();
    expect(s.session.save(() => s.game.serialize(), true)).toEqual({ ok: true });
    const next = new LocalSaveSession(world, s.options);
    const reloaded = new Game(world, { ...clocks, save: next.initialSave });
    const director = new LifeEventDirector(defs, reloaded.life.state);
    expect(reloaded.serialize()).toEqual(snapshot);
    expect(director.state.stat('friendship')).toBe(1);
    expect(director.state.flag('asked-adult-about-ad')).toBe(true);
    expect(director.available('park.friend')).toBeUndefined();
    expect(director.available('home.tablet')).toBeUndefined();
    expect(director.available('home.mother')?.id).toBe('sample.tablet-ad-followup-asked');
    reloaded.reset();
    expect(reloaded.life.state.toJSON()).toEqual(s.game.life.state.toJSON());
  });

  it('includes new life progress in an automatic checkpoint', () => {
    const s = setup(); choose(s.director, 'park.friend', 'tag');
    expect(s.session.save(() => s.game.serialize())).toEqual({ ok: true });
    expect(new Game(world, { ...clocks, save: s.read() }).life.state.stat('friendship')).toBe(1);
  });

  it('adds empty life to an old save only when saving and preserves all its supported sections', () => {
    const { life: _life, ...legacy } = fresh();
    const raw = JSON.stringify(legacy); const s = setup(raw);
    expect(s.game.life.status).toBe('missing');
    expect(s.values.get(KEY)).toBe(raw); expect(s.storage.setItem).not.toHaveBeenCalled();
    expect(s.session.save(() => s.game.serialize(), true).ok).toBe(true);
    expect(s.read()).toEqual({ ...legacy, life: emptyLife });
  });

  it('does not reapply once-only effects after continuing but keeps repeatable events repeatable', () => {
    const s = setup(); choose(s.director, 'park.friend', 'tag');
    choose(s.director, 'test.repeat', 'tag');
    expect(s.session.save(() => s.game.serialize(), true).ok).toBe(true);
    choose(s.director, 'test.repeat', 'tag'); // Unsaved progress must not replace the checkpoint on pagehide.
    expect(s.session.continue().ok).toBe(true);
    const capture = vi.fn(() => s.game.serialize());
    expect(s.session.save(capture)).toEqual({ ok: false, reason: 'paused' });
    expect(capture).not.toHaveBeenCalled();
    const next = new Game(world, { ...clocks, save: new LocalSaveSession(world, s.options).initialSave });
    const director = new LifeEventDirector(defs, next.life.state);
    expect(director.state.stat('friendship')).toBe(2);
    expect(director.onMapEvent(event('park.friend'))).toBeUndefined();
    choose(director, 'test.repeat', 'tag');
    expect(director.state.stat('friendship')).toBe(3);
    const session = new LocalSaveSession(world, s.options);
    expect(session.save(() => next.serialize()).ok).toBe(true);
    expect(new Game(world, { ...clocks, save: s.read() }).life.state.history.map(h => h.eventId))
      .toEqual(['sample.park-play', 'test.repeat', 'test.repeat']);
  });

  it('does not turn an unconfirmed or cancelled choice into an experience', () => {
    const s = setup(); s.director.onMapEvent(event('home.tablet'));
    expect(s.director.pending).not.toBeNull();
    expect(s.session.save(() => s.game.serialize()).ok).toBe(true);
    const reloaded = new Game(world, { ...clocks, save: s.read() });
    const director = new LifeEventDirector(defs, reloaded.life.state);
    expect(director.pending).toBeNull(); expect(director.available('home.tablet')).toBeDefined();
    s.director.cancel();
    expect(s.game.life.state.history).toEqual([]);
  });

  it('preserves unknown v1 keys, history metadata, negative/fractional stats and false flags', () => {
    const life = { v: 1, stats: { 'unknown.stat': -2.5 }, flags: { 'unknown.flag': false },
      history: [{ eventId: 'unknown.event', choiceId: 'unknown.choice', metadata: { v: 7, a: [null, false] } }],
      future: { v: 9, items: ['あ', '😀'] } };
    const s = setup(JSON.stringify({ ...fresh(), life }));
    choose(s.director, 'park.friend', 'tag');
    expect(s.session.save(() => s.game.serialize(), true).ok).toBe(true);
    expect(s.read().life).toEqual({ ...life, stats: { ...life.stats, friendship: 1 },
      history: [...life.history, { eventId: 'sample.park-play', choiceId: 'tag' }] });
    const exported = s.game.serialize().life as typeof life;
    exported.history[0].metadata.a[0] = false;
    expect((s.game.serialize().life as typeof life).history[0]).toEqual(life.history[0]);
  });

  it('recovers known experience from a damaged choice and preserves raw life while saving other progress', () => {
    const life = { v: 1, stats: { friendship: 4.5, bad: 'broken' }, flags: { retained: false },
      history: [{ eventId: 'sample.tablet-ad', choiceId: 42, future: [null, false] }], future: { v: 7 } };
    const s = setup(JSON.stringify({ ...fresh(), life }));
    expect(s.game.life.status).toBe('recovered');
    expect(s.session.notice).toEqual({ kind: 'error', reason: 'protected-life' });
    expect(s.director.available('home.tablet')).toBeUndefined();
    expect(s.director.available('home.mother')).toBeUndefined();
    choose(s.director, 'park.friend', 'tag');
    s.game.assets.changeMoney(-100); s.game.phone.setOwned(false);
    expect(s.session.save(() => s.game.serialize(), true)).toEqual({ ok: false, reason: 'protected-life' });
    expect(s.session.notice).toEqual({ kind: 'error', reason: 'protected-life' });
    expect(s.read()).toMatchObject({ life, assets: { moneyYen: 900 }, phone: { owned: false } });
    expect(s.read().life.stats.friendship).toBe(4.5); // New life progress was not silently reported as saved.
    const next = new Game(world, { ...clocks, save: new LocalSaveSession(world, s.options).initialSave });
    expect(next.life.state.stat('friendship')).toBe(4.5);
    expect(next.life.state.experienced('sample.tablet-ad')).toBe(true);
    expect(next.life.state.chose('sample.tablet-ad', 'ask-parent')).toBe(false);
  });

  it.each([null, { stats: {}, flags: {}, history: [] }, { v: 7, progression: ['unknown'] }])
  ('transports protected life without replacement and reports a partial save: %j', life => {
    const s = setup(JSON.stringify({ ...fresh(), life }));
    s.game.assets.changeMoney(-200);
    expect(s.session.save(() => s.game.serialize())).toEqual({ ok: false, reason: 'protected-life' });
    expect(s.read().life).toEqual(life); expect(s.read().assets.moneyYen).toBe(800);
    expect(s.values.has(`${KEY}.protected`)).toBe(false);
  });

  it('preserves a protected life installed by another tab immediately before writing or retrying', () => {
    const s = setup(); choose(s.director, 'park.friend', 'tag');
    const store = createSaveStore(s.options); store.loadSave(world);
    s.faults.write = true; expect(store.writeSave(s.game.serialize())).toBe(false);
    const life = { v: 9, unknown: { a: [false, null] } };
    s.values.set(KEY, JSON.stringify({ ...fresh(), life })); s.faults.write = false;
    expect(store.retrySave()).toBe(true);
    expect(store.saveStatus()).toMatchObject({ lifeProtected: true, failed: false, pending: false, changed: true });
    expect(s.read().life).toEqual(life);
    s.game.assets.changeMoney(-100);
    expect(s.session.save(() => s.game.serialize(), true)).toEqual({ ok: false, reason: 'protected-life' });
    expect(s.read()).toMatchObject({ life, assets: { moneyYen: 900 } });
  });

  it('keeps the entire checkpoint on quota failure and commits current life only after a successful retry', () => {
    const s = setup(); const old = s.values.get(KEY);
    choose(s.director, 'park.friend', 'tag'); s.game.assets.changeMoney(-300);
    s.faults.write = true;
    expect(s.session.save(() => s.game.serialize(), true)).toEqual({ ok: false, reason: 'quota-exceeded' });
    expect(s.session.notice.kind).toBe('error'); expect(s.values.get(KEY)).toBe(old);
    const before = new Game(world, { ...clocks, save: new LocalSaveSession(world, s.options).initialSave });
    expect(before.life.state.history).toEqual([]); expect(before.assets.moneyYen).toBe(1000);
    s.faults.write = false; expect(s.session.save(() => s.game.serialize(), true)).toEqual({ ok: true });
    expect(s.session.notice).toEqual({ kind: 'saved' });
    const after = new Game(world, { ...clocks, save: s.read() });
    expect(after.life.state.stat('friendship')).toBe(1); expect(after.assets.moneyYen).toBe(700);
  });

  it('reports life serialization failures without a partial write or an uncaught exception', () => {
    const s = setup(); const raw = s.values.get(KEY);
    s.game.life.state.stats.set('overflow', Infinity);
    expect(s.session.save(() => s.game.serialize(), true)).toEqual({ ok: false, reason: 'invalid-data' });
    expect(s.session.notice).toEqual({ kind: 'error', reason: 'invalid-data' });
    expect(s.values.get(KEY)).toBe(raw); expect(s.storage.setItem).not.toHaveBeenCalled();
    s.game.life.state.stats.delete('overflow');
    expect(s.session.save(() => s.game.serialize(), true)).toEqual({ ok: true });
  });

  it('enforces the whole-save UTF-8 bound without trimming history or metadata', () => {
    const s = setup(); choose(s.director, 'park.friend', 'tag');
    const size = new TextEncoder().encode(JSON.stringify(s.game.serialize())).length;
    const exact = new LocalSaveSession(world, { ...s.options, maxBytes: size });
    expect(exact.save(() => s.game.serialize(), true).ok).toBe(true);
    const raw = s.values.get(KEY);
    s.game.life.state.record('あ😀'.repeat(10), null);
    expect(exact.save(() => s.game.serialize(), true)).toEqual({ ok: false, reason: 'too-large' });
    expect(s.values.get(KEY)).toBe(raw); expect(s.game.life.state.history).toHaveLength(2);
  });

  it('confirmed new game clears life only after backing up the exact old bytes, with failure leaving gameplay intact', () => {
    const life = { v: 9, oldProgress: ['protected'] };
    const raw = JSON.stringify({ ...fresh(), life, future: { keep: true } }, null, 2);
    const s = setup(raw); s.faults.write = true;
    expect(s.session.startNew(fresh).ok).toBe(false);
    expect(s.values.get(KEY)).toBe(raw); expect(s.session.isSwitching).toBe(false);
    expect(s.game.serialize().life).toEqual(life);
    s.faults.write = false;
    expect(s.session.startNew(fresh)).toEqual({ ok: true });
    expect(s.values.get(`${KEY}.previous`)).toBe(raw);
    expect(s.read().life).toEqual(emptyLife); expect(s.read()).not.toHaveProperty('future');
    const next = new LocalSaveSession(world, s.options);
    expect(next.notice).toEqual({ kind: 'none' });
    expect(new Game(world, { ...clocks, save: next.initialSave }).life.state.history).toEqual([]);
  });

  it('does not evaluate snapshots while paused/reviewing, and catches a failed new-game snapshot before backup', () => {
    const s = setup(); const capture = vi.fn(() => { throw new Error('snapshot failed'); });
    s.session.pause(true);
    expect(s.session.save(capture)).toEqual({ ok: false, reason: 'paused' });
    const review = new LocalSaveSession(world, { ...s.options, disabled: true });
    expect(review.save(capture).ok).toBe(false); expect(capture).not.toHaveBeenCalled();
    expect(s.session.startNew(capture)).toEqual({ ok: false, reason: 'invalid-data' });
    expect(s.storage.setItem).not.toHaveBeenCalled(); expect(s.session.isSwitching).toBe(false);
  });
});
