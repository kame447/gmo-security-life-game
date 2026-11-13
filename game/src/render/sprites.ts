/** Original procedural pixel art. The player follows the reference PNGs via player-sprite.ts; no image IO. */
import type { ObjectDef } from '../core/types';
import { TILE, hash2, type Facing } from '../core/coords';
import { DEFAULT_APPEARANCE, normalizeAppearance, appearanceKey, type PlayerAppearance } from '../core/appearance';
import { makeCanvas, R, type C2D } from './draw';
import { buildingRepresentativeColor } from './building-colors';
import { drawPlayer, PLAYER_H, PLAYER_W } from './player-sprite';

export interface Sprite { canvas: HTMLCanvasElement; ox: number; oy: number }
const objects = new Map<string, Sprite>();
const people = new Map<string, Sprite>();
// LRU by whole appearance, each retaining at most four directions × three frames.
const avatars = new Map<string, Map<string, Sprite>>();
const ink = '#39414a', wood = '#926442', lightWood = '#c79560';

function box(c: C2D, x: number, y: number, w: number, h: number, color: string, edge = ink): void {
  R(c, edge, x, y, w, h); R(c, color, x + 1, y + 1, w - 2, h - 2);
}
function glass(c: C2D, x: number, y: number, w = 12, h = 12, lit = false): void {
  box(c, x, y, w, h, lit ? '#f6d990' : '#7ab2c8');
  R(c, lit ? '#fff0bc' : '#b8dfdf', x + 2, y + 2, w - 4, 2);
  R(c, '#dce6df', x + Math.floor(w / 2), y + 1, 1, h - 2);
  R(c, '#f4edcf', x - 1, y + h, w + 2, 2);
}
function door(c: C2D, center: number, bottom: number, wide = false): void {
  const w = wide ? 26 : 12, x = center - w / 2;
  box(c, x - 2, bottom - 23, w + 4, 23, '#e9d7b6');
  box(c, x, bottom - 21, w, 20, '#557f91');
  R(c, '#a6ced3', x + 2, bottom - 19, w - 4, 10);
  R(c, '#dce6df', center, bottom - 20, 1, 18);
  R(c, '#e3ca79', x + w - 3, bottom - 9, 1, 3);
  R(c, '#d2c5a8', x - 3, bottom - 1, w + 6, 1);
}
/** Rasterise locally available fonts once, then threshold alpha for a hard pixel edge. */
function label(c: C2D, text: string, center: number, y: number, color = ink): void {
  const [tmp, t] = makeCanvas(text.length * 11 + 4, 13);
  t.font = 'bold 10px sans-serif'; t.textBaseline = 'top'; t.fillStyle = '#fff'; t.fillText(text, 2, 1);
  const pixels = t.getImageData(0, 0, tmp.width, tmp.height).data;
  for (let yy = 0; yy < tmp.height; yy++) for (let xx = 0; xx < tmp.width; xx++) {
    if (pixels[(yy * tmp.width + xx) * 4 + 3] >= 100) R(c, color, Math.round(center - tmp.width / 2) + xx, y + yy, 1, 1);
  }
}
function roof(c: C2D, w: number, y: number, h: number, color: string): void {
  R(c, ink, 1, y + 4, w - 2, h);
  for (let row = 0; row < h - 2; row++) {
    const inset = Math.max(0, 5 - Math.floor(row / 2));
    R(c, color, 2 + inset, y + row, w - 4 - inset * 2, 1);
    if (row % 5 === 3) R(c, '#ffffff26', 3 + inset, y + row, w - 6 - inset * 2, 1);
    if (row % 5 === 4) for (let x = 6 + (Math.floor(row / 5) % 2) * 3; x < w - 4; x += 7) R(c, '#26384844', x, y + row - 3, 1, 4);
  }
  R(c, '#d0d7cd', 7, y, w - 14, 2); R(c, ink, 1, y + h - 1, w - 2, 3);
}

