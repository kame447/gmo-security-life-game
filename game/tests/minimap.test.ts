import { describe, expect, it } from 'vitest';
import type { AreaDef } from '../src/core/types';
import { AreaMapCache, MAP_CELL, buildAreaMap, fitProjection, localProjection, playerMapPoint, projectPoint } from '../src/minimap/model';
import { layoutFacilityLabels } from '../src/minimap/markers';
import { buildingRepresentativeColor } from '../src/render/building-colors';
import { buildWorld, LANDMARKS } from '../src/world';
import { toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';

function sampleArea(id = 'sample', ground = [T.GRASS, T.ASPHALT, T.WATER, T.FLOOR_WOOD, T.GRASS, T.GRASS, T.WALL, T.PARKPATH]) {
  const def: AreaDef = {
    id, name: id, kind: 'outdoor', width: 4, height: 2, ground: Uint8Array.from(ground),
    objects: [{ kind: 'house', x: 0, y: 1, w: 2, h: 1, solid: true }],
    portals: [{ id: 'door', from: { x: 1, y: 1 }, to: { areaId: id, x: 3, y: 1, facing: 'down' } }],
    interactions: [],
  };
  return toRuntime(def);
}

describe('minimap derived from the runtime world', () => {
  it('shows terrain, blocked building footprints and active doorways from the same collision data', () => {
    const area = sampleArea();
    const map = buildAreaMap(area);
    expect([...map.cells]).toEqual([
      MAP_CELL.grass, MAP_CELL.road, MAP_CELL.water, MAP_CELL.floor,
      MAP_CELL.building, MAP_CELL.portal, MAP_CELL.blocked, MAP_CELL.path,
    ]);
    expect(area.solid[4]).toBe(1);
    expect(area.solid[5]).toBe(0);
    expect(area.portalAt.has(5)).toBe(true);
  });

  it('uses the active runtime area and does not confuse different areas or same-ID replacements', () => {
    const world = buildWorld();
    const town = world.areas.get('town-main')!;
    const home = world.areas.get('home-family-interior')!;
    const cache = new AreaMapCache();
    const townMap = cache.get(town), homeMap = cache.get(home);
    expect(cache.get(town)).toBe(townMap);
    expect([townMap.areaId, townMap.width, townMap.height]).toEqual(['town-main', town.width, town.height]);
    expect([homeMap.areaId, homeMap.width, homeMap.height]).toEqual(['home-family-interior', home.width, home.height]);
    expect(homeMap).not.toBe(townMap);
    const doorIndex = [...town.portalAt.keys()][0];
    expect(townMap.cells[doorIndex]).toBe(MAP_CELL.portal);
    const first = sampleArea('same'), replacement = sampleArea('same', [T.WATER, T.ASPHALT, T.WATER, T.FLOOR_WOOD, T.GRASS, T.GRASS, T.WALL, T.PARKPATH]);
    expect(cache.get(first).cells[0]).toBe(MAP_CELL.grass);
    expect(cache.get(replacement).cells[0]).toBe(MAP_CELL.water);
  });

  it('keeps each building roof color, including different house styles and the park gazebo', () => {
    const area = sampleArea();
    area.objects = [
      { kind: 'house', style: '0', x: 0, y: 0, w: 1, h: 1, solid: true },
      { kind: 'house', style: '1', x: 1, y: 0, w: 1, h: 1, solid: true },
    ];
    area.solid[0] = area.solid[1] = 1;
    const map = buildAreaMap(area);
    expect(map.colors[0]).toBe(buildingRepresentativeColor(area.objects[0]));
    expect(map.colors[1]).toBe(buildingRepresentativeColor(area.objects[1]));
    expect(map.colors[0]).not.toBe(map.colors[1]);
    const world = buildWorld(), town = world.areas.get('town-main')!;
    const townMap = buildAreaMap(town);
    for (const object of town.objects.filter(item => buildingRepresentativeColor(item))) {
      expect(townMap.colors[object.y * town.width + object.x]).toBe(buildingRepresentativeColor(object));
    }
  });

  it('takes all twelve facility names, types and anchors from the current world', () => {
    const world = buildWorld();
    const cache = new AreaMapCache(world.facilities);
    const town = world.areas.get('town-main')!, map = cache.get(town);
    expect(map.markers).toHaveLength(12);
    expect(map.markers.map(marker => marker.kind)).toEqual([
      'home', 'school', 'gym', 'station', 'park', 'greengrocer', 'bookstore', 'candy', 'konbini', 'bakery', 'cafe', 'pharmacy',
    ]);
    for (const marker of map.markers) {
      expect(marker.name).toBe(world.facilities.get(marker.id)!.name);
      const object = town.objects.find(item => item.facilityId === marker.id)!;
      expect([marker.x, marker.y]).toEqual([object.x + object.w / 2, object.y + object.h / 2]);
    }
    for (const area of world.areas.values()) if (area.def.kind === 'indoor') expect(cache.get(area).markers).toEqual([]);
  });

  it.each([[900, 562], [338, 470], [792, 260]])('places every name within %i×%i without label overlaps', (width, height) => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    const map = buildAreaMap(town, world.facilities.values());
    const projection = fitProjection(map.width, map.height, width, height, 18);
    for (const point of Object.values(LANDMARKS)) {
      const labels = layoutFacilityLabels(map.markers, projection, width, height, text => text.length * 13,
        projectPoint(projection, { x: point.x + .5, y: point.y + .5 }));
      expect(labels).toHaveLength(map.markers.length);
      for (const label of labels) {
        expect(label.x).toBeGreaterThanOrEqual(0); expect(label.y).toBeGreaterThanOrEqual(0);
        expect(label.x + label.width).toBeLessThanOrEqual(width); expect(label.y + label.height).toBeLessThanOrEqual(height);
        for (const other of labels) if (label !== other) expect(
          label.x < other.x + other.width && label.x + label.width > other.x && label.y < other.y + other.height && label.y + label.height > other.y,
        ).toBe(false);
      }
    }
  });
});

describe('map coordinates', () => {
  it('fits the entire area without distortion and projects the player using foot coordinates', () => {
    const point = playerMapPoint({ areaId: 'town', x: 40, y: 34, facing: 'down' });
    expect(point).toEqual({ x: 2.5, y: 1.875 });
    const projection = fitProjection(128, 80, 800, 500, 10);
    const northWest = projectPoint(projection, { x: 0, y: 0 });
    const southEast = projectPoint(projection, { x: 128, y: 80 });
    expect(northWest.x).toBeGreaterThanOrEqual(10);
    expect(northWest.y).toBeGreaterThanOrEqual(10);
    expect(southEast.x).toBeLessThanOrEqual(790);
    expect(southEast.y).toBeLessThanOrEqual(490);
  });

  it('keeps the local marker centered as the player moves and accommodates small rooms', () => {
    const center = { x: 44.5, y: 32.625 };
    const projection = localProjection(128, 80, 192, 128, center);
    expect(projectPoint(projection, center)).toEqual({ x: 96, y: 64 });
    const next = localProjection(128, 80, 192, 128, { x: center.x + 1, y: center.y });
    expect(next.left).toBe(projection.left - projection.scale);
    expect(localProjection(16, 12, 192, 128, { x: 8, y: 6 }).scale).toBeGreaterThan(projection.scale);
  });
});
