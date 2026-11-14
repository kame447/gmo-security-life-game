/**
 * 案A の時間割りと位置計算（DOM 非依存）。位置は画面の中心を原点にした論理ピクセル。
 * 「回避」の 2 文字は高さを一度も変えず、落とし穴の範囲にも入らない。落ちるのは「！人生の落とし穴」だけ。
 */
import { easeOut, hash, seg } from './core';

export const A_TIME = {
  SLIDE_FROM: 0.5, SLIDE_TO: 1.15,
  DROP_FROM: 1.25, DROP_STEP: 0.09, DROP_TIME: 0.7,
  CRACK_FROM: 3.0, PIT_FROM: 3.6, PIT_TO: 4.3,
  FALL_FROM: 4.1, FALL_TIME: 0.8,
  SHINE_FROM: 5.6, SHINE_TIME: 0.7, SHINE_EVERY: 6,
  END: 6.9,
} as const;

/** 「回避」の行の高さ。全時刻で変わらない。 */
export const EVADE_Y = -86;
/** 「回」「避」の落ち着く位置。2 文字で画面の中央に並ぶ。 */
export const EVADE_X: readonly [number, number] = [-24, 24];
/** 「回避」のスプライトの中心から端までの長さ（文字 44 ＋ 縁取りと影の余白）。 */
export const EVADE_HALF = 27;
/** 「！」と「人生の落とし穴」が着地する位置。 */
export const BANG_X = 68, BOTTOM_Y = -40;
/** 開ききった落とし穴の外接矩形（画像 160×112 の 1.3 倍）。 */
export const PIT = { x: 0, y: 18, w: 208, h: 146 } as const;

/** 地割れの間の揺れの強さ（0〜1）。 */
export function rumble(t: number): number {
  return seg(t, A_TIME.CRACK_FROM, A_TIME.PIT_FROM) * (1 - seg(t, A_TIME.PIT_TO, A_TIME.PIT_TO + 0.3));
}

/** 画面の揺れ。横方向だけにして、「回避」を上下に動かさない。 */
export function shakeX(t: number, landing: boolean): number {
  const amount = Math.max(rumble(t) * 2, landing ? 1 : 0);
  return amount > 0 ? Math.round((hash(Math.floor(t * 40)) - 0.5) * 2 * amount) : 0;
}

/** 「回」(0)・「避」(1) の中心。左の画面外から横にすべり込み、以後は地上のその場に留まる。 */
export function evadePose(index: 0 | 1, t: number, viewW: number): { x: number; y: number } {
  const slide = easeOut(seg(t, A_TIME.SLIDE_FROM, A_TIME.SLIDE_TO));
  const off = -Math.round((viewW / 2 + 60) * (1 - slide));
  const r = rumble(t);
  const jitter = r > 0 ? Math.round((hash(index * 13 + Math.floor(t * 30)) - 0.5) * 2 * r) : 0;
  return { x: EVADE_X[index] + off + jitter, y: EVADE_Y };
}

/** 落ちた文字が穴の底で止まる位置。index はロゴの文字番号（2＝「！」、3〜9＝「人生の落とし穴」）。 */
export function restPose(index: number): { x: number; y: number; rot: number } {
  if (index === 2) return { x: 42, y: PIT.y - 22, rot: 0.3 };
  return { x: (index - 6) * 18, y: PIT.y + 4 + Math.round((hash(index + 5) - 0.5) * 6), rot: 0 };
}
