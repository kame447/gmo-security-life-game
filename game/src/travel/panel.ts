import type { MapEvent } from '../core/types';
import type { Game } from '../session/game';
import type { RailwayNetwork } from '../world/railway';
import { TrainTravelSession, type TravelArrival, type TravelResult } from './session';
import './panel.css';

/** 共有入力側が開閉時の入力解除・フォーカス復帰と、到着時の保存を行う。 */
export interface TrainTravelPanelHooks {
  canOpen(): boolean;
  onOpen(): void;
  onClose(result?: TravelResult): void;
  arrive?: TravelArrival;
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

/** 自己マウントする行き先選択UI。共有側が排他とキーの振り分けを担当する。 */
export class TrainTravelPanel {
  private readonly session: TrainTravelSession;
  private readonly root = element('div', 'train-travel-overlay');
  private message = '';

  constructor(game: Game, railway: RailwayNetwork, private readonly stage: HTMLElement, private readonly hooks: TrainTravelPanelHooks) {
    this.session = new TrainTravelSession(game, railway, hooks.arrive);
    this.root.id = 'train-travel-panel';
    this.root.hidden = true;
    this.stage.append(this.root);
  }

  get isOpen(): boolean { return this.session.isOpen; }

  /** Gameのinteract通知から呼ぶ。成功時のみ既定会話を抑止する。 */
  tryOpen(event: MapEvent): boolean {
    if (!this.hooks.canOpen() || !this.session.begin(event)) return false;
    this.message = '';
    this.root.hidden = false;
    this.stage.classList.add('travel-open');
    this.render();
    this.hooks.onOpen();
    return true;
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) this.back(); return; }
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (event.code === 'Tab' || ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(event.code)) {
      event.preventDefault();
      if (!buttons.length) return;
      const direction = event.code === 'ArrowUp' || event.code === 'KeyW' || (event.code === 'Tab' && event.shiftKey) ? -1 : 1;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(current + direction + buttons.length) % buttons.length].focus({ preventScroll: true });
      return;
    }
    if (event.code === 'KeyZ') {
      event.preventDefault();
      if (!event.repeat) {
        const active = document.activeElement;
        if (active instanceof HTMLButtonElement && this.root.contains(active)) active.click();
      }
      return;
    }
    if (event.code === 'Enter' || event.code === 'Space') {
      if (event.repeat || !(document.activeElement instanceof HTMLButtonElement && this.root.contains(document.activeElement))) event.preventDefault();
      return;
    }
    // The controller routes all keys here while open, so they cannot reach map movement.
    if (/^(Arrow|Key|Digit|Shift)/.test(event.code)) event.preventDefault();
  }

  private makeButton(label: string, action: string, run: () => void, stationId?: string): HTMLButtonElement {
    const button = element('button');
    button.type = 'button'; button.dataset.action = action; button.textContent = label;
    if (stationId) button.dataset.stationId = stationId;
    button.addEventListener('click', run);
    return button;
  }

  private back(): void {
    this.message = '';
    this.session.back();
    if (this.session.isOpen) this.render();
    else this.finish();
  }

  private finish(result?: TravelResult): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.stage.classList.remove('travel-open');
    this.hooks.onClose(result);
  }

  private confirm(): void {
    const result = this.session.confirm();
    if (result.ok || !this.session.isOpen) { this.finish(result); return; }
    this.message = 'いまは このえきに つけません。';
    this.render();
  }

  private render(): void {
    const state = this.session.state;
    if (state.step === 'closed') return;
    const card = element('section', 'train-travel-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'train-travel-title');
    const title = element('h2'); title.id = 'train-travel-title'; title.textContent = 'でんしゃ';
    card.append(title);
    const prompt = element('p', 'train-travel-prompt');
    prompt.textContent = state.step === 'destinations' ? 'いきさきを えらんでね。' : `${state.destination.name}へ いきますか？`;
    card.append(prompt);
    const actions = element('div', 'train-travel-actions');
    if (state.step === 'destinations') {
      for (const destination of state.destinations) {
        actions.append(this.makeButton(destination.name, 'select', () => {
          if (this.session.select(destination.id)) { this.message = ''; this.render(); }
        }, destination.id));
      }
    } else actions.append(this.makeButton('のる', 'confirm', () => this.confirm()));
    actions.append(this.makeButton('もどる', 'back', () => this.back()));
    card.append(actions);
    if (this.message) { const message = element('p', 'train-travel-message'); message.setAttribute('role', 'status'); message.textContent = this.message; card.append(message); }
    this.root.replaceChildren(card);
    actions.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
}
