import type { AreaRuntime } from '../world';
import { TownTrainService, type TrainFrame } from './service';

const service = new TownTrainService();

/** All paint, including entering/leaving trains, is clipped to actual rail ground. */
export function drawTrainFrame(c: CanvasRenderingContext2D, frame: TrainFrame): void {
  const { strip, length, height } = frame, x = Math.round(frame.x), y = Math.round(frame.y);
  c.save();
  c.beginPath();
  c.rect(strip.left, strip.top, strip.right - strip.left, strip.bottom - strip.top);
  c.clip();
  c.fillStyle = '#273e52'; c.fillRect(x, y + 1, length, height - 2);
  c.fillStyle = '#dce5e5'; c.fillRect(x + 2, y + 3, length - 4, height - 8);
  c.fillStyle = '#397b9a'; c.fillRect(x + 2, y + height - 9, length - 4, 3);
  c.fillStyle = '#4b7184';
  for (let windowX = 8; windowX + 10 < length; windowX += 18) c.fillRect(x + windowX, y + 6, 10, Math.max(1, height - 17));
  c.fillStyle = '#253540';
  for (let wheelX = 10; wheelX + 7 < length; wheelX += 30) c.fillRect(x + wheelX, y + height - 4, 7, 3);
  c.restore();
}

export function drawTownTrains(c: CanvasRenderingContext2D, area: AreaRuntime, timeSeconds: number): void {
  for (const frame of service.frames(area, timeSeconds)) drawTrainFrame(c, frame);
}
