import { describe, expect, it } from 'vitest';
import type { MapEvent } from '../src/core/types';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { directionBetween, headingOf } from '../src/travel/direction';
import { TRAIN_NETWORK } from '../src/travel/network';
import { alightPlan, boardPlan, exitFrame, exitPath, pathLength, RideScript, TIMING } from '../src/travel/choreo';
import { trainStopX, TRAIN_LENGTH_PX } from '../src/town-train/station-scene';
import { TrainTravelSession } from '../src/travel/session';
import { buildWorld, getStationFlow, STATION_ACCESS } from '../src/world';
import { NEIGHBOR_STATION_ACCESS } from '../src/world/towns/neighbor';

const flow = getStationFlow(STATION_ACCESS.stationId);
const NEIGHBOR = NEIGHBOR_STATION_ACCESS.stationId;
const spot = (dy: number, facing: 'up' | 'down') => ({ areaId: STATION_ACCESS.areaId, x: flow.gate.tile.x, y: flow.gate.tile.y + dy, facing });

function event(game: Game): MapEvent {
  const target = game.facingInteraction();
  if (!target) throw new Error('nothing in front');
  return { type: 'interact', areaId: game.player.areaId, interactionId: target.id, eventKey: target.eventKey };
}

function station(at: { areaId: string; x: number; y: number; facing: 'up' | 'down' | 'left' | 'right' } = spot(1, 'up')) {
  const game = new Game(buildWorld());
  game.player = positionAt(at);
  return { game, travel: new TrainTravelSession(game, TRAIN_NETWORK) };
}

describe('gate: one decision, no confirmations', () => {
  it('lists destinations from the south and starts the ride on the single decision', () => {
    const { game, travel } = station(), before = game.serialize();
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.state).toMatchObject({ step: 'destinations' });
    expect(game.serialize()).toEqual(before);
    expect(travel.choose(NEIGHBOR)).toMatchObject({ originId: STATION_ACCESS.stationId, destinationId: NEIGHBOR, direction: 'down', heading: 'right' });
    expect(travel.state).toEqual({ step: 'riding' });
    expect(game.serialize()).toEqual(before);
  });

  it('has no ticket, notice, boarding-confirmation or gate-passing step', () => {
    const proto = Object.getOwnPropertyNames(TrainTravelSession.prototype);
    for (const name of ['issue', 'returnTicket', 'startRide', 'passGate']) expect(proto).not.toContain(name);
    const { game, travel } = station();
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.state.step).toBe('destinations');
    expect(travel.choose('not-a-station')).toBeNull();
    expect(travel.state.step).toBe('destinations');
    expect(travel.back()).toBe(true);
    expect(travel.isOpen).toBe(false);
  });

  it('leaves platform signs to the ordinary conversation', () => {
    const down = flow.platforms.find(p => p.direction === 'down')!;
    const front = { areaId: STATION_ACCESS.areaId, x: down.sign.x, y: down.sign.y + (down.sign.facing === 'up' ? 1 : -1), facing: down.sign.facing };
    const { game, travel } = station(front);
    expect(travel.begin(event(game))).toBe(false);
    expect(travel.isOpen).toBe(false);
  });

  it('exits from the north in one operation, with no destination list', () => {
    const { game, travel } = station(spot(-1, 'down'));
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.state).toEqual({ step: 'exit' });
    expect(travel.choose(NEIGHBOR)).toBeNull();
    expect(travel.passExit()).toBe(true);
    expect(game.player).toEqual(positionAt(spot(1, 'down')));
    expect(travel.isOpen).toBe(false);
    expect(travel.passExit()).toBe(false);
  });

  it('keeps the entering and exiting directions apart', () => {
    // 向きが逆なら、そもそも改札を向いていない（操作しても何も起きない）。
    const south = station(spot(1, 'down')), north = station(spot(-1, 'up'));
    expect(south.game.facingInteraction() ?? null).toBeNull();
    expect(north.game.facingInteraction() ?? null).toBeNull();
    const gate = { type: 'interact' as const, areaId: STATION_ACCESS.areaId, interactionId: flow.gate.interactionId, eventKey: flow.gate.eventKey };
    expect(south.travel.begin(gate)).toBe(false);
    expect(north.travel.begin(gate)).toBe(false);
  });

  it('rides once: a second choice, a double commit and the back key during the ride all fail', () => {
    const { game, travel } = station();
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.choose(NEIGHBOR)).not.toBeNull();
    expect(travel.choose(NEIGHBOR)).toBeNull();
    expect(travel.back()).toBe(false);
    expect(travel.begin(event(game))).toBe(false);
    expect(travel.commitArrival()).toMatchObject({ ok: true });
    expect(travel.commitArrival()).toEqual({ ok: false, reason: 'not-riding' });
  });

  it('picks the up direction and left heading for the return trip', () => {
    const neighborFlow = getStationFlow(NEIGHBOR), gate = neighborFlow.gate;
    const game = new Game(buildWorld());
    game.player = positionAt({ areaId: gate.areaId, x: gate.tile.x, y: gate.tile.y + 1, facing: 'up' });
    const travel = new TrainTravelSession(game, TRAIN_NETWORK);
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.choose(STATION_ACCESS.stationId)).toMatchObject({ direction: 'up', heading: 'left' });
  });

  it('rejects an arrival that cannot be stood on, and keeps the player where they were', () => {
    const game = new Game(buildWorld());
    game.player = positionAt(spot(1, 'up'));
    const travel = new TrainTravelSession(game, TRAIN_NETWORK, () => false);
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.choose(NEIGHBOR)).not.toBeNull();
    expect(travel.commitArrival()).toEqual({ ok: false, reason: 'destination-unavailable' });
    expect(game.player).toEqual(positionAt(spot(1, 'up')));
    const area = game.world.areas.get(STATION_ACCESS.areaId)!;
    for (const x of [flow.gate.tile.x, flow.gate.tile.x + 1]) expect(area.solid[flow.gate.tile.y * area.width + x]).toBe(1);
  });
});

