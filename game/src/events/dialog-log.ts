/**
 * 会話の記録（読み返し用）。表示した台詞を一行ずつ、表示した順に残す（DOM 非依存）。
 * 会話欄に出た台詞だけを記録するので、まだ読んでいない先の台詞は載らない。
 * 記録はその回のプレイの間だけで、保存はしない（試作）。
 */
import type { DialogState } from './dialog';

export interface DialogLogEntry {
  speaker: string;
  text: string;
  /** 選んだ選択肢など、台詞ではない記録。 */
  kind: 'line' | 'choice';
}

/** 残す行数の上限（古いものから消す）。仮値。 */
export const DIALOG_LOG_LIMIT = 300;

export class DialogLog {
  private readonly items: DialogLogEntry[] = [];
  private seenDialog: DialogState | null = null;
  private seenIndex = -1;

  constructor(private readonly limit = DIALOG_LOG_LIMIT) {}

  get entries(): readonly DialogLogEntry[] { return this.items; }

  /** 毎フレーム、いま会話欄に出ている会話を渡す。新しく表示された行だけを記録する。 */
  observe(dialog: DialogState | null): void {
    if (!dialog) { this.seenDialog = null; this.seenIndex = -1; return; }
    if (dialog !== this.seenDialog) { this.seenDialog = dialog; this.seenIndex = -1; }
    const index = Math.min(dialog.index, dialog.lines.length - 1);
    // Lines skipped in one frame are still recorded, in order.
    for (let i = this.seenIndex + 1; i <= index; i++) this.push({ speaker: dialog.speaker, text: dialog.lines[i], kind: 'line' });
    this.seenIndex = Math.max(this.seenIndex, index);
  }

  /** 選んだ選択肢を記録する。 */
  choice(label: string): void { this.push({ speaker: '', text: label, kind: 'choice' }); }

  private push(entry: DialogLogEntry): void {
    if (!entry.text) return;
    this.items.push(entry);
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit);
  }
}
