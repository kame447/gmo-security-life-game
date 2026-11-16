import { describe, expect, it } from 'vitest';
import type { MapEvent } from '../src/core/types';
import { LifeEventDirector } from '../src/events/director';
import { CHILDHOOD_SAMPLE_EVENTS } from '../src/events/samples/childhood';
import { canStand, positionAt } from '../src/map/explorer';
import { PHONE_BUDGET_PROTOTYPE } from '../src/phone/budget-config';
import { Game } from '../src/session/game';
import type { SaveData } from '../src/state/save';
import { TRAIN_NETWORK } from '../src/travel/network';
import { TrainTravelSession } from '../src/travel/session';
import { buildWorld, getStationFlow } from '../src/world';

describe('train integration with current main state', () => {
  it('preserves assets, phone, appearance and life history across a round trip and saved arrival', () => {
    const world = buildWorld(), seed = new Game(world).serialize();
    const origin = getStationFlow('station'), destination = getStationFlow('station-neighbor');
    const director = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS);
    let travel: TrainTravelSession;
    const game = new Game(world, {
      save: { ...seed, ...positionAt(origin.front), assets: { moneyYen: 4321, items: [{ itemId: 'notebook', quantity: 3 }] },
        phone: { ...seed.phone, dataBudget: { v: 1, remainingMb: 1234, capacityMb: 5000 } } },
      phoneClock: () => 0, phoneEpochClock: () => 0,
      sink: { onMapEvent: event => travel?.begin(event) ? { lines: [] } : director.onMapEvent(event) },
    });
    travel = new TrainTravelSession(game, TRAIN_NETWORK, spawn => game.arriveByTrain(spawn));
    game.setAppearance({ ...game.appearance, hairColor: 'gold', outfitColor: 'purple' });
    director.state.record('earlier-event', 'earlier-choice');
    const before = game.serialize(), history = director.state.toJSON(), stage = world.variant.stage;
    const arrivals: SaveData[] = [];
    game.on(event => { if (event.type === 'area-enter') arrivals.push(game.serialize()); });

    for (const [from, to] of [[origin, destination], [destination, origin]]) {
      game.player = positionAt(from.front);
      game.action();
      expect(game.dialog).toBeNull();
      expect(travel.choose(to.stationId)).not.toBeNull();
      expect(travel.commitArrival()).toMatchObject({ ok: true });
      expect(game.player).toEqual(positionAt(to.outside));
      const saved = arrivals.at(-1)!;
      expect(saved.assets).toEqual(before.assets);
      expect(saved.phone).toEqual(before.phone);
      expect(saved.appearance).toEqual(before.appearance);
      expect(new Game(world, { save: saved, phoneClock: () => 0, phoneEpochClock: () => 0 }).serialize()).toEqual(saved);
      expect(director.state.toJSON()).toEqual(history);
      expect(world.variant.stage).toBe(stage);
    }
    expect(arrivals).toHaveLength(2);

    // The same sink must still hand non-station interactions to the life-event director.
    const area = [...world.areas.values()].find(area => area.def.interactions.some(target => target.eventKey === 'home.tablet'))!;
    const target = area.def.interactions.find(target => target.eventKey === 'home.tablet')!;
    const approaches = [
      { x: target.x, y: target.y + 1, facing: 'up' as const },
      { x: target.x, y: target.y - 1, facing: 'down' as const },
      { x: target.x - 1, y: target.y, facing: 'right' as const },
      { x: target.x + 1, y: target.y, facing: 'left' as const },
    ];
    const approach = approaches.find(point => {
      const player = positionAt({ areaId: area.def.id, ...point });
      if (!canStand(area, player.x, player.y)) return false;
      game.player = player;
      return game.facingInteraction()?.id === target.id;
    });
    expect(approach).toBeDefined();
    game.action();
    expect(director.pending?.event.id).toBe('sample.tablet-ad');
    expect(game.dialog?.lines).toEqual(CHILDHOOD_SAMPLE_EVENTS[1].intro);
  });

  it('settles phone usage at the train arrival boundary before emitting the saved arrival', () => {
    const world = buildWorld(), origin = getStationFlow('station'), destination = getStationFlow('station-neighbor');
    let now = 0;
    const config = { ...PHONE_BUDGET_PROTOTYPE, capacityMb: 100, consumptionMbPerSecond: 1,
      homeAreaIds: [origin.front.areaId], homeFacilityIds: [] };
    const game = new Game(world, { phoneClock: () => now, phoneEpochClock: () => 0, phoneDataConfig: config });
    game.player = positionAt(origin.front);
    game.phone.open();
    const events: MapEvent[] = [];
    game.on(event => events.push(event));
    now = 10_000;
    expect(game.arriveByTrain(destination.outside)).toBe(true);
    expect(game.phone.remainingDataMb).toBe(100);
    now = 15_000;
    game.phone.tick();
    expect(game.phone.remainingDataMb).toBe(95);
    expect(events).toEqual([{ type: 'area-enter', areaId: destination.outside.areaId }]);
    now = 20_000;
    expect(game.arriveByTrain(origin.outside)).toBe(true);
    now = 30_000;
    game.phone.tick();
    expect(game.phone.remainingDataMb).toBe(90);
  });
});
