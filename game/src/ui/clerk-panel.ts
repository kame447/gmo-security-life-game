/** 会話に連続する店員の買い物画面。自己マウントし、入力の排他は共通モーダルへ登録する。 */
import { getItemDefinition } from '../data/items';
import { ACTION_KEYS, DIRECTION_KEYS } from '../input/controls';
import { ClerkFlow } from '../shop/clerk-flow';
import type { ClerkContext } from '../shop/clerk-visit';
import type { ShopAssetsPort } from '../shop/purchase';
import { $ } from './dom';
import { shopIcon } from './shop-icons';
import './clerk-panel.css';

const KINDS: Record<string, string> = { snack: 'おやつ', drink: 'のみもの', stationery: 'ぶんぼうぐ' };
const yen = (value: number) => `${value.toLocaleString('ja-JP')} 円`;

export class ClerkPanel {
  readonly element = document.createElement('section');
  private flow: ClerkFlow | null = null;
  private products: HTMLButtonElement[] = [];

  constructor(private readonly assets: ShopAssetsPort, private readonly onClose: () => void, private readonly onPurchase: () => void) {
    this.element.id = 'clerk-panel';
    this.element.hidden = true;
    this.element.tabIndex = -1;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'clerk-store-name');
    this.element.innerHTML = `
      <header class="clerk-heading"><div class="clerk-place"><span id="clerk-store-icon"></span><div><strong id="clerk-store-name"></strong><small>店員との会話</small></div></div>
        <div class="clerk-wallet"><span>所持金</span><strong id="clerk-wallet"></strong></div></header>
      <div class="clerk-trade" id="clerk-trade" hidden>
        <div class="clerk-stock"><p class="clerk-stock-label">品ぞろえ <small>1回のお買い物で 1個</small></p><div id="clerk-products" aria-label="商品一覧"></div></div>
        <article class="clerk-detail" aria-live="polite"><div id="clerk-item-icon"></div><span id="clerk-item-kind"></span><h2 id="clerk-item-name"></h2>
          <p id="clerk-item-description"></p><dl class="clerk-facts"><dt>お値段</dt><dd id="clerk-item-price"></dd><dt>もっている数</dt><dd id="clerk-item-quantity"></dd></dl></article>
      </div>
      <div id="clerk-confirmation" hidden><span>1個のお会計 <b id="clerk-cost"></b></span><span>購入後 <strong id="clerk-after"></strong></span></div>
      <div class="clerk-dialogue"><span class="clerk-speaker" id="clerk-speaker"></span><p id="clerk-line" aria-live="polite"></p><p id="clerk-receipt" role="status" hidden></p></div>
      <div id="clerk-actions"></div><p class="clerk-keyhint">矢印 / WASD：選ぶ　Z / Enter / Space：決定　Esc：戻る</p>`;
    $('#stage').append(this.element);
    this.find('#clerk-store-icon').append(shopIcon('store'));
  }
  get isOpen(): boolean { return this.flow !== null; }
  private find<T extends Element = HTMLElement>(selector: string): T { return $<T>(selector, this.element); }

  open(context: ClerkContext): void {
    if (this.isOpen) return;
    this.flow = new ClerkFlow(context.catalog, context.greeting, this.assets);
    this.element.dataset.storeId = context.store.storeId;
    this.find('#clerk-store-name').textContent = context.catalog.name;
    this.find('#clerk-speaker').textContent = context.greeting.speaker;
    this.products = context.catalog.offers.map((offer, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'clerk-product'; button.dataset.itemId = offer.itemId;
      const cursor = document.createElement('i'); cursor.className = 'clerk-cursor'; cursor.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.textContent = getItemDefinition(offer.itemId)?.name ?? offer.itemId;
      const price = document.createElement('span'); price.className = 'clerk-price'; price.textContent = yen(offer.priceYen);
      button.append(cursor, shopIcon(offer.itemId), name, price);
      const select = () => { this.flow?.selectOffer(index); this.render(); };
      button.addEventListener('click', select);
      button.addEventListener('focus', select);
      return button;
    });
    this.find('#clerk-products').replaceChildren(...this.products);
    if (!this.products.length) {
      const empty = document.createElement('p'); empty.className = 'clerk-empty'; empty.textContent = 'いまは 商品の準備中です。';
      this.find('#clerk-products').append(empty);
    }
    this.element.hidden = false;
    this.render();
    this.element.focus({ preventScroll: true });
  }
  close(): void {
    if (!this.flow) return;
    this.flow.close(); this.flow = null; this.element.hidden = true;
    this.onClose();
  }
  handleKey(event: KeyboardEvent): void {
    if (!this.flow) return;
    if (event.code === 'Tab') {
      event.preventDefault();
      const buttons = [...this.element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button => !button.closest('[hidden]'));
      const active = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = active < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (active + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus(); return;
    }
    const direction = DIRECTION_KEYS[event.code];
    if (!direction && !ACTION_KEYS.has(event.code) && event.code !== 'Escape') return;
    event.preventDefault();
    if (event.repeat) return;
    const active = document.activeElement;
    if (ACTION_KEYS.has(event.code) && active instanceof HTMLButtonElement && this.element.contains(active) && !active.disabled) { active.click(); return; }
    if (direction) { this.perform(() => this.flow?.move(direction === 'up' || direction === 'left' ? -1 : 1)); this.element.focus({ preventScroll: true }); }
    else if (event.code === 'Escape') this.perform(() => this.flow?.back());
    else this.perform(() => this.flow?.primaryAction());
  }
  private perform(action: () => void): void {
    const before = this.flow?.phase;
    action();
    if (before === 'confirm' && this.flow?.phase === 'receipt' && this.flow.result?.ok) this.onPurchase();
    if (this.flow?.phase === 'closed') this.close();
    else this.render();
  }
  private render(): void {
    const flow = this.flow;
    if (!flow) return;
    const focusWasInside = this.element.contains(document.activeElement);
    this.element.dataset.phase = flow.phase;
    this.find('#clerk-wallet').textContent = yen(flow.balanceYen);
    this.find<HTMLElement>('#clerk-trade').hidden = flow.phase !== 'catalog' && flow.phase !== 'confirm';
    this.find<HTMLElement>('#clerk-confirmation').hidden = flow.phase !== 'confirm';
    this.products.forEach((button, index) => {
      button.classList.toggle('selected', index === flow.selectedIndex);
      button.setAttribute('aria-pressed', String(index === flow.selectedIndex));
      button.disabled = flow.phase !== 'catalog';
    });
    const offer = flow.offer, item = offer && getItemDefinition(offer.itemId);
    this.find('#clerk-item-icon').replaceChildren(shopIcon(offer?.itemId ?? 'store'));
    this.find('#clerk-item-kind').textContent = item ? KINDS[item.category] ?? 'もちもの' : '';
    this.find('#clerk-item-name').textContent = item?.name ?? '準備中';
    this.find('#clerk-item-description').textContent = item?.description ?? '商品がそろったら、また見にきてね。';
    this.find('#clerk-item-price').textContent = offer ? yen(offer.priceYen) : '—';
    this.find('#clerk-item-quantity').textContent = item ? `${flow.quantity} / ${item.maxQuantity} 個` : '—';
    this.find('#clerk-cost').textContent = offer ? yen(offer.priceYen) : '';
    this.find('#clerk-after').textContent = flow.balanceAfterYen >= 0 ? yen(flow.balanceAfterYen) : `あと ${yen(-flow.balanceAfterYen)} 足りません`;
    const line = this.find('#clerk-line'), receipt = this.find<HTMLElement>('#clerk-receipt');
    receipt.hidden = flow.phase !== 'receipt';
    receipt.textContent = '';
    const actions = this.find('#clerk-actions'); actions.replaceChildren();
    const button = (id: string, label: string, action: () => void, primary = false, selected = false) => {
      const node = document.createElement('button'); node.id = id; node.type = 'button'; node.className = `clerk-action${primary ? ' primary' : ''}${selected ? ' selected' : ''}`;
      node.textContent = label; node.addEventListener('click', () => this.perform(action)); actions.append(node); return node;
    };
    const leave = () => this.flow?.close();
    // Only greeting/choice uses the NPC's original lines. Other sales copy is a prototype proposal.
    if (flow.phase === 'greeting') {
      line.textContent = flow.greetingLine;
      button('clerk-next', '話をきく  ▶', () => this.flow?.advanceGreeting(), true);
    } else if (flow.phase === 'choice') {
      line.textContent = flow.greetingLine;
      button('clerk-start', '買い物をする', () => this.flow?.chooseBuy(), true, flow.choiceIndex === 0);
      button('clerk-leave', 'やめる', leave, false, flow.choiceIndex === 1);
    } else if (flow.phase === 'catalog') {
      line.textContent = offer ? 'こちらが今ある商品です。気になるものを選んでね。' : 'ごめんね、いまは商品の準備中なんだ。';
      button('clerk-review', 'この商品を選ぶ', () => this.flow?.reviewPurchase(), true).disabled = !offer;
      button('clerk-back', '会話にもどる', () => this.flow?.back());
    } else if (flow.phase === 'confirm') {
      line.textContent = `${item?.name ?? ''}を 1個で、よろしいですか？`;
      button('clerk-pay', `${yen(offer.priceYen)}で 購入する`, () => this.flow?.confirmPurchase(), true, flow.choiceIndex === 0);
      button('clerk-cancel', 'やめて 一覧へ', () => this.flow?.browseAgain(), false, flow.choiceIndex === 1);
    } else if (flow.phase === 'receipt') {
      const result = flow.result;
      line.textContent = result?.ok ? `ありがとう！ ${item?.name ?? ''}を 1個、どうぞ。`
        : result?.reason === 'insufficient-funds' ? 'ごめんね、お金が少し足りないみたい。別の商品も見てみる？'
        : result?.reason === 'quantity-limit' ? 'それは もういっぱい持っているみたい。また必要になったら来てね。'
        : 'ごめんね、いまはその商品を渡せないんだ。';
      receipt.textContent = result?.ok ? `お支払い ${yen(result.paidYen)}　／　のこり ${yen(result.balanceYen)}　／　所持数 ${result.quantity} 個`
        : 'お金と もちものは変わっていません。';
      button('clerk-browse', 'ほかの商品を見る', () => this.flow?.browseAgain());
      button('clerk-leave', '店内へ戻る', leave, true);
    }
    const active = document.activeElement;
    if (focusWasInside && (!this.element.contains(active) || active?.closest('[hidden]'))) this.element.focus({ preventScroll: true });
  }
}
