import type { Facing } from '../../core/coords';
import { R, type C2D } from '../draw';

const ink = '#39414a', wood = '#926442', timber = '#c79560', highlight = '#e3ba7d';
const fabricShade = '#42574e', fabric = '#6e8972', fabricLight = '#8ca486';

export function drawChair(c: C2D, facing: Facing): void {
  const r = (color: string, x: number, y: number, w: number, h: number) =>
    R(c, color, facing === 'right' ? 16 - x - w : x, y, w, h);
  r('#00000026', 3, 31, 11, 1);
  if (facing === 'left' || facing === 'right') {
    r(ink, 3, 25, 3, 6); r(timber, 4, 25, 1, 5);
    r(ink, 11, 25, 3, 6); r(wood, 12, 25, 1, 5);
    r(ink, 10, 3, 4, 22); r(wood, 11, 4, 2, 20);
    r(highlight, 11, 4, 2, 2); r(timber, 11, 6, 1, 13);
    r(ink, 2, 18, 11, 8); r(timber, 3, 19, 8, 4); r(highlight, 3, 19, 8, 1);
    r(wood, 3, 23, 10, 2); r(wood, 11, 19, 2, 5); r(timber, 10, 19, 1, 4);
    return;
  }
  r(ink, 3, 25, 3, 6); r(ink, 10, 25, 3, 6);
  if (facing === 'down') {
    r(timber, 4, 25, 1, 5); r(wood, 11, 25, 1, 5);
    r(ink, 3, 3, 10, 18); r(timber, 4, 4, 8, 15); r(highlight, 4, 4, 8, 2);
    r(ink, 5, 7, 6, 9); r(wood, 6, 8, 4, 7); r(timber, 7, 8, 1, 7);
    r(ink, 1, 18, 14, 8); r(timber, 2, 19, 12, 4); r(highlight, 2, 19, 11, 2);
    r(wood, 2, 23, 12, 2);
  } else {
    r(wood, 4, 25, 1, 5); r(wood, 11, 25, 1, 5);
    // Clean rear view of the same chair: no side flaps; backrest stiles reveal the sunlit seat top in the lower gap.
    r(ink, 3, 4, 10, 21); r(timber, 4, 5, 8, 18); r(highlight, 4, 5, 8, 2);
    r(wood, 6, 8, 4, 7); r(timber, 7, 8, 1, 7);
    r(ink, 5, 15, 6, 4); r(highlight, 6, 16, 4, 1); r(timber, 6, 17, 4, 1);
    r(wood, 4, 20, 8, 4); r(timber, 4, 19, 8, 1);
  }
}

export function drawSofa(c: C2D, facing: Facing): void {
  const side = facing === 'left' || facing === 'right';
  const r = (color: string, x: number, y: number, w: number, h: number) =>
    R(c, color, facing === 'right' ? 16 - x - w : x, y, w, h);
  if (side) {
    r('#00000026', 2, 47, 13, 1);
    r(ink, 3, 7, 12, 38); r(fabric, 4, 8, 10, 35);
    r(ink, 10, 4, 5, 39); r(fabricLight, 11, 5, 2, 33); r(fabricShade, 13, 6, 1, 36);
    for (const y of [15, 29]) {
      r(ink, 2, y, 9, 14); r(fabricLight, 3, y + 1, 7, 10); r(fabric, 3, y + 3, 6, 8);
      r(fabricShade, 3, y + 11, 7, 2);
    }
    r(ink, 1, 10, 10, 5); r(fabricLight, 2, 11, 8, 2);
    r(ink, 1, 41, 10, 4); r(fabric, 2, 42, 8, 2);
    r(ink, 3, 45, 3, 2); r(wood, 4, 45, 1, 2); r(ink, 11, 45, 3, 2);
    return;
  }
  r('#00000026', 3, 31, 26, 1);
  r(ink, 2, 7, 28, 23); r(fabric, 3, 8, 26, 20);
  r(ink, 4, 4, 24, 4); r(fabricLight, 5, 5, 22, 2);
  if (facing === 'down') {
    for (const x of [4, 16]) {
      r(fabricShade, x, 9, 12, 12); r(fabricLight, x + 1, 10, 10, 8); r(fabric, x + 1, 12, 10, 7);
      r(ink, x, 21, 12, 7); r(fabricLight, x + 1, 22, 10, 3); r(fabric, x + 1, 25, 10, 2);
    }
    r(ink, 1, 15, 4, 14); r(fabricLight, 2, 16, 2, 3); r(fabricShade, 2, 19, 2, 9);
    r(ink, 27, 15, 4, 14); r(fabric, 28, 16, 2, 12);
  } else {
    r(fabricLight, 4, 8, 24, 7); r(fabricShade, 3, 16, 26, 12);
    r(fabric, 4, 17, 24, 10); r(fabricLight, 5, 17, 22, 1);
    r(fabricShade, 15, 19, 1, 7); r(fabricShade, 5, 26, 22, 1);
  }
  r(ink, 4, 29, 3, 2); r(wood, 5, 29, 1, 2); r(ink, 25, 29, 3, 2);
}

export function drawRug(c: C2D, width: number, height: number): void {
  R(c, ink, 1, 1, width - 2, height - 2);
  R(c, '#b88876', 2, 2, width - 4, height - 4);
  R(c, '#ead2ad', 4, 4, width - 8, height - 8);
  R(c, '#cda28a', 5, 5, width - 10, height - 10);
  R(c, '#b88876', 8, 8, width - 16, height - 16);
  for (let x = 4; x < width - 3; x += 4) {
    R(c, '#ead2ad', x, 0, 2, 1); R(c, '#ead2ad', x, height - 1, 2, 1);
  }
  for (let y = 10; y < height - 9; y += 6) for (let x = 10; x < width - 9; x += 6) {
    R(c, '#cda28a', x, y - 1, 1, 3); R(c, '#cda28a', x - 1, y, 3, 1);
  }
}
