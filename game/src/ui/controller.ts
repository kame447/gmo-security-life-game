/**
 * UI のモード管理と入力の振り分け。
 * どの画面が前面にあるかを1か所で判定し、キー・タッチ・ボタンをその担当へ渡す。
 */
import type { Facing } from '../core/coords';
import { ACTION_KEYS, BICYCLE_KEYS, Controls, DIRECTION_KEYS, RUN_KEYS } from '../input/controls';
import type { InputState } from '../map/explorer';
import type { Minimap } from '../minimap/view';
import type { Game } from '../session/game';
import type { TrainTravelPanel } from '../travel/panel';
import { $ } from './dom';
import { ModalPanels, type ModalPanelHost, type ModalPanelId, type ModalPanelRegistration, type UiMode as PanelUiMode } from './modal-panels';

export type UiMode = PanelUiMode | 'map' | 'travel';

const TOUCH_LABELS: Record<Facing, string> = { up: 'うえ', down: 'した', left: 'ひだり', right: 'みぎ' };
const NO_INPUT: InputState = { dir: null, run: false };
const BICYCLE_TOUCH_HOLD_MS = 300;

export class UiController implements ModalPanelHost {
  private readonly touch = $<HTMLElement>('#touch');
  private readonly touchToggle = $<HTMLButtonElement>('#btn-touch');
  private readonly stage = $<HTMLElement>('#stage');
  private readonly menu = $<HTMLElement>('#menu');
  private readonly panels: ModalPanels;
  private previousPanel?: ModalPanelId;
  private readonly bicyclePointers = new Map<number, Facing>();
  private bicycleHold?: { direction: Facing; since: number };

  constructor(
    private readonly game: Game,
    private readonly controls: Controls,
    private readonly canvas: HTMLCanvasElement,
    private readonly minimap?: Minimap,
    private readonly travel?: () => Pick<TrainTravelPanel, 'isOpen' | 'handleKey'> | undefined,
  ) {
    this.panels = new ModalPanels(() => !!this.game.dialog, () => this.clearInput());
  }

  get mode(): UiMode { return this.minimap?.isOpen ? 'map' : this.travel?.()?.isOpen ? 'travel' : this.panels.mode; }

