import { getItemDefinition } from '../../data/items';
import type { Game } from '../../session/game';
import { itemIcon } from './icons';
import { HotbarModel, QUICK_SLOT_COUNT, type BagGroup, type BagItem } from './model';
import './style.css';

/** Candidate A: the quick slots are references, never item consumption or equipment. */
export class HotbarPanel {
  readonly button: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly model: HotbarModel;
  private fingerprint = '';
  private opened = false;
  private hudAvailable = false;

  constructor(private readonly game: Game, private readonly onClose: () => void, private readonly onHudSelect: () => void = () => {}) {
    const menu = document.querySelector<HTMLElement>('#menu')!;
    const stage = document.querySelector<HTMLElement>('#stage')!;
    this.button = document.createElement('button');
    this.button.id = 'btn-inventory';
    this.button.type = 'button';
    this.button.className = 'panel';
    this.button.textContent = 'もちもの';
    menu.querySelector('#btn-avatar')!.after(this.button);

    this.hud = document.createElement('div');
    this.hud.className = 'bag-quick-hud';
    this.hud.setAttribute('role', 'toolbar');
    this.hud.setAttribute('aria-label', 'クイック枠');
    this.hud.hidden = true;
    stage.append(this.hud);

    this.overlay = document.createElement('div');
    this.overlay.className = 'bag-overlay';
    this.overlay.hidden = true;
    this.overlay.innerHTML = `
      <section class="bag-window" role="dialog" aria-modal="true" aria-labelledby="bag-title" tabindex="-1">
        <header class="bag-header">
          <div class="bag-title-mark" aria-hidden="true"><span></span></div>
          <div class="bag-heading"><span class="bag-eyebrow">BAG</span><h1 id="bag-title">もちもの</h1></div>
          <div class="bag-money"><span>おさいふ</span><strong></strong></div>
          <button class="bag-close" type="button" aria-label="もちものを閉じる">×</button>
        </header>
        <div class="bag-content">
          <div class="bag-inventory">
            <div class="bag-tabs" role="group" aria-label="もちものの種類">
              <button type="button" data-group="normal">ふつう</button>
              <button type="button" data-group="important">たいせつ</button>
            </div>
            <div class="bag-grid" aria-label="バッグの中"></div>
          </div>
          <aside class="bag-detail" aria-live="polite">
            <div class="bag-detail-icon"></div>
            <div class="bag-detail-copy"><div class="bag-detail-label">えらんだもの</div>
              <h2></h2><div class="bag-detail-quantity"></div><p></p>
            </div>
          </aside>
        </div>
        <footer class="bag-quick-panel">
          <div class="bag-quick-heading"><div><span>QUICK</span><strong>クイック枠</strong></div><button class="bag-clear" type="button">はずす</button></div>
          <div class="bag-quick-slots" role="group" aria-label="クイック枠に登録"></div>
          <div class="bag-quick-caption">もちものを えらんで、枠をタップ</div>
        </footer>
      </section>`;
    stage.append(this.overlay);
    this.panel = this.overlay.querySelector('.bag-window')!;
    this.overlay.querySelector<HTMLButtonElement>('.bag-close')!.addEventListener('click', () => this.close());
    this.overlay.querySelector<HTMLButtonElement>('.bag-clear')!.addEventListener('click', () => {
      this.model.clearSelectedSlot(); this.render();
    });
    for (const tab of this.overlay.querySelectorAll<HTMLButtonElement>('[data-group]')) {
      tab.addEventListener('click', () => { this.model.setGroup(tab.dataset.group as BagGroup); this.render(); });
    }
    this.model = new HotbarModel(this.readItems());
    this.fingerprint = this.assetFingerprint();
    this.render();
  }

  get isOpen(): boolean { return this.opened; }

  open(): void {
    if (this.opened) return;
    this.sync();
    this.opened = true;
    document.body.classList.add('bag-open');
    this.overlay.hidden = false;
    this.hud.hidden = true;
    this.render();
    this.panel.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    document.body.classList.remove('bag-open');
    this.overlay.hidden = true;
    this.onClose();
  }

  /** Call after the modal host update; quick slots are hidden during dialogs or other panels. */
  update(exploring: boolean): void {
    this.hudAvailable = exploring && !this.opened;
    this.hud.hidden = !this.hudAvailable;
    this.sync();
  }

