import { describe, expect, it } from 'vitest';
import { feetAtTile, pxToTile } from '../src/core/coords';
import type { MapEvent } from '../src/core/types';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { TrainTravelSession, type TravelResult } from '../src/travel/session';
import type { StationFlow } from '../src/travel/stations';
import { buildWorld, getStationFlow } from '../src/world';
import { RailwayNetwork, type RailwayStation } from '../src/world/railway';
import { toRuntime } from '../src/world/runtime';
import { createNeighborStation, createNeighborTown, NEIGHBOR_FACILITIES, NEIGHBOR_STATION_ACCESS as neighbor } from '../src/world/towns/neighbor';

const neighborFlow = getStationFlow(neighbor.stationId), nGate = neighborFlow.gate;
const origin: RailwayStation = {
  id: 'test-origin', name: 'もとのまち',
  boarding: { ...neighbor.boarding, areaId: 'test-origin-station', interactionId: 'test-origin-board' },
  arrival: { ...neighbor.arrival, areaId: 'test-origin-station' },
};
const destination: RailwayStation = { id: neighbor.stationId, name: neighbor.name, boarding: neighbor.boarding, arrival: neighbor.arrival };
/** 試験用の出発駅は、となりまちの構内を複製し、改札も同じ位置に持つ。 */
const FLOWS: readonly StationFlow[] = [
  { stationId: origin.id, gate: { areaId: origin.boarding.areaId, interactionId: nGate.interactionId, eventKey: nGate.eventKey, tile: nGate.tile, w: nGate.w },
    platforms: neighborFlow.platforms },
  neighborFlow,
];
const south = { x: nGate.tile.x, y: nGate.tile.y + 1 };

function setup() {
  const world = buildWorld(), original = createNeighborStation();
  for (const facility of NEIGHBOR_FACILITIES) world.facilities.set(facility.id, { ...facility });
  world.areas.set(origin.boarding.areaId, toRuntime({ ...original, id: origin.boarding.areaId, portals: [] }));
  world.areas.set(neighbor.arrival.areaId, toRuntime(createNeighborStation()));
  world.areas.set('town-neighbor', toRuntime(createNeighborTown()));
  const railway = new RailwayNetwork([origin, destination], [{ id: 'local-line', stations: [origin.id, destination.id] }]);
  const game = new Game(world);
  game.player = positionAt({ areaId: origin.boarding.areaId, ...south, facing: 'up' });
  return { world, railway, game, travel: new TrainTravelSession(game, railway, undefined, FLOWS, [origin.id, destination.id]) };
}

function gateEvent(game: Game): MapEvent {
  const target = game.facingInteraction();
  if (!target) throw new Error('No gate in front of player');
  return { type: 'interact', areaId: game.player.areaId, interactionId: target.id, eventKey: target.eventKey };
}

/** 改札で決めたら、そのまま乗車→到着。確認や切符は挟まない。 */
function ride(travel: TrainTravelSession, game: Game, destinationId: string): TravelResult {
  expect(travel.begin(gateEvent(game))).toBe(true);
  expect(travel.choose(destinationId)).not.toBeNull();
  expect(travel.isRiding).toBe(true);
  return travel.commitArrival();
}

