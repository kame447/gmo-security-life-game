import { describe, expect, it } from 'vitest';
import { TRAIN_NETWORK } from '../src/travel/network';
import { STATION_ACCESS } from '../src/world/landmarks';
import { NEIGHBOR_STATION_ACCESS } from '../src/world/towns/neighbor';

describe('provisional train service', () => {
  it('uses the shared station positions and creates both directed validation links', () => {
    const main = TRAIN_NETWORK.station(STATION_ACCESS.stationId)!;
    expect(main.boarding).toEqual({ ...STATION_ACCESS.boarding, interactionId: STATION_ACCESS.interaction.id, eventKey: STATION_ACCESS.interaction.eventKey });
    expect(main.arrival).toEqual(STATION_ACCESS.arrival);
    expect(TRAIN_NETWORK.destinations(main.id).map(station => station.id)).toEqual([NEIGHBOR_STATION_ACCESS.stationId]);
    expect(TRAIN_NETWORK.destinations(NEIGHBOR_STATION_ACCESS.stationId).map(station => station.id)).toEqual([main.id]);
    expect(TRAIN_NETWORK.railLinks()).toEqual([
      { from: { areaId: main.boarding.areaId, x: main.boarding.x, y: main.boarding.y },
        to: { areaId: NEIGHBOR_STATION_ACCESS.arrival.areaId, x: NEIGHBOR_STATION_ACCESS.arrival.x, y: NEIGHBOR_STATION_ACCESS.arrival.y } },
      { from: { areaId: NEIGHBOR_STATION_ACCESS.boarding.areaId, x: NEIGHBOR_STATION_ACCESS.boarding.x, y: NEIGHBOR_STATION_ACCESS.boarding.y },
        to: { areaId: main.arrival.areaId, x: main.arrival.x, y: main.arrival.y } },
    ]);
  });
});
