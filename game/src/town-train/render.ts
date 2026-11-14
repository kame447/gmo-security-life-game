import type { AreaRuntime } from '../world';
import { lineFootY, type TownRailLayout } from '../world/rail-layout';
import { TOWN_RAIL_LAYOUTS } from '../world/rail-layouts';
import { trainSprite } from './car';
import { TownTrainService, type TrainFrame } from './service';

const service = new TownTrainService();
const SLICE = 2;

/**
 * 街を走る列車。実際の線路の左右の範囲だけに描き、画面の端から出入りする部分は切る。
 * ポイントで行を移る区間では、2px幅の縦の薄片ごとに足元を線の上に置き、車体が曲がりに沿って変形して見える。
 */
export function drawTrainFrame(c: CanvasRenderingContext2D, frame: TrainFrame, doorOpen = 0, layout?: TownRailLayout): void {
  const { strip, length, height } = frame, x = Math.round(frame.x), sprite = trainSprite(frame.heading, doorOpen);
  const from = Math.max(x, strip.left), to = Math.min(x + length, strip.right);
  if (to <= from) return;
  const straight = !layout || (frame.direction === 'down') ||
    lineFootY(layout, frame.direction, from) === lineFootY(layout, frame.direction, to - 1);
  if (straight) {
    c.drawImage(sprite, from - x, 0, to - from, height, from, Math.round(frame.footY - height), to - from, height);
    return;
  }
  for (let sx = from - x; sx < to - x; sx += SLICE) {
    const w = Math.min(SLICE, to - x - sx), wx = x + sx;
    const foot = Math.round(lineFootY(layout!, frame.direction, wx + w / 2));
    c.drawImage(sprite, sx, 0, w, height, wx, foot - height, w, height);
  }
}

/** 並べ替えに使う奥行き付きの描画項目。奥行きは足元の y（線路の行の下端）。 */
export interface TrainPaint { readonly depth: number; readonly x: number; readonly frame: TrainFrame; readonly layout: TownRailLayout }
export function townTrainPaints(area: AreaRuntime, timeSeconds: number): TrainPaint[] {
  const layout = TOWN_RAIL_LAYOUTS[area.def.id];
  if (!layout) return [];
  return service.frames(area, timeSeconds, layout).map(frame => ({ depth: frame.footY, x: frame.x, frame, layout }));
}