function building(c: C2D, o: ObjectDef, w: number, h: number): void {
  // Door centre follows the tile contract, including even-width houses.
  const center = (Math.floor(o.w / 2) + 0.5) * TILE;
  const style = o.style ?? '0', index = Number(style) || 0;
  const topColor = buildingRepresentativeColor(o)!;
  const wall = ['#ead9b8', '#e5d6c6', '#dadbc6', '#e3c8ac', '#dad9d4'][index % 5];
  box(c, 3, 5, w - 6, h - 5, wall);
  R(c, '#b5aa95', 4, h - 5, w - 8, 4); R(c, '#bcb19c', w - 8, 9, 4, h - 14);
  if (o.kind === 'house') {
    roof(c, w, 0, Math.floor(h * 0.43), topColor);
    const top = Math.floor(h * 0.43) + 6;
    for (let x = 12; x < w - 15; x += 24) glass(c, x, top, 16, 12);
    R(c, '#b6a58c', 5, h - 29, w - 10, 2);
    glass(c, 11, h - 22, 14, 12); glass(c, w - 25, h - 22, 14, 12);
    door(c, center, h); R(c, ink, center - 12, h - 26, 24, 3);
    R(c, '#a9b3ad', 7, h - 12, 8, 6); R(c, '#7e8c87', 8, h - 10, 6, 1);
    return;
  }
  if (o.kind === 'apartment') {
    box(c, 2, 0, w - 4, 16, topColor); box(c, 6, 3, w - 12, 9, '#dfe1d6');
    box(c, w - 26, 4, 14, 7, '#acb6b8');
    for (let y = 20; y < h - 22; y += 20) {
      for (let x = 10; x < w - 18; x += 20) glass(c, x, y, 14, 10);
      R(c, '#73818b', 6, y + 13, w - 12, 5); R(c, '#e5e5d8', 6, y + 12, w - 12, 1);
      for (let x = 8; x < w - 6; x += 4) R(c, '#c8d0c9', x, y + 13, 1, 4);
    }
    door(c, center, h); R(c, '#666e78', center - 17, h - 26, 34, 4);
    glass(c, 10, h - 20, 15, 12); return;
  }
  if (o.kind === 'shop') {
    const facades: Record<string, string> = { greengrocer: '#cbd3ad', bookstore: '#bc8d75', candy: '#e4c7b4', konbini: '#e8e7d9', bakery: '#e6c892', cafe: '#bca88d', pharmacy: '#d3dfc8' };
    box(c, 3, 5, w - 6, h - 5, facades[style] ?? wall);
    R(c, '#a89d86', 4, h - 4, w - 8, 3);
    if (style === 'bookstore') {
      for (let y = 18; y < h - 54; y += 5) {
        R(c, '#dfb69a', 5, y, w - 10, 1);
        for (let x = 8 + (y % 2) * 4; x < w - 5; x += 11) R(c, '#dfb69a', x, y - 4, 1, 4);
      }
    }
    if (style === 'bakery' || style === 'cafe') roof(c, w, 0, 17, topColor);
    else {
      box(c, 2, 1, w - 4, style === 'konbini' ? 9 : 15, topColor);
      if (style !== 'konbini') box(c, style === 'pharmacy' ? 9 : w - 26, 4, 16, 8, '#e3e5da');
    }
    const count = style === 'bookstore' || style === 'cafe' ? 2 : style === 'konbini' ? 4 : 3;
    const winWidth = count === 2 ? 23 : count === 4 ? 14 : 18;
    for (let i = 0; i < count; i++) {
      const x = Math.round(11 + i * (w - 22 - winWidth) / (count - 1));
      glass(c, x, 22, winWidth, style === 'cafe' ? 12 : 16, style === 'cafe');
      if (style === 'cafe') { R(c, wood, x - 3, 22, 3, 12); R(c, wood, x + winWidth, 22, 3, 12); }
    }
    const signs: Record<string, [string, string]> = {
      greengrocer: ['やおや', '#4b815e'], bookstore: ['ほん', '#527593'], candy: ['だがし', '#af645e'],
      konbini: ['コンビニ', '#488e92'], bakery: ['パン', '#ad8047'], cafe: ['カフェ', '#886951'], pharmacy: ['くすり', '#69835b'],
    };
    const [name, color] = signs[style] ?? ['おみせ', '#78847b'];
    box(c, 6, h - 54, w - 12, 16, '#fcf1d3'); label(c, name, w / 2, h - 53, color);
    if (style === 'konbini') { R(c, '#488e92', 5, h - 54, w - 10, 3); R(c, '#9ab56b', 5, h - 40, w - 10, 2); }
    for (let x = 4; x < w - 4; x += 6) {
      R(c, Math.floor((x - 4) / 6) % 2 ? '#f3e6c6' : color, x, h - 37, Math.min(6, w - 4 - x), 10);
      R(c, ink, x, h - 27, Math.min(6, w - 4 - x), 1);
    }
    glass(c, 9, h - 24, Math.max(15, center - 23), 19); glass(c, center + 12, h - 24, Math.max(12, w - center - 22), 19);
    door(c, center, h);
    if (style === 'greengrocer' || style === 'bakery') {
      for (let x = 10; x < center - 11; x += 8) { box(c, x, h - 8, 8, 6, wood); R(c, style === 'bakery' ? '#e7b765' : '#82a54b', x + 1, h - 9, 6, 3); }
    }
    if (style === 'bookstore') {
      box(c, w - 24, h - 15, 14, 13, wood);
      for (let x = w - 22; x < w - 12; x += 3) R(c, x % 2 ? '#7c9fa6' : '#e7cf9b', x, h - 13, 2, 9);
    }
    if (style === 'candy') for (let x = 14; x < center - 12; x += 9) { box(c, x, h - 13, 6, 10, '#d7dbbc'); R(c, '#c97b64', x + 1, h - 7, 4, 3); }
    return;
  }
  if (o.kind === 'school') {
    box(c, 1, 13, w - 2, 15, topColor);
    for (let y = 36; y < h - 23; y += 25) {
      R(c, '#bba98b', 5, y - 4, w - 10, 3);
      for (let x = 10; x < w - 19; x += 20) glass(c, x, y, 15, 15);
    }
    // Central two portal columns straddle w/2; their combined centre is w/2.
    box(c, w / 2 - 20, 3, 40, h - 4, '#ebdfbf'); box(c, w / 2 - 23, 0, 46, 7, '#b6c3c6');
    const cy = 24, cx = w / 2;
    for (let yy = -10; yy <= 10; yy++) for (let xx = -10; xx <= 10; xx++) {
      const d = xx * xx + yy * yy; if (d <= 100) R(c, d > 77 ? ink : '#fff3d6', cx + xx, cy + yy, 1, 1);
    }
    R(c, ink, cx, cy - 6, 1, 7); R(c, ink, cx, cy, 6, 1);
    glass(c, cx - 10, 45, 20, 16); door(c, cx, h, true);
    R(c, '#8c9b9d', cx - 25, h - 28, 50, 4); R(c, '#f4e7c6', cx - 24, h - 30, 48, 2); return;
  }
  if (o.kind === 'gym') {
    for (let x = 0; x < w; x++) {
      const curve = Math.round(18 * Math.sqrt(Math.max(0, 1 - ((x - w / 2) / (w / 2)) ** 2)));
      R(c, ink, x, 22 - curve, 1, 39 + curve);
      R(c, x % 9 === 0 ? '#a3beca' : topColor, x, 24 - curve, 1, 35 + curve);
    }
    R(c, '#e8daba', 4, 62, w - 8, h - 64);
    for (let x = 12; x < w - 15; x += 22) glass(c, x, 69, 16, 12);
    door(c, center, h, true); return;
  }
  if (o.kind === 'station') {
    roof(c, w, 0, 32, topColor);
    for (let x = 12; x < w - 18; x += 23) glass(c, x, 39, 17, 16, true);
    R(c, '#536678', 6, 59, w - 12, 4);
    for (let x = 13; x < w - 9; x += 39) R(c, '#c4bba1', x, 61, 4, h - 62);
    box(c, center - 25, 30, 50, 17, '#fbefcf'); label(c, 'えき', center, 32);
    door(c, center, h, true); return;
  }
  // Open wooden gazebo, with no opaque wall behind its posts.
  c.clearRect(0, 0, w, h);
  R(c, '#baa17c', 3, h - 6, w - 6, 5);
  for (const x of [9, w - 12]) { R(c, ink, x, 15, 4, h - 18); R(c, lightWood, x + 1, 15, 2, h - 19); }
  R(c, wood, 12, h - 13, w - 24, 4); roof(c, w, 1, 20, topColor);
}

