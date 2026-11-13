/**
 * UI のモード管理と入力の振り分け。
 * どの画面が前面にあるか（探索／会話／外見パネル）を1か所で判定し、キー・タッチ・ボタンをその担当へ渡す。
 * 選択肢・メニューなどの新しい画面はここにモードを足して扱う。
 */
import type { Facing } from '../core/coords';
import { ACTION_KEYS, Controls, DIRECTION_KEYS, RUN_KEYS } from '../input/controls';
import type { InputState } from '../map/explorer';
import type { Minimap } from '../minimap/view';
import type { TrainTravelPanel } from '../travel/panel';
import type { Game } from '../session/game';
import type { AvatarPanel } from './avatar-panel';
import { $ } from './dom';

export type UiMode = 'explore' | 'dialog' | 'avatar' | 'map' | 'travel';

const TOUCH_LABELS: Record<Facing, string> = { up: 'うえ', down: 'した', left: 'ひだり', right: 'みぎ' };
const NO_INPUT: InputState = { dir: null, run: false };

export class UiController {
  private readonly touch = $<HTMLElement>('#touch');
  private readonly touchToggle = $<HTMLButtonElement>('#btn-touch');

  constructor(
    private readonly game: Game,
    private readonly controls: Controls,
    private readonly avatar: AvatarPanel,
    private readonly canvas: HTMLCanvasElement,
    private readonly minimap: Minimap,
    private readonly travel?: () => Pick<TrainTravelPanel, 'isOpen' | 'handleKey'> | undefined,
  ) {}

  get mode(): UiMode {
    if (this.minimap.isOpen) return 'map';
    if (this.travel?.()?.isOpen) return 'travel';
    if (this.avatar.isOpen) return 'avatar';
    if (this.game.dialog) return 'dialog';
    return 'explore';
  }

  /** Movement input for this frame. Held keys survive a dialog; the session itself pauses movement then. */
  movementInput(): InputState {
    return this.mode === 'avatar' || this.mode === 'map' || this.mode === 'travel' ? NO_INPUT : this.controls.state();
  }

  /** Decide / talk / advance: shared by keys, the dialog box and the touch A button. */
  primaryAction(): void {
    if (this.mode !== 'avatar' && this.mode !== 'map' && this.mode !== 'travel') this.game.action();
  }

  focusMap(): void { this.canvas.focus({ preventScroll: true }); }

  bind(handlers: { onReset: () => void }): void {
    window.addEventListener('keydown', event => this.onKeyDown(event));
    window.addEventListener('keyup', event => this.controls.release(event.code));
    window.addEventListener('blur', () => this.controls.clear());
    document.addEventListener('focusin', event => { if (event.target !== this.canvas) this.controls.clear(); });
    this.canvas.addEventListener('pointerdown', () => this.focusMap());

    $<HTMLButtonElement>('#btn-avatar').addEventListener('click', () => {
      if (this.mode !== 'explore') return;
      this.controls.clear();
      this.avatar.open();
    });
    $<HTMLButtonElement>('#btn-reset').addEventListener('click', () => {
      if (this.mode === 'map' || this.mode === 'travel') return;
      this.controls.clear();
      handlers.onReset();
      this.focusMap();
    });
    this.bindTouch();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.mode === 'map') { this.minimap.handleKey(event); return; }
    const travel = this.travel?.();
    if (travel?.isOpen) { travel.handleKey(event); return; }
    if (this.mode === 'avatar') { this.avatar.handleKey(event); return; }
    // Let buttons retain their ordinary Enter/Space behavior.
    if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select')) return;
    const dir = DIRECTION_KEYS[event.code];
    if (dir) {
      event.preventDefault();
      if (!event.repeat) this.controls.press(event.code, dir);
    } else if (RUN_KEYS.has(event.code)) {
      this.controls.pressRun(event.code);
    } else if (ACTION_KEYS.has(event.code)) {
      event.preventDefault();
      if (!event.repeat) this.game.action();
    }
  }

  private setTouch(enabled: boolean): void {
    this.controls.clear();
    this.touch.classList.toggle('on', enabled);
    this.touch.setAttribute('aria-hidden', String(!enabled));
    this.touchToggle.setAttribute('aria-pressed', String(enabled));
  }

  private bindTouch(): void {
    this.setTouch(matchMedia('(pointer: coarse)').matches);
    this.touchToggle.addEventListener('click', () => {
      if (this.mode === 'map' || this.mode === 'travel') return;
      this.setTouch(!this.touch.classList.contains('on'));
      this.focusMap();
    });
    for (const button of this.touch.querySelectorAll<HTMLButtonElement>('button')) {
      const direction = button.dataset.dir as Facing | undefined;
      button.setAttribute('aria-label', direction ? TOUCH_LABELS[direction] : 'しらべる・はなす');
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        if (this.mode === 'map' || this.mode === 'travel') return;
        this.focusMap();
        button.setPointerCapture(event.pointerId);
        if (direction) this.controls.press(`pointer-${event.pointerId}`, direction);
        else this.primaryAction();
      });
      const release = (event: PointerEvent) => this.controls.release(`pointer-${event.pointerId}`);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }
  }
}
