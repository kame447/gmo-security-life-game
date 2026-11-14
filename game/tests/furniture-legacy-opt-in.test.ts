import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObjectDef } from '../src/core/types';
import * as catalog from '../src/render/furniture/catalog';
import { furnitureSprite } from '../src/render/furniture/sprites';
import { buildWorld } from '../src/world';

afterEach(() => vi.restoreAllMocks());

describe('explicit opt-in protects unmigrated world artwork', () => {
  it('never consults even a fully populated catalog for any current World object', () => {
    // Model future registration of every kind, including toybox and fridge.
    const lookup = vi.spyOn(catalog, 'furnitureVariant').mockReturnValue({ facing: 'down', w: 1, h: 1, overhang: 16 });
    const world = buildWorld();
    const objects = [...world.areas.values()].flatMap(area => area.objects);
    const before = objects.map(object => ({ ...object }));
    expect(objects.find(object => object.id === 'home-family-interior-toybox-1-5')).toBeDefined();
    expect(objects.find(object => object.id === 'home-family-interior-fridge-14-1')).toBeDefined();
    for (const object of objects) {
      expect(object.catalogId).toBeUndefined();
      expect(furnitureSprite(object)).toBeUndefined();
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(objects).toEqual(before);
  });

  it('leaves store/station props and even catalog-named kinds on the legacy path without a marker', () => {
    const lookup = vi.spyOn(catalog, 'furnitureVariant').mockReturnValue({ facing: 'down', w: 1, h: 1, overhang: 16 });
    for (const kind of ['toybox', 'fridge', 'bookshelf', 'counter', 'bench', 'sofa-2seat', 'chair-wood']) {
      const object: ObjectDef = { id: `legacy-${kind}`, kind, facing: 'down', x: 1, y: 2, w: 1, h: 1, solid: true };
      expect(furnitureSprite(object)).toBeUndefined();
    }
    expect(lookup).not.toHaveBeenCalled();
  });
});
