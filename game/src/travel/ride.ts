import type { Heading } from './direction';

/** 演出の時間配分（ミリ秒）。暫定値で、仕様として確定したものではない。 */
export interface RideTiming {
  readonly walkIn: number; readonly doorClose: number; readonly depart: number;
  readonly fadeOut: number; readonly fadeIn: number; readonly arrive: number; readonly doorOpen: number;
  readonly walkOut: number; readonly settle: number;
}
export const RIDE_TIMING: RideTiming = Object.freeze({
  walkIn: 1100, doorClose: 500, depart: 1500, fadeOut: 400, fadeIn: 350, arrive: 1500, doorOpen: 450, walkOut: 900, settle: 250,
});
/** 動きを減らす設定では、移動の描画を行わず暗転だけで切り替える。 */
export const REDUCED_TIMING: RideTiming = Object.freeze({
  walkIn: 0, doorClose: 0, depart: 0, fadeOut: 300, fadeIn: 300, arrive: 0, doorOpen: 0, walkOut: 0, settle: 0,
});

export type RidePhase = 'walk-in' | 'door-close' | 'depart' | 'fade-out' | 'fade-in' | 'arrive' | 'door-open' | 'walk-out' | 'settle' | 'done';
const KEY: Record<Exclude<RidePhase, 'done'>, keyof RideTiming> = {
  'walk-in': 'walkIn', 'door-close': 'doorClose', depart: 'depart', 'fade-out': 'fadeOut', 'fade-in': 'fadeIn',
  arrive: 'arrive', 'door-open': 'doorOpen', 'walk-out': 'walkOut', settle: 'settle',
};
const ORDER = Object.keys(KEY) as Exclude<RidePhase, 'done'>[];

export interface RideSnapshot { readonly phase: RidePhase; /** 0..1 within the phase */ readonly progress: number; readonly heading: Heading; readonly failed: boolean }

/**
 * 乗車演出の時計。commit は暗転が最も濃い瞬間（fade-out の終わり）に、1回だけ呼ばれる。
 * commit が false なら到着の演出へ進まず、暗転を戻して終わる。fade-out と fade-in の長さは正であること。
 */
export class RideDirector {
  private phases: Exclude<RidePhase, 'done'>[];
  private index = 0;
  private elapsed = 0;
  private failed = false;
  private finished = false;

  constructor(private readonly heading: Heading, private readonly commit: () => boolean,
    private readonly onDone: (ok: boolean) => void, private readonly timing: RideTiming = RIDE_TIMING) {
    this.phases = ORDER.filter(phase => timing[KEY[phase]] > 0);
  }

  get snapshot(): RideSnapshot {
    if (this.finished) return { phase: 'done', progress: 1, heading: this.heading, failed: this.failed };
    const phase = this.phases[this.index];
    return { phase, progress: Math.min(1, this.elapsed / this.timing[KEY[phase]]), heading: this.heading, failed: this.failed };
  }

  private leave(): void {
    const phase = this.phases[this.index];
    this.elapsed = 0;
    if (phase === 'fade-out' && !this.commit()) {
      // Nothing moved: fade back in over the unchanged platform, then stop.
      this.failed = true;
      this.phases = ['fade-in'];
      this.index = 0;
      return;
    }
    this.index++;
    if (this.index >= this.phases.length) { this.finished = true; this.onDone(!this.failed); }
  }

  /** A single large dt is capped, so it can neither skip the commit nor run it twice. */
  advance(dtMs: number): void {
    if (!(dtMs > 0)) return;
    let remaining = Math.min(dtMs, 250);
    while (remaining > 0 && !this.finished) {
      const length = this.timing[KEY[this.phases[this.index]]];
      const step = Math.min(remaining, length - this.elapsed);
      this.elapsed += step; remaining -= step;
      if (this.elapsed >= length) this.leave();
    }
  }
}
