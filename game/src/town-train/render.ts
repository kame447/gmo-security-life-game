import type { AreaRuntime } from '../world';
import { trainSprite } from './car';
import { TownTrainService, type TrainFrame } from './service';

const service = new TownTrainService();

/** 街を走る列車。実際の線路の左右の範囲だけに描き、画面の端から出入りする部分は切る。 */
export function drawTrainFrame(c: CanvasRenderingContext2D, frame: TrainFrame, doorOpen = 0): void {
  const { strip, length, height } = frame, x = Math.round(frame.x), y = Math.round(frame.y);
  const from = Math.max(x, strip.left), to = Math.min(x + length, strip.right);
  if (to <= from) return;
  c.drawImage(trainSprite(frame.heading, doorOpen), from - x, 0, to - from, height, from, y, to - from, height);
}

/** 並べ替えに使う奥行き付きの描画項目。奥行きは足元の y（線路の行の下端）。 */
export interface TrainPaint { readonly depth: number; readonly x: number; readonly frame: TrainFrame }
export function townTrainPaints(area: AreaRuntime, timeSeconds: number): TrainPaint[] {
  return service.frames(area, timeSeconds).map(frame => ({ depth: frame.strip.bottom, x: frame.x, frame }));
}
