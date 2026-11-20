/**
 * 会話の記録を読み返す画面（L キー・「かいわ」ボタン）。記録は events/dialog-log.ts が持ち、ここは表示だけ。
 * 開いている間は ModalPanels の仕組みで探索・時間の進行（ストーリーの残り時間を含む）が止まる。
 */
import type { DialogLog } from '../events/dialog-log';
import type { ModalPanel } from './modal-panels';
import './dialog-log.css';

const SCROLL_STEP = 48;

export class DialogLogPanel implements ModalPanel {
  readonly button = document.createElement('button');
  private readonly root = document.createElement('section');
  private readonly list = document.createElement('ol');
  private readonly empty = document.createElement('p');
  private open_ = false;

  constructor(private readonly log: DialogLog, stage: HTMLElement, private readonly onClose: () => void) {
    this.button.type = 'button';
    this.button.id = 'btn-log';
    this.button.className = 'panel';
    this.button.textContent = 'かいわ';
    this.button.title = 'かいわの きろく（L）';
    const menu = stage.querySelector<HTMLElement>('#menu')!;
    menu.insertBefore(this.button, menu.querySelector('#btn-touch'));

    this.root.id = 'dialog-log';
    this.root.className = 'panel';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'dialog-log-title');
    this.root.tabIndex = -1;
    this.root.hidden = true;
    const title = document.createElement('h1');
    title.id = 'dialog-log-title';
    title.textContent = 'かいわの きろく';
    this.list.className = 'dialog-log-list';
    this.list.tabIndex = 0;
    this.list.setAttribute('aria-label', 'これまでの かいわ');
    this.empty.className = 'dialog-log-empty';
    this.empty.textContent = 'まだ かいわは ありません。';
    const footer = document.createElement('div');
    footer.className = 'dialog-log-footer';
    const help = document.createElement('span');
    help.textContent = '↑↓：スクロール　L / Esc：とじる';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'とじる';
    close.addEventListener('click', () => this.close());
    footer.append(help, close);
    this.root.append(title, this.list, this.empty, footer);
    stage.append(this.root);
  }

  get isOpen(): boolean { return this.open_; }

  open(): void {
    this.render();
    this.open_ = true;
    this.root.hidden = false;
    this.list.focus({ preventScroll: true });
    // Newest at the bottom, like a chat history.
    this.list.scrollTop = this.list.scrollHeight;
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.root.hidden = true;
    this.onClose();
  }

  handleKey(event: KeyboardEvent): void {
    if (event.code === 'Tab') return;
    event.preventDefault();
    if (event.code === 'Escape' || event.code === 'KeyL') { if (!event.repeat) this.close(); return; }
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this.list.scrollBy({ top: -SCROLL_STEP });
    else if (event.code === 'ArrowDown' || event.code === 'KeyS') this.list.scrollBy({ top: SCROLL_STEP });
    else if (event.code === 'PageUp') this.list.scrollBy({ top: -this.list.clientHeight });
    else if (event.code === 'PageDown') this.list.scrollBy({ top: this.list.clientHeight });
    else if ((event.code === 'Enter' || event.code === 'Space') && event.target instanceof HTMLButtonElement) event.target.click();
  }

  private render(): void {
    const entries = this.log.entries;
    this.empty.hidden = entries.length > 0;
    this.list.hidden = entries.length === 0;
    this.list.replaceChildren(...entries.map((entry, i) => {
      const item = document.createElement('li');
      item.className = `dialog-log-${entry.kind}`;
      if (entry.kind === 'choice') {
        item.textContent = `▶ ${entry.text}`;
        return item;
      }
      // A speaker label only where the speaker changes, as in the dialog box.
      const previous = entries[i - 1];
      if (entry.speaker && (previous?.kind !== 'line' || previous.speaker !== entry.speaker)) {
        const who = document.createElement('div');
        who.className = 'who';
        who.textContent = entry.speaker;
        item.append(who);
      }
      item.append(entry.text);
      return item;
    }));
  }
}
