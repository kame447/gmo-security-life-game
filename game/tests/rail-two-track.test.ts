import { describe, expect, it } from 'vitest';
import { TRAIN_LENGTH_PX } from '../src/town-train/car';
import { TownTrainService, findRailStrips } from '../src/town-train/service';
import { buildWorld, getStationFlow, isSolidTile, validateWorld } from '../src/world';
import { MAIN_STATION_LAYOUT } from '../src/world/landmarks';
import { RAIL_DIRECTIONS, headingOf, trackRowOf } from '../src/world/rail-geometry';
import { isRailGround, T } from '../src/world/tiles';
import { NEIGHBOR_STATION_LAYOUT } from '../src/world/towns/neighbor';
import { TRAIN_NETWORK } from '../src/travel/network';

const towns = [['town-main', MAIN_STATION_LAYOUT], ['town-neighbor', NEIGHBOR_STATION_LAYOUT]] as const;

describe('two-track railway (up and down lines)', () => {
  it.each(towns)('%s has exactly two rail rows, one up line and one down line, and rails nowhere else', (areaId, layout) => {
    const town = buildWorld().areas.get(areaId)!;
    expect(layout.trackRows).toBe(2);
    for (let y = 0; y < town.height; y++) for (let x = 0; x < town.width; x++) {
      const rail = isRailGround(town.ground[y * town.width + x]);
      expect(rail, `${areaId} ${x},${y}`).toBe(y >= layout.trackY && y < layout.trackY + 2);
    }
  });

  it.each(towns)('%s: both rows are blocked except at crossings, and keep the bridge over the river', (areaId, layout) => {
    const town = buildWorld().areas.get(areaId)!;
    for (const y of [layout.trackY, layout.trackY + 1]) {
      let crossings = 0;
      for (let x = 0; x < town.width; x++) {
        const tile = town.ground[y * town.width + x];
        if (tile === T.CROSSING) crossings++; else expect(isSolidTile(town, x, y)).toBe(true);
      }
      expect(crossings).toBeGreaterThan(0);
    }
    if (areaId === 'town-neighbor') for (const y of [layout.trackY, layout.trackY + 1]) expect(town.ground[y * town.width + 38]).toBe(T.RAIL_BRIDGE);
  });

  it('defines the down line on the north row heading right and the up line on the south row heading left (left-hand running)', () => {
    expect(RAIL_DIRECTIONS.down).toEqual({ heading: 'right', rowOffset: 0 });
    expect(RAIL_DIRECTIONS.up).toEqual({ heading: 'left', rowOffset: 1 });
    expect(trackRowOf(10, 'down')).toBe(10); expect(trackRowOf(10, 'up')).toBe(11);
  });

  it.each(towns)('%s: periodic trains run right on the north row and left on the south row, entering and leaving at the edges', (areaId, layout) => {
    const area = buildWorld().areas.get(areaId)!, service = new TownTrainService();
    expect(findRailStrips(area).map(s => [s.top / 16, s.direction])).toEqual([[layout.trackY, 'down'], [layout.trackY + 1, 'up']]);
    for (let t = 0; t < 20; t += 0.5) for (const f of service.frames(area, t)) {
      expect(f.heading).toBe(headingOf(f.direction));
      // 足元が線路の行の下端に揃い、車体は上へはみ出す。
      expect(f.y + f.height).toBe(f.strip.bottom);
      expect(f.length).toBe(TRAIN_LENGTH_PX);
    }
    const a = service.frames(area, 3), b = service.frames(area, 3.25);
    for (const direction of ['down', 'up'] as const) {
      const ax = a.filter(f => f.direction === direction).map(f => f.x), bx = b.filter(f => f.direction === direction).map(f => f.x);
      expect(ax.length).toBeGreaterThan(0);
      bx.slice(0, 1).forEach((x, i) => expect(direction === 'down' ? x > ax[i] : x < ax[i]).toBe(true));
    }
  });

  it.each(['station', 'station-neighbor'])('%s: station platforms use the same direction definition as the town trains', stationId => {
    const area = buildWorld().areas.get(getStationFlow(stationId).gate.areaId)!, flow = getStationFlow(stationId);
    expect(flow.platforms.map(p => p.direction)).toEqual(['down', 'up']);
    const [down, up] = flow.platforms;
    expect(down.heading).toBe('right'); expect(down.arriveFrom).toBe('left');
    expect(up.heading).toBe('left'); expect(up.arriveFrom).toBe('right');
    expect(down.track.y).toBeLessThan(up.track.y);
    for (const p of flow.platforms) {
      expect(p.heading).toBe(headingOf(p.direction));
      expect(p.door.y).toBe(p.track.y);
      expect(area.ground[p.track.y * area.width + p.door.x]).toBe(T.RAIL);
      expect(area.def.objects.some(o => o.kind === 'train')).toBe(false);
    }
  });

  it('keeps every interaction and portal reachable from the start', () => {
    expect(validateWorld(buildWorld(), { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
  });
});
