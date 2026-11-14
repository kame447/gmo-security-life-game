import { STATION_ACCESS } from '../world/landmarks';
import { NEIGHBOR_STATION_ACCESS } from '../world/towns/neighbor';
import type { Direction } from './direction';

/**
 * 乗車の流れが駅について読むデータは、この1か所だけ。
 * #35 が駅ごとの改札・ホーム・方向を world/ で提供したら、readStationFlows() の中身だけを差し替える。
 */
export interface StationInteraction { readonly areaId: string; readonly interactionId: string; readonly eventKey: string }
export interface PlatformFlow {
  readonly id: string;
  /** このホームから出る方向。現状は1つのホームが両方向を兼ねる（暫定）。 */
  readonly directions: readonly Direction[];
  readonly sign: StationInteraction;
}
export interface StationFlow {
  readonly stationId: string;
  /** 行き先を選ぶ改札。null の駅は、のりばの看板が改札を兼ねる（暫定）。 */
  readonly gate: StationInteraction | null;
  readonly platforms: readonly PlatformFlow[];
}

export function readStationFlows(): readonly StationFlow[] {
  const main = STATION_ACCESS, neighbor = NEIGHBOR_STATION_ACCESS;
  return [
    {
      stationId: main.stationId,
      gate: { areaId: main.areaId, interactionId: 'station-ticket', eventKey: 'station.ticket' },
      platforms: [{ id: 'main-platform', directions: ['up', 'down'],
        sign: { areaId: main.areaId, interactionId: main.interaction.id, eventKey: main.interaction.eventKey } }],
    },
    {
      stationId: neighbor.stationId,
      gate: null,
      platforms: [{ id: 'neighbor-platform', directions: ['up', 'down'],
        sign: { areaId: neighbor.boarding.areaId, interactionId: neighbor.boarding.interactionId, eventKey: neighbor.boarding.eventKey } }],
    },
  ];
}
