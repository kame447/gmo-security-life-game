import { describe, expect, it } from 'vitest';
import { TILE } from '../src/core/coords';
import { TRAIN_LENGTH_PX } from '../src/town-train/car';
import { singleZone, TownTrainService } from '../src/town-train/service';
import { TRAIN_ROUTE_SAMPLE_STEP } from './helpers/sample-step';
import { buildWorld, findPath, getStationFlow, isSolidTile, validateWorld } from '../src/world';
import { MAIN_STATION_LAYOUT } from '../src/world/landmarks';
import { RAIL_DIRECTIONS, headingOf, trackRowOf } from '../src/world/rail-geometry';
import { lineFootY, SWITCH_TILES } from '../src/world/rail-layout';
import { TOWN_RAIL_LAYOUTS } from '../src/world/rail-layouts';
import { isRailGround, T } from '../src/world/tiles';
import { NEIGHBOR_STATION_LAYOUT } from '../src/world/towns/neighbor';
import { TRAIN_NETWORK } from '../src/travel/network';

const towns = [['town-main', MAIN_STATION_LAYOUT], ['town-neighbor', NEIGHBOR_STATION_LAYOUT]] as const;

describe('town railway: one line at the station, two lines outside, joined by points', () => {
  it.each(towns)('%s: rails only on the two rows, with the single section and eight point tiles', (areaId, station) => {
    const town = buildWorld().areas.get(areaId)!, layout = TOWN_RAIL_LAYOUTS[areaId];
    expect(layout.northRow).toBe(station.trackY); expect(layout.southRow).toBe(station.trackY + 1);
    const at = (x: number, y: number) => town.ground[y * town.width + x];
    const w = layout.singleX0 - SWITCH_TILES, e = layout.singleX1;
    for (let y = 0; y < town.height; y++) for (let x = 0; x < town.width; x++) {
      const rail = isRailGround(at(x, y));
      // 南の行は、西のポイントの終わり（w+1）までと、東のポイントの始まり（e+1）からだけが線路。その間は柵。
      const southRail = x <= w + 1 || x >= e + 1;
      const expected = y === layout.northRow || (y === layout.southRow && southRail);
      expect(rail, `${areaId} ${x},${y}`).toBe(expected);
    }
    expect([at(w, layout.southRow), at(w + 1, layout.southRow), at(w + 1, layout.northRow), at(w + 2, layout.northRow)])
      .toEqual([T.SWITCH_WS_A, T.SWITCH_WS_B, T.SWITCH_WN_C, T.SWITCH_WN_D]);
    expect([at(e, layout.northRow), at(e + 1, layout.northRow), at(e + 1, layout.southRow), at(e + 2, layout.southRow)])
      .toEqual([T.SWITCH_EN_D, T.SWITCH_EN_C, T.SWITCH_ES_B, T.SWITCH_ES_A]);
    // 駅舎の幅と、ポイントの内側の南の行は、歩けない柵。
    for (let x = w + 2; x <= e; x++) { expect(at(x, layout.southRow)).toBe(T.RAIL_FENCE); expect(isSolidTile(town, x, layout.southRow)).toBe(true); }
    expect(layout.singleX0).toBe(station.building.x); expect(layout.singleX1).toBe(station.building.x + station.building.w);
  });

  it.each(towns)('%s: the up line is a connected tile path that rises one row over three tiles on each side', (areaId) => {
    const town = buildWorld().areas.get(areaId)!, layout = TOWN_RAIL_LAYOUTS[areaId];
    const w = layout.singleX0 - SWITCH_TILES, e = layout.singleX1;
    const path: [number, number][] = [];
    for (let x = 0; x <= w; x++) path.push([x, layout.southRow]);
    path.push([w + 1, layout.southRow], [w + 1, layout.northRow], [w + 2, layout.northRow]);
    for (let x = w + 3; x <= e; x++) path.push([x, layout.northRow]);
    path.push([e + 1, layout.northRow], [e + 1, layout.southRow], [e + 2, layout.southRow]);
    for (let x = e + 3; x < town.width; x++) path.push([x, layout.southRow]);
    for (const [x, y] of path) expect(isRailGround(town.ground[y * town.width + x]), `${x},${y}`).toBe(true);
    for (let i = 1; i < path.length; i++) expect(Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]), `step ${i}`).toBe(1);
  });

  it.each(towns)('%s: both rows are blocked except at crossings; people cannot reach the single section from the street side', (areaId) => {
    const town = buildWorld().areas.get(areaId)!, layout = TOWN_RAIL_LAYOUTS[areaId];
    for (const y of [layout.northRow, layout.southRow]) {
      let crossings = 0;
      for (let x = 0; x < town.width; x++) {
        const tile = town.ground[y * town.width + x];
        if (tile === T.CROSSING) crossings++; else expect(isSolidTile(town, x, y), `${x},${y}`).toBe(true);
      }
      expect(crossings).toBeGreaterThan(0);
    }
    // 柵・ポイントの付近へ歩いて入れない（4辺のどちらからも）。
    for (let x = layout.singleX0 - SWITCH_TILES; x <= layout.singleX1 + SWITCH_TILES; x++) for (const y of [layout.northRow, layout.southRow]) expect(isSolidTile(town, x, y)).toBe(true);
    if (areaId === 'town-neighbor') for (const y of [layout.northRow, layout.southRow]) expect(town.ground[y * town.width + 38]).toBe(T.RAIL_BRIDGE);
  });

  it('defines the down line on the north row heading right and the up line on the south row heading left (left-hand running)', () => {
    expect(RAIL_DIRECTIONS.down).toEqual({ heading: 'right', rowOffset: 0 });
    expect(RAIL_DIRECTIONS.up).toEqual({ heading: 'left', rowOffset: 1 });
    expect(trackRowOf(10, 'down')).toBe(10); expect(trackRowOf(10, 'up')).toBe(11);
  });

  it('moves the up line onto the north row smoothly over three tiles on each side', () => {
    const layout = TOWN_RAIL_LAYOUTS['town-main'], south = (layout.southRow + 1) * TILE, north = (layout.northRow + 1) * TILE;
    const zone = singleZone(layout), ramp = SWITCH_TILES * TILE;
    expect(zone.left).toBe((layout.singleX0 - SWITCH_TILES) * TILE);
    expect(lineFootY(layout, 'up', zone.left - 1)).toBe(south);
    expect(lineFootY(layout, 'up', zone.left)).toBe(south);
    expect(lineFootY(layout, 'up', zone.left + ramp)).toBe(north);
    expect(lineFootY(layout, 'up', zone.left + ramp / 2)).toBeCloseTo(south - TILE / 2);
    expect(lineFootY(layout, 'up', zone.right - ramp)).toBe(north);
    expect(lineFootY(layout, 'up', zone.right)).toBe(south);
    // なめらか: 隣り合う px で足元が1px以上跳ばない（傾きは1/3）。
    for (let x = zone.left; x < zone.right; x++) expect(Math.abs(lineFootY(layout, 'up', x + 1) - lineFootY(layout, 'up', x))).toBeLessThanOrEqual(1 / 3 + 1e-9);
    for (let x = 0; x < 100 * TILE; x++) expect(lineFootY(layout, 'down', x)).toBe(north);
  });
});

