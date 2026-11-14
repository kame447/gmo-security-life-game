import { TILE, type Facing } from '../../core/coords';
import { R, type C2D } from '../draw';
import type { FurnitureVariant } from './catalog';

const ink = '#39414a', wood = '#926442', timber = '#c79560', lightWood = '#e3ba7d';
const white = '#e5e7dd', cream = '#efe5ca', bright = '#fff5dc';
const steel = '#9ebfc2', metal = '#657e88', darkMetal = '#304754';
type Brush = (color: string, x: number, y: number, w?: number, h?: number) => void;
const sideways = (facing: Facing) => facing === 'left' || facing === 'right';
function brush(c: C2D, width: number, mirror = false): Brush {
  return (color, x, y, w = 1, h = 1) => R(c, color, mirror ? width - x - w : x, y, w, h);
}
function box(r: Brush, color: string, x: number, y: number, w: number, h: number, edge = ink): void {
  r(edge, x, y, w, h); r(color, x + 1, y + 1, w - 2, h - 2);
}
function contact(r: Brush, w: number, h: number): void { r('#00000026', 2, h - 1, w - 4, 1); }
function grain(r: Brush, x: number, y: number, w: number, h: number): void {
  for (let yy = y; yy < y + h; yy += 4) {
    r(wood, x + (yy % 3), yy, Math.max(1, w - 4), 1);
    r(lightWood, x + 1, yy + 1, Math.max(1, w - 7), 1);
  }
}

function table(r: Brush, facing: Facing, dining: boolean): void {
  const side = sideways(facing), w = side ? 16 : 32, h = dining || side ? 32 : 16;
  contact(r, w, h);
  r(ink, 3, h - 7, 3, 6); r(ink, w - 6, h - 7, 3, 6);
  r(timber, 4, h - 7, 1, 5); r(wood, w - 5, h - 7, 1, 5);
  box(r, timber, 1, 1, w - 2, h - 6);
  r(lightWood, 3, 2, w - 6, 2); r(wood, 2, h - 8, w - 4, 1);
  grain(r, 4, 5, w - 8, h - 15);
}

function desk(r: Brush, facing: Facing): void {
  const side = sideways(facing); contact(r, side ? 16 : 32, side ? 48 : 32);
  if (side) {
    box(r, wood, 11, 3, 4, 37); r(lightWood, 12, 4, 1, 30);
    box(r, timber, 1, 11, 11, 27); r(lightWood, 2, 12, 8, 1);
    box(r, wood, 8, 30, 6, 17); r(timber, 9, 31, 3, 6); r(timber, 9, 39, 3, 6);
    r(ink, 10, 34, 2, 1); r(ink, 10, 42, 2, 1);
    r(ink, 2, 38, 3, 9); r(timber, 3, 38, 1, 8);
    box(r, cream, 3, 16, 6, 8); r(bright, 4, 17, 3, 5); r(metal, 4, 19, 3, 1);
    return;
  }
  box(r, wood, 2, 4, 28, 7); r(lightWood, 3, 5, 25, 1);
  box(r, timber, 1, 11, 30, 10); r(lightWood, 2, 12, 28, 2);
  r(wood, 2, 19, 28, 1);
  if (facing === 'down') {
    box(r, cream, 5, 14, 9, 5); r(bright, 6, 15, 6, 2); r(metal, 7, 16, 3, 1);
    box(r, wood, 19, 21, 10, 10);
    r(timber, 20, 22, 8, 3); r(timber, 20, 27, 8, 3); r(ink, 23, 23, 3, 1); r(ink, 23, 28, 3, 1);
    r(ink, 3, 21, 3, 10); r(timber, 4, 21, 1, 9);
  } else {
    box(r, wood, 3, 21, 26, 8); r(timber, 5, 22, 22, 5); r(wood, 15, 22, 1, 5);
    r(ink, 3, 29, 3, 2); r(ink, 26, 29, 3, 2);
  }
}

