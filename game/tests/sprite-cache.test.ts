import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ObjectDef } from '../src/core/types';
import { objectSprite } from '../src/render/sprites';
import { storeFurnishingSprite } from '../src/render/stores';

class Canvas {
  width = 320;
  height = 240;
  pixels = new Uint32Array(0);
  readonly context = new Context(this);
  getContext() {
    return this.context;
  }
  data() {
    if (this.pixels.length !== this.width * this.height) {
      this.pixels = new Uint32Array(this.width * this.height);
    }
    return this.pixels;
  }
}

class Context {
  fillStyle = '#000000';
  imageSmoothingEnabled = true;
  constructor(private readonly canvas: Canvas) {}
  clearRect(x: number, y: number, w: number, h: number) {
    const data = this.canvas.data();
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.canvas.height, y + h); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.canvas.width, x + w); px++) {
        data[py * this.canvas.width + px] = 0;
      }
    }
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const color = Number.parseInt(this.fillStyle.slice(1).padEnd(8, 'f'), 16) >>> 0;
    const data = this.canvas.data();
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.canvas.height, y + h); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.canvas.width, x + w); px++) {
        data[py * this.canvas.width + px] = color;
      }
    }
  }
}

const raster = (canvas: HTMLCanvasElement) => (canvas as unknown as Canvas).data();

describe('objectSprite facing cache key', () => {
  beforeAll(() => vi.stubGlobal('document', { createElement: () => new Canvas() }));
  afterAll(() => vi.unstubAllGlobals());

  it('caches down and omitted facing together and keeps down vs up sprites distinct for same-footprint store fixtures', () => {
    const samples: ObjectDef[] = [
      { kind: 'bookstore-counter', x: 0, y: 0, w: 2, h: 1, solid: true },
      { kind: 'bookstore-counter', style: 'side', x: 0, y: 0, w: 2, h: 1, solid: true },
      { kind: 'candy-counter', x: 0, y: 0, w: 2, h: 1, solid: true },
      { kind: 'bookstore-picture-shelf', x: 0, y: 0, w: 3, h: 2, solid: true },
    ];

    for (const base of samples) {
      const omitted = objectSprite(base);
      const down = objectSprite({ ...base, facing: 'down' });
      const up = objectSprite({ ...base, facing: 'up' });
      const directDown = storeFurnishingSprite({ ...base, facing: 'down' })!;
      const directUp = storeFurnishingSprite({ ...base, facing: 'up' })!;

      expect(down, `${base.kind}/${base.style ?? ''} down cache hit`).toBe(omitted);
      expect(up, `${base.kind}/${base.style ?? ''} up separate entry`).not.toBe(down);
      expect([...raster(down.canvas)]).toEqual([...raster(directDown.canvas)]);
      expect([...raster(up.canvas)]).toEqual([...raster(directUp.canvas)]);
      expect([...raster(up.canvas)]).not.toEqual([...raster(down.canvas)]);
    }

    // Also verify fetching 'up' before 'down' does not poison the 'down' cache entry.
    const reverseBase: ObjectDef = { kind: 'pharmacy-counter', x: 0, y: 0, w: 5, h: 1, solid: true };
    const revUp = objectSprite({ ...reverseBase, facing: 'up' });
    const revDown = objectSprite({ ...reverseBase, facing: 'down' });
    expect(revDown).not.toBe(revUp);
    expect([...raster(revDown.canvas)]).toEqual([...raster(storeFurnishingSprite({ ...reverseBase, facing: 'down' })!.canvas)]);
  });
});