describe.each(towns)('%s timetable', (areaId) => {
  const world = buildWorld(), area = world.areas.get(areaId)!, layout = TOWN_RAIL_LAYOUTS[areaId], zone = singleZone(layout);
  it('runs down trains rightward on the north row and up trains leftward, entering and leaving at the edges', () => {
    const service = new TownTrainService();
    for (let t = 0; t < 40; t += 0.25) for (const f of service.frames(area, t)) {
      expect(f.heading).toBe(headingOf(f.direction));
      expect(f.footY).toBe(lineFootY(layout, f.direction, f.x + f.length / 2));
      expect(f.y + f.height).toBe(f.footY);
      expect(f.length).toBe(TRAIN_LENGTH_PX);
    }
    for (const direction of ['down', 'up'] as const) {
      let moved = 0;
      for (let t = 0; t < 24; t += 0.25) {
        const a = service.frames(area, t).filter(f => f.direction === direction), b = service.frames(area, t + 0.25).filter(f => f.direction === direction);
        if (!a.length || a.length !== b.length) continue;
        moved++;
        expect(direction === 'down' ? b[0].x > a[0].x : b[0].x < a[0].x).toBe(true);
      }
      expect(moved, direction).toBeGreaterThan(0);
    }
  });

  it('never has a down train and an up train in the single section (including the points) at the same time, at any time of the cycle', () => {
    const service = new TownTrainService();
    const inZone = (f: { x: number; length: number }) => f.x + f.length > zone.left && f.x < zone.right;
    let worstGap = Infinity;
    for (let t = 0; t < 240; t += TRAIN_ROUTE_SAMPLE_STEP) {
      const frames = service.frames(area, t), down = frames.filter(f => f.direction === 'down' && inZone(f)), up = frames.filter(f => f.direction === 'up' && inZone(f));
      expect(down.length === 0 || up.length === 0, `t=${t.toFixed(2)}`).toBe(true);
      // 区間の外の2線では、どの時刻でも2本の列車が同じ線の上で重ならない。
      for (const direction of ['down', 'up'] as const) {
        const same = frames.filter(f => f.direction === direction).sort((p, q) => p.x - q.x);
        for (let i = 1; i < same.length; i++) worstGap = Math.min(worstGap, same[i].x - (same[i - 1].x + same[i - 1].length));
      }
    }
    expect(worstGap).toBeGreaterThan(0);
  });
});

