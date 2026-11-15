/** Money and inventory rules, independent of maps, UI, and storage. */
import { getItemDefinition, ITEM_DEFINITIONS } from '../data/items';
import { PROTOTYPE_STARTING_MONEY_YEN } from '../data/player-defaults';
import { inventorySnapshot, moveInventoryStack, normalizeInventoryLayout,
  type InventoryLayoutSave, type InventoryResult, type InventorySnapshot, type SlotAddress } from './inventory';

export interface ItemStack { itemId: string; quantity: number }
export interface AssetSnapshot { moneyYen: number; items: ItemStack[]; layout?: InventoryLayoutSave }
export interface AssetChange {
  moneyDeltaYen?: number;
  itemDeltas?: readonly { itemId: string; quantityDelta: number }[];
}
export type AssetFailure = 'invalid-amount' | 'insufficient-funds' | 'money-limit' |
  'unknown-item' | 'insufficient-items' | 'quantity-limit';
export type AssetResult = { ok: true } | { ok: false; reason: AssetFailure };

const fail = (reason: AssetFailure): AssetResult => ({ ok: false, reason });
const isPositiveInteger = (n: number): boolean => Number.isSafeInteger(n) && n > 0;

function stacksFrom(quantities: ReadonlyMap<string, number>): ItemStack[] {
  return ITEM_DEFINITIONS.flatMap(item => {
    const quantity = quantities.get(item.id) ?? 0;
    return quantity > 0 ? [{ itemId: item.id, quantity }] : [];
  });
}

/** Missing legacy assets get defaults; damaged fields are repaired independently. */
export function normalizeAssets(raw: unknown): AssetSnapshot {
  if (raw === undefined) return { moneyYen: PROTOTYPE_STARTING_MONEY_YEN, items: [] };
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  const moneyYen = typeof source.moneyYen === 'number' && Number.isSafeInteger(source.moneyYen) && source.moneyYen >= 0
    ? source.moneyYen : 0;
  const quantities = new Map<string, number>();
  if (Array.isArray(source.items)) for (const value of source.items) {
    if (!value || typeof value !== 'object') continue;
    const { itemId, quantity } = value as Partial<ItemStack>;
    const item = typeof itemId === 'string' ? getItemDefinition(itemId) : undefined;
    if (!item || typeof quantity !== 'number' || !isPositiveInteger(quantity)) continue;
    const previous = quantities.get(item.id) ?? 0;
    // Clamp while adding, so even duplicate large saved counts never overflow.
    quantities.set(item.id, previous + Math.min(quantity, item.maxQuantity - previous));
  }
  const items = stacksFrom(quantities);
  return { moneyYen, items, ...(source.layout === undefined ? {} : { layout: normalizeInventoryLayout(source.layout, items) }) };
}

export class PlayerAssets {
  private state: AssetSnapshot;

  constructor(saved?: unknown) { this.state = normalizeAssets(saved); }

  get moneyYen(): number { return this.state.moneyYen; }
  quantity(itemId: string): number { return this.state.items.find(item => item.itemId === itemId)?.quantity ?? 0; }
  /** Callers may edit the returned snapshot without changing the live state. */
  snapshot(): AssetSnapshot {
    return { moneyYen: this.moneyYen, items: this.state.items.map(item => ({ ...item })),
      ...(this.state.layout ? { layout: this.inventoryLayout } : {}) };
  }

  get inventoryLayout(): InventoryLayoutSave { return normalizeInventoryLayout(this.state.layout, this.state.items); }
  inventory(): InventorySnapshot { return inventorySnapshot(this.inventoryLayout, this.state.items); }
  moveStack(from: SlotAddress, to: SlotAddress): InventoryResult {
    const moved = moveInventoryStack(this.inventoryLayout, from, to);
    if (!moved.ok) return moved;
    this.state = { ...this.state, layout: moved.layout };
    return { ok: true };
  }
  selectHotbar(index: number): boolean {
    const layout = this.inventoryLayout;
    if (!Number.isInteger(index) || index < 0 || index >= layout.hotbar.length) return false;
    layout.selectedHotbar = index;
    this.state = { ...this.state, layout };
    return true;
  }

  changeMoney(deltaYen: number): AssetResult { return this.apply({ moneyDeltaYen: deltaYen }); }
  addItem(itemId: string, quantity: number): AssetResult {
    if (!isPositiveInteger(quantity)) return fail('invalid-amount');
    return this.apply({ itemDeltas: [{ itemId, quantityDelta: quantity }] });
  }
  removeItem(itemId: string, quantity: number): AssetResult {
    if (!isPositiveInteger(quantity)) return fail('invalid-amount');
    return this.apply({ itemDeltas: [{ itemId, quantityDelta: -quantity }] });
  }

  /** Atomic update for purchases/events: any failed check leaves all assets unchanged. */
  apply(change: AssetChange): AssetResult {
    const delta = change.moneyDeltaYen ?? 0;
    if (!Number.isSafeInteger(delta)) return fail('invalid-amount');
    const moneyYen = this.moneyYen + delta;
    if (moneyYen < 0) return fail('insufficient-funds');
    if (!Number.isSafeInteger(moneyYen)) return fail('money-limit');

    const deltas = new Map<string, number>();
    for (const { itemId, quantityDelta } of change.itemDeltas ?? []) {
      if (!getItemDefinition(itemId)) return fail('unknown-item');
      if (!Number.isSafeInteger(quantityDelta) || quantityDelta === 0) return fail('invalid-amount');
      const sum = (deltas.get(itemId) ?? 0) + quantityDelta;
      if (!Number.isSafeInteger(sum)) return fail('invalid-amount');
      deltas.set(itemId, sum);
    }
    const quantities = new Map(this.state.items.map(item => [item.itemId, item.quantity]));
    for (const [itemId, quantityDelta] of deltas) {
      const next = (quantities.get(itemId) ?? 0) + quantityDelta;
      if (next < 0) return fail('insufficient-items');
      if (!Number.isSafeInteger(next) || next > getItemDefinition(itemId)!.maxQuantity) return fail('quantity-limit');
      quantities.set(itemId, next);
    }
    const items = stacksFrom(quantities);
    this.state = { moneyYen, items, ...(this.state.layout ? { layout: normalizeInventoryLayout(this.state.layout, items) } : {}) };
    return { ok: true };
  }
}