  registerPanel(registration: ModalPanelRegistration): void {
    if (registration.button && registration.button.parentElement !== this.menu) {
      throw new Error('A modal launch button must be a direct child of #menu');
    }
    const shortcut = registration.shortcut;
    if (shortcut && (DIRECTION_KEYS[shortcut] || ACTION_KEYS.has(shortcut) || RUN_KEYS.has(shortcut) || BICYCLE_KEYS.has(shortcut))) {
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
    if (this.minimap?.isOpen || this.travel?.()?.isOpen) return false;
    try { return this.panels.open(id, openOverride); }
    finally { this.update(); }
  }

  /** Call after panel state changes and each frame for dialog/availability changes. */
  update(): void {
    const active = this.panels.active;
    const traveling = !!this.travel?.()?.isOpen;
    this.stage.classList.toggle('modal-open', !!active || traveling);
    this.stage.classList.toggle('dialog-open', !!this.game.dialog);
    for (const entry of this.panels.registrations) {
      if (entry.button) entry.button.disabled = traveling || !!this.minimap?.isOpen || !this.panels.canOpen(entry.id);
    }
    if (this.previousPanel && !active) {
      this.controls.clear();
      this.focusMap();
    }
    this.previousPanel = active?.id;
    if (this.bicyclePointers.size && !this.canHoldBicycleDirection()) this.clearBicycleHold();
  }

  /** Movement input for this frame. Held keys survive a dialog; the session itself pauses movement then. */
  movementInput(): InputState {
    const blocked = this.panels.active || this.minimap?.isOpen || this.travel?.()?.isOpen;
    const input = blocked ? NO_INPUT : this.controls.state();
    if (!this.bicyclePointers.size) return input;
    const now = performance.now();
    this.syncBicycleHold(input.dir, now);
    return this.bicycleHold && now - this.bicycleHold.since >= BICYCLE_TOUCH_HOLD_MS
      ? { ...input, run: true } : input;
  }

  /** Decide / talk / advance: shared by keys, the dialog box and the touch A button. */
  primaryAction(): void {
    if (!this.panels.active && !this.minimap?.isOpen && !this.travel?.()?.isOpen) this.game.action();
    this.update();
  }

  focusMap(): void { this.canvas.focus({ preventScroll: true }); }

  bind(handlers: { onReset: () => void }): void {
    window.addEventListener('keydown', event => this.onKeyDown(event));
    window.addEventListener('keyup', event => {
      this.controls.release(event.code);
      if (DIRECTION_KEYS[event.code]) this.syncBicycleHold();
    });
    window.addEventListener('blur', () => this.clearInput());
    window.addEventListener('pagehide', () => this.clearBicycleHold());
    document.addEventListener('visibilitychange', () => this.clearBicycleHold());
    document.addEventListener('focusin', event => { if (event.target !== this.canvas) this.clearInput(); });
    this.canvas.addEventListener('pointerdown', () => this.focusMap());

    $<HTMLButtonElement>('#btn-reset').addEventListener('click', () => {
      if (this.panels.active || this.minimap?.isOpen || this.travel?.()?.isOpen) return;
      this.clearInput();
      handlers.onReset();
      this.focusMap();
    });
    this.bindTouch();
    this.update();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.minimap?.isOpen) { this.minimap.handleKey(event); return; }
    const travel = this.travel?.();
    if (travel?.isOpen) {
      try { travel.handleKey(event); }
      finally { this.update(); }
      return;
    }
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
      if (!event.repeat) {
        this.controls.press(event.code, dir);
        this.syncBicycleHold();
      }
    } else if (RUN_KEYS.has(event.code)) {
      this.controls.pressRun(event.code);
    } else if (ACTION_KEYS.has(event.code)) {
      event.preventDefault();
      if (!event.repeat) this.primaryAction();
    } else if (BICYCLE_KEYS.has(event.code)) {
      event.preventDefault();
      if (!event.repeat) {
        this.game.toggleBicycle();
        this.update();
      }
    }
  }

  private setTouch(enabled: boolean): void {
    this.clearInput();
    this.touch.classList.toggle('on', enabled);
    this.touch.setAttribute('aria-hidden', String(!enabled));
    this.touchToggle.setAttribute('aria-pressed', String(enabled));
  }

  private clearInput(): void {
    this.controls.clear();
    this.clearBicycleHold();
  }

  private clearBicycleHold(): void {
    this.bicyclePointers.clear();
    this.bicycleHold = undefined;
  }

  private canHoldBicycleDirection(): boolean {
    return this.game.riding && this.touch.classList.contains('on') && !document.hidden && this.mode === 'explore';
  }

  private syncBicycleHold(direction = this.controls.state().dir, now = performance.now()): void {
    if (!this.canHoldBicycleDirection() || !direction) {
      this.clearBicycleHold();
      return;
    }
    // Controls picks the most recent direction across keyboard and touch. Only a held arrow can start the touch boost.
    const touchDirection = [...this.bicyclePointers.values()].at(-1);
    if (direction !== touchDirection) this.bicycleHold = undefined;
    else if (this.bicycleHold?.direction !== direction) this.bicycleHold = { direction, since: now };
  }

  private bindTouch(): void {
    this.setTouch(matchMedia('(pointer: coarse)').matches);
    this.touchToggle.addEventListener('click', () => {
      if (this.panels.active || this.minimap?.isOpen || this.travel?.()?.isOpen) return;
      this.setTouch(!this.touch.classList.contains('on'));
      this.focusMap();
    });
    for (const button of this.touch.querySelectorAll<HTMLButtonElement>('button')) {
      const direction = button.dataset.dir as Facing | undefined;
      const bicycle = button.dataset.bike !== undefined;
      button.setAttribute('aria-label', direction ? TOUCH_LABELS[direction] : bicycle ? 'じてんしゃに のる・おりる' : 'しらべる・はなす');
      button.addEventListener('pointerdown', event => {
        if (this.panels.active || this.minimap?.isOpen || this.travel?.()?.isOpen) return;
        event.preventDefault();
        this.focusMap();
        button.setPointerCapture(event.pointerId);
        if (direction) {
          this.controls.press(`pointer-${event.pointerId}`, direction);
          if (this.canHoldBicycleDirection()) this.bicyclePointers.set(event.pointerId, direction);
          this.syncBicycleHold();
        } else if (bicycle) {
          this.game.toggleBicycle();
          this.update();
        } else this.primaryAction();
      });
      const release = (event: PointerEvent) => {
        this.controls.release(`pointer-${event.pointerId}`);
        if (!this.bicyclePointers.delete(event.pointerId)) return;
        if (event.type !== 'pointerup') this.bicycleHold = undefined;
        this.syncBicycleHold();
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }
  }
}
