import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Facing } from '../src/core/coords';
import { PEOPLE, isPersonId } from '../src/render/people/catalog';
import { personThumbnail } from '../src/render/people/thumbnails';
import * as sprites from '../src/render/sprites';
import { buildWorld } from '../src/world';

afterEach(() => vi.restoreAllMocks());

describe('existing people catalog (DOM independent)', () => {
  it('offers unique, immutable IDs with short Japanese labels', () => {
    expect(typeof document).toBe('undefined');
    expect(PEOPLE.map(person => person.id)).toEqual([
      'cat', 'classmate', 'clerk', 'friend', 'grandma', 'guard', 'mother', 'shopkeeper', 'staff', 'teacher', 'player',
    ]);
    expect(new Set(PEOPLE.map(person => person.id)).size).toBe(PEOPLE.length);
    expect(Object.isFrozen(PEOPLE)).toBe(true);
    for (const person of PEOPLE) {
      expect(Object.isFrozen(person)).toBe(true);
      expect(person.name).toMatch(/[ぁ-んァ-ン一-龯]/);
      expect(person.name.length).toBeLessThanOrEqual(8);
      expect(isPersonId(person.id)).toBe(true);
    }
  });

  it('covers every sprite used by the real World NPCs without changing their data', () => {
    const world = buildWorld();
    const people = [...world.areas.values()].flatMap(area => area.interactions.filter(item => item.kind === 'npc'));
    const before = structuredClone(people);
    expect(people.length).toBeGreaterThanOrEqual(10);
    for (const person of people) expect(isPersonId(person.sprite ?? 'friend'), person.id).toBe(true);
    expect(people).toEqual(before);
  });

  it('does not treat fallback names, inherited object keys or case changes as IDs', () => {
    for (const id of ['', 'missing', 'Mother', ' mother', 'mother ', '__proto__', 'toString', 'constructor']) {
      expect(isPersonId(id), id).toBe(false);
    }
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

describe('people thumbnail placement', () => {
  const facings: Facing[] = ['down', 'left', 'up', 'right'];
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const source = { width: 18, height: 26 } as HTMLCanvasElement;
    const sprite = { canvas: source, ox: -9, oy: -26 };
    const render = vi.spyOn(sprites, 'characterSprite').mockReturnValue(sprite);
    vi.stubGlobal('document', { createElement: () => new ThumbnailCanvas() });
    return { source, sprite, render };
  }

  it.each([26, 39, 48, 52, 79, 104])('fits every person and direction in a %dpx frame at integer scale', size => {
    const { source, sprite, render } = setup();
    for (const person of PEOPLE) for (const facing of facings) {
      const thumbnail = personThumbnail(person.id, facing, size) as unknown as ThumbnailCanvas;
      expect(render).toHaveBeenLastCalledWith(person.id, facing, 0);
      expect(thumbnail.width).toBe(size); expect(thumbnail.height).toBe(size);
      expect(thumbnail.context.imageSmoothingEnabled).toBe(false);
      expect(thumbnail.calls).toHaveLength(1);
      const draw = thumbnail.calls[0], scale = draw.width / source.width;
      expect(draw.source).toBe(source); expect(Number.isInteger(scale) && scale >= 1).toBe(true);
      expect(draw.height / source.height).toBe(scale);
      expect(draw.x).toBe(Math.floor((size - draw.width) / 2));
      expect(draw.y).toBe(Math.floor((size - draw.height) / 2));
      expect(draw.x >= 0 && draw.y >= 0 && draw.x + draw.width <= size && draw.y + draw.height <= size).toBe(true);
    }
    expect(sprite).toEqual({ canvas: source, ox: -9, oy: -26 });
  });

  it('returns independent canvases without reparenting a shared source sprite', () => {
    const { source } = setup();
    const first = personThumbnail('mother', 'down', 48), second = personThumbnail('mother', 'down', 48);
    expect(first).not.toBe(second); expect(first).not.toBe(source);
  });

  it('rejects unknown IDs and sizes that would blur or clip the sprite', () => {
    const { render } = setup();
    expect(() => personThumbnail('missing', 'down', 48)).toThrow('Unknown person');
    for (const size of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => personThumbnail('cat', 'down', size)).toThrow(RangeError);
    }
    expect(render).not.toHaveBeenCalled();
    expect(() => personThumbnail('cat', 'down', 25)).toThrow('complete person sprite');
  });
});
