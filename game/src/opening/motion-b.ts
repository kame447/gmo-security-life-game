/**
 * 案B の時間割りと主人公の動き（DOM 非依存）。位置は画面の中心を原点にした論理ピクセル。
 * 主人公は丁字路で左右を見比べて左へ進み、目の前に落とし穴が開くと引き返して右の道を選ぶ。跳ばない。
 */
import type { Facing } from '../core/coords';
import { seg } from './core';

export const B_TIME = {
  ARRIVE: 1.9, LOOK_LEFT: 2.3, LOOK_RIGHT: 2.75, DECIDE: 3.2,
  GO: 3.5, STOP: 3.9, CRACK_FROM: 3.6, PIT_FROM: 3.9, PIT_TO: 4.45,
  BACK_FROM: 4.0, BACK_TO: 4.25, TURN: 4.9, REACH: 6.3,
  TITLE_TOP: 6.45, TITLE_BOTTOM: 7.05, END: 8.1,
} as const;

/** 町の絵の拡大率と、1 タイルの論理ピクセル。 */
export const WORLD_SCALE = 2, TILE_PX = 32;
/** 横の道の上端（タイル行 0 の上端）。道は 2 タイル幅。 */
export const ROAD_TOP = -8;
/** 主人公の足元の高さ。横の道の上では変わらない。 */
export const FEET_Y = 34;
/** 主人公の半分の幅。 */
export const WALKER_HALF = 18;
/** 左の道に開く落とし穴の外接矩形。 */
export const PIT_B = { x: -84, y: 26, w: 64, h: 45 } as const;
const ENTER_FROM = 150, STOP_X = -24, BACK_X = -12, GOAL_X = 78;

export interface Walker { x: number; y: number; facing: Facing; walking: boolean; /** 歩いた距離。歩く絵のコマ送りに使う。 */ dist: number }

export function walker(t: number): Walker {
  const T = B_TIME;
  if (t < T.ARRIVE) {
    const p = seg(t, 0, T.ARRIVE);
    return { x: 0, y: FEET_Y + ENTER_FROM * (1 - p), facing: 'up', walking: true, dist: ENTER_FROM * p };
  }
  const still = (x: number, facing: Facing): Walker => ({ x, y: FEET_Y, facing, walking: false, dist: 0 });
  if (t < T.LOOK_LEFT) return still(0, 'up');
  if (t < T.LOOK_RIGHT) return still(0, 'left');
  if (t < T.DECIDE) return still(0, 'right');
  if (t < T.GO) return still(0, 'left');
  if (t < T.STOP) {
    const p = seg(t, T.GO, T.STOP);
    return { x: STOP_X * p, y: FEET_Y, facing: 'left', walking: true, dist: -STOP_X * p };
  }
  // 穴を前にして、向きはそのままで後ずさる。
  if (t < T.TURN) return still(STOP_X + (BACK_X - STOP_X) * seg(t, T.BACK_FROM, T.BACK_TO), 'left');
  if (t < T.REACH) {
    const p = seg(t, T.TURN, T.REACH);
    return { x: BACK_X + (GOAL_X - BACK_X) * p, y: FEET_Y, facing: 'right', walking: true, dist: (GOAL_X - BACK_X) * p };
  }
  return still(GOAL_X, 'down');
}

/** 地面の種類。横の道（行 0・1）と、下から上がってくる道（列 -1・0、行 2 以降）が丁字路になる。 */
export function isRoadTile(tx: number, ty: number): boolean {
  return ty === 0 || ty === 1 || (ty >= 2 && (tx === -1 || tx === 0));
}
