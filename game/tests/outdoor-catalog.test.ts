import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObjectDef } from '../src/core/types';
import { OUTDOOR, OUTDOOR_READ_ONLY, outdoorById, outdoorForObject, outdoorReadOnlyReason } from '../src/render/outdoor/catalog';
import { outdoorThumbnail } from '../src/render/outdoor/thumbnails';
import * as sprites from '../src/render/sprites';
import { buildWorld } from '../src/world';

afterEach(() => vi.restoreAllMocks());

describe('outdoor catalog (DOM independent)', () => {
  it('has unique immutable IDs and exact kind/style pairs with provisional Japanese names', () => {
    expect(typeof document).toBe('undefined');
    expect(OUTDOOR).toHaveLength(37);
    expect(new Set(OUTDOOR.map(entry => entry.id)).size).toBe(OUTDOOR.length);
    expect(new Set(OUTDOOR.map(entry => JSON.stringify([entry.kind, entry.style]))).size).toBe(OUTDOOR.length);
    expect(Object.isFrozen(OUTDOOR)).toBe(true);
    for (const entry of OUTDOOR) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(entry.id).toMatch(/^[a-z]+(?:-[a-z0-9]+)*$/);
      expect(entry.name).toMatch(/[ぁ-んァ-ン一-龯]/);
      expect(outdoorById(entry.id)).toBe(entry); expect(outdoorForObject(entry)).toBe(entry);
      expect(Number.isInteger(entry.w) && entry.w > 0 && Number.isInteger(entry.h) && entry.h > 0).toBe(true);
      expect(entry.layer).toBe(entry.solid ? 'sorted' : 'decal');
    }
  });

  it('covers every actual town object or explicitly identifies its immovable kind', () => {
    const town = buildWorld().areas.get('town-main')!;
    const before = structuredClone(town.objects);
    expect(town.objects).toHaveLength(270);
    let cataloged = 0, fixed = 0;
    for (const object of town.objects) {
      const entry = outdoorForObject(object), restriction = outdoorReadOnlyReason(object.kind);
      expect(Boolean(entry) !== Boolean(restriction), object.id).toBe(true);
      if (entry) cataloged++; else fixed++;
    }
    expect(cataloged).toBe(268); expect(fixed).toBe(2);
    expect(town.objects).toEqual(before);
  });

  it('uses defaults that exactly match existing generated dimensions and collision/layer data', () => {
    const objects = buildWorld().areas.get('town-main')!.objects;
    for (const entry of OUTDOOR) {
      const examples = objects.filter(object => object.kind === entry.kind && object.style === entry.style);
      expect(examples.length, entry.id).toBeGreaterThan(0);
      expect(examples.some(object => object.w === entry.w && object.h === entry.h
        && object.solid === entry.solid && object.layer === entry.layer), entry.id).toBe(true);
    }
    expect(outdoorById('house-0')).toMatchObject({ w: 5, h: 4, category: 'building' });
    expect(outdoorById('apartment-0')).toMatchObject({ w: 7, h: 6, category: 'building' });
    expect(outdoorById('tree-green')).toMatchObject({ w: 1, h: 1, category: 'prop' });
    expect(outdoorById('flowerbed')).toMatchObject({ solid: false, layer: 'decal' });
  });

  it('does not replace actual variable building sizes or attach catalog IDs/facilities', () => {
    const object = buildWorld().areas.get('town-main')!.objects.find(item => item.facilityId === 'home-family')!;
    const before = structuredClone(object), entry = outdoorForObject(object)!;
    expect(object).toMatchObject({ w: 6, h: 5, kind: 'house', style: '1' });
    expect(entry).toMatchObject({ w: 5, h: 4, kind: 'house', style: '1' });
    expect(object).toEqual(before);
    for (const row of OUTDOOR) { expect(row).not.toHaveProperty('catalogId'); expect(row).not.toHaveProperty('facilityId'); }
  });

  it('preserves distinct existing styles and rejects unknown IDs/pairs instead of using a fallback', () => {
    expect(outdoorForObject({ kind: 'lamp' })).toBe(outdoorById('lamp'));
    expect(outdoorForObject({ kind: 'lamp', style: 'cherry' })).toBe(outdoorById('lamp-cherry'));
    expect(outdoorForObject({ kind: 'house', style: '0' })).toBe(outdoorById('house-0'));
    for (const object of [{ kind: 'house' }, { kind: 'tree', style: 'missing' }, { kind: 'lamp', style: '' }, { kind: 'missing' }]) {
      expect(outdoorForObject(object)).toBeUndefined();
    }
    for (const id of ['', 'missing', '__proto__', 'constructor', 'toString']) expect(outdoorById(id)).toBeUndefined();
  });

  it('keeps station, train and track out of the placement catalog and gives each a reason', () => {
    expect(OUTDOOR_READ_ONLY.map(entry => entry.kind)).toEqual(['station', 'train', 'track']);
    expect(Object.isFrozen(OUTDOOR_READ_ONLY)).toBe(true);
    for (const entry of OUTDOOR_READ_ONLY) {
      expect(Object.isFrozen(entry)).toBe(true); expect(entry.reason.length).toBeGreaterThan(0);
      expect(outdoorReadOnlyReason(entry.kind)).toBe(entry.reason);
      expect(OUTDOOR.some(row => row.kind === entry.kind)).toBe(false);
    }
    expect(outdoorReadOnlyReason('tree')).toBeUndefined();
    expect(outdoorReadOnlyReason('__proto__')).toBeUndefined();
  });
});

