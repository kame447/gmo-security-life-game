/**
 * 自転車に乗った主人公のドット絵（26×30 ドット）。頭・胴・配色は player-sprite.ts と共有し、
 * 脚の代わりにペダルをこぐ脚を、足元に自転車を描く。frame（0・1・2）でペダルと車輪のスポークが回る。
 * 横向きは右向きで描き、左向きは左右反転する。
 */
import type { Facing } from '../core/coords';
import type { PlayerAppearance } from '../core/appearance';
import type { C2D } from './draw';
import { BODIES, HEADS, paint, palette, slim, viewOf, type Palette } from './player-sprite';

export const RIDER_W = 26;
export const RIDER_H = 30;

const BIKE = { frame: '#2f8f9d', dark: '#1f5f68', tire: '#2b2a30', spoke: '#c9ced6', seat: '#3b2318', basket: '#d9c48f', reflector: '#e2566a' };

function dot(c: C2D, color: string, x: number, y: number, w = 1, h = 1): void {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

/** Bresenham's line, one dot wide. */
function line(c: C2D, color: string, x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    dot(c, color, x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** 横から見た車輪（直径 9 ドット）。スポークは frame ごとに十字と斜めを切り替える。 */
function wheel(c: C2D, cx: number, cy: number, frame: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    const a = Math.abs(dy);
    if (a === 4) dot(c, BIKE.tire, cx - 2, cy + dy, 5, 1);
    else { const dx = a === 3 ? 3 : 4; dot(c, BIKE.tire, cx - dx, cy + dy); dot(c, BIKE.tire, cx + dx, cy + dy); }
  }
  const spokes = frame === 1 ? [[-2, -2], [2, -2], [-2, 2], [2, 2]] : [[0, -2], [0, 2], [-2, 0], [2, 0]];
  for (const [dx, dy] of spokes) line(c, BIKE.spoke, cx, cy, cx + dx, cy + dy);
  dot(c, BIKE.dark, cx, cy);
}

/** 手前・奥の脚の膝とペダルの位置。frame 0 は水平、1・2 は手前の足が下・上。 */
type Leg = { knee: [number, number]; pedal: [number, number] };
const PEDALS: Record<number, { near: Leg; far: Leg }> = {
  0: { near: { knee: [14, 22], pedal: [13, 25] }, far: { knee: [12, 22], pedal: [9, 25] } },
  1: { near: { knee: [13, 23], pedal: [11, 27] }, far: { knee: [13, 21], pedal: [11, 23] } },
  2: { near: { knee: [13, 21], pedal: [11, 23] }, far: { knee: [13, 23], pedal: [11, 27] } },
};

function drawSide(c: C2D, a: PlayerAppearance, colors: Palette, frame: number): void {
  const bare = a.outfit !== 'overalls';
  const pedals = PEDALS[frame];
  // Thigh from the saddle to the knee, then the shin down to the pedal, two dots thick.
  const leg = ({ knee, pedal }: Leg, skin: string) => {
    for (const dy of [0, 1]) line(c, skin, 10, 20 + dy, knee[0], knee[1] + dy);
    for (const dx of [0, 1]) line(c, skin, knee[0] + dx - 1, knee[1], pedal[0] + dx, pedal[1] - 1);
    dot(c, colors.k, pedal[0], pedal[1], 3, 1);
  };
  leg(pedals.far, bare ? colors.S : colors.P);
  wheel(c, 5, 25, frame);
  wheel(c, 20, 25, frame);
  line(c, BIKE.frame, 5, 25, 11, 25);   // chain stay
  line(c, BIKE.frame, 5, 25, 9, 21);    // seat stay
  line(c, BIKE.frame, 11, 25, 9, 21);   // seat tube
  line(c, BIKE.frame, 9, 21, 18, 21);   // top tube
  line(c, BIKE.frame, 11, 25, 18, 22);  // down tube
  line(c, BIKE.dark, 18, 22, 20, 25);   // fork
  line(c, BIKE.dark, 18, 18, 18, 22);   // stem
  dot(c, BIKE.seat, 17, 18, 3, 1);      // handlebar
  dot(c, BIKE.seat, 7, 20, 4, 1);       // saddle
  dot(c, BIKE.dark, 11, 25);            // crank
  paint(c, BODIES.side[a.outfit] ?? BODIES.side.jacket, colors, 1, 13);
  paint(c, HEADS.side[a.hairStyle] ?? HEADS.side.short, colors, 2, 0);
  line(c, colors.C, 13, 16, 16, 18);    // arm on the handlebar
  dot(c, colors.s, 17, 18);
  leg(pedals.near, bare ? colors.s : colors.p);
}

/** 正面・背面：車輪は縦の帯に見え、脚は車輪の左右でペダルをこぐ。正面は前かご、背面は泥よけと反射板。 */
function drawFrontBack(c: C2D, a: PlayerAppearance, colors: Palette, front: boolean, frame: number): void {
  const view = front ? 'front' : 'back';
  const skin = a.outfit !== 'overalls' ? colors.s : colors.p;
  const [left, right] = frame === 1 ? [25, 28] : frame === 2 ? [28, 25] : [27, 27];
  for (const [x, bottom] of [[8, left], [15, right]] as const) {
    dot(c, colors.o, x - 1, 22, 5, bottom - 21);
    dot(c, skin, x, 22, 3, bottom - 23);
    dot(c, colors.k, x, bottom - 1, 3, 1);
  }
  dot(c, BIKE.tire, 12, 22, 2, 8);
  dot(c, BIKE.dark, 11, 20, 1, 5);
  dot(c, BIKE.dark, 14, 20, 1, 5);
  dot(c, BIKE.frame, 11, 21, 4, 2);     // mudguard
  const handlebar = () => {
    dot(c, BIKE.dark, 7, 19, 12, 1);
    dot(c, BIKE.seat, 5, 19, 2, 1);
    dot(c, BIKE.seat, 19, 19, 2, 1);
  };
  if (front) {
    paintBody(c, a, colors, view);
    handlebar();
    dot(c, BIKE.seat, 9, 20, 8, 5);     // basket
    dot(c, BIKE.basket, 10, 21, 6, 3);
    for (const x of [11, 13, 15]) dot(c, BIKE.seat, x, 22, 1, 1);
  } else {
    handlebar();
    dot(c, BIKE.reflector, 12, 22, 2, 1);
    paintBody(c, a, colors, view);
  }
}

function paintBody(c: C2D, a: PlayerAppearance, colors: Palette, view: 'front' | 'back'): void {
  const body = BODIES[view][a.outfit] ?? BODIES[view].jacket;
  paint(c, a.silhouette === 'type-b' ? slim(body) : body, colors, 4, 13);
  paint(c, HEADS[view][a.hairStyle] ?? HEADS[view].short, colors, 5, 0);
}

export function drawRider(c: C2D, a: PlayerAppearance, facing: Facing, frame: 0 | 1 | 2): void {
  const colors = palette(a);
  const view = viewOf(facing);
  if (view !== 'side') { drawFrontBack(c, a, colors, view === 'front', frame); return; }
  if (facing === 'left') { c.translate(RIDER_W, 0); c.scale(-1, 1); }
  drawSide(c, a, colors, frame);
}
