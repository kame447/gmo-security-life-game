/** 外見変更パネル。開いている間は編集前の外見を保持し、決定で確定・取消で元に戻す。 */
import { APPEARANCE_FIELDS, APPEARANCE_OPTIONS, type AppearanceField, type PlayerAppearance } from '../core/appearance';
import { playerSprite } from '../render/sprites';
import type { Game } from '../session/game';
import { $ } from './dom';

const FIELD_LABELS: Record<AppearanceField, string> = {
  silhouette: 'かたち', hairStyle: 'かみがた', hairColor: 'かみのいろ', outfit: 'ふく', outfitColor: 'ふくのいろ',
};
const PANEL_KEYS = new Set(['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'KeyZ', 'Space', 'Enter', 'Escape', 'Tab']);

interface Row { row: HTMLElement; value: HTMLElement; field: AppearanceField }

export class AvatarPanel {
  private readonly panel = $<HTMLElement>('#avatar-panel');
  private readonly stage = $<HTMLElement>('#stage');
  private readonly preview = $<HTMLCanvasElement>('#avatar-preview');
  private readonly previewContext = this.preview.getContext('2d')!;
  private readonly rows: Row[];
  /** Appearance before opening; non-null while the panel is open. */
  private original: PlayerAppearance | null = null;
  private selected = 0;

  constructor(private readonly game: Game, private readonly onClose: (commit: boolean) => void) {
    this.rows = APPEARANCE_FIELDS.map((field, index) => this.createRow(field, index));
    $('#avatar-ok').addEventListener('click', () => this.close(true));
    $('#avatar-cancel').addEventListener('click', () => this.close(false));
  }

  get isOpen(): boolean { return this.original !== null; }
  /** The last confirmed appearance while editing, so autosave never stores a draft. */
  get confirmedAppearance(): PlayerAppearance | null { return this.original && { ...this.original }; }

  open(): void {
    if (this.original) return;
    this.original = { ...this.game.appearance };
    this.selected = 0;
    this.panel.hidden = false;
    this.stage.classList.add('avatar-open');
    this.updateRows();
    this.panel.focus({ preventScroll: true });
  }

  close(commit: boolean): void {
    if (!this.original) return;
    if (!commit) this.game.setAppearance(this.original);
    this.original = null;
    this.panel.hidden = true;
    this.stage.classList.remove('avatar-open');
    this.onClose(commit);
  }

  handleKey(event: KeyboardEvent): void {
    const code = event.code;
    if (!PANEL_KEYS.has(code)) return;
    // Let the focused cancel button perform its normal click on Enter/Space.
    if ((code === 'Enter' || code === 'Space') && event.target === $('#avatar-cancel')) return;
    event.preventDefault();
    const count = APPEARANCE_FIELDS.length;
    if (code === 'ArrowUp' || code === 'KeyW') this.selected = (this.selected + count - 1) % count;
    else if (code === 'ArrowDown' || code === 'KeyS') this.selected = (this.selected + 1) % count;
    else if (code === 'ArrowLeft' || code === 'KeyA') this.change(-1);
    else if (code === 'ArrowRight' || code === 'KeyD') this.change(1);
    else if (code === 'Escape') this.close(false);
    else if (code === 'Tab') this.cycleFocus(event.shiftKey ? -1 : 1);
    else if (!event.repeat) this.close(true);
    this.updateRows();
  }

  drawPreview(now: number): void {
    if (!this.original) return;
    const c = this.previewContext;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#384650';
    c.fillRect(0, 0, this.preview.width, this.preview.height);
    const walking = (Math.floor(now / 180) % 2 + 1) as 1 | 2;
    for (const [x, facing, step] of [[40, 'down', 0], [110, 'right', walking]] as const) {
      const sprite = playerSprite(this.game.appearance, facing, step);
      c.drawImage(sprite.canvas, x + sprite.ox * 3, 72 + sprite.oy * 3, sprite.canvas.width * 3, sprite.canvas.height * 3);
    }
  }

  private createRow(field: AppearanceField, index: number): Row {
    const row = document.createElement('div');
    row.className = 'avatar-row';
    row.dataset.field = field;
    const label = document.createElement('span');
    label.textContent = FIELD_LABELS[field];
    const value = document.createElement('span');
    value.className = 'avatar-value';
    value.setAttribute('aria-live', 'polite');
    const stepButton = (step: number) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.step = String(step);
      button.textContent = step < 0 ? '◀' : '▶';
      button.setAttribute('aria-label', `${FIELD_LABELS[field]}：${step < 0 ? 'まえ' : 'つぎ'}`);
      button.addEventListener('click', () => { this.selected = index; this.change(step); });
      return button;
    };
    row.append(label, stepButton(-1), value, stepButton(1));
    $('#avatar-rows').append(row);
    return { row, value, field };
  }

  private change(step: number): void {
    if (!this.original) return;
    const field = APPEARANCE_FIELDS[this.selected], options = APPEARANCE_OPTIONS[field];
    const current = options.findIndex(option => option.id === this.game.appearance[field]);
    const next = options[(current + step + options.length) % options.length].id;
    this.game.setAppearance({ ...this.game.appearance, [field]: next });
    this.updateRows();
  }

  private cycleFocus(step: number): void {
    const buttons = [...this.panel.querySelectorAll<HTMLButtonElement>('button')];
    const active = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(active + step + buttons.length) % buttons.length].focus();
  }

  private updateRows(): void {
    for (const { row, value, field } of this.rows) {
      row.classList.toggle('selected', APPEARANCE_FIELDS[this.selected] === field);
      value.textContent = APPEARANCE_OPTIONS[field].find(option => option.id === this.game.appearance[field])!.name;
    }
  }
}
