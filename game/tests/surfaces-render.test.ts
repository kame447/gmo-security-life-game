import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '../src/core/appearance';
import type { AreaDef, AreaSurfaces } from '../src/core/types';
import { drawGroundTile } from '../src/render/ground';
import { Renderer, type RenderView } from '../src/render/renderer';
import * as surfaces from '../src/render/surfaces';
import { toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';

interface Rect { color: string; x: number; y: number; w: number; h: number }
class Context {
  fillStyle = ''; imageSmoothingEnabled = true;
  rects: Rect[] = [];
  images: { canvas: Canvas; args: number[] }[] = [];
  fillRect(x: number, y: number, w: number, h: number) { this.rects.push({ color: this.fillStyle, x, y, w, h }); }
  drawImage(canvas: Canvas, ...args: number[]) { this.images.push({ canvas, args }); }
  setTransform() {} save() {} restore() {} beginPath() {} rect() {} clip() {} translate() {} scale() {}
}
class Canvas {
  width = 160; height = 160; clientWidth = 160; clientHeight = 160;
  style: Record<string, string> = {};
  context = new Context();
  getContext() { return this.context; }
}
const context = () => new Context();
const c2d = (c: Context) => c as unknown as CanvasRenderingContext2D;
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => new Canvas() });
  vi.stubGlobal('Path2D', class { rect() {} });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

describe('surface tiles and thumbnails', () => {
  it('paints deterministic opaque, textured tiles without crossing their 16px bounds', () => {
    for (const surface of surfaces.SURFACES) {
      const first = context(), again = context();
      expect(surfaces.drawSurfaceTile(c2d(first), surface.id, 23, 41, 7, 9)).toBe(true);
      surfaces.drawSurfaceTile(c2d(again), surface.id, 23, 41, 7, 9);
      expect(first.rects).toEqual(again.rects);
      expect(first.rects[0]).toMatchObject({ x: 23, y: 41, w: 16, h: 16 });
      expect(new Set(first.rects.map(rect => rect.color)).size).toBeGreaterThanOrEqual(4);
      for (const rect of first.rects) {
        expect(rect.color).toMatch(/^#[0-9a-f]{6}$/);
        expect([rect.x, rect.y, rect.w, rect.h].every(Number.isInteger)).toBe(true);
        expect(rect.w > 0 && rect.h > 0).toBe(true);
        expect(rect.x >= 23 && rect.y >= 41 && rect.x + rect.w <= 39 && rect.y + rect.h <= 57).toBe(true);
      }
    }
  });

  it('keeps the three existing appearances exactly, including world-coordinate grain at chunk edges', () => {
    for (const [id, tile] of [['floor-wood-light', T.FLOOR_WOOD], ['floor-tatami', T.FLOOR_TATAMI], ['wall-plain-cream', T.WALL]] as const) {
      for (const [tx, ty] of [[0, 0], [15, 16], [16, 17]]) {
        const overlay = context(), original = context();
        surfaces.drawSurfaceTile(c2d(overlay), id, 0, 0, tx, ty);
        drawGroundTile(c2d(original), tile, 0, 0, tx, ty, () => tile);
        expect(overlay.rects).toEqual(original.rects);
      }
    }
  });

  it('leaves unknown IDs untouched and varies textured floors by stable area coordinates', () => {
    const c = context();
    expect(surfaces.drawSurfaceTile(c2d(c), 'missing', 0, 0, 0, 0)).toBe(false);
    expect(c.rects).toEqual([]);
    for (const id of ['floor-wood-dark', 'floor-carpet-beige']) {
      const first = context(), next = context();
      surfaces.drawSurfaceTile(c2d(first), id, 0, 0, 4, 7);
      surfaces.drawSurfaceTile(c2d(next), id, 0, 0, 5, 7);
      expect(first.rects).not.toEqual(next.rects);
    }
  });

  it('builds two-by-two thumbnails from the same tile painter with integer scaling', () => {
    for (const surface of surfaces.SURFACES) for (const size of [48, 64]) {
      const canvas = surfaces.surfaceThumbnail(surface.id, size) as unknown as Canvas;
      expect(canvas.width).toBe(size); expect(canvas.height).toBe(size);
      expect(canvas.context.imageSmoothingEnabled).toBe(false);
      const { canvas: sample, args: [x, y, width, height] } = canvas.context.images[0];
      expect(sample.width).toBe(32); expect(sample.height).toBe(32);
      expect(width / 32).toBe(Math.floor(size / 32)); expect(height).toBe(width);
      expect(x >= 0 && y >= 0 && x + width <= size && y + height <= size).toBe(true);
      const expected = context();
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
        surfaces.drawSurfaceTile(c2d(expected), surface.id, tx * 16, ty * 16, tx, ty);
      }
      expect(sample.context.rects).toEqual(expected.rects);
    }
    expect(() => surfaces.surfaceThumbnail('missing')).toThrow('Unknown surface');
    expect(() => surfaces.surfaceThumbnail('floor-wood-light', 31)).toThrow(RangeError);
  });
});

