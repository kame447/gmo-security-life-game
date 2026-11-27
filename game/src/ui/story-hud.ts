/**
 * ストーリーの表示（docs/features/story.md）：いまの段階と次にすること、目覚めの明転。
 * 進行の判断は story/director.ts が持ち、ここは毎フレーム状態を描き直すだけ。
 */
import type { StoryDirector } from '../story/director';
import { $ } from './dom';
import './story.css';

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
    const text = `${status.title}\n${status.detail}`;
    // Only touch the DOM when the text changes so the live region is not re-announced every frame.
    if (text !== this.text) {
      this.text = text;
      this.title.textContent = status.title;
      this.detail.textContent = status.detail;
    }
    if (this.bikeButton) this.bikeButton.hidden = !this.story.canRide;
  }
}
