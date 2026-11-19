import { describe, expect, it } from 'vitest';
import { FURNITURE, furnitureById, furnitureVariant, nextFacing } from '../src/render/furniture/catalog';

describe('provisional furniture catalog (DOM independent)', () => {
  it('contains immutable, unique entries with explicit placement and footprint', () => {
    expect(typeof document).toBe('undefined');
    expect(FURNITURE.map(entry => entry.id)).toEqual(expect.arrayContaining(['chair-wood', 'sofa-2seat', 'rug-large']));
    expect(new Set(FURNITURE.map(entry => entry.id)).size).toBe(FURNITURE.length);
    expect(Object.isFrozen(FURNITURE)).toBe(true);
    for (const entry of FURNITURE) {
      expect(entry.id).toMatch(/^[a-z]+(?:-[a-z0-9]+)*$/);
      expect(furnitureById(entry.id)).toBe(entry);
      expect(Object.isFrozen(entry)).toBe(true);
      expect(entry.variants[0].facing).toBe('down');
      expect(new Set(entry.variants.map(variant => variant.facing)).size).toBe(entry.variants.length);
      for (const variant of entry.variants) {
        expect(Object.isFrozen(variant)).toBe(true);
        expect(Number.isInteger(variant.w) && variant.w > 0).toBe(true);
        expect(Number.isInteger(variant.h) && variant.h > 0).toBe(true);
        expect([0, 16]).toContain(variant.overhang);
      }
    }
    expect(furnitureById('rug-large')).toMatchObject({ placement: 'rug', solid: false, layer: 'decal' });
  });

  it('rotates in the agreed order and swaps the footprint for sideways variants', () => {
    let facing = furnitureVariant('sofa-2seat')!.facing;
    const cycle = [];
    for (let i = 0; i < 5; i++) { cycle.push(facing); facing = nextFacing('sofa-2seat', facing); }
    expect(cycle).toEqual(['down', 'left', 'up', 'right', 'down']);
    expect(furnitureVariant('sofa-2seat', 'down')).toMatchObject({ w: 2, h: 1, overhang: 16 });
    expect(furnitureVariant('sofa-2seat', 'left')).toMatchObject({ w: 1, h: 2, overhang: 16 });
    expect(nextFacing('rug-large')).toBe('left');
    expect(nextFacing('rug-large', 'left')).toBe('down');
  });

  it('defaults unsupported catalog directions and leaves non-catalog kinds to the legacy renderer', () => {
    expect(furnitureVariant('chair-wood')?.facing).toBe('down');
    expect(furnitureVariant('rug-large', 'up')?.facing).toBe('down');
    expect(furnitureById('sofa')).toBeUndefined();
    expect(furnitureVariant('sofa')).toBeUndefined();
    expect(nextFacing('sofa', 'up')).toBe('up');
  });
});
