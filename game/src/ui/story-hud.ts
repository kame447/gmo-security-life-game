/**
 * ストーリーの表示：現在の段階、お使いの一覧、目覚めの明転。
 * 進行の判断と保存は StoryDirector が持つ。
 */
import { STORY_ERRANDS, type StoryErrand } from '../story/config';
import type { StoryDirector } from '../story/director';
import { $ } from './dom';
import './story.css';

const ERRAND_ACTIONS: Readonly<Record<string, string>> = {
  school: '学校の先生と話す',
  konbini: 'コンビニでノートを買う',
  park: '公園の友達に会う',
  station: '駅員さんと話す',
};

export function storyTasks(story: Pick<StoryDirector, 'phase' | 'errandsDone'>,
  errands: readonly StoryErrand[] = STORY_ERRANDS): { id: string; label: string; done: boolean }[] {
  if (story.phase !== 'errands') return [];
  return errands.map(errand => ({
    id: errand.id,
    label: ERRAND_ACTIONS[errand.id] ?? errand.place,
    done: story.errandsDone.includes(errand.id),
  }));
}

export class StoryHud {
  private readonly root = document.createElement('div');
  private readonly title = document.createElement('div');
  private readonly detail = document.createElement('div');
  private readonly tasks = document.createElement('ul');
  private readonly bikeButton = document.querySelector<HTMLButtonElement>('#touch [data-bike]');
  private text = '';

  constructor(private readonly story: StoryDirector, wake: boolean) {
    const stage = $<HTMLElement>('#stage');
    this.root.id = 'story-hud';
    this.root.className = 'panel';
    this.root.setAttribute('role', 'status');
    this.title.className = 'story-title';
    this.detail.className = 'story-detail';
    this.tasks.className = 'story-tasks';
    this.tasks.setAttribute('aria-label', 'お使い');
    this.tasks.hidden = true;
    this.root.append(this.title, this.detail, this.tasks);
    $<HTMLElement>('#hud').after(this.root);
    if (wake) {
      const fade = document.createElement('div');
      fade.id = 'story-fade';
      fade.setAttribute('aria-hidden', 'true');
      fade.addEventListener('animationend', () => fade.remove());
      stage.append(fade);
    }
  }

  update(): void {
    const status = this.story.status();
    const tasks = storyTasks(this.story);
    const text = JSON.stringify([status, tasks]);
    if (text !== this.text) {
      this.text = text;
      this.title.textContent = status.title;
      this.detail.textContent = status.detail;
      this.detail.hidden = tasks.length > 0;
      this.tasks.hidden = tasks.length === 0;
      this.tasks.replaceChildren(...tasks.map(task => {
        const row = document.createElement('li');
        row.dataset.errand = task.id;
        row.classList.toggle('is-done', task.done);
        row.setAttribute('aria-label', task.label + (task.done ? '：完了' : '：未完了'));
        const mark = document.createElement('span');
        mark.className = 'story-task-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = task.done ? '✓' : '□';
        const label = document.createElement('span');
        label.className = 'story-task-label';
        label.textContent = task.label;
        row.append(mark, label);
        return row;
      }));
    }
    if (this.bikeButton) this.bikeButton.hidden = !this.story.canRide;
  }
}
