import { describe, expect, it } from 'vitest';
import { DIR, feetAtTile } from '../src/core/coords';
import { positionAt, canStand } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { buildWorld, findPath, isSolidTile, LANDMARKS, STATION_ACCESS, validateWorld, type AreaRuntime } from '../src/world';
import { isRailGround, T } from '../src/world/tiles';
import { TRAIN_NETWORK } from '../src/travel/network';
import { MAIN_STATION_LAYOUT as layout } from '../src/world/landmarks';

const feetTile = (game: Game) => ({ x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) });
function walk(game: Game, target: { x: number; y: number }) {
  const areaId = game.player.areaId, route = findPath(game.area, feetTile(game), target);
  expect(route, `path to ${JSON.stringify(target)}`).not.toBeNull();
  for (let i = 1; i < route!.length; i++) {
    const previous = route![i - 1], next = route![i];
    const dir = next.x > previous.x ? 'right' : next.x < previous.x ? 'left' : next.y > previous.y ? 'down' : 'up';
    game.update(16 / 128, { dir, run: true });
    if (game.player.areaId !== areaId) return;
    expect(feetTile(game)).toEqual(next);
  }
}
const railCells = (area: AreaRuntime) => Array.from(area.ground, (tile, i) => ({ tile, x: i % area.width, y: Math.floor(i / area.width) }))
  .filter(point => isRailGround(point.tile));