describe('direction', () => {
  it('derives up/down from the line order and keeps the town-train heading for down', () => {
    expect(directionBetween(['a', 'b'], 'a', 'b')).toBe('down');
    expect(directionBetween(['a', 'b'], 'b', 'a')).toBe('up');
    expect(directionBetween(['a', 'b'], 'a', 'x')).toBeNull();
    expect(headingOf('down')).toBe('right');
    expect(headingOf('up')).toBe('left');
  });
});

describe('ride choreography on the station map', () => {
  const mainFlow = getStationFlow(STATION_ACCESS.stationId), neighborFlow = getStationFlow(NEIGHBOR);
  const widthOf = (areaId: string) => (buildWorld().areas.get(areaId)?.width ?? 36) * 16;
  const feetStart = (dy = 1) => ({ x: flow.gate.tile.x * 16 + 8, y: (flow.gate.tile.y + dy) * 16 + 14 });
  const script = (direction: 'up' | 'down', reduced = false) => {
    const p = mainFlow.platforms.find(item => item.direction === direction)!, q = neighborFlow.platforms.find(item => item.direction === direction)!;
    return { p, q, s: new RideScript(boardPlan(feetStart(), p, 36 * 16), alightPlan(q, neighborFlow.alight, 32 * 16), reduced) };
  };
  const frames = (s: RideScript, step = 16) => { const out = []; for (let t = 0; t < s.commitTime + 20000; t += step) { const f = s.sample(t); out.push({ t, f }); if (f.stage === 'done') break; } return out; };

  it('walks the player from the gate to the door of the right platform, boards, and leaves with the train fully out', () => {
    for (const direction of ['down', 'up'] as const) {
      const { p, s } = script(direction);
      const list = frames(s), first = list[0].f, board = boardPlan(feetStart(), p, 36 * 16);
      expect(first.actor).toMatchObject({ x: feetStart().x, y: feetStart().y, visible: true });
      expect(first.train!.x).toBe(board.entryX);
      expect(list.some(({ f }) => f.stage === 'origin' && f.actor && !f.actor.visible)).toBe(true);
      const last = s.sample(s.commitTime - 0.001);
      expect(last.stage).toBe('origin');
      expect(Math.abs(last.train!.x - board.exitX)).toBeLessThan(0.5);
      // 乗り込んだ主人公は、列車が動き出す前にドアの位置で見えなくなる
      const hidden = list.find(({ f }) => f.stage === 'origin' && f.actor && !f.actor.visible)!;
      expect(hidden.f.train!.x).toBe(trainStopX(p));
    }
  });

  it('commits once between the departing and the arriving train, with no darkening in any frame', () => {
    const { s } = script('down'), list = frames(s);
    const stages = list.map(({ f }) => f.stage);
    expect(stages.indexOf('destination')).toBeGreaterThan(stages.lastIndexOf('origin'));
    expect(new Set(stages)).toEqual(new Set(['origin', 'destination', 'done']));
    for (const { f } of list) expect(Object.keys(f)).not.toContain('fade');
    expect(list.at(-1)!.f.stage).toBe('done');
  });

  it('keeps the alighting actor continuous and ends exactly on the real alight position and facing', () => {
    const { s } = script('down'), list = frames(s), spot = neighborFlow.alight;
    const firstControl = list.find(({ f }) => f.control && f.actor)?.f ?? list.find(({ f }) => f.control)!.f;
    expect(firstControl.stage).toBe('destination');
    const before = list.filter(({ f }) => f.stage === 'destination' && f.actor && f.actor.visible).at(-1)!.f.actor!;
    expect(before).toMatchObject({ x: spot.x * 16 + 8, y: spot.y * 16 + 14, facing: spot.facing, walking: false });
    // 操作が戻った後も、列車だけが続けて出ていく
    const tail = list.filter(({ f }) => f.control && f.stage === 'destination');
    expect(tail.length).toBeGreaterThan(10);
    expect(tail.every(({ f }) => f.actor === null)).toBe(true);
    expect(tail.at(-1)!.f.train!.x).toBeGreaterThan(tail[0].f.train!.x - 1);
  });

  it('moves every step of the actor along walkable ground (no solid tile except the gate being crossed)', () => {
    const world = buildWorld();
    const w = world.areas.get(STATION_ACCESS.areaId)!;
    for (const direction of ['down', 'up'] as const) {
      const { s } = script(direction);
      for (const { f } of frames(s).filter(({ f }) => f.stage === 'origin' && f.actor?.visible)) {
        const tx = Math.floor(f.actor!.x / 16), ty = Math.floor((f.actor!.y - 4) / 16);
        const crossing = tx >= flow.gate.tile.x && tx < flow.gate.tile.x + 2 && ty === flow.gate.tile.y;
        const door = mainFlow.platforms.find(p => p.direction === direction)!.door;
        if (!crossing && !(tx === door.x && ty === door.y)) expect(w.solid[ty * w.width + tx], `${direction} (${tx},${ty})`).toBe(0);
      }
    }
    const n = world.areas.get(NEIGHBOR_STATION_ACCESS.arrival.areaId);
    void n;
  });

  it('puts the train on the track row and sizes it against the player and the platform', () => {
    for (const direction of ['down', 'up'] as const) {
      const { p, s } = script(direction);
      const door = s.sample(TIMING.trainIn + 5).train!;
      expect(door.x).toBe(trainStopX(p));
      expect(p.track.y).toBe(p.door.y);
      expect(TRAIN_LENGTH_PX).toBeGreaterThan(18 * 6);
      expect(widthOf(STATION_ACCESS.areaId)).toBeGreaterThan(TRAIN_LENGTH_PX * 2);
    }
  });

  it('is short with reduced motion: commits immediately, shows the arrived state, then clears', () => {
    const { s } = script('down', true), list = frames(s);
    expect(s.commitTime).toBe(0);
    expect(list[0].f).toMatchObject({ stage: 'destination', control: false });
    expect(list[0].f.train!.doorOpen).toBe(1);
    expect(list.at(-1)!.f).toMatchObject({ stage: 'done', control: true });
    expect(list.at(-1)!.t).toBeLessThan(900);
  });

  it('walks out through the gate in under a second without leaving the gate column', () => {
    const path = exitPath({ x: flow.gate.tile.x * 16 + 8, y: (flow.gate.tile.y - 1) * 16 + 14 }, flow.gate.tile.y);
    expect(pathLength(path)).toBe(32);
    expect(exitFrame(path, 0).done).toBe(false);
    const end = exitFrame(path, 600);
    expect(end.done).toBe(true);
    expect(end.actor).toMatchObject({ x: flow.gate.tile.x * 16 + 8, y: (flow.gate.tile.y + 1) * 16 + 14, facing: 'down' });
  });
});
