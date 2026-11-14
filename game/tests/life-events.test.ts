import { describe, expect, it } from 'vitest';
import type { InteractionDef, MapEvent } from '../src/core/types';
import { LifeEventDirector } from '../src/events/director';
import { validateLifeEvents, type LifeEventDef } from '../src/events/life-events';
import { LifeState } from '../src/events/life-state';
import { CHILDHOOD_SAMPLE_EVENTS } from '../src/events/samples/childhood';
import { Game } from '../src/session/game';
import type { AreaRuntime, World } from '../src/world';
import { buildWorld } from '../src/world';

const talk = (eventKey: string, interactionId = 'npc'): MapEvent =>
  ({ type: 'interact', areaId: 'test', interactionId, eventKey });

const QUIZ: LifeEventDef = {
  id: 'quiz', title: 'テスト', category: 'daily', trigger: { eventKey: 'k.friend' },
  intro: ['やあ。'], prompt: 'どうする？',
  choices: [
    { id: 'a', label: 'A', result: ['Aをえらんだ。'], effects: [{ kind: 'stat', stat: 'friendship', add: 2 }] },
    { id: 'b', label: 'B', result: ['Bをえらんだ。'], effects: [{ kind: 'flag', flag: 'picked-b' }] },
  ],
};
const FOLLOW_UP: LifeEventDef = {
  id: 'follow', title: 'あとで', category: 'daily', trigger: { eventKey: 'k.mother' },
  when: [{ kind: 'chose', eventId: 'quiz', choiceId: 'b' }], intro: ['Bをえらんだんだね。'],
};

describe('life event definitions', () => {
  it('accepts the childhood samples', () => {
    expect(validateLifeEvents(CHILDHOOD_SAMPLE_EVENTS)).toEqual([]);
  });

  it('samples are triggered by interactions that exist in the childhood world', () => {
    const keys = new Set<string>();
    for (const area of buildWorld().areas.values()) for (const i of area.interactions) keys.add(i.eventKey);
    for (const def of CHILDHOOD_SAMPLE_EVENTS) expect(keys, def.id).toContain(def.trigger.eventKey);
  });

  it('samples include both daily and security events', () => {
    const categories = new Set(CHILDHOOD_SAMPLE_EVENTS.map(d => d.category));
    expect(categories).toEqual(new Set(['daily', 'security']));
  });

  it('reports broken definitions', () => {
    const broken: LifeEventDef[] = [
      { ...QUIZ, prompt: undefined },
      { ...QUIZ, id: 'one', choices: [QUIZ.choices![0]] },
      { ...FOLLOW_UP, when: [{ kind: 'chose', eventId: 'quiz', choiceId: 'missing' }] },
      { ...FOLLOW_UP, id: 'ghost', when: [{ kind: 'experienced', eventId: 'nope' }] },
      { ...QUIZ, id: 'nan', choices: [{ ...QUIZ.choices![0], effects: [{ kind: 'stat', stat: 'x', add: NaN }] }, QUIZ.choices![1]] },
      { ...FOLLOW_UP, id: 'follow' },
    ];
    const errors = validateLifeEvents(broken).join('\n');
    expect(errors).toMatch(/prompt が空/);
    expect(errors).toMatch(/選択肢が 1 つだけ/);
    expect(errors).toMatch(/存在しない選択肢 quiz\/missing/);
    expect(errors).toMatch(/存在しないイベント nope/);
    expect(errors).toMatch(/add が数値ではありません/);
    expect(errors).toMatch(/id が重複/);
  });

  it('refuses to start with invalid definitions', () => {
    expect(() => new LifeEventDirector([{ ...QUIZ, prompt: '' }])).toThrow(/不備/);
  });
});

describe('LifeEventDirector', () => {
  it('ignores unrelated events and keys, leaving the default lines', () => {
    const director = new LifeEventDirector([QUIZ]);
    expect(director.onMapEvent({ type: 'area-enter', areaId: 'test' })).toBeUndefined();
    expect(director.onMapEvent(talk('other'))).toBeUndefined();
    expect(director.pending).toBeNull();
  });

  it('runs intro → choice → result, applying effects and recording history', () => {
    const director = new LifeEventDirector([QUIZ]);
    expect(director.onMapEvent(talk('k.friend'))).toEqual({ speaker: undefined, lines: ['やあ。'] });
    expect(director.pending?.event.id).toBe('quiz');
    expect(director.pending?.interactionId).toBe('npc');
    expect(director.choose('missing')).toBeNull();
    expect(director.pending).not.toBeNull();

    const outcome = director.choose('a');
    expect(outcome?.lines).toEqual(['Aをえらんだ。']);
    expect(director.pending).toBeNull();
    expect(director.state.stat('friendship')).toBe(2);
    expect(director.state.history).toEqual([{ eventId: 'quiz', choiceId: 'a' }]);
  });

  it('happens once by default, falling back to default lines afterwards', () => {
    const director = new LifeEventDirector([QUIZ]);
    director.onMapEvent(talk('k.friend'));
    director.choose('a');
    expect(director.onMapEvent(talk('k.friend'))).toBeUndefined();
  });

  it('can repeat when once is false', () => {
    const director = new LifeEventDirector([{ ...QUIZ, once: false }]);
    for (let i = 0; i < 3; i++) { director.onMapEvent(talk('k.friend')); director.choose('a'); }
    expect(director.state.stat('friendship')).toBe(6);
  });

  it('does not record a cancelled choice, so the event can start again', () => {
    const director = new LifeEventDirector([QUIZ]);
    director.onMapEvent(talk('k.friend'));
    director.cancel();
    expect(director.state.history).toEqual([]);
    expect(director.onMapEvent(talk('k.friend'))).toBeDefined();
  });

  it('does not start another event while a choice is pending', () => {
    const director = new LifeEventDirector([QUIZ, { ...QUIZ, id: 'quiz2', trigger: { eventKey: 'k.other' } }]);
    director.onMapEvent(talk('k.friend'));
    expect(director.onMapEvent(talk('k.other'))).toBeUndefined();
    expect(director.pending?.event.id).toBe('quiz');
  });

  it('uses past choices as conditions for later events', () => {
    const director = new LifeEventDirector([QUIZ, FOLLOW_UP]);
    expect(director.onMapEvent(talk('k.mother'))).toBeUndefined();
    director.onMapEvent(talk('k.friend'));
    director.choose('b');
    expect(director.state.flag('picked-b')).toBe(true);
    expect(director.onMapEvent(talk('k.mother'))).toEqual({ speaker: undefined, lines: ['Bをえらんだんだね。'] });
    // A choiceless event is recorded immediately and does not wait for a choice.
    expect(director.pending).toBeNull();
    expect(director.state.history.at(-1)).toEqual({ eventId: 'follow', choiceId: null });
  });

  it('starts from a given state (e.g. restored from a save)', () => {
    const state = LifeState.from({ v: 1, stats: {}, flags: {}, history: [{ eventId: 'quiz', choiceId: 'b' }] });
    const director = new LifeEventDirector([QUIZ, FOLLOW_UP], state);
    expect(director.onMapEvent(talk('k.friend'))).toBeUndefined();
    expect(director.onMapEvent(talk('k.mother'))?.lines).toEqual(['Bをえらんだんだね。']);
  });
});

