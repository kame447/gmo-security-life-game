import { describe, expect, it } from 'vitest';
import { feetAtTile } from '../src/core/coords';
import { LifeEventDirector } from '../src/events/director';
import { CHILDHOOD_SAMPLE_EVENTS } from '../src/events/samples/childhood';
import { validateLifeEvents } from '../src/events/life-events';
import { canStand } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { STORY_ADVANCE_EVENT, STORY_BEDROOM, STORY_BIKE, STORY_ERRAND_ALLOWANCE_YEN, STORY_ERRANDS, STORY_STAGES, type StoryErrand } from '../src/story/config';
import { errandPrice, StoryDirector } from '../src/story/director';
import { STORY_EVENTS } from '../src/story/events';
import { parseStorySave } from '../src/story/state';
import { buildWorld } from '../src/world';

function setup(saved?: ReturnType<StoryDirector['save']>, gameSave?: unknown) {
  const life = new LifeEventDirector([...CHILDHOOD_SAMPLE_EVENTS, ...STORY_EVENTS]);
  const story = saved ? StoryDirector.resume(saved, life) : StoryDirector.newGame(life);
  const notices: string[] = [];
  const mails: string[] = [];
  const game = new Game(buildWorld(), { save: gameSave, initialPhoneOwned: false, start: story.startPoint,
    portalGuard: p => story.canUsePortal(p), canRide: () => story.canRide,
    sink: { onMapEvent: e => story.onMapEvent(e) ?? life.onMapEvent(e) } });
  story.attach({
    say: (s, l) => game.say(s, l), warp: sp => game.warp(sp), areaId: () => game.player.areaId,
    setPhoneOwned: o => game.phone.setOwned(o), changeMoney: d => game.assets.changeMoney(d).ok,
    addItem: id => game.assets.addItem(id, 1).ok, money: () => game.assets.moneyYen,
    itemCount: id => game.assets.quantity(id), notice: t => { notices.push(t); },
    deliverMail: id => { mails.push(id); },
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
  /** Warp onto the first tile the player can stand on in the area. */
  const goTo = (areaId: string) => {
    const area = game.world.areas.get(areaId)!;
    for (let y = 1; y < area.height; y++) for (let x = 1; x < area.width; x++) {
      if (canStand(area, feetAtTile(x, y).x, feetAtTile(x, y).y) && game.warp({ areaId, x, y, facing: 'up' })) return;
    }
    throw new Error(`cannot stand in ${areaId}`);
  };
  /** Do one errand: talk to its person, or for a purchase errand buy the item as the shop screen would. */
  const errand = (item: StoryErrand) => {
    if (item.buy) {
      // The story leaves the clerk to the shop screen (not wired here, so the clerk's usual line shows).
      talk(item.eventKey);
      expect(story.errandsDone).not.toContain(item.id);
      closeDialogs();
      expect(game.assets.apply({ moneyDeltaYen: -errandPrice(item)!, itemDeltas: [{ itemId: item.buy.itemId, quantityDelta: 1 }] }).ok).toBe(true);
      settle();
      return;
    }
    talk(item.eventKey); closeDialogs();
  };
  return { life, story, game, notices, mails, goTo, tick, settle, closeDialogs, choose, talk, errand };
}

const notebookPrice = errandPrice(STORY_ERRANDS.find(e => e.buy)!)!;

/** Walk the prologue until the first stage starts (choosing the given bicycle site). */
function finishPrologue(t: ReturnType<typeof setup>, site = 'site-a') {
  t.settle();
  t.talk('home.mother'); t.closeDialogs();
  for (const errand of STORY_ERRANDS) t.errand(errand);
  t.settle();
  t.talk('home.mother');
  t.choose(site);
  t.settle();
}

describe('story flow', () => {
  it('defines valid story events', () => {
    expect(validateLifeEvents([...CHILDHOOD_SAMPLE_EVENTS, ...STORY_EVENTS])).toEqual([]);
    for (const stage of STORY_STAGES) for (const f of stage.steps) expect(STORY_EVENTS.some(e => e.id === f.eventId), f.eventId).toBe(true);
  });

  it('wakes up upstairs without a phone, bicycle or way out before meeting the mother', () => {
    const t = setup();
    expect(t.game.player.areaId).toBe(STORY_BEDROOM.areaId);
    expect(t.game.phone.isOwned).toBe(false);
    expect(t.game.toggleBicycle()).toBe(false);
    t.tick();
    expect(t.game.dialog?.lines[0]).toContain('朝だ');
    t.closeDialogs();
    // Walk from the bottom of the stairs to the front door: the door stops the player and the mother calls out.
    t.game.player = { areaId: 'home-family-interior', ...feetAtTile(7, 10), facing: 'down' };
    for (let i = 0; i < 60; i++) t.game.update(1 / 30, { dir: 'down', run: false });
    expect(t.game.player.areaId).toBe('home-family-interior');
    expect(t.game.dialog?.speaker).toBe('母');
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
      if (errand.buy) t.errand(errand);
      else {
        t.talk(errand.eventKey);
        expect(t.game.dialog?.speaker).toBe(errand.speaker);
        t.closeDialogs();
      }
      expect(t.story.errandsDone).toHaveLength(i + 1);
    }
    expect(t.game.assets.quantity('notebook')).toBe(1);
    expect(t.story.phase).toBe('return-home');
    expect(t.story.canRide).toBe(false);
  });

  it('hands the notebook over in conversation when the money is short, so the errand cannot get stuck', () => {
    const t = setup();
    t.settle();
    t.talk('home.mother'); t.closeDialogs();
    expect(t.game.assets.changeMoney(-t.game.assets.moneyYen).ok).toBe(true);
    const konbini = STORY_ERRANDS.find(e => e.buy)!;
    t.talk(konbini.eventKey);
    expect(t.game.dialog?.speaker).toBe(konbini.speaker);
    t.closeDialogs();
    expect(t.story.errandsDone).toContain(konbini.id);
    expect(t.game.assets.quantity('notebook')).toBe(1);
  });

  it('gives the errand money with the phone, and the notebook price is on the konbini shelf', () => {
    const t = setup();
    const before = t.game.assets.moneyYen;
    t.settle();
    t.talk('home.mother'); t.closeDialogs();
    expect(t.game.assets.moneyYen).toBe(before + STORY_ERRAND_ALLOWANCE_YEN);
    expect(notebookPrice).toBeGreaterThan(0);
    expect(notebookPrice).toBeLessThanOrEqual(STORY_ERRAND_ALLOWANCE_YEN);
  });

  it('marks the remaining errands and then the home on the minimap', () => {
    const t = setup();
    t.settle();
    expect(t.story.mapGoals()).toBeUndefined();
    t.talk('home.mother');
    t.closeDialogs();
    const facilities = new Set(t.game.world.facilities.keys());
    for (const errand of STORY_ERRANDS) expect(facilities.has(errand.facilityId), errand.id).toBe(true);
    expect(t.story.mapGoals()).toEqual({ pending: STORY_ERRANDS.map(e => e.facilityId), done: [] });
    t.talk(STORY_ERRANDS[0].eventKey);
    t.closeDialogs();
    expect(t.story.mapGoals()?.done).toEqual([STORY_ERRANDS[0].facilityId]);
    expect(t.story.mapGoals()?.pending).not.toContain(STORY_ERRANDS[0].facilityId);
    for (const errand of STORY_ERRANDS.slice(1)) t.errand(errand);
    expect(t.story.mapGoals()?.pending).toEqual(['home-family']);
    expect(facilities.has('home-family')).toBe(true);
  });

  it('buys the bicycle at the fair site with the change left over', () => {
    const t = setup();
    const before = t.game.assets.moneyYen;
    finishPrologue(t, 'site-a');
    expect(t.game.assets.moneyYen).toBe(before + STORY_ERRAND_ALLOWANCE_YEN - notebookPrice + STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen);
    expect(t.story.phase).toBe('stage');
    expect(t.story.stage.id).toBe(STORY_STAGES[0].id);
    expect(t.story.canRide).toBe(true);
  });

  it('still gets the bicycle after the fake site, with the warning signs explained and no money left over', () => {
    const t = setup();
    const before = t.game.assets.moneyYen;
    t.settle();
    t.talk('home.mother'); t.closeDialogs();
    for (const errand of STORY_ERRANDS) t.errand(errand);
    t.settle();
    t.talk('home.mother');
    t.choose(STORY_BIKE.fakeChoiceId);
    const said: string[] = [];
    for (let i = 0; i < 30; i++) { if (t.game.dialog) { said.push(...t.game.dialog.lines); t.closeDialogs(); } t.tick(0); }
    expect(said.join()).toContain('偽の通販サイト');
    expect(t.story.save().bikeChoice).toBe(STORY_BIKE.fakeChoiceId);
    expect(t.game.assets.moneyYen).toBe(before + STORY_ERRAND_ALLOWANCE_YEN - notebookPrice);
    expect(t.story.canRide).toBe(true);
  });

  it('plays every stage to the end without a timer, following earlier choices', () => {
    for (const pick of ['first', 'last'] as const) {
      const t = setup();
      finishPrologue(t);
      const seen: string[] = [];
      const said: string[] = [];
      for (let i = 0; i < 2000 && t.story.phase !== 'finished'; i++) {
        const pending = t.life.pending;
        if (pending) {
          const choices = pending.event.choices!;
          const choice = pending.event.id === STORY_ADVANCE_EVENT ? 'go' : choices[pick === 'first' ? 0 : choices.length - 1].id;
          seen.push(pending.event.id);
          t.choose(choice);
          continue;
        }
        if (t.game.dialog) { said.push(...t.game.dialog.lines); t.closeDialogs(); continue; }
        const step = t.story.currentStep;
        if (t.story.phase === 'milestone') {
          t.tick(1);
          if (!t.game.dialog && t.story.phase === 'milestone') t.talk('home.bed');
          continue;
        }
        if (step?.trigger.kind === 'place' && !step.trigger.place.areaIds.includes(t.game.player.areaId)) {
          t.goTo(step.trigger.place.areaIds[0]);
        }
        t.tick(1);
      }
      expect(t.story.phase).toBe('finished');
      expect(t.story.stage.id).toBe(STORY_STAGES.at(-1)!.id);
      expect(said.join()).toContain('振り返ると');
      expect(t.mails.length).toBeGreaterThan(0);
      // The career choice in high school decides the next stage's events.
      if (pick === 'first') expect(seen).toContain('story.young.university');
      else { expect(seen).toContain('story.young.first-job'); expect(seen).not.toContain('story.young.university'); }
    }
  });

  it('waits at the milestone until the player chooses to move on at the bed', () => {
    const t = setup();
    finishPrologue(t);
    for (let i = 0; i < 500 && t.story.phase === 'stage'; i++) {
      const pending = t.life.pending;
      if (pending) { t.choose(pending.event.choices![0].id); continue; }
      t.closeDialogs();
      const step = t.story.currentStep;
      if (step?.trigger.kind === 'place') t.goTo(step.trigger.place.areaIds[0]);
      t.tick(1);
    }
    expect(t.story.phase).toBe('milestone');
    for (let i = 0; i < 100; i++) { t.tick(1); t.closeDialogs(); }
    expect(t.story.stage.id).toBe(STORY_STAGES[0].id);
    t.talk('home.bed');
    t.choose('stay');
    t.settle();
    expect(t.story.phase).toBe('milestone');
    t.talk('home.bed');
    t.choose('go');
    t.settle();
    expect(t.story.stage.id).toBe(STORY_STAGES[1].id);
    expect(t.game.player.areaId).toBe(STORY_BEDROOM.areaId);
  });

  it('resumes from a save, and an old timed save restarts its stage', () => {
    const t = setup();
    finishPrologue(t);
    const story = t.story.save();
    expect(parseStorySave(JSON.parse(JSON.stringify(story)))).toEqual(story);
    const resumed = setup(story, { ...t.game.serialize(), story });
    expect(resumed.story.phase).toBe('stage');
    expect(resumed.game.phone.isOwned).toBe(true);
    expect(resumed.story.canRide).toBe(true);
    expect(parseStorySave({ v: 1, phase: 'stage-ending', errandsDone: ['nope', 'school'], bikeChoice: 'site-a', stageIndex: 99, stageElapsed: 50, forcedDone: ['x'] }))
      .toMatchObject({ v: 2, phase: 'stage', errandsDone: ['school'], stageIndex: STORY_STAGES.length - 1, stepsDone: [], choices: {} });
    expect(parseStorySave({ v: 3 })).toBeNull();
  });
});
