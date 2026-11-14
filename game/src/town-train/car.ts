import type { RailHeading } from '../world/rail-geometry';

/**
 * 車両の絵（コードで描く）。街を走る列車と駅の構内の列車は、同じ絵・同じ寸法を使う。
 * 見下ろしのマップの建物や人物と同じく、側面と屋根が見える。足元（下端）が線路の行の下端に揃い、
 * 車体は線路1行（16px）から上へはみ出して重なる。主人公（18×26px）に対し、ドアは22px、車体の高さは40px（主人公の約1.5倍）。
 */
export const CAR_LENGTH = 64;
export const CAR_GAP = 2;
export const CAR_COUNT = 3;
export const TRAIN_LENGTH_PX = CAR_LENGTH * CAR_COUNT + CAR_GAP * (CAR_COUNT - 1);
export const TRAIN_HEIGHT_PX = 40;
/** 車体の側面（窓・ドアのある面）の高さ。残りが屋根と台車。 */
const WALL_TOP = 10, WALL_BOTTOM = 34;
const DOOR_W = 14;
/** 車両の左端からドアの中心までの px（各車に2か所）。 */
export const CAR_DOOR_CENTERS = [16, 48] as const;
/** 停車時に主人公が乗り込むドア（中央の車両の、進行方向の後ろ側の1枚目）の、車列の左端からの px。進行方向が右のとき。 */
export const BOARDING_DOOR_RIGHT = CAR_LENGTH + CAR_GAP + CAR_DOOR_CENTERS[0];
export const trainDoorLocalX = (heading: RailHeading): number => heading === 'right' ? BOARDING_DOOR_RIGHT : TRAIN_LENGTH_PX - BOARDING_DOOR_RIGHT;
export const DOOR_STEPS = 4;

const C = {
  outline: '#2b3a46', roofHi: '#dbe3e8', roof: '#b8c3cb', roofLo: '#93a1ab', eave: '#7d8c97',
  body: '#e8eef1', bodyLo: '#c6d1d7', blue: '#2f7fb0', blueLo: '#245f86', gold: '#e3b23c',
  glass: '#25445d', glassHi: '#5f8eae', door: '#cfd9de', doorLo: '#a9b8c1', inside: '#2a3140', floor: '#8d97a2',
  skirt: '#3a4651', wheel: '#1f2830', rail: '#6c7a84', head: '#ffe58a', tail: '#d9534f',
};

type Ctx = CanvasRenderingContext2D;
const R = (c: Ctx, color: string, x: number, y: number, w: number, h: number) => { c.fillStyle = color; c.fillRect(x, y, w, h); };

