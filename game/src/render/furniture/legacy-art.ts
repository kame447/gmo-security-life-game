import { TILE, type Facing } from '../../core/coords';
import type { ObjectDef } from '../../core/types';
import { makeCanvas, R, type C2D } from '../draw';
import type { Sprite } from '../sprites';

const ink = '#39414a', wood = '#926442', lightWood = '#c79560';
type Brush = (color: string, x: number, y: number, w?: number, h?: number) => void;
const sideways = (facing: Facing) => facing === 'left' || facing === 'right';

function brush(c: C2D, width: number, mirror = false): Brush {
  return (color, x, y, w = 1, h = 1) => R(c, color, mirror ? width - x - w : x, y, w, h);
}
function box(r: Brush, x: number, y: number, w: number, h: number, color: string, edge = ink): void {
  r(edge, x, y, w, h);
  r(color, x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
}

const cache = new Map<string, Sprite>();

function drawShopshelf(r: Brush, facing: Facing, w: number, h: number): void {
  box(r, 0, 0, w, h, '#d8d6be');
  if (facing === 'up') {
    r('#b7b59e', 1, 3, w - 2, h - 5);
    for (let x = 8; x < w - 4; x += 8) r('#918f78', x, 3, 1, h - 5);
    r('#776b57', 1, h - 2, w - 2, 1);
    return;
  }
  r('#b7b59e', w - 5, 1, 4, h - 2);
  r('#776b57', w - 5, 1, 1, h - 2);
  const goods = ['#c77d5a', '#d5b764', '#7b9b77', '#819ba7'];
  for (let y = 3; y < h - 4; y += 6) {
    r('#776b57', 2, y + 4, Math.max(2, w - 7), 1);
    for (let bx = 2; bx < w - 8; bx += 4) {
      r(goods[(Math.floor(y / 6) + Math.floor(bx / 4)) % 4], bx, y, 3, 4);
      r('#f1dfaf', bx + 1, y + 1, 1, 1);
    }
  }
}

function drawCooler(r: Brush, facing: Facing, w: number, h: number): void {
  box(r, 0, 0, w, h, '#d6e2df');
  if (facing === 'up') {
    r('#b9c6c4', 1, 3, w - 2, h - 5);
    for (let x = 4; x < w - 4; x += 2) r('#6d888c', x, 4, 1, Math.max(2, h - 10));
    box(r, 3, h - 6, w - 6, 4, '#8ea1a3');
    r('#506468', 5, h - 5, 6, 2);
    return;
  }
  r('#b9c6c4', 8, 1, w - 9, h - 2);
  box(r, 1, 2, 7, h - 4, '#9ebfc2');
  for (let y = 4; y < h - 5; y += 6) {
    for (const bx of [2, 5]) { r('#668f86', bx, y, 2, 4); r('#eddfaf', bx, y + 1, 2, 1); }
  }
  r('#f3ebc9', 2, Math.floor(h / 2) - 3, 1, 6);
  for (let vx = 10; vx < w - 2; vx += 2) r('#6d888c', vx, h - 6, 1, 3);
  r('#6d888c', 1, h - 2, w - 2, 1);
}

function drawMagazine(r: Brush, facing: Facing, w: number, h: number): void {
  if (facing === 'up') {
    box(r, 0, 0, w, h, wood);
    r('#c49d6b', 1, 1, w - 2, 2);
    r('#775035', 2, Math.floor(h / 2), w - 4, 2);
    return;
  }
  box(r, 9, 0, w - 9, h, wood);
  r('#c49d6b', 9, 1, 2, h - 2);
  const covers = ['#d2b28c', '#8aadb0', '#c78c82', '#c2c38d'];
  for (let y = 2; y < h - 5; y += 7) {
    box(r, 1, y, 8, 6, covers[Math.floor(y / 7) % 4]);
    r('#f7e9c9', 2, y + 1, 1, 4);
    r('#f7e9c9', 5, y + 1, 2, 3);
  }
  r('#c49d6b', 0, 0, 2, h);
}

function drawCounter(r: Brush, facing: Facing, w: number, h: number): void {
  if (facing === 'up') {
    box(r, 0, 0, w, h - 2, '#b7baaa');
    r('#e1dfc6', 1, 1, w - 2, 5);
    r('#74928d', 1, 7, w - 2, h - 9);
    for (let x = 4; x < w - 18; x += 10) {
      box(r, x, 8, 8, 5, '#8ca09c');
      r('#4b6064', x + 3, 9, 2, 1);
    }
    box(r, 5, 1, 13, 6, '#506468');
    r('#4b6064', 7, 3, 7, 2);
    box(r, w - 12, 1, 7, 5, '#f0d7a2');
    return;
  }
  box(r, 0, 0, w, h, '#b7baaa');
  r('#74928d', 1, 1, 3, h - 2);
  r('#e1dfc6', 4, 1, w - 5, h - 2);
  box(r, 5, 4, 5, 7, '#f0d7a2');
  box(r, 6, h - 18, 7, 13, '#667d82');
  r('#98bbbd', 7, h - 16, 3, 8);
  r('#e7e4cd', 2, h - 17, 4, 13);
  r('#4b6064', 3, h - 14, 1, 6);
}

function drawDeskFamily(r: Brush, facing: Facing, kind: string, w: number, h: number): void {
  const sdesk = kind === 'sdesk';
  if (facing === 'up') {
    const top = sdesk ? 2 : 1;
    r(ink, 2, h - 5, 2, 5); r(ink, w - 4, h - 5, 2, 5);
    r(wood, 2, h - 6, w - 4, 5);
    box(r, 1, top, w - 2, h - 6, lightWood);
    r(wood, 2, top + 1, w - 4, 1);
    r('#e3ba7d', 3, h - 7, w - 6, 1);
    if (kind === 'lowtable') { box(r, Math.floor(w / 2) - 5, 3, 10, 6, '#30434f'); r('#8dbfc7', Math.floor(w / 2) - 3, 4, 6, 3); }
    else if (kind === 'table') { box(r, Math.floor(w / 2) - 4, Math.floor(h / 2) - 4, 8, 8, '#f4e4bc'); r('#5b8956', Math.floor(w / 2) - 2, Math.floor(h / 2) - 3, 4, 4); }
    else { r('#f9edcc', w - (sdesk ? 9 : 13), 2, sdesk ? 5 : 9, 4); r('#5c7e88', w - (sdesk ? 8 : 11), 3, 3, 1); }
    return;
  }
  r(ink, 2, h - 5, 3, 5); r(ink, w - 5, h - 5, 3, 5);
  r(wood, w - 5, 2, 3, h - 6);
  box(r, 1, 1, w - 3, h - 5, lightWood);
  r('#e3ba7d', 3, 2, 2, h - 8);
  if (kind === 'lowtable') { box(r, 3, Math.floor(h / 2) - 5, 7, 10, '#30434f'); r('#8dbfc7', 4, Math.floor(h / 2) - 3, 4, 6); }
  else if (kind === 'table') { box(r, 6, Math.floor(h / 2) - 4, 8, 8, '#f4e4bc'); r('#5b8956', 8, Math.floor(h / 2) - 2, 4, 4); }
  else { r('#f9edcc', 3, 4, 5, sdesk ? 6 : 10); r('#5c7e88', 5, 6, 1, 4); }
}

function drawShelf(r: Brush, facing: Facing, w: number, h: number): void {
  const colors = ['#a85c54', '#d9b76e', '#769787', '#738ca2'];
  if (facing === 'up') {
    box(r, 0, 0, w, h - 1, wood);
    r('#dbb57c', 1, 1, w - 2, 2);
    for (let x = 6; x < w - 4; x += 6) r('#775035', x, 3, 1, h - 5);
    r(ink, 2, h - 1, 3, 1); r(ink, w - 5, h - 1, 3, 1);
    return;
  }
  box(r, 0, 0, w, h - 1, wood);
  r('#775035', w - 5, 1, 4, h - 3);
  for (let y = 2; y < h - 4; y += 6) {
    for (let x = 2; x < w - 6; x += 3) r(colors[Math.floor(x / 3) % 4], x, y, 2, 4);
    r('#dbb57c', 1, y + 4, w - 6, 1);
  }
}

function drawBench(r: Brush, facing: Facing, w: number, h: number): void {
  if (facing === 'up') {
    for (const x of [4, w - 7]) r(ink, x, 1, 3, h - 1);
    for (const y of [2, 6]) box(r, 1, y, w - 2, 4, wood, ink);
    r(lightWood, 2, 10, w - 4, 3);
    return;
  }
  for (const y of [4, h - 7]) r(ink, 2, y, w - 4, 3);
  box(r, w - 5, 1, 4, h - 2, wood);
  box(r, 2, 1, 8, h - 2, lightWood, wood);
  r(wood, 6, 2, 1, h - 4);
}

function drawBed(r: Brush, facing: Facing, w: number, h: number): void {
  if (facing === 'up') {
    box(r, 2, 1, w - 4, h - 2, wood); box(r, 4, 4, w - 8, h - 8, '#efe5ca');
    r('#698cab', 4, 4, w - 8, h - 22);
    for (let y = 7; y < h - 20; y += 7) r('#92b2c4', 5, y, w - 10, 2);
    box(r, 7, h - 16, w - 14, 9, '#fff5dc', '#c7bba1');
    box(r, 2, h - 6, w - 4, 5, wood);
    return;
  }
  box(r, 1, 2, w - 2, h - 4, wood); box(r, 4, 4, w - 8, h - 8, '#efe5ca');
  box(r, w - 15, 7, 9, h - 14, '#fff5dc', '#c7bba1');
  r('#698cab', 5, 4, Math.max(4, w - 22), h - 8);
  for (let x = 8; x < w - 20; x += 7) r('#92b2c4', x, 5, 2, h - 10);
}

function drawSofa(r: Brush, facing: Facing, w: number, h: number): void {
  if (facing === 'up') {
    box(r, 1, 0, w - 2, h - 1, '#6e8972');
    r('#a4b39a', 3, 2, w - 6, 3);
    r('#42574e', 2, 6, w - 4, h - 8);
    r('#60786b', 4, h - 3, w - 8, 2);
    return;
  }
  box(r, 1, 1, w - 2, h - 2, '#6e8972');
  r('#a4b39a', w - 5, 4, 3, h - 8);
  for (let y = 5; y < h - 6; y += 11) box(r, 2, y, w - 8, 10, '#8ca486', '#60786b');
  r('#42574e', 3, 1, w - 6, 4); r('#42574e', 3, h - 5, w - 6, 4);
}

function drawTv(r: Brush, facing: Facing, w: number, h: number): void {
  if (facing === 'up') {
    box(r, 1, 10, w - 2, 6, wood);
    box(r, 4, 0, w - 8, 12, '#304754');
    r('#4b6064', 7, 3, w - 14, 5);
    return;
  }
  box(r, 3, 2, w - 6, h - 4, wood);
  box(r, 5, Math.floor(h / 2) - 7, 6, 14, '#304754');
  r('#7a9fa6', 5, Math.floor(h / 2) - 5, 2, 10);
}

function drawKitchen(r: Brush, facing: Facing, w: number, h: number): void {
  box(r, 0, 0, w, h, '#d9d9c9');
  if (facing === 'up') {
    r('#aab9b7', 1, 1, w - 2, 5);
    r('#c0c2b4', 1, 7, w - 2, h - 8);
    r('#e2e4d6', w - 18, 0, 2, 4);
    for (let x = 6; x < w - 4; x += 14) r('#a6ac9e', x, 8, 1, 6);
    return;
  }
  r('#aab9b7', 2, 1, w - 4, h - 2);
  box(r, 2, 9, 5, 18, '#657e88'); r('#e2e4d6', 7, 16, 4, 2);
  for (const y of [42, 52]) if (y + 7 < h) box(r, 2, y, 5, 7, '#4c5558');
  r('#a6ac9e', 1, 2, 1, h - 4);
}

function drawFridge(r: Brush, facing: Facing, w: number, h: number): void {
  box(r, 1, 0, w - 2, h, '#e5e7dd');
  if (facing === 'up') {
    r('#cfd4cc', 2, 1, w - 4, h - 2);
    for (let y = 3; y < h - 4; y += 3) r('#5e7077', 3, y, w - 6, 1);
    return;
  }
  r('#cfd4cc', 5, 1, w - 7, h - 2);
  r('#9dada8', 2, 6, 4, 1);
  r('#5e7077', 2, 3, 1, 2); r('#5e7077', 2, 9, 1, 4);
}

function drawToybox(r: Brush, facing: Facing, w: number, h: number): void {
  if (facing === 'up') {
    box(r, 1, 3, w - 2, h - 4, '#bd7b58');
    r('#926442', 2, 4, w - 4, 2);
    r('#5e7077', 3, 5, 2, 3); r('#5e7077', w - 5, 5, 2, 3);
    return;
  }
  box(r, 1, 4, w - 2, h - 5, '#bd7b58');
  r('#e2b875', w - 4, 3, 3, h - 5);
  r('#748da4', 2, 1, 4, 4); r('#dcad5d', 6, 2, 4, 3);
}

function drawPlant(r: Brush, facing: Facing): void {
  box(r, 5, 9, 7, 7, '#b78058');
  if (facing === 'up') {
    r('#487e51', 2, 4, 6, 4); r('#639858', 8, 1, 5, 4); r('#3f7653', 7, 3, 2, 8);
    return;
  }
  r('#3f7653', 8, 3, 2, 8); r('#639858', 1, 3, 7, 4); r('#8fae64', 5, 0, 5, 4);
}

function drawRug(r: Brush, w: number, h: number): void {
  box(r, 0, 0, w, h, '#b88876', '#c5ac88');
  box(r, 3, 3, w - 6, h - 6, '#cda28a', '#e1c39b');
  for (let y = 6; y < h - 4; y += 6) {
    r('#ead2ad', 6, y, 2, 2);
    r('#ead2ad', w - 8, y, 2, 2);
  }
}

export function legacyFurnitureSprite(o: ObjectDef): Sprite | undefined {
  if (o.catalogId || !o.facing || o.facing === 'down') return undefined;
  const facing = o.facing;
  const w = o.w * TILE, h = o.h * TILE;
  const key = JSON.stringify([o.kind, facing, o.w, o.h, o.style ?? '']);
  const cached = cache.get(key);
  if (cached) return cached;
  const [canvas, c] = makeCanvas(w, h);
  const r = brush(c, w, facing === 'right');
  let drawn = true;
  switch (o.kind) {
    case 'shopshelf': drawShopshelf(r, facing, w, h); break;
    case 'cooler': drawCooler(r, facing, w, h); break;
    case 'magazine': drawMagazine(r, facing, w, h); break;
    case 'counter': drawCounter(r, facing, w, h); break;
    case 'desk': case 'tdesk': case 'sdesk': case 'lowtable': case 'table':
      drawDeskFamily(r, facing, o.kind, w, h); break;
    case 'bookshelf': case 'shelf': drawShelf(r, facing, w, h); break;
    case 'bench': drawBench(r, facing, w, h); break;
    case 'bed': drawBed(r, facing, w, h); break;
    case 'sofa': drawSofa(r, facing, w, h); break;
    case 'tv': drawTv(r, facing, w, h); break;
    case 'kitchen': drawKitchen(r, facing, w, h); break;
    case 'fridge': drawFridge(r, facing, w, h); break;
    case 'toybox': drawToybox(r, facing, w, h); break;
    case 'plant': drawPlant(r, facing); break;
    case 'rug': if (sideways(facing)) drawRug(r, w, h); else drawn = false; break;
    default: drawn = false; break;
  }
  if (!drawn) return undefined;
  const sprite = { canvas, ox: 0, oy: 0 };
  cache.set(key, sprite);
  return sprite;
}
