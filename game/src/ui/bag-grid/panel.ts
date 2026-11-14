import { getItemDefinition, ITEM_DEFINITIONS, type ItemCategory, type ItemDefinition } from '../../data/items';
import type { Game } from '../../session/game';
import { $ } from '../dom';
import { gridItemIcon } from './icons';
import './style.css';

const DIRECTIONS: Readonly<Record<string, number>> = {
  ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1,
  ArrowUp: -4, KeyW: -4, ArrowDown: 4, KeyS: 4,
};

/** A single inventory grid. Selection is UI state; browsing never changes assets. */
export class GridBagPanel {
  readonly button = document.createElement('button');
  private readonly overlay = document.createElement('div');
  private readonly slots: HTMLElement;
  private readonly detail: HTMLElement;
  private category: ItemCategory = 'normal';
  private readonly selected: Record<ItemCategory, string | undefined> = { normal: undefined, important: undefined };

  constructor(private readonly game: Game, private readonly onClose: () => void) {
    this.button.id = 'btn-inventory';
    this.button.type = 'button';
    this.button.className = 'panel grid-bag-launch';
    this.button.textContent = 'もちもの';
    $('#btn-avatar').after(this.button);

    this.overlay.id = 'inventory-panel';
    this.overlay.className = 'grid-bag-overlay';
    this.overlay.hidden = true;
    this.overlay.innerHTML = '<section class="grid-bag" role="dialog" aria-modal="true" aria-labelledby="grid-bag-title" tabindex="-1">' +
      '<header class="grid-bag-header"><h1 id="grid-bag-title">もちもの</h1>' +
      '<div class="grid-bag-wallet" aria-label="所持金"><span></span><strong id="grid-bag-money"></strong><small>円</small></div>' +
      '<button type="button" class="grid-bag-close" aria-label="閉じる">×</button></header>' +
      '<nav class="grid-bag-tabs" aria-label="アイテムの区分">' +
      '<button type="button" data-category="normal">通常<span></span></button>' +
      '<button type="button" data-category="important">重要<span></span></button></nav>' +
      '<div class="grid-bag-body"><div class="grid-bag-items"><div class="grid-bag-slots" role="group"></div>' +
      '<p class="grid-bag-empty" hidden>空</p></div><section class="grid-bag-detail" aria-live="polite" aria-label="選択中のアイテム"></section></div></section>';
    $('#stage').append(this.overlay);
    $('#grid-bag-title', this.overlay).prepend(gridItemIcon('bag'));
    $('.grid-bag-wallet span', this.overlay).append(gridItemIcon('coin'));
    this.slots = $('.grid-bag-slots', this.overlay);
    this.detail = $('.grid-bag-detail', this.overlay);
    $('.grid-bag-close', this.overlay).addEventListener('click', () => this.close());
    for (const tab of this.tabs) tab.addEventListener('click', () => {
      this.category = tab.dataset.category as ItemCategory;
      this.render();
    });
    this.overlay.addEventListener('click', event => { if (event.target === this.overlay) this.close(); });
  }

  get isOpen(): boolean { return !this.overlay.hidden; }

