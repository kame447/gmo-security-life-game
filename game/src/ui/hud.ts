/** 画面上の文字表示：現在地・会話欄・操作ヒント・一時的なお知らせ。毎フレーム状態から描き直す。 */
import { pxToTile } from '../core/coords';
import type { Game } from '../session/game';
import { districtAt } from '../world';
import { $ } from './dom';

const TOAST_MS = 2400;
const IDLE_HINT = 'やじるし / WASD：あるく　Shift：はしる　Z / Space / Enter：しらべる';
const RIDING_HINT = 'やじるし / WASD：こぐ　Shift：かそく　B：おりる　Z / Space / Enter：しらべる';

export class Hud {
  private readonly location = $<HTMLElement>('#hud');
  private readonly hint = $<HTMLElement>('#hint');
  private readonly toast = $<HTMLElement>('#toast');
  private readonly dialog = $<HTMLElement>('#dialog');
  private readonly speaker = $<HTMLElement>('.who', this.dialog);
  private readonly line = $<HTMLElement>('.text', this.dialog);
  private toastUntil = 0;

  constructor(private readonly game: Game, onDialogClick: () => void) {
    this.dialog.setAttribute('role', 'button');
    this.dialog.setAttribute('aria-label', 'はなしをすすめる');
    const dialogPointers = new Set<number>();
    const insideDialog = (x: number, y: number) => {
      const rect = this.dialog.getBoundingClientRect();
      return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
    };
    let touchStartedInside = false;
    this.dialog.addEventListener('pointerdown', event => {
      if (!this.dialog.hidden && insideDialog(event.clientX, event.clientY)) dialogPointers.add(event.pointerId);
    });
    this.dialog.addEventListener('pointercancel', event => dialogPointers.delete(event.pointerId));
    // Touch targeting can prefer a nearby clickable element even when the finger is outside it.
    document.addEventListener('touchstart', event => {
      touchStartedInside = !this.dialog.hidden && [...event.changedTouches].some(touch => insideDialog(touch.clientX, touch.clientY));
    }, { passive: true, capture: true });
    this.dialog.addEventListener('click', event => {
      // A touch on A can hide that button and retarget its click to the newly opened dialog.
      const pointer = event instanceof PointerEvent ? event : undefined;
      const startedHere = pointer ? dialogPointers.delete(pointer.pointerId) : dialogPointers.size > 0;
      dialogPointers.clear();
      if (event.detail === 0 || (startedHere && (pointer?.pointerType !== 'touch' || touchStartedInside))) onDialogClick();
    });
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
    const district = districtAt(game.area, pxToTile(game.player.x), pxToTile(game.player.y - 4));
    this.location.textContent = [game.area.def.name, district?.name].filter(Boolean).join(' / ');
    this.dialog.hidden = !game.dialog;
    if (game.dialog) {
      this.speaker.textContent = game.dialog.speaker;
      this.line.textContent = game.dialog.lines[game.dialog.index] ?? '';
    }
    const target = game.facingInteraction();
    this.hint.hidden = !!game.dialog;
    const idle = game.riding ? RIDING_HINT : game.area.def.kind === 'outdoor' && game.canRide ? `${IDLE_HINT}　B：じてんしゃ` : IDLE_HINT;
    this.hint.textContent = target ? `${target.name}　Z / Space / Enter：しらべる・はなす` : idle;
    if (now >= this.toastUntil) this.toast.hidden = true;
  }
}
