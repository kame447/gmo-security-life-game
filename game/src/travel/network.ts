import { STATION_ACCESS } from '../world/landmarks';
import { RailwayNetwork, type RailwayLine, type RailwayStation } from '../world/railway';
import { NEIGHBOR_STATION_ACCESS } from '../world/towns/neighbor';

/** 地名と路線名は暫定。既存駅の座標は #35 の共有定数だけを参照する。 */
export const TRAVEL_STATIONS: readonly RailwayStation[] = [
  {
    id: STATION_ACCESS.stationId, name: 'いつものまち',
    boarding: { ...STATION_ACCESS.boarding, interactionId: STATION_ACCESS.interaction.id, eventKey: STATION_ACCESS.interaction.eventKey },
    arrival: { ...STATION_ACCESS.arrival },
  },
  {
    id: NEIGHBOR_STATION_ACCESS.stationId, name: NEIGHBOR_STATION_ACCESS.name,
    boarding: { ...NEIGHBOR_STATION_ACCESS.boarding }, arrival: { ...NEIGHBOR_STATION_ACCESS.arrival },
  },
];

export const TRAVEL_LINES: readonly RailwayLine[] = [
  { id: 'local-line', stations: TRAVEL_STATIONS.map(station => station.id) },
];

export const TRAIN_NETWORK = new RailwayNetwork(TRAVEL_STATIONS, TRAVEL_LINES);