describe('station, crossings and railway bridge', () => {
  it('registers a reachable station using the existing facility and preserves the station staff', () => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    expect(validateWorld(world, { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
    expect(world.facilities.get('station')?.interior).toBe('full');
    expect(world.areas.get(STATION_ACCESS.areaId)?.width).toBe(36);
    expect(town.interactions.find(i => i.id === 'station-staff')).toMatchObject({
      name: 'えきいんさん', x: 32, y: 90, sprite: 'staff',
      lines: ['でんしゃは もうすぐ くるよ。きいろい せんの うちがわで まってね。'],
    });
  });
  it('walks from home through the station entrance, ticket gate and platform and returns through the original door', () => {
    const game = new Game(buildWorld());
    walk(game, LANDMARKS.stationFront);
    walk(game, STATION_ACCESS.outdoorEntrance);
    expect(game.player).toEqual(positionAt(STATION_ACCESS.entry));
    const route = findPath(game.area, STATION_ACCESS.entry, STATION_ACCESS.boarding)!;
    expect(route.some(p => p.y === 12 && [17, 18].includes(p.x))).toBe(true);
    walk(game, STATION_ACCESS.boarding);
    game.update(1 / 120, { dir: STATION_ACCESS.boarding.facing, run: false });
    expect(game.facingInteraction()?.id).toBe(STATION_ACCESS.interaction.id);
    expect(game.area.ground[feetTile(game).y * game.area.width + feetTile(game).x]).toBe(T.PLATFORM);
    walk(game, { x: 17, y: 17 });
    expect(game.player).toEqual(positionAt({ areaId: 'town-main', ...LANDMARKS.stationFront, facing: 'down' }));
  });
  it('has no path around the ticket gates or from either platform side onto the tracks', () => {
    const station = buildWorld().areas.get(STATION_ACCESS.areaId)!;
    const closedGates = { ...station, solid: station.solid.slice() };
    for (const x of [17, 18]) closedGates.solid[12 * station.width + x] = 1;
    expect(findPath(closedGates, STATION_ACCESS.entry, STATION_ACCESS.boarding)).toBeNull();
    for (const point of railCells(station)) {
      expect(isSolidTile(station, point.x, point.y)).toBe(true);
      expect(findPath(station, STATION_ACCESS.entry, point)).toBeNull();
      expect(canStand(station, ...Object.values(feetAtTile(point.x, point.y)) as [number, number])).toBe(false);
    }
  });
  it('continues the rails across both river banks on a railway-only bridge', () => {
    const town = buildWorld().areas.get('town-main')!;
    for (let y = layout.trackY; y < layout.trackY + layout.trackRows; y++) {
      for (let x = 0; x < town.width; x++) expect(isRailGround(town.ground[y * town.width + x]), `${x},${y}`).toBe(true);
      for (let x = 116; x <= 120; x++) {
        expect(town.ground[y * town.width + x]).toBe(T.RAIL_BRIDGE);
        expect(isSolidTile(town, x, y)).toBe(true);
        expect(findPath(town, LANDMARKS.homeFront, { x, y })).toBeNull();
      }
      expect(isRailGround(town.ground[y * town.width + 115])).toBe(true);
      expect(isRailGround(town.ground[y * town.width + 121])).toBe(true);
    }
    for (const y of [layout.trackY - 1, layout.trackY + layout.trackRows]) for (let x = 116; x <= 120; x++) expect(town.ground[y * town.width + x]).toBe(T.WATER);
  });
  it.each([56, 80, 125])('crosses the road and sidewalks at x=%i in both directions using Game movement', x => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    for (let y = layout.trackY; y < layout.trackY + layout.trackRows; y++) {
      expect(town.ground[y * town.width + x]).toBe(T.CROSSING);
      expect(isSolidTile(town, x, y)).toBe(false);
    }
    const game = new Game(world);
    game.player = positionAt({ areaId: 'town-main', x, y: layout.trackY - 1, facing: 'down' });
    walk(game, { x, y: layout.trackY + layout.trackRows + 1 }); walk(game, { x, y: layout.trackY - 1 });
    expect(feetTile(game)).toEqual({ x, y: layout.trackY - 1 });
    // Sidewalks beside each carriageway also have the crossing surface and no hidden fence.
    const roadEdges = x === 56 ? [55, 58] : x === 80 ? [78, 82] : [124, 127];
    for (const edge of roadEdges) for (let y = layout.trackY; y < layout.trackY + layout.trackRows; y++) {
      expect(town.ground[y * town.width + edge]).toBe(T.CROSSING);
      expect(isSolidTile(town, edge, y)).toBe(false);
    }
  });
  it.each([false, true])('keeps movement out of track tiles at every exposed border (run=%s)', run => {
    const world = buildWorld(), game = new Game(world);
    let borders = 0;
    for (const areaId of ['town-main', STATION_ACCESS.areaId]) {
      const area = world.areas.get(areaId)!;
      for (const point of railCells(area).filter(p => p.tile !== T.CROSSING)) {
        expect(isSolidTile(area, point.x, point.y)).toBe(true);
        for (const [direction, { dx, dy }] of Object.entries(DIR)) {
          const from = { x: point.x - dx, y: point.y - dy };
          if (isSolidTile(area, from.x, from.y)) continue;
          borders++;
          game.player = positionAt({ areaId, ...from, facing: direction as keyof typeof DIR });
          game.update(2, { dir: direction as keyof typeof DIR, run });
          const tile = feetTile(game), standing = game.area.ground[tile.y * game.area.width + tile.x];
          expect([T.RAIL, T.RAIL_BRIDGE, T.CROSSING_SIGNAL]).not.toContain(standing);
          expect(canStand(game.area, game.player.x, game.player.y)).toBe(true);
        }
      }
    }
    expect(borders).toBeGreaterThan(200);
  });
  it('preserves station/platform and crossing saves without changing variant or appearance', () => {
    const world = buildWorld();
    for (const spawn of [STATION_ACCESS.entry, STATION_ACCESS.boarding, STATION_ACCESS.arrival,
      { areaId: 'town-main', x: 56, y: layout.trackY + 1, facing: 'down' as const }]) {
      const game = new Game(world); game.player = positionAt(spawn);
      const saved = game.serialize(), restored = new Game(buildWorld(), { save: saved });
      expect(restored.serialize()).toEqual(saved);
      expect(restored.world.variant.stage).toBe('childhood');
    }
  });
});
