import type { ObjectDef } from '../../core/types';
import { TILE } from '../../core/coords';
import { makeCanvas, R, type C2D } from '../draw';

export { makeCanvas, R, TILE, type C2D, type ObjectDef };

export interface StoreSprite {
  canvas: HTMLCanvasElement;
  ox: number;
  oy: number;
}

export const INK = '#39414a';
export const SHADOW = 'rgba(26, 30, 36, 0.22)';
export const WOOD_DARK = '#6f482b';
export const WOOD_MID = '#96653f';
export const WOOD_LIGHT = '#c48f5a';
export const WOOD_CREAM = '#dfba86';
export const CREAM = '#f6ecd7';
export const WHITE = '#f8f8f3';
export const SILVER = '#cbd3d8';
export const GLASS = '#cfe8ef';
export const GLASS_HI = '#eefafd';
export const MINT_DARK = '#3b8c76';
export const MINT_MID = '#76bea6';
export const MINT_LIGHT = '#dff1ea';

/** Filled box with dark pixel outline. */
export function box(c: C2D, x: number, y: number, w: number, h: number, fill: string, edge = INK): void {
  R(c, edge, x, y, w, h);
  if (w > 2 && h > 2) R(c, fill, x + 1, y + 1, w - 2, h - 2);
}

/** Floor drop shadow slightly below the fixture base. */
export function floorShadow(c: C2D, x: number, y: number, w: number, h = 2): void {
  R(c, SHADOW, x, y, w, h);
}

/** Beveled wooden or painted display table/island block. */
export function displayTable(
  c: C2D,
  w: number,
  h: number,
  top: string,
  front: string,
  trim: string,
  topH = Math.max(8, h - 7),
): void {
  floorShadow(c, 1, h - 2, w - 2, 2);
  box(c, 0, 0, w, h - 1, front);
  R(c, top, 1, 1, w - 2, topH - 1);
  R(c, trim, 1, 1, w - 2, 1);
  R(c, trim, 1, topH, w - 2, 2);
  R(c, WOOD_DARK, 1, topH + 2, w - 2, 1);
  // Corner table legs
  R(c, INK, 1, h - 3, 2, 2);
  R(c, INK, w - 3, h - 3, 2, 2);
}

/** Framed multi-tier wall or gondola shelf with visible back board & two shelves. */
export function shelfCabinet(
  c: C2D,
  w: number,
  totalH: number,
  frame: string,
  back: string,
  ledge: string,
  yTop = 0,
): { innerX: number; innerW: number; tier1Y: number; tier2Y: number } {
  const h = totalH - yTop - 1;
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, yTop, w, h, frame);
  R(c, back, 2, yTop + 2, w - 4, h - 4);
  const midY = yTop + Math.floor((h - 3) / 2);
  R(c, ledge, 1, midY, w - 2, 2);
  R(c, INK, 2, midY + 2, w - 4, 1);
  R(c, ledge, 1, yTop + h - 3, w - 2, 2);
  return { innerX: 2, innerW: w - 4, tier1Y: midY, tier2Y: yTop + h - 3 };
}

/** Sloped open-top crate or basket tray with wood slats. */
export function woodCrate(c: C2D, x: number, y: number, w: number, h: number, fill = WOOD_MID, edge = WOOD_LIGHT): void {
  box(c, x, y, w, h, fill);
  R(c, edge, x + 1, y + 1, w - 2, 1);
  R(c, WOOD_DARK, x + 1, y + 2, w - 2, 1);
  if (h >= 7) R(c, edge, x + 1, y + h - 3, w - 2, 1);
}

/** Woven bamboo basket base for produce / bread. */
export function wovenBasket(c: C2D, x: number, y: number, w: number, h: number): void {
  box(c, x, y, w, h, '#c79752');
  R(c, '#e4ba78', x + 1, y + 1, w - 2, 2);
  for (let px = x + 2; px < x + w - 2; px += 3) {
    R(c, '#9a6b32', px, y + 3, 1, Math.max(1, h - 5));
  }
}

