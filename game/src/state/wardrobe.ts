import type { PlayerAppearance } from '../core/appearance';
import { getClothingDefinition, type ClothingAppearance } from '../data/clothing';
import type { AssetSnapshot } from './assets';

export type WardrobeResult = {
  ok: true;
  appearance: PlayerAppearance;
  /** Clothing-only undo data, independent of later hair/body changes or ownership. */
  previous: ClothingAppearance;
} | { ok: false; reason: 'not-clothing' | 'not-owned' };

/** Pass a current assets.snapshot(); no item is consumed and no wallet is changed. */
export function canWearClothing(itemId: string, assets: Readonly<AssetSnapshot>): boolean {
  return !!getClothingDefinition(itemId) && assets.items.some(stack =>
    stack.itemId === itemId && Number.isSafeInteger(stack.quantity) && stack.quantity > 0);
}

/** The input appearance is already normalized by the existing Game/save boundary. */
export function wearClothing(appearance: Readonly<PlayerAppearance>, itemId: string,
  assets: Readonly<AssetSnapshot>): WardrobeResult {
  const clothing = getClothingDefinition(itemId);
  if (!clothing) return { ok: false, reason: 'not-clothing' };
  if (!canWearClothing(itemId, assets)) return { ok: false, reason: 'not-owned' };
  return { ok: true,
    appearance: { ...appearance, outfit: clothing.appearance.outfit, outfitColor: clothing.appearance.outfitColor },
    previous: { outfit: appearance.outfit, outfitColor: appearance.outfitColor },
  };
}

/** Restore only the clothing patch, including an unowned outfit from an old save. */
export function restoreClothing(appearance: Readonly<PlayerAppearance>, previous: ClothingAppearance): PlayerAppearance {
  return { ...appearance, outfit: previous.outfit, outfitColor: previous.outfitColor };
}
