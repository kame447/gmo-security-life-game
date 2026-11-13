import { INVENTORY_PROTOTYPE } from '../../data/inventory-config';
import type { PlayerAssets } from '../../state/assets';
import { validSlot, type InventoryResult, type SlotAddress } from '../../state/inventory';
const same = (a: SlotAddress, b: SlotAddress): boolean => a.section === b.section && a.index === b.index;

/** Only cursor/carry state lives here. Ownership, placement and selection live in assets. */
export class HotbarModel {
  private cursor: SlotAddress = { section: 'bag', index: 0 };
  private held: SlotAddress | null = null;
  private heldItemId: string | null = null;
  constructor(private readonly assets: PlayerAssets) {}
  get selection(): SlotAddress { return { ...this.cursor }; }
  get carrying(): SlotAddress | null { return this.held && { ...this.held }; }
  get view() { return this.assets.inventory(); }
  get selectedStack() { return this.view[this.cursor.section][this.cursor.index] ?? null; }
  focus(address: SlotAddress): boolean {
    if (!validSlot(this.assets.inventoryLayout, address)) return false;
    this.cursor = { ...address };
    if (address.section === 'hotbar') this.assets.selectHotbar(address.index);
    return true;
  }
  selectHotbar(index: number): boolean { return this.focus({ section: 'hotbar', index }); }
  startMove(address: SlotAddress): boolean {
    if (!validSlot(this.assets.inventoryLayout, address) || !this.view[address.section][address.index]) return false;
    this.focus(address); this.held = { ...address }; this.heldItemId = this.view[address.section][address.index]!.itemId; return true;
  }
  cancelMove(): void { this.held = null; this.heldItemId = null; }
  finishMove(to: SlotAddress): InventoryResult {
    const from = this.held; const expected = this.heldItemId; this.cancelMove();
    if (!from || this.view[from.section][from.index]?.itemId !== expected) return { ok: false, reason: 'empty-slot' };
    const result = this.assets.moveStack(from, to);
    if (result.ok) this.focus(to);
    return result;
  }
  activate(address: SlotAddress): void {
    if (this.held) {
      if (same(this.held, address)) { this.cancelMove(); this.focus(address); }
      else this.finishMove(address);
    } else { this.focus(address); this.startMove(address); }
  }
  moveSelection(dx: number, dy: number): void {
    const bagLength = this.view.bag.length;
    const index = this.cursor.index + (this.cursor.section === 'hotbar' ? bagLength : 0);
    const columns = INVENTORY_PROTOTYPE.columns;
    const x = Math.max(0, Math.min(columns - 1, index % columns + dx));
    const y = Math.max(0, Math.min(Math.floor((bagLength + this.view.hotbar.length - 1) / columns), Math.floor(index / columns) + dy));
    const next = y * columns + x;
    this.focus(next >= bagLength ? { section: 'hotbar', index: next - bagLength } : { section: 'bag', index: next });
  }
}