/** Shop checkout counter base with optional cash register & apron stripe (draws into totalH = h + 6). */
export function shopCounter(
  c: C2D,
  w: number,
  h: number,
  topCol: string,
  frontCol: string,
  stripeCol: string,
  regX: number,
  regCol = '#5a636d',
): void {
  const totalH = h + 6;
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 5, w, totalH - 6, frontCol);
  R(c, topCol, 1, 6, w - 2, 6);
  R(c, '#ffffff', 2, 6, w - 4, 1);
  R(c, INK, 1, 12, w - 2, 1);
  R(c, stripeCol, 1, 13, w - 2, totalH - 15);
  if (regX >= 0) {
    // Register sitting on counter top
    box(c, regX, 0, 10, 10, regCol);
    R(c, '#9fb6c2', regX + 2, 1, 6, 4);
    R(c, '#d7e2e7', regX + 2, 6, 6, 2);
  }
}

/** Small paper price tag or POP accent card. */
export function priceCard(c: C2D, x: number, y: number, accent = '#e05b46'): void {
  R(c, INK, x, y, 5, 4);
  R(c, WHITE, x + 1, y + 1, 3, 2);
  R(c, accent, x + 1, y + 1, 2, 1);
}

/** Glass refrigerated case sheen streaks. */
export function glassSheen(c: C2D, x: number, y: number, w: number, h: number): void {
  R(c, GLASS_HI, x + 2, y + 2, 1, Math.max(2, h - 5));
  R(c, GLASS_HI, x + 3, y + 1, 1, 2);
  if (w > 18) R(c, GLASS_HI, x + w - 6, y + 3, 1, Math.max(2, h - 6));
}

/** Contoured PET / syrup bottle icon (5x11 anchored bottom-left at x, y). */
export function drawBottle(c: C2D, x: number, y: number, body: string, cap: string, label = WHITE): void {
  R(c, INK, x + 1, y - 11, 3, 2);
  R(c, cap, x + 2, y - 11, 1, 1);
  R(c, INK, x, y - 9, 5, 9);
  R(c, body, x + 1, y - 8, 3, 7);
  R(c, label, x + 1, y - 6, 3, 3);
  R(c, '#ffffff', x + 1, y - 8, 1, 5);
}

/** Decorative non-solid floor runner / mat decal for visual shop floor zoning. */
export function shopRug(c: C2D, w: number, h: number, base: string, border: string, trim: string): void {
  R(c, border, 1, 1, w - 2, h - 2);
  R(c, base, 3, 3, w - 6, h - 6);
  if (h >= 12) {
    R(c, trim, 4, 4, w - 8, 1);
    R(c, trim, 4, h - 5, w - 8, 1);
  }
  if (w >= 24 && h >= 14) {
    for (let x = 6; x <= w - 8; x += 6) {
      R(c, border, x, 6, 2, h - 12);
    }
  }
}

/** Flat commercial entrance mat without stripes (for konbini & pharmacy). */
export function shopFlatMat(c: C2D, w: number, h: number, base: string, border: string, trim: string): void {
  R(c, border, 1, 2, w - 2, h - 4);
  R(c, base, 2, 3, w - 4, h - 6);
  R(c, trim, 3, 4, w - 6, 1);
}

/** Compact notched-corner welcome mat with stitched trim (for greengrocer & candy). */
export function shopCompactMat(c: C2D, w: number, h: number, base: string, border: string, trim: string): void {
  R(c, border, 2, 1, w - 4, h - 2);
  R(c, border, 1, 2, w - 2, h - 4);
  R(c, base, 3, 3, w - 6, h - 6);
  for (let x = 4; x <= w - 6; x += 4) {
    R(c, trim, x, 4, 2, 1);
    R(c, trim, x, h - 5, 2, 1);
  }
}
