/**
 * 検証用フック。E2E（scripts/e2e.mjs）と性能計測（scripts/perf.mjs）が window.__slg から参照する。
 * ゲームの挙動には影響しない。
 */
import type { Facing } from '../core/coords';
import type { InputState } from '../map/explorer';
import type { Renderer } from '../render/renderer';
import type { Game } from '../session/game';
import type { LoopFrame } from './loop';

export interface FrameSample {
  t: number; interval: number; updateMs: number; drawMs: number; dt: number;
  px: number; py: number; camX: number; camY: number; areaId: string; fading: boolean;
  chunksBakedThisFrame: number; spritesDrawn: number; moving: boolean;
  dir: Facing | null; run: boolean;
  steps: number; droppedMs: number;
}

export class FrameRecorder {
  private samples: FrameSample[] = [];
  recording = false;

  start(): void { this.samples = []; this.recording = true; }
  stop(): FrameSample[] {
    this.recording = false;
    const samples = this.samples;
    this.samples = [];
    return samples;
  }

  record(now: number, frame: LoopFrame, input: InputState, game: Game, renderer: Renderer): void {
    if (!frame.measured) return;
    const stats = renderer.stats;
    this.samples.push({ t: now, interval: frame.interval, updateMs: frame.updateMs, drawMs: frame.drawMs, dt: frame.dt,
      px: game.player.x, py: game.player.y, camX: stats.camX, camY: stats.camY, areaId: game.player.areaId,
      fading: stats.fading, chunksBakedThisFrame: stats.chunksBakedThisFrame, spritesDrawn: stats.spritesDrawn, moving: game.moving,
      dir: input.dir, run: input.run, steps: frame.steps, droppedMs: frame.droppedMs });
  }
}

declare global {
  interface Window { __slg: { game: Game; renderer: Renderer; frames: FrameRecorder } }
}

export function exposeDebug(game: Game, renderer: Renderer, frames: FrameRecorder): void {
  window.__slg = { game, renderer, frames };
}
