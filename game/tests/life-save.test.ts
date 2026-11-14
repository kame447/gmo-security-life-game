import { describe, expect, it, vi } from 'vitest';
import { LifeEventDirector } from '../src/events/director';
import type { LifeEventDef } from '../src/events/life-events';
import { LifeSaveError, restoreLifeSave } from '../src/events/life-save';
import { CHILDHOOD_SAMPLE_EVENTS } from '../src/events/samples/childhood';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const seed = () => ({
  v: 1,
  stats: { friendship: -1.25, 'future.能力': 8.5 },
  flags: { met: true, 'future.flag': false },
  history: [
    { eventId: 'unknown-event', choiceId: 'unknown-choice' },
    { eventId: 'conversation', choiceId: null },
    { eventId: 'unknown-event', choiceId: 'unknown-choice' },
  ],
});
const reload = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;
const talk = (eventKey: string) => ({ type: 'interact' as const, areaId: 'test', interactionId: 'npc', eventKey });

function expectReason(action: () => unknown, reason: LifeSaveError['reason']): void {
  expect(action).toThrow(LifeSaveError);
  try { action(); } catch (error) { expect((error as LifeSaveError).reason).toBe(reason); }
}

describe('life save contract adapter', () => {
  it('adds an empty life section to a legacy v1 save without changing its other sections', () => {
    const { life: _currentLife, ...legacy } = new Game(buildWorld()).serialize();
    expect(legacy).not.toHaveProperty('life');
    const restored = restoreLifeSave((legacy as { life?: unknown }).life);
    expect(restored.status).toBe('missing');
    expect(restored.issues).toEqual([]);
    const next = { ...legacy, life: restored.serialize() };
    expect(next.life).toEqual({ v: 1, stats: {}, flags: {}, history: [] });
    const { life: _life, ...otherSections } = next;
    expect(otherSections).toEqual(legacy);
    expect(restoreLifeSave(reload(next).life).state.toJSON()).toEqual(next.life);
  });

  it('round-trips negative/fractional stats, false flags and ordered duplicate histories without replaying effects', () => {
    const source = seed();
    const restored = restoreLifeSave(reload(source));
    expect(restored.status).toBe('ready');
    expect(restored.issues).toEqual([]);
    expect(restored.state.toJSON()).toEqual(source);
    expect(restored.serialize()).toEqual(source);
    expect(restoreLifeSave(reload(restored.serialize())).serialize()).toEqual(source);
  });

  it('keeps unknown root/entry fields, IDs, keys and versions through subsequent choices', () => {
    const source = { ...seed(), future: { v: 7, plans: ['進路🌱', null, false] } };
    Object.assign(source.history[0], { future: { v: 8, score: [1, 2] } });
    const restored = restoreLifeSave(source);
    restored.state.apply([{ kind: 'stat', stat: 'friendship', add: 2 }, { kind: 'flag', flag: 'new' }]);
    restored.state.record('next', 'b');
    const result = restored.serialize();
    expect(result).toEqual({ ...source, stats: { ...source.stats, friendship: 0.75 },
      flags: { ...source.flags, new: true }, history: [...source.history, { eventId: 'next', choiceId: 'b' }] });
    expect(restoreLifeSave(reload(result)).serialize()).toEqual(result);
    expect(source).toEqual({ ...seed(), future: { v: 7, plans: ['進路🌱', null, false] },
      history: [{ ...seed().history[0], future: { v: 8, score: [1, 2] } }, ...seed().history.slice(1)] });
  });

  it('owns its snapshot: mutating the input or an exported JSON value cannot corrupt the next export', () => {
    const source = { ...seed(), future: { labels: ['before'] } };
    Object.assign(source.history[0], { metadata: { value: 1 } });
    const expected = reload(source);
    const restored = restoreLifeSave(source);
    source.future.labels[0] = 'outside';
    source.history[0].choiceId = 'outside';
    const result = restored.serialize();
    (result.future as { labels: string[] }).labels[0] = 'export';
    (result.history[0].metadata as { value: number }).value = 9;
    result.stats.friendship = 999;
    expect(restored.serialize()).toEqual(expected);
  });

  it('preserves prototype-looking JSON keys as data', () => {
    const source = JSON.parse('{"v":1,"stats":{"__proto__":3,"constructor":-2},"flags":{"__proto__":false},"history":[{"eventId":"__proto__","choiceId":"constructor","__proto__":{"x":1}}],"__proto__":{"v":2}}');
    const restored = restoreLifeSave(source);
    expect(restored.state.stat('__proto__')).toBe(3);
    expect(restored.state.flag('__proto__')).toBe(false);
    expect(reload(restored.serialize())).toEqual(source);
    expect(Object.getPrototypeOf(restored.serialize())).toBe(Object.prototype);
  });
});

