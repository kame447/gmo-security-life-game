import { TILE } from '../core/coords';
import type { AreaRuntime } from '../world';
import { isRailGround, T } from '../world/tiles';
import { TOWN_TRAIN_PROTOTYPE, validateTrainConfig, type TownTrainConfig } from './config';

/** A continuous rectangle of actual rail ground, with right and bottom exclusive. */
export interface RailStrip { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
export interface TrainFrame {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly height: number;
  readonly strip: RailStrip;
}

/** Find a horizontal path in each connected outdoor rail component. */
export function findRailStrips(area: AreaRuntime): RailStrip[] {
  if (area.def.kind !== 'outdoor') return [];
  const { width, height, ground } = area;
  const visited = new Uint8Array(width * height);
  const strips: RailStrip[] = [];
  for (let first = 0; first < visited.length; first++) {
    if (visited[first] || !isRailGround(ground[first])) continue;
    const queue = [first];
    visited[first] = 1;
    const cells = new Set<number>();
    let left = width, right = 0, top = height, bottom = 0, hasTrack = false;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor], x = id % width, y = Math.floor(id / width);
      cells.add(id);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      if (ground[id] === T.RAIL || ground[id] === T.RAIL_BRIDGE) hasTrack = true;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (!visited[next] && isRailGround(ground[next])) { visited[next] = 1; queue.push(next); }
      }
    }
    if (!hasTrack) continue;
    let best: { start: number; end: number; y: number; rows: number } | undefined;
    // Prefer two rail rows when they have the same span, centred in the component.
    for (const rows of [2, 1]) for (let y = top; y + rows - 1 <= bottom; y++) {
      let start = left;
      for (let x = left; x <= right + 1; x++) {
        const valid = x <= right && cells.has(y * width + x) && (rows === 1 || cells.has((y + 1) * width + x));
        if (valid) continue;
        const length = x - start;
        const distance = Math.abs(y + rows / 2 - (top + bottom + 1) / 2);
        const oldDistance = best ? Math.abs(best.y + best.rows / 2 - (top + bottom + 1) / 2) : Infinity;
        if (length >= 2 && (!best || length > best.end - best.start ||
          (length === best.end - best.start && (rows > best.rows || (rows === best.rows && distance < oldDistance))))) {
          best = { start, end: x, y, rows };
        }
        start = x + 1;
      }
    }
    if (best) strips.push({ left: best.start * TILE, right: best.end * TILE, top: best.y * TILE, bottom: (best.y + best.rows) * TILE });
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
    const phase = (timeSeconds % intervalSeconds) * speedPixelsPerSecond;
    const frames: TrainFrame[] = [];
    for (const strip of strips) {
      const height = Math.min(heightPixels, strip.bottom - strip.top);
      for (let x = strip.left - lengthPixels + phase; x < strip.right; x += spacing) {
        if (x + lengthPixels <= strip.left) continue;
        frames.push({ x, y: strip.top + (strip.bottom - strip.top - height) / 2, length: lengthPixels, height, strip });
      }
    }
    return frames;
  }
}
