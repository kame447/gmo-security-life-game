import { describe, expect, it } from 'vitest';
import { feetAtTile } from '../src/core/coords';
import { LifeEventDirector } from '../src/events/director';
import { CHILDHOOD_SAMPLE_EVENTS } from '../src/events/samples/childhood';
import { validateLifeEvents } from '../src/events/life-events';
import { canStand } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { STORY_BEDROOM, STORY_BIKE, STORY_ERRANDS, STORY_STAGES } from '../src/story/config';
import { mailSpeaker, StoryDirector } from '../src/story/director';
import { STORY_EVENTS } from '../src/story/events';
import { parseStorySave } from '../src/story/state';
import { buildWorld } from '../src/world';

function setup(saved?: ReturnType<StoryDirector['save']>, gameSave?: unknown) {
  const life = new LifeEventDirector([...CHILDHOOD_SAMPLE_EVENTS, ...STORY_EVENTS]);
  const story = saved ? StoryDirector.resume(saved, life) : StoryDirector.newGame(life);
  const notices: string[] = [];
  const game = new Game(buildWorld(), { save: gameSave, initialPhoneOwned: false, start: story.startPoint,
    portalGuard: p => story.canUsePortal(p), canRide: () => story.canRide,
    sink: { onMapEvent: e => story.onMapEvent(e) ?? life.onMapEvent(e) } });
  story.attach({
    say: (s, l) => game.say(s, l), warp: sp => game.warp(sp), areaId: () => game.player.areaId,
    setPhoneOwned: o => game.phone.setOwned(o), changeMoney: d => game.assets.changeMoney(d).ok,
    addItem: id => game.assets.addItem(id, 1).ok, notice: t => { notices.push(t); },
  });
  /** One frame of the real loop: the story only advances while nothing is on screen. */
  const tick = (dt = 0.1) => story.tick(dt, !game.dialog && !life.pending);
  const closeDialogs = () => { for (let i = 0; i < 50 && game.dialog; i++) game.action(); };
  /** Read everything the story wants to say, without letting stage time pass. */
  const settle = () => { for (let i = 0; i < 30; i++) { closeDialogs(); tick(0); } closeDialogs(); };
  const choose = (choiceId: string) => {
    closeDialogs();
    const outcome = life.choose(choiceId);
    expect(outcome).not.toBeNull();
    story.onLifeOutcome(outcome!);
    game.say('', outcome!.lines); closeDialogs();
  };
  const talk = (eventKey: string) => {
    for (const area of game.world.areas.values()) {
      const target = area.interactions.find(i => i.eventKey === eventKey);
      if (!target) continue;
      for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
        const p = feetAtTile(x, y);
        if (!canStand(area, p.x, p.y)) continue;
        for (const facing of ['up', 'right', 'down', 'left'] as const) {
          game.player = { areaId: area.def.id, ...p, facing };
          if (game.facingInteraction()?.id === target.id) { game.action(); return; }
        }
      }
    }
    throw new Error(`no reachable interaction for ${eventKey}`);
  };
  return { life, story, game, notices, tick, settle, closeDialogs, choose, talk };
}

/** Walk the prologue until the first stage starts (choosing the given bicycle site). */
function finishPrologue(t: ReturnType<typeof setup>, site = 'site-a') {
  t.settle();
  t.talk('home.mother'); t.closeDialogs();
  for (const errand of STORY_ERRANDS) { t.talk(errand.eventKey); t.closeDialogs(); }
  t.settle();
  t.talk('home.mother');
  t.choose(site);
  t.settle();
}

