import { TILE, type Facing } from '../core/coords';
import type { StationFlow, StationPlatform } from './stations';
import { trainEntryX, trainExitX, trainStopX, TRAIN_LENGTH_PX } from '../town-train/station-scene';

/** 乗車演出の振り付け（描画なし）。時刻 t（ミリ秒）から、列車・主人公の代役・位置の確定の瞬間を決める純粋な関数。画面を暗くする量は無い。 */
export interface Pt { readonly x: number; readonly y: number }
export interface ActorFrame { x: number; y: number; facing: Facing; walking: boolean; visible: boolean }
export interface TrainFrame { x: number; doorOpen: number }
export interface Frame {
  /** 出発駅の場面／到着駅の場面／すべて終了。位置の確定は origin → destination の切れ目の1回。 */
  readonly stage: 'origin' | 'destination' | 'done';
  readonly train: TrainFrame | null;
  readonly actor: ActorFrame | null;
  /** 主人公の代役が最後の位置に着き、操作が戻ってよい。 */
  readonly control: boolean;
}

export const WALK_SPEED = 90;
export const TIMING = Object.freeze({
  trainIn: 1500, doorOpenAt: 1300, doorOpenMs: 400, step: 300, doorCloseMs: 450, hold: 150, depart: 1800,
  settleAfterAlight: 200, reducedHold: 700, accel: 220,
});

const feet = (x: number, y: number): Pt => ({ x: x * TILE + TILE / 2, y: y * TILE + 14 });
const same = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;
const compact = (points: Pt[]): Pt[] => points.filter((point, i) => i === 0 || !same(point, points[i - 1]));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const smooth = (p: number) => p * p * (3 - 2 * p);

export function pathLength(points: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  return total;
}

function facingOf(from: Pt, to: Pt): Facing {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

/** 経路の長さに沿った位置と向き。経路の外では端に止まる。 */
export function walkAlong(points: readonly Pt[], distance: number, endFacing: Facing): { pt: Pt; facing: Facing; walking: boolean } {
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (left < length) return { pt: { x: lerp(a.x, b.x, left / length), y: lerp(a.y, b.y, left / length) }, facing: facingOf(a, b), walking: true };
    left -= length;
  }
  return { pt: points[points.length - 1], facing: endFacing, walking: false };
}

export interface BoardPlan {
  /** 主人公の足元から、改札を通り、ホームを歩き、ドアの前まで。 */
  readonly path: readonly Pt[];
  readonly doorFacing: Facing;
  readonly door: Pt;
  readonly entryX: number; readonly stopX: number; readonly exitX: number;
}
export interface AlightPlan {
  readonly door: Pt;
  readonly doorFacing: Facing;
  /** ドアの前から下車位置まで。 */
  readonly path: readonly Pt[];
  readonly alightFacing: Facing;
  readonly entryX: number; readonly stopX: number; readonly exitX: number;
}

/**
 * 列車が出入りする位置は、部屋の端ではなく画面の端にする（カメラはドアの位置に追従し、部屋の端で止まる）。
 * 発車は最後尾が画面の外へ出きった位置、到着は先頭がちょうど画面の外にいる位置から始める。部屋の端のほうが近ければそちらを使う。
 */
export function viewEdges(platform: StationPlatform, areaWidthPx: number, viewWidthPx: number): { entryX: number; exitX: number } {
  const doorX = platform.door.x * TILE + TILE / 2;
  const half = viewWidthPx / 2;
  const center = areaWidthPx <= viewWidthPx ? areaWidthPx / 2 : Math.min(areaWidthPx - half, Math.max(half, doorX));
  const exitRoom = trainExitX(platform, areaWidthPx), entryRoom = trainEntryX(platform, areaWidthPx);
  if (platform.heading === 'right') {
    return { exitX: Math.min(exitRoom, center + half + 2), entryX: Math.max(entryRoom, center - half - TRAIN_LENGTH_PX - 2) };
  }
  return { exitX: Math.max(exitRoom, center - half - TRAIN_LENGTH_PX - 2), entryX: Math.min(entryRoom, center + half + 2) };
}

