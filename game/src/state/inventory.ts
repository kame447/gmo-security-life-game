import { INVENTORY_PROTOTYPE } from '../data/inventory-config';
import type { ItemStack } from './assets';

export type InventorySection = 'bag' | 'hotbar';
export interface SlotAddress { section: InventorySection; index: number }
/** Each owned stack occurs exactly once across both parts. Quantities live in assets.items only. */
export interface InventoryLayoutSave {
  v: 1;
  bag: (string | null)[];
  hotbar: (string | null)[];
  selectedHotbar: number;
}
export interface InventorySnapshot {
  bag: (ItemStack | null)[];
  hotbar: (ItemStack | null)[];
  selectedHotbar: number;
}
export type InventoryResult = { ok: true } | { ok: false; reason: 'invalid-slot' | 'empty-slot' };

const columns = INVENTORY_PROTOTYPE.columns;
const minimum = columns * INVENTORY_PROTOTYPE.bagRows;
// Input repair bound, not a gameplay item limit. New acquisitions grow bag rows.
const MAX_SAVED_BAG_SLOTS = 1000;

export function normalizeInventoryLayout(raw: unknown, items: readonly ItemStack[]): InventoryLayoutSave {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Partial<InventoryLayoutSave> : undefined;
  const valid = source?.v === 1 && Array.isArray(source.bag) && Array.isArray(source.hotbar);
  const rawBag = valid ? source.bag! : [];
  const rawHotbar = valid ? source.hotbar! : [];
  const bagSize = Math.max(minimum, Math.ceil(Math.min(rawBag.length, MAX_SAVED_BAG_SLOTS) / columns) * columns);
  const owned = new Set(items.map(item => item.itemId));
  const placed = new Set<string>();
  function accept(id: unknown): string | null {
    if (typeof id !== 'string' || !owned.has(id) || placed.has(id)) return null;
    placed.add(id); return id;
  }
  // Keep quick access on malformed duplicate saves; valid saves retain every position.
  const hotbar = Array.from({ length: INVENTORY_PROTOTYPE.hotbarSlots }, (_, i) => accept(rawHotbar[i]));
  const bag = Array.from({ length: bagSize }, (_, i) => accept(rawBag[i]));
  for (const item of items) {
    if (placed.has(item.itemId)) continue;
    let index = bag.indexOf(null);
    if (index < 0) { index = bag.length; bag.push(...Array<string | null>(columns).fill(null)); }
    bag[index] = item.itemId; placed.add(item.itemId);
  }
  const selection = valid ? source.selectedHotbar : undefined;
  return { v: 1, bag, hotbar, selectedHotbar: typeof selection === 'number' && Number.isInteger(selection) &&
    selection >= 0 && selection < hotbar.length ? selection : 0 };
}

export function validSlot(layout: InventoryLayoutSave, address: SlotAddress): boolean {
  return !!address && (address.section === 'bag' || address.section === 'hotbar') && Number.isInteger(address.index) &&
    address.index >= 0 && address.index < layout[address.section].length;
}

export function moveInventoryStack(layout: InventoryLayoutSave, from: SlotAddress, to: SlotAddress):
  { ok: true; layout: InventoryLayoutSave } | Exclude<InventoryResult, { ok: true }> {
  if (!validSlot(layout, from) || !validSlot(layout, to)) return { ok: false, reason: 'invalid-slot' };
  if (!layout[from.section][from.index]) return { ok: false, reason: 'empty-slot' };
  const next = { ...layout, bag: [...layout.bag], hotbar: [...layout.hotbar] };
  const itemId = next[from.section][from.index];
  next[from.section][from.index] = next[to.section][to.index];
  next[to.section][to.index] = itemId;
  return { ok: true, layout: next };
}

export function inventorySnapshot(layout: InventoryLayoutSave, items: readonly ItemStack[]): InventorySnapshot {
  const quantities = new Map(items.map(item => [item.itemId, item.quantity]));
  const stack = (id: string | null): ItemStack | null => id === null ? null : { itemId: id, quantity: quantities.get(id)! };
  return { bag: layout.bag.map(stack), hotbar: layout.hotbar.map(stack), selectedHotbar: layout.selectedHotbar };
}