function furnishing(c: C2D, kind: string, w: number, h: number): boolean {
  switch (kind) {
    case 'shopshelf':
      box(c, 0, 0, w, h, '#d8d6be');
      for (const y of [2, 8]) {
        R(c, '#776b57', 2, y + 4, w - 4, 2);
        for (let x = 3; x < w - 3; x += 4) { R(c, ['#c77d5a', '#d5b764', '#7b9b77', '#819ba7'][Math.floor(x / 4) % 4], x, y, 3, 4); R(c, '#f1dfaf', x + 1, y + 1, 1, 1); }
      }
      return true;
    case 'cooler':
      box(c, 0, 0, w, h, '#d6e2df');
      for (const x of [2, w / 2 + 1]) {
        box(c, x, 1, w / 2 - 3, h - 3, '#9ebfc2');
        for (let bx = x + 2; bx < x + w / 2 - 5; bx += 4) for (const y of [3, 8]) { R(c, '#668f86', bx, y, 2, 4); R(c, '#eddfaf', bx, y + 1, 2, 1); }
        R(c, '#f3ebc9', x + w / 2 - 6, 5, 1, 5);
      }
      R(c, '#6d888c', 1, h - 2, w - 2, 1); return true;
    case 'magazine':
      box(c, 0, 2, w, h - 2, wood);
      for (let x = 2; x < w - 3; x += 7) {
        box(c, x, 0, 6, 10, ['#d2b28c', '#8aadb0', '#c78c82', '#c2c38d'][Math.floor(x / 7) % 4]);
        R(c, '#f7e9c9', x + 1, 2, 4, 1); R(c, '#f7e9c9', x + 1, 5, 3, 3);
      }
      R(c, '#c49d6b', 0, 10, w, 2); return true;
    case 'counter':
      box(c, 0, 5, w, h - 5, '#b7baaa'); R(c, '#e1dfc6', 1, 5, w - 2, 3);
      R(c, '#74928d', 1, h - 4, w - 2, 3);
      box(c, w - 18, 0, 13, 7, '#667d82'); R(c, '#98bbbd', w - 16, 1, 8, 3);
      R(c, '#e7e4cd', w - 17, 7, 13, 3); R(c, '#4b6064', w - 14, 8, 6, 1);
      box(c, 5, 1, 7, 5, '#f0d7a2'); return true;
    case 'bed':
      box(c, 2, 1, w - 4, h - 2, wood); box(c, 4, 4, w - 8, h - 8, '#efe5ca');
      box(c, 7, 6, w - 14, 9, '#fff5dc', '#c7bba1'); R(c, '#698cab', 4, 18, w - 8, h - 23);
      for (let y = 21; y < h - 6; y += 7) R(c, '#92b2c4', 5, y, w - 10, 2); return true;
    case 'desk': case 'tdesk': case 'sdesk': case 'lowtable': case 'table': {
      const top = kind === 'sdesk' ? 2 : 1;
      R(c, ink, 3, h - 5, 3, 5); R(c, ink, w - 6, h - 5, 3, 5);
      box(c, 1, top, w - 2, h - 5, lightWood); R(c, '#e3ba7d', 3, top + 2, w - 6, 2);
      if (kind === 'lowtable') { box(c, w / 2 - 5, 3, 10, 7, '#30434f'); R(c, '#8dbfc7', w / 2 - 3, 4, 6, 4); }
      else if (kind === 'table') { box(c, w / 2 - 4, h / 2 - 4, 8, 8, '#f4e4bc'); R(c, '#5b8956', w / 2 - 2, h / 2 - 3, 4, 4); }
      else { R(c, '#f9edcc', 4, 3, kind === 'sdesk' ? 5 : 9, 5); R(c, '#5c7e88', 5, 5, 3, 1); }
      return true;
    }
    case 'bookshelf': case 'shelf':
      box(c, 0, 0, w, h - 1, wood);
      for (let y = 2; y < h - 3; y += 6) { for (let x = 2; x < w - 2; x += 3) R(c, ['#a85c54', '#d9b76e', '#769787', '#738ca2'][Math.floor(x / 3) % 4], x, y, 2, 4); R(c, '#dbb57c', 1, y + 4, w - 2, 1); } return true;
    case 'sofa':
      box(c, 1, 0, w - 2, h - 1, '#6e8972'); R(c, '#a4b39a', 4, 2, w - 8, 4);
      for (let x = 6; x < w - 6; x += 12) box(c, x, 7, 11, 7, '#8ca486', '#60786b');
      R(c, '#42574e', 1, 4, 4, 10); R(c, '#42574e', w - 5, 4, 4, 10); return true;
    case 'tv':
      box(c, 1, 10, w - 2, 6, wood); box(c, 4, 0, w - 8, 12, '#304754'); R(c, '#7a9fa6', 6, 2, w - 12, 6); R(c, '#aeccce', 7, 2, 6, 2); return true;
    case 'kitchen':
      box(c, 0, 0, w, h, '#d9d9c9'); R(c, '#aab9b7', 1, 1, w - 2, 6);
      box(c, 9, 1, 18, 5, '#657e88'); R(c, '#e2e4d6', 16, 0, 2, 4);
      for (const x of [42, 52]) box(c, x, 1, 7, 5, '#4c5558');
      for (let x = 4; x < w - 2; x += 15) { R(c, '#a6ac9e', x, 8, 1, 6); R(c, '#606f71', x + 4, 9, 5, 1); } return true;
    case 'fridge':
      box(c, 1, 0, w - 2, h, '#e5e7dd'); R(c, '#9dada8', 2, 6, w - 4, 1); R(c, '#5e7077', 11, 3, 1, 2); R(c, '#5e7077', 11, 9, 1, 4); return true;
    case 'toybox':
      box(c, 1, 4, w - 2, 11, '#bd7b58'); R(c, '#e2b875', 0, 3, w, 3); R(c, '#748da4', 3, 0, 4, 4); R(c, '#dcad5d', 9, 1, 4, 3); return true;
    case 'plant':
      box(c, 5, 9, 7, 7, '#b78058'); R(c, '#3f7653', 7, 3, 2, 8); R(c, '#639858', 2, 3, 6, 4); R(c, '#8fae64', 8, 0, 5, 4); R(c, '#487e51', 9, 5, 6, 4); return true;
    case 'rug':
      box(c, 0, 0, w, h, '#b88876', '#c5ac88'); box(c, 3, 3, w - 6, h - 6, '#cda28a', '#e1c39b');
      for (let x = 6; x < w - 4; x += 6) { R(c, '#ead2ad', x, 6, 2, 2); R(c, '#ead2ad', x, h - 8, 2, 2); } return true;
    case 'blackboard':
      box(c, 0, 0, w, h, '#355f50', wood); R(c, '#c6cbb1', 10, 4, 24, 1); R(c, '#c6cbb1', 12, 7, 16, 1);
      for (let x = 44; x < 76; x += 8) { R(c, '#aebfa6', x, 4, 5, 1); R(c, '#aebfa6', x + 2, 3, 1, 7); }
      R(c, '#d7b983', 0, h - 3, w, 3); R(c, '#f3edce', w - 19, h - 4, 5, 2); R(c, '#9f7162', w - 10, h - 5, 6, 3); return true;
    case 'window': glass(c, 1, 0, w - 2, h - 2); R(c, '#e9d4ab', 1, 0, 4, h - 1); R(c, '#e9d4ab', w - 5, 0, 4, h - 1); return true;
    default: return false;
  }
}

