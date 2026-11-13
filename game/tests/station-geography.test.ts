import { describe, expect, it } from 'vitest';
import { feetAtTile } from '../src/core/coords';
import { canStand, positionAt } from '../src/map/explorer';
import { buildAreaMap } from '../src/minimap/model';
import { Game } from '../src/session/game';
import { TRAIN_NETWORK } from '../src/travel/network';
import { findRailStrips, TownTrainService } from '../src/town-train/service';
import { buildWorld, findPath, isSolidTile, LANDMARKS, STATION_ACCESS, validateWorld } from '../src/world';
import { MAIN_STATION_LAYOUT } from '../src/world/landmarks';
import { isRailGround, T } from '../src/world/tiles';
import { NEIGHBOR_STATION_ACCESS, NEIGHBOR_STATION_LAYOUT } from '../src/world/towns/neighbor';

describe('station geography', () => {
  it.each([
    ['town-main', 'station', 'station-enter', MAIN_STATION_LAYOUT, LANDMARKS.stationFront],
    ['town-neighbor', 'station-neighbor', 'neighbor-station-enter', NEIGHBOR_STATION_LAYOUT, NEIGHBOR_STATION_ACCESS.townFront],
  ] as const)('%s has a south entrance, northern track and a matching map marker', (areaId, facilityId, portalId, layout, front) => {
    const world = buildWorld(), town = world.areas.get(areaId)!;
    const station = town.objects.find(o => o.facilityId === facilityId)!;
    const entry = town.def.portals.find(p => p.id === portalId)!;
    expect(station).toMatchObject(layout.building);
    expect(entry.from).toEqual(layout.entrance);
    expect(entry.from.x).toBe(station.x + Math.floor(station.w / 2));
    expect(entry.from.y).toBe(station.y + station.h - 1);
    expect(front).toMatchObject({ x: entry.from.x, y: entry.from.y + 1 });
    expect(layout.trackY + layout.trackRows).toBe(station.y);
    expect(town.height).toBe(layout.townHeight);
    for (let y = layout.trackY; y < layout.trackY + layout.trackRows; y++) for (let x = 0; x < town.width; x++) {
      const tile = town.ground[y * town.width + x];
      expect(isRailGround(tile), `${areaId} ${x},${y}`).toBe(true);
      if (tile !== T.CROSSING) expect(isSolidTile(town, x, y)).toBe(true);
    }
    expect(town.objects.some(o => o.kind === 'train')).toBe(false);
    const map = buildAreaMap(town, world.facilities.values());
    expect(map.height).toBe(layout.townHeight);
    expect(map.markers).toContainEqual(expect.objectContaining({
      id: facilityId, kind: 'station', x: station.x + station.w / 2, y: station.y + station.h / 2,
    }));
    expect(findPath(town, front, entry.from)).not.toBeNull();
  });

  it('keeps both stations ordered from entry through gate and platform to the northern tracks', () => {
    const world = buildWorld();
    for (const [areaId, entry, board, railRows] of [
      [STATION_ACCESS.areaId, STATION_ACCESS.entry, STATION_ACCESS.boarding, [5, 6]],
      [NEIGHBOR_STATION_ACCESS.entrance.areaId, NEIGHBOR_STATION_ACCESS.entrance, NEIGHBOR_STATION_ACCESS.boarding, [2, 3]],
    ] as const) {
      const area = world.areas.get(areaId)!, route = findPath(area, entry, board);
      expect(route).not.toBeNull();
      expect(entry.y).toBeGreaterThan(board.y);
      expect(board.y).toBeGreaterThan(Math.max(...railRows));
      expect(route!.some(p => area.ground[p.y * area.width + p.x] === T.TICKET_GATE)).toBe(true);
      expect(area.ground[board.y * area.width + board.x]).toBe(T.PLATFORM);
      for (const y of railRows) for (let x = 1; x < area.width - 1; x++) {
        expect(isSolidTile(area, x, y), `${areaId} ${x},${y}`).toBe(true);
      }
    }
    expect(validateWorld(world, { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
  });

  it.each([14, 15, 32, 33])('walks across the neighboring track in both directions at x=%i', x => {
    const world = buildWorld(), town = world.areas.get('town-neighbor')!;
    const { trackY, trackRows } = NEIGHBOR_STATION_LAYOUT;
    for (let y = trackY; y < trackY + trackRows; y++) {
      expect(town.ground[y * town.width + x]).toBe(T.CROSSING);
      expect(isSolidTile(town, x, y)).toBe(false);
    }
    const game = new Game(world);
    game.player = positionAt({ areaId: 'town-neighbor', x, y: trackY - 1, facing: 'down' });
    for (let i = 0; i < trackRows + 1; i++) game.update(16 / 128, { dir: 'down', run: true });
    expect(game.player).toEqual(positionAt({ areaId: 'town-neighbor', x, y: trackY + trackRows, facing: 'down' }));
    for (let i = 0; i < trackRows + 1; i++) game.update(16 / 128, { dir: 'up', run: true });
    expect(game.player).toEqual(positionAt({ areaId: 'town-neighbor', x, y: trackY - 1, facing: 'up' }));
  });

  it.each(['town-main', 'town-neighbor'])('animates only the actual outdoor railway in %s', areaId => {
    const area = buildWorld().areas.get(areaId)!, solid = area.solid.slice(), ground = area.ground.slice();
    const strips = findRailStrips(area), service = new TownTrainService();
    expect(strips).toHaveLength(1);
    const [strip] = strips;
    expect(strip.left).toBe(0);
    expect(strip.right).toBe(area.width * 16);
    for (let y = strip.top / 16; y < strip.bottom / 16; y++) for (let x = 0; x < area.width; x++) {
      expect(isRailGround(area.ground[y * area.width + x])).toBe(true);
    }
    const before = service.frames(area, 2), after = service.frames(area, 2.5);
    expect(before.length).toBeGreaterThan(0);
    expect(after[0].x).toBeGreaterThan(before[0].x);
    expect(area.solid).toEqual(solid);
    expect(area.ground).toEqual(ground);
  });

  it('keeps the neighboring railway bridge solid and the original walking bridge open', () => {
    const town = buildWorld().areas.get('town-neighbor')!;
    const { trackY, trackRows } = NEIGHBOR_STATION_LAYOUT;
    for (let y = trackY; y < trackY + trackRows; y++) for (let x = 37; x <= 40; x++) {
      expect(town.ground[y * town.width + x]).toBe(T.RAIL_BRIDGE);
      const feet = feetAtTile(x, y);
      expect(canStand(town, feet.x, feet.y)).toBe(false);
    }
    expect(town.ground[12 * town.width + 38]).toBe(T.BRIDGE);
    expect(findPath(town, NEIGHBOR_STATION_ACCESS.townFront, { x: 43, y: 12 })).not.toBeNull();
  });
});
