/**
 * UI のモード管理と入力の振り分け。
 * どの画面が前面にあるかを1か所で判定し、キー・タッチ・ボタンをその担当へ渡す。
 */
import type { Facing } from '../core/coords';
import { ACTION_KEYS, Controls, DIRECTION_KEYS, RUN_KEYS } from '../input/controls';
import type { InputState } from '../map/explorer';
import type { Game } from '../session/game';
import { $ } from './dom';
import { ModalPanels, type ModalPanelHost, type ModalPanelId, type ModalPanelRegistration, type UiMode } from './modal-panels';

export type { UiMode } from './modal-panels';

const TOUCH_LABELS: Record<Facing, string> = { up: 'うえ', down: 'した', left: 'ひだり', right: 'みぎ' };
const NO_INPUT: InputState = { dir: null, run: false };

export class UiController implements ModalPanelHost {
  private readonly touch = $<HTMLElement>('#touch');
  private readonly touchToggle = $<HTMLButtonElement>('#btn-touch');
  private readonly stage = $<HTMLElement>('#stage');
  private readonly panels: ModalPanels;
  private previousPanel?: ModalPanelId;

  constructor(
    private readonly game: Game,
    private readonly controls: Controls,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.panels = new ModalPanels(() => !!this.game.dialog, () => this.controls.clear());
  }

  get mode(): UiMode { return this.panels.mode; }

  registerPanel(registration: ModalPanelRegistration): void {
    const shortcut = registration.shortcut;
    if (shortcut && (DIRECTION_KEYS[shortcut] || ACTION_KEYS.has(shortcut) || RUN_KEYS.has(shortcut))) {
      throw new Error(`Shortcut conflicts with game controls: ${shortcut}`);
    }
    this.panels.register(registration);
    if (registration.button) {
      registration.button.dataset.modalTrigger = 'true';
      registration.button.addEventListener('click', () => { this.openPanel(registration.id); });
    }
    this.update();
  }

  openPanel(id: ModalPanelId, openOverride?: () => void): boolean {
    try { return this.panels.open(id, openOverride); }
    finally { this.update(); }
  }

  /** Call after panel state changes and each frame for dialog/availability changes. */
  update(): void {
    const active = this.panels.active;
    this.stage.classList.toggle('modal-open', !!active);
    for (const entry of this.panels.registrations) {
      if (entry.button) entry.button.disabled = !this.panels.canOpen(entry.id);
    }
    if (this.previousPanel && !active) {
      this.controls.clear();
      this.focusMap();
    }
    this.previousPanel = active?.id;
  }

  /** Movement input for this frame. Held keys survive a dialog; the session itself pauses movement then. */
  movementInput(): InputState {
    return this.panels.active ? NO_INPUT : this.controls.state();
  }

  /** Decide / talk / advance: shared by keys, the dialog box and the touch A button. */
  primaryAction(): void {
    if (!this.panels.active) this.game.action();
    this.update();
  }

  focusMap(): void { this.canvas.focus({ preventScroll: true }); }

  bind(handlers: { onReset: () => void }): void {
    window.addEventListener('keydown', event => this.onKeyDown(event));
    window.addEventListener('keyup', event => this.controls.release(event.code));
    window.addEventListener('blur', () => this.controls.clear());
    document.addEventListener('focusin', event => { if (event.target !== this.canvas) this.controls.clear(); });
    this.canvas.addEventListener('pointerdown', () => this.focusMap());

    $<HTMLButtonElement>('#btn-reset').addEventListener('click', () => {
      if (this.panels.active) return;
      this.controls.clear();
      handlers.onReset();
      this.focusMap();
    });
    this.bindTouch();
    this.update();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.panels.active) {
      try { this.panels.dispatchKey(event); }
      finally { this.update(); }
      return;
    }
    // Let buttons retain their ordinary Enter/Space behavior.
    if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select')) return;
    const shortcut = this.panels.byShortcut(event.code);
    if (shortcut) {
      if (this.panels.canOpen(shortcut.id)) {
        event.preventDefault();
        if (!event.repeat) this.openPanel(shortcut.id);
      }
      return;
    }
    const dir = DIRECTION_KEYS[event.code];
    if (dir) {
      event.preventDefault();
      if (!event.repeat) this.controls.press(event.code, dir);
    } else if (RUN_KEYS.has(event.code)) {
      this.controls.pressRun(event.code);
    } else if (ACTION_KEYS.has(event.code)) {
      event.preventDefault();
      if (!event.repeat) this.primaryAction();
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
      if (this.panels.active) return;
      this.setTouch(!this.touch.classList.contains('on'));
      this.focusMap();
    });
    for (const button of this.touch.querySelectorAll<HTMLButtonElement>('button')) {
      const direction = button.dataset.dir as Facing | undefined;
      button.setAttribute('aria-label', direction ? TOUCH_LABELS[direction] : 'しらべる・はなす');
      button.addEventListener('pointerdown', event => {
        if (this.panels.active) return;
        event.preventDefault();
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