function prop(c: C2D, o: ObjectDef, w: number, h: number): void {
  if (furnishing(c, o.kind, w, h)) return;
  switch (o.kind) {
    case 'tree': {
      const cherry = o.style === 'cherry', dark = o.style === 'dark';
      R(c, '#344b3e55', 8, 34, 20, 5); R(c, '#5b4937', 15, 17, 5, 21); R(c, '#a18150', 16, 19, 2, 17);
      const colors = cherry ? ['#a76883', '#d88fa8', '#efb4c5', '#ffe0d9'] : dark ? ['#294c42', '#36654d', '#47795a', '#679466'] : ['#355f43', '#55854b', '#7d9d52', '#a5b869'];
      const leaf = (cx: number, cy: number, rx: number, ry: number, color: string) => {
        for (let dy = -ry; dy <= ry; dy++) {
          const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
          R(c, color, cx - dx, cy + dy, dx * 2 + 1, 1);
        }
      };
      leaf(17, 17, 15, 14, colors[0]);
      leaf(10, 13, 9, 9, colors[0]); leaf(23, 12, 9, 10, colors[0]); leaf(15, 8, 10, 8, colors[0]);
      leaf(17, 15, 13, 12, colors[1]); leaf(10, 12, 7, 7, colors[2]);
      leaf(16, 8, 8, 6, colors[2]); leaf(23, 12, 7, 7, colors[1]);
      leaf(11, 9, 5, 4, colors[3]); leaf(8, 16, 4, 4, colors[2]); leaf(19, 21, 6, 5, colors[1]);
      for (let n = 0; n < 40; n++) {
        const x = 4 + Math.floor(hash2(n, 3) * 26), y = 3 + Math.floor(hash2(n, 7) * 24);
        if (((x - 16) / 13) ** 2 + ((y - 14) / 12) ** 2 < 0.85) {
          R(c, colors[x + y < 29 ? 3 : 2], x, y, n % 3 === 0 ? 2 : 1, 1);
        }
      }
      return;
    }
    case 'bench':
      for (const x of [5, w - 8]) R(c, ink, x, 6, 3, 10);
      for (const y of [0, 4, 9]) { box(c, 1, y, w - 2, 4, lightWood, wood); } return;
    case 'lamp':
      R(c, ink, 7, 7, 3, h - 8); R(c, '#879998', 8, 8, 1, h - 10); R(c, ink, 4, h - 2, 9, 2);
      box(c, 3, 1, 11, 10, '#f8e4a1'); R(c, '#6b7a76', 2, 0, 13, 3); return;
    case 'vending':
      box(c, 1, 0, 14, 16, '#b5534c'); box(c, 3, 2, 10, 8, '#d9ded2');
      for (let x = 4; x <= 10; x += 3) for (const y of [3, 6]) R(c, x % 2 ? '#6b9a9c' : '#d6a85d', x, y, 2, 2);
      R(c, '#283d45', 4, 12, 7, 2); R(c, '#e7d698', 12, 10, 1, 2); return;
    case 'postbox':
      R(c, ink, 7, 8, 3, 8); box(c, 2, 0, 12, 11, '#b94e45'); R(c, '#f5dbbd', 5, 2, 6, 1); R(c, '#f5dbbd', 7, 3, 2, 3); R(c, '#402f32', 4, 7, 8, 1); return;
    case 'board':
      R(c, wood, 3, 7, 3, 9); R(c, wood, w - 6, 7, 3, 9); box(c, 1, 0, w - 2, 13, '#697f69', wood);
      for (const x of [5, 14, 22]) { R(c, '#f4e4bb', x, 3, 5, 7); R(c, '#aa8a73', x + 1, 5, 3, 1); } return;
    case 'busstop':
      R(c, '#657a7b', 7, 8, 2, 8); box(c, 2, 0, 12, 9, '#f0e6bf', '#527d8b'); R(c, '#b66752', 4, 2, 8, 2); R(c, '#6b8a92', 5, 6, 6, 1); R(c, ink, 4, 15, 8, 1); return;
    case 'car': {
      const color = ['#dddcc5', '#6b91a9', '#b56d5a', '#7e9290'][(Number(o.style) || 0) % 4];
      R(c, ink, 4, 0, 6, 3); R(c, ink, w - 10, 0, 6, 3); R(c, ink, 4, 13, 6, 3); R(c, ink, w - 10, 13, 6, 3);
      box(c, 0, 2, w, 12, color); box(c, 10, 3, 13, 10, '#78a4b2'); R(c, color, 13, 3, 6, 10);
      R(c, '#fff1b4', w - 2, 4, 1, 3); R(c, '#fff1b4', w - 2, 10, 1, 2); R(c, '#bc5b50', 1, 4, 1, 3); return;
    }
    case 'slide':
      R(c, ink, 3, 8, 3, h - 8); R(c, ink, 12, 8, 3, h - 8);
      R(c, '#d6b768', 4, 9, 1, h - 9); R(c, '#d6b768', 13, 9, 1, h - 9);
      for (let y = 15; y < h; y += 5) R(c, '#d5cda3', 6, y, 6, 2);
      box(c, 3, 7, 19, 5, '#dbb96b');
      R(c, '#b66b50', 4, 0, 2, 8); R(c, '#b66b50', 18, 0, 2, 8); R(c, '#b66b50', 4, 0, 16, 2);
      for (let y = 11; y < h - 1; y++) {
        const x = 15 + Math.floor((y - 11) / 2);
        R(c, ink, x, y, 8, 1); R(c, '#438cac', x + 1, y, 6, 1); R(c, '#a9d5d6', x + 2, y, 3, 1);
      }
      R(c, '#7db3bd', 23, h - 2, 8, 2); return;
    case 'swing':
      R(c, '#926b4d', 2, 0, w - 4, 3);
      for (const x of [3, w - 6]) R(c, '#5e7e78', x, 3, 3, h - 3);
      for (const x of [12, 29]) { R(c, '#b4bcb0', x, 3, 1, 8); R(c, '#b4bcb0', x + 6, 3, 1, 8); box(c, x - 2, 11, 11, 4, lightWood); } return;
    case 'goal':
      R(c, '#eff0d3', 1, 0, 3, h); R(c, '#eff0d3', 3, 0, w - 4, 2); R(c, '#eff0d3', w - 3, 1, 2, h - 2);
      for (let y = 4; y < h; y += 4) R(c, '#e8e6cb', 4, y, w - 7, 1);
      for (let x = 5; x < w - 3; x += 4) R(c, '#e8e6cb', x, 2, 1, h - 3); return;
    case 'train':
      for (let x = 0; x < w; x += 64) {
        const cw = Math.min(62, w - x); box(c, x, 1, cw, h - 2, '#e2e0cd'); R(c, '#70939c', x + 3, 2, cw - 6, 4);
        R(c, '#587c9e', x + 1, h - 11, cw - 2, 5);
        for (let wx = x + 5; wx < x + cw - 8; wx += 12) glass(c, wx, 9, 9, 9, true);
        R(c, ink, x + 8, h - 3, 9, 3); R(c, ink, x + cw - 18, h - 3, 9, 3);
      } return;
    case 'track': {
      // Pixel-rounded concentric lanes; unpainted middle reveals the school dirt.
      const radius = Math.floor(h / 2) - 5;
      for (let lane = 0; lane < 3; lane++) {
        const r = radius - lane * 7;
        for (let i = 0; i <= r * 4; i++) {
          const angle = -Math.PI / 2 + Math.PI * i / (r * 4);
          const dx = Math.round(r * Math.cos(angle)), dy = Math.round(r * Math.sin(angle));
          R(c, '#f7e9c3', radius + 5 - dx, h / 2 + dy, 1, 1); R(c, '#f7e9c3', w - radius - 6 + dx, h / 2 + dy, 1, 1);
        }
        R(c, '#f7e9c3', radius + 5, h / 2 - r, w - radius * 2 - 10, 1); R(c, '#f7e9c3', radius + 5, h / 2 + r, w - radius * 2 - 10, 1);
      }
      R(c, '#f7e9c3', w / 2 + 28, 5, 1, 15); return;
    }
    case 'flowerbed':
      box(c, 0, 0, w, h, '#736e48', '#ad8966');
      for (let x = 3; x < w - 2; x += 5) for (const y of [3, 9]) { R(c, '#6c9352', x, y + 2, 3, 3); R(c, (x + y) % 2 ? '#e6b17e' : '#f0d7b4', x, y, 3, 2); } return;
    default: box(c, 3, 4, Math.max(3, w - 6), Math.max(3, h - 8), '#939b8a', '#747d72');
  }
}

