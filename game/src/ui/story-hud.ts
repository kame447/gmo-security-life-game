/**
 * ストーリーの表示（docs/features/story.md）：いまの段階と次にすること、本編の残り時間、目覚めの明転。
 * 進行の判断は story/director.ts が持ち、ここは毎フレーム状態を描き直すだけ。
 */
import type { StoryDirector } from '../story/director';
import { $ } from './dom';
import './story.css';

export function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export class StoryHud {
  private readonly root = document.createElement('div');
  private readonly title = document.createElement('div');
  private readonly detail = document.createElement('div');
  private readonly bikeButton = document.querySelector<HTMLButtonElement>('#touch [data-bike]');
  private text = '';

  constructor(private readonly story: StoryDirector, wake: boolean) {
    const stage = $<HTMLElement>('#stage');
    this.root.id = 'story-hud';
    this.root.className = 'panel';
    this.root.setAttribute('role', 'status');
    this.title.className = 'story-title';
    this.detail.className = 'story-detail';
    this.root.append(this.title, this.detail);
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
    const time = status.remainingSeconds === undefined ? '' : `　のこり ${formatRemaining(status.remainingSeconds)}`;
    const text = `${status.title}${time}\n${status.detail}`;
    // Only touch the DOM when the text changes so the live region is not re-announced every frame.
    if (text !== this.text) {
      this.text = text;
      this.title.textContent = `${status.title}${time}`;
      this.detail.textContent = status.detail;
    }
    this.root.classList.toggle('warn', status.warn);
    if (this.bikeButton) this.bikeButton.hidden = !this.story.canRide;
  }
}
