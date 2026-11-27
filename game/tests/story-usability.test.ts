import { describe, expect, it } from 'vitest';
import { LifeEventDirector } from '../src/events/director';
import { STORY_ERRANDS } from '../src/story/config';
import { StoryDirector } from '../src/story/director';
import { STORY_EVENTS } from '../src/story/events';
import { newStoryState } from '../src/story/state';
import { storyTasks } from '../src/ui/story-hud';

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