describe('reload and one-time life events', () => {
  it.each(['ask-parent', 'tap', 'close'])('retains %s, suppresses the ad and keeps later branches and effects', choice => {
    const original = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS);
    original.onMapEvent(talk('home.tablet'));
    original.choose(choice);
    const saved = restoreLifeSave(original.state.toJSON()).serialize();
    const restored = restoreLifeSave(reload(saved));
    const director = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS, restored.state);
    expect(director.onMapEvent(talk('home.tablet'))).toBeUndefined();
    expect(director.state.toJSON()).toEqual(saved);
    expect(director.state.chose('sample.tablet-ad', choice)).toBe(true);
    const beforeFollowup = director.state.toJSON();
    const expected = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS, restoreLifeSave(beforeFollowup).state)
      .onMapEvent(talk('home.mother'));
    expect(director.onMapEvent(talk('home.mother'))).toEqual(expected);
    const next = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS,
      restoreLifeSave(reload(restored.serialize())).state);
    expect(next.onMapEvent(talk('home.mother'))).toBeUndefined();
  });

  it('does not serialize a pending choice as an experience', () => {
    const director = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS);
    director.onMapEvent(talk('home.tablet'));
    const restored = restoreLifeSave(reload(restoreLifeSave(director.state.toJSON()).serialize()));
    expect(restored.state.history).toEqual([]);
    expect(new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS, restored.state).onMapEvent(talk('home.tablet'))).toBeDefined();
  });

  it('keeps repeatable events repeatable and applies a new effect exactly once', () => {
    const def: LifeEventDef = { id: 'repeat', title: 'repeat', category: 'daily', trigger: { eventKey: 'repeat' },
      once: false, intro: ['hello'], effects: [{ kind: 'stat', stat: 'count', add: 2 }] };
    const director = new LifeEventDirector([def]);
    director.onMapEvent(talk('repeat'));
    const restored = restoreLifeSave(reload(restoreLifeSave(director.state.toJSON()).serialize()));
    expect(restored.state.stat('count')).toBe(2);
    expect(new LifeEventDirector([def], restored.state).onMapEvent(talk('repeat'))).toBeDefined();
    expect(restored.state.stat('count')).toBe(4);
    expect(restored.state.history).toHaveLength(2);
  });
});

