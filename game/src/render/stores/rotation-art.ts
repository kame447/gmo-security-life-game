import type { Facing } from '../../core/coords';
import {
  INK,
  R,
  TILE,
  box,
  floorShadow,
  makeCanvas,
  type C2D,
  type ObjectDef,
  type StoreSprite,
} from './art';

/** Normalized fixture facing defaulting to 'down'. */
export function storeFacing(object: Pick<ObjectDef, 'facing'>): Facing {
  return object.facing ?? 'down';
}

export function isSidewaysStoreFacing(facing: Facing): boolean {
  return facing === 'left' || facing === 'right';
}

/** Upright (facing='down') tile height so sideways rotation preserves top overhang. */
export function uprightTileHeight(object: Pick<ObjectDef, 'facing' | 'w' | 'h'>): number {
  return isSidewaysStoreFacing(storeFacing(object)) ? object.w : object.h;
}

/** Build a store sprite with standardized canvas allocation. */
export function makeStoreSprite(w: number, h: number, oy: number, paint: (c: C2D) => void): StoreSprite {
  const [canvas, c] = makeCanvas(w, h);
  paint(c);
  return { canvas, ox: 0, oy };
}

/** Wrap a C2D context so every filled rect is mirrored horizontally across `width`. */
export function mirroredContext(c: C2D, width: number): C2D {
  return {
    get fillStyle() {
      return c.fillStyle;
    },
    set fillStyle(value) {
      c.fillStyle = value;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      c.fillRect(width - x - w, y, w, h);
    },
  } as unknown as C2D;
}

/**
 * Draw a left-facing profile directly or mirror it horizontally for right-facing.
 * Symmetric details inside drawLeft remain readable when flipped.
 */
export function drawSideProfile(
  c: C2D,
  width: number,
  facing: Facing,
  drawLeft: (ctx: C2D) => void,
): void {
  drawLeft(facing === 'right' ? mirroredContext(c, width) : c);
}

/**
 * Common Component 1: Back board (`facing = 'up'`) for shelving and display racks.
 * Draws solid back plank, vertical panel seam lines, baseboard, and feet with no front goods.
 */
export function drawCabinetBack(
  c: C2D,
  w: number,
  totalH: number,
  frame: string,
  plank: string,
  trim: string,
  seamStep = 14,
  yTop = 0,
): void {
  const h = totalH - yTop - 1;
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, yTop, w, h - 2, frame);
  R(c, plank, 2, yTop + 2, w - 4, Math.max(2, h - 7));
  R(c, trim, 1, yTop + 1, w - 2, 1);
  for (let x = Math.max(8, seamStep); x < w - 4; x += seamStep) {
    R(c, frame, x, yTop + 2, 1, Math.max(1, h - 7));
  }
  // Plinth rail and corner feet
  R(c, trim, 1, totalH - 6, w - 2, 2);
  R(c, INK, 2, totalH - 4, 3, 2);
  R(c, INK, w - 5, totalH - 4, 3, 2);
}

/**
 * Common Component 2: Narrow 1-tile-wide side cabinet (`facing = 'left' | 'right'`).
 * Left facing shows a solid back-side cheek on the right half and 1 column of goods on the left.
 */
export function drawCabinetSide(
  c: C2D,
  w: number,
  totalH: number,
  frame: string,
  cheek: string,
  cavity: string,
  ledge: string,
  topCap = ledge,
  yTop = 0,
  drawGoods?: (ctx: C2D, innerX: number, innerW: number, y1: number, y2: number) => void,
): void {
  const h = totalH - yTop - 1;
  const sideW = Math.max(5, Math.floor((w - 4) * 0.36));
  const openW = w - sideW - 3;
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, yTop, w, h, frame);
  R(c, topCap, 1, yTop + 1, w - 2, 2);
  // Solid side panel on the rear half (left view: right side of sprite)
  R(c, cheek, w - sideW - 1, yTop + 3, sideW, h - 5);
  R(c, INK, w - sideW - 2, yTop + 3, 1, h - 5);
  // Exposed single-column interior facing left
  const innerX = 2;
  R(c, cavity, innerX, yTop + 3, openW, h - 6);
  const midY = yTop + Math.floor((h - 4) / 2);
  const bottomY = yTop + h - 4;
  R(c, ledge, innerX, midY, openW, 2);
  R(c, INK, innerX, midY + 2, openW, 1);
  R(c, ledge, innerX, bottomY, openW, 2);
  if (drawGoods) {
    drawGoods(c, innerX, openW, midY, bottomY);
  }
}

