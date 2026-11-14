import { TILE } from '../core/coords';
import type { AreaRuntime } from '../world';
import { lineFootY, type TownRailLayout } from '../world/rail-layout';
import { TOWN_RAIL_LAYOUTS } from '../world/rail-layouts';
import { headingOf, type RailDirection, type RailHeading } from '../world/rail-geometry';
import { TOWN_TRAIN_PROTOTYPE, validateTrainConfig, type TownTrainConfig } from './config';

/** The rows a line occupies, with right and bottom exclusive (for the up line this spans both rows). */
export interface RailStripBounds { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
export interface TrainFrame {
  /** 車列の左端（エリアの座標 px）。 */
  readonly x: number;
  /** 車体の上端。足元（footY）から車体の高さだけ上。 */
  readonly y: number;
  readonly length: number;
  readonly height: number;
  /** 車列の中央での足元（線路の行の下端）。奥行きの並べ替えに使う。 */
  readonly footY: number;
  readonly strip: RailStripBounds;
  readonly direction: RailDirection;
  readonly heading: RailHeading;
}

/** 駅の区間（ポイントを含む）の左右の端（px）。この間は1線なので、上りと下りが同時に走らない。 */
export function singleZone(layout: TownRailLayout): { left: number; right: number } {
  return { left: (layout.singleX0 - 1) * TILE, right: (layout.singleX1 + 1) * TILE };
}

/**
 * 上りの時刻のずらし（秒）。下りと上りが駅の区間に入っている時間帯が、周期のなかで重ならず、
 * 前後の余裕が最も大きくなる値を、決定的に探す。
 */
export function upLineOffset(layout: TownRailLayout, width: number, config: Readonly<TownTrainConfig>): number {
  const { left, right } = singleZone(layout), v = config.speedPixelsPerSecond, T = config.intervalSeconds, L = config.lengthPixels;
  const W = width * TILE, step = 0.05;
  const spacing = T * v, copies = Math.ceil((W + L) / spacing) + 1;
  const inZone = (direction: RailDirection, tt: number): boolean => {
    const p = ((tt % T) + T) % T * v;
    for (let k = 0; k < copies; k++) {
      const x = direction === 'down' ? -L + p + k * spacing : W - p - k * spacing;
      if (x + L > left && x < right) return true;
    }
    return false;
  };
  let best = 0, bestMargin = -1;
  for (let offset = 0; offset < T; offset += step) {
    // 各時刻 t について、下りが区間内の間は、上りが区間の外にある余裕（秒）を測る。
    let margin = Infinity, clash = false;
    for (let t = 0; t < T && !clash; t += step) {
      if (!inZone('down', t)) continue;
      if (inZone('up', t + offset)) { clash = true; break; }
      let k = 0;
      while (k < T && !inZone('up', t + offset + k) && !inZone('up', t + offset - k)) k += step;
      margin = Math.min(margin, k);
    }
    if (!clash && margin > bestMargin) { bestMargin = margin; best = offset; }
  }
  return Math.round(best / step) * step;
}

/** The schedule is derived from the supplied clock; it does not alter Game or saves. */
export class TownTrainService {
  private readonly config: Readonly<TownTrainConfig>;
  private readonly offsets = new Map<string, number>();

  constructor(config: Readonly<TownTrainConfig> = TOWN_TRAIN_PROTOTYPE) {
    validateTrainConfig(config);
    this.config = Object.freeze({ ...config });
  }

  /** layout を省くと、エリアの登録済みの線形を使う。屋内や線路の無いエリアは空。 */
  frames(area: AreaRuntime, timeSeconds: number, layout: TownRailLayout | undefined = TOWN_RAIL_LAYOUTS[area.def.id]): TrainFrame[] {
    if (!layout || area.def.kind !== 'outdoor' || !Number.isFinite(timeSeconds) || timeSeconds < 0) return [];
    const { intervalSeconds, speedPixelsPerSecond, lengthPixels, heightPixels } = this.config;
    const spacing = intervalSeconds * speedPixelsPerSecond, W = area.width * TILE;
    const key = `${area.def.id}:${layout.singleX0}:${layout.singleX1}:${W}`;
    let offset = this.offsets.get(key);
    if (offset === undefined) { offset = upLineOffset(layout, area.width, this.config); this.offsets.set(key, offset); }
    const frames: TrainFrame[] = [];
    for (const direction of ['down', 'up'] as const) {
      const heading = headingOf(direction);
      const phase = (((timeSeconds + (direction === 'up' ? offset : 0)) % intervalSeconds)) * speedPixelsPerSecond;
      const strip: RailStripBounds = { left: 0, right: W, top: layout.northRow * TILE, bottom: ((direction === 'down' ? layout.northRow : layout.southRow) + 1) * TILE };
      const push = (x: number) => {
        const footY = lineFootY(layout, direction, x + lengthPixels / 2);
        frames.push({ x, y: footY - heightPixels, length: lengthPixels, height: heightPixels, footY, strip, direction, heading });
      };
      if (heading === 'right') {
        for (let x = -lengthPixels + phase; x < W; x += spacing) if (x + lengthPixels > 0) push(x);
      } else {
        for (let x = W - phase; x + lengthPixels > 0; x -= spacing) if (x < W) push(x);
      }
    }
    return frames;
  }
}
