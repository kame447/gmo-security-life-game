import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '../src/core/appearance';
import type { AreaDef } from '../src/core/types';
import { FURNITURE } from '../src/render/furniture/catalog';
import { furnitureSprite, furnitureThumbnail } from '../src/render/furniture/sprites';
import { Renderer, type RenderView } from '../src/render/renderer';
import { objectSprite, playerSprite } from '../src/render/sprites';
import { toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';

// Small integer raster/command recorder; browser pixel parity is checked separately.
class Canvas {
  width = 320; height = 240; clientWidth = 320; clientHeight = 240;
  style: Record<string, string> = {};
  pixels = new Uint32Array(0);
  readonly context = new Context(this);
  getContext() { return this.context; }
  data() {
    if (this.pixels.length !== this.width * this.height) this.pixels = new Uint32Array(this.width * this.height);
    return this.pixels;
  }
}
class Context {
  fillStyle = '#000000'; imageSmoothingEnabled = true;
  transform = [1, 0, 0, 1, 0, 0];
  readonly images: { image: Canvas; x: number; y: number; w: number; h: number }[] = [];
  private readonly saved: { transform: number[]; fillStyle: string }[] = [];
  constructor(private readonly canvas: Canvas) {}
  setTransform(...values: number[]) { this.transform = values; }
  save() { this.saved.push({ transform: [...this.transform], fillStyle: this.fillStyle }); }
  restore() { const state = this.saved.pop()!; this.transform = state.transform; this.fillStyle = state.fillStyle; }
  beginPath() {} rect() {} clip() {}
  translate(x: number, y: number) { this.transform[4] += x * this.transform[0]; this.transform[5] += y * this.transform[3]; }
  scale(x: number, y: number) { this.transform[0] *= x; this.transform[3] *= y; }
  fillRect(x: number, y: number, w: number, h: number) {
    const [sx, , , sy, tx, ty] = this.transform;
    const match = this.fillStyle.match(/^rgba\(0,0,0,([\d.]+)\)$/);
    const color = match ? Math.round(Number(match[1]) * 255)
      : Number.parseInt(this.fillStyle.slice(1).padEnd(8, 'f'), 16) >>> 0;
    const data = this.canvas.data();
    for (let py = Math.max(0, Math.floor(y * sy + ty)); py < Math.min(this.canvas.height, (y + h) * sy + ty); py++) {
      for (let px = Math.max(0, Math.floor(x * sx + tx)); px < Math.min(this.canvas.width, (x + w) * sx + tx); px++) data[py * this.canvas.width + px] = color;
    }
  }
  drawImage(image: Canvas, x: number, y: number, w = image.width, h = image.height) {
    this.images.push({ image, x, y, w, h });
    const [sx, , , sy, tx, ty] = this.transform;
    const target = this.canvas.data(), source = image.data();
    const left = x * sx + tx, top = y * sy + ty, width = w * sx, height = h * sy;
    for (let py = Math.max(0, Math.ceil(top)); py < Math.min(this.canvas.height, top + height); py++) {
      for (let px = Math.max(0, Math.ceil(left)); px < Math.min(this.canvas.width, left + width); px++) {
        const color = source[Math.floor((py - top) / height * image.height) * image.width + Math.floor((px - left) / width * image.width)];
        if (color & 255) target[py * this.canvas.width + px] = color;
      }
    }
  }
}
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => new Canvas() });
  vi.stubGlobal('Path2D', class { rect() {} });
});
afterAll(() => vi.unstubAllGlobals());
const raster = (canvas: HTMLCanvasElement) => canvas as unknown as Canvas;

