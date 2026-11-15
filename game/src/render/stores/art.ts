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
  R(c, back, 2, yTop + 2, w - 4, h - 5);
  const midY = yTop + Math.floor((h - 4) / 2) + 1;
  R(c, ledge, 1, midY, w - 2, 2);
  R(c, INK, 2, midY + 2, w - 4, 1);
  R(c, ledge, 1, yTop + h - 4, w - 2, 2);
  return { innerX: 2, innerW: w - 4, tier1Y: midY, tier2Y: yTop + h - 4 };
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

/** Shop checkout counter base with cash register & apron stripe. */
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
  const totalH = h + 4;
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 4, w, h - 1, frontCol);
  R(c, topCol, 1, 5, w - 2, 7);
  R(c, '#ffffff', 2, 5, w - 4, 1);
  R(c, stripeCol, 1, 13, w - 2, 3);
  R(c, INK, 1, 12, w - 2, 1);
  // Register sitting on counter top
  box(c, regX, 0, 10, 9, regCol);
  R(c, '#9fb6c2', regX + 2, 1, 6, 3);
  R(c, '#d7e2e7', regX + 2, 5, 6, 2);
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

/** Vertical bottle icon (for chiller / wine / syrup / shampoo). */
export function drawBottle(c: C2D, x: number, y: number, body: string, cap: string, label = WHITE): void {
  R(c, cap, x + 1, y - 7, 1, 2);
  R(c, body, x, y - 5, 3, 5);
  R(c, label, x, y - 4, 3, 2);
}
