/**
 * ミニマップの目的地の印（docs/features/story.md の「お使い」：未達成の行き先をミニマップの印で示し、達成済みは印を変える）。
 * 呼び出し側（ストーリー）が施設 id と相手・エリアを渡し、targets.ts が位置を解決する。ここは印の配置と描画を受け持つ。
 */
import type { MapPoint, MapProjection } from './model';
import { projectPoint } from './model';

export interface MinimapGoals {
  /** まだ済んでいない目的地の施設 id。 */
  readonly pending: readonly string[];
  /** 済んだ目的地の施設 id。 */
  readonly done: readonly string[];
  /** 施設の先にいる相手、または出来事が起きるエリア。 */
  readonly targets?: readonly MinimapTarget[];
}

export type MinimapTarget = { readonly id: string } & (
  | { readonly eventKey: string }
  | { readonly areaIds: readonly string[] }
);

export interface GoalLocation extends MapPoint { readonly id: string }

export interface GoalMark {
  readonly id: string;
  readonly state: 'pending' | 'done';
  readonly x: number;
  readonly y: number;
  /** 描画範囲の外にあり、端に寄せて表示している。 */
  readonly clamped: boolean;
}

/**
 * 現在のエリアにある目的地の印の位置。まだの目的地は範囲外でも端に寄せて示し、済んだ目的地は範囲内のときだけ示す。
 * 同じ施設が両方に含まれるときは、まだの方を優先する。
 */
export function layoutGoalMarks(markers: readonly GoalLocation[], goals: MinimapGoals | undefined, projection: MapProjection,
  width: number, height: number, inset: number): GoalMark[] {
  if (!goals) return [];
  const pending = new Set(goals.pending);
  const done = new Set(goals.done.filter(id => !pending.has(id)));
  const marks: GoalMark[] = [];
  for (const marker of markers) {
    const state = pending.has(marker.id) ? 'pending' : done.has(marker.id) ? 'done' : undefined;
    if (!state) continue;
    const point: MapPoint = projectPoint(projection, marker);
    const x = Math.min(width - inset, Math.max(inset, point.x));
    const y = Math.min(height - inset, Math.max(inset, point.y));
    const clamped = x !== point.x || y !== point.y;
    if (clamped && state === 'done') continue;
    marks.push({ id: marker.id, state, x, y, clamped });
  }
  return marks;
}

/** 目的地の印を描く。まだの目的地は黄色の輪と「!」、済んだ目的地は緑の丸とチェック。 */
export function drawGoalMark(context: CanvasRenderingContext2D, mark: GoalMark, radius: number): void {
  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';
  if (mark.state === 'pending') {
    context.beginPath();
    context.arc(mark.x, mark.y, radius, 0, Math.PI * 2);
    context.lineWidth = Math.max(3, radius * .32);
    context.strokeStyle = '#243034';
    context.stroke();
    context.lineWidth = Math.max(2, radius * .2);
    context.strokeStyle = '#ffd23f';
    context.stroke();
    const s = radius * .5;
    context.fillStyle = '#e0443e';
    context.strokeStyle = '#fff9e9';
    context.lineWidth = Math.max(1, s * .3);
    context.beginPath();
    context.arc(mark.x + radius * .75, mark.y - radius * .75, s, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#fff9e9';
    context.fillRect(mark.x + radius * .75 - s * .14, mark.y - radius * .75 - s * .6, s * .28, s * .7);
    context.fillRect(mark.x + radius * .75 - s * .14, mark.y - radius * .75 + s * .25, s * .28, s * .28);
  } else {
    const r = radius * .55;
    context.beginPath();
    context.arc(mark.x + radius * .7, mark.y - radius * .7, r, 0, Math.PI * 2);
    context.fillStyle = '#3f9b5a';
    context.fill();
    context.lineWidth = Math.max(1, r * .25);
    context.strokeStyle = '#fff9e9';
    context.stroke();
    context.beginPath();
    context.moveTo(mark.x + radius * .7 - r * .5, mark.y - radius * .7);
    context.lineTo(mark.x + radius * .7 - r * .1, mark.y - radius * .7 + r * .4);
    context.lineTo(mark.x + radius * .7 + r * .5, mark.y - radius * .7 - r * .4);
    context.lineWidth = Math.max(1.5, r * .3);
    context.stroke();
  }
  context.restore();
}
