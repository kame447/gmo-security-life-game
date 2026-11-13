import { describe, expect, it } from 'vitest';
import type { MapEvent } from '../src/core/types';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { TRAIN_NETWORK } from '../src/travel/network';
import { TrainTravelSession } from '../src/travel/session';
import { buildWorld, validateWorld } from '../src/world';
import { STATION_ACCESS } from '../src/world/landmarks';
import { toRuntime } from '../src/world/runtime';
import { createNeighborStation, createNeighborTown, NEIGHBOR_STATION_ACCESS } from '../src/world/towns/neighbor';

/** #35 supplies the original station; the not-yet-wired neighboring areas are added for this test. */
function fixtureWorld() {
  const world = buildWorld();
  for (const area of [createNeighborTown(), createNeighborStation()]) world.areas.set(area.id, toRuntime(area));
  return world;
}

function facingEvent(game: Game): MapEvent {
  const target = game.facingInteraction();
  if (!target) throw new Error('No boarding target');
  return { type: 'interact', areaId: game.player.areaId, interactionId: target.id, eventKey: target.eventKey };
}

describe('train network with the #35 station and neighboring-area fixture', () => {
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
