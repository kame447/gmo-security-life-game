import { T } from './tiles';
import type { RailDirection } from './rail-geometry';

/**
 * 街の線路の線形。駅の区間（駅舎の幅）だけ北の行の1線、その両端の1タイルのポイントを経て、外側は上下線の2線になる。
 * 下り（北の行）は全域まっすぐ。上り（南の行）は駅の区間の両端で北の行へ斜めに寄って合流し、反対側でまた南へ戻る。
 */
export interface TownRailLayout {
  readonly northRow: number;
  readonly southRow: number;
  /** 1線の区間（タイル）。singleX0 以上 singleX1 未満。ポイントはその外側の隣の1タイル。 */
  readonly singleX0: number;
  readonly singleX1: number;
}

export interface StationFrontage { readonly trackY: number; readonly trackRows: number; readonly building: { readonly x: number; readonly w: number } }

export const townRailLayout = (s: StationFrontage): TownRailLayout =>
  ({ northRow: s.trackY, southRow: s.trackY + 1, singleX0: s.building.x, singleX1: s.building.x + s.building.w });

/** ポイントの斜めの区間の長さ（タイル）。この間に上りの線が南の行から北の行へ1行ぶん寄る。 */
export const SWITCH_TILES = 3;

/** 線路の2行が敷かれたあとに呼び、駅の区間の南の行を柵にし、両側のポイントの tile を置く。 */
export function applyRailSwitches(ground: Uint8Array, width: number, layout: TownRailLayout): void {
  const { northRow: n, southRow: s, singleX0, singleX1 } = layout;
  const put = (x: number, y: number, tile: number) => { ground[y * width + x] = tile; };
  // 駅の区間（と、ポイントが北の行へ入りきった西端・東端の1タイル）の南の行は柵。
  for (let x = singleX0 - 1; x <= singleX1; x++) put(x, s, T.RAIL_FENCE);
  const w = singleX0 - SWITCH_TILES, e = singleX1;
  put(w, s, T.SWITCH_WS_A); put(w + 1, s, T.SWITCH_WS_B); put(w + 1, n, T.SWITCH_WN_C); put(w + 2, n, T.SWITCH_WN_D);
  put(e, n, T.SWITCH_EN_D); put(e + 1, n, T.SWITCH_EN_C); put(e + 1, s, T.SWITCH_ES_B); put(e + 2, s, T.SWITCH_ES_A);
}

/** ポイントを含む、1線の区間の左右の端（タイル）。 */
export const switchSpan = (layout: TownRailLayout): { left: number; right: number } =>
  ({ left: layout.singleX0 - SWITCH_TILES, right: layout.singleX1 + SWITCH_TILES });

/** 線の足元（線路の行の下端）の y を、x（px）の関数として返す。ポイントでは3タイルかけてなめらかに行を移る。 */
export function lineFootY(layout: TownRailLayout, direction: RailDirection, x: number): number {
  const north = (layout.northRow + 1) * 16, south = (layout.southRow + 1) * 16, ramp = SWITCH_TILES * 16;
  if (direction === 'down') return north;
  const w0 = (layout.singleX0 - SWITCH_TILES) * 16, e0 = layout.singleX1 * 16;
  if (x <= w0) return south;
  if (x < w0 + ramp) return south - (x - w0) * 16 / ramp;
  if (x < e0) return north;
  if (x < e0 + ramp) return north + (x - e0) * 16 / ramp;
  return south;
}
