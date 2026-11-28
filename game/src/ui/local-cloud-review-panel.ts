import { LocalCloudReviewGateway, REVIEW_ACCOUNTS, copyReviewSave,
  type ReviewAccount, type ReviewCloudCandidate, type ReviewCloudOptions, type ReviewCloudProblem } from '../app/local-cloud-review';
import type { SaveData } from '../state/save';
import './local-cloud-review.css';

export interface LocalCloudReviewPanelOptions extends ReviewCloudOptions {
  getCurrentSave(): SaveData;
  onRestore(save: SaveData): Promise<boolean>;
}
const ACCOUNT_LABELS: Record<ReviewAccount, string> = { 'account-a': '確認用アカウント A', 'account-b': '確認用アカウント B' };
const PROBLEMS: Partial<Record<ReviewCloudProblem, string>> = {
  UNAUTHENTICATED: '確認用アカウントでログインしてください。',
  LOCAL_UNAVAILABLE: '確認用データを保存・読み込みできませんでした。ブラウザーの保存領域を確認してください。',
  REVISION_CONFLICT: '確認用の保存が別の操作で更新されています。この端末からの上書きを止めました。保存側の内容を確認して読み込むか、そのままゲームを続けられます。',
  CORRUPT_SAVE: '確認用の保存を読み取れないため、上書きを止めました。元のデータを保持しています。',
  UNSUPPORTED_VERSION: '新しい形式の確認用データです。変更せず保持します。',
  TOO_LARGE: '確認用保存の容量を超えています。進行や履歴は切り捨てていません。',
  NOT_FOUND: 'このアカウントには確認用の保存がありません。',
  SESSION_CHANGED: 'ログイン状態が変わったため、操作を止めました。',
};
function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = value; return node;
}
function summary(save: SaveData): string {
  const money = save.assets?.moneyYen;
  return typeof money === 'number' && Number.isFinite(money) ? `所持金 ${money.toLocaleString('ja-JP')}円` : 'ゲームの進行データ';
}
function date(value: string): string { return new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }); }

/** Mount inside a host's save screen. Restoring is delegated to its existing safe replacement flow. */
export class LocalCloudReviewPanel {
  readonly root = document.createElement('section');
  private readonly gateway: LocalCloudReviewGateway;
  private accountChoice: ReviewAccount = 'account-a';
  private busy = false;
  private notice = '';
  private pendingSave?: SaveData;
  private candidate?: ReviewCloudCandidate;

  constructor(private readonly options: LocalCloudReviewPanelOptions) {
    this.gateway = new LocalCloudReviewGateway(options);
    this.root.className = 'local-cloud-review';
    this.root.setAttribute('aria-label', 'クラウド保存のローカル確認');
    this.render();
  }

  /** The host calls this on opening; a confirmation from an earlier visit is discarded. */
  refresh(): void {
    if (!this.busy) { this.pendingSave = undefined; this.candidate = undefined; this.notice = ''; }
    this.render();
  }

  private button(label: string, action: string, run: () => void | Promise<void>, disabled = false): HTMLButtonElement {
    const button = text('button', label);
    button.type = 'button'; button.dataset.cloudAction = action;
    button.disabled = this.busy || disabled;
    button.addEventListener('click', () => { if (!this.busy) void this.run(run); });
    return button;
  }

  private async run(action: () => void | Promise<void>): Promise<void> {
    this.busy = true; this.render();
    try { await action(); }
    catch { this.notice = '操作を完了できませんでした。もう一度確認してください。'; }
    finally { this.busy = false; this.render(); }
  }

  private async prepareSave(): Promise<void> {
    this.candidate = undefined;
    this.pendingSave = copyReviewSave(this.options.getCurrentSave());
    this.notice = '';
  }

  private async prepareRestore(): Promise<void> {
    this.pendingSave = undefined;
    this.candidate = await this.gateway.loadCandidate();
    this.notice = '';
  }

  private async restore(): Promise<void> {
    const candidate = this.candidate;
    if (!candidate || !this.gateway.isCurrent(candidate)) { this.notice = 'ログイン状態が変わったため、読み込みを止めました。'; return; }
    const accepted = await this.options.onRestore(copyReviewSave(candidate.data));
    if (accepted && this.gateway.acceptRestored(candidate)) {
      this.candidate = undefined;
      this.notice = '確認用の保存を読み込みました。';
    } else this.notice = '読み込みは完了していません。現在の進行を続けられます。';
  }

