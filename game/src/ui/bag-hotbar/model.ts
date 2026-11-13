/** View state for the review-only grid + quick bar. The inventory stays the source of truth. */
export type BagGroup = 'normal' | 'important';

export interface BagItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  group: BagGroup;
}

export const QUICK_SLOT_COUNT = 5;
export const BAG_COLUMNS = 4;

export class HotbarModel {
  private items: readonly BagItem[] = [];
  private slotIds: (string | null)[] = Array(QUICK_SLOT_COUNT).fill(null);
  private selectedId: string | null = null;
  private currentGroup: BagGroup = 'normal';
  private currentSlot = 0;

  constructor(items: readonly BagItem[]) {
    this.sync(items);
    // Initial assignments make the candidate comparable with a populated review save.
    this.slotIds = Array.from({ length: QUICK_SLOT_COUNT }, (_, i) => this.items[i]?.id ?? null);
  }

  get group(): BagGroup { return this.currentGroup; }
  get selectedSlot(): number { return this.currentSlot; }
  get visibleItems(): readonly BagItem[] { return this.items.filter(item => item.group === this.currentGroup); }
  get selectedItem(): BagItem | undefined { return this.visibleItems.find(item => item.id === this.selectedId); }
  get slots(): readonly (BagItem | null)[] {
    return this.slotIds.map(id => this.items.find(item => item.id === id) ?? null);
  }

  /** Remove stale quick references without touching or consuming inventory items. */
  sync(items: readonly BagItem[]): void {
    this.items = items.filter(item => item.quantity > 0).map(item => ({ ...item }));
    const ids = new Set(this.items.map(item => item.id));
    this.slotIds = this.slotIds.map(id => id && ids.has(id) ? id : null);
    this.ensureSelection();
  }

  setGroup(group: BagGroup): void {
    this.currentGroup = group;
    this.ensureSelection();
  }

  selectItem(id: string): boolean {
    if (!this.visibleItems.some(item => item.id === id)) return false;
    this.selectedId = id;
    return true;
  }

  moveSelection(dx: number, dy: number): void {
    const items = this.visibleItems;
    if (!items.length) return;
    const index = Math.max(0, items.findIndex(item => item.id === this.selectedId));
    const x = Math.max(0, Math.min(BAG_COLUMNS - 1, index % BAG_COLUMNS + dx));
    const y = Math.max(0, Math.floor(index / BAG_COLUMNS) + dy);
    this.selectedId = items[Math.min(items.length - 1, y * BAG_COLUMNS + x)].id;
  }

  selectSlot(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= QUICK_SLOT_COUNT) return false;
    this.currentSlot = index;
    return true;
  }

  /** Assign a reference to the selected item; an item is shown in at most one slot. */
  assignSelected(index: number): boolean {
    const item = this.selectedItem;
    if (!item || !this.selectSlot(index)) return false;
    this.slotIds = this.slotIds.map(id => id === item.id ? null : id);
    this.slotIds[index] = item.id;
    return true;
  }

  clearSelectedSlot(): void { this.slotIds[this.currentSlot] = null; }

  private ensureSelection(): void {
    if (!this.visibleItems.some(item => item.id === this.selectedId)) {
      this.selectedId = this.visibleItems[0]?.id ?? null;
    }
  }
}
