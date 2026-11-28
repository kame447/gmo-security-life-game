import { describe, expect, it, vi } from 'vitest';
import { LifeEventDirector } from '../src/events/director';
import { STORY_ADVANCE_GO, STORY_BED_KEY, STORY_BEDROOM, STORY_STAGES } from '../src/story/config';
import { StoryDirector, type StoryHost } from '../src/story/director';
import { STORY_EVENTS } from '../src/story/events';
import { evaluateLife, type LifeEvaluation } from '../src/story/score';
import { newStoryState, parseStorySave, type StorySave } from '../src/story/state';

function setup(saved?: StorySave) {
  const state = saved ?? {
    ...newStoryState(), phase: 'milestone' as const, stageIndex: STORY_STAGES.length - 1,
    bikeChoice: 'site-a', choices: { 'story.jh.club': 'culture', 'story.work.usb': 'report' },
  };
  const life = new LifeEventDirector(STORY_EVENTS);
  const story = StoryDirector.resume(state, life);
  let dialog = false;
  let money = 600_000;
  const showResult = vi.fn<(evaluation: LifeEvaluation) => void>();
  const host: StoryHost = {
    say: () => { dialog = true; return true; }, warp: () => true, areaId: () => STORY_BEDROOM.areaId,
    setPhoneOwned: () => {}, changeMoney: delta => { money += delta; return true; },
    addItem: () => true, money: () => money, itemCount: () => 0, notice: () => {}, deliverMail: () => {}, showResult,
  };
  story.attach(host);
  const chooseAtBed = (choiceId: string) => {
    story.onMapEvent({ type: 'interact', areaId: STORY_BEDROOM.areaId, interactionId: 'bed', eventKey: STORY_BED_KEY });
    const outcome = life.choose(choiceId);
    expect(outcome).not.toBeNull();
    story.onLifeOutcome(outcome!);
  };
  return { story, showResult, host, chooseAtBed, tick: () => story.tick(0, !dialog),
    closeDialog: () => { dialog = false; }, get dialog() { return dialog; } };
}

describe('dedicated life reflection flow', () => {
  it('waits for the final milestone dialogue, then finishes before opening exactly once', () => {
    const t = setup();
    let savedAtOpen: StorySave | undefined;
    t.showResult.mockImplementation(() => { savedAtOpen = t.story.save(); });
    t.chooseAtBed(STORY_ADVANCE_GO);
    t.tick();
    expect(t.dialog).toBe(true);
    expect(t.story.phase).toBe('milestone');
    expect(t.showResult).not.toHaveBeenCalled();
    t.tick();
    expect(t.showResult).not.toHaveBeenCalled();
    t.closeDialog();
    t.tick();
    expect(t.story.phase).toBe('finished');
    expect(savedAtOpen?.phase).toBe('finished');
    expect(t.showResult).toHaveBeenCalledExactlyOnceWith(evaluateLife(t.story.choices, 600_000, STORY_EVENTS));
    for (let i = 0; i < 10; i++) t.tick();
    expect(t.showResult).toHaveBeenCalledTimes(1);
    expect(t.dialog).toBe(false);
  });

  it('staying at the final milestone leaves exploration available without a result', () => {
    const t = setup();
    t.chooseAtBed('stay');
    for (let i = 0; i < 5; i++) t.tick();
    expect(t.story.phase).toBe('milestone');
    expect(t.showResult).not.toHaveBeenCalled();
    expect(t.dialog).toBe(false);
  });

  it('an earlier milestone still advances to the next stage', () => {
    const t = setup({ ...newStoryState(), phase: 'milestone', stageIndex: 0, bikeChoice: 'site-a' });
    t.chooseAtBed(STORY_ADVANCE_GO);
    t.tick();
    t.closeDialog();
    t.tick();
    expect(t.story.phase).toBe('stage');
    expect(t.story.stage.id).toBe(STORY_STAGES[1].id);
    expect(t.showResult).not.toHaveBeenCalled();
  });

  it('restores finished history without replaying the ending and recalculates from current money', () => {
    const t = setup();
    t.chooseAtBed(STORY_ADVANCE_GO);
    t.tick();
    t.closeDialog();
    t.tick();
    const saved = parseStorySave(JSON.parse(JSON.stringify(t.story.save())))!;
    const resumed = setup(saved);
    resumed.tick();
    expect(resumed.story.phase).toBe('finished');
    expect(resumed.story.choices).toEqual(t.story.choices);
    expect(resumed.showResult).not.toHaveBeenCalled();
    expect(resumed.story.evaluate()).toEqual(t.story.evaluate());
    resumed.host.changeMoney(-10_000);
    expect(resumed.story.evaluate().moneyYen).toBe(590_000);
    expect(resumed.story.evaluate().dailyMemories).toEqual(t.story.evaluate().dailyMemories);
  });
});
