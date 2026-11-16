import { describe, expect, it } from 'vitest';
import { feetAtTile } from '../src/core/coords';
import { canStand, positionAt } from '../src/map/explorer';
import { buildAreaMap } from '../src/minimap/model';
import { Game } from '../src/session/game';
import { TownTrainService } from '../src/town-train/service';
import { buildWorld, findPath, isSolidTile, LANDMARKS } from '../src/world';
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
      // 駅の区間の南の行だけは柵（1線の区間）。それ以外は線路で、踏切以外は通れない。
      const fence = y === layout.trackY + 1 && x >= layout.building.x - 3 && x < layout.building.x + layout.building.w + 3;
      expect(isRailGround(tile) || fence, `${areaId} ${x},${y}`).toBe(true);
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

  it.each([12, 13, 34, 35])('walks across the neighboring track in both directions at x=%i', x => {
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
    const service = new TownTrainService();
    expect(service.frames(area, 2).length).toBeGreaterThan(0);
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
