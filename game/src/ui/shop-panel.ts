import { TILE } from '../core/coords';
import { getItemDefinition } from '../data/items';
import { ClerkFlow } from '../shop/clerk-flow';
import { PointerOrigin } from '../shop/pointer-origin';
import type { ClerkContext } from '../shop/clerk-visit';
import type { ShopAssetsPort } from '../shop/purchase';
import { itemIcon } from './bag-hotbar/icons';
import './shop-panel.css';

const yen = (amount: number) => `${amount.toLocaleString('ja-JP')}円`;
const ACTION = new Set(['KeyZ', 'Enter', 'Space']);
/** How long the clerk's greeting keeps the bar when the cursor is not moved. */
const GREETING_MS = 2000;

export interface ShopScene {
  stats: { zoom: number; camX: number; camY: number };
  area: { width: number; height: number };
  playerX: number;
}

/**
 * Three separate boxes inside the drawn room: the wallet (top corner), the product list (the other side) and one bar
 * (bottom) that carries, one at a time, the clerk's words, the description of the product under the cursor, or the
 * purchase check.
 * The boxes follow the room's rectangle on screen and its pixel scale, and the list takes the side away from the player.
 */
export class ShopPanel {
  private readonly root = document.createElement('section');
  private readonly rows: HTMLButtonElement[] = [];
  private readonly pointerOrigin = new PointerOrigin<HTMLButtonElement>();
  private flow?: ClerkFlow;
  /** The cursor rests on the last row, which leaves the shop. */
  private onExit = false;
  /** The greeting keeps the bar until the cursor first moves, a product is decided or GREETING_MS passes. */
  private greeted = false;
  private greetingTimer = 0;
  /** Whether the pressed row already had the cursor when the pointer went down. */
  private pressedCursorRow = false;
  private layoutKey = '';
  private followFrame?: number;