describe('furniture pixel artwork', () => {
  it('draws all variants with transparent edges, detailed palettes and footprint-aligned overhangs', () => {
    for (const entry of FURNITURE) for (const variant of entry.variants) {
      const sprite = furnitureSprite({ kind: entry.id, facing: variant.facing })!;
      expect(sprite).toMatchObject({ ox: 0, oy: -variant.overhang });
      expect(sprite.canvas.width).toBe(variant.w * 16);
      expect(sprite.canvas.height).toBe(variant.h * 16 + variant.overhang);
      const pixels = raster(sprite.canvas).data();
      expect(pixels.some(pixel => pixel === 0)).toBe(true);
      expect(new Set(pixels).size).toBeGreaterThan(4);
      expect([...pixels].every(pixel => [0, 38, 255].includes(pixel & 255))).toBe(true);
      if (variant.overhang) expect(pixels.slice(0, variant.overhang * sprite.canvas.width).some(Boolean)).toBe(true);
      expect(raster(sprite.canvas).context.imageSmoothingEnabled).toBe(false);
    }
  });

  it('uses distinct, cached directional art and integrates without changing legacy furniture', () => {
    for (const entry of FURNITURE) {
      const views = entry.variants.map(variant => furnitureSprite({ kind: entry.id, facing: variant.facing })!);
      expect(new Set(views.map(sprite => [...raster(sprite.canvas).data()].join(','))).size).toBe(views.length);
      expect(objectSprite({ kind: entry.id, x: 1, y: 1, w: 1, h: 1, solid: true })).toBe(views[0]);
      expect(furnitureSprite({ kind: entry.id })).toBe(views[0]);
    }
    for (const kind of ['sofa', 'bed', 'bookshelf']) {
      const old = { kind, x: 0, y: 0, w: 2, h: 3, solid: true };
      expect(furnitureSprite(old)).toBeUndefined();
      const sprite = objectSprite(old);
      expect(sprite.canvas.width).toBe(32); expect(sprite.canvas.height).toBe(48); expect(sprite.oy).toBe(0);
      expect(objectSprite({ ...old, facing: 'up' })).toBe(sprite);
    }
  });

  it('makes fitted integer thumbnails from the exact game sprites', () => {
    for (const entry of FURNITURE) {
      const thumbnail = raster(furnitureThumbnail(entry.id));
      expect(thumbnail.width).toBe(48); expect(thumbnail.height).toBe(48);
      const draw = thumbnail.context.images[0];
      expect(draw.image).toBe(furnitureSprite({ kind: entry.id })!.canvas);
      expect(Number.isInteger(draw.w / draw.image.width)).toBe(true);
      expect(draw.w / draw.image.width).toBe(draw.h / draw.image.height);
      expect(draw.x >= 0 && draw.y >= 0 && draw.x + draw.w <= 48 && draw.y + draw.h <= 48).toBe(true);
    }
    expect(() => furnitureThumbnail('missing')).toThrow('Unknown furniture');
    expect(() => furnitureThumbnail('chair-wood', 0)).toThrow(RangeError);
  });
});

function view(kind: 'indoor' | 'outdoor' = 'outdoor'): RenderView {
  const def: AreaDef = { id: 'test-area', name: 'Test', kind, width: 64, height: 48,
    ground: new Uint8Array(64 * 48).fill(T.FLOOR_WOOD), portals: [], interactions: [], objects: [] };
  return { area: toRuntime(def), player: { x: 600.4, y: 480.6, facing: 'down' },
    appearance: DEFAULT_APPEARANCE, moving: false, walkTime: 0, dialog: null };
}
function renderer() {
  const canvas = new Canvas();
  return { canvas, renderer: new Renderer(canvas as unknown as HTMLCanvasElement) };
}

