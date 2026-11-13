import type { PlayerAppearance } from '../core/appearance';

/** Only clothing fields; never a whole appearance or an ability/stat modifier. */
export type ClothingAppearance = Readonly<Pick<PlayerAppearance, 'outfit' | 'outfitColor'>>;
export interface ClothingDefinition {
  readonly itemId: string;
  readonly appearance: ClothingAppearance;
}

/** Provisional item-to-appearance mapping. Acquisition and UI remain undecided. */
export const CLOTHING_DEFINITIONS: readonly ClothingDefinition[] = Object.freeze([
  Object.freeze({ itemId: 'shirt', appearance: Object.freeze({ outfit: 'shirt', outfitColor: 'blue' }) }),
]);

export function getClothingDefinition(itemId: string): ClothingDefinition | undefined {
  return CLOTHING_DEFINITIONS.find(clothing => clothing.itemId === itemId);
}
