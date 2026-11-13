/** 買い物の表示とクリック・キー操作。状態遷移と資産の更新は ShopFlow に任せる。 */
import { getItemDefinition } from '../data/items';
import type { ShopDefinition } from '../data/shops';
import { ACTION_KEYS, DIRECTION_KEYS } from '../input/controls';
import { ShopFlow } from '../shop/flow';
import { handleShopKey } from '../shop/input';
import type { ShopAssetsPort } from '../shop/purchase';
import { $ } from './dom';

export class ShopPanel {
  private readonly panel = $<HTMLElement>('#shop-panel');
  private readonly stage = $<HTMLElement>('#stage');
  private readonly list = $<HTMLElement>('#shop-list');
  private readonly details = $<HTMLElement>('#shop-details');
  private readonly buy = $<HTMLButtonElement>('#shop-buy');
  private readonly back = $<HTMLButtonElement>('#shop-back');
  private flow: ShopFlow | null = null;
  private rows: HTMLButtonElement[] = [];

  constructor(
    private readonly assets: ShopAssetsPort,
    private readonly onClose: () => void,
    private readonly onPurchase: () => void,
  ) {
    this.buy.addEventListener('click', () => this.primaryAction());
    this.back.addEventListener('click', event => { if (event.detail < 2) this.goBack(); });
    $('#shop-close').addEventListener('click', () => this.close());
  }

  get isOpen(): boolean { return this.flow !== null; }

  open(shop: ShopDefinition): void {
    if (this.isOpen) return;
    this.flow = new ShopFlow(shop, this.assets);
    $('#shop-title').textContent = shop.name;
    this.rows = shop.offers.map((offer, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.itemId = offer.itemId;
      button.textContent = `${getItemDefinition(offer.itemId)?.name ?? offer.itemId}　${offer.priceYen}円`;
      button.addEventListener('focus', () => {
        if (this.flow?.phase !== 'browse') return;
        this.flow.move(index - this.flow.selectedIndex);
        this.render();
      });
      button.addEventListener('click', () => { this.flow?.select(index); this.render(); });
      return button;
    });
    this.list.replaceChildren(...this.rows);
    this.panel.hidden = false;
    this.stage.classList.add('shop-open');
    this.render();
    this.panel.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.flow) return;
    this.flow.close();
    this.flow = null;
    this.panel.hidden = true;
    this.stage.classList.remove('shop-open');
    this.onClose();
  }

  primaryAction(): void {
    if (!this.flow) return;
    const confirming = this.flow.phase === 'confirm';
    this.flow.primaryAction();
    if (confirming && this.flow.result?.ok) this.onPurchase();
    this.render();
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.flow) return;
    if (event.code === 'Tab') {
      event.preventDefault();
      const buttons = [...this.panel.querySelectorAll<HTMLButtonElement>('button')].filter(b => !b.hidden && !b.closest('[hidden]'));
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
        : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
      return;
    }
    // Action keys activate the focused button, including cancel and close.
    const focused = document.activeElement;
    if (ACTION_KEYS.has(event.code) && focused instanceof HTMLButtonElement && this.panel.contains(focused)) {
      event.preventDefault();
      if (!event.repeat) focused.click();
      return;
    }
    const before = this.flow.phase;
    if (!handleShopKey(this.flow, event.code, event.repeat)) return;
    event.preventDefault();
    if (before === 'browse' && DIRECTION_KEYS[event.code]) this.panel.focus({ preventScroll: true });
    if (before === 'confirm' && this.flow.result?.ok) this.onPurchase();
    if (this.flow.phase === 'closed') this.close();
    else this.render();
  }

  private goBack(): void {
    this.flow?.back();
    if (this.flow?.phase === 'closed') this.close();
    else this.render();
  }

  private render(): void {
    const flow = this.flow;
    if (!flow) return;
    this.panel.dataset.phase = flow.phase;
    this.list.hidden = flow.phase !== 'browse';
    this.buy.hidden = flow.phase !== 'confirm';
    this.back.hidden = flow.phase === 'browse';
    this.back.textContent = flow.phase === 'confirm' ? 'やめて 商品にもどる' : '商品にもどる';
    $('#shop-balance').textContent = `いまの お金：${flow.balanceYen}円`;
    this.rows.forEach((row, index) => {
      row.classList.toggle('selected', index === flow.selectedIndex);
      row.setAttribute('aria-current', String(index === flow.selectedIndex));
    });
    const offer = flow.offer;
    const item = offer && getItemDefinition(offer.itemId);
    const name = item?.name ?? offer?.itemId ?? '';
    const status = $('#shop-result');
    status.textContent = '';
    if (flow.phase === 'result') {
      this.details.textContent = '';
      const result = flow.result;
      status.textContent = result?.ok ? `${name}を 1こ かったよ。${result.paidYen}円 はらって、のこり ${result.balanceYen}円。もちものは ${result.quantity}こ。`
        : result?.reason === 'insufficient-funds' ? 'お金が たりないよ。お金と もちものは かわっていないよ。'
        : result?.reason === 'quantity-limit' ? 'これいじょう もてないよ。お金と もちものは かわっていないよ。'
        : 'いまは かえないよ。お金と もちものは かわっていないよ。';
    } else {
      const balance = flow.balanceAfterYen >= 0 ? `${flow.balanceAfterYen}円` : `お金が ${-flow.balanceAfterYen}円 たりない`;
      this.details.textContent = offer ? `${name}：${item?.description ?? ''}\n1こ ${offer.priceYen}円 ／ もっている数 ${flow.quantity}こ${item ? `（上限 ${item.maxQuantity}こ）` : ''}\nかったあとの お金：${balance}` : '商品が ないよ。';
    }
    // A hidden, previously focused button must not retain keyboard focus.
    if (document.activeElement?.closest('#shop-panel [hidden]')) this.panel.focus({ preventScroll: true });
  }
}
