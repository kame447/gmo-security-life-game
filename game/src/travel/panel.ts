import type { MapEvent } from '../core/types';
import type { Game } from '../session/game';
import type { RailwayNetwork } from '../world/railway';
import { RIDE_TIMING, REDUCED_TIMING, RideDirector } from './ride';
import { drawRideScene, SCENE_H, SCENE_W } from './scene';
import { TrainTravelSession, type NoticeKind, type TravelArrival, type TravelResult } from './session';
import './panel.css';

const NOTICE_TEXT: Record<NoticeKind, string> = {
  'ticket-issued': 'きっぷを うけとった。かいさつを とおって、ホームの のりばへ すすんでね。',
  'no-ticket': 'のるには、かいさつで いきさきを えらんで、きっぷを うけとってね。',
  'wrong-platform': 'この きっぷの のりばは ここではないよ。',
};

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
  private frame = 0;
  private passing = false;
  private result: TravelResult | undefined;

  constructor(private readonly game: Game, railway: RailwayNetwork, private readonly stage: HTMLElement, private readonly hooks: TrainTravelPanelHooks) {
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
    // The ride cannot be skipped or cancelled; every key is swallowed until the player is back in control.
    if (this.session.isRiding || this.passing) { event.preventDefault(); return; }
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
    if (this.session.isRiding) return;
    this.message = '';
    this.session.back();
    if (this.session.isOpen) this.render();
    else this.finish();
  }

  private finish(result?: TravelResult): void {
    cancelAnimationFrame(this.frame);
    this.root.hidden = true;
    this.root.replaceChildren();
    delete this.root.dataset.ridePhase;
    this.stage.classList.remove('travel-open');
    this.hooks.onClose(result);
  }

  private closeNotice(): void { this.back(); }

  /** 改札を通る: 短い暗転のあいだに改札の先へ立ち位置を移し、ホームを歩けるようにする。 */
  private passGate(): void {
    if (this.passing) return;
    this.passing = true;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.root.classList.add('train-travel-passing');
    const done = () => {
      const moved = this.session.passGate();
      this.root.classList.remove('train-travel-passing');
      this.passing = false;
      if (moved) this.finish();
      else { this.message = 'いまは かいさつを とおれません。'; this.render(); }
    };
    if (reduced) done(); else window.setTimeout(done, 220);
  }

  private issue(): void {
    if (this.session.issue()) { this.message = ''; this.render(); }
  }

  private returnTicket(): void { this.session.returnTicket(); this.finish(); }

  /** のる: ここから先は取り消せない。位置の更新は暗転の切れ目の1回だけ。 */
  private board(): void {
    const ticket = this.session.startRide();
    if (!ticket) { this.finish(); return; }
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = element('canvas', 'train-travel-scene');
    canvas.width = SCENE_W; canvas.height = SCENE_H;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'でんしゃに のって いどうちゅう');
    const c = canvas.getContext('2d');
    this.root.replaceChildren(canvas);
    const fit = () => {
      const w = this.stage.clientWidth || SCENE_W, h = this.stage.clientHeight || SCENE_H;
      const limit = Math.min(w, h * SCENE_W / SCENE_H);
      canvas.style.width = `${limit >= SCENE_W ? Math.floor(limit / SCENE_W) * SCENE_W : Math.floor(limit)}px`;
    };
    fit();
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    const director = new RideDirector(ticket.heading, () => {
      this.result = this.session.commitArrival();
      return this.result.ok;
    }, () => {
      window.removeEventListener('resize', onResize);
      this.finish(this.result);
    }, reduced ? REDUCED_TIMING : RIDE_TIMING);
    let last = performance.now();
    const tick = (now: number) => {
      director.advance(now - last); last = now;
      const snapshot = director.snapshot;
      this.root.dataset.ridePhase = snapshot.phase;
      if (c && snapshot.phase !== 'done') drawRideScene(c, this.game.appearance, snapshot, ticket.direction, now);
      if (snapshot.phase !== 'done') this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private render(): void {
    const state = this.session.state;
    if (state.step === 'closed' || state.step === 'riding') return;
    const card = element('section', 'train-travel-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'train-travel-title');
    const title = element('h2'); title.id = 'train-travel-title';
    title.textContent = state.step === 'board' ? 'のりば' : state.step === 'notice' ? 'えき' : 'かいさつ';
    card.append(title);
    const prompt = element('p', 'train-travel-prompt');
    const ticket = this.session.currentTicket;
    const actions = element('div', 'train-travel-actions');
    if (state.step === 'destinations') {
      prompt.textContent = 'いきさきを えらんでね。';
      for (const destination of state.destinations) {
        actions.append(this.makeButton(destination.name, 'select', () => {
          if (this.session.select(destination.id)) { this.message = ''; this.render(); }
        }, destination.id));
      }
      if (ticket) actions.append(this.makeButton('きっぷを かえす', 'return-ticket', () => this.returnTicket()));
      actions.append(this.makeButton('もどる', 'back', () => this.back()));
    } else if (state.step === 'confirm') {
      prompt.textContent = `${state.destination.name}ゆきの きっぷを うけとりますか？`;
      actions.append(this.makeButton('うけとる', 'issue', () => this.issue()));
      actions.append(this.makeButton('もどる', 'back', () => this.back()));
    } else if (state.step === 'board') {
      prompt.textContent = `${state.destinationName}ゆきに のりますか？`;
      actions.append(this.makeButton('のる', 'board', () => this.board()));
      actions.append(this.makeButton('もどる', 'back', () => this.back()));
    } else {
      prompt.textContent = state.kind === 'ticket-issued' && state.destinationName
        ? `${state.destinationName}ゆきの きっぷを うけとった。かいさつを とおって、ホームの のりばへ すすんでね。` : NOTICE_TEXT[state.kind];
      if (state.kind === 'ticket-issued') actions.append(this.makeButton('かいさつを とおる', 'pass-gate', () => this.passGate()));
      actions.append(this.makeButton(state.kind === 'ticket-issued' ? 'ここで とじる' : 'とじる', 'close', () => this.closeNotice()));
    }
    card.append(prompt, actions);
    if (this.message) { const message = element('p', 'train-travel-message'); message.setAttribute('role', 'status'); message.textContent = this.message; card.append(message); }
    this.root.replaceChildren(card);
    actions.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
}
