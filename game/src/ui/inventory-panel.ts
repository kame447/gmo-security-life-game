import type { Game } from '../session/game';
import { BAG_CATEGORIES, BagModel, bagIcon, bagCategory, type BagCategory, type BagIcon } from './bag-model';
import { paintBagIcon } from './inventory-icons';
import { $ } from './dom';
import './inventory-panel.css';

/** Self-mounted bag screen. All actions here are selection and inspection, never asset changes. */
export class InventoryPanel {
  readonly button = document.createElement('button');
  private readonly root = document.createElement('section');
  private readonly model = new BagModel();
  private readonly categoryButtons = new Map<BagCategory, HTMLButtonElement>();
  private slots: HTMLButtonElement[] = [];

  constructor(private readonly game: Game, private readonly onClose: () => void) {
    this.button.id = 'btn-inventory';
    this.button.type = 'button';
    this.button.className = 'panel bag-menu-button';
    this.button.append(this.icon('bag'), document.createTextNode('もちもの'));
    $('#btn-avatar').after(this.button);
    this.root.id = 'inventory-panel';
    this.root.className = 'bag-overlay';
    this.root.hidden = true;
    this.root.tabIndex = -1;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'inventory-title');
    this.root.innerHTML = [
      '<div class="bag-window">',
      '<header class="bag-topbar"><div class="bag-brand"><canvas data-icon="bag"></canvas><div>',
      '<span class="bag-eyebrow">いつもの バッグ</span><h1 id="inventory-title">もちもの</h1></div></div>',
      '<div class="bag-wallet"><canvas data-icon="coin"></canvas><div><span>おかね</span><strong id="inventory-money"></strong></div></div>',
      '<button id="inventory-close" class="bag-close" type="button" aria-label="バッグを とじる"><span class="bag-close-label">とじる</span><span aria-hidden="true">×</span></button></header>',
      '<div class="bag-body"><aside class="bag-rail"><h2>ポケット</h2>',
      '<div id="inventory-categories" role="tablist" aria-label="もちものの カテゴリ"></div>',
      '<div class="bag-pocket-picture"><canvas data-icon="bag"></canvas><span>きょうの もちもの</span></div></aside>',
      '<section class="bag-contents"><div class="bag-list-heading"><h2 id="inventory-category-title"></h2><span id="inventory-count"></span></div>',
      '<div class="bag-grid-wrap"><div id="inventory-items" class="bag-grid" role="group" aria-label="もちものを えらぶ"></div>',
      '<div id="inventory-empty" class="bag-empty" hidden><canvas data-icon="bag"></canvas><strong id="inventory-empty-title"></strong><p id="inventory-empty-text"></p></div></div>',
      '<p class="bag-list-note"><span class="bag-keyboard-note">やじるしで えらべるよ</span><span class="bag-touch-note">タッチで えらべるよ</span></p></section>',
      '<aside class="bag-detail" aria-live="polite" aria-atomic="true"><div class="bag-detail-picture"><canvas id="inventory-detail-icon"></canvas></div>',
      '<div class="bag-detail-copy"><span id="inventory-detail-category" class="bag-category-tag"></span>',
      '<h2 id="inventory-detail-title"></h2><div class="bag-detail-amount" id="inventory-detail-amount"><span>もっている数</span><strong id="inventory-detail-quantity"></strong></div>',
      '<p id="inventory-detail-description"></p></div></aside></div>',
      '<footer class="bag-footer"><span><kbd>Q</kbd><kbd>E</kbd> ポケットを かえる</span><span><kbd>I</kbd> / <kbd>Esc</kbd> とじる</span></footer></div>',
    ].join('');
    $('#stage').append(this.root);
    for (const canvas of this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-icon]')) {
      canvas.setAttribute('aria-hidden', 'true');
      paintBagIcon(canvas, canvas.dataset.icon as BagIcon);
    }
    for (const category of BAG_CATEGORIES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bag-category';
      button.dataset.category = category.id;
      button.id = 'bag-category-' + category.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'inventory-items');
      const label = document.createElement('span');
      label.textContent = category.label;
      const count = document.createElement('small');
      count.className = 'bag-category-count';
      button.append(this.icon(category.icon), label, count);
      button.addEventListener('click', () => this.chooseCategory(category.id));
      $('#inventory-categories', this.root).append(button);
      this.categoryButtons.set(category.id, button);
    }
    $('#inventory-close', this.root).addEventListener('click', () => this.close());
  }

  get isOpen(): boolean { return !this.root.hidden; }
  open(): void {
    if (this.isOpen) return;
    const snapshot = this.game.assets.snapshot();
    this.model.setAssets(snapshot);
    $('#inventory-money', this.root).textContent = snapshot.moneyYen.toLocaleString('ja-JP') + ' 円';
    this.root.hidden = false;
    this.renderItems();
    this.focusSelection();
  }
  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.onClose();
  }
  handleKey(event: KeyboardEvent): void {
    const code = event.code;
    if (code === 'Escape' || code === 'KeyI') {
      event.preventDefault();
      if (!event.repeat) this.close();
      return;
    }
    if (code === 'Tab') {
      event.preventDefault();
      const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
        : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
      return;
    }
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (code === 'KeyQ' || code === 'KeyE' || (target?.classList.contains('bag-category') && ['ArrowLeft', 'ArrowRight'].includes(code))) {
      event.preventDefault();
      const step = code === 'KeyQ' || code === 'ArrowLeft' ? -1 : 1;
      const index = BAG_CATEGORIES.findIndex(category => category.id === this.model.category);
      this.chooseCategory(BAG_CATEGORIES[(index + step + BAG_CATEGORIES.length) % BAG_CATEGORIES.length].id);
      if (code === 'KeyQ' || code === 'KeyE') this.focusSelection();
      return;
    }
    const columns = getComputedStyle($('#inventory-items', this.root)).gridTemplateColumns.split(' ').length;
    const steps: Record<string, number> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1,
      ArrowUp: -columns, KeyW: -columns, ArrowDown: columns, KeyS: columns };
    if (steps[code] !== undefined) {
      event.preventDefault();
      this.model.move(steps[code]);
      this.renderSelection();
      this.focusSelection();
    } else if (code === 'KeyZ' && target) {
      event.preventDefault();
      if (!event.repeat) target.click();
    }
    // Enter/Space retain the focused button's ordinary behavior. No item-use action exists.
  }
  private icon(icon: BagIcon): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    paintBagIcon(canvas, icon);
    return canvas;
  }
  private chooseCategory(category: BagCategory): void {
    this.model.selectCategory(category);
    this.renderItems();
    this.categoryButtons.get(category)!.focus({ preventScroll: true });
  }
  private focusSelection(): void {
    const selected = this.slots.find(slot => slot.dataset.itemId === this.model.selectedId);
    (selected ?? this.root).focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  private renderItems(): void {
    this.root.dataset.category = this.model.category;
    const entries = this.model.entries();
    const category = BAG_CATEGORIES.find(category => category.id === this.model.category)!;
    $('#inventory-category-title', this.root).textContent = category.label + 'の もちもの';
    $('#inventory-count', this.root).textContent = entries.length + ' しゅるい';
    for (const [id, button] of this.categoryButtons) {
      button.setAttribute('aria-selected', String(id === this.model.category));
      button.classList.toggle('selected', id === this.model.category);
      button.querySelector('small')!.textContent = String(this.model.entries(id).length);
    }
    const grid = $('#inventory-items', this.root);
    grid.replaceChildren();
    this.slots = entries.map(entry => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bag-slot';
      button.dataset.itemId = entry.item.id;
      const name = document.createElement('span');
      name.className = 'bag-slot-name';
      name.textContent = entry.item.name;
      const quantity = document.createElement('span');
      quantity.className = 'bag-slot-quantity';
      quantity.textContent = '×' + entry.quantity;
      button.setAttribute('aria-label', entry.item.name + '、' + entry.quantity + 'こ。くわしく見る');
      button.append(this.icon(bagIcon(entry.item)), name, quantity);
      const select = () => { this.model.select(entry.item.id); this.renderSelection(); };
      button.addEventListener('click', select);
      button.addEventListener('focus', select);
      grid.append(button);
      return button;
    });
    for (let index = entries.length; index < 12; index++) {
      const slot = document.createElement('div');
      slot.className = 'bag-slot bag-slot-empty';
      slot.setAttribute('aria-hidden', 'true');
      grid.append(slot);
    }
    $('#inventory-empty', this.root).hidden = entries.length !== 0;
    const wholeBagEmpty = this.model.entries('all').length === 0;
    $('#inventory-empty-title', this.root).textContent = wholeBagEmpty ? 'バッグは からっぽ' : 'このポケットは からっぽ';
    $('#inventory-empty-text', this.root).textContent = wholeBagEmpty ? '手に入れた もちものが ここに並ぶよ。' : 'ほかのポケットも 見てみよう。';
    this.renderSelection();
  }
  private renderSelection(): void {
    const selected = this.model.selected;
    for (const button of this.slots) {
      const active = button.dataset.itemId === this.model.selectedId;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    this.root.dataset.selectedItem = selected?.item.id ?? '';
    paintBagIcon($<HTMLCanvasElement>('#inventory-detail-icon', this.root), selected ? bagIcon(selected.item) : 'bag');
    $('#inventory-detail-title', this.root).textContent = selected?.item.name ?? 'もちものを えらぼう';
    $('#inventory-detail-category', this.root).textContent = selected
      ? BAG_CATEGORIES.find(category => category.id === bagCategory(selected.item))!.label : 'もちものメモ';
    $('#inventory-detail-quantity', this.root).textContent = selected ? selected.quantity + ' こ' : '';
    $('#inventory-detail-amount', this.root).hidden = !selected;
    $('#inventory-detail-description', this.root).textContent = selected?.item.description ?? 'ポケットのなかの もちものを えらぶと、くわしく見られるよ。';
  }
}
