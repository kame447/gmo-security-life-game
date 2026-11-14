import { TILE } from '../core/coords';
import { PLAYER_H, PLAYER_W } from '../render/player-sprite';
import type { AreaRuntime } from '../world';
import { TOWN_RAIL_LAYOUTS } from '../world/rail-layouts';
import { T } from '../world/tiles';
import { TOWN_TRAIN_PROTOTYPE } from './config';
import { upLineOffset } from './service';

/** 仮値／要検証。予告は全退避距離 / 歩行速度 + escapeMarginSeconds より長く保つ。 */
export const CROSSING_PROTOTYPE = Object.freeze({
  warningSeconds: 2,
  lowerSeconds: 0.7,
  raiseSeconds: 0.7,
  escapeMarginSeconds: 0.35,
  clearancePixels: 3,
});

export interface Crossing {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  /** 足元の待機位置。列車の車体と主人公の絵全体も重ならない余白を取る。 */
  readonly northWaitY: number;
  readonly southWaitY: number;
}
export interface CrossingState {
  readonly phase: 'open' | 'closing' | 'closed' | 'opening';
  readonly blocked: boolean;
  /** 0 = 直立、1 = 水平。描画も衝突もこの状態から導く。 */
  readonly armDown: number;
  readonly trainPresent: boolean;
  readonly nextArrivalIn: number;
  readonly warningDirections: readonly ('down' | 'up')[];
}
const OPEN: CrossingState = Object.freeze({ phase: 'open', blocked: false, armDown: 0,
  trainPresent: false, nextArrivalIn: Infinity, warningDirections: [] });
const crossings = new WeakMap<AreaRuntime, readonly Crossing[]>();
const offsets = new WeakMap<AreaRuntime, number>();

/** 不変の実マップの CROSSING の連続区間を読む。座標の別リストは持たない。 */
export function getCrossings(area: AreaRuntime): readonly Crossing[] {
  const cached = crossings.get(area);
  if (cached) return cached;
  const layout = TOWN_RAIL_LAYOUTS[area.def.id], result: Crossing[] = [];
  if (layout && area.def.kind === 'outdoor') {
    const isCrossing = (x: number) => area.ground[layout.northRow * area.width + x] === T.CROSSING &&
      area.ground[layout.southRow * area.width + x] === T.CROSSING;
    for (let x = 0; x < area.width;) {
      if (!isCrossing(x)) { x++; continue; }
      const start = x;
      while (x < area.width && isCrossing(x)) x++;
      const top = layout.northRow * TILE, bottom = (layout.southRow + 1) * TILE;
      result.push(Object.freeze({ id: `${area.def.id}:${start}`, left: start * TILE, right: x * TILE, top, bottom,
        northWaitY: top - (TOWN_TRAIN_PROTOTYPE.heightPixels - TILE) - CROSSING_PROTOTYPE.clearancePixels,
        southWaitY: bottom + PLAYER_H + CROSSING_PROTOTYPE.clearancePixels }));
    }
  }
  crossings.set(area, result);
  return result;
}

/** 待機線から待機線まで。左右は足元の hitbox の半幅を渡し、角からの侵入も止める。 */
export function crossingContains(c: Crossing, x: number, y: number, halfWidth = 5): boolean {
  return x + halfWidth > c.left && x - halfWidth < c.right && y > c.northWaitY && y < c.southWaitY;
}

/**
 * 純粋な時刻 → 状態。定期列車と同じ速度・長さ・周期・上りのずらしで、画面外の接近列車も含める。
 * 地面、solid、保存、駅の演出には書き込まない。列車の端が絵の半幅まで抜けてから開ける。
 */
export function crossingState(area: AreaRuntime, crossing: Crossing, timeSeconds: number): CrossingState {
  const layout = TOWN_RAIL_LAYOUTS[area.def.id];
  if (!layout || area.def.kind !== 'outdoor' || !Number.isFinite(timeSeconds) || timeSeconds < 0) return OPEN;
  const { intervalSeconds: period, speedPixelsPerSecond: speed, lengthPixels: length } = TOWN_TRAIN_PROTOTYPE;
  let offset = offsets.get(area);
  if (offset === undefined) { offset = upLineOffset(layout, area.width, TOWN_TRAIN_PROTOTYPE); offsets.set(area, offset); }
  // Normalize rounding at a period boundary, so t and t + period select the same phase.
  const t = (Math.round((timeSeconds % period) * 1e9) / 1e9) % period;
  const halfPerson = PLAYER_W / 2 + CROSSING_PROTOTYPE.clearancePixels;
  const left = crossing.left - halfPerson, right = crossing.right + halfPerson, width = area.width * TILE;
  const passages = [
    { direction: 'down' as const, arrival: left / speed, clear: (right + length) / speed },
    { direction: 'up' as const, arrival: (width - right) / speed - offset, clear: (width - left + length) / speed - offset },
  ];
  const windows: { start: number; end: number }[] = [];
  const directions = new Set<'down' | 'up'>();
  let trainPresent = false, nextArrivalIn = Infinity;
  for (const p of passages) {
    const first = Math.floor((t - p.arrival) / period);
    for (let k = first - 2; k <= first + 2; k++) {
      const arrival = p.arrival + k * period, clear = p.clear + k * period;
      const start = arrival - CROSSING_PROTOTYPE.warningSeconds;
      windows.push({ start, end: clear });
      if (t >= start && t < clear) directions.add(p.direction);
      if (t >= arrival && t < clear) { trainPresent = true; nextArrivalIn = 0; }
      if (arrival >= t) nextArrivalIn = Math.min(nextArrivalIn, arrival - t);
    }
  }
  windows.sort((a, b) => a.start - b.start);
  const merged: typeof windows = [];
  for (const w of windows) {
    const previous = merged[merged.length - 1];
    // Keep the bars down if a second warning would interrupt raising, rather than flicking them up and down.
    if (previous && w.start <= previous.end + CROSSING_PROTOTYPE.raiseSeconds + CROSSING_PROTOTYPE.lowerSeconds) {
      previous.end = Math.max(previous.end, w.end);
    } else merged.push({ ...w });
  }
  for (const w of merged) {
    if (t < w.start || t >= w.end + CROSSING_PROTOTYPE.raiseSeconds) continue;
    const age = t - w.start;
    if (age < CROSSING_PROTOTYPE.lowerSeconds) return { phase: 'closing', blocked: true,
      armDown: age / CROSSING_PROTOTYPE.lowerSeconds, trainPresent, nextArrivalIn, warningDirections: [...directions] };
    if (t < w.end) return { phase: 'closed', blocked: true, armDown: 1, trainPresent, nextArrivalIn, warningDirections: [...directions] };
    return { phase: 'opening', blocked: true, armDown: 1 - (t - w.end) / CROSSING_PROTOTYPE.raiseSeconds,
      trainPresent, nextArrivalIn, warningDirections: [...directions] };
  }
  return { ...OPEN, nextArrivalIn };
}
