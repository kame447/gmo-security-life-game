import { describe, expect, it } from 'vitest';
import type { MapEvent } from '../src/core/types';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { TRAIN_NETWORK } from '../src/travel/network';
import { TrainTravelSession } from '../src/travel/session';
import { outsideOf } from '../src/travel/stations';
import { buildWorld, getStationFlow, validateWorld } from '../src/world';
import { STATION_ACCESS } from '../src/world/landmarks';
import { toRuntime } from '../src/world/runtime';
import { createNeighborStation, createNeighborTown, NEIGHBOR_FACILITIES, NEIGHBOR_STATION_ACCESS } from '../src/world/towns/neighbor';

/** #35 supplies the original station; the not-yet-wired neighboring areas are added for this test. */
function fixtureWorld() {
  const world = buildWorld();
  for (const facility of NEIGHBOR_FACILITIES) world.facilities.set(facility.id, { ...facility });
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
    const mainGate = getStationFlow(STATION_ACCESS.stationId).gate;
    game.player = positionAt({ areaId: mainGate.areaId, x: mainGate.tile.x, y: mainGate.tile.y + 1, facing: 'up' });
    game.setAppearance({ ...game.appearance, outfitColor: 'red' });
    const appearance = { ...game.appearance }, outbound = new TrainTravelSession(game, TRAIN_NETWORK);
    expect(outbound.begin(facingEvent(game))).toBe(true);
    expect(outbound.choose(NEIGHBOR_STATION_ACCESS.stationId)).toMatchObject({ direction: 'down' });
    expect(outbound.commitArrival()).toMatchObject({ ok: true });
    expect(game.player).toEqual(positionAt(outsideOf(getStationFlow(NEIGHBOR_STATION_ACCESS.stationId))));
    const restored = new Game(world, { save: game.serialize() });
    expect(restored.player).toEqual(game.player);
    expect(restored.appearance).toEqual(appearance);
    // 帰路は上り: となりまちの改札で決める。
    const gate = getStationFlow(NEIGHBOR_STATION_ACCESS.stationId).gate;
    restored.player = positionAt({ areaId: gate.areaId, x: gate.tile.x, y: gate.tile.y + 1, facing: 'up' });
    const returning = new TrainTravelSession(restored, TRAIN_NETWORK);
    expect(returning.begin(facingEvent(restored))).toBe(true);
    expect(returning.choose(STATION_ACCESS.stationId)).toMatchObject({ direction: 'up' });
    expect(returning.commitArrival()).toMatchObject({ ok: true });
    expect(restored.player).toEqual(positionAt(outsideOf(getStationFlow(STATION_ACCESS.stationId))));
    expect(restored.appearance).toEqual(appearance);
  });
});
