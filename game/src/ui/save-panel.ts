import { LocalSaveStore, saveDateLabel, saveFailureMessage, type SaveResult } from '../app/local-save';
import type { World } from '../world';
import './save-panel.css';

export interface SavePanelActions {
  save(checkpoint: boolean): SaveResult;
  leave(): void;
  restored(): void;
}

export class SavePanel {
  readonly button = document.createElement('button');
  readonly cloudHost = document.createElement('div');
  private readonly root = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly lastSave = document.createElement('p');
  private readonly historyList = document.createElement('div');
  private readonly closeButton = document.createElement('button');
  private previousFocus: HTMLElement | null = null;

  constructor(private readonly store: LocalSaveStore, private readonly world: World,
    private readonly actions: SavePanelActions, private readonly onClose: () => void) {
    this.button.id = 'btn-save'; this.button.type = 'button'; this.button.className = 'panel';
    this.button.textContent = '保存'; this.button.setAttribute('aria-label', '保存と復元');
    document.querySelector('#menu')!.append(this.button);
    this.root.id = 'save-panel'; this.root.className = 'save-panel panel'; this.root.hidden = true;
    this.root.tabIndex = -1; this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'save-panel-title');
    const title = document.createElement('h1'); title.id = 'save-panel-title'; title.textContent = '保存と復元';
    const lead = document.createElement('p'); lead.textContent = '今の記録を保存して、あとから続けられます。';
    this.lastSave.className = 'save-last'; this.status.className = 'save-status'; this.status.setAttribute('role', 'status');
    this.closeButton.type = 'button'; this.closeButton.textContent = '閉じる'; this.closeButton.className = 'save-close';
    this.closeButton.addEventListener('click', () => this.close());
    const head = document.createElement('header'); head.append(title, this.closeButton);
    const controls = document.createElement('div'); controls.className = 'save-actions';
    const save = document.createElement('button'); save.type = 'button'; save.textContent = '保存する'; save.dataset.saveAction = 'save';
    save.addEventListener('click', () => { this.report(this.actions.save(true), '保存しました。'); this.render(); });
    const leave = document.createElement('button'); leave.type = 'button'; leave.textContent = '保存してタイトルへ'; leave.dataset.saveAction = 'title';
    leave.addEventListener('click', () => {
      const result = this.actions.save(true);
      this.report(result, '保存しました。');
      if (result.ok) this.actions.leave();
    });
    controls.append(save, leave);
    const recovery = document.createElement('h2'); recovery.textContent = '過去の記録から戻す';
    const help = document.createElement('p'); help.textContent = '復元ポイントは直近3件まで。戻す前の記録も残します。';
    help.className = 'save-help';
    this.historyList.className = 'save-history';
    this.root.append(head, lead, this.lastSave, controls, this.status, recovery, help, this.historyList, this.cloudHost);
    document.querySelector('#stage')!.append(this.root);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  open(): void {
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.status.textContent = ''; this.render(); this.root.hidden = false; this.closeButton.focus({ preventScroll: true });
  }

  close(): void {
    this.root.hidden = true; this.onClose(); this.previousFocus?.focus({ preventScroll: true });
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    if (event.code === 'Escape' || event.code === 'KeyO') { event.preventDefault(); this.close(); return; }
    if (event.key === 'Tab') {
      const buttons = Array.from(this.root.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary, a[href]'))
        .filter(el => el.getClientRects().length > 0);
      if (!buttons.length) { event.preventDefault(); this.root.focus(); return; }
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); buttons.at(-1)!.focus(); }
      else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[0].focus(); }
    }
  }

  private report(result: SaveResult, success: string): void {
    this.status.textContent = result.ok ? success : saveFailureMessage(result.reason);
    this.status.dataset.failed = String(!result.ok);
  }

  private render(): void {
    const state = this.store.inspect(this.world);
    this.lastSave.textContent = state.kind === 'valid' ? `前回の保存：${saveDateLabel(state.savedAt)}`
      : state.kind === 'empty' ? 'まだ保存していません。' : saveFailureMessage(state.reason);
    this.historyList.replaceChildren();
    try {
      const history = this.store.history();
      if (!history.length) this.historyList.textContent = '復元ポイントはまだありません。';
      for (const point of history) {
        const row = document.createElement('div'); row.className = 'save-history-row';
        const time = document.createElement('span'); time.textContent = saveDateLabel(point.createdAt);
        const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = 'この記録へ戻す';
        restore.addEventListener('click', () => {
          if (!window.confirm('この記録に戻しますか？ 現在の保存済み記録は復元ポイントに残します。')) return;
          const result = this.store.restore(point.id, this.world);
          this.report(result, '記録を復元しました。');
          if (result.ok) this.actions.restored();
        });
        row.append(time, restore); this.historyList.append(row);
      }
    } catch { this.historyList.textContent = '復元ポイントを読み込めません。保存されている内容は変更していません。'; }
  }
}
