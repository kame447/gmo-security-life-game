import { getItemDefinition } from '../../data/items';
import { INVENTORY_PROTOTYPE } from '../../data/inventory-config';
import type { Game } from '../../session/game';
import type { ItemStack } from '../../state/assets';
import type { SlotAddress } from '../../state/inventory';
import { itemIcon } from './icons';
import { HotbarModel } from './model';
import './style.css';

/** One inventory, rendered in the bag and in the exploration HUD. */
export class HotbarPanel {
  readonly button: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly model: HotbarModel;
  private fingerprint = '';
  private opened = false;
  private hudAvailable = false;
  private dragging = false;
  private pointerGesture?: { id: number; x: number; y: number; moved: boolean };
  private suppressPointerClick = false;

  constructor(private readonly game: Game, private readonly onClose: () => void,
    private readonly onHudSelect: () => void = () => {}, private readonly onChange: () => void = () => {}) {
    const menu = document.querySelector<HTMLElement>('#menu')!;
    const stage = document.querySelector<HTMLElement>('#stage')!;
    this.button = document.createElement('button'); this.button.id = 'btn-inventory';
    this.button.type = 'button'; this.button.className = 'panel'; this.button.textContent = 'もちもの';
    menu.querySelector('#btn-avatar')!.after(this.button);
    this.hud = document.createElement('div'); this.hud.className = 'bag-quick-hud';
    this.hud.setAttribute('role', 'toolbar'); this.hud.setAttribute('aria-label', 'ホットバー');
    this.hud.hidden = true; stage.append(this.hud);
    this.overlay = document.createElement('div'); this.overlay.className = 'bag-overlay'; this.overlay.hidden = true;
    this.overlay.innerHTML = `<section class="bag-window" role="dialog" aria-modal="true" aria-labelledby="bag-title" tabindex="-1">
      <header class="bag-header"><div class="bag-title-mark" aria-hidden="true"><span></span></div>
        <h1 id="bag-title">もちもの</h1><div class="bag-money"><span>所持金</span><strong></strong></div>
        <button class="bag-close" type="button" aria-label="もちものを閉じる">×</button></header>
      <div class="bag-content"><div class="bag-storage"><div class="bag-grid" role="group" aria-label="バッグの中"></div>
        <div class="bag-quick-slots" role="group" aria-label="ホットバー"></div></div>
        <aside class="bag-detail" aria-live="polite"><div class="bag-detail-icon"></div><div class="bag-detail-copy">
          <span class="bag-detail-category"></span><h2></h2><div class="bag-detail-quantity"></div><p></p></div></aside></div>
      <footer class="bag-footer"><button class="bag-cancel-move" type="button" hidden>移動をやめる</button></footer>
    </section>`;
    stage.append(this.overlay); this.panel = this.overlay.querySelector('.bag-window')!;
    this.panel.style.setProperty('--bag-columns', String(INVENTORY_PROTOTYPE.columns));
    this.panel.style.setProperty('--hotbar-slots', String(INVENTORY_PROTOTYPE.hotbarSlots));
    this.overlay.querySelector('.bag-close')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('.bag-cancel-move')!.addEventListener('click', () => { this.model.cancelMove(); this.render(true); });
    // Materialize the deterministic legacy layout before later acquisitions can shift it.
    game.assets.selectHotbar(game.assets.inventoryLayout.selectedHotbar);
    this.model = new HotbarModel(game.assets); this.bindGestures(); this.render();
  }
  get isOpen(): boolean { return this.opened; }
  open(): void {
    if (this.opened) return;
    this.opened = true; this.model.cancelMove(); document.body.classList.add('bag-open');
    this.overlay.hidden = false; this.hud.hidden = true; this.render(); this.panel.focus({ preventScroll: true });
  }
  close(): void {
    if (!this.opened) return;
    this.pointerGesture = undefined; this.dragging = false; this.suppressPointerClick = false;
    this.model.cancelMove(); this.opened = false; document.body.classList.remove('bag-open'); this.overlay.hidden = true;
    this.hudAvailable = !this.game.dialog; this.hud.hidden = !this.hudAvailable; this.onClose();
  }
  update(exploring: boolean): void {
    this.hudAvailable = exploring && !this.opened; this.hud.hidden = !this.hudAvailable;
    const fingerprint = JSON.stringify(this.game.assets.snapshot());
    if (fingerprint !== this.fingerprint && !this.dragging) this.render();
  }
  handleHudKey(event: KeyboardEvent, exploring: boolean): void {
    if (!exploring || this.opened || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof HTMLElement && event.target.closest('button,input,textarea,select')) return;
    const index = this.digitIndex(event.code); if (index < 0) return;
    event.preventDefault(); this.change(() => this.model.selectHotbar(index)); this.onHudSelect();
  }
  handleKey(event: KeyboardEvent): void {
    if (!this.opened) return;
    if (event.code === 'Escape' || event.code === 'KeyI') {
      event.preventDefault(); if (event.repeat) return;
      if (this.model.carrying && event.code === 'Escape') {
        this.dragging = false; this.pointerGesture = undefined; this.suppressPointerClick = true;
        this.model.cancelMove(); this.render(true);
      }
      else this.close();
      return;
    }
    if (event.code === 'Tab') { this.cycleFocus(event); return; }
    if ((event.code === 'Enter' || event.code === 'Space') && event.target instanceof HTMLButtonElement) return;
    const direction = ({ ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
      ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] } as Record<string, [number, number]>)[event.code];
    if (direction) {
      event.preventDefault(); this.change(() => {
        const target = event.target;
        if (target instanceof HTMLElement && (target.dataset.section === 'bag' || target.dataset.section === 'hotbar')) {
          this.model.focus({ section: target.dataset.section, index: Number(target.dataset.index) });
        }
        this.model.moveSelection(...direction);
      }, true); return;
    }
    const digit = this.digitIndex(event.code);
    if (digit >= 0) {
      event.preventDefault(); if (!event.repeat) this.change(() => this.model.focus({ section: 'hotbar', index: digit }), true);
    } else if (event.code === 'KeyZ') {
      event.preventDefault();
    } else if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault(); if (!event.repeat) this.change(() => {
        const target = event.target;
        const address = target instanceof HTMLElement && (target.dataset.section === 'bag' || target.dataset.section === 'hotbar')
          ? { section: target.dataset.section, index: Number(target.dataset.index) } as SlotAddress : this.model.selection;
        this.model.activate(address);
      }, true);
    }
  }
  private change(action: () => unknown, focus = false): void {
    const before = JSON.stringify(this.game.assets.snapshot()); action(); this.render(focus);
    if (before !== JSON.stringify(this.game.assets.snapshot())) this.onChange();
  }
  private render(focusSlot = false): void {
    const active = document.activeElement instanceof HTMLElement && !!document.activeElement.closest('.bag-storage');
    const view = this.model.view;
    this.overlay.querySelector('.bag-money strong')!.textContent = `¥ ${this.game.assets.moneyYen.toLocaleString('ja-JP')}`;
    this.overlay.querySelector('.bag-grid')!.replaceChildren(...view.bag.map((item, index) => this.slot(item, { section: 'bag', index }, false)));
    this.overlay.querySelector('.bag-quick-slots')!.replaceChildren(...view.hotbar.map((item, index) => this.slot(item, { section: 'hotbar', index }, false)));
    const selected = this.model.selectedStack; const def = selected && getItemDefinition(selected.itemId);
    this.overlay.querySelector('.bag-detail-icon')!.replaceChildren(...(selected ? [itemIcon(selected.itemId)] : []));
    this.overlay.querySelector('.bag-detail h2')!.textContent = def?.name ?? (this.game.assets.snapshot().items.length ? '空き' : 'もちものなし');
    this.overlay.querySelector('.bag-detail-category')!.textContent = def ? (def.category === 'important' ? '重要アイテム' : '通常アイテム') : '';
    this.overlay.querySelector('.bag-detail-quantity')!.textContent = selected ? `${selected.quantity}個` : '';
    this.overlay.querySelector('.bag-detail p')!.textContent = def?.description ?? '';
    const held = this.model.carrying;
    (this.overlay.querySelector('.bag-cancel-move')! as HTMLElement).hidden = !held;
    this.renderHud(); this.fingerprint = JSON.stringify(this.game.assets.snapshot());
    if (this.opened && (focusSlot || active)) {
      const { section, index } = this.model.selection;
      this.overlay.querySelector<HTMLButtonElement>(`[data-section="${section}"][data-index="${index}"]`)?.focus({ preventScroll: true });
    }
  }
  private renderHud(): void {
    const view = this.model.view; const current = view.hotbar[view.selectedHotbar];
    const label = document.createElement('div'); label.className = 'bag-hud-label';
    label.textContent = current ? getItemDefinition(current.itemId)!.name : '';
    label.hidden = !current;
    const slots = document.createElement('div'); slots.className = 'bag-hud-slots';
    slots.append(...view.hotbar.map((item, index) => this.slot(item, { section: 'hotbar', index }, true)));
    this.hud.replaceChildren(label, slots);
  }
  private slot(item: ItemStack | null, address: SlotAddress, hud: boolean): HTMLButtonElement {
    const def = item && getItemDefinition(item.itemId);
    const button = document.createElement('button'); button.type = 'button';
    button.className = address.section === 'hotbar' ? 'bag-quick-slot' : 'bag-cell';
    button.dataset.section = address.section; button.dataset.index = String(address.index); button.dataset.slot = String(address.index);
    button.dataset.itemId = item?.itemId ?? ''; button.dataset.quantity = String(item?.quantity ?? 0);
    const selected = this.model.selection; const held = this.model.carrying;
    const active = address.section === 'hotbar' && address.index === this.model.view.selectedHotbar;
    button.classList.toggle('is-active', active);
    button.classList.toggle('is-selected', !hud && address.section === selected.section && address.index === selected.index);
    button.classList.toggle('is-held', !hud && !!held && address.section === held.section && address.index === held.index);
    button.classList.toggle('is-empty', !item); button.classList.toggle('is-important', def?.category === 'important');
    button.setAttribute('aria-pressed', String(hud ? active : !!held && held.section === address.section && held.index === address.index));
    button.setAttribute('aria-label', `${address.section === 'hotbar' ? 'ホットバー' : 'バッグ'} ${address.index + 1}：${def ? `${def.name} ${item!.quantity}個` : '空き'}`);
    if (item) { const count = document.createElement('span'); count.className = 'bag-cell-count'; count.textContent = String(item.quantity); button.append(itemIcon(item.itemId), count); }
    button.addEventListener('click', () => {
      if (hud) { if (this.hudAvailable && !this.game.dialog) { this.change(() => this.model.selectHotbar(address.index)); this.onHudSelect(); } }
      else this.change(() => this.model.activate(address), true);
    });
    if (!hud) this.dragEvents(button, address, !!item);
    return button;
  }
  private dragEvents(button: HTMLButtonElement, address: SlotAddress, occupied: boolean): void {
    button.draggable = occupied;
    button.addEventListener('dragstart', event => {
      if (!event.dataTransfer || !this.model.startMove(address)) { event.preventDefault(); return; }
      this.dragging = true; this.suppressPointerClick = true;
      this.overlay.querySelectorAll('.is-held').forEach(element => element.classList.remove('is-held'));
      button.classList.add('is-held');
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', 'slg-inventory-stack');
    });
    button.addEventListener('dragover', event => { if (this.dragging) { event.preventDefault(); event.dataTransfer!.dropEffect = 'move'; } });
    button.addEventListener('drop', event => {
      if (!this.dragging) return; event.preventDefault(); event.stopPropagation(); this.dragging = false;
      this.suppressPointerClick = true;
      this.change(() => this.model.finishMove(address), true);
    });
    button.addEventListener('dragend', () => {
      this.dragging = false; this.pointerGesture = undefined; this.suppressPointerClick = true;
      this.model.cancelMove(); this.render();
    });
  }
  private bindGestures(): void {
    this.overlay.addEventListener('pointerdown', event => {
      // A genuine new press permits another click; a release following a drag does not.
      this.suppressPointerClick = false;
      this.pointerGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    });
    this.overlay.addEventListener('pointermove', event => {
      const gesture = this.pointerGesture;
      if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
        gesture.moved = true; this.suppressPointerClick = true;
      }
    });
    this.overlay.addEventListener('pointerup', event => {
      if (this.pointerGesture?.id !== event.pointerId) return;
      const moved = this.pointerGesture.moved; this.pointerGesture = undefined;
      if (moved && !this.dragging) { this.suppressPointerClick = true; this.model.cancelMove(); this.render(); }
    });
    this.overlay.addEventListener('pointercancel', event => {
      if (this.pointerGesture?.id !== event.pointerId) return;
      this.pointerGesture = undefined; this.suppressPointerClick = true;
      if (!this.dragging) {
        this.model.cancelMove();
        // Native dragstart may follow pointercancel. Keep its source node alive.
        requestAnimationFrame(() => { if (!this.dragging) this.render(); });
      }
    });
    this.overlay.addEventListener('click', event => {
      if (event.detail > 0 && this.suppressPointerClick) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    const cancelForScroll = () => {
      this.suppressPointerClick = true;
      if (!this.dragging) { this.model.cancelMove(); this.render(); }
    };
    this.overlay.querySelector('.bag-content')!.addEventListener('scroll', cancelForScroll);
    this.overlay.querySelector('.bag-content')!.addEventListener('wheel', cancelForScroll, { passive: true });
    // An outside/foreign drop cancels selection, rather than becoming a destination click.
    this.overlay.addEventListener('dragover', event => event.preventDefault());
    this.overlay.addEventListener('drop', event => {
      event.preventDefault(); this.dragging = false; this.suppressPointerClick = true;
      this.model.cancelMove(); this.render();
    });
  }
  private digitIndex(code: string): number {
    const match = /^Digit([1-9])$/.exec(code); const index = match ? Number(match[1]) - 1 : -1;
    return index >= 0 && index < this.model.view.hotbar.length ? index : -1;
  }
  private cycleFocus(event: KeyboardEvent): void {
    const buttons = [...this.panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([hidden])')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === buttons.length - 1)) {
      event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
    }
  }
}
