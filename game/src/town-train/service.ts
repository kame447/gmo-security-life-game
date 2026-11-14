import { TILE } from '../core/coords';
import type { AreaRuntime } from '../world';
import { isRailGround, T } from '../world/tiles';
import { headingOf, type RailDirection, type RailHeading } from '../world/rail-geometry';
import { TOWN_TRAIN_PROTOTYPE, validateTrainConfig, type TownTrainConfig } from './config';

/** A continuous rectangle of actual rail ground, with right and bottom exclusive. */
export interface RailStripBounds { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
export interface TrainFrame {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly height: number;
  readonly strip: RailStripBounds;
  readonly direction: RailDirection;
  readonly heading: RailHeading;
}

/** One track row. A row with rail directly north of it is the south (up) line; the northernmost row is the down line. */
export interface RailStrip extends RailStripBounds { readonly direction: RailDirection }

/** Find one run per rail row (one tile high) in each connected outdoor rail component. */
export function findRailStrips(area: AreaRuntime): RailStrip[] {
  if (area.def.kind !== 'outdoor') return [];
  const { width, height, ground } = area;
  const at = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && isRailGround(ground[y * width + x]);
  const strips: RailStrip[] = [];
  for (let y = 0; y < height; y++) {
    let start = 0, hasTrack = false;
    for (let x = 0; x <= width; x++) {
      if (x < width && at(x, y)) { if (ground[y * width + x] === T.RAIL || ground[y * width + x] === T.RAIL_BRIDGE) hasTrack = true; continue; }
      if (x - start >= 2 && hasTrack) {
        const direction: RailDirection = at(start + Math.floor((x - start) / 2), y - 1) ? 'up' : 'down';
        strips.push({ left: start * TILE, right: x * TILE, top: y * TILE, bottom: (y + 1) * TILE, direction });
      }
      start = x + 1; hasTrack = false;
    }
  }
  return strips;
}

/** The schedule is derived from the supplied clock; it does not alter Game or saves. */
export class TownTrainService {
  private readonly strips = new WeakMap<AreaRuntime, RailStrip[]>();
  private readonly config: Readonly<TownTrainConfig>;

  constructor(config: Readonly<TownTrainConfig> = TOWN_TRAIN_PROTOTYPE) {
    validateTrainConfig(config);
    this.config = Object.freeze({ ...config });
  }

  frames(area: AreaRuntime, timeSeconds: number): TrainFrame[] {
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return [];
    let strips = this.strips.get(area);
    if (!strips) { strips = findRailStrips(area); this.strips.set(area, strips); }
    const { intervalSeconds, speedPixelsPerSecond, lengthPixels, heightPixels } = this.config;
    const spacing = intervalSeconds * speedPixelsPerSecond;
    const frames: TrainFrame[] = [];
    for (const strip of strips) {
      const height = Math.min(heightPixels, strip.bottom - strip.top), heading = headingOf(strip.direction);
      // 上り線は半周期ずらし、上下の列車が同じ位置に並ばないようにする。
      const phase = ((timeSeconds + (strip.direction === 'up' ? intervalSeconds / 2 : 0)) % intervalSeconds) * speedPixelsPerSecond;
      const y = strip.top + (strip.bottom - strip.top - height) / 2;
      if (heading === 'right') {
        for (let x = strip.left - lengthPixels + phase; x < strip.right; x += spacing) {
          if (x + lengthPixels > strip.left) frames.push({ x, y, length: lengthPixels, height, strip, direction: strip.direction, heading });
        }
      } else {
        for (let x = strip.right - phase; x + lengthPixels > strip.left; x -= spacing) {
          if (x < strip.right) frames.push({ x, y, length: lengthPixels, height, strip, direction: strip.direction, heading });
        }
      }
    }
    return frames;
  }
}
