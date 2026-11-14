/**
 * 人生イベントの選択肢の表示と入力。
 * 導入の会話が終わったら、問いかけを既存の会話欄に出し、その上に選択肢を重ねる。
 * 選択中は会話欄・ボタン・キーの既定の動作（会話を進める等）を止め、選択を確定するまで探索に戻さない。
 * 既存の会話欄・入力処理（hud.ts・controller.ts）は変更せず、ここだけで完結させる。
 */
import type { LifeEventDirector, LifeEventOutcome, PendingLifeChoice } from '../events/director';
import type { Game } from '../session/game';
import { $ } from './dom';
import './life-event.css';

const UP_KEYS = new Set(['ArrowUp', 'KeyW']);
const DOWN_KEYS = new Set(['ArrowDown', 'KeyS']);
const CONFIRM_KEYS = new Set(['Enter', 'NumpadEnter', 'Space', 'KeyZ']);
/** 選択中も使える画面上のボタン（やり直し・タッチ操作の切替）。 */
const ALLOWED_OUTSIDE = '#btn-reset, #btn-touch';

/** Wrap-around cursor movement over a list of the given length. */
export function stepSelection(index: number, delta: number, length: number): number {
  return length ? (((index + delta) % length) + length) % length : 0;
}

export class LifeEventPanel {
  private readonly stage = $<HTMLElement>('#stage');
  private readonly canvas = $<HTMLCanvasElement>('#view');
  private readonly root = document.createElement('div');
  private readonly list = document.createElement('div');
  private buttons: HTMLButtonElement[] = [];
  private selected = 0;
  private active: PendingLifeChoice | null = null;
  private speaker = '';

  constructor(
    private readonly game: Game,
    private readonly director: LifeEventDirector,
    private readonly onResolved?: (outcome: LifeEventOutcome) => void,
  ) {
    this.root.id = 'life-choice';
    this.root.className = 'panel';
    this.root.hidden = true;
    this.list.setAttribute('role', 'group');
    const help = document.createElement('div');
    help.className = 'life-choice-help';
    help.textContent = '↑↓：えらぶ　Z / Space / Enter：けってい';
    this.root.append(this.list, help);
    this.stage.append(this.root);

    // Capture phase: runs before UiController / Hud / Minimap listeners so they cannot advance or close the dialog.
    window.addEventListener('keydown', event => this.onKeyDown(event), true);
    this.stage.addEventListener('click', event => this.guardPointer(event), true);
    this.stage.addEventListener('pointerdown', event => this.guardPointer(event), true);
  }

  get isOpen(): boolean { return !!this.active; }

  /** Call once per frame. Opens the choices after the intro dialog ends; cancels if the dialog was closed elsewhere. */
  update(): void {
    if (this.active) {
      if (!this.game.dialog) { this.director.cancel(); this.close(); }
      return;
    }
    const pending = this.director.pending;
    if (pending && !this.game.dialog) this.open(pending);
  }

  private open(pending: PendingLifeChoice): void {
    const { event } = pending;
    this.active = pending;
    this.speaker = event.speaker ?? this.game.world.areas.get(pending.areaId)?.interactions
      .find(i => i.id === pending.interactionId)?.name ?? '';
    // Reuse the existing dialog box for the question; this also keeps the player still.
    this.game.dialog = { speaker: this.speaker, lines: [event.prompt ?? ''], index: 0 };
    this.list.setAttribute('aria-label', event.prompt ?? event.title);
    this.buttons = (event.choices ?? []).map((choice, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'life-choice-option';
      button.textContent = choice.label;
      button.dataset.choiceId = choice.id;
      button.addEventListener('click', () => this.choose(choice.id));
      button.addEventListener('pointerenter', () => this.select(i));
      return button;
    });
    this.list.replaceChildren(...this.buttons);
    this.root.hidden = false;
    this.stage.classList.add('life-choosing');
    this.select(0);
  }

  private close(): void {
    this.active = null;
    this.buttons = [];
    this.list.replaceChildren();
    this.root.hidden = true;
    this.stage.classList.remove('life-choosing');
  }

  private select(index: number): void {
    this.selected = index;
    this.buttons.forEach((b, i) => { b.setAttribute('aria-current', String(i === index)); });
    this.buttons[index]?.focus({ preventScroll: true });
  }

  private choose(choiceId: string): void {
    if (!this.active) return;
    const outcome = this.director.choose(choiceId);
    const speaker = this.speaker;
    this.close();
    if (!outcome) return;
    this.game.dialog = { speaker, lines: outcome.lines, index: 0 };
    this.canvas.focus({ preventScroll: true });
    this.onResolved?.(outcome);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.active) return;
    if (event.code === 'Tab') return; // keep keyboard focus moving between the options
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (UP_KEYS.has(event.code)) this.select(stepSelection(this.selected, -1, this.buttons.length));
    else if (DOWN_KEYS.has(event.code)) this.select(stepSelection(this.selected, 1, this.buttons.length));
    else if (CONFIRM_KEYS.has(event.code)) this.confirmSelected();
    else if (digit && this.buttons[Number(digit[1]) - 1]) this.choose(this.buttons[Number(digit[1]) - 1].dataset.choiceId!);
  }

  private confirmSelected(): void {
    const focused = this.buttons.indexOf(document.activeElement as HTMLButtonElement);
    const id = this.buttons[focused >= 0 ? focused : this.selected]?.dataset.choiceId;
    if (id) this.choose(id);
  }

  /** While choosing, the dialog box, touch pad and map button must not act; the touch pad drives the cursor instead. */
  private guardPointer(event: Event): void {
    if (!this.active || !(event.target instanceof Element)) return;
    const target = event.target;
    if (target.closest('#life-choice') || target.closest(ALLOWED_OUTSIDE)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== 'pointerdown') return;
    const touchButton = target.closest<HTMLElement>('#touch button');
    if (!touchButton) return;
    if (touchButton.dataset.act) this.confirmSelected();
    else if (touchButton.dataset.dir === 'up') this.select(stepSelection(this.selected, -1, this.buttons.length));
    else if (touchButton.dataset.dir === 'down') this.select(stepSelection(this.selected, 1, this.buttons.length));
  }
}
