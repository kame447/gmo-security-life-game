/** Read-only inventory; asset changes belong to state/assets.ts. */
import { getItemDefinition } from '../data/items';
import type { Game } from '../session/game';
import { $ } from './dom';

export class InventoryPanel {
  private readonly panel = $<HTMLElement>('#inventory-panel');
  private readonly closeButton = $<HTMLButtonElement>('#inventory-close');

  constructor(private readonly game: Game, private readonly onClose: () => void) {
    this.closeButton.addEventListener('click', () => this.close());
  }

  get isOpen(): boolean { return !this.panel.hidden; }

  open(): void {
    if (this.isOpen) return;
    const assets = this.game.assets.snapshot();
    $('#inventory-money').textContent = `${assets.moneyYen.toLocaleString('ja-JP')} 円`;
    const list = $('#inventory-items');
    list.replaceChildren();
    $('#inventory-empty').hidden = assets.items.length > 0;
    for (const { itemId, quantity } of assets.items) {
      const item = getItemDefinition(itemId)!;
      const row = document.createElement('li');
      row.dataset.itemId = itemId;
      const name = document.createElement('strong');
      name.textContent = `${item.name} × ${quantity}`;
      const description = document.createElement('p');
      description.textContent = item.description;
      row.append(name, description);
      list.append(row);
    }
    this.panel.hidden = false;
    $('#stage').classList.add('inventory-open');
    this.panel.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.panel.hidden = true;
    $('#stage').classList.remove('inventory-open');
    this.onClose();
  }

  handleKey(event: KeyboardEvent): void {
    if (event.code === 'Escape' || event.code === 'KeyI') {
      event.preventDefault();
      if (!event.repeat) this.close();
    } else if (event.code === 'Tab') {
      event.preventDefault();
      this.closeButton.focus();
    }
    // Other keys may scroll this panel or activate its close button; none reach gameplay.
  }
}
