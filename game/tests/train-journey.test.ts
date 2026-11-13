import { expect, it } from 'vitest';
import { pxToTile, type Facing } from '../src/core/coords';
import type { MapEventSink } from '../src/core/types';
import { Game } from '../src/session/game';
import { TRAIN_NETWORK } from '../src/travel/network';
import { TrainTravelSession } from '../src/travel/session';
import { buildWorld, findPath, LANDMARKS, STATION_ACCESS } from '../src/world';
import { toRuntime } from '../src/world/runtime';
import { createNeighborStation, createNeighborTown, NEIGHBOR_STATION_ACCESS } from '../src/world/towns/neighbor';

const feetTile = (game: Game) => ({ x: pxToTile(game.player.x), y: pxToTile(game.player.y - 4) });

/** Follow the actual collision/portal code one tile at a time; no position teleport during walking. */
function walk(game: Game, target: { x: number; y: number }): void {
  const areaId = game.player.areaId, route = findPath(game.area, feetTile(game), target);
  expect(route, `path to ${JSON.stringify(target)}`).not.toBeNull();
  for (let i = 1; i < route!.length; i++) {
    const previous = route![i - 1], next = route![i];
    const dir: Facing = next.x > previous.x ? 'right' : next.x < previous.x ? 'left' : next.y > previous.y ? 'down' : 'up';
    game.update(16 / 128, { dir, run: true });
    if (game.player.areaId !== areaId) return;
    expect(feetTile(game)).toEqual(next);
  }
}

it('walks from home to the real station, takes both trains and walks back after a save', () => {
  const world = buildWorld();
  // The normal factory registration is still owned by the shared wiring branch.
  for (const area of [createNeighborTown(), createNeighborStation()]) world.areas.set(area.id, toRuntime(area));
  let travel: TrainTravelSession | undefined;
  const sink: MapEventSink = { onMapEvent: event => travel?.begin(event) ? { lines: [] } : undefined };
  let game = new Game(world, { sink });
  travel = new TrainTravelSession(game, TRAIN_NETWORK);
  game.setAppearance({ ...game.appearance, hairColor: 'black', outfitColor: 'red' });
  const appearance = { ...game.appearance }, age = world.variant.stage;

  walk(game, LANDMARKS.stationFront);
  walk(game, { x: 28, y: 63 });
  expect(game.player.areaId).toBe(STATION_ACCESS.areaId);
  walk(game, STATION_ACCESS.boarding);
  game.update(1 / 120, { dir: STATION_ACCESS.boarding.facing, run: false });
  expect(game.facingInteraction()?.id).toBe(STATION_ACCESS.interaction.id);
  game.action();
  expect(travel.isOpen).toBe(true);
  expect(travel.select(NEIGHBOR_STATION_ACCESS.stationId)).toBe(true);
  expect(game.player.areaId).toBe(STATION_ACCESS.areaId);
  expect(travel.confirm()).toMatchObject({ ok: true });
  expect(game.player.areaId).toBe(NEIGHBOR_STATION_ACCESS.arrival.areaId);

  walk(game, { x: 9, y: 11 });
  expect(game.player.areaId).toBe('town-neighbor');
  walk(game, { x: 43, y: 12 });
  const saved = game.serialize();
  game = new Game(world, { save: saved, sink });
  travel = new TrainTravelSession(game, TRAIN_NETWORK);
  expect(game.serialize()).toEqual(saved);
  walk(game, { x: 24, y: 6 });
  expect(game.player.areaId).toBe(NEIGHBOR_STATION_ACCESS.boarding.areaId);
  walk(game, NEIGHBOR_STATION_ACCESS.boarding);
  game.update(1 / 120, { dir: NEIGHBOR_STATION_ACCESS.boarding.facing, run: false });
  game.action();
  expect(travel.select(STATION_ACCESS.stationId)).toBe(true);
  expect(travel.confirm()).toMatchObject({ ok: true });
  expect(game.player.areaId).toBe(STATION_ACCESS.areaId);
  walk(game, { x: 17, y: 17 });
  expect(game.player.areaId).toBe('town-main');
  expect(game.appearance).toEqual(appearance);
  expect(world.variant.stage).toBe(age);
  expect(new Game(world, { save: game.serialize() }).serialize()).toEqual(game.serialize());
});