function bed(r: Brush, facing: Facing): void {
  const side = sideways(facing); contact(r, side ? 48 : 32, side ? 32 : 48);
  if (side) {
    box(r, wood, 1, 2, 46, 28); r(lightWood, 2, 3, 43, 1);
    box(r, cream, 3, 4, 39, 24); r(bright, 4, 5, 36, 2);
    box(r, '#c7bba1', 29, 7, 11, 18); r(bright, 30, 8, 8, 15);
    box(r, '#698cab', 4, 4, 25, 24, '#4f7089');
    for (let x = 7; x < 28; x += 7) r('#92b2c4', x, 6, 2, 20);
    box(r, timber, 40, 1, 7, 29); r(lightWood, 41, 2, 4, 1); r(wood, 44, 4, 1, 24);
    r(ink, 4, 30, 3, 1); r(ink, 41, 30, 3, 1);
    return;
  }
  box(r, wood, 2, 1, 28, 45); r(lightWood, 3, 2, 25, 1);
  box(r, cream, 4, 5, 24, 37); r(bright, 5, 6, 21, 2);
  const pillowY = facing === 'down' ? 8 : 30, blanketY = facing === 'down' ? 19 : 5;
  box(r, '#c7bba1', 7, pillowY, 18, 9); r(bright, 8, pillowY + 1, 15, 6);
  box(r, '#698cab', 4, blanketY, 24, 23, '#4f7089');
  for (let y = blanketY + 3; y < blanketY + 21; y += 7) r('#92b2c4', 6, y, 20, 2);
  const headY = facing === 'down' ? 0 : 40;
  box(r, timber, 1, headY, 30, 7); r(lightWood, 2, headY + 1, 27, 1);
  r(wood, 5, headY + 3, 22, 1); r(ink, 4, 46, 3, 1); r(ink, 25, 46, 3, 1);
}

function bookshelf(r: Brush, facing: Facing): void {
  contact(r, 16, 32); box(r, wood, 1, 3, 14, 27); r(lightWood, 2, 4, 11, 1);
  if (facing === 'up') {
    r(timber, 3, 6, 9, 22); r(wood, 7, 6, 1, 22);
    for (const y of [10, 22]) { r(lightWood, 3, y, 9, 1); r(wood, 3, y + 1, 9, 1); }
  } else {
    const frontW = sideways(facing) ? 8 : 12;
    r(ink, 2, 6, frontW, 21);
    for (const y of [7, 18]) {
      for (let x = 3, i = 0; x < frontW + 1; x += 3, i++) {
        r(['#b94e45', '#d9b76e', '#698cab', '#8ca486'][i % 4], x, y + (i % 2), 2, 7 - (i % 2));
        r(cream, x, y + 2, 1, 1);
      }
      r(timber, 2, y + 8, frontW, 2); r(lightWood, 2, y + 8, frontW, 1);
    }
    if (sideways(facing)) {
      r(wood, 10, 4, 4, 25); r(timber, 10, 6, 2, 21); r(lightWood, 10, 5, 1, 22);
    }
  }
  box(r, timber, 0, 1, 16, 3); r(ink, 2, 30, 3, 1); r(ink, 11, 30, 3, 1);
}

function toybox(r: Brush): void {
  contact(r, 16, 16);
  box(r, timber, 1, 1, 14, 4); r(lightWood, 2, 2, 11, 1);
  r(ink, 2, 5, 12, 3); r('#b94e45', 3, 4, 3, 3); r(cream, 4, 4, 1, 1);
  r('#698cab', 8, 4, 4, 4); r('#92b2c4', 9, 4, 2, 1);
  box(r, timber, 1, 7, 14, 8); r(lightWood, 2, 8, 12, 1);
  r(wood, 3, 12, 10, 1); r(ink, 6, 10, 4, 1); r(lightWood, 7, 11, 2, 1);
}

function cabinet(r: Brush, facing: Facing): void {
  const side = sideways(facing), w = side ? 16 : 32, h = side ? 32 : 16;
  contact(r, w, h); box(r, wood, 1, 1, w - 2, h - 2);
  const frontY = side ? 24 : 6;
  r(timber, 2, 2, w - 4, frontY - 2); r(lightWood, 2, 2, w - 4, 1);
  grain(r, 3, 4, w - 7, frontY - 6);
  if (facing === 'down' || side) {
    if (side) {
      r(timber, 2, 25, 12, 5); r(wood, 7, 25, 1, 5); r(ink, 5, 27, 1, 1); r(ink, 9, 27, 1, 1);
      r(wood, 11, 7, 3, 17); r(lightWood, 11, 7, 1, 16);
    } else {
      box(r, timber, 2, 6, 14, 8, wood); box(r, timber, 16, 6, 14, 8, wood);
      r(ink, 12, 9, 2, 1); r(ink, 18, 9, 2, 1); r(lightWood, 3, 7, 11, 1); r(lightWood, 17, 7, 11, 1);
    }
  } else {
    r(timber, 3, 7, 26, 6); r(wood, 15, 7, 1, 6); r(lightWood, 4, 7, 24, 1);
  }
}