describe.each(['station', 'station-neighbor'])('%s: single platform and single track inside', stationId => {
  const flow = getStationFlow(stationId), area = () => buildWorld().areas.get(flow.gate.areaId)!;
  it('has one continuous track row from edge to edge and no other rail tile', () => {
    const a = area();
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
      const rail = a.ground[y * a.width + x] === T.RAIL;
      expect(rail, `${x},${y}`).toBe(y === flow.platform.track.y);
      if (rail) expect(isSolidTile(a, x, y)).toBe(true);
    }
  });
  it('shares one door tile and one stop between both directions; only the heading differs', () => {
    const [down, up] = flow.platforms;
    expect(down.door).toEqual(up.door); expect(down.doorFront).toEqual(up.doorFront); expect(down.boardTile).toEqual(up.boardTile);
    expect(flow.directions.down).toEqual({ heading: 'right', arriveFrom: 'left' });
    expect(flow.directions.up).toEqual({ heading: 'left', arriveFrom: 'right' });
    expect(flow.platform.track.rows).toBe(1);
  });
  it('lets people walk entry → gate front, and door front → inside → outside, without touching a rail tile', () => {
    const a = area(), route = (from: { x: number; y: number }, to: { x: number; y: number }) => findPath(a, from, to);
    const noRail = (r: { x: number; y: number }[] | null) => { expect(r).not.toBeNull(); for (const p of r!) expect(a.ground[p.y * a.width + p.x]).not.toBe(T.RAIL); };
    noRail(route({ x: flow.platform.boardTile.x, y: flow.platform.boardTile.y }, flow.gate.inside));
    noRail(route(flow.platform.doorFront, flow.gate.inside));
    noRail(route(flow.alight, flow.gate.inside));
    expect(flow.gate.inside.x).toBe(flow.gate.exitX);
    // 改札は solid（歩いて通れない）。外へは操作（乗車側）で出る。
    for (const x of [flow.gate.entryX, flow.gate.exitX]) expect(isSolidTile(a, x, flow.gate.tile.y)).toBe(true);
    expect(route(flow.gate.inside, flow.gate.outside)).toBeNull();
    expect(isSolidTile(a, flow.gate.outside.x, flow.gate.outside.y)).toBe(false);
    expect(a.portalAt.has(flow.gate.outside.y * a.width + flow.gate.outside.x)).toBe(false);
  });
  it('is validated as reachable', () => {
    expect(validateWorld(buildWorld(), { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
  });
});
