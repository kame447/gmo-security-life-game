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
  const head = frame.heading === 'right';
  c.fillStyle = '#273e52'; c.fillRect(x, y + 1, length, height - 2);
  c.fillStyle = '#dce5e5'; c.fillRect(x + 2, y + 2, length - 4, height - 6);
  c.fillStyle = '#397b9a'; c.fillRect(x + 2, y + height - 5, length - 4, 2);
  c.fillStyle = '#4b7184';
  for (let windowX = 8; windowX + 8 < length - 10; windowX += 14) c.fillRect(x + windowX, y + 4, 8, Math.max(2, height - 10));
  // 進行方向の先頭: 運転席の窓と前照灯。
  c.fillStyle = '#4b7184'; c.fillRect(head ? x + length - 9 : x + 3, y + 3, 6, Math.max(2, height - 9));
  c.fillStyle = '#f2d36b'; c.fillRect(head ? x + length - 2 : x, y + height - 6, 2, 3);
  c.fillStyle = '#253540';
  for (let wheelX = 10; wheelX + 7 < length; wheelX += 30) c.fillRect(x + wheelX, y + height - 3, 7, 2);
  c.restore();
}

export function drawTownTrains(c: CanvasRenderingContext2D, area: AreaRuntime, timeSeconds: number): void {
  for (const frame of service.frames(area, timeSeconds)) drawTrainFrame(c, frame);
}