/**
 * Common Component 3: Rear metal panel with cooling louvers and bottom exhaust vent
 * for refrigerated cases and chiller units (`facing = 'up'`).
 */
export function drawMachineBack(
  c: C2D,
  w: number,
  totalH: number,
  panel = '#9aa4ad',
  edge = '#5c6670',
  trim = '#dce3e8',
  yTop = 0,
): void {
  const h = totalH - yTop - 1;
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, yTop, w, h, edge);
  R(c, panel, 2, yTop + 2, w - 4, h - 4);
  R(c, trim, 2, yTop + 2, w - 4, 2);
  for (let vx = 4; vx + 6 <= w - 4; vx += 10) {
    R(c, edge, vx, yTop + 6, 7, 1);
    R(c, edge, vx, yTop + 9, 7, 1);
  }
  const exhaustH = Math.min(7, Math.max(4, Math.floor(h / 4)));
  const exhaustY = totalH - exhaustH - 3;
  box(c, 3, exhaustY, w - 6, exhaustH, '#414952');
  for (let gx = 5; gx < w - 5; gx += 3) {
    R(c, '#23282e', gx, exhaustY + 2, 1, Math.max(1, exhaustH - 4));
  }
}

export interface CounterBackOptions {
  topCol: string;
  bodyCol: string;
  trimCol: string;
  regX?: number;
  regCol?: string;
}

/**
 * Shared rear view (`facing = 'up'`) of a shop checkout counter:
 * staff-side drawers with horizontal handles, open under-shelf cavity, and register back.
 */
export function drawCounterBack(
  c: C2D,
  w: number,
  h: number,
  { topCol, bodyCol, trimCol, regX = -1, regCol = '#5a636d' }: CounterBackOptions,
): void {
  const totalH = h + 6;
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 5, w, totalH - 6, bodyCol);
  R(c, topCol, 1, 6, w - 2, 5);
  R(c, '#ffffff', 2, 6, w - 4, 1);
  R(c, INK, 1, 11, w - 2, 1);

  // Staff-side drawer bay + open bag shelf bay
  const bayW = Math.max(10, Math.floor((w - 6) / 2));
  box(c, 2, 12, bayW, totalH - 15, trimCol);
  const drawHandleY1 = 14;
  const drawHandleY2 = Math.min(totalH - 5, 17);
  R(c, INK, 4, drawHandleY1, Math.max(4, bayW - 6), 1);
  if (drawHandleY2 > drawHandleY1 + 1) {
    R(c, INK, 4, drawHandleY2, Math.max(4, bayW - 6), 1);
  }
  const shelfX = 3 + bayW;
  const shelfW = w - shelfX - 2;
  if (shelfW >= 6) {
    box(c, shelfX, 12, shelfW, totalH - 15, '#2b241f');
    R(c, topCol, shelfX + 1, 13, shelfW - 2, 1);
  }

  if (regX >= 0) {
    box(c, regX, 0, 10, 10, regCol);
    R(c, trimCol, regX + 2, 2, 6, 3);
    R(c, INK, regX + 2, 6, 6, 1);
  }
}

/**
 * Shared sideways view (`facing = 'left'`) of a rotated counter (`w = TILE`).
 * Shows bright top counter edge, apron stripe, and narrow side profile of register.
 */
export function drawCounterSide(
  c: C2D,
  w: number,
  h: number,
  topCol: string,
  bodyCol: string,
  stripeCol: string,
  showReg: boolean,
  regCol = '#5a636d',
): void {
  const totalH = h + 6;
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 5, w, totalH - 6, bodyCol);
  // Bright countertop edge along the top and customer side (left)
  R(c, topCol, 1, 6, w - 2, Math.max(6, h - 6));
  R(c, '#ffffff', 2, 6, w - 4, 1);
  R(c, '#ffffff', 1, 6, 1, Math.max(6, h - 6));
  const faceTop = Math.max(12, totalH - 10);
  R(c, INK, 1, faceTop, w - 2, 1);
  R(c, stripeCol, 1, faceTop + 1, w - 2, totalH - faceTop - 3);
  if (showReg) {
    // Symmetric slim register profile near north end
    box(c, 4, 1, 6, 9, regCol);
    R(c, '#9fb6c2', 5, 2, 4, 3);
    R(c, '#d7e2e7', 5, 6, 4, 2);
  }
}

export const STORE_TILE = TILE;
