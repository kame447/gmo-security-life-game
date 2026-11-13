import { afterEach, expect, it, vi } from 'vitest';
import type { AreaDef, ObjectDef } from '../src/core/types';
import * as colors from '../src/render/building-colors';
import { objectSprite } from '../src/render/sprites';
import { buildAreaMap } from '../src/minimap/model';
import { toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';

const { painted } = vi.hoisted(() => ({ painted: [] as string[] }));
// Record actual sprite paint calls without requiring a browser canvas in Node.
vi.mock('../src/render/draw', () => ({
  makeCanvas: (width: number, height: number) => [{ width, height }, {
    clearRect() {}, fillText() {}, getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }),
  }],
  R: (_context: unknown, color: string) => { painted.push(color); },
}));
afterEach(() => { vi.restoreAllMocks(); painted.length = 0; });

it.each([
  ['house', '0', '#56718a'], ['house', '1', '#99705c'], ['apartment', '0', '#b5bec0'],
  ['shop', 'greengrocer', '#c7c9bd'], ['shop', 'bookstore', '#6f7779'], ['shop', 'candy', '#c7c9bd'],
  ['shop', 'konbini', '#c7c9bd'], ['shop', 'bakery', '#a27855'], ['shop', 'cafe', '#64776a'], ['shop', 'pharmacy', '#c7c9bd'],
  ['school', '0', '#c2cbcb'], ['gym', '0', '#6b8c9f'], ['station', '0', '#607f98'], ['gazebo', '0', '#a37a52'],
])('preserves the sprite upper surface for %s/%s', (kind, style, expected) => {
  const object: ObjectDef = { kind, style, x: 0, y: 0, w: 6, h: 7, solid: true };
  expect(colors.buildingRepresentativeColor(object)).toBe(expected);
  objectSprite(object);
  expect(painted).toContain(expected);
});

it('routes both sprite painting and minimap raster colors through the shared provider', () => {
  vi.spyOn(colors, 'buildingRepresentativeColor').mockReturnValue('#123abc');
  const object: ObjectDef = { kind: 'house', style: '4', x: 0, y: 0, w: 4, h: 3, solid: true };
  const def: AreaDef = { id: 'colors', name: 'colors', kind: 'outdoor', width: 4, height: 3,
    ground: new Uint8Array(12).fill(T.GRASS), objects: [object], portals: [], interactions: [] };
  objectSprite(object);
  expect(painted).toContain('#123abc');
  expect(buildAreaMap(toRuntime(def)).colors.every(color => color === '#123abc')).toBe(true);
});
