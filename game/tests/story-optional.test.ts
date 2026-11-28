import { describe, expect, it } from 'vitest';
import { LifeEventDirector } from '../src/events/director';
import { STORY_PLACES, STORY_STAGES } from '../src/story/config';
import { StoryDirector } from '../src/story/director';
import { STORY_EVENTS } from '../src/story/events';
import { OPTIONAL_STORY_EVENTS } from '../src/story/optional';
import { newStoryState, parseStorySave, type StorySave } from '../src/story/state';
import { buildWorld } from '../src/world';

function setup(saved: StorySave) {
  const life = new LifeEventDirector(STORY_EVENTS);
  const story = StoryDirector.resume(saved, life);
  let areaId = 'home-family-2f', money = 1_000;
  const said: string[] = [];
  story.attach({
    say: (_speaker, lines) => { said.push(...lines); return true; }, warp: spawn => { areaId = spawn.areaId; return true; },
    areaId: () => areaId, setPhoneOwned: () => {}, changeMoney: value => { money += value; return true; },
    addItem: () => true, money: () => money, itemCount: () => 0, notice: () => {}, deliverMail: () => {},
  });
  const talk = (area: string, eventKey: string) => story.onMapEvent({ type: 'interact', areaId: area, eventKey, interactionId: 'test-person' });
  const choose = (id: string) => { const outcome = life.choose(id)!; expect(outcome).toBeTruthy(); story.onLifeOutcome(outcome); return outcome; };
  return { life, story, said, talk, choose, goTo: (value: string) => { areaId = value; } };
}

describe('optional school and everyday activities', () => {
  it('binds every event to an existing person and stage while keeping it out of mandatory steps', () => {
    const world = buildWorld();
    const required = STORY_STAGES.flatMap(stage => stage.steps.map(step => step.eventId));
    for (const item of OPTIONAL_STORY_EVENTS) {
      expect(required).not.toContain(item.event.id);
      expect(item.stageIds.every(id => STORY_STAGES.some(stage => stage.id === id))).toBe(true);
      expect(world.areas.get(item.areaId)?.interactions.some(person => person.eventKey === item.eventKey), item.event.id).toBe(true);
      expect(item.event.trigger.eventKey).not.toBe(item.eventKey);
    }
  });

  it('does not interrupt the prologue or trigger in a different area or stage', () => {
    for (const phase of ['meet-mother', 'errands', 'return-home', 'finished'] as const) {
      const t = setup({ ...newStoryState(), phase });
      expect(t.talk('school-classroom-interior', 'school.classmate')).toBeUndefined();
      expect(t.life.pending).toBeNull();
      expect(t.life.onMapEvent({ type: 'interact', areaId: 'school-classroom-interior', eventKey: 'school.classmate', interactionId: 'x' })).toBeUndefined();
    }
    const t = setup({ ...newStoryState(), phase: 'stage', stageIndex: 1 });
    expect(t.talk('school-classroom-interior', 'school.classmate')).toBeUndefined();
    expect(t.talk('town-neighbor', 'school.high.friend')).toBeUndefined();
    expect(t.life.pending).toBeNull();
  });

  it('records the choice and memory without advancing or resetting the current required event', () => {
    const t = setup({ ...newStoryState(), phase: 'stage', stepsDone: ['story.jh.entrance'], stepElapsed: 7 });
    const before = t.story.currentStep;
    expect(t.talk('school-classroom-interior', 'school.classmate')).toBeTruthy();
    const outcome = t.choose('listen');
    expect(t.story.choices['story.optional.jh.lunch']).toBe('listen');
    expect(t.story.stepsDone).toEqual(['story.jh.entrance']);
    expect(t.story.save().stepElapsed).toBe(7);
    expect(t.story.currentStep).toBe(before);
    expect(t.story.evaluate().dailyMemories).toContain('中学の昼休みに、友達の好きなことを知った。');
    t.story.onLifeOutcome(outcome);
    expect(t.story.evaluate().ties).toBe(1);
  });

  it('does not replay a completed or declined activity after saving and reloading', () => {
    for (const selected of ['listen', 'skip']) {
      const t = setup({ ...newStoryState(), phase: 'milestone' });
      t.talk('school-classroom-interior', 'school.classmate'); t.choose(selected);
      const saved = parseStorySave(JSON.parse(JSON.stringify(t.story.save())))!;
      const resumed = setup(saved);
      expect(resumed.story.phase).toBe('milestone');
      expect(resumed.talk('school-classroom-interior', 'school.classmate')).toBeUndefined();
      expect(resumed.life.pending).toBeNull();
      expect(resumed.story.choices['story.optional.jh.lunch']).toBe(selected);
      if (selected === 'skip') expect(resumed.story.evaluate().dailyMemories).toEqual([]);
    }
  });

  it('can retry after cancelling before choosing and preserves an untouched legacy save', () => {
    const state = { ...newStoryState(), phase: 'stage' as const };
    const t = setup(state);
    t.talk('school-classroom-interior', 'school.classmate'); t.life.cancel();
    t.story.tick(0, true);
    expect(t.story.choices).toEqual({});
    expect(t.talk('school-classroom-interior', 'school.classmate')).toBeTruthy();
    expect(state).toEqual({ ...newStoryState(), phase: 'stage' });
    t.choose('share');
    expect(t.story.choices['story.optional.jh.lunch']).toBe('share');
  });

  it.each(OPTIONAL_STORY_EVENTS)('offers and records $event.title once during its intended stage', item => {
    const stageIndex = STORY_STAGES.findIndex(stage => stage.id === item.stageIds[0]);
    const t = setup({ ...newStoryState(), phase: 'milestone', stageIndex });
    t.talk(item.areaId, item.eventKey);
    expect(t.life.pending?.event.id).toBe(item.event.id);
    t.choose(item.event.choices![0].id);
    expect(t.story.stepsDone).toEqual([]);
    expect(t.story.phase).toBe('milestone');
    expect(t.talk(item.areaId, item.eventKey)).toBeUndefined();
  });
});

describe('dedicated life-stage buildings', () => {
  it.each([
    [0, 'story.jh.exam', STORY_PLACES.highSchool],
    [1, 'story.hs.entrance', STORY_PLACES.highSchool],
    [2, 'story.univ.entrance', STORY_PLACES.university],
    [3, 'story.work.first-day', STORY_PLACES.office],
  ] as const)('starts %s/%s only inside the dedicated building', (stageIndex, eventId, place) => {
    const stage = STORY_STAGES[stageIndex];
    const stepIndex = stage.steps.findIndex(step => step.eventId === eventId);
    const t = setup({ ...newStoryState(), phase: 'stage', stageIndex, stepsDone: stage.steps.slice(0, stepIndex).map(step => step.eventId) });
    t.goTo('town-neighbor'); t.story.tick(1, true);
    expect(t.life.pending).toBeNull();
    expect(t.said).toEqual([]);
    expect(t.story.mapGoals()?.pending).toEqual([place.facilityId]);
    t.goTo(place.areaIds[0]); t.story.tick(0, true);
    expect(t.said.length).toBeGreaterThan(0);
    expect(t.life.pending?.event.id === eventId || t.story.stepsDone.includes(eventId)).toBe(true);
  });
});