function scene(style?: AreaSurfaces): RenderView {
  const def: AreaDef = { id: 'surface-room', name: 'Test', kind: 'indoor', width: 5, height: 1,
    ground: Uint8Array.from([T.FLOOR_WOOD, T.WALL, T.WALL_TOP, T.MAT, T.RAIL]),
    objects: [], interactions: [], portals: [], ...(style ? { surfaces: style } : {}) };
  return { area: toRuntime(def), player: { x: 8, y: 14, facing: 'down' }, appearance: DEFAULT_APPEARANCE,
    moving: false, walkTime: 0, dialog: null, hidePlayer: true, instant: true };
}
function render(view: RenderView) {
  const canvas = new Canvas(), renderer = new Renderer(canvas as unknown as HTMLCanvasElement);
  renderer.draw(view, 0); return { canvas, renderer };
}

describe('surface palette integration without terrain edits', () => {
  it('opts in per cell and preserves wall tops, outdoor terrain, collision and source data', () => {
    const paint = vi.spyOn(surfaces, 'drawSurfaceTile');
    const view = scene({ palette: ['floor-wood-dark', 'wall-stripe-green'], cells: Uint8Array.from([1, 2, 2, 1, 1]) });
    const before = structuredClone(view.area.def), solid = new Uint8Array(view.area.solid);
    render(view);
    expect(paint.mock.calls.map(call => [call[1], call[4], call[5]])).toEqual([
      ['floor-wood-dark', 0, 0], ['wall-stripe-green', 1, 0], ['floor-wood-dark', 3, 0],
    ]);
    expect(view.area.def).toEqual(before);
    expect(view.area.solid).toEqual(solid);
  });

  it('uses the old painter for missing, zero, unknown, out-of-palette and mismatched surface selections', () => {
    const paint = vi.spyOn(surfaces, 'drawSurfaceTile');
    for (const view of [scene(), scene({ palette: ['floor-wood-dark'], cells: new Uint8Array(5) }),
      scene({ palette: ['missing'], cells: new Uint8Array(5).fill(1) }),
      scene({ palette: ['floor-wood-dark'], cells: new Uint8Array(5).fill(2) }),
      scene({ palette: ['floor-wood-dark'], cells: Uint8Array.from([1]) }),
      scene({ palette: ['wall-stripe-green', 'floor-wood-dark'], cells: Uint8Array.from([1, 2, 1, 1, 1]) })]) {
      render(view);
    }
    expect(paint).not.toHaveBeenCalled();
  });

  it('rebakes a replacement runtime with the same ID rather than keeping the old surface pattern', () => {
    const paint = vi.spyOn(surfaces, 'drawSurfaceTile');
    const view = scene({ palette: ['floor-wood-dark'], cells: Uint8Array.from([1, 0, 0, 0, 0]) });
    const h = render(view), previous = h.canvas.context.images[0].canvas;
    h.canvas.context.images.length = 0; paint.mockClear();
    const next = scene({ palette: ['floor-carpet-beige'], cells: Uint8Array.from([1, 0, 0, 0, 0]) });
    h.renderer.draw(next, 1);
    expect(h.canvas.context.images[0].canvas).not.toBe(previous);
    expect(paint.mock.calls.map(call => call[1])).toEqual(['floor-carpet-beige']);
    expect(h.renderer.stats.fading).toBe(false);
  });
});
