/** Provisional furniture entries for the editor contract. Artwork is loaded separately. */
import type { Facing } from '../../core/coords';

export type FurnitureCategory = 'seat' | 'table' | 'bed' | 'storage' | 'kitchen' | 'shop' | 'decor' | 'wall';
export type FurniturePlacement = 'floor' | 'rug' | 'wall';
export interface FurnitureVariant { facing: Facing; w: number; h: number; overhang: number }
export interface FurnitureDef {
  id: string;
  name: string;
  category: FurnitureCategory;
  placement: FurniturePlacement;
  solid: boolean;
  layer: 'sorted' | 'decal';
  /** Rotation order, starting with down. */
  variants: readonly FurnitureVariant[];
}

function variants(w: number, h: number, overhang: number, directions: readonly Facing[]): FurnitureVariant[] {
  return directions.map(facing => ({ facing,
    w: facing === 'left' || facing === 'right' ? h : w,
    h: facing === 'left' || facing === 'right' ? w : h, overhang }));
}
const four: readonly Facing[] = ['down', 'left', 'up', 'right'];
export const FURNITURE: readonly FurnitureDef[] = Object.freeze(([
  { id: 'chair-wood', name: '木のいす', category: 'seat', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(1, 1, 16, four) },
  { id: 'sofa-2seat', name: '二人がけソファ', category: 'seat', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(2, 1, 16, four) },
  { id: 'rug-large', name: 'ラグ', category: 'decor', placement: 'rug', solid: false, layer: 'decal',
    variants: variants(3, 2, 0, ['down', 'left']) },
] satisfies FurnitureDef[]).map(entry => Object.freeze({ ...entry,
  variants: Object.freeze(entry.variants.map(variant => Object.freeze(variant))),
})));
const byId = new Map(FURNITURE.map(entry => [entry.id, entry]));

export function furnitureById(id: string): FurnitureDef | undefined { return byId.get(id); }
export function furnitureVariant(id: string, facing: Facing = 'down'): FurnitureVariant | undefined {
  const entry = byId.get(id);
  return entry?.variants.find(variant => variant.facing === facing) ?? entry?.variants[0];
}
export function nextFacing(id: string, facing: Facing = 'down'): Facing {
  const entry = byId.get(id);
  if (!entry) return facing;
  const index = entry.variants.findIndex(variant => variant.facing === furnitureVariant(id, facing)!.facing);
  return entry.variants[(index + 1) % entry.variants.length].facing;
}
