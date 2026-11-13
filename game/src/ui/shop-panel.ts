import { getItemDefinition } from '../data/items';
import { ClerkFlow } from '../shop/clerk-flow';
import type { ClerkContext } from '../shop/clerk-visit';
import type { ShopAssetsPort } from '../shop/purchase';
import './shop-panel.css';

const yen = (amount: number) => `${amount.toLocaleString('ja-JP')}円`;
const ACTION = new Set(['KeyZ', 'Enter', 'Space']);

/** A single compact panel. Clerk speech and the product list share normal, non-overlapping layout. */
export class ShopPanel {
  private readonly root = document.createElement('section');
  private readonly rows: HTMLButtonElement[] = [];
  private flow?: ClerkFlow;

  constructor(private readonly assets: ShopAssetsPort, private readonly onClose: () => void,
    private readonly onPurchase: () => void) {
    this.root.id = 'shop-panel';
    this.root.className = 'shop-panel';
    this.root.hidden = true;
    this.root.tabIndex = -1;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'shop-title');
    this.root.innerHTML = `
      <header class="shop-heading">
        <h2 id="shop-title"></h2>
        <div class="shop-wallet"><span>所持金</span><strong id="shop-money"></strong></div>
        <button type="button" id="shop-close" data-action="close" aria-label="店内に戻る">×</button>
      </header>
      <div class="shop-content">
        <section id="shop-products" class="shop-products" role="group" aria-label="商品"></section>
        <aside id="shop-detail" class="shop-detail" aria-label="選択中の商品">
          <h3 id="shop-item-name"></h3><p id="shop-description"></p><p id="shop-owned"></p>
          <button type="button" id="shop-review" class="shop-primary" data-action="review">選ぶ</button>
          <div id="shop-receipt" hidden><button type="button" class="shop-primary" data-action="close">店内に戻る</button></div>
        </aside>
        <section id="shop-checkout" class="shop-checkout" aria-label="購入の確認" hidden>
          <div class="shop-quantity"><span>個数</span><div>
            <button type="button" id="shop-less" data-action="less" aria-label="個数を減らす">−</button>
            <output id="shop-quantity" aria-live="polite"></output>
            <button type="button" id="shop-more" data-action="more" aria-label="個数を増やす">＋</button>
          </div></div>
          <dl class="shop-totals"><div><dt>合計</dt><dd id="shop-total"></dd></div>
            <div><dt>購入後</dt><dd id="shop-after"></dd></div></dl>
          <p id="shop-notice" role="status" aria-live="polite" hidden></p>
          <div class="shop-actions"><button type="button" id="shop-back" data-action="back">戻る</button>
            <button type="button" id="shop-confirm" class="shop-primary" data-action="confirm">購入する</button></div>
        </section>
      </div>
      <footer id="shop-conversation" class="shop-conversation" aria-label="店員の会話">
        <p class="shop-speaker"></p><p id="shop-line"></p><p id="shop-result" role="status" hidden></p>
      </footer>`;
    this.root.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
      if (button && !button.disabled) this.command(button.dataset.action!, Number(button.dataset.index));
    });
    this.root.addEventListener('focusin', event => {
      const button = event.target as HTMLButtonElement;
      if (button.dataset.action === 'product' && this.flow?.phase === 'catalog') {
        this.change(() => this.flow!.selectOffer(Number(button.dataset.index)));
      }
    });
    document.querySelector('#stage')!.append(this.root);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  open(context: ClerkContext): void {
    if (this.isOpen) return;
    this.flow = ClerkFlow.openShop(context.catalog, context.greeting, this.assets);
    this.text('#shop-title', context.catalog.name);
    this.text('.shop-speaker', context.greeting.speaker);
    this.el('#shop-products').replaceChildren(); this.rows.length = 0;
    context.catalog.offers.forEach((offer, index) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'shop-product';
      row.dataset.action = 'product'; row.dataset.index = String(index);
      row.innerHTML = '<span class="shop-cursor" aria-hidden="true">▸</span><span class="shop-product-name"></span><span class="shop-price"></span>';
      row.querySelector('.shop-product-name')!.textContent = getItemDefinition(offer.itemId)?.name ?? offer.itemId;
      row.querySelector('.shop-price')!.textContent = yen(offer.priceYen);
      this.el('#shop-products').append(row); this.rows.push(row);
    });
    this.root.hidden = false; this.render(); this.root.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.flow?.close(); this.root.hidden = true; this.onClose();
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.isOpen || !this.flow) return;
    if (event.code === 'Tab') { this.tab(event); return; }
    const directions: Record<string, number> = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1,
      ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
    if (!ACTION.has(event.code) && event.code !== 'Escape' && !directions[event.code]) return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'Escape') {
      if (this.flow.phase === 'confirm') this.command('back'); else this.close();
      return;
    }
    if (ACTION.has(event.code)) {
      const focused = document.activeElement instanceof HTMLButtonElement && this.root.contains(document.activeElement)
        ? document.activeElement : null;
      if (focused) {
        // A focused product is already selected. Activation reviews it, never pays for it.
        if (focused.dataset.action === 'product' && !focused.disabled) this.command('review');
        else focused.click();
        return;
      }
      if (this.flow.phase === 'catalog') this.command('review');
      else if (this.flow.phase === 'confirm') this.command(this.flow.choiceIndex ? 'back' : 'confirm');
      else if (this.flow.phase === 'receipt') this.close();
      return;
    }
    if (this.flow.phase === 'confirm' && ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(event.code)) {
      this.command(directions[event.code] > 0 ? 'more' : 'less');
    } else this.change(() => this.flow!.move(directions[event.code]));
    this.root.focus();
  }

  private command(action: string, index?: number): void {
    const flow = this.flow;
    if (!flow || !this.isOpen) return;
    if (action === 'close') { this.close(); return; }
    this.change(() => {
      if (action === 'product') flow.selectOffer(index!);
      else if (action === 'review') flow.reviewPurchase();
      else if (action === 'back' && flow.phase === 'confirm') flow.back();
      else if (action === 'confirm' && !this.button('#shop-confirm').disabled) flow.confirmPurchase();
      else if (action === 'more' && !this.button('#shop-more').disabled) flow.setBuyQuantity(flow.buyQuantity + 1);
      else if (action === 'less' && !this.button('#shop-less').disabled) flow.setBuyQuantity(flow.buyQuantity - 1);
    });
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
      row.classList.toggle('is-selected', index === flow.selectedIndex);
      row.setAttribute('aria-pressed', String(index === flow.selectedIndex));
      row.disabled = flow.phase !== 'catalog';
    });
    const item = flow.offer && getItemDefinition(flow.offer.itemId);
    this.text('#shop-item-name', item?.name ?? '');
    this.text('#shop-description', item?.description ?? '');
    this.text('#shop-owned', `所持 ${flow.quantity}個`);
    this.el('#shop-review').hidden = flow.phase !== 'catalog';
    this.button('#shop-review').disabled = !item;
    this.el('#shop-receipt').hidden = !receipt;
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
    this.text('#shop-line', flow.greeting.lines[0] ?? '');
    this.el('#shop-line').hidden = receipt; this.el('#shop-result').hidden = !receipt;
    if (flow.result) {
      const result = flow.result;
      this.text('#shop-result', result.ok ? `${item?.name ?? ''}を${result.boughtQuantity}個、どうぞ。` :
        result.reason === 'insufficient-funds' ? 'お金が たりないよ。' : result.reason === 'quantity-limit' ? 'これ以上 持てないよ。' : 'いまは 買えないみたい。');
    }
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
