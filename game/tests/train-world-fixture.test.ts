import { describe, expect, it } from 'vitest';
import type { AreaDef, MapEvent } from '../src/core/types';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { TRAIN_NETWORK } from '../src/travel/network';
import { TrainTravelSession } from '../src/travel/session';
import { buildWorld, validateWorld } from '../src/world';
import { STATION_ACCESS } from '../src/world/landmarks';
import { toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';
import { createTown } from '../src/world/town';
import { createNeighborStation, createNeighborTown, NEIGHBOR_STATION_ACCESS } from '../src/world/towns/neighbor';

/** A simple temporary station checks the contract; it is not #35's finished geometry. */
function fixtureWorld() {
  const world = buildWorld(), town = createTown();
  town.portals.push({ id: STATION_ACCESS.entrancePortalId, from: { x: 28, y: 63 }, to: { ...STATION_ACCESS.entry }, facilityId: 'station' });
  world.areas.set(town.id, toRuntime(town));
  const width = 36, height = 18, ground = new Uint8Array(width * height).fill(T.FLOOR_CLASS);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!x || !y || x === width - 1 || y === height - 1) ground[y * width + x] = T.WALL;
  }
  const mainStation: AreaDef = {
    id: STATION_ACCESS.areaId, name: 'テスト駅', kind: 'indoor', width, height, ground, objects: [],
    portals: [{ id: STATION_ACCESS.exitPortalId, from: { x: 17, y: 17 },
      to: { areaId: 'town-main', x: 28, y: 64, facing: 'down' }, facilityId: 'station' }],
    interactions: [{ id: STATION_ACCESS.interaction.id, kind: 'sign', name: 'テスト案内',
      x: STATION_ACCESS.interaction.x, y: STATION_ACCESS.interaction.y, solid: true,
      eventKey: STATION_ACCESS.interaction.eventKey, lines: ['test'] }],
  };
  world.areas.set(mainStation.id, toRuntime(mainStation));
  for (const area of [createNeighborTown(), createNeighborStation()]) world.areas.set(area.id, toRuntime(area));
  return world;
}

function facingEvent(game: Game): MapEvent {
  const target = game.facingInteraction();
  if (!target) throw new Error('No boarding target');
  return { type: 'interact', areaId: game.player.areaId, interactionId: target.id, eventKey: target.eventKey };
}

describe('train network with a temporary station fixture', () => {
  it('validates the real neighboring areas only when the explicit rail edges are supplied', () => {
    const world = fixtureWorld();
    expect(validateWorld(world)).toContain('Unreachable interaction: neighbor-town-board');
    expect(validateWorld(world, { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
  });

  it('uses the published station constants for a confirmed trip and restored return', () => {
    const world = fixtureWorld(), game = new Game(world);
    game.player = positionAt(STATION_ACCESS.boarding);
    game.setAppearance({ ...game.appearance, outfitColor: 'red' });
    const appearance = { ...game.appearance }, outbound = new TrainTravelSession(game, TRAIN_NETWORK);
    expect(outbound.begin(facingEvent(game))).toBe(true);
    expect(outbound.select(NEIGHBOR_STATION_ACCESS.stationId)).toBe(true);
    expect(outbound.confirm()).toMatchObject({ ok: true });
    expect(game.player).toEqual(positionAt(NEIGHBOR_STATION_ACCESS.arrival));
    const restored = new Game(world, { save: game.serialize() });
    expect(restored.player).toEqual(game.player);
    expect(restored.appearance).toEqual(appearance);
    restored.player = positionAt(NEIGHBOR_STATION_ACCESS.boarding);
    const returning = new TrainTravelSession(restored, TRAIN_NETWORK);
    expect(returning.begin(facingEvent(restored))).toBe(true);
    expect(returning.select(STATION_ACCESS.stationId)).toBe(true);
    expect(returning.confirm()).toMatchObject({ ok: true });
    expect(restored.player).toEqual(positionAt(STATION_ACCESS.arrival));
    expect(restored.appearance).toEqual(appearance);
  });
});
