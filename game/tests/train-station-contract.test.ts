import { describe, expect, it } from 'vitest';
import { outsideOf } from '../src/travel/stations';
import { buildWorld, findPath, getStationFlow, STATION_ACCESS } from '../src/world';
import { NEIGHBOR_STATION_ACCESS } from '../src/world/towns/neighbor';
import { T } from '../src/world/tiles';

/**
 * 単式ホーム・線路1本の駅の契約（#35 が提供し、#36 が読む）。確定した形:
 * StationFlow.platform（単一）＋ directions、gate.front/inside/outside、arrival は outside に追従。
 */
type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const flows = [getStationFlow(STATION_ACCESS.stationId), getStationFlow(NEIGHBOR_STATION_ACCESS.stationId)] as Loose[];

describe('single-platform station contract', () => {
  it('has one platform and a heading per direction on the same door tile', () => {
    for (const f of flows) {
      expect(f.platform, f.stationId).toBeTruthy();
      expect(f.directions).toEqual({ down: { heading: 'right', arriveFrom: 'left' }, up: { heading: 'left', arriveFrom: 'right' } });
      expect(f.platforms.every((p: Loose) => p.door.x === f.platform.door.x && p.door.y === f.platform.door.y)).toBe(true);
    }
  });

  it('gives each gate a front, an inside and an outside, with arrival following outside', () => {
    expect(flows[0].gate.outside).toMatchObject({ x: 18, y: 11, facing: 'down' });
    expect(flows[0].gate.front).toMatchObject({ x: 17, y: 11, facing: 'up' });
    expect(flows[0].gate.inside).toMatchObject({ x: 18, y: 9 });
    expect(flows[1].gate.outside).toMatchObject({ x: 7, y: 9, facing: 'down' });
    expect(STATION_ACCESS.arrival).toMatchObject({ x: 18, y: 11 });
    expect(NEIGHBOR_STATION_ACCESS.arrival).toMatchObject({ x: 7, y: 9 });
    for (const f of flows) expect(outsideOf(f)).toMatchObject({ areaId: f.gate.areaId, x: f.gate.outside.x, y: f.gate.outside.y, facing: 'down' });
  });

  it('has a single continuous track on the north edge and never a rail tile on the walk from the door to the gate', () => {
    const world = buildWorld();
    for (const f of flows) {
      const area = world.areas.get(f.gate.areaId);
      if (!area) continue;
      const rails = [...Array(area.width).keys()].map(x => area.ground[f.platform.track.y * area.width + x]);
      expect(rails.slice(1, -1).every(tile => tile === T.RAIL), `${f.stationId} track continuous`).toBe(true);
      const south = [...Array(area.height).keys()].filter(y => y > f.platform.track.y).flatMap(y => [...Array(area.width).keys()].map(x => area.ground[y * area.width + x]));
      expect(south.includes(T.RAIL), `${f.stationId} no second track`).toBe(false);
      const route = findPath(area, f.platform.doorFront, f.gate.inside);
      expect(route).not.toBeNull();
      for (const p of route!) expect(area.ground[p.y * area.width + p.x]).not.toBe(T.RAIL);
    }
  });
});