  private async simulateConflict(): Promise<void> {
    this.pendingSave = undefined; this.candidate = undefined;
    const data = copyReviewSave(this.options.getCurrentSave());
    const other = await this.gateway.simulateOtherDevice(data);
    if (!other.problem) await this.gateway.save(data);
    this.notice = '';
  }

  private render(): void {
    const active = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)
      ? document.activeElement.dataset.cloudAction : undefined;
    const state = this.gateway.snapshot();
    this.root.replaceChildren(text('h3', 'クラウド保存（ローカル確認版）'));
    const explanation = text('p', '本番の Cognito 認証は未接続です。確認用アカウントと保存データはこのブラウザー内だけで扱い、実際のクラウドには送信しません。');
    explanation.className = 'local-cloud-note';
    this.root.append(explanation);
    const accountRow = document.createElement('div'); accountRow.className = 'local-cloud-actions';
    if (!state.account) {
      const select = document.createElement('select');
      select.setAttribute('aria-label', '確認用アカウント'); select.disabled = this.busy;
      for (const account of REVIEW_ACCOUNTS) {
        const option = text('option', ACCOUNT_LABELS[account]); option.value = account; select.append(option);
      }
      select.value = this.accountChoice;
      select.addEventListener('change', () => { this.accountChoice = select.value as ReviewAccount; });
      accountRow.append(select, this.button('確認用ログイン', 'sign-in', async () => {
        this.pendingSave = undefined; this.candidate = undefined;
        await this.gateway.signIn(this.accountChoice); this.notice = '確認用アカウントでログインしました。ゲームの進行は変更していません。';
      }));
    } else {
      accountRow.append(text('span', `${ACCOUNT_LABELS[state.account]} でログイン中`), this.button('ログアウト', 'sign-out', () => {
        this.gateway.signOut(); this.pendingSave = undefined; this.candidate = undefined;
        this.notice = 'ログアウトしました。確認用の保存はこのブラウザーに残っています。';
      }));
    }
    this.root.append(accountRow);
    if (state.account) {
      this.root.append(text('p', state.confirmed
        ? `この端末が確認した保存：${date(state.confirmed.updatedAt)}（保存番号 ${state.confirmed.revision}）`
        : 'この端末が確認した保存はありません。'));
      const actions = document.createElement('div'); actions.className = 'local-cloud-actions';
      actions.append(this.button('確認用データへ保存', 'prepare-save', () => this.prepareSave(), state.problem === 'REVISION_CONFLICT'),
        this.button('確認用データを読み込む', 'prepare-restore', () => this.prepareRestore()),
        this.button('競合を試す', 'conflict', () => this.simulateConflict()));
      this.root.append(actions);
      if (state.conflict) this.root.append(text('p',
        `保存先は保存番号 ${state.conflict.revision} に更新されています。この端末が確認済みの番号は ${state.confirmed?.revision ?? 0} です。`));
    }
    if (this.pendingSave) {
      const confirmation = document.createElement('div'); confirmation.className = 'local-cloud-confirm';
      confirmation.append(text('p', `${summary(this.pendingSave)}。この進行を ${ACCOUNT_LABELS[state.account!]} の確認用データとして保存します。`),
        this.button('この内容で保存する', 'confirm-save', async () => {
          if (!this.pendingSave) return;
          const saved = await this.gateway.save(this.pendingSave); this.pendingSave = undefined;
          this.notice = saved.problem ? '' : '確認用データに保存しました。';
        }), this.button('やめる', 'cancel', () => { this.pendingSave = undefined; }));
      this.root.append(confirmation);
    }
    if (this.candidate) {
      const { data, envelope } = this.candidate;
      const confirmation = document.createElement('div'); confirmation.className = 'local-cloud-confirm';
      confirmation.append(text('p', `${date(envelope.updatedAt)} の保存番号 ${envelope.revision}。${summary(data)}。現在の保存済み記録を退避して、この内容を読み込みます。`),
        this.button('この内容を読み込む', 'confirm-restore', () => this.restore()),
        this.button('やめる', 'cancel', () => { this.candidate = undefined; }));
      this.root.append(confirmation);
    }
    const problem = state.problem ? PROBLEMS[state.problem]
      ?? '確認用の保存処理を完了できませんでした。元の保存は変更していません。' : '';
    const status = text('p', this.busy ? '処理しています…' : [problem, this.notice].filter(Boolean).join(' '));
    status.className = `local-cloud-status${state.problem ? ' is-error' : ''}`;
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    this.root.append(status);
    if (active) this.root.querySelector<HTMLButtonElement>(`[data-cloud-action="${active}"]`)?.focus({ preventScroll: true });
  }
}