export function objectSprite(o: ObjectDef): Sprite {
  const key = JSON.stringify([o.kind, o.w, o.h, o.style ?? '']);
  const cached = objects.get(key); if (cached) return cached;
  const tree = o.kind === 'tree', lamp = o.kind === 'lamp';
  const w = o.w * TILE, h = o.h * TILE;
  const [canvas, c] = makeCanvas(tree ? 34 : w, tree ? 40 : lamp ? h + 20 : h);
  if (buildingRepresentativeColor(o)) building(c, o, w, h);
  else prop(c, o, w, lamp ? h + 20 : h);
  const sprite = { canvas, ox: tree ? -9 : 0, oy: tree ? -24 : lamp ? -20 : 0 };
  objects.set(key, sprite); return sprite;
}

interface Costume { hair: string; coat: string; pants: string; skin: string; adult?: boolean; hat?: string }
const costumes: Record<string, Costume> = {
  mother: { hair: '#5d4438', coat: '#c98178', pants: '#6c7f91', skin: '#edbe98', adult: true },
  grandma: { hair: '#b5b4a6', coat: '#9986a2', pants: '#6b697b', skin: '#e5bb95', adult: true },
  friend: { hair: '#5f493b', coat: '#be7756', pants: '#6c8c87', skin: '#edc49c' },
  guard: { hair: '#7c7770', coat: '#c6b85b', pants: '#62717b', skin: '#dfb48f', adult: true, hat: '#cfb666' },
  shopkeeper: { hair: '#51453d', coat: '#749e88', pants: '#7b6a5c', skin: '#e4b78c', adult: true },
  staff: { hair: '#47423d', coat: '#566a86', pants: '#485b74', skin: '#e4bd97', adult: true, hat: '#4b617c' },
  teacher: { hair: '#605044', coat: '#b69e78', pants: '#687781', skin: '#e7bf99', adult: true },
  classmate: { hair: '#665145', coat: '#b19a62', pants: '#6d8798', skin: '#edc49a' },
  clerk: { hair: '#615046', coat: '#70a28d', pants: '#627580', skin: '#edc29a', adult: true },
};

