import { describe, expect, it } from 'vitest';
import { chunkId, CHUNK_TILES, hash2, tileToChunk } from '../src/core/coords';
import { buildWorld, CHILDHOOD_VARIANT, districtAt, findPath, isSolidTile, LANDMARKS, validateWorld } from '../src/world';
import { PERF_ROUTES } from './fixtures/perf-routes';
import { T } from '../src/world/tiles';
import { TRAIN_NETWORK } from '../src/travel/network';

describe('childhood world', () => {
  it('has valid IDs, bounds, references and reachable portals/interactions', () => {
    expect(validateWorld(buildWorld(), { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
  });
  it.each(['schoolGate', 'schoolDoorFront', 'stationFront', 'parkPlaza', 'shoppingStreet', 'konbiniDoorFront'] as const)('connects home to %s', key => {
    const town = buildWorld().areas.get('town-main')!;
    const path = findPath(town, LANDMARKS.homeFront, LANDMARKS[key]);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(LANDMARKS.homeFront);
    expect(path!.at(-1)).toEqual(LANDMARKS[key]);
    for (let n = 1; n < path!.length; n++) {
      expect(Math.abs(path![n].x - path![n - 1].x) + Math.abs(path![n].y - path![n - 1].y)).toBe(1);
      expect(isSolidTile(town, path![n].x, path![n].y)).toBe(false);
    }
  });
  it('blocks bounds, water, banks, buildings, fences and rail while allowing bridges/crossings', () => {
    const town = buildWorld().areas.get('town-main')!;
    for (const [x, y] of [[-1, 20], [128, 20], [50, -1], [50, 80], [NaN, 1], [1.5, 1]]) expect(isSolidTile(town, x, y)).toBe(true);
    for (const [x, y] of [[86, 20], [83, 20], [32, 28], [90, 25], [10, 71]]) expect(isSolidTile(town, x, y)).toBe(true);
    for (const [x, y, tile] of [[86, 9, T.BRIDGE], [86, 39, T.BRIDGE], [100, 46, T.BRIDGE], [80, 71, T.CROSSING], [56, 71, T.CROSSING], [125, 71, T.CROSSING]]) {
      expect(town.ground[y * town.width + x]).toBe(tile);
      expect(isSolidTile(town, x, y)).toBe(false);
    }
    expect(findPath(town, { x: 86, y: 20 }, LANDMARKS.homeFront)).toBeNull();
  });
  it('returns every interior exit to the original outdoor door front', () => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    for (const portal of town.def.portals) {
      const indoor = world.areas.get(portal.to.areaId)!;
      expect(indoor.def.kind).toBe('indoor');
      expect(isSolidTile(indoor, portal.to.x, portal.to.y)).toBe(false);
      expect(indoor.portalAt.has(portal.to.y * indoor.width + portal.to.x)).toBe(false);
      for (const exit of indoor.def.portals) {
        expect(exit.to.areaId).toBe(town.def.id);
        expect(exit.to.x).toBe(portal.from.x);
        expect(exit.to.y).toBe(portal.from.y + 1);
        expect(exit.to.facing).toBe('down');
        expect(findPath(indoor, portal.to, exit.from)).not.toBeNull();
        for (let dx = 0; dx < (exit.from.w ?? 1); dx++) expect(indoor.portalAt.get(exit.from.y * indoor.width + exit.from.x + dx)).toBe(exit);
      }
      for (let dx = 0; dx < (portal.from.w ?? 1); dx++) expect(town.portalAt.get(portal.from.y * town.width + portal.from.x + dx)).toBe(portal);
    }
  });
  it('applies disabled portals/interactions and facility states without altering the base', () => {
    const variant = { ...CHILDHOOD_VARIANT, id: 'childhood-test', disabledPortals: ['home-enter'], disabledInteractions: ['neighbor-grandma'], facilityStates: { school: 'closed' as const }, extraInteractions: { 'town-main': [{ id: 'test-friend', kind: 'npc' as const, name: 'ともだち', x: 36, y: 33, solid: true, sprite: 'friend', eventKey: 'home.visitor', lines: ['あそぼう！'] }] } };
    const changed = buildWorld(variant), town = changed.areas.get('town-main')!;
    expect(town.def.portals.map(p => p.id)).not.toContain('home-enter');
    expect(town.def.portals.map(p => p.id)).not.toContain('school-enter');
    expect(isSolidTile(town, 35, 31)).toBe(true);
    expect(town.interactions.some(i => i.id === 'neighbor-grandma')).toBe(false);
    expect(town.interactionAt.get(33 * 128 + 40)).toBeUndefined();
    expect(isSolidTile(town, 40, 33)).toBe(false);
    expect(town.interactionAt.get(33 * 128 + 36)?.id).toBe('test-friend');
    expect(changed.facilities.get('school')?.state).toBe('closed');
    expect(validateWorld(buildWorld(), { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
  });
  it('uses stable chunk IDs for all 40 outdoor chunks', () => {
    const ids = new Set<string>();
    for (let y = 0; y < 80; y += CHUNK_TILES) for (let x = 0; x < 128; x += CHUNK_TILES) {
      const id = chunkId('town-main', tileToChunk(x), tileToChunk(y));
      expect(id).toMatch(/^town-main\/chunk-x\d{3}-y\d{3}$/); ids.add(id);
    }
    expect(ids.size).toBe(40);
    expect(chunkId('town-main', 0, 1)).toBe('town-main/chunk-x000-y001');
  });
  it('opens the konbini interior and reaches its everyday conversations from the entrance', () => {
    const world = buildWorld(), shop = world.areas.get('shop-konbini-interior')!;
    expect(world.facilities.get('shop-konbini')?.interior).toBe('full');
    expect(shop.width).toBe(14); expect(shop.height).toBe(10);
    for (const interaction of shop.interactions) {
      let reachable = false;
      for (const delta of [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }]) {
        if (findPath(shop, { x: 6, y: 8 }, { x: interaction.x + delta.x, y: interaction.y + delta.y })) reachable = true;
      }
      expect(reachable, interaction.id).toBe(true);
    }
    expect(shop.interactions.map(i => i.eventKey)).toEqual(['shopping.konbini.clerk', 'shopping.konbini.snacks', 'shopping.konbini.drinks']);
    const closed = buildWorld({ ...CHILDHOOD_VARIANT, facilityStates: { 'shop-konbini': 'closed' } });
    expect(closed.areas.get('town-main')!.def.portals.some(p => p.id === 'konbini-enter')).toBe(false);
    expect(isSolidTile(closed.areas.get('town-main')!, 54, 52)).toBe(true);
  });
  it('generates identical data for repeated builds and assigns districts', () => {
    const first = buildWorld(), second = buildWorld();
    for (const [key, a] of first.areas) {
      expect(a.ground).toEqual(second.areas.get(key)!.ground);
      expect(a.objects).toEqual(second.areas.get(key)!.objects);
    }
    const town = first.areas.get('town-main')!;
    expect(districtAt(town, 35, 32)?.id).toBe('town-residential-west');
    expect(districtAt(town, 98, 60)?.id).toBe('town-riverside-park');
    expect(districtAt(town, -1, 20)).toBeUndefined();
    expect(hash2(2, 3, 5)).toBe(hash2(2, 3, 5));
  });
  it('leaves every building door front, home garden gate and shopping sidewalk unobstructed', () => {
    const town = buildWorld().areas.get('town-main')!;
    for (const b of town.objects.filter(o => ['house', 'apartment', 'shop', 'school', 'gym', 'station'].includes(o.kind))) {
      const front = { x: b.x + Math.floor(b.w / 2), y: b.y + b.h };
      expect(isSolidTile(town, front.x, front.y), `${b.id} door front`).toBe(false);
      expect(findPath(town, LANDMARKS.homeFront, front), `${b.id} reachable door front`).not.toBeNull();
    }
    for (let y = 32; y <= 37; y++) expect(isSolidTile(town, 35, y)).toBe(false);
    for (let x = 30; x <= 77; x++) expect(isSolidTile(town, x, 54)).toBe(false);
    for (const prop of town.objects.filter(o => ['vending', 'postbox', 'busstop'].includes(o.kind))) {
      expect(town.interactions.some(i => i.x === prop.x && i.y === prop.y), `${prop.id} can be examined`).toBe(true);
    }
  });
  it('reports demonstrated corrupt data instead of accepting it', () => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    town.objects.push({ id: 'home-enter', kind: 'tree', x: 128, y: 1, w: 1, h: 1, solid: true, facilityId: 'missing' });
    town.def.portals.push({ id: 'broken-door', from: { x: 35, y: 32 }, to: { areaId: 'missing', x: 0, y: 0, facing: 'down' } });
    const problems = validateWorld(world);
    expect(problems).toContain('Duplicate ID: home-enter');
    expect(problems).toContain('Out of bounds: home-enter');
    expect(problems).toContain('Unknown facility missing: home-enter');
    expect(problems).toContain('Unknown destination missing: broken-door');
    town.solid[32 * town.width + 35] = 1;
    expect(validateWorld(world)).toContain('Invalid or solid starting point');
  });
  it('connects all performance waypoints and covers straight roads, turns, crossings and both chunk axes', () => {
    const town = buildWorld().areas.get('town-main')!;
    const paths = Object.fromEntries(Object.entries(PERF_ROUTES).map(([id, route]) => {
      const path: { x: number; y: number }[] = [];
      for (let i = 1; i < route.points.length; i++) {
        const segment = findPath(town, route.points[i - 1], route.points[i]);
        expect(segment, `${id} segment ${i}`).not.toBeNull();
        path.push(...segment!.slice(i === 1 ? 0 : 1));
      }
      return [id, path];
    }));
    expect(paths.straightRoad.length).toBeGreaterThanOrEqual(41);
    expect(new Set(paths.straightRoad.map(p => p.y)).size).toBe(1);
    let turns = 0;
    for (let i = 2; i < paths.corners.length; i++) {
      const a = paths.corners[i - 2], b = paths.corners[i - 1], c = paths.corners[i];
      if (b.x - a.x !== c.x - b.x || b.y - a.y !== c.y - b.y) turns++;
    }
    expect(turns).toBeGreaterThanOrEqual(4);
    expect(paths.crosswalk.some(p => {
      const tile = town.ground[p.y * town.width + p.x];
      return tile === T.ZEBRA_H || tile === T.ZEBRA_V;
    })).toBe(true);
    for (const id of ['bridge', 'footbridge']) expect(paths[id].some(p => town.ground[p.y * town.width + p.x] === T.BRIDGE), id).toBe(true);
    expect(new Set(paths.diagonalChunks.map(p => tileToChunk(p.x))).size).toBeGreaterThan(1);
    expect(new Set(paths.diagonalChunks.map(p => tileToChunk(p.y))).size).toBeGreaterThan(1);
  });
});
