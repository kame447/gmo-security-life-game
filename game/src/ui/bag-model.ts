import { getItemDefinition, type ItemDefinition } from '../data/items';
import type { AssetSnapshot } from '../state/assets';

export type BagCategory = 'all' | 'stationery' | 'drink' | 'other';
export type BagIcon = 'bag' | 'notebook' | 'pencil' | 'water' | 'coin' | 'pouch' | 'snack';
/** Visual proposal only: labels, grouping, and icons can be revised after UI review. */
export const BAG_CATEGORIES: readonly { id: BagCategory; label: string; icon: BagIcon }[] = [
  { id: 'all', label: 'ぜんぶ', icon: 'bag' },
  { id: 'stationery', label: 'ぶんぼうぐ', icon: 'pencil' },
  { id: 'drink', label: 'のみもの', icon: 'water' },
  { id: 'other', label: 'そのほか', icon: 'pouch' },
];
export interface BagEntry { item: ItemDefinition; quantity: number }
export function bagCategory(item: ItemDefinition): BagCategory {
  return item.category === 'stationery' || item.category === 'drink' ? item.category : 'other';
}
export function bagIcon(item: ItemDefinition): BagIcon {
  if (item.id === 'notebook' || item.id === 'pencil') return item.id;
  if (item.category === 'drink') return 'water';
  if (item.category === 'snack') return 'snack';
  return 'pouch';
}

/** Selection/filtering only. This view never changes the player's assets. */
export class BagModel {
  private all: BagEntry[] = [];
  category: BagCategory = 'all';
  selectedId: string | null = null;

  setAssets(snapshot: AssetSnapshot): void {
    this.all = snapshot.items.flatMap(stack => {
      const item = getItemDefinition(stack.itemId);
      return item ? [{ item, quantity: stack.quantity }] : [];
    });
    this.repairSelection();
  }
  entries(category: BagCategory = this.category): BagEntry[] {
    return this.all.filter(entry => category === 'all' || bagCategory(entry.item) === category);
  }
  get selected(): BagEntry | undefined { return this.entries().find(entry => entry.item.id === this.selectedId); }
  selectCategory(category: BagCategory): void { this.category = category; this.repairSelection(); }
  select(itemId: string): void {
    if (this.entries().some(entry => entry.item.id === itemId)) this.selectedId = itemId;
  }
  move(step: number): void {
    const entries = this.entries();
    if (!entries.length) return;
    const index = entries.findIndex(entry => entry.item.id === this.selectedId);
    this.selectedId = entries[Math.max(0, Math.min(entries.length - 1, index + step))].item.id;
  }
  private repairSelection(): void {
    if (!this.selected) this.selectedId = this.entries()[0]?.item.id ?? null;
  }
}