  /** Map key handling is deliberately separate from modal handling. */
  handleHudKey(event: KeyboardEvent, exploring: boolean): void {
    if (!exploring || this.opened || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select')) return;
    const index = this.digitIndex(event.code);
    if (index < 0) return;
    event.preventDefault();
    this.model.selectSlot(index);
    this.renderHud();
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.opened) return;
    if (event.code === 'Escape' || event.code === 'KeyI') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.code === 'Tab') { this.cycleFocus(event); return; }
    if ((event.code === 'Enter' || event.code === 'Space') && event.target instanceof HTMLButtonElement) return;
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
      ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    };
    const direction = directions[event.code];
    if (direction) {
      event.preventDefault();
      this.model.moveSelection(...direction);
      this.render();
      return;
    }
    if (event.code === 'KeyQ' || event.code === 'KeyE') {
      event.preventDefault();
      this.model.setGroup(event.code === 'KeyQ' ? 'normal' : 'important');
      this.render();
      return;
    }
    const digit = this.digitIndex(event.code);
    if (digit >= 0) {
      event.preventDefault();
      if (!event.repeat) this.model.assignSelected(digit);
      this.render();
    } else if (event.code === 'Enter' || event.code === 'Space' || event.code === 'KeyZ') {
      event.preventDefault();
      if (!event.repeat) this.model.assignSelected(this.model.selectedSlot);
      this.render();
    }
  }

  private readItems(): BagItem[] {
    return this.game.assets.snapshot().items.flatMap(stack => {
      const def = getItemDefinition(stack.itemId);
      return def ? [{ id: def.id, name: def.name, description: def.description, quantity: stack.quantity,
        group: def.category === 'important' ? 'important' as const : 'normal' as const }] : [];
    });
  }

  private assetFingerprint(): string { return JSON.stringify(this.game.assets.snapshot()); }

  private sync(): void {
    const fingerprint = this.assetFingerprint();
    if (fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint;
    this.model.sync(this.readItems());
    this.render();
  }

  private render(): void {
    const selected = this.model.selectedItem;
    const money = this.overlay.querySelector<HTMLElement>('.bag-money strong')!;
    money.textContent = `¥ ${this.game.assets.moneyYen.toLocaleString('ja-JP')}`;
    for (const tab of this.overlay.querySelectorAll<HTMLButtonElement>('[data-group]')) {
      const active = tab.dataset.group === this.model.group;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    }
    const grid = this.overlay.querySelector<HTMLElement>('.bag-grid')!;
    grid.replaceChildren();
    const items = this.model.visibleItems;
    for (let i = 0; i < Math.max(16, items.length); i++) {
      const item = items[i];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bag-cell';
      button.dataset.itemId = item?.id ?? '';
      button.disabled = !item;
      if (item) {
        button.setAttribute('aria-label', `${item.name} ${item.quantity}こ`);
        button.setAttribute('aria-pressed', String(item.id === selected?.id));
        button.classList.toggle('is-selected', item.id === selected?.id);
        button.append(itemIcon(item.id), this.quantity(item.quantity));
        button.addEventListener('click', () => { this.model.selectItem(item.id); this.render(); this.panel.focus({ preventScroll: true }); });
      } else button.setAttribute('aria-label', '空き');
      grid.append(button);
    }
    const detailIcon = this.overlay.querySelector<HTMLElement>('.bag-detail-icon')!;
    detailIcon.replaceChildren(...(selected ? [itemIcon(selected.id)] : []));
    this.overlay.querySelector<HTMLElement>('.bag-detail h2')!.textContent = selected?.name ?? 'もちものなし';
    this.overlay.querySelector<HTMLElement>('.bag-detail-quantity')!.textContent = selected ? `${selected.quantity}こ` : '';
    this.overlay.querySelector<HTMLElement>('.bag-detail p')!.textContent = selected?.description ?? '';
    const slots = this.overlay.querySelector<HTMLElement>('.bag-quick-slots')!;
    slots.replaceChildren(...this.makeSlots(true));
    this.overlay.querySelector<HTMLButtonElement>('.bag-clear')!.disabled = !this.model.slots[this.model.selectedSlot];
    this.renderHud();
  }

  private renderHud(): void {
    const selected = this.model.slots[this.model.selectedSlot];
    const label = document.createElement('div');
    label.className = 'bag-hud-label';
    label.textContent = selected?.name ?? '―';
    const slots = document.createElement('div');
    slots.className = 'bag-hud-slots';
    slots.append(...this.makeSlots(false));
    this.hud.replaceChildren(label, slots);
  }

  private makeSlots(assign: boolean): HTMLButtonElement[] {
    return this.model.slots.map((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bag-quick-slot';
      button.dataset.slot = String(index);
      button.classList.toggle('is-active', index === this.model.selectedSlot);
      button.setAttribute('aria-label', `${index + 1}：${item ? `${item.name} ${item.quantity}こ` : '空き'}${assign ? ' に登録' : ' を選択'}`);
      button.setAttribute('aria-pressed', String(index === this.model.selectedSlot));
      const number = document.createElement('span');
      number.className = 'bag-slot-number';
      number.textContent = String(index + 1);
      button.append(number);
      if (item) button.append(itemIcon(item.id), this.quantity(item.quantity));
      button.addEventListener('click', () => {
        if (assign) this.model.assignSelected(index);
        else if (this.hudAvailable && !this.game.dialog) { this.model.selectSlot(index); this.onHudSelect(); }
        this.render();
        if (assign) this.panel.focus({ preventScroll: true });
      });
      return button;
    });
  }

  private quantity(count: number): HTMLElement {
    const quantity = document.createElement('span');
    quantity.className = 'bag-cell-count';
    quantity.textContent = String(count);
    return quantity;
  }

  private digitIndex(code: string): number {
    const match = /^Digit([1-9])$/.exec(code);
    const index = match ? Number(match[1]) - 1 : -1;
    return index >= 0 && index < QUICK_SLOT_COUNT ? index : -1;
  }

  private cycleFocus(event: KeyboardEvent): void {
    const buttons = [...this.panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!buttons.length) { event.preventDefault(); this.panel.focus(); return; }
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1 || (event.shiftKey && index === 0) || (!event.shiftKey && index === buttons.length - 1)) {
      event.preventDefault();
      buttons[event.shiftKey ? buttons.length - 1 : 0].focus();
    }
  }
}
