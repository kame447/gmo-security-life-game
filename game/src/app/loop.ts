/**
 * 固定刻みの更新ループ。経過時間を蓄積して 1/120 秒ずつ更新し、描画は1フレーム1回。
 * Prototype proposals: <=1.07px per running substep, at most 30 updates after a stall.
 */
import type { InputState } from '../map/explorer';

export const FIXED_STEP = 1 / 120;
export const MAX_ACCUMULATED = 0.25;

export interface LoopFrame {
  interval: number;
  steps: number;
  dt: number;
  droppedMs: number;
  /** Timing is sampled only when `measuring()` was true for this frame; otherwise 0. */
  updateMs: number;
  drawMs: number;
  measured: boolean;
}

export interface LoopHooks {
  beforeFrame(): void;
  input(): InputState;
  update(dt: number, input: InputState): void;
  draw(now: number): void;
  afterFrame(now: number, frame: LoopFrame, input: InputState): void;
  measuring(): boolean;
}

export function startLoop(hooks: LoopHooks): { resetClock(): void } {
  let previous = 0;
  let accumulator = 0;
  function frame(now: number) {
    hooks.beforeFrame();
    const interval = previous ? Math.max(0, now - previous) : 0;
    previous = now;
    const available = accumulator + interval / 1000;
    accumulator = Math.min(MAX_ACCUMULATED, available);
    const droppedMs = Math.max(0, available - accumulator) * 1000;
    const measured = hooks.measuring();
    const input = hooks.input();
    const updateStart = measured ? performance.now() : 0;
    let steps = 0;
    while (accumulator + 1e-9 >= FIXED_STEP) {
      hooks.update(FIXED_STEP, input);
      accumulator = Math.max(0, accumulator - FIXED_STEP);
      steps++;
    }
    const drawStart = measured ? performance.now() : 0;
    hooks.draw(now);
    const drawEnd = measured ? performance.now() : 0;
    hooks.afterFrame(now, { interval, steps, dt: steps * FIXED_STEP, droppedMs,
      updateMs: drawStart - updateStart, drawMs: drawEnd - drawStart, measured }, input);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { resetClock() { previous = 0; accumulator = 0; } };
}