describe('train travel session', () => {
  it('rides in one decision, restores the destination and appearance from a real save, and returns', () => {
    const { world, game, railway, travel } = setup();
    game.setAppearance({ ...game.appearance, hairColor: 'black', outfitColor: 'red' });
    const appearance = { ...game.appearance }, stage = world.variant.stage;
    expect(travel.begin(gateEvent(game))).toBe(true);
    expect(travel.commitArrival()).toEqual({ ok: false, reason: 'not-riding' });
    travel.cancel();
    expect(ride(travel, game, destination.id)).toEqual({ ok: true, originId: origin.id, destinationId: destination.id });
    expect(game.player).toEqual(positionAt(destination.arrival));
    expect(game.appearance).toEqual(appearance);
    expect(world.variant.stage).toBe(stage);

    const restored = new Game(world, { save: game.serialize() });
    expect(restored.player).toEqual(positionAt(destination.arrival));
    expect(restored.appearance).toEqual(appearance);
    restored.player = positionAt({ areaId: nGate.areaId, ...south, facing: 'up' });
    const returning = new TrainTravelSession(restored, railway, undefined, FLOWS, [origin.id, destination.id]);
    expect(ride(returning, restored, origin.id)).toEqual({ ok: true, originId: destination.id, destinationId: origin.id });
    expect(restored.player).toEqual(positionAt(origin.arrival));
    expect(new Game(world, { save: restored.serialize() }).appearance).toEqual(appearance);
  });

  it('opens only for the gate itself, from the permitted tile and direction, and never during a dialog', () => {
    const { game, travel } = setup(), event = gateEvent(game), initial = { ...game.player };
    expect(travel.begin({ ...event, type: 'area-enter', areaId: game.player.areaId })).toBe(false);
    expect(travel.begin({ type: 'interact', areaId: game.player.areaId, interactionId: 'wrong', eventKey: event.type === 'interact' ? event.eventKey : '' })).toBe(false);
    game.player = { ...initial, ...feetAtTile(south.x + 2, south.y) };
    expect(travel.begin(event)).toBe(false);
    game.player = { ...initial, facing: 'left' };
    expect(travel.begin(event)).toBe(false);
    game.player = initial;
    game.dialog = { speaker: 'test', lines: ['test'], index: 0 };
    expect(travel.begin(event)).toBe(false);
    expect(game.player).toEqual(initial);
  });

  it('rechecks the gate position when the destination is chosen and never rides from a stale position', () => {
    const { game, travel } = setup();
    expect(travel.begin(gateEvent(game))).toBe(true);
    game.player = { ...game.player, ...feetAtTile(south.x + 2, south.y) };
    const moved = { ...game.player };
    expect(travel.choose(destination.id)).toBeNull();
    expect(travel.commitArrival()).toEqual({ ok: false, reason: 'not-riding' });
    expect(game.player).toEqual(moved);
    expect(travel.isOpen).toBe(false);
  });

  it('refuses a missing, blocked or auto-portal arrival without changing the player', () => {
    for (const problem of ['missing', 'solid', 'portal'] as const) {
      const { world, game, travel } = setup(), before = { ...game.player };
      const target = world.areas.get(destination.arrival.areaId)!;
      const index = destination.arrival.y * target.width + destination.arrival.x;
      if (problem === 'missing') world.areas.delete(destination.arrival.areaId);
      if (problem === 'solid') target.solid[index] = 1;
      if (problem === 'portal') target.portalAt.set(index, { id: 'bad', from: { x: destination.arrival.x, y: destination.arrival.y }, to: origin.arrival });
      expect(ride(travel, game, destination.id)).toEqual({ ok: false, reason: 'destination-unavailable' });
      expect(game.player).toEqual(before);
    }
  });

  it('uses the shared arrival hook only after validation and honours a rejected transition', () => {
    const { game, railway } = setup(), calls: string[] = [];
    let allowed = false;
    const travel = new TrainTravelSession(game, railway, point => {
      calls.push(point.areaId);
      if (!allowed) return false;
      game.player = positionAt(point);
      return true;
    }, FLOWS, [origin.id, destination.id]);
    const before = { ...game.player };
    expect(ride(travel, game, destination.id)).toEqual({ ok: false, reason: 'destination-unavailable' });
    expect(game.player).toEqual(before);
    allowed = true;
    expect(ride(travel, game, destination.id)).toEqual({ ok: true, originId: origin.id, destinationId: destination.id });
    expect(game.player).toEqual(positionAt(destination.arrival));
    expect(calls).toEqual([destination.arrival.areaId, destination.arrival.areaId]);
    expect(pxToTile(game.player.x)).toBe(destination.arrival.x);
  });
});
