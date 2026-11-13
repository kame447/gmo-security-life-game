/** 画面上の文字表示：現在地・会話欄・操作ヒント・一時的なお知らせ。毎フレーム状態から描き直す。 */
import { pxToTile } from '../core/coords';
import type { Game } from '../session/game';
import { districtAt } from '../world';
import { $ } from './dom';

const TOAST_MS = 2400;
const IDLE_HINT = 'やじるし / WASD：あるく　Shift：はしる　Z / Space / Enter：しらべる';

export class Hud {
  private readonly location = $<HTMLElement>('#hud');
  private readonly hint = $<HTMLElement>('#hint');
  private readonly toast = $<HTMLElement>('#toast');
  private readonly dialog = $<HTMLElement>('#dialog');
  private readonly speaker = $<HTMLElement>('.who', this.dialog);
  private readonly line = $<HTMLElement>('.text', this.dialog);
  private readonly avatarButton = $<HTMLButtonElement>('#btn-avatar');
  private toastUntil = 0;

  constructor(private readonly game: Game, onDialogClick: () => void) {
    this.dialog.setAttribute('role', 'button');
    this.dialog.setAttribute('aria-label', 'はなしをすすめる');
    this.dialog.addEventListener('click', onDialogClick);
    this.location.setAttribute('aria-live', 'polite');
    this.toast.setAttribute('role', 'status');
  }

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.hidden = false;
    this.toastUntil = performance.now() + TOAST_MS;
  }

  update(now: number): void {
    const game = this.game;
    this.avatarButton.disabled = !!game.dialog;
    const district = districtAt(game.area, pxToTile(game.player.x), pxToTile(game.player.y - 4));
    this.location.textContent = [game.area.def.name, district?.name].filter(Boolean).join(' / ');
    this.dialog.hidden = !game.dialog;
    if (game.dialog) {
      this.speaker.textContent = game.dialog.speaker;
      this.line.textContent = game.dialog.lines[game.dialog.index] ?? '';
    }
    const target = game.facingInteraction();
    this.hint.hidden = !!game.dialog;
    this.hint.textContent = target ? `${target.name}　Z / Space / Enter：しらべる・はなす` : IDLE_HINT;
    if (now >= this.toastUntil) this.toast.hidden = true;
  }
}
