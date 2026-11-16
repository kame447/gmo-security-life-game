import { getStationFlow, type StationFlow, type StationPlatform } from '../world';

/**
 * 乗車の流れが駅について読むデータ。位置・方向の実体は world/station-flow.ts（getStationFlow）で、ここはその型と読む1か所。
 * 改札・のりば・ドア・ドアの前・下車位置の数値は決め打ちにせず、すべてここ経由で読む。
 */
export type { StationFlow, StationPlatform };

export function readStationFlows(): readonly StationFlow[] {
  return ['station', 'station-neighbor'].map(id => getStationFlow(id));
}

type Spot = { readonly areaId: string; readonly x: number; readonly y: number; readonly facing: 'up' | 'down' };
export type StationGate = StationFlow['gate'];

/** 改札の外（出場後に操作を戻す位置と向き）。到着の確定（保存される位置）はここ。往路・帰路とも駅ごとに1つ。 */
export function outsideOf(flow: StationFlow): Spot {
  return { areaId: flow.gate.areaId, x: flow.gate.outside.x, y: flow.gate.outside.y, facing: flow.gate.outside.facing };
}

/** 改札の内側（ホーム側の前。ドアの前から真南へ歩いて着く）。 */
export function insideOf(flow: StationFlow): { readonly x: number; readonly y: number } {
  return { x: flow.gate.inside.x, y: flow.gate.inside.y };
}
