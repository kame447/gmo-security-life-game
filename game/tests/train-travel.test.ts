import { describe, expect, it } from 'vitest';
import { feetAtTile, pxToTile } from '../src/core/coords';
import type { MapEvent } from '../src/core/types';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { TrainTravelSession } from '../src/travel/session';
import { buildWorld } from '../src/world';
import { RailwayNetwork, type RailwayStation } from '../src/world/railway';
import { toRuntime } from '../src/world/runtime';
import { createNeighborStation, createNeighborTown, NEIGHBOR_STATION_ACCESS as neighbor } from '../src/world/towns/neighbor';

const origin: RailwayStation = {
  id: 'test-origin', name: 'もとのまち',
  boarding: { areaId: 'test-origin-station', x: 9, y: 5, facing: 'up', interactionId: 'test-origin-board', eventKey: 'travel.station.board' },
  arrival: { areaId: 'test-origin-station', x: 9, y: 6, facing: 'down' },
};
const destination: RailwayStation = { id: neighbor.stationId, name: neighbor.name, boarding: neighbor.boarding, arrival: neighbor.arrival };

function setup() {
  const world = buildWorld(), original = createNeighborStation();
  const originArea = { ...original, id: origin.boarding.areaId,
    objects: original.objects.map(object => ({ ...object, id: `origin-${object.id}` })), portals: [],
    interactions: original.interactions.map(interaction => ({ ...interaction, id: origin.boarding.interactionId })) };
  world.areas.set(originArea.id, toRuntime(originArea));
  world.areas.set(neighbor.arrival.areaId, toRuntime(createNeighborStation()));
  world.areas.set('town-neighbor', toRuntime(createNeighborTown()));
  const railway = new RailwayNetwork([origin, destination], [{ id: 'local-line', stations: [origin.id, destination.id] }]);
  const game = new Game(world);
  game.player = positionAt(origin.boarding);
  return { world, railway, game, travel: new TrainTravelSession(game, railway) };
}

function interaction(game: Game): MapEvent {
  const target = game.facingInteraction();
  if (!target) throw new Error('No station interaction in front of player');
  return { type: 'interact', areaId: game.player.areaId, interactionId: target.id, eventKey: target.eventKey };
}

describe('train travel session', () => {
  it('makes an explicit round trip and restores the destination and appearance from a real save', () => {
    const { world, railway, game, travel } = setup();
    game.setAppearance({ ...game.appearance, hairColor: 'black', outfitColor: 'red' });
    const appearance = { ...game.appearance }, stage = world.variant.stage;
    expect(travel.begin(interaction(game))).toBe(true);
    expect(travel.confirm()).toEqual({ ok: false, reason: 'not-confirming' });
    expect(game.player).toEqual(positionAt(origin.boarding));
    expect(travel.select(destination.id)).toBe(true);
    expect(travel.confirm()).toEqual({ ok: true, originId: origin.id, destinationId: destination.id });
    expect(game.player).toEqual(positionAt(destination.arrival));
    expect(game.appearance).toEqual(appearance);
    expect(world.variant.stage).toBe(stage);

    const restored = new Game(world, { save: game.serialize() });
    expect(restored.player).toEqual(positionAt(destination.arrival));
    expect(restored.appearance).toEqual(appearance);
    // Walk from the arrival tile to the boarding point; no automatic rail transition occurs.
    for (let step = 0; step < 120 && pxToTile(restored.player.y - 4) !== neighbor.boarding.y; step++) {
      restored.update(1 / 120, { dir: 'up', run: false });
      expect(restored.player.areaId).toBe(destination.boarding.areaId);
    }
    const returning = new TrainTravelSession(restored, railway);
    expect(returning.begin(interaction(restored))).toBe(true);
    expect(returning.select(origin.id)).toBe(true);
    expect(returning.confirm()).toEqual({ ok: true, originId: destination.id, destinationId: origin.id });
    expect(restored.player).toEqual(positionAt(origin.arrival));
    expect(new Game(world, { save: restored.serialize() }).appearance).toEqual(appearance);
    expect(world.variant.stage).toBe(stage);
  });

  it('refuses boarding away from the correct tile, direction, interaction or during a dialog', () => {
    const { game, travel } = setup(), event = interaction(game), initial = { ...game.player };
    expect(travel.begin({ ...event, type: 'area-enter', areaId: game.player.areaId })).toBe(false);
    expect(travel.begin({ type: 'interact', areaId: game.player.areaId, interactionId: 'wrong', eventKey: 'travel.station.board' })).toBe(false);
    game.player = { ...initial, ...feetAtTile(10, 5) };
    expect(travel.begin(event)).toBe(false);
    game.player = { ...initial, facing: 'left' };
    expect(travel.begin(event)).toBe(false);
    game.player = initial;
    game.dialog = { speaker: 'test', lines: ['test'], index: 0 };
    expect(travel.begin(event)).toBe(false);
    expect(game.player).toEqual(initial);
  });

  it('rechecks the boarding point on confirmation and never transfers a stale choice', () => {
    const { game, travel } = setup();
    expect(travel.begin(interaction(game))).toBe(true);
    expect(travel.select(destination.id)).toBe(true);
    game.player = { ...game.player, ...feetAtTile(10, 5) };
    const moved = { ...game.player };
    expect(travel.confirm()).toEqual({ ok: false, reason: 'origin-unavailable' });
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
      expect(travel.begin(interaction(game))).toBe(true);
      expect(travel.select(destination.id)).toBe(true);
      expect(travel.confirm()).toEqual({ ok: false, reason: 'destination-unavailable' });
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
    });
    const before = { ...game.player };
    expect(travel.begin(interaction(game))).toBe(true);
    expect(travel.select(destination.id)).toBe(true);
    expect(travel.confirm()).toEqual({ ok: false, reason: 'destination-unavailable' });
    expect(game.player).toEqual(before);
    allowed = true;
    expect(travel.confirm()).toEqual({ ok: true, originId: origin.id, destinationId: destination.id });
    expect(game.player).toEqual(positionAt(destination.arrival));
    expect(calls).toEqual([destination.arrival.areaId, destination.arrival.areaId]);
  });
});
