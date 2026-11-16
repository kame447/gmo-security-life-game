import type { MapEvent } from '../core/types';
import { TILE } from '../core/coords';
import type { Game } from '../session/game';
import type { RailwayNetwork } from '../world/railway';
import { alightPlan, boardPlan, exitFrame, exitPath, RideScript, type Frame } from './choreo';
import { findPath } from '../world';
import { stationScene } from '../town-train/station-scene';
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
  private afterglow = 0;
  private animating = false;
  private result: TravelResult | undefined;

  constructor(private readonly game: Game, railway: RailwayNetwork, private readonly stage: HTMLElement, private readonly hooks: TrainTravelPanelHooks) {
    this.session = new TrainTravelSession(game, railway, hooks.arrive);
    this.root.id = 'train-travel-panel';
    this.root.hidden = true;
    this.stage.append(this.root);
  }

  // Arrival commits the saved location before the destination animation finishes.
  // Keep ownership of input until the actor has walked outside the gate.
  get isOpen(): boolean { return this.session.isOpen || this.animating; }

  /** Gameのinteract通知から呼ぶ。改札の操作だけが対象で、成功時のみ既定会話を抑止する。 */
  tryOpen(event: MapEvent): boolean {
    if (!this.hooks.canOpen() || !this.session.begin(event)) return false;
    // 出場は一覧も確認も出さず、操作1回で、主人公が改札を歩いて通る。
    if (this.session.state.step === 'exit') { this.hooks.onOpen(); this.walkThroughGate(); return true; }
    this.root.hidden = false;
    this.stage.classList.add('travel-open');
    this.render();
    this.hooks.onOpen();
    return true;
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    // The ride cannot be skipped or cancelled; every key is swallowed until the player is back in control.
    if (this.animating) { event.preventDefault(); return; }
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
    this.animating = false;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.stage.classList.remove('travel-open');
    this.hooks.onClose(result);
  }

  /** 行き先を決めた直後に、確認なしで乗車の演出（マップの上の列車と歩く主人公）を始める。 */
  private choose(id: string): void {
    const ride = this.session.choose(id);
    if (!ride) { this.finish(); return; }
    this.play(ride);
  }

  /** 描画と同じ式で、いま見えている幅（論理px）。列車を画面の端で出入りさせるのに使う。 */
  private static viewWidth(): number {
    const dpr = window.devicePixelRatio || 1, physical = Math.max(1, Math.round(window.innerWidth * dpr));
    return Math.ceil(physical / Math.max(1, Math.round(physical / (26 * TILE))));
  }

  private areaWidth(areaId: string): number { return (this.game.world.areas.get(areaId)?.width ?? 0) * TILE; }

  private static prefersReducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** 実際の主人公は改札の前に置いたまま、描画だけを stationScene の代役と列車に差し替える。 */
  private show(areaId: string, frame: Frame): void {
    stationScene.set(areaId, { trains: frame.train ? [{ direction: this.direction, x: frame.train.x, doorOpen: frame.train.doorOpen }] : [],
      ...(frame.actor ? { actor: frame.actor } : {}) });
  }
  private direction: 'up' | 'down' = 'down';

  private play(ride: RideRequest): void {
    cancelAnimationFrame(this.afterglow);
    this.animating = true;
    this.direction = ride.direction;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.stage.classList.add('travel-open');
    stationScene.setFadeSuppressed(true);
    const player = this.game.player;
    // 歩く経路は、ホームの床だけを通る最短経路（改札を通る区間は別に足す）。見つからなければ直線の経路にする。
    const route = (areaId: string, from: { x: number; y: number }, to: { x: number; y: number }) => {
      const area = this.game.world.areas.get(areaId);
      return area ? findPath(area, from, to) ?? undefined : undefined;
    };
    const board = boardPlan({ x: player.x, y: player.y }, ride.boardPlatform, this.areaWidth(ride.originAreaId), TrainTravelPanel.viewWidth(),
      ride.originGate, route(ride.originAreaId, ride.originGate.inside, ride.boardPlatform.doorFront));
    const alight = alightPlan(ride.alightPlatform, ride.destinationGate, this.areaWidth(ride.destinationAreaId), TrainTravelPanel.viewWidth(),
      route(ride.destinationAreaId, ride.alightPlatform.doorFront, ride.destinationGate.inside));
    const script = new RideScript(board, alight, TrainTravelPanel.prefersReducedMotion());
    let t = 0, last = performance.now(), committed = false, released = false;
    const area = { origin: ride.originAreaId, destination: ride.destinationAreaId };
    const abort = () => {
      stationScene.reset();
      this.finish(this.result);
    };
    const tick = (now: number) => {
      t += Math.min(100, Math.max(0, now - last)); last = now;
      let frame = script.sample(t);
      if (frame.stage !== 'origin' && !committed) {
        // 出発した列車が画面の外にいる瞬間に、位置を1回だけ確定する（黒いフェードは止めてある）。
        committed = true;
        stationScene.set(area.origin, null);
        this.result = this.session.commitArrival();
        if (!this.result.ok) { abort(); return; }
        frame = script.sample(t);
      }
      this.root.dataset.rideStage = frame.stage;
      // 演出の時計（ミリ秒）。E2E が、実時間の揺れに左右されずに切り替えの前後を測るために読む。
      this.root.dataset.rideT = String(Math.round(t));
      if (frame.stage === 'done') { stationScene.set(area.destination, null); }
      else this.show(frame.stage === 'origin' ? area.origin : area.destination, frame);
      if (frame.control && !released) {
        released = true;
        stationScene.setFadeSuppressed(false);
        this.finish(this.result);
      }
      if (frame.stage !== 'done') {
        const next = requestAnimationFrame(tick);
        // 操作が戻ったあとも、列車だけが自然に出ていくまで描き続ける。
        if (released) this.afterglow = next; else this.frame = next;
      }
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** 改札を出る: 主人公の代役が改札を歩いて通り、着いたら実際の位置を確定して描画を戻す。 */
  private walkThroughGate(): void {
    this.animating = true;
    const player = this.game.player, areaId = player.areaId;
    const path = exitPath({ x: player.x, y: player.y }, this.session.exitGate!);
    stationScene.setFadeSuppressed(true);
    let t = 0, last = performance.now();
    const reduced = TrainTravelPanel.prefersReducedMotion();
    const tick = (now: number) => {
      t += Math.min(100, Math.max(0, now - last)); last = now;
      const { actor, done } = exitFrame(path, reduced ? 1e6 : t);
      if (!done) { stationScene.set(areaId, { trains: [], actor }); this.frame = requestAnimationFrame(tick); return; }
      this.session.passExit();
      stationScene.set(areaId, null);
      stationScene.setFadeSuppressed(false);
      this.finish();
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