function sink(r: Brush, facing: Facing): void {
  const side = sideways(facing); contact(r, side ? 16 : 32, side ? 48 : 32);
  if (side) {
    box(r, steel, 1, 7, 14, 39); r(white, 2, 8, 10, 35); r(bright, 2, 8, 1, 34);
    box(r, metal, 3, 11, 8, 15); r(darkMetal, 4, 13, 5, 10); r(steel, 4, 12, 5, 1);
    r(ink, 12, 2, 2, 11); r(white, 12, 3, 1, 9); r(metal, 9, 2, 5, 2); r(bright, 9, 2, 4, 1);
    r(steel, 12, 18, 2, 19); r(metal, 12, 37, 2, 7);
    r(ink, 2, 37, 10, 1); r(steel, 7, 38, 1, 7); r(metal, 4, 40, 1, 3); r(metal, 9, 40, 1, 3);
    return;
  }
  box(r, steel, 1, 8, 30, 23); r(white, 2, 9, 27, 20); r(bright, 2, 9, 27, 1);
  box(r, steel, 1, 4, 30, 4); r(bright, 2, 5, 27, 1);
  box(r, metal, facing === 'down' ? 4 : 12, 10, 15, 8);
  const bowlX = facing === 'down' ? 6 : 14;
  r(darkMetal, bowlX, 12, 11, 4); r(steel, bowlX, 11, 11, 1); r(steel, bowlX + 9, 12, 1, 3);
  const tapX = facing === 'down' ? 20 : 7;
  r(ink, tapX, 1, 2, 10); r(white, tapX, 2, 1, 8); r(metal, tapX - 4, 1, 6, 2); r(bright, tapX - 4, 1, 5, 1);
  r(metal, 2, 18, 28, 1); r(steel, 15, 19, 1, 10); r(steel, 3, 29, 26, 1);
  if (facing === 'down') { r(metal, 12, 22, 1, 4); r(metal, 18, 22, 1, 4); }
  else { r(steel, 5, 22, 22, 1); r(steel, 5, 26, 22, 1); }
}

function stove(r: Brush, facing: Facing): void {
  contact(r, 16, 32); box(r, steel, 1, 8, 14, 23); r(white, 2, 9, 11, 20); r(bright, 2, 9, 10, 1);
  box(r, metal, sideways(facing) ? 11 : 1, 4, sideways(facing) ? 4 : 14, 5);
  if (sideways(facing)) {
    for (const y of [11, 16]) { r(metal, 3, y, 7, 4); r(darkMetal, 4, y + 1, 5, 2); }
    r(metal, 1, 21, 5, 9); r(darkMetal, 2, 23, 3, 5); r(steel, 3, 24, 1, 2);
    r(steel, 7, 20, 6, 9); r(metal, 8, 22, 1, 6); r(metal, 11, 22, 1, 6);
  } else {
    for (const x of [3, 9]) { r(metal, x, 11, 5, 5); r(darkMetal, x + 1, 12, 3, 3); r(steel, x + 1, 11, 2, 1); }
    r(metal, 2, 18, 12, 3);
    if (facing === 'down') {
      for (const x of [3, 6, 9, 12]) r(bright, x, 19, 1, 1);
      box(r, darkMetal, 3, 22, 10, 7); r(steel, 5, 24, 5, 1); r(white, 4, 22, 8, 1);
    } else {
      r(steel, 3, 22, 10, 7); for (const y of [23, 26]) r(metal, 4, y, 8, 1);
    }
  }
}

function fridge(r: Brush, facing: Facing): void {
  contact(r, 16, 32); box(r, steel, 1, 2, 14, 29);
  r(white, 2, 3, 10, 26); r(bright, 2, 3, 10, 2); r(metal, 13, 5, 1, 24);
  if (facing === 'up') {
    r(steel, 3, 6, 9, 22);
    for (let y = 8; y < 25; y += 3) { r(ink, 4, y, 8, 1); r(metal, 5, y + 1, 6, 1); }
    box(r, metal, 3, 26, 10, 4);
  } else if (sideways(facing)) {
    r(steel, 8, 4, 5, 25); r(bright, 8, 4, 1, 24); r(metal, 12, 6, 1, 22);
    r(steel, 2, 13, 6, 1); r(metal, 5, 8, 1, 3); r(metal, 5, 18, 1, 6);
  } else {
    r(steel, 2, 13, 11, 1); r(bright, 2, 14, 10, 1);
    r(metal, 10, 7, 1, 3); r(metal, 10, 18, 1, 6); r(bright, 3, 6, 1, 21);
  }
}

