import type { AreaRuntime } from '../world';
import { lineFootY, type TownRailLayout } from '../world/rail-layout';
import { TOWN_RAIL_LAYOUTS } from '../world/rail-layouts';
import { CAR_COUNT, CAR_GAP, CAR_LENGTH, trainSprite } from './car';
import { TownTrainService, type TrainFrame } from './service';

const service = new TownTrainService();

/**
 * 街を走る列車。実際の線路の左右の範囲だけに描き、画面の端から出入りする部分は切る。
 * ポイントで行を移る区間では、1両ずつ形を保ったまま（回転・せん断なし）、その車両の中心の線の足元に合わせて上下に平行移動する。
 * 連結部のすき間は、前後の車両の足元の中間に置く。
 */
export function drawTrainFrame(c: CanvasRenderingContext2D, frame: TrainFrame, doorOpen = 0, layout?: TownRailLayout): void {
  const { strip, length, height } = frame, x = Math.round(frame.x), sprite = trainSprite(frame.heading, doorOpen);
  const drawPart = (sx: number, sw: number, foot: number) => {
    const from = Math.max(x + sx, strip.left), to = Math.min(x + sx + sw, strip.right);
    if (to > from) c.drawImage(sprite, from - x, 0, to - from, height, from, Math.round(foot - height), to - from, height);
  };
  const straight = !layout || frame.direction === 'down' ||
    lineFootY(layout, frame.direction, Math.max(x, strip.left)) === lineFootY(layout, frame.direction, Math.min(x + length, strip.right) - 1);
  if (straight) { drawPart(0, length, frame.footY); return; }
  const feet: number[] = [];
  for (let i = 0; i < CAR_COUNT; i++) feet.push(lineFootY(layout!, frame.direction, x + i * (CAR_LENGTH + CAR_GAP) + CAR_LENGTH / 2));
  for (let i = 0; i < CAR_COUNT; i++) {
    drawPart(i * (CAR_LENGTH + CAR_GAP), CAR_LENGTH, feet[i]);
    if (i < CAR_COUNT - 1) drawPart(i * (CAR_LENGTH + CAR_GAP) + CAR_LENGTH, CAR_GAP, (feet[i] + feet[i + 1]) / 2);
  }
}

/** 並べ替えに使う奥行き付きの描画項目。奥行きは足元の y（線路の行の下端）。 */
export interface TrainPaint { readonly depth: number; readonly x: number; readonly frame: TrainFrame; readonly layout: TownRailLayout }
export function townTrainPaints(area: AreaRuntime, timeSeconds: number): TrainPaint[] {
  const layout = TOWN_RAIL_LAYOUTS[area.def.id];
  if (!layout) return [];
  return service.frames(area, timeSeconds, layout).map(frame => ({ depth: frame.footY, x: frame.x, frame, layout }));
}