/** 改札の南の足元 → 改札の列を上がって乗車位置の行へ → 乗車位置 → ドアの前（doorFront）。 */
export function boardPlan(start: Pt, platform: StationPlatform, areaWidthPx: number, viewWidthPx = areaWidthPx): BoardPlan {
  const edges = viewEdges(platform, areaWidthPx, viewWidthPx);
  const column = Math.floor(start.x / TILE), b = platform.boardTile, f = platform.doorFront;
  const path = compact([start, feet(column, b.y), feet(b.x, b.y), feet(f.x, f.y)]);
  return { path, doorFacing: facingOf(feet(f.x, f.y), feet(platform.door.x, platform.door.y)), door: feet(platform.door.x, platform.door.y),
    entryX: edges.entryX, stopX: trainStopX(platform), exitX: edges.exitX };
}

/** ドアの前 → 乗車位置の行 → 下車位置の列 → 下車位置。 */
export function alightPlan(platform: StationPlatform, alight: StationFlow['alight'], areaWidthPx: number, viewWidthPx = areaWidthPx): AlightPlan {
  const edges = viewEdges(platform, areaWidthPx, viewWidthPx);
  const b = platform.boardTile, f = platform.doorFront;
  return { door: feet(platform.door.x, platform.door.y), doorFacing: facingOf(feet(platform.door.x, platform.door.y), feet(f.x, f.y)),
    path: compact([feet(f.x, f.y), feet(b.x, b.y), feet(alight.x, b.y), feet(alight.x, alight.y)]),
    alightFacing: alight.facing, entryX: edges.entryX, stopX: trainStopX(platform), exitX: edges.exitX };
}

/** 乗車から到着・下車まで。動きを減らす設定では、到着した状態を短く見せるだけ。 */
export class RideScript {
  private readonly walkIn: number;
  private readonly boardAt: number;
  private readonly commitAt: number;
  private readonly walkOut: number;
  private readonly departMs: number;
  private readonly exitSpeed: number;
  private readonly arriveDistance: number;
  private readonly arriveMs: number;

  constructor(private readonly board: BoardPlan, private readonly alight: AlightPlan, private readonly reduced = false) {
    this.walkIn = pathLength(board.path) / WALK_SPEED * 1000;
    this.boardAt = Math.max(this.walkIn, TIMING.doorOpenAt + TIMING.doorOpenMs);
    // 出発は一定の加速で画面の外へ。到着は、その切り替えの瞬間の速さのまま一定の減速で止まる（切り替えの前後で列車の速さが同じ）。
    this.departMs = Math.sqrt(2 * Math.abs(board.exitX - board.stopX) / TIMING.accel) * 1000;
    this.exitSpeed = TIMING.accel * this.departMs / 1000;
    this.arriveDistance = Math.abs(alight.stopX - alight.entryX);
    this.arriveMs = this.exitSpeed > 0 ? 2 * this.arriveDistance / this.exitSpeed * 1000 : 0;
    this.commitAt = reduced ? 0 : this.boardAt + TIMING.step + TIMING.doorCloseMs + TIMING.hold + this.departMs;
    this.walkOut = pathLength(alight.path) / WALK_SPEED * 1000;
  }

  /** 位置を確定する時刻（出発した列車が画面の外にいる瞬間）。 */
  get commitTime(): number { return this.commitAt; }

  sample(t: number): Frame {
    return t < this.commitAt ? this.origin(t) : this.destination(t - this.commitAt);
  }

  private origin(t: number): Frame {
    const b = this.board, end = b.path[b.path.length - 1];
    const stopped = t >= TIMING.trainIn;
    const trainX = stopped ? b.stopX : lerp(b.entryX, b.stopX, easeOut(t / TIMING.trainIn));
    let door = smooth(clamp01((t - TIMING.doorOpenAt) / TIMING.doorOpenMs));
    const stepEnd = this.boardAt + TIMING.step, closeEnd = stepEnd + TIMING.doorCloseMs, departAt = closeEnd + TIMING.hold;
    let train: TrainFrame = { x: trainX, doorOpen: door };
    let actor: ActorFrame;
    if (t < this.boardAt) {
      const w = walkAlong(b.path, t / 1000 * WALK_SPEED, b.doorFacing);
      actor = { x: w.pt.x, y: w.pt.y, facing: w.walking ? w.facing : b.doorFacing, walking: w.walking, visible: true };
    } else if (t < stepEnd) {
      const p = (t - this.boardAt) / TIMING.step;
      actor = { x: lerp(end.x, b.door.x, p), y: lerp(end.y, b.door.y, p), facing: b.doorFacing, walking: true, visible: true };
    } else actor = { x: b.door.x, y: b.door.y, facing: b.doorFacing, walking: false, visible: false };
    if (t >= stepEnd) door = 1 - smooth(clamp01((t - stepEnd) / TIMING.doorCloseMs));
    if (t >= departAt) {
      door = 0;
      const sec = (t - departAt) / 1000, dir = Math.sign(b.exitX - b.stopX);
      train = { x: b.stopX + dir * Math.min(Math.abs(b.exitX - b.stopX), 0.5 * TIMING.accel * sec * sec), doorOpen: 0 };
    } else train = { x: trainX, doorOpen: door };
    return { stage: 'origin', train, actor, control: false };
  }