  open(): void {
    if (this.isOpen) return;
    document.body.classList.add('grid-bag-open');
    this.overlay.hidden = false;
    this.render();
    (this.selectedButton ?? this.tabs[0]).focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.overlay.hidden = true;
    document.body.classList.remove('grid-bag-open');
    this.onClose();
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    const code = event.code;
    if (code === 'Escape' || code === 'KeyI') {
      event.preventDefault();
      if (!event.repeat) this.close();
      return;
    }
    if (code === 'Tab') {
      event.preventDefault();
      const buttons = [...this.overlay.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.tabIndex >= 0);
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>('button') : null;
    if ((code === 'Enter' || code === 'Space') && target && this.overlay.contains(target)) return;
    if (code === 'KeyZ') {
      event.preventDefault();
      if (!event.repeat && target && this.overlay.contains(target)) target.click();
      return;
    }
    if (code === 'BracketLeft' || code === 'BracketRight') {
      event.preventDefault();
      this.category = this.category === 'normal' ? 'important' : 'normal';
      this.render();
      this.tabs.find(tab => tab.dataset.category === this.category)!.focus();
      return;
    }
    const delta = DIRECTIONS[code];
    if (delta === undefined) return;
    event.preventDefault();
    if (target?.dataset.category && Math.abs(delta) === 1) {
      this.category = this.category === 'normal' ? 'important' : 'normal';
      this.render();
      this.tabs.find(tab => tab.dataset.category === this.category)!.focus();
      return;
    }
    if (target?.dataset.category) {
      this.selectedButton?.focus({ preventScroll: true });
      return;
    }
    const items = this.items;
    if (!items.length) return;
    const index = Math.max(0, items.findIndex(item => item.id === this.selected[this.category]));
    this.select(items[Math.max(0, Math.min(items.length - 1, index + delta))].id);
    this.selectedButton?.focus({ preventScroll: true });
  }

  private get tabs(): HTMLButtonElement[] {
    return [...this.overlay.querySelectorAll<HTMLButtonElement>('[data-category]')];
  }
  private get items(): readonly ItemDefinition[] {
    return ITEM_DEFINITIONS.filter(item => item.category === this.category && this.game.assets.quantity(item.id) > 0);
  }
  private get selectedButton(): HTMLButtonElement | undefined {
    return [...this.slots.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.itemId === this.selected[this.category]);
  }

  private render(): void {
    $('#grid-bag-money', this.overlay).textContent = this.game.assets.moneyYen.toLocaleString('ja-JP');
    const items = this.items;
    if (!items.some(item => item.id === this.selected[this.category])) this.selected[this.category] = items[0]?.id;
    for (const tab of this.tabs) {
      const category = tab.dataset.category as ItemCategory;
      const count = ITEM_DEFINITIONS.filter(item => item.category === category && this.game.assets.quantity(item.id) > 0).length;
      tab.setAttribute('aria-pressed', String(category === this.category));
      $('span', tab).textContent = String(count);
    }
    this.slots.setAttribute('aria-label', this.category === 'normal' ? '通常の持ち物' : '重要な持ち物');
    this.slots.replaceChildren();
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'grid-bag-slot';
      button.dataset.itemId = item.id;
      button.setAttribute('aria-label', item.name + '、' + this.game.assets.quantity(item.id) + '個');
      button.append(gridItemIcon(item.id));
      const count = document.createElement('span');
      count.className = 'grid-bag-count';
      count.textContent = String(this.game.assets.quantity(item.id));
      button.append(count);
      button.addEventListener('focus', () => this.select(item.id));
      button.addEventListener('click', () => this.select(item.id));
      this.slots.append(button);
    }
    // Empty cells convey the grid, without promising a gameplay capacity limit.
    const cells = Math.max(12, Math.ceil(items.length / 4) * 4);
    for (let index = items.length; index < cells; index++) {
      const cell = document.createElement('span');
      cell.className = 'grid-bag-slot grid-bag-slot-empty';
      cell.setAttribute('aria-hidden', 'true');
      this.slots.append(cell);
    }
    $('.grid-bag-empty', this.overlay).hidden = items.length > 0;
    this.renderDetail();
  }

  private select(id: string): void {
    this.selected[this.category] = id;
    this.renderDetail();
  }

  private renderDetail(): void {
    const id = this.selected[this.category];
    const item = id ? getItemDefinition(id) : undefined;
    for (const button of this.slots.querySelectorAll<HTMLButtonElement>('button')) {
      const selected = button.dataset.itemId === id;
      button.setAttribute('aria-pressed', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    this.detail.replaceChildren();
    this.detail.hidden = !item;
    if (!item) return;
    const visual = document.createElement('div');
    visual.className = 'grid-bag-detail-icon';
    visual.append(gridItemIcon(item.id));
    const text = document.createElement('div');
    text.className = 'grid-bag-detail-text';
    const name = document.createElement('h2');
    name.textContent = item.name;
    const quantity = document.createElement('strong');
    quantity.className = 'grid-bag-detail-count';
    quantity.textContent = '× ' + this.game.assets.quantity(item.id);
    quantity.setAttribute('aria-label', '所持数 ' + this.game.assets.quantity(item.id) + '個');
    const description = document.createElement('p');
    description.textContent = item.description;
    text.append(name, quantity, description);
    this.detail.append(visual, text);
  }
}