describe('story flow', () => {
  it('defines valid story events', () => {
    expect(validateLifeEvents([...CHILDHOOD_SAMPLE_EVENTS, ...STORY_EVENTS])).toEqual([]);
    for (const stage of STORY_STAGES) for (const f of stage.forced) expect(STORY_EVENTS.some(e => e.id === f.eventId)).toBe(true);
  });

  it('wakes up upstairs without a phone, bicycle or way out before meeting the mother', () => {
    const t = setup();
    expect(t.game.player.areaId).toBe(STORY_BEDROOM.areaId);
    expect(t.game.phone.isOwned).toBe(false);
    expect(t.game.toggleBicycle()).toBe(false);
    t.tick();
    expect(t.game.dialog?.lines[0]).toContain('あさだ');
    t.closeDialogs();
    // Walk from the bottom of the stairs to the front door: the door stops the player and the mother calls out.
    t.game.player = { areaId: 'home-family-interior', ...feetAtTile(7, 10), facing: 'down' };
    for (let i = 0; i < 60; i++) t.game.update(1 / 30, { dir: 'down', run: false });
    expect(t.game.player.areaId).toBe('home-family-interior');
    expect(t.game.dialog?.speaker).toBe('おかあさん');
  });

  it('gives the phone, then requires every errand before the bicycle purchase', () => {
    const t = setup();
    t.settle();
    t.talk('home.mother');
    expect(t.game.phone.isOwned).toBe(true);
    expect(t.story.phase).toBe('errands');
    t.closeDialogs();
    t.talk('home.mother');
    expect(t.game.dialog?.lines[0]).toContain('あとは');
    t.closeDialogs();
    for (const [i, errand] of STORY_ERRANDS.entries()) {
      t.talk(errand.eventKey);
      expect(t.game.dialog?.speaker).toBe(errand.speaker);
      t.closeDialogs();
      expect(t.story.errandsDone).toHaveLength(i + 1);
    }
    expect(t.game.assets.snapshot().items.some(item => item.itemId === 'bread')).toBe(true);
    expect(t.story.phase).toBe('return-home');
    expect(t.story.canRide).toBe(false);
  });

  it('buys the bicycle at the fair site with the change left over', () => {
    const t = setup();
    const before = t.game.assets.moneyYen;
    finishPrologue(t, 'site-a');
    expect(t.game.assets.moneyYen).toBe(before + STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen);
    expect(t.story.phase).toBe('stage');
    expect(t.story.stage.id).toBe(STORY_STAGES[0].id);
    expect(t.story.canRide).toBe(true);
  });

  it('still gets the bicycle after the fake site, with the warning signs explained and no money left over', () => {
    const t = setup();
    const before = t.game.assets.moneyYen;
    t.settle();
    t.talk('home.mother'); t.closeDialogs();
    for (const errand of STORY_ERRANDS) { t.talk(errand.eventKey); t.closeDialogs(); }
    t.settle();
    t.talk('home.mother');
    t.choose(STORY_BIKE.fakeChoiceId);
    const said: string[] = [];
    for (let i = 0; i < 30; i++) { if (t.game.dialog) { said.push(...t.game.dialog.lines); t.closeDialogs(); } t.tick(0); }
    expect(said.join()).toContain('にせの つうはんサイト');
    expect(t.story.save().bikeChoice).toBe(STORY_BIKE.fakeChoiceId);
    expect(t.game.assets.moneyYen).toBe(before);
    expect(t.story.canRide).toBe(true);
  });

  it('counts time only while exploring and runs every forced event before the next stage', () => {
    const t = setup();
    finishPrologue(t);
    const stage = STORY_STAGES[0];
    // A dialog stops the clock.
    t.game.say('test', ['…']);
    t.tick(10);
    expect(t.story.stageElapsed).toBe(0);
    t.closeDialogs();
    // Run out the clock without visiting the classroom (the area-triggered event).
    const seen: string[] = [];
    for (let i = 0; i < 5000 && t.story.stage.id === stage.id; i++) {
      t.tick(0.5);
      const pending = t.life.pending;
      if (pending) { seen.push(pending.event.id); t.choose(pending.event.choices![0].id); }
      t.closeDialogs();
    }
    expect(t.story.stage.id).toBe(STORY_STAGES[1].id);
    for (const f of stage.forced) {
      const def = STORY_EVENTS.find(e => e.id === f.eventId)!;
      if (def.choices?.length) expect(seen).toContain(f.eventId);
    }
    expect(t.life.state.experienced('story.jh.entrance')).toBe(true);
    expect(t.notices.some(n => n.includes('のこり'))).toBe(true);
    // The new stage starts in the bedroom.
    expect(t.game.player.areaId).toBe(STORY_BEDROOM.areaId);
  });

  it('starts an area-triggered forced event on entering that area', () => {
    const t = setup();
    finishPrologue(t);
    t.settle();
    t.game.warp({ areaId: 'school-classroom-interior', x: 8, y: 10, facing: 'up' });
    // The entrance ceremony held for the classroom comes first.
    for (let i = 0; i < 10 && !t.life.pending; i++) { t.tick(0); if (!t.life.pending) t.closeDialogs(); }
    expect(t.life.state.experienced('story.jh.entrance')).toBe(true);
    expect(t.life.pending?.event.id).toBe('story.jh.club');
  });

  it('calls the player to school by mail and holds school events until they get there', () => {
    const t = setup();
    finishPrologue(t);
    const exam = STORY_STAGES[0].forced.find(f => f.eventId === 'story.jh.exam')!;
    expect(exam.venue).toBeDefined();
    // Away from school (at home): run past the exam time; only a summons mail arrives.
    for (let i = 0; i < 300; i++) { t.tick(0.5); t.closeDialogs(); }
    expect(t.story.stageElapsed).toBeGreaterThan((exam.trigger as { atSeconds: number }).atSeconds);
    expect(t.life.state.experienced(exam.eventId)).toBe(false);
    expect(t.notices.some(n => n.includes(`${exam.venue!.from} から メール`))).toBe(true);
    expect(t.story.status().detail).toContain(exam.venue!.place);
    // At school, the held events start as spoken scenes.
    t.game.warp({ areaId: exam.venue!.areas[0], x: 8, y: 10, facing: 'up' });
    for (let i = 0; i < 50 && t.life.pending?.event.id !== exam.eventId; i++) {
      t.tick(0);
      if (t.life.pending && t.life.pending.event.id !== exam.eventId) t.choose(t.life.pending.event.choices![0].id);
      if (t.life.pending?.event.id !== exam.eventId) t.closeDialogs();
    }
    expect(t.life.pending?.event.id).toBe(exam.eventId);
    expect(t.game.dialog?.speaker).toBe(STORY_EVENTS.find(e => e.id === exam.eventId)!.speaker);
    expect(t.life.state.experienced('story.jh.entrance')).toBe(true);
  });

  it("delivers a classmate's news as a phone mail when the player is not at school", () => {
    const t = setup();
    finishPrologue(t);
    const festival = STORY_STAGES[1].forced.find(f => f.eventId === 'story.hs.festival')!;
    expect(festival.mail).toBeDefined();
    for (let i = 0; i < 5000 && t.life.pending?.event.id !== festival.eventId; i++) {
      t.tick(0.5);
      if (t.life.pending && t.life.pending.event.id !== festival.eventId) t.choose(t.life.pending.event.choices![0].id);
      if (t.life.pending?.event.id !== festival.eventId) t.closeDialogs();
    }
    expect(t.game.player.areaId).not.toBe('school-classroom-interior');
    expect(t.game.dialog?.speaker).toBe(mailSpeaker(festival.mail!.from));
    expect(t.life.pending?.speaker).toBe(mailSpeaker(festival.mail!.from));
  });

  it('resumes from a save and repairs damaged fields', () => {
    const t = setup();
    finishPrologue(t);
    for (let i = 0; i < 40; i++) { t.tick(0.5); t.closeDialogs(); if (t.life.pending) t.choose(t.life.pending.event.choices![0].id); }
    const data = t.game.serialize();
    const story = t.story.save();
    expect(parseStorySave(JSON.parse(JSON.stringify(story)))).toEqual(story);
    const resumed = setup(story, { ...data, story });
    expect(resumed.story.phase).toBe('stage');
    expect(resumed.story.stageElapsed).toBe(story.stageElapsed);
    expect(resumed.game.phone.isOwned).toBe(true);
    expect(resumed.story.canRide).toBe(true);
    expect(parseStorySave({ ...story, stageElapsed: -5, errandsDone: ['nope', 'school'], stageIndex: 99 }))
      .toMatchObject({ stageElapsed: 0, errandsDone: ['school'], stageIndex: STORY_STAGES.length - 1 });
    expect(parseStorySave({ v: 2 })).toBeNull();
  });
});
