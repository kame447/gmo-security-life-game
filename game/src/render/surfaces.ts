/** Optional floor/wall artwork; the underlying terrain and collision stay unchanged. */
import { hash2, TILE } from '../core/coords';
import { T } from '../world/tiles';
import { makeCanvas, R, type C2D } from './draw';
import { drawGroundTile } from './ground';

export interface SurfaceDef { id: string; name: string; kind: 'floor' | 'wall' }
export const SURFACES: readonly SurfaceDef[] = Object.freeze(([
  { id: 'floor-wood-light', name: '明るい板張り', kind: 'floor' },
  { id: 'floor-wood-dark', name: '濃い板張り', kind: 'floor' },
  { id: 'floor-tatami', name: '畳', kind: 'floor' },
  { id: 'floor-carpet-beige', name: 'じゅうたん', kind: 'floor' },
  { id: 'floor-tile-check', name: '市松のタイル', kind: 'floor' },
  { id: 'floor-shop-white', name: '店の白い床', kind: 'floor' },
  { id: 'wall-plain-cream', name: '無地の壁紙', kind: 'wall' },
  { id: 'wall-stripe-green', name: '緑の縦じま', kind: 'wall' },
  { id: 'wall-wood-panel', name: '木の腰板', kind: 'wall' },
  { id: 'wall-shop-white', name: '店の白い壁', kind: 'wall' },
] satisfies SurfaceDef[]).map(entry => Object.freeze(entry)));
const byId = new Map(SURFACES.map(entry => [entry.id, entry]));

/** Paint one complete 16px tile. Unknown IDs do not touch the canvas. */
export function drawSurfaceTile(c: C2D, id: string, px: number, py: number, tx: number, ty: number): boolean {
  if (!byId.has(id)) return false;
  const legacy = id === 'floor-wood-light' ? T.FLOOR_WOOD : id === 'floor-tatami' ? T.FLOOR_TATAMI
    : id === 'wall-plain-cream' ? T.WALL : undefined;
  if (legacy !== undefined) {
    drawGroundTile(c, legacy, px, py, tx, ty, () => legacy);
    return true;
  }
  const r = (color: string, x: number, y: number, w = 1, h = 1) => R(c, color, px + x, py + y, w, h);
  const base = (color: string) => r(color, 0, 0, TILE, TILE);
  switch (id) {
    case 'floor-wood-dark':
      base('#926442');
      for (let y = 0; y < TILE; y += 4) {
        r('#6b4f3b', 0, y, TILE, 1); r('#c79560', 0, y + 1, TILE, 1);
        r('#6b4f3b', ((ty * 4 + y / 4) % 2) * 8, y, 1, 4);
      }
      for (let i = 0; i < 9; i++) r(i % 2 ? '#b27c50' : '#6b4f3b',
        Math.floor(hash2(tx * TILE + i, ty, 211) * 15), Math.floor(hash2(tx, ty * TILE + i, 212) * TILE), 2, 1);
      break;
    case 'floor-carpet-beige':
      base('#c9b499');
      for (let y = 0; y < TILE; y += 4) for (let x = 0; x < TILE; x += 4) {
        r('#dfcdb0', x, y + 1, 2, 1); r('#b7a288', x + 2, y + 2, 1, 2);
      }
      for (let i = 0; i < 8; i++) r('#d4c1a4',
        Math.floor(hash2(tx * TILE + i, ty, 213) * TILE), Math.floor(hash2(tx, ty * TILE + i, 214) * TILE));
      break;
    case 'floor-tile-check':
      base('#9eaaa5');
      for (let y = 0; y < TILE; y += 4) for (let x = 0; x < TILE; x += 4) {
        const light = (x / 4 + y / 4) % 2 === 0;
        r(light ? '#e5e7dd' : '#8ea79f', x + 1, y + 1, 3, 3);
        r(light ? '#fff5dc' : '#9eaaa5', x + 1, y + 1, 3, 1);
      }
      break;
    case 'floor-shop-white':
      base('#e5e7dd');
      for (let y = 0; y < TILE; y += 8) for (let x = 0; x < TILE; x += 8) {
        r('#9eaaa5', x, y, 8, 1); r('#9eaaa5', x, y, 1, 8);
        r('#fff5dc', x + 1, y + 1, 7, 1); r('#d6e2df', x + 7, y + 2, 1, 6);
      }
      break;
    case 'wall-stripe-green':
      base('#efe5ca');
      for (let x = 2; x < TILE; x += 4) { r('#8ca486', x, 2, 2, 10); r('#6e8972', x + 1, 2, 1, 10); }
      r('#fff5dc', 0, 0, TILE, 2);
      r('#926442', 0, 12, TILE, 4); r('#c79560', 0, 12, TILE, 1); r('#6b4f3b', 0, 15, TILE, 1);
      break;
    case 'wall-wood-panel':
      base('#efe5ca'); r('#fff5dc', 0, 0, TILE, 2);
      r('#c79560', 0, 8, TILE, 8); r('#e3ba7d', 0, 8, TILE, 1); r('#926442', 0, 9, TILE, 1);
      for (let x = 0; x < TILE; x += 4) { r('#926442', x, 10, 1, 5); r('#e3ba7d', x + 1, 10, 1, 4); }
      r('#6b4f3b', 0, 15, TILE, 1);
      break;
    case 'wall-shop-white':
      base('#e5e7dd'); r('#fff5dc', 0, 0, TILE, 2);
      for (let x = 0; x < TILE; x += 8) { r('#9eaaa5', x, 2, 1, 10); r('#d6e2df', x + 1, 2, 1, 10); }
      r('#d6e2df', 0, 7, TILE, 1); r('#9eaaa5', 0, 12, TILE, 4);
      r('#d6e2df', 0, 12, TILE, 1); r('#657e88', 0, 15, TILE, 1);
      break;
  }
  return true;
}

/** Two-by-two tile sample, centered without fractional pixel scaling. */
export function surfaceThumbnail(id: string, size = 48): HTMLCanvasElement {
  if (!byId.has(id)) throw new Error(`Unknown surface: ${id}`);
  if (!Number.isSafeInteger(size) || size < TILE * 2) throw new RangeError('Thumbnail must fit two tiles');
  const [sample, c] = makeCanvas(TILE * 2, TILE * 2);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) drawSurfaceTile(c, id, x * TILE, y * TILE, x, y);
  const [canvas, frame] = makeCanvas(size, size);
  R(frame, '#efe5ca', 0, 0, size, size);
  const zoom = Math.floor(size / (TILE * 2)), width = TILE * 2 * zoom;
  const offset = Math.floor((size - width) / 2);
  frame.drawImage(sample, offset, offset, width, width);
  return canvas;
}