function drawCar(c: Ctx, x: number, front: boolean, rear: boolean, open: number): void {
  // 屋根（見下ろし）。縁に陰影、上面にひとすじの稜線とエアコン。
  R(c, C.outline, x + 1, 0, CAR_LENGTH - 2, 1);
  R(c, C.roofHi, x + 1, 1, CAR_LENGTH - 2, 1);
  R(c, C.roof, x, 2, CAR_LENGTH, 5);
  R(c, C.roofLo, x, 7, CAR_LENGTH, 2);
  R(c, C.eave, x, 9, CAR_LENGTH, 1);
  R(c, C.roofHi, x + 8, 3, 18, 3); R(c, C.roofLo, x + 8, 6, 18, 1);
  R(c, C.roofHi, x + 38, 3, 18, 3); R(c, C.roofLo, x + 38, 6, 18, 1);
  R(c, C.outline, x, 2, 1, 8); R(c, C.outline, x + CAR_LENGTH - 1, 2, 1, 8);
  // 側面。
  R(c, C.body, x, WALL_TOP, CAR_LENGTH, WALL_BOTTOM - WALL_TOP);
  R(c, C.bodyLo, x, WALL_TOP, CAR_LENGTH, 2);
  R(c, C.outline, x, WALL_TOP, 1, WALL_BOTTOM - WALL_TOP); R(c, C.outline, x + CAR_LENGTH - 1, WALL_TOP, 1, WALL_BOTTOM - WALL_TOP);
  // 窓: 両端の小窓と、ドアの間の大窓（中桟つき）。
  const windows: [number, number][] = [[3, 6], [26, 6], [32, 6], [55, 6]];
  windows[0] = [3, 5]; windows[3] = [56, 5];
  for (const [wx, ww] of windows) {
    R(c, C.outline, x + wx - 1, 14, ww + 2, 12);
    R(c, C.glass, x + wx, 15, ww, 10);
    R(c, C.glassHi, x + wx, 15, ww, 2); R(c, C.glassHi, x + wx + 1, 19, 1, 4);
  }
  // 帯（青と金のライン）と腰の陰影。
  R(c, C.blue, x + 1, 28, CAR_LENGTH - 2, 3); R(c, C.blueLo, x + 1, 30, CAR_LENGTH - 2, 1);
  R(c, C.gold, x + 1, 27, CAR_LENGTH - 2, 1);
  R(c, C.bodyLo, x + 1, 31, CAR_LENGTH - 2, 3);
  // ドア（車両ごとに2枚）。open は 0..1。開くと両側へ戸袋に収まり、中の暗い空間が見える。
  for (const cx of CAR_DOOR_CENTERS) {
    const left = x + cx - DOOR_W / 2;
    R(c, C.outline, left - 1, 12, DOOR_W + 2, 23);
    const gap = Math.round((DOOR_W - 2) * open);
    R(c, C.inside, left, 13, DOOR_W, 21);
    R(c, C.floor, left, 32, DOOR_W, 2);
    const half = (DOOR_W - gap) / 2;
    for (const [dx, w] of [[0, Math.ceil(half)], [DOOR_W - Math.floor(half), Math.floor(half)]] as const) {
      if (w <= 0) continue;
      R(c, C.door, left + dx, 13, w, 21);
      R(c, C.doorLo, left + dx, 30, w, 4);
      if (w >= 4) { R(c, C.glass, left + dx + 1, 15, w - 2, 8); R(c, C.glassHi, left + dx + 1, 15, w - 2, 1); }
    }
    R(c, C.outline, left + DOOR_W / 2, 13, 1, 21 * (open < 0.15 ? 1 : 0));
  }
  // 床下機器と台車。
  R(c, C.skirt, x + 1, WALL_BOTTOM, CAR_LENGTH - 2, 3);
  R(c, C.outline, x + 3, 37, 14, 3); R(c, C.outline, x + CAR_LENGTH - 17, 37, 14, 3);
  R(c, C.wheel, x + 4, 37, 12, 2); R(c, C.wheel, x + CAR_LENGTH - 16, 37, 12, 2);
  for (const wx of [6, 12, CAR_LENGTH - 14, CAR_LENGTH - 8]) R(c, C.rail, x + wx, 38, 2, 1);
  // 先頭・後尾。先頭は運転席の前面窓と前照灯、後尾は尾灯。
  if (front) {
    R(c, C.outline, x + CAR_LENGTH - 12, 12, 11, 15);
    R(c, C.glass, x + CAR_LENGTH - 11, 13, 9, 13); R(c, C.glassHi, x + CAR_LENGTH - 11, 13, 9, 2);
    R(c, C.head, x + CAR_LENGTH - 3, 31, 3, 3); R(c, C.head, x + CAR_LENGTH - 3, 20, 1, 2);
  }
  if (rear) { R(c, C.tail, x, 31, 2, 3); R(c, C.tail, x, 20, 1, 2); }
}

/** 進行方向が右の車列を描く。open は全ドアの開き具合（0..1）。 */
export function drawTrainBody(c: Ctx, open: number): void {
  for (let i = 0; i < CAR_COUNT; i++) {
    const x = i * (CAR_LENGTH + CAR_GAP);
    drawCar(c, x, i === CAR_COUNT - 1, i === 0, open);
    if (i < CAR_COUNT - 1) { R(c, C.outline, x + CAR_LENGTH, 14, CAR_GAP, 18); R(c, C.skirt, x + CAR_LENGTH, 20, CAR_GAP, 6); }
  }
}

const cache = new Map<string, HTMLCanvasElement>();
/** 進行方向と戸の開き（段階化）ごとに1枚だけ作って使い回す。 */
export function trainSprite(heading: RailHeading, doorOpen: number): HTMLCanvasElement {
  const step = Math.max(0, Math.min(DOOR_STEPS, Math.round(doorOpen * DOOR_STEPS)));
  const key = `${heading}:${step}`;
  let canvas = cache.get(key);
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = TRAIN_LENGTH_PX; canvas.height = TRAIN_HEIGHT_PX;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas 2D is unavailable');
  c.imageSmoothingEnabled = false;
  if (heading === 'left') { c.translate(TRAIN_LENGTH_PX, 0); c.scale(-1, 1); }
  drawTrainBody(c, step / DOOR_STEPS);
  cache.set(key, canvas);
  return canvas;
}
