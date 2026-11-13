import { describe, expect, it } from 'vitest';
import type { AreaDef } from '../src/core/types';
import { AreaMapCache, MAP_CELL, buildAreaMap, fitProjection, localProjection, playerMapPoint, projectPoint } from '../src/minimap/model';
import { buildWorld } from '../src/world';
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
