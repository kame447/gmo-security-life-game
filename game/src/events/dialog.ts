/** 会話の進行状態。表示は UI 側、どの台詞を出すかはイベント側（MapEventSink）が決める。 */
export interface DialogState { speaker: string; lines: string[]; index: number }

export class DialogController {
  current: DialogState | null = null;

  /** Opens a dialog; returns false (and stays closed) when there is nothing to say. */
  open(speaker: string, lines: readonly string[]): boolean {
    if (!lines.length) return false;
    this.current = { speaker, lines: [...lines], index: 0 };
    return true;
  }

  /** Shows the next line, closing after the last one. */
  advance(): void {
    if (!this.current) return;
    this.current.index++;
    if (this.current.index >= this.current.lines.length) this.current = null;
  }

  close(): void { this.current = null; }
}
