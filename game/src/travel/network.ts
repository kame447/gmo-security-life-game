import { STATION_ACCESS } from '../world/landmarks';
import { getStationFlow } from '../world';
import { outsideOf } from './stations';
import { RailwayNetwork, type RailwayLine, type RailwayStation } from '../world/railway';
import { NEIGHBOR_STATION_ACCESS } from '../world/towns/neighbor';

/** 地名と路線名は暫定。駅の座標は #35 の共有データだけを参照する。到着の位置は改札の外（降車後に自動で出る）。 */
export const TRAVEL_STATIONS: readonly RailwayStation[] = [
  {
    id: STATION_ACCESS.stationId, name: 'いつものまち',
    boarding: { ...STATION_ACCESS.boarding, interactionId: STATION_ACCESS.interaction.id, eventKey: STATION_ACCESS.interaction.eventKey },
    arrival: { ...outsideOf(getStationFlow(STATION_ACCESS.stationId)) },
  },
  {
    id: NEIGHBOR_STATION_ACCESS.stationId, name: NEIGHBOR_STATION_ACCESS.name,
    boarding: { ...NEIGHBOR_STATION_ACCESS.boarding }, arrival: { ...outsideOf(getStationFlow(NEIGHBOR_STATION_ACCESS.stationId)) },
  },
];

export const TRAVEL_LINES: readonly RailwayLine[] = [
  { id: 'local-line', stations: TRAVEL_STATIONS.map(station => station.id) },
];

export const TRAIN_NETWORK = new RailwayNetwork(TRAVEL_STATIONS, TRAVEL_LINES);
