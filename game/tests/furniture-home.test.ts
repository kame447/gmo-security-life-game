import { describe, expect, it } from 'vitest';
import { FURNITURE, furnitureById, nextFacing } from '../src/render/furniture/catalog';

const home = [
  ['table-dining', 2, 2, 0, 4, 'table'],
  ['table-low', 2, 1, 0, 4, 'table'],
  ['desk-study', 2, 1, 16, 4, 'table'],
  ['bed-single', 2, 3, 0, 4, 'bed'],
  ['bookshelf-tall', 1, 1, 16, 4, 'storage'],
  ['toybox', 1, 1, 0, 4, 'storage'],
  ['kitchen-sink', 2, 1, 16, 4, 'kitchen'],
  ['kitchen-stove', 1, 1, 16, 4, 'kitchen'],
  ['cabinet-low', 2, 1, 0, 4, 'storage'],
  ['fridge', 1, 1, 16, 4, 'kitchen'],
  ['tv-stand', 2, 1, 16, 4, 'kitchen'],
  ['plant-tall', 1, 1, 16, 4, 'decor'],
  ['window-wall', 2, 1, 0, 1, 'wall'],
] as const;

describe('home furniture dimensions and placement contract', () => {
  it.each(home)('%s has the agreed footprint, overhang and rotation cycle', (id, w, h, overhang, count, category) => {
    const entry = furnitureById(id)!;
    expect(entry, id).toBeDefined();
    expect(entry).toMatchObject({ category, placement: id === 'window-wall' ? 'wall' : 'floor',
      solid: id !== 'window-wall', layer: id === 'window-wall' ? 'decal' : 'sorted' });
    expect(entry.variants).toHaveLength(count);
    expect(entry.variants[0]).toEqual({ facing: 'down', w, h, overhang });
    for (const variant of entry.variants) {
      const side = variant.facing === 'left' || variant.facing === 'right';
      expect(variant.w).toBe(side ? h : w); expect(variant.h).toBe(side ? w : h);
      expect(variant.overhang).toBe(overhang);
    }
    let facing = entry.variants[0].facing;
    for (let i = 0; i < count; i++) {
      expect(facing).toBe(entry.variants[i].facing); facing = nextFacing(id, facing);
    }
    expect(facing).toBe('down');
  });

  it('provides the thirteen required home entries alongside the original prototypes', () => {
    expect(home).toHaveLength(13);
    const required = ['chair-wood', 'sofa-2seat', 'rug-large', ...home.map(row => row[0])];
    expect(FURNITURE.map(entry => entry.id)).toEqual(expect.arrayContaining(required));
  });
});