  constructor(private readonly assets: ShopAssetsPort, private readonly onClose: () => void,
    private readonly onPurchase: () => void, private readonly scene: () => ShopScene) {
    this.root.id = 'shop-panel';
    this.root.className = 'shop-panel';
    this.root.hidden = true;
    this.root.tabIndex = -1;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '買い物');
    this.root.innerHTML = `
      <div class="shop-stage">
        <div class="shop-box shop-wallet"><span>所持金</span><strong id="shop-money"></strong></div>
        <div class="shop-box shop-list">
          <div id="shop-products" class="shop-products" role="group" aria-label="商品"></div>
          <span id="shop-below" class="shop-below" aria-hidden="true" hidden></span>
        </div>
        <div id="shop-conversation" class="shop-box shop-bar">
          <div id="shop-icon" class="shop-icon"></div>
          <div id="shop-info" class="shop-info">
            <p><span class="shop-speaker"></span><span id="shop-line"></span><span id="shop-result" role="status" hidden></span></p>
            <p id="shop-description"></p>
          </div>
          <section id="shop-checkout" class="shop-checkout" aria-label="購入の確認" hidden>
            <p class="shop-checkout-item"><strong id="shop-item-name"></strong><span id="shop-owned"></span></p>
            <div class="shop-quantity" role="group" aria-label="個数">
              <button type="button" id="shop-less" data-action="less" aria-label="個数を減らす">−</button>
              <output id="shop-quantity" aria-live="polite"></output>
              <button type="button" id="shop-more" data-action="more" aria-label="個数を増やす">＋</button>
            </div>
            <dl class="shop-totals"><div><dt>合計</dt><dd id="shop-total"></dd></div>
              <div><dt>購入後</dt><dd id="shop-after"></dd></div></dl>
            <div class="shop-actions"><button type="button" id="shop-confirm" data-action="confirm">買う</button>
              <button type="button" id="shop-back" data-action="back">やめる</button></div>
            <p id="shop-notice" role="status" aria-live="polite" hidden></p>
          </section>
        </div>
      </div>`;
    document.addEventListener('pointerdown', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
      const own = this.isOpen && button && !button.disabled && this.root.contains(button) ? button : undefined;
      this.pressedCursorRow = !!own && own.classList.contains('is-selected');
      this.pointerOrigin.begin(own);
    }, { capture: true });
    document.addEventListener('pointercancel', () => this.pointerOrigin.reset(), { capture: true });
    this.root.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
      if (!button || button.disabled || !this.pointerOrigin.accept(button, event.detail)) return;
      // A row takes the cursor first; only a second press on the cursor row opens the purchase check.
      const again = event.detail === 0 ? button.classList.contains('is-selected') : this.pressedCursorRow;
      if (button.dataset.action === 'product' && again && this.flow?.phase === 'catalog') this.command('review');
      else this.command(button.dataset.action!, Number(button.dataset.index));
    });
    this.root.addEventListener('focusin', event => {
      const button = event.target as HTMLButtonElement;
      if (button.dataset.action === 'product' && this.flow?.phase === 'catalog') this.command('product', Number(button.dataset.index));
    });
    this.el('#shop-products').addEventListener('scroll', () => this.markBelow());
    document.querySelector('#stage')!.append(this.root);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  open(context: ClerkContext): void {
    if (this.isOpen) return;
    this.pointerOrigin.reset();
    this.flow = ClerkFlow.openShop(context.catalog, context.greeting, this.assets);
    this.onExit = false; this.greeted = true;
    window.clearTimeout(this.greetingTimer);
    this.greetingTimer = window.setTimeout(() => { if (this.isOpen && this.greeted) { this.endGreeting(); this.render(); } }, GREETING_MS);
    // Rows are drawn tighter for a mouse; touch screens keep 44px rows.
    this.root.classList.toggle('is-touch', navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches);
    const speaker = context.greeting.speaker.trim();
    this.text('.shop-speaker', speaker ? `${speaker}：` : '');
    this.el('#shop-products').replaceChildren(); this.rows.length = 0;
    const addRow = (action: string, name: string, price: string, index?: number) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'shop-product'; row.dataset.action = action;
      if (index === undefined) row.id = 'shop-exit'; else row.dataset.index = String(index);
      row.innerHTML = '<span class="shop-product-name"></span><span class="shop-price"></span>';
      row.querySelector('.shop-product-name')!.textContent = name;
      row.querySelector('.shop-price')!.textContent = price;
      this.el('#shop-products').append(row); this.rows.push(row);
    };
    context.catalog.offers.forEach((offer, index) =>
      addRow('product', getItemDefinition(offer.itemId)?.name ?? offer.itemId, yen(offer.priceYen), index));
    addRow('close', '店を出る', '');
    this.root.hidden = false; this.layoutKey = ''; this.follow(); this.render(); this.root.focus();
  }

  /** While open, keep the boxes on the room as the camera settles or the window changes. */
  private follow(): void {
    if (!this.isOpen) return;
    this.layout();
    this.followFrame = requestAnimationFrame(() => this.follow());
  }

  /**
   * Places the boxes on the visible part of the room, using live scene data supplied by the caller.
   */
  private layout(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#view')!, view = canvas.getBoundingClientRect();
    const origin = this.root.getBoundingClientRect(), { stats, area, playerX: worldPlayerX } = this.scene(), edge = 8;
    const unit = stats.zoom * view.width / canvas.width;
    const room = { x: view.x - stats.camX * unit, y: view.y - stats.camY * unit, w: area.width * TILE * unit, h: area.height * TILE * unit };
    const playerX = view.x + (worldPlayerX - stats.camX) * unit;
    // The visible part of the room, grown around its centre to a usable minimum on small screens.
    const fit = (start: number, size: number, low: number, high: number, least: number) => {
      const from = Math.max(start, low), to = Math.min(start + size, high);
      const length = Math.min(high - low, Math.max(to - from, least));
      return { start: Math.min(high - length, Math.max(low, (from + to - length) / 2)), length };
    };
    const across = fit(room.x, room.w, view.x + edge, view.right - edge, 392);
    // A narrow column needs more height: the purchase check wraps onto more lines there.
    const down = fit(room.y, room.h, view.y + edge, view.bottom - edge, across.length < 420 ? 330 : 320);
    const scale = Math.max(unit, Math.min(1.75, across.length / 224));
    const mirrored = playerX > across.start + across.length / 2;
    const key = [across.start, across.length, down.start, down.length, scale, mirrored].map(value => Math.round(Number(value) * 100)).join();
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const stage = this.el('.shop-stage').style;
    stage.left = `${Math.round(across.start - origin.x)}px`; stage.top = `${Math.round(down.start - origin.y)}px`;
    stage.width = `${Math.round(across.length)}px`; stage.height = `${Math.round(down.length)}px`;
    this.root.style.setProperty('--shop-unit', `${scale}px`);
    this.root.style.setProperty('--shop-line', `${Math.max(2, Math.round(scale))}px`);
    this.root.style.setProperty('--shop-bar', `${Math.round(down.length * .22)}px`);
    this.root.classList.toggle('is-mirrored', mirrored);
    if (this.flow?.phase !== 'confirm') this.rows[this.cursor]?.scrollIntoView?.({ block: 'nearest' });
    this.markBelow();
  }

  /** A small mark at the bottom of the list while more rows continue below. */
  private markBelow(): void {
    const list = this.el('#shop-products');
    // Room for the mark is kept only when the rows do not fit the box.
    this.el('.shop-list').classList.toggle('is-long', list.scrollHeight - list.clientHeight > 1);
    this.el('#shop-below').hidden = list.scrollHeight - list.scrollTop - list.clientHeight <= 1;
  }

  close(): void {
    if (!this.isOpen) return;
    if (this.followFrame !== undefined) cancelAnimationFrame(this.followFrame);
    this.followFrame = undefined;
    this.pointerOrigin.reset(); this.endGreeting();
    this.flow?.close(); this.root.hidden = true; this.onClose();
  }

  private endGreeting(): void { this.greeted = false; window.clearTimeout(this.greetingTimer); }

  handleKey(event: KeyboardEvent): void {
    if (!this.isOpen || !this.flow) return;
    if (event.code === 'Tab') { this.pointerOrigin.reset(); this.tab(event); return; }
    const directions: Record<string, number> = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1,
      ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
    if (!ACTION.has(event.code) && event.code !== 'Escape' && !directions[event.code]) return;
    this.pointerOrigin.reset();
    event.preventDefault();
    if (event.repeat) return;
    const flow = this.flow;
    if (event.code === 'Escape') {
      if (flow.phase === 'confirm') this.command('back'); else this.close();
      return;
    }
    if (ACTION.has(event.code)) {
      // The clerk's reply is only acknowledged; the same key press never starts another purchase.
      if (flow.phase === 'receipt') { this.command('acknowledge'); return; }
      const focused = document.activeElement instanceof HTMLButtonElement && this.root.contains(document.activeElement)
        ? document.activeElement : null;
      if (focused && !focused.disabled) {
        // A focused product already has the cursor. Activation reviews it, never pays for it.
        if (focused.dataset.action === 'product') this.command('review'); else focused.click();
        return;
      }
      if (flow.phase === 'catalog') { if (this.onExit) this.close(); else this.command('review'); }
      else if (flow.phase === 'confirm') this.command(flow.choiceIndex ? 'back' : 'confirm');
      return;
    }
    const step = directions[event.code];
    if (flow.phase === 'confirm') {
      if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(event.code)) this.command(step > 0 ? 'more' : 'less');
      else this.change(() => flow.move(step));
    } else this.command('move', step);
    this.root.focus();
  }

  private command(action: string, index?: number): void {
    const flow = this.flow;
    if (!flow || !this.isOpen) return;
    if (action === 'close') { this.close(); return; }
    this.change(() => {
      if (flow.phase === 'receipt') flow.browseAgain();
      if (action === 'product') this.cursorTo(index!);
      else if (action === 'move') this.cursorTo((this.cursor + index! + this.rows.length) % this.rows.length);
      else if (action === 'review' && !this.onExit) { this.endGreeting(); flow.reviewPurchase(); }
      else if (action === 'back' && flow.phase === 'confirm') flow.back();
      else if (action === 'confirm' && !this.button('#shop-confirm').disabled) flow.confirmPurchase();
      else if (action === 'more' && !this.button('#shop-more').disabled) flow.setBuyQuantity(flow.buyQuantity + 1);
      else if (action === 'less' && !this.button('#shop-less').disabled) flow.setBuyQuantity(flow.buyQuantity - 1);
    });
  }

  /** Row index of the cursor; the last row leaves the shop. */
  private get cursor(): number { return this.onExit ? this.rows.length - 1 : this.flow!.selectedIndex; }

  private cursorTo(row: number): void {
    const flow = this.flow!;
    if (flow.phase !== 'catalog' || row === this.cursor) return;
    this.endGreeting();
    this.onExit = row === this.rows.length - 1;
    if (!this.onExit) flow.selectOffer(row);
  }

  private change(action: () => void): void {
    const before = this.flow!.phase;
    action();
    if (before === 'confirm' && this.flow!.phase === 'receipt' && this.flow!.result?.ok) this.onPurchase();
    this.render();
    if (before !== this.flow!.phase || !this.root.contains(document.activeElement)) this.root.focus();
  }

  private render(): void {
    const flow = this.flow!, confirming = flow.phase === 'confirm', receipt = flow.phase === 'receipt';
    this.root.dataset.phase = flow.phase;
    this.text('#shop-money', yen(flow.balanceYen));
    this.rows.forEach((row, index) => {
      row.classList.toggle('is-selected', index === this.cursor);
      row.setAttribute('aria-pressed', String(index === this.cursor));
      row.disabled = confirming;
    });
    const item = this.onExit ? undefined : flow.offer && getItemDefinition(flow.offer.itemId);
    // The bar carries one thing at a time: the clerk's words, the product under the cursor, or the purchase check.
    const greeting = this.greeted && flow.phase === 'catalog', speaking = greeting || receipt;
    this.el('#shop-icon').replaceChildren(...(item ? [itemIcon(item.id)] : []));
    this.el('#shop-icon').hidden = speaking || !item;
    this.el('#shop-conversation').classList.toggle('is-plain', speaking || !item);
    this.el('#shop-description').hidden = speaking;
    this.text('#shop-item-name', item?.name ?? '');
    this.text('#shop-description', item?.description ?? '');
    this.text('#shop-owned', `所持 ${flow.quantity}個`);
    this.el('#shop-info').hidden = confirming;
    this.el('#shop-checkout').hidden = !confirming;
    this.text('#shop-quantity', `${flow.buyQuantity}`);
    this.text('#shop-total', yen(flow.totalYen));
    this.text('#shop-after', flow.balanceAfterYen < 0 ? '—' : yen(flow.balanceAfterYen));
    const noRoom = !item || flow.quantity + flow.buyQuantity > item.maxQuantity;
    const notice = noRoom ? 'これ以上 持てないよ。' : flow.balanceAfterYen < 0 ? `あと${yen(-flow.balanceAfterYen)}、たりないよ。` : '';
    this.text('#shop-notice', notice); this.el('#shop-notice').hidden = !notice;
    this.button('#shop-confirm').disabled = !!notice;
    this.button('#shop-less').disabled = flow.buyQuantity <= 1;
    this.button('#shop-more').disabled = !item || flow.buyQuantity >= Math.min(99, item.maxQuantity - flow.quantity);
    this.button('#shop-confirm').classList.toggle('is-cursor', flow.choiceIndex === 0);
    this.button('#shop-back').classList.toggle('is-cursor', flow.choiceIndex === 1);
    // Only the clerk's short first sentence is used as the greeting.
    this.text('#shop-line', (flow.greeting.lines[0] ?? '').match(/^[^。！？]*[。！？]?/)![0]);
    this.el('#shop-line').hidden = !greeting; this.el('#shop-result').hidden = !receipt;
    this.el('.shop-speaker').hidden = !speaking || !this.el('.shop-speaker').textContent;
    if (flow.result) {
      const result = flow.result;
      this.text('#shop-result', result.ok ? `${item?.name ?? ''}を${result.boughtQuantity}個、どうぞ。` :
        result.reason === 'insufficient-funds' ? 'お金が たりないよ。' : result.reason === 'quantity-limit' ? 'これ以上 持てないよ。' : 'いまは 買えないみたい。');
    }
    if (!confirming) this.rows[this.cursor].scrollIntoView?.({ block: 'nearest' });
    this.markBelow();
  }

  private tab(event: KeyboardEvent): void {
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button')]
      .filter(button => !button.disabled && button.getClientRects().length > 0);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault();
    buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  }
  private el(selector: string): HTMLElement { return this.root.querySelector<HTMLElement>(selector)!; }
  private button(selector: string): HTMLButtonElement { return this.root.querySelector<HTMLButtonElement>(selector)!; }
  private text(selector: string, value: string): void { this.el(selector).textContent = value; }
}
