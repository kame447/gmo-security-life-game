import type { MapEvent } from '../core/types';
import { TILE } from '../core/coords';
import type { Game } from '../session/game';
import type { RailwayNetwork } from '../world/railway';
import { RIDE_TIMING, REDUCED_TIMING, RideDirector } from './ride';
import { drawRideScene, geometryOf } from './scene';
import { TrainTravelSession, type RideRequest, type TravelArrival, type TravelResult } from './session';
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

/** 自己マウントする行き先選択UIと乗車演出。共有側が排他とキーの振り分けを担当する。 */
export class TrainTravelPanel {
  private readonly session: TrainTravelSession;
  private readonly root = element('div', 'train-travel-overlay');
  private frame = 0;
  private result: TravelResult | undefined;

  constructor(private readonly game: Game, railway: RailwayNetwork, private readonly stage: HTMLElement, private readonly hooks: TrainTravelPanelHooks) {
    this.session = new TrainTravelSession(game, railway, hooks.arrive);
    this.root.id = 'train-travel-panel';
    this.root.hidden = true;
    this.stage.append(this.root);
  }

  get isOpen(): boolean { return this.session.isOpen; }

  /** Gameのinteract通知から呼ぶ。改札の操作だけが対象で、成功時のみ既定会話を抑止する。 */
  tryOpen(event: MapEvent): boolean {
    if (!this.hooks.canOpen() || !this.session.begin(event)) return false;
    // 出場は一覧も確認も出さず、操作1回で通る。通知の最中に動かさないよう、直後に実行する。
    if (this.session.state.step === 'exit') { queueMicrotask(() => { this.session.passExit(); }); return true; }
    this.root.hidden = false;
    this.stage.classList.add('travel-open');
    this.render();
    this.hooks.onOpen();
    return true;
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    // The ride cannot be skipped or cancelled; every key is swallowed until the player is back in control.
    if (this.session.isRiding) { event.preventDefault(); return; }
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
    this.session.back();
    if (this.session.isOpen) this.render();
    else this.finish();
  }

  private finish(result?: TravelResult): void {
    cancelAnimationFrame(this.frame);
    this.root.hidden = true;
    this.root.replaceChildren();
    this.root.classList.remove('train-travel-riding');
    delete this.root.dataset.ridePhase;
    this.stage.classList.remove('travel-open');
    this.hooks.onClose(result);
  }

  /** 行き先を決めた直後に、確認なしで乗車の演出を始める。 */
  private choose(id: string): void {
    const ride = this.session.choose(id);
    if (!ride) { this.finish(); return; }
    this.play(ride);
  }

  private play(ride: RideRequest): void {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = element('canvas', 'train-travel-scene');
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'でんしゃに のって いどうちゅう');
    const c = canvas.getContext('2d');
    this.root.classList.add('train-travel-riding');
    this.root.replaceChildren(canvas);
    let geometry = geometryOf(ride.direction);
    const fit = () => {
      const w = this.stage.clientWidth || 640, h = this.stage.clientHeight || 480;
      const zoom = Math.max(1, Math.round(w / (26 * TILE)));
      const cols = Math.ceil(w / zoom / TILE) + 1, rows = Math.ceil(h / zoom / TILE) + 1;
      canvas.width = cols * TILE; canvas.height = rows * TILE;
      canvas.style.width = `${cols * TILE * zoom}px`; canvas.style.height = `${rows * TILE * zoom}px`;
      geometry = geometryOf(ride.direction, cols, rows);
    };
    fit();
    window.addEventListener('resize', fit);
    const director = new RideDirector(ride.heading, () => {
      this.result = this.session.commitArrival();
      return this.result.ok;
    }, () => {
      window.removeEventListener('resize', fit);
      this.finish(this.result);
    }, reduced ? REDUCED_TIMING : RIDE_TIMING);
    let last = performance.now();
    const tick = (now: number) => {
      director.advance(now - last); last = now;
      const snapshot = director.snapshot;
      this.root.dataset.ridePhase = snapshot.phase;
      if (c && snapshot.phase !== 'done') {
        drawRideScene(c, this.game.appearance, snapshot, geometry, ride.direction, now);
        this.frame = requestAnimationFrame(tick);
      }
    };
    this.frame = requestAnimationFrame(tick);
  }

  private render(): void {
    const state = this.session.state;
    if (state.step !== 'destinations' && state.step !== 'confirm') return;
    const card = element('section', 'train-travel-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'train-travel-title');
    const title = element('h2'); title.id = 'train-travel-title'; title.textContent = 'かいさつ';
    const prompt = element('p', 'train-travel-prompt'); prompt.textContent = 'いきさきを えらんでね。';
    const actions = element('div', 'train-travel-actions');
    for (const destination of state.destinations) {
      actions.append(this.makeButton(destination.name, 'select', () => this.choose(destination.id), destination.id));
    }
    actions.append(this.makeButton('もどる', 'back', () => this.back()));
    card.append(title, prompt, actions);
    this.root.replaceChildren(card);
    actions.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
}