describe('Renderer editor options over the existing drawing path', () => {
  it('retains the default integer camera and maps CSS coordinates through the drawn projection', () => {
    const h = renderer();
    h.renderer.draw(view(), 0);
    expect(h.renderer.stats).toMatchObject({ zoom: 1, viewW: 320, viewH: 240, camX: 440, camY: 353, spritesDrawn: 1 });
    expect(h.renderer.screenToArea(0, 0)).toEqual({ x: 440, y: 353 });
    expect(h.renderer.screenToArea(160, 120)).toEqual({ x: 600, y: 473 });
  });

  it('allows free pan beyond map bounds and inverts non-integer DPR and integer physical zoom', () => {
    const h = renderer(); h.renderer.resize(301, 221, 1.5);
    h.renderer.draw({ ...view(), camera: { centerX: -50, centerY: 900, zoom: 3 }, hidePlayer: true }, 0);
    expect(h.renderer.stats).toMatchObject({ zoom: 3, viewW: 151, viewH: 111, camX: -125, camY: 845 });
    const point = h.renderer.screenToArea(75.25, 110.5);
    expect(point.x).toBeCloseTo(-125 + 75.25 * 452 / 301 / 3);
    expect(point.y).toBeCloseTo(845 + 110.5 * 332 / 221 / 3);
    expect(h.renderer.stats.spritesDrawn).toBe(0);
  });

  it('hides only the player and leaves furniture and NPC drawing in their existing order', () => {
    const game = view();
    game.area.objects.push({ kind: 'chair-wood', x: 37, y: 29, w: 1, h: 1, solid: true });
    game.area.interactions.push({ id: 'test-npc', kind: 'npc', name: 'Test', x: 38, y: 29,
      solid: true, eventKey: 'test', lines: ['Test'] });
    const h = renderer(); h.renderer.draw(game, 0);
    expect(h.renderer.stats.spritesDrawn).toBe(3);
    h.canvas.context.images.length = 0;
    h.renderer.draw({ ...game, hidePlayer: true }, 0);
    expect(h.renderer.stats.spritesDrawn).toBe(2);
    expect(h.canvas.context.images.some(draw => draw.image === raster(playerSprite(DEFAULT_APPEARANCE, 'down', 0).canvas))).toBe(false);
  });

  it('rebuilds changed runtime ground, keeps normal fades and skips them only with instant', () => {
    const h = renderer(), game = view('indoor'); h.renderer.draw(game, 0);
    const oldGround = h.canvas.context.images[0].image;
    const changed = { ...game, area: toRuntime({ ...game.area.def, ground: new Uint8Array(game.area.ground).fill(T.FLOOR_TATAMI) }) };
    h.canvas.context.images.length = 0; h.renderer.draw(changed, 1);
    expect(h.renderer.stats.fading).toBe(true);
    expect(h.canvas.context.images[0].image).not.toBe(oldGround);
    h.renderer.draw({ ...game, instant: true }, 2);
    expect(h.renderer.stats.fading).toBe(false);
    expect(h.renderer.stats.chunksBakedThisFrame).toBeGreaterThan(0);
  });

  it('restores the gameplay projection after an editor frame without changing the area', () => {
    const h = renderer(), baseline = renderer(), game = view();
    const before = structuredClone(game.area.def);
    h.renderer.draw({ ...game, camera: { centerX: 40, centerY: 70, zoom: 4 }, hidePlayer: true, instant: true }, 1);
    h.renderer.draw(game, 1); baseline.renderer.draw(game, 1);
    // Panning can warm extra ground chunks; compare the actual frame and projection.
    expect(h.renderer.stats).toMatchObject({ zoom: baseline.renderer.stats.zoom,
      viewW: baseline.renderer.stats.viewW, viewH: baseline.renderer.stats.viewH,
      camX: baseline.renderer.stats.camX, camY: baseline.renderer.stats.camY,
      spritesDrawn: baseline.renderer.stats.spritesDrawn, chunksDrawn: baseline.renderer.stats.chunksDrawn });
    expect(h.canvas.data()).toEqual(baseline.canvas.data());
    expect(game.area.def).toEqual(before);
  });

  it('rejects invalid camera values without damaging the next normal frame', () => {
    const h = renderer(), game = view();
    expect(() => h.renderer.screenToArea(1, 2)).toThrow('Draw before');
    for (const camera of [{ centerX: NaN, centerY: 0, zoom: 2 }, { centerX: 0, centerY: 0, zoom: 1.5 }, { centerX: 0, centerY: 0, zoom: 0 }]) {
      expect(() => h.renderer.draw({ ...game, camera }, 0)).toThrow(RangeError);
    }
    h.renderer.draw(game, 0);
    expect(h.renderer.stats.zoom).toBe(1);
  });
});
