import { getStationFlow, type StationFlow, type StationPlatform } from '../world';

/**
 * 乗車の流れが駅について読むデータ。位置・方向の実体は world/station-flow.ts（getStationFlow）で、ここはその型と読む1か所。
 * 改札・のりば・ドア・ドアの前・下車位置の数値は決め打ちにせず、すべてここ経由で読む。
 */
export type { StationFlow, StationPlatform };

export function readStationFlows(): readonly StationFlow[] {
  return ['station', 'station-neighbor'].map(id => getStationFlow(id));
}
