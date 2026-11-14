import { getStationFlow } from '../world';
import type { Direction, Heading } from './direction';

/**
 * 乗車の流れが駅について読むデータ。位置・方向の実体は world/station-flow.ts（getStationFlow）で、
 * ここはその必要な部分だけの型と、読む1か所（readStationFlows）。
 */
export interface StationInteraction { readonly areaId: string; readonly interactionId: string; readonly eventKey: string }
export interface PlatformFlow {
  readonly id: string;
  readonly direction: Direction;
  readonly sign: { readonly interactionId: string; readonly eventKey: string };
  readonly boardTile: { readonly areaId: string; readonly x: number; readonly y: number; readonly facing: 'up' | 'down' };
  readonly heading: Heading;
  readonly arriveFrom: Heading;
}
export interface StationFlow {
  readonly stationId: string;
  /**
   * 歩いて通れない改札（左端のタイルと幅）。南（y+1）から上向きに操作すると入場、北（y-1）から下向きなら出場。
   * null の駅は、のりばの案内が改札を兼ねる（試験用）。
   */
  readonly gate: (StationInteraction & { readonly tile: { readonly x: number; readonly y: number }; readonly w: number }) | null;
  readonly platforms: readonly PlatformFlow[];
}

export function readStationFlows(): readonly StationFlow[] {
  return ['station', 'station-neighbor'].map(id => getStationFlow(id));
}
