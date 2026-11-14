import { LocalSaveSession, type LocalSaveProblem } from '../app/local-save-session';
import type { SaveData } from '../state/save';
import type { ModalPanel } from './modal-panels';
import './local-save-panel.css';

export interface LocalSaveActions {
  snapshot(): SaveData;
  newGame(): SaveData;
  reload(): void;
  onClose(): void;
}
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, id: string, text?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag); element.id = id;
  if (text !== undefined) element.textContent = text;
  return element;
};
export function localSaveProblemText(reason: LocalSaveProblem): string {
  switch (reason) {
    case 'quota-exceeded': case 'too-large': return '空き容量が足りません';
    case 'storage-unavailable': return 'このブラウザではセーブを使えません';
    case 'protected-save': return 'セーブを読み込めません';
    case 'missing': return 'セーブがありません';
    case 'review': return '一時プレイ中です';
    default: return 'セーブできませんでした';
  }
}

/** Compact in-game menu. Confirmation/navigation stays separate from the save codec. */
export class LocalSavePanel implements ModalPanel {
  readonly button = make('button', 'btn-save', 'セーブ');
  private readonly overlay = make('div', 'local-save-overlay');
  private readonly panel = make('section', 'local-save-panel');
  private readonly menu = make('div', 'local-save-menu');
  private readonly question = make('p', 'local-save-question');
  private readonly status = make('p', 'local-save-status');
  private readonly indicator = make('div', 'local-save-indicator');
  private readonly write = make('button', 'local-save-write', 'セーブ');
  private readonly resume = make('button', 'local-save-continue', 'つづきから');
  private readonly start = make('button', 'local-save-new', 'はじめから');
  private readonly confirm = make('button', 'local-save-confirm');
  private readonly back = make('button', 'local-save-back', 'もどる');
  private opened = false;
  private view: 'menu' | 'continue' | 'new' = 'menu';

  constructor(private readonly session: LocalSaveSession, stage: HTMLElement, private readonly actions: LocalSaveActions) {
    const menu = stage.querySelector<HTMLElement>('#menu');
    if (!menu) throw new Error('Missing game menu');
    this.button.className = 'panel'; this.button.type = 'button'; this.button.disabled = session.disabled;
    menu.insertBefore(this.button, menu.querySelector('#btn-touch'));
    this.overlay.hidden = true;
    this.panel.className = 'panel'; this.panel.tabIndex = -1;
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'local-save-title');
    const heading = make('h1', 'local-save-title', 'セーブ');
    this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    this.indicator.setAttribute('role', 'status'); this.indicator.setAttribute('aria-live', 'polite');
    this.menu.append(this.write, this.resume, this.start);
    for (const button of [this.write, this.resume, this.start, this.confirm, this.back]) button.type = 'button';
    this.panel.append(heading, this.menu, this.question, this.confirm, this.status, this.back);
    this.overlay.append(this.panel); stage.append(this.overlay, this.indicator);
    this.overlay.addEventListener('click', event => { if (event.target === this.overlay) this.close(); });
    this.write.addEventListener('click', () => { this.session.save(() => this.actions.snapshot(), true); });
    this.resume.addEventListener('click', () => this.ask('continue'));
    this.start.addEventListener('click', () => this.ask('new'));
    this.back.addEventListener('click', () => this.goBack());
    this.confirm.addEventListener('click', () => {
      const result = this.view === 'continue' ? this.session.continue() : this.session.startNew(() => this.actions.newGame());
      if (result.ok) { this.sync(); this.actions.reload(); }
    });
    this.session.onChange(() => this.sync());
    this.sync();
  }

  get isOpen(): boolean { return this.opened; }
  open(): void {
    if (this.session.disabled || this.session.isSwitching) return;
    this.session.pause(true); this.opened = true; this.view = 'menu';
    this.session.inspect(); this.sync(); this.write.focus();
  }
  close(): void {
    if (this.session.isSwitching) return;
    this.opened = false; this.session.pause(false); this.sync(); this.actions.onClose();
  }
  private ask(view: 'continue' | 'new'): void {
    this.view = view; this.sync(); this.back.focus();
  }
  private goBack(): void {
    if (this.view === 'menu') this.close();
    else { this.view = 'menu'; this.sync(); this.write.focus(); }
  }
  private sync(): void {
    this.overlay.hidden = !this.opened; this.panel.dataset.view = this.view;
    this.menu.hidden = this.view !== 'menu'; this.question.hidden = this.confirm.hidden = this.view === 'menu';
    this.question.textContent = this.view === 'continue' ? 'セーブしたところから再開しますか？' : 'はじめから遊ぶと、今の進行は上書きされます';
    this.confirm.textContent = this.view === 'continue' ? 'つづきから' : 'はじめから';
    this.resume.disabled = !this.session.hasSave;
    this.confirm.disabled = this.session.isSwitching;
    const notice = this.session.notice;
    const savedMessage = this.view === 'menu' ? 'セーブしました' : '';
    const message = notice.kind === 'saved' ? savedMessage : notice.kind === 'error' ? localSaveProblemText(notice.reason) : '';
    this.status.textContent = message; this.status.dataset.state = notice.kind; this.status.hidden = !message;
    this.indicator.textContent = notice.kind === 'error' ? message : '';
    this.indicator.hidden = this.opened || notice.kind !== 'error';
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.opened) return;
    // All keyboard input remains inside this modal, including game shortcuts.
    event.stopPropagation();
    if (event.code === 'Escape' || event.code === 'Backspace') {
      event.preventDefault(); if (!event.repeat) this.goBack(); return;
    }
    const buttons = [...this.panel.querySelectorAll<HTMLButtonElement>('button')]
      .filter(button => !button.disabled && !button.hidden && !button.closest('[hidden]'));
    if (event.code === 'Tab' || ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
      const backwards = event.shiftKey || event.code === 'ArrowUp' || event.code === 'ArrowLeft';
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (backwards ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    } else if (['Enter', 'Space', 'KeyZ'].includes(event.code)) {
      event.preventDefault(); if (!event.repeat && document.activeElement instanceof HTMLButtonElement) document.activeElement.click();
    } else { event.preventDefault(); }
  }
}
