import type { Heading } from './direction';

/** 演出の時間配分（ミリ秒）。暫定値で、仕様として確定したものではない。画面を暗くする区間は無い。 */
export interface RideTiming {
  readonly walkIn: number; readonly doorClose: number; readonly depart: number;
  readonly arrive: number; readonly doorOpen: number; readonly walkOut: number; readonly settle: number;
}
export const RIDE_TIMING: RideTiming = Object.freeze({
  walkIn: 1200, doorClose: 450, depart: 1700, arrive: 1700, doorOpen: 400, walkOut: 900, settle: 200,
});
/** 動きを減らす設定: 移動の描画を省き、到着した状態を短く見せるだけ。暗転もしない。 */
export const REDUCED_TIMING: RideTiming = Object.freeze({
  walkIn: 0, doorClose: 0, depart: 0, arrive: 0, doorOpen: 0, walkOut: 0, settle: 700,
});

export type RidePhase = 'walk-in' | 'door-close' | 'depart' | 'arrive' | 'door-open' | 'walk-out' | 'settle' | 'done';
const KEY: Record<Exclude<RidePhase, 'done'>, keyof RideTiming> = {
  'walk-in': 'walkIn', 'door-close': 'doorClose', depart: 'depart', arrive: 'arrive',
  'door-open': 'doorOpen', 'walk-out': 'walkOut', settle: 'settle',
};
type Timed = Exclude<RidePhase, 'done'>;
const BEFORE_COMMIT: readonly Timed[] = ['walk-in', 'door-close', 'depart'];
const AFTER_COMMIT: readonly Timed[] = ['arrive', 'door-open', 'walk-out', 'settle'];

export interface RideSnapshot { readonly phase: RidePhase; /** 0..1 within the phase */ readonly progress: number; readonly heading: Heading }

/**
 * 乗車演出の時計。位置の確定（commit）は、出発する列車が画面の外へ出たあと、到着の列車が入る前に1回だけ呼ぶ。
 * commit が false なら到着の演出は行わず、すぐ終わる（位置は変わっていない）。
 */
export class RideDirector {
  private phases: Timed[];
  private index = 0;
  private elapsed = 0;
  private committed = false;
  private finished = false;

  constructor(private readonly heading: Heading, private readonly commit: () => boolean,
    private readonly onDone: (ok: boolean) => void, private readonly timing: RideTiming = RIDE_TIMING) {
    const timed = (list: readonly Timed[]) => list.filter(phase => timing[KEY[phase]] > 0);
    this.phases = [...timed(BEFORE_COMMIT)];
    this.afterCommit = timed(AFTER_COMMIT);
    this.settle();
  }
  private afterCommit: Timed[];

  get snapshot(): RideSnapshot {
    if (this.finished) return { phase: 'done', progress: 1, heading: this.heading };
    const phase = this.phases[this.index];
    return { phase, progress: Math.min(1, this.elapsed / this.timing[KEY[phase]]), heading: this.heading };
  }

  /** Run the commit once all pre-commit phases are over. */
  private settle(): void {
    while (!this.finished && !this.committed && this.index >= this.phases.length) {
      this.committed = true;
      if (!this.commit()) { this.finished = true; this.onDone(false); return; }
      this.phases = this.afterCommit; this.index = 0; this.elapsed = 0;
    }
    if (!this.finished && this.committed && this.index >= this.phases.length) { this.finished = true; this.onDone(true); }
  }

  /** A single large dt is capped, so it can neither skip the commit nor run it twice. */
  advance(dtMs: number): void {
    if (!(dtMs > 0)) return;
    let remaining = Math.min(dtMs, 250);
    while (remaining > 0 && !this.finished) {
      const length = this.timing[KEY[this.phases[this.index]]];
      const step = Math.min(remaining, length - this.elapsed);
      this.elapsed += step; remaining -= step;
      if (this.elapsed >= length) { this.index++; this.elapsed = 0; this.settle(); }
    }
  }
}
