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
  { id: 'table-dining', name: '食卓', category: 'table', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(2, 2, 0, ['down']) },
  { id: 'table-low', name: 'ローテーブル', category: 'table', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(2, 1, 0, ['down', 'left']) },
  { id: 'desk-study', name: '学習づくえ', category: 'table', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(2, 1, 16, four) },
  { id: 'bed-single', name: 'ベッド', category: 'bed', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(2, 3, 0, four) },
  { id: 'bookshelf-tall', name: '本だな', category: 'storage', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(1, 1, 16, four) },
  { id: 'toybox', name: 'おもちゃ箱', category: 'storage', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(1, 1, 0, ['down']) },
  { id: 'kitchen-sink', name: '流し台', category: 'kitchen', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(2, 1, 16, four) },
  { id: 'kitchen-stove', name: 'コンロ台', category: 'kitchen', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(1, 1, 16, four) },
  { id: 'cabinet-low', name: 'ローボード', category: 'storage', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(2, 1, 0, four) },
  { id: 'fridge', name: '冷蔵庫', category: 'kitchen', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(1, 1, 16, four) },
  { id: 'tv-stand', name: 'テレビ', category: 'kitchen', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(2, 1, 16, four) },
  { id: 'plant-tall', name: '観葉植物', category: 'decor', placement: 'floor', solid: true, layer: 'sorted',
    variants: variants(1, 1, 16, ['down']) },
  { id: 'window-wall', name: '窓', category: 'wall', placement: 'wall', solid: false, layer: 'decal',
    variants: variants(2, 1, 0, ['down']) },
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