class ThumbnailCanvas {
  width = 0; height = 0;
  readonly calls: { source: HTMLCanvasElement; x: number; y: number; width: number; height: number }[] = [];
  readonly context = {
    imageSmoothingEnabled: true,
    drawImage: (source: HTMLCanvasElement, x: number, y: number, width: number, height: number) => {
      this.calls.push({ source, x, y, width, height });
    },
  };
  getContext() { return this.context; }
}

describe('legacy outdoor thumbnails', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const render = vi.spyOn(sprites, 'objectSprite').mockImplementation(object => ({
      canvas: { width: object.kind === 'tree' ? 34 : object.w * 16,
        height: object.kind === 'tree' ? 40 : object.h * 16 + (object.kind === 'lamp' ? 20 : 0) } as HTMLCanvasElement,
      ox: object.kind === 'tree' ? -9 : 0, oy: object.kind === 'tree' ? -24 : object.kind === 'lamp' ? -20 : 0,
    }));
    vi.stubGlobal('document', { createElement: () => new ThumbnailCanvas() });
    return render;
  }

  it.each([16, 48, 96, 160, 640])('fits every default object in %dpx, preserving full trees, lamps and buildings', size => {
    const render = setup();
    for (const entry of OUTDOOR) {
      const thumbnail = outdoorThumbnail(entry.id, size) as unknown as ThumbnailCanvas;
      const expected: ObjectDef = { kind: entry.kind, style: entry.style, w: entry.w, h: entry.h,
        x: 0, y: 0, solid: entry.solid, layer: entry.layer };
      expect(render).toHaveBeenLastCalledWith(expected);
      expect(thumbnail.width).toBe(size); expect(thumbnail.height).toBe(size);
      expect(thumbnail.context.imageSmoothingEnabled).toBe(false); expect(thumbnail.calls).toHaveLength(1);
      const draw = thumbnail.calls[0], source = render.mock.results.at(-1)!.value.canvas;
      expect(draw.source).toBe(source);
      expect([draw.x, draw.y, draw.width, draw.height].every(Number.isInteger)).toBe(true);
      expect(draw.x).toBe(Math.floor((size - draw.width) / 2)); expect(draw.y).toBe(Math.floor((size - draw.height) / 2));
      expect(draw.x >= 0 && draw.y >= 0 && draw.x + draw.width <= size && draw.y + draw.height <= size).toBe(true);
      const fit = size / Math.max(source.width, source.height);
      if (fit >= 1) {
        expect(Number.isInteger(draw.width / source.width)).toBe(true);
        expect(draw.width / source.width).toBe(draw.height / source.height);
      } else {
        expect(Math.abs(draw.width - source.width * fit)).toBeLessThan(1.01);
        expect(Math.abs(draw.height - source.height * fit)).toBeLessThan(1.01);
      }
      expect(expected).not.toHaveProperty('catalogId'); expect(expected).not.toHaveProperty('facilityId');
    }
  });

  it('does not return the cached source canvas or share thumbnails between consumers', () => {
    setup();
    const first = outdoorThumbnail('tree-green', 48), second = outdoorThumbnail('tree-green', 48);
    expect(first).not.toBe(second);
  });

  it('rejects invalid IDs and non-integral frames before drawing any sprite', () => {
    const render = setup();
    expect(() => outdoorThumbnail('station', 48)).toThrow('Unknown outdoor object');
    expect(() => outdoorThumbnail('missing', 48)).toThrow('Unknown outdoor object');
    for (const size of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => outdoorThumbnail('tree-green', size)).toThrow(RangeError);
    }
    expect(render).not.toHaveBeenCalled();
  });
});