function television(r: Brush, facing: Facing): void {
  const side = sideways(facing); contact(r, side ? 16 : 32, side ? 48 : 32);
  if (side) {
    box(r, wood, 1, 34, 14, 13); r(timber, 2, 35, 12, 3); r(lightWood, 2, 35, 11, 1);
    r(ink, 8, 30, 2, 4); r(metal, 9, 31, 1, 3);
    box(r, darkMetal, 8, 3, 6, 28); r(metal, 11, 5, 1, 24);
    box(r, '#698cab', 2, 7, 7, 24, darkMetal); r('#92b2c4', 3, 8, 2, 18); r(metal, 6, 10, 1, 18);
    r(ink, 3, 40, 9, 5); r(timber, 4, 41, 7, 3); r(wood, 7, 41, 1, 3);
    return;
  }
  box(r, wood, 1, 23, 30, 8); r(timber, 2, 24, 28, 2); r(lightWood, 2, 24, 27, 1);
  r(ink, 14, 20, 4, 3); r(metal, 15, 20, 2, 2);
  box(r, darkMetal, 3, 2, 26, 19);
  if (facing === 'down') {
    r('#698cab', 5, 4, 22, 14); r('#92b2c4', 6, 5, 19, 2);
    r('#92b2c4', 6, 7, 3, 5); r('#92b2c4', 9, 10, 3, 3); r(metal, 5, 17, 22, 1);
    r(ink, 4, 27, 9, 3); r(darkMetal, 16, 27, 10, 2); r(steel, 18, 27, 3, 1);
  } else {
    for (const y of [5, 8, 11]) r(metal, 7, y, 18, 1);
    r(ink, 12, 14, 8, 4); r(steel, 13, 15, 1, 1); r(steel, 17, 15, 2, 1);
    r(timber, 3, 27, 26, 3); r(wood, 15, 27, 1, 3);
  }
}

function plant(r: Brush): void {
  contact(r, 16, 32);
  r(ink, 7, 6, 2, 20); r('#3f7653', 7, 7, 1, 18);
  r(ink, 5, 1, 7, 5); r(ink, 7, 0, 3, 1); r('#639858', 6, 2, 5, 3); r('#8fae64', 7, 2, 3, 1);
  r(ink, 1, 8, 7, 6); r(ink, 0, 9, 1, 3); r('#3f7653', 2, 9, 5, 4); r('#639858', 2, 9, 4, 2); r('#8fae64', 2, 9, 2, 1);
  r(ink, 9, 10, 6, 7); r(ink, 15, 12, 1, 3); r('#3f7653', 10, 11, 4, 5); r('#639858', 10, 11, 3, 3); r('#8fae64', 10, 11, 2, 1);
  r(ink, 2, 17, 6, 5); r('#3f7653', 3, 18, 4, 3); r('#639858', 3, 18, 3, 1);
  box(r, '#bd7b58', 4, 23, 9, 6); r(wood, 10, 25, 2, 3);
  r(ink, 5, 29, 7, 2); r('#bd7b58', 6, 29, 5, 1); r(lightWood, 5, 24, 6, 1);
  r(wood, 5, 23, 7, 1);
}

function window(r: Brush): void {
  box(r, timber, 1, 1, 30, 13); r(lightWood, 2, 2, 28, 1);
  for (const x of [4, 18]) {
    box(r, '#7ab2c8', x - 1, 3, 12, 9, cream);
    r('#b8dfdf', x, 4, 9, 1); r('#b8dfdf', x, 5, 2, 3); r('#b8dfdf', x + 2, 7, 2, 2);
    r('#557f91', x + 8, 5, 1, 5);
  }
  r(cream, 15, 2, 2, 11); r(bright, 15, 2, 1, 10);
  r(wood, 1, 13, 30, 1); r(lightWood, 0, 14, 32, 1);
}

/** Directional home artwork, using the catalog's fixed dimensions rather than object sizes. */
export function drawHomeFurniture(c: C2D, id: string, variant: FurnitureVariant): boolean {
  const r = brush(c, variant.w * TILE, variant.facing === 'right');
  switch (id) {
    case 'table-dining': table(r, variant.facing, true); break;
    case 'table-low': table(r, variant.facing, false); break;
    case 'desk-study': desk(r, variant.facing); break;
    case 'bed-single': bed(r, variant.facing); break;
    case 'bookshelf-tall': bookshelf(r, variant.facing); break;
    case 'toybox': toybox(r); break;
    case 'kitchen-sink': sink(r, variant.facing); break;
    case 'kitchen-stove': stove(r, variant.facing); break;
    case 'cabinet-low': cabinet(r, variant.facing); break;
    case 'fridge': fridge(r, variant.facing); break;
    case 'tv-stand': television(r, variant.facing); break;
    case 'plant-tall': plant(r); break;
    case 'window-wall': window(r); break;
    default: return false;
  }
  return true;
}
