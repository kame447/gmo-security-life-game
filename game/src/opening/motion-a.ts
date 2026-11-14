/**
 * 案A の時間割りと位置計算（DOM 非依存）。位置は画面の中心を原点にした論理ピクセル。
 * 「回避！」の 3 文字は一まとまりで、高さを一度も変えず、落とし穴の範囲にも入らない。落ちるのは「人生の落とし穴」だけ。
 */
import { easeOut, hash, seg } from './core';

export const A_TIME = {
  SLIDE_FROM: 0.5, SLIDE_TO: 1.15,
  DROP_FROM: 1.25, DROP_STEP: 0.09, DROP_TIME: 0.7,
  // 最後の文字が着地したらすぐ地面が割れ、穴は一気に開く。
  CRACK_FROM: 2.55, PIT_FROM: 2.85, PIT_TO: 3.15,
  FALL_FROM: 3.05, FALL_TIME: 0.7,
  SHINE_FROM: 4.4, SHINE_TIME: 0.7, SHINE_EVERY: 6,
  END: 5.6,
} as const;

/** 地上に残る文字の数（「回避！」＝文字番号 0〜2）。 */
export const EVADE_COUNT = 3;
/** 落ちる最初の文字番号。3〜9 が「人生の落とし穴」。 */
export const FALL_FIRST = EVADE_COUNT;
export type EvadeIndex = 0 | 1 | 2;
export const EVADE_INDEXES: readonly EvadeIndex[] = [0, 1, 2];

/** 「回避！」の行の高さ。全時刻で変わらない。 */
export const EVADE_Y = -86;
/** 「回」「避」「！」の落ち着く位置。「！」は字の幅が狭いので少し詰め、3 文字の見た目が中央にそろうよう右へ寄せる。 */
export const EVADE_X: readonly [number, number, number] = [-40, 8, 52];
/** 「回避！」のスプライトの中心から端までの長さ（文字 44 ＋ 縁取りと影の余白）。 */
export const EVADE_HALF = 27;
/** 「人生の落とし穴」が着地する高さ。 */
export const BOTTOM_Y = -40;
/** 開ききった落とし穴の外接矩形（画像 160×112 の 1.3 倍）。 */
export const PIT = { x: 0, y: 18, w: 208, h: 146 } as const;

/** 落とし穴の開き具合（0〜1）。 */
export function pitOpen(t: number): number {
  return easeOut(seg(t, A_TIME.PIT_FROM, A_TIME.PIT_TO));
}

/** 地割れの間の揺れの強さ（0〜1）。 */
export function rumble(t: number): number {
  return seg(t, A_TIME.CRACK_FROM, A_TIME.PIT_FROM) * (1 - seg(t, A_TIME.PIT_TO, A_TIME.PIT_TO + 0.3));
}

/** 画面の揺れ。横方向だけにして、「回避！」を上下に動かさない。 */
export function shakeX(t: number, landing: boolean): number {
  const amount = Math.max(rumble(t) * 2, landing ? 1 : 0);
  return amount > 0 ? Math.round((hash(Math.floor(t * 40)) - 0.5) * 2 * amount) : 0;
}

/** 「回」(0)・「避」(1)・「！」(2) の中心。3 文字そろって左の画面外から横にすべり込み、以後は地上のその場に留まる。 */
export function evadePose(index: EvadeIndex, t: number, viewW: number): { x: number; y: number } {
  const slide = easeOut(seg(t, A_TIME.SLIDE_FROM, A_TIME.SLIDE_TO));
  const off = -Math.round((viewW / 2 + EVADE_X[2] + EVADE_HALF + 8) * (1 - slide));
  const r = rumble(t);
  // 揺れは 3 文字で同じ量にして、まとまりを崩さない。
  const jitter = r > 0 ? Math.round((hash(Math.floor(t * 30)) - 0.5) * 2 * r) : 0;
  return { x: EVADE_X[index] + off + jitter, y: EVADE_Y };
}

/** 「人生の落とし穴」の文字（番号 3〜9）が降り始める時刻。 */
export function dropStart(index: number): number {
  return A_TIME.DROP_FROM + (index - FALL_FIRST) * A_TIME.DROP_STEP;
}

/** 着地位置 homeX（中心からの距離）の文字が穴へ落ち始める時刻。中心に近い文字から落ちる。 */
export function fallStart(homeX: number): number {
  return A_TIME.FALL_FROM + (Math.abs(homeX) / 110) * 0.3;
}

/** 落ちた文字が穴の底で止まる位置。index はロゴの文字番号（3〜9＝「人生の落とし穴」）。 */
export function restPose(index: number): { x: number; y: number } {
  return { x: (index - 6) * 18, y: PIT.y + 4 + Math.round((hash(index + 5) - 0.5) * 6) };
}