  private destination(t: number): Frame {
    const a = this.alight, last = a.path[a.path.length - 1];
    if (this.reduced) {
      const done = t >= TIMING.reducedHold;
      return { stage: done ? 'done' : 'destination', train: done ? null : { x: a.stopX, doorOpen: 1 },
        actor: done ? null : { x: last.x, y: last.y, facing: a.alightFacing, walking: false, visible: true }, control: done };
    }
    const arriveMs = this.arriveMs, openAt = arriveMs - 150, stepAt = openAt + TIMING.doorOpenMs;
    const walkStart = stepAt + TIMING.step, ctrlAt = walkStart + this.walkOut + TIMING.settleAfterAlight;
    const closeAt = ctrlAt + 200, departAt = closeAt + TIMING.doorCloseMs + TIMING.hold, endAt = departAt + Math.sqrt(2 * Math.abs(a.exitX - a.stopX) / TIMING.accel) * 1000;
    if (t >= endAt) return { stage: 'done', train: null, actor: null, control: true };
    const stopped = t >= arriveMs, dirIn = Math.sign(a.stopX - a.entryX), decel = this.exitSpeed * this.exitSpeed / (2 * Math.max(1, this.arriveDistance));
    const remaining = stopped ? 0 : Math.max(0, this.arriveDistance - (this.exitSpeed * t / 1000 - 0.5 * decel * (t / 1000) ** 2));
    let train: TrainFrame = { x: a.stopX - dirIn * remaining, doorOpen: 0 };
    if (t < stepAt) train.doorOpen = smooth(clamp01((t - openAt) / TIMING.doorOpenMs));
    else if (t < closeAt) train.doorOpen = 1;
    else train.doorOpen = 1 - smooth(clamp01((t - closeAt) / TIMING.doorCloseMs));
    if (t >= departAt) {
      const sec = (t - departAt) / 1000, dir = Math.sign(a.exitX - a.stopX);
      train = { x: a.stopX + dir * Math.min(Math.abs(a.exitX - a.stopX), 0.5 * TIMING.accel * sec * sec), doorOpen: 0 };
    }
    let actor: ActorFrame | null;
    if (t >= ctrlAt) actor = null;
    else if (t < stepAt) actor = { x: a.door.x, y: a.door.y, facing: a.doorFacing, walking: false, visible: false };
    else if (t < walkStart) {
      const p = (t - stepAt) / TIMING.step, first = a.path[0];
      actor = { x: lerp(a.door.x, first.x, p), y: lerp(a.door.y, first.y, p), facing: a.doorFacing, walking: true, visible: true };
    } else {
      const w = walkAlong(a.path, (t - walkStart) / 1000 * WALK_SPEED, a.alightFacing);
      actor = { x: w.pt.x, y: w.pt.y, facing: w.walking ? w.facing : a.alightFacing, walking: w.walking, visible: true };
    }
    return { stage: 'destination', train, actor, control: t >= ctrlAt };
  }
}

/** 改札を北から出る短い動き（確認なし）。主人公の足元から、改札を通って南の1マスへ。 */
export function exitPath(start: Pt, gateY: number): readonly Pt[] {
  const column = Math.floor(start.x / TILE);
  return [start, feet(column, gateY), feet(column, gateY + 1)];
}
export function exitFrame(path: readonly Pt[], t: number): { actor: ActorFrame; done: boolean } {
  const w = walkAlong(path, t / 1000 * WALK_SPEED, 'down');
  return { actor: { x: w.pt.x, y: w.pt.y, facing: 'down', walking: w.walking, visible: true }, done: !w.walking };
}