function drawCharacter(name: string, facing: Facing, frame: 0 | 1 | 2): Sprite {
  const [canvas, c] = makeCanvas(18, 26);
  const side = facing === 'left' || facing === 'right', back = facing === 'up';
  // Drawing in a right-facing coordinate system gives genuinely mirrored profiles.
  if (facing === 'left') { c.translate(18, 0); c.scale(-1, 1); }
  const step = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  if (name === 'cat') {
    box(c, 3, 15, 12, 7, '#c99c6c'); box(c, side ? 10 : 4, 11, 8, 8, '#dbb385');
    R(c, ink, side ? 10 : 4, 9, 2, 4); R(c, ink, side ? 16 : 10, 9, 2, 4);
    if (!back) { R(c, ink, side ? 15 : 6, 14, 1, 1); if (!side) R(c, ink, 10, 14, 1, 1); R(c, '#a66b60', side ? 17 : 8, 16, 1, 1); }
    R(c, '#8c6e52', 1, 13, 2, 7); R(c, ink, 4, 21 + step, 3, 2); R(c, ink, 12, 21 - step, 3, 2);
  } else {
    const p = { ...(costumes[name] ?? { hair: '#777466', coat: '#8d9885', pants: '#6b766b', skin: '#dbb793' }) };
    const top = p.adult ? 0 : 2, headX = side ? 6 : 4, headW = side ? 8 : 10;
    const armLeft = side ? 10 : 2, armRight = 14;
    // Dark outline remains continuous on grass, pavement and indoor floors.
    box(c, side ? 6 : 4, 12, side ? 7 : 10, 9, p.coat);
    if (name === 'mother' || name === 'grandma') box(c, 4, 18, 10, 5, p.pants);
    else { R(c, p.pants, 5, 20, 3, 3); R(c, p.pants, 10, 20, 3, 3); }
    R(c, ink, 4, 23 + step, 4, 2); R(c, ink, side ? 9 : 10, 23 - step, 4, 2);
    if (!p.adult) { R(c, p.skin, 5, 22 + step, 2, 1); R(c, p.skin, 11, 22 - step, 2, 1); }
    R(c, '#dce0ce', 5, 23 + step, 2, 1); R(c, '#dce0ce', 11, 23 - step, 2, 1);
    if (name === 'shopkeeper') { R(c, '#e1ddbe', 6, 15, 6, 6); R(c, '#b8c1a3', 7, 18, 4, 2); }
    R(c, ink, armLeft, 15 - step, 3, 6); R(c, p.coat, armLeft + 1, 15 - step, 2, 4);
    R(c, p.skin, armLeft + 1, 19 - step, 2, 2);
    if (!side) { R(c, ink, armRight, 15 + step, 2, 6); R(c, p.coat, armRight, 15 + step, 1, 4); R(c, p.skin, armRight, 19 + step, 1, 2); }
    if (name === 'clerk') { R(c, '#e9e6cd', 5, 14, 8, 2); if (!side && !back) R(c, '#4b7075', 11, 16, 2, 2); }
    box(c, headX, top + 1, headW, 11, p.skin);
    R(c, p.hair, headX + 1, top, headW - 2, 5); R(c, ink, headX + 2, top - 1 + 1, headW - 4, 1);
    R(c, p.hair, headX, top + 3, side ? 3 : 2, 5);
    if (back) { R(c, p.hair, headX + 1, top + 4, headW - 2, 5); R(c, '#ffffff1a', headX + 2, top + 2, 4, 1); }
    else {
      R(c, '#f8d5a6', headX + 3, top + 5, Math.min(side ? 4 : 5, headW - 4), 2);
      R(c, ink, side ? 12 : 7, top + 7, 1, 2); if (!side) R(c, ink, 11, top + 7, 1, 2);
      R(c, '#be8465', side ? 13 : 9, top + 10, 1, 1); if (side) R(c, p.skin, 14, top + 8, 1, 2);
    }
    if (p.hat) { box(c, headX - 1, top, headW + 2, 4, p.hat); R(c, '#d9caa1', headX, top + 3, headW + (side ? 3 : 0), 1); }
    if (name === 'grandma') box(c, back ? 11 : 3, top, 4, 4, p.hair);
    if (name === 'mother') R(c, p.hair, side ? 5 : 4, top + 8, side ? 3 : 2, 6);
  }
  const sprite = { canvas, ox: -9, oy: -26 };
  return sprite;
}

export function playerSprite(a: PlayerAppearance, facing: Facing, frame: 0 | 1 | 2): Sprite {
  const normalized = normalizeAppearance(a), key = appearanceKey(normalized);
  let frames = avatars.get(key);
  if (frames) avatars.delete(key);
  else frames = new Map<string, Sprite>();
  avatars.set(key, frames);
  if (avatars.size > 8) avatars.delete(avatars.keys().next().value!);
  const frameKey = `${facing}:${frame}`;
  let sprite = frames.get(frameKey);
  if (!sprite) {
    const [canvas, c] = makeCanvas(PLAYER_W, PLAYER_H);
    drawPlayer(c, normalized, facing, frame);
    sprite = { canvas, ox: -PLAYER_W / 2, oy: -PLAYER_H };
    frames.set(frameKey, sprite);
  }
  return sprite;
}

export function characterSprite(name: string, facing: Facing, frame: 0 | 1 | 2): Sprite {
  if (name === 'player') return playerSprite(DEFAULT_APPEARANCE, facing, frame);
  const key = JSON.stringify([name, facing, frame]);
  let sprite = people.get(key);
  if (!sprite) { sprite = drawCharacter(name, facing, frame); people.set(key, sprite); }
  return sprite;
}
