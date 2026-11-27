import { describe, expect, it } from 'vitest';
import { DialogController } from '../src/events/dialog';
import { LifeEventDirector } from '../src/events/director';
import { STORY_ERRANDS, STORY_MOTHER_KEY, type StoryErrand } from '../src/story/config';
import { StoryDirector } from '../src/story/director';
import { STORY_EVENTS } from '../src/story/events';
import { storyMapGoals } from '../src/story/map-goals';
import { newStoryState, parseStorySave } from '../src/story/state';
import { storyTasks } from '../src/ui/story-hud';

function openMotherDialog(story: StoryDirector, dialog: DialogController): void {
  const reply = story.onMapEvent({ type: 'interact', areaId: 'home-family-interior',
    interactionId: 'mother', eventKey: STORY_MOTHER_KEY });
  if (!reply) throw new Error('The mother did not respond');
  expect(dialog.open(reply.speaker ?? '', reply.lines)).toBe(true);
}

function startIntroduction() {
  const story = StoryDirector.newGame(new LifeEventDirector(STORY_EVENTS));
  const dialog = new DialogController();
  openMotherDialog(story, dialog);
  return { story, dialog };
}

function expectGuidance(story: StoryDirector, errands: readonly StoryErrand[]): void {
  expect(storyTasks(story).map(task => task.id)).toEqual(errands.map(errand => errand.id));
  expect(storyMapGoals(story)).toEqual({
    pending: errands.map(errand => errand.facilityId),
    done: [],
    targets: errands.map(errand => ({ id: errand.facilityId, eventKey: errand.eventKey })),
  });
}

describe('story errand checklist', () => {
  it('keeps every errand in its original position when completed out of order and resumed', () => {
    const saved = { ...newStoryState(), phase: 'errands' as const, errandsDone: ['park', 'school'] };
    const story = StoryDirector.resume(saved, new LifeEventDirector(STORY_EVENTS));
    const before = story.save();
    const tasks = storyTasks(story);
    expect(tasks.map(task => task.id)).toEqual(STORY_ERRANDS.map(errand => errand.id));
    expect(tasks.filter(task => task.done).map(task => task.id)).toEqual(['school', 'park']);
    expect(tasks.find(task => task.id === 'konbini')?.label).toBe('コンビニでノートを買う');
    expect(tasks.find(task => task.id === 'station')?.label).toBe('駅員さんと話す');
    expect(story.save()).toEqual(before);
  });

  it('shows the current guidance instead of the checklist outside the errand phase', () => {
    for (const phase of ['meet-mother', 'return-home', 'stage', 'milestone', 'finished'] as const) {
      expect(storyTasks({ phase, errandsDone: ['school'] })).toEqual([]);
    }
  });

  it('uses the configured wording for an additional errand', () => {
    const extra = { ...STORY_ERRANDS[0], id: 'library', place: '図書館に本を返す' };
    expect(storyTasks({ phase: 'errands', errandsDone: [] }, [extra])).toEqual([
      { id: 'library', label: '図書館に本を返す', done: false },
    ]);
  });
});

describe('spoken errand introduction', () => {
  it('reveals checklist rows and map targets only as each errand is spoken', () => {
    const { story, dialog } = startIntroduction();
    expect(story.phase).toBe('errands');
    expect(story.errandsRevealed).toEqual([]);
    expectGuidance(story, []);

    for (const phrase of ['おはよう', 'スマホ', 'お使いを頼める']) {
      expect(dialog.current?.lines[dialog.current.index]).toContain(phrase);
      story.observeDialog(dialog.current);
      expectGuidance(story, []);
      dialog.advance();
    }

    for (const [index, errand] of STORY_ERRANDS.entries()) {
      expect(dialog.current?.lines[dialog.current.index]).toContain(errand.place);
      story.observeDialog(dialog.current);
      expectGuidance(story, STORY_ERRANDS.slice(0, index + 1));

      story.observeDialog(dialog.current);
      expectGuidance(story, STORY_ERRANDS.slice(0, index + 1));
      dialog.advance();
    }

    while (dialog.current) {
      story.observeDialog(dialog.current);
      expectGuidance(story, STORY_ERRANDS);
      dialog.advance();
    }
  });

  it('keeps every errand visible after the introduction ends and when visiting the mother again', () => {
    const { story, dialog } = startIntroduction();
    while (dialog.current) {
      story.observeDialog(dialog.current);
      dialog.advance();
    }
    story.observeDialog(dialog.current);
    expect(story.errandsRevealed).toBeUndefined();
    expectGuidance(story, STORY_ERRANDS);

    openMotherDialog(story, dialog);
    expect(dialog.current?.lines[0]).toContain('あとは');
    story.observeDialog(dialog.current);
    expect(story.errandsRevealed).toBeUndefined();
    expectGuidance(story, STORY_ERRANDS);
    dialog.advance();
    story.observeDialog(dialog.current);
    expectGuidance(story, STORY_ERRANDS);
  });

  it.each([0, 2])('restores all guidance after saving with %i errands announced', count => {
    const { story, dialog } = startIntroduction();
    const stopAt = count === 0 ? 0
      : dialog.current!.lines.findIndex(line => line.includes(STORY_ERRANDS[count - 1].place));
    expect(stopAt).toBeGreaterThanOrEqual(0);
    while (dialog.current && dialog.current.index < stopAt) {
      story.observeDialog(dialog.current);
      dialog.advance();
    }
    story.observeDialog(dialog.current);
    expectGuidance(story, STORY_ERRANDS.slice(0, count));

    const saved = JSON.parse(JSON.stringify(story.save()));
    expect(saved).toEqual({ ...newStoryState(), phase: 'errands' });
    expect(parseStorySave(saved)).toEqual(saved);
    const resumed = StoryDirector.resume(saved, new LifeEventDirector(STORY_EVENTS));
    resumed.observeDialog(null);
    expect(resumed.errandsRevealed).toBeUndefined();
    expectGuidance(resumed, STORY_ERRANDS);
    expect(resumed.save()).toEqual(saved);
    expectGuidance(story, STORY_ERRANDS.slice(0, count));
  });
});