describe('childhood samples', () => {
  it('tablet ad: what you chose changes what your mother says later', () => {
    for (const [choice, expected] of [['tap', /いれる まえに おしえてね/], ['ask-parent', /きいてくれて たすかった/]] as const) {
      const director = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS);
      expect(director.onMapEvent(talk('home.mother'))).toBeUndefined();
      director.onMapEvent(talk('home.tablet'));
      director.choose(choice);
      expect(director.onMapEvent(talk('home.mother'))?.lines.join('')).toMatch(expected);
    }
  });

  it('tablet ad: closing it leaves your mother on her default lines', () => {
    const director = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS);
    director.onMapEvent(talk('home.tablet'));
    director.choose('close');
    expect(director.onMapEvent(talk('home.mother'))).toBeUndefined();
  });

  it('no choice is a dead end: every choice gives a result and the story goes on', () => {
    for (const def of CHILDHOOD_SAMPLE_EVENTS) {
      for (const choice of def.choices ?? []) {
        const director = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS);
        director.onMapEvent(talk(def.trigger.eventKey));
        expect(director.choose(choice.id)?.lines.length, `${def.id}/${choice.id}`).toBeGreaterThan(0);
        expect(director.pending).toBeNull();
      }
    }
  });
});

describe('LifeState', () => {
  it('round-trips through JSON', () => {
    const state = new LifeState();
    state.apply([{ kind: 'stat', stat: 'friendship', add: 3 }, { kind: 'flag', flag: 'x' }, { kind: 'flag', flag: 'y', value: false }]);
    state.record('quiz', 'a');
    state.record('follow', null);
    const copy = LifeState.from(JSON.parse(JSON.stringify(state)));
    expect(copy.toJSON()).toEqual(state.toJSON());
  });

  it('drops corrupt values instead of failing', () => {
    const state = LifeState.from({ v: 1, stats: { a: 1, b: 'x', c: Infinity }, flags: { f: true, g: 1 },
      history: [{ eventId: 'e', choiceId: 'c' }, { eventId: 3 }, null, { eventId: 'n', choiceId: null }] });
    expect(state.toJSON()).toEqual({ v: 1, stats: { a: 1 }, flags: { f: true },
      history: [{ eventId: 'e', choiceId: 'c' }, { eventId: 'n', choiceId: null }] });
    for (const raw of [null, 'x', { v: 2 }, { v: 1, stats: [], flags: null, history: {} }]) {
      expect(LifeState.from(raw).toJSON()).toEqual({ v: 1, stats: {}, flags: {}, history: [] });
    }
  });
});

describe('Game integration (DOM-independent)', () => {
  function world(): World {
    const width = 6, height = 6;
    const npc: InteractionDef = { id: 'npc', kind: 'npc', name: 'ともだち', x: 2, y: 2, solid: true,
      eventKey: 'k.friend', lines: ['ふだんの せりふ。'] };
    const def = { id: 'test', name: 'テスト', kind: 'outdoor' as const, width, height,
      ground: new Uint8Array(width * height), objects: [], portals: [], interactions: [npc] };
    const solid = new Uint8Array(width * height);
    solid[npc.y * width + npc.x] = 1;
    const area: AreaRuntime = { def, width, height, ground: def.ground, solid, portalAt: new Map(),
      interactionAt: new Map([[npc.y * width + npc.x, npc]]), objects: [], interactions: [npc] };
    return { areas: new Map([['test', area]]), facilities: new Map(),
      start: { areaId: 'test', x: 2, y: 3, facing: 'up' }, variant: { id: 'childhood', stage: 'childhood' } };
  }

  it('shows the event intro instead of the default lines, then the default lines after it is done', () => {
    const director = new LifeEventDirector([QUIZ]);
    const game = new Game(world(), { sink: director });
    game.action();
    expect(game.dialog).toMatchObject({ speaker: 'ともだち', lines: ['やあ。'] });
    game.action(); // finish the intro
    expect(game.dialog).toBeNull();
    expect(director.pending?.event.id).toBe('quiz');
    director.choose('a');
    game.action();
    expect(game.dialog?.lines).toEqual(['ふだんの せりふ。']);
  });
});