describe('local recovery and overwrite protection', () => {
  it('recovers valid siblings, keeps experience when only a choice is corrupt, and refuses a lossy overwrite', () => {
    const source = { ...seed(), stats: { good: 2, broken: '2' }, flags: { good: false, broken: 1 },
      history: [{ eventId: 'sample.tablet-ad', choiceId: 99 }, null,
        { eventId: 'future-event', choiceId: 'future-choice', extra: 'keep' }, { eventId: 4, choiceId: 'a' }] };
    const before = reload(source);
    const restored = restoreLifeSave(source);
    expect(restored.status).toBe('recovered');
    expect(restored.state.toJSON()).toEqual({ v: 1, stats: { good: 2 }, flags: { good: false }, history: [
      { eventId: 'sample.tablet-ad', choiceId: null }, { eventId: 'future-event', choiceId: 'future-choice' }] });
    expect(new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS, restored.state).onMapEvent(talk('home.tablet'))).toBeUndefined();
    expect(restored.state.chose('sample.tablet-ad', 'ask-parent')).toBe(false);
    expect(restored.issues.map(issue => issue.path)).toEqual(expect.arrayContaining([
      '/stats/broken', '/flags/broken', '/history/0/choiceId', '/history/1', '/history/3/eventId']));
    expectReason(() => restored.serialize(), 'protected-life');
    expect(source).toEqual(before);
  });

  it.each([{ v: 1 }, { v: 1, stats: [], flags: null, history: {} }])('recovers missing/damaged collections in %j without pretending it is a new save', source => {
    const restored = restoreLifeSave(source);
    expect(restored.status).toBe('recovered');
    expect(restored.state.toJSON()).toEqual({ v: 1, stats: {}, flags: {}, history: [] });
    expectReason(() => restored.serialize(), 'protected-life');
  });

  it.each([null, false, 'broken', [], {}, { ...seed(), v: 2 }, { ...seed(), v: '1' }])('protects an unsupported life section %j', source => {
    const before = reload(source);
    const restored = restoreLifeSave(source);
    expect(restored.status).toBe('protected');
    expect(restored.state.history).toEqual([]);
    expectReason(() => restored.serialize(), 'protected-life');
    expect(source).toEqual(before);
  });

  it('rejects non-JSON data without invoking getters or toJSON, while exposing safe siblings', () => {
    const getter = vi.fn(() => 4);
    const toJSON = vi.fn(() => ({}));
    const withGetter = { ...seed(), future: Object.defineProperty({}, 'value', { enumerable: true, get: getter }) };
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const future of [undefined, NaN, Infinity, 2n, () => 1, Symbol('s'), new Map(), new Date(),
      { toJSON }, [1, , 3], cycle, withGetter.future, Object.defineProperty({}, 'hidden', { value: 1 }),
      { [Symbol('hidden')]: true }]) {
      const restored = restoreLifeSave({ ...seed(), future });
      expect(restored.status).toBe('protected');
      expect(restored.state.stat('friendship')).toBe(-1.25);
      expectReason(() => restored.serialize(), 'protected-life');
    }
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('recovers finite values from nonfinite input without emitting null as a replacement', () => {
    const restored = restoreLifeSave({ ...seed(), stats: { good: -2.5, bad: Infinity } });
    expect(restored.state.toJSON().stats).toEqual({ good: -2.5 });
    expectReason(() => restored.serialize(), 'protected-life');
  });

  it('rejects new invalid runtime state, including overflow, instead of silently dropping it', () => {
    const restored = restoreLifeSave(seed());
    restored.state.apply([{ kind: 'stat', stat: 'overflow', add: Number.MAX_VALUE },
      { kind: 'stat', stat: 'overflow', add: Number.MAX_VALUE }]);
    expectReason(() => restored.serialize(), 'invalid-data');
    const flags = restoreLifeSave(seed());
    flags.state.flags.set('bad', 1 as unknown as boolean);
    expectReason(() => flags.serialize(), 'invalid-data');
  });

  it('refuses deleting or reordering restored history rather than losing entry extensions', () => {
    const restored = restoreLifeSave(seed());
    restored.state.history.shift();
    expectReason(() => restored.serialize(), 'invalid-data');
  });
});

describe('caller-supplied capacity', () => {
  it('counts unknown fields and UTF-8, accepts the exact limit and rejects one byte over without trimming', () => {
    const source = { ...seed(), future: { text: '人生🌱'.repeat(100) } };
    const restored = restoreLifeSave(source);
    const size = bytes(source);
    expect(size).toBeGreaterThan(JSON.stringify(source).length);
    expect(restored.serialize({ maxBytes: size })).toEqual(source);
    expectReason(() => restored.serialize({ maxBytes: size - 1 }), 'too-large');
    expect(restored.serialize()).toEqual(source);
  });

  it.each([-1, 0.5, NaN, Infinity])('rejects an invalid byte limit %s', maxBytes => {
    expectReason(() => restoreLifeSave().serialize({ maxBytes }), 'invalid-data');
  });

  it('has no implicit history cap and preserves a large chronological history', () => {
    const history = Array.from({ length: 6000 }, (_, i) => ({ eventId: `future.人生イベント.${i}`, choiceId: '選択🌱' }));
    const source = { ...seed(), history };
    const restored = restoreLifeSave(reload(source));
    expect(restored.state.history).toHaveLength(history.length);
    expect(restored.serialize()).toEqual(source);
    expectReason(() => restored.serialize({ maxBytes: bytes(source) - 1 }), 'too-large');
    expect(restored.state.history).toEqual(history);
  });
});
