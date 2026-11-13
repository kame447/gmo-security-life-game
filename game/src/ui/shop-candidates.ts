import { getItemDefinition } from '../data/items';
import { ClerkFlow } from '../shop/clerk-flow';
import type { ClerkContext } from '../shop/clerk-visit';
import type { ShopLayout } from '../shop/layout';
import type { ShopAssetsPort } from '../shop/purchase';
import './shop-candidates.css';

const yen = (amount: number) => `${amount.toLocaleString('ja-JP')}円`;
const ACTION = new Set(['KeyZ', 'Enter', 'Space']);

/** Small code-drawn object marks; no character art or external assets. */
function itemIcon(id: string): string {
  const marks: Record<string, string> = {
    'bottled-water': '<path d="M25 6h14v9l6 8v34H19V23l6-8Z" fill="#b8def2"/><path d="M24 5h16v9H24Z" fill="#4384a1"/><path d="M20 32h24v13H20Z" fill="#edf8fb"/>',
    notebook: '<rect x="15" y="8" width="36" height="48" fill="#d8946f"/><path d="M22 8v48M28 23h16M28 31h16M28 39h11" fill="none" stroke="#fff4df" stroke-width="3"/>',
    pencil: '<path d="m18 43 25-30 8 7-25 30-14 8Z" fill="#e6bb57"/><path d="m43 13 5-6 8 7-5 6Z" fill="#e5a6a0"/><path d="m12 58 4-10 8 7Z" fill="#4d5362"/>',
  };
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${marks[id] ?? '<rect x="15" y="14" width="34" height="38" fill="#b9c8b3"/>'}</svg>`;
}

/** Self-mounted UI candidates. All layouts share the exact same flow and asset port. */
export class ShopCandidates {
  private readonly root = document.createElement('section');
  private flow?: ClerkFlow;
  private readonly rows: HTMLButtonElement[] = [];

  constructor(private readonly assets: ShopAssetsPort, private readonly onClose: () => void,
    private readonly onPurchase: () => void, layout: ShopLayout) {
    this.root.id = 'shop-panel';
    this.root.className = 'shop-candidate';
    this.root.dataset.layout = layout;
    this.root.hidden = true;
    this.root.tabIndex = -1;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'shop-title');
    this.root.innerHTML = `
      <div class="shop-window">
        <header class="shop-heading">
          <h2 id="shop-title"></h2>
          <div class="shop-wallet"><span>所持金</span><strong id="shop-money"></strong></div>
          <button type="button" id="shop-close" class="shop-close" data-action="close" aria-label="店内に戻る">×</button>
        </header>
        <div class="shop-body">
          <section id="shop-conversation" class="shop-conversation">
            <p class="shop-speaker"></p><p id="shop-line"></p>
            <div class="shop-actions">
              <button type="button" id="shop-next" data-action="next">つぎへ</button>
              <button type="button" id="shop-start" data-action="buy">買う</button>
              <button type="button" id="shop-quit" data-action="close">やめる</button>
            </div>
          </section>
          <section id="shop-catalog" hidden>
            <div class="shop-browse">
              <div id="shop-products" class="shop-products" role="group" aria-label="商品"></div>
              <aside class="shop-detail" aria-label="選択中の商品">
                <div id="shop-icon" class="shop-large-icon"></div>
                <div><h3 id="shop-item-name"></h3><p id="shop-description"></p><p id="shop-owned" class="shop-muted"></p></div>
              </aside>
            </div>
            <footer class="shop-actions shop-catalog-actions">
              <button type="button" data-action="back">戻る</button>
              <button type="button" id="shop-review" class="shop-primary" data-action="review">選ぶ</button>
            </footer>
          </section>
          <section id="shop-checkout" hidden>
            <p class="shop-speaker"></p>
            <div class="shop-checkout-item"><span id="shop-checkout-icon" class="shop-small-icon"></span><h3 id="shop-checkout-name"></h3></div>
            <div class="shop-quantity"><span>個数</span>
              <div><button type="button" id="shop-less" data-action="less" aria-label="個数を減らす">−</button>
              <output id="shop-quantity" aria-live="polite"></output>
              <button type="button" id="shop-more" data-action="more" aria-label="個数を増やす">＋</button></div>
            </div>
            <dl class="shop-totals">
              <div><dt>合計</dt><dd id="shop-total"></dd></div>
              <div class="shop-after"><dt>購入後</dt><dd id="shop-after"></dd></div>
            </dl>
            <p id="shop-notice" role="status" aria-live="polite"></p>
            <div class="shop-actions"><button type="button" id="shop-back" data-action="back">戻る</button>
              <button type="button" id="shop-confirm" class="shop-primary" data-action="confirm">購入する</button></div>
          </section>
          <section id="shop-receipt" class="shop-receipt" hidden>
            <p class="shop-speaker"></p><p id="shop-result" role="status"></p>
            <p id="shop-paid" class="shop-muted"></p>
            <div class="shop-actions"><button type="button" class="shop-primary" data-action="close">店内に戻る</button></div>
          </section>
        </div>
      </div>
      <section id="shop-dialogue" class="shop-dialogue" aria-label="店員の会話" hidden>
        <p class="shop-speaker"></p><p id="shop-prompt" aria-live="polite"></p>
      </section>`;
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
    this.flow = new ClerkFlow(context.catalog, context.greeting, this.assets);
    // A one-line greeting and its choices fit in one conversation, without an extra advance step.
    if (context.greeting.lines.length === 1) this.flow.advanceGreeting();
    this.text('#shop-title', context.catalog.name);
    for (const speaker of this.root.querySelectorAll('.shop-speaker')) speaker.textContent = context.greeting.speaker;
    const products = this.el('#shop-products'); products.replaceChildren(); this.rows.length = 0;
    context.catalog.offers.forEach((offer, index) => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'shop-product';
      row.dataset.action = 'product'; row.dataset.index = String(index);
      row.innerHTML = '<span class="shop-cursor" aria-hidden="true">▸</span><span class="shop-product-name"></span><span class="shop-price"></span>';
      row.querySelector('.shop-product-name')!.textContent = getItemDefinition(offer.itemId)?.name ?? offer.itemId;
      row.querySelector('.shop-price')!.textContent = yen(offer.priceYen);
      products.append(row); this.rows.push(row);
    });
    this.root.hidden = false; this.render(); this.root.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.flow?.close(); this.root.hidden = true; this.onClose();
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.flow || !this.isOpen) return;
    if (event.code === 'Tab') { this.tab(event); return; }
    const directions: Record<string, number> = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1, ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
    if (!ACTION.has(event.code) && event.code !== 'Escape' && !directions[event.code]) return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'Escape') { this.change(() => this.flow!.back()); return; }
    if (ACTION.has(event.code)) {
      const focused = document.activeElement instanceof HTMLButtonElement && this.root.contains(document.activeElement)
        ? document.activeElement : null;
      if (focused) { focused.click(); return; }
      const primary: Record<string, string> = { greeting: '#shop-next', choice: this.flow.choiceIndex ? '#shop-quit' : '#shop-start',
        catalog: '#shop-review', confirm: this.flow.choiceIndex ? '#shop-back' : '#shop-confirm', receipt: '#shop-receipt button' };
      this.root.querySelector<HTMLButtonElement>(primary[this.flow.phase])?.click();
      return;
    }
    const step = directions[event.code];
    if (this.flow.phase === 'confirm' && ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(event.code)) {
      this.command(step > 0 ? 'more' : 'less');
    } else this.change(() => this.flow!.move(step));
    this.root.focus();
  }

  private command(action: string, index?: number): void {
    const flow = this.flow; if (!flow || !this.isOpen) return;
    if (action === 'close') { this.close(); return; }
    this.change(() => {
      if (action === 'product') flow.selectOffer(index!);
      else if (action === 'next') flow.advanceGreeting();
      else if (action === 'buy') flow.chooseBuy();
      else if (action === 'back') flow.back();
      else if (action === 'review') flow.reviewPurchase();
      else if (action === 'confirm' && !this.button('#shop-confirm').disabled) flow.confirmPurchase();
      else if (action === 'more' && !this.button('#shop-more').disabled) flow.setBuyQuantity(flow.buyQuantity + 1);
      else if (action === 'less' && !this.button('#shop-less').disabled) flow.setBuyQuantity(flow.buyQuantity - 1);
    });
  }

  private change(action: () => void): void {
    const before = this.flow!.phase;
    action();
    if (before === 'confirm' && this.flow!.phase === 'receipt' && this.flow!.result?.ok) this.onPurchase();
    if (this.flow!.phase === 'closed') { this.close(); return; }
    this.render();
    if (before !== this.flow!.phase || !this.root.contains(document.activeElement)) this.root.focus();
  }

  private render(): void {
    const flow = this.flow!;
    this.root.dataset.phase = flow.phase;
    this.text('#shop-money', yen(flow.balanceYen));
    const conversation = flow.phase === 'greeting' || flow.phase === 'choice';
    this.el('#shop-conversation').hidden = !conversation;
    this.el('#shop-catalog').hidden = flow.phase !== 'catalog';
    this.el('#shop-checkout').hidden = flow.phase !== 'confirm';
    this.el('#shop-receipt').hidden = flow.phase !== 'receipt';
    this.text('#shop-line', flow.greetingLine);
    this.button('#shop-next').hidden = flow.phase !== 'greeting';
    this.button('#shop-start').hidden = this.button('#shop-quit').hidden = flow.phase !== 'choice';
    this.button('#shop-start').classList.toggle('is-cursor', flow.choiceIndex === 0);
    this.button('#shop-quit').classList.toggle('is-cursor', flow.choiceIndex === 1);
    this.rows.forEach((row, index) => { row.classList.toggle('is-selected', index === flow.selectedIndex); row.setAttribute('aria-pressed', String(index === flow.selectedIndex)); });
    const item = flow.offer && getItemDefinition(flow.offer.itemId), icon = itemIcon(item?.id ?? '');
    this.text('#shop-item-name', item?.name ?? ''); this.text('#shop-description', item?.description ?? '');
    this.text('#shop-owned', `所持 ${flow.quantity}個`);
    this.el('#shop-icon').innerHTML = icon; this.el('#shop-checkout-icon').innerHTML = icon;
    this.text('#shop-checkout-name', item?.name ?? '');
    this.text('#shop-quantity', `${flow.buyQuantity}`);
    this.text('#shop-total', yen(flow.totalYen));
    this.text('#shop-after', flow.balanceAfterYen < 0 ? '—' : yen(flow.balanceAfterYen));
    const noRoom = !item || flow.quantity + flow.buyQuantity > item.maxQuantity;
    const notice = noRoom ? 'これ以上 持てないよ。' : flow.balanceAfterYen < 0 ? `あと${yen(-flow.balanceAfterYen)}、たりないよ。` : '';
    this.text('#shop-notice', notice); this.el('#shop-notice').hidden = !notice;
    this.button('#shop-confirm').disabled = !!notice;
    this.button('#shop-review').disabled = !item;
    this.button('#shop-less').disabled = flow.buyQuantity <= 1;
    this.button('#shop-more').disabled = !item || flow.buyQuantity >= Math.min(99, item.maxQuantity - flow.quantity);
    this.button('#shop-confirm').classList.toggle('is-cursor', flow.choiceIndex === 0);
    this.button('#shop-back').classList.toggle('is-cursor', flow.choiceIndex === 1);
    this.el('#shop-dialogue').hidden = this.root.dataset.layout !== 'dialog';
    let prompt = flow.phase === 'greeting' || flow.phase === 'choice' ? flow.greetingLine
      : flow.phase === 'catalog' ? item?.description ?? '' : flow.phase === 'confirm' ? 'いくつにする？' : '';
    if (flow.result) {
      const result = flow.result;
      const receipt = result.ok ? `${item?.name ?? ''}を${result.boughtQuantity}個、どうぞ。` :
        result.reason === 'insufficient-funds' ? 'お金が たりないよ。' : result.reason === 'quantity-limit' ? 'これ以上 持てないよ。' : 'いまは 買えないみたい。';
      this.text('#shop-result', receipt);
      prompt = receipt;
      this.text('#shop-paid', result.ok ? `${yen(result.paidYen)}　／　所持金 ${yen(result.balanceYen)}` : '');
    }
    this.text('#shop-prompt', prompt);
  }

  private tab(event: KeyboardEvent): void {
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button')].filter(button => !button.disabled && button.getClientRects().length > 0);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault();
    buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  }
  private el(selector: string): HTMLElement { return this.root.querySelector<HTMLElement>(selector)!; }
  private button(selector: string): HTMLButtonElement { return this.root.querySelector<HTMLButtonElement>(selector)!; }
  private text(selector: string, value: string): void { this.el(selector).textContent = value; }
}
