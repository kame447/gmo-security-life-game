import { describe, expect, it } from 'vitest';
import type { MapEvent } from '../src/core/types';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import type { SaveData } from '../src/state/save';
import { TRAIN_NETWORK } from '../src/travel/network';
import { TrainTravelSession } from '../src/travel/session';
import { buildWorld, STATION_ACCESS } from '../src/world';
import { NEIGHBOR_STATION_ACCESS } from '../src/world/towns/neighbor';

describe('train area-change integration', () => {
  it('changes position and emits one normal area-enter event while preserving appearance', () => {
    const game = new Game(buildWorld()), events: MapEvent[] = [];
    game.setAppearance({ ...game.appearance, hairColor: 'black' });
    const appearance = { ...game.appearance };
    game.on(event => events.push(event));
    const destination = { areaId: 'home-family-interior', x: 7, y: 10, facing: 'up' } as const;
    expect(game.arriveByTrain(destination)).toBe(true);
    expect(game.player).toEqual(positionAt(destination));
    expect(game.appearance).toEqual(appearance);
    expect(events).toEqual([{ type: 'area-enter', areaId: destination.areaId }]);
  });

  it('rejects missing, blocked and portal destinations without changing position or emitting', () => {
    const world = buildWorld(), game = new Game(world), events: MapEvent[] = [], before = { ...game.player };
    game.on(event => events.push(event));
    for (const destination of [
      { areaId: 'missing', x: 1, y: 1, facing: 'up' as const },
      { areaId: 'home-family-interior', x: 0, y: 0, facing: 'up' as const },
      { areaId: 'home-family-interior', x: 7, y: 11, facing: 'down' as const },
    ]) expect(game.arriveByTrain(destination)).toBe(false);
    expect(game.player).toEqual(before);
    expect(events).toEqual([]);
  });

  it('routes actual boarding through selection and confirmation, saving exactly at the area notification', () => {
    const world = buildWorld(), initial = new Game(world).serialize(), stage = world.variant.stage;
    let travel: TrainTravelSession;
    const game = new Game(world, {
      save: { ...initial, ...positionAt(STATION_ACCESS.boarding) },
      sink: { onMapEvent: event => travel?.begin(event) ? { lines: [] } : undefined },
    });
    travel = new TrainTravelSession(game, TRAIN_NETWORK, destination => game.arriveByTrain(destination));
    game.setAppearance({ ...game.appearance, hairColor: 'black' });
    const before = game.serialize(), events: MapEvent[] = [];
    let arrivalSave: SaveData | undefined;
    game.on(event => {
      if (event.type === 'area-enter') { events.push(event); arrivalSave = game.serialize(); }
    });

    // きっぷが無いままのりばを操作しても、案内が出るだけで何も変わらない。
    game.action();
    expect(game.dialog).toBeNull();
    expect(travel.state).toMatchObject({ step: 'notice', kind: 'no-ticket' });
    expect(travel.startRide()).toBeNull();
    travel.back();
    expect(game.serialize()).toEqual(before);
    expect(events).toEqual([]);

    // 改札で選ぶ。取り消しても、きっぷを受け取っても、位置と保存内容は変わらない。
    game.player = positionAt({ ...STATION_ACCESS.boarding, x: 16, y: 13, facing: 'up' });
    game.action();
    expect(travel.state.step).toBe('destinations');
    expect(travel.select(NEIGHBOR_STATION_ACCESS.stationId)).toBe(true);
    travel.back(); travel.cancel();
    expect(travel.isOpen).toBe(false);
    game.action();
    expect(travel.select(NEIGHBOR_STATION_ACCESS.stationId)).toBe(true);
    expect(travel.issue()).not.toBeNull();
    travel.back();
    game.player = positionAt(STATION_ACCESS.boarding);
    expect(game.serialize()).toEqual(before);
    expect(events).toEqual([]);

    // のりばで乗る。取り消せるのは乗る前まで。位置が変わるのは到着の1回だけ。
    game.action();
    expect(travel.state.step).toBe('board');
    travel.back();
    expect(game.serialize()).toEqual(before);
    game.action();
    expect(travel.startRide()).not.toBeNull();
    expect(travel.startRide()).toBeNull();
    expect(game.serialize()).toEqual(before);
    expect(travel.commitArrival()).toMatchObject({ ok: true });
    expect(travel.commitArrival()).toEqual({ ok: false, reason: 'not-riding' });
    expect(game.player).toEqual(positionAt(NEIGHBOR_STATION_ACCESS.arrival));
    expect(events).toEqual([{ type: 'area-enter', areaId: NEIGHBOR_STATION_ACCESS.arrival.areaId }]);
    expect(new Game(world, { save: arrivalSave }).serialize()).toEqual(game.serialize());
    expect(arrivalSave?.appearance).toEqual(before.appearance);
    expect(world.variant.stage).toBe(stage);
  });

  it('keeps an active conversation and position when an arrival is rejected', () => {
    const game = new Game(buildWorld()), events: MapEvent[] = [], before = game.serialize();
    game.dialog = { speaker: 'test', lines: ['test'], index: 0 };
    game.on(event => events.push(event));
    expect(game.arriveByTrain(STATION_ACCESS.arrival)).toBe(false);
    expect(game.serialize()).toEqual(before);
    expect(game.dialog?.speaker).toBe('test');
    expect(events).toEqual([]);
  });
});
