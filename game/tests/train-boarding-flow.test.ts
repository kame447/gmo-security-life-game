import { describe, expect, it } from 'vitest';
import type { MapEvent } from '../src/core/types';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { directionBetween, headingOf } from '../src/travel/direction';
import { TRAIN_NETWORK } from '../src/travel/network';
import { REDUCED_TIMING, RIDE_TIMING, RideDirector } from '../src/travel/ride';
import { sceneState } from '../src/travel/scene';
import { TrainTravelSession } from '../src/travel/session';
import type { StationFlow } from '../src/travel/stations';
import { buildWorld, getStationFlow, STATION_ACCESS } from '../src/world';
import { NEIGHBOR_STATION_ACCESS } from '../src/world/towns/neighbor';

const flow = getStationFlow(STATION_ACCESS.stationId);
const gatePoint = { ...STATION_ACCESS.boarding, x: flow.gate.tile.x, y: flow.gate.tile.y + 1, facing: 'up' } as const;
const NEIGHBOR = NEIGHBOR_STATION_ACCESS.stationId;

function event(game: Game): MapEvent {
  const target = game.facingInteraction();
  if (!target) throw new Error('nothing in front');
  return { type: 'interact', areaId: game.player.areaId, interactionId: target.id, eventKey: target.eventKey };
}

function station(flows?: readonly StationFlow[]) {
  const game = new Game(buildWorld());
  game.player = positionAt(gatePoint);
  return { game, travel: new TrainTravelSession(game, TRAIN_NETWORK, undefined, flows) };
}

const takeTicket = (travel: TrainTravelSession, game: Game) => {
  expect(travel.begin(event(game))).toBe(true);
  expect(travel.select(NEIGHBOR)).toBe(true);
  expect(travel.issue()).toMatchObject({ originId: STATION_ACCESS.stationId, destinationId: NEIGHBOR, direction: 'down' });
};

describe('ticket gate and platform', () => {
  it('opens the destination menu only at the gate and changes nothing until arrival', () => {
    const { game, travel } = station(), before = game.serialize();
    takeTicket(travel, game);
    expect(travel.state).toMatchObject({ step: 'notice', kind: 'ticket-issued', destinationName: 'となりまち' });
    expect(game.serialize()).toEqual(before);
    travel.back();
    expect(travel.isOpen).toBe(false);
    expect(travel.currentTicket).toMatchObject({ destinationId: NEIGHBOR });
  });

  it('does not let the platform sign pick a destination or move anyone', () => {
    const { game, travel } = station();
    game.player = positionAt(STATION_ACCESS.boarding);
    const before = game.serialize();
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.state).toMatchObject({ step: 'notice', kind: 'no-ticket' });
    expect(travel.select(NEIGHBOR)).toBe(false);
    expect(travel.startRide()).toBeNull();
    expect(travel.commitArrival()).toEqual({ ok: false, reason: 'not-riding' });
    expect(game.serialize()).toEqual(before);
  });

  it('lets the player cancel at the gate and before boarding, and re-choose with a new ticket', () => {
    const { game, travel } = station();
    takeTicket(travel, game);
    travel.back();
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.select(NEIGHBOR)).toBe(true);
    travel.returnTicket();
    expect(travel.currentTicket).toBeNull();
    game.player = positionAt(STATION_ACCESS.boarding);
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.state).toMatchObject({ kind: 'no-ticket' });
  });

  it('refuses a platform that does not serve the ticket direction', () => {
    const down = flow.platforms.find(p => p.direction === 'down')!;
    const flows: StationFlow[] = [{ ...flow, platforms: [{ ...down, direction: 'up' }] }];
    const { game, travel } = station(flows);
    takeTicket(travel, game);
    expect(travel.passGate()).toBe(true);
    game.player = positionAt(STATION_ACCESS.boarding);
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.state).toMatchObject({ step: 'notice', kind: 'wrong-platform' });
    expect(travel.startRide()).toBeNull();
  });

  it('sends each ticket to its own platform of the island: down to the north line, up to the south line', () => {
    const up = flow.platforms.find(p => p.direction === 'up')!;
    const { game, travel } = station();
    takeTicket(travel, game);
    expect(travel.passGate()).toBe(true);
    game.player = positionAt(up.boardTile);
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.state).toMatchObject({ kind: 'wrong-platform' });
    travel.back();
    game.player = positionAt(STATION_ACCESS.boarding);
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.startRide()).toMatchObject({ direction: 'down', heading: 'right' });
  });

  it('passes the gate only from the south after taking a ticket, and exits only from the north', () => {
    const { game, travel } = station(), before = game.serialize();
    expect(travel.passGate()).toBe(false);
    takeTicket(travel, game);
    expect(travel.passGate()).toBe(true);
    expect(game.player).toEqual(positionAt({ areaId: STATION_ACCESS.areaId, x: gatePoint.x, y: flow.gate.tile.y - 1, facing: 'up' }));
    expect(travel.passGate()).toBe(false);
    // 出場: 北側から下向きに操作すると、選択を出さずに南側へ出る。きっぷは取り消す（仮）。
    game.player = positionAt({ areaId: STATION_ACCESS.areaId, x: gatePoint.x, y: flow.gate.tile.y - 1, facing: 'down' });
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.state).toEqual({ step: 'exit' });
    expect(travel.passGate()).toBe(true);
    expect(game.player).toEqual(positionAt({ areaId: STATION_ACCESS.areaId, x: gatePoint.x, y: flow.gate.tile.y + 1, facing: 'down' }));
    expect(travel.currentTicket).toBeNull();
    expect(game.serialize()).not.toEqual(before);
  });

  it('never leaves the player on the blocked gate tiles: a refused pass keeps the position and the ticket', () => {
    const game = new Game(buildWorld());
    game.player = positionAt(gatePoint);
    const travel = new TrainTravelSession(game, TRAIN_NETWORK, () => false);
    takeTicket(travel, game);
    expect(travel.passGate()).toBe(false);
    expect(game.player).toEqual(positionAt(gatePoint));
    expect(travel.currentTicket).not.toBeNull();
    const area = game.world.areas.get(STATION_ACCESS.areaId)!;
    for (const x of [flow.gate.tile.x, flow.gate.tile.x + 1]) expect(area.solid[flow.gate.tile.y * area.width + x]).toBe(1);
  });

  it('starts a ride once: a second start, a stale tile and a double commit all fail', () => {
    const { game, travel } = station();
    takeTicket(travel, game);
    expect(travel.passGate()).toBe(true);
    game.player = positionAt(STATION_ACCESS.boarding);
    expect(travel.begin(event(game))).toBe(true);
    expect(travel.startRide()).not.toBeNull();
    expect(travel.isRiding).toBe(true);
    expect(travel.startRide()).toBeNull();
    expect(travel.back()).toBe(false);
    expect(travel.begin(event(game))).toBe(false);
    expect(travel.commitArrival()).toMatchObject({ ok: true });
    expect(travel.commitArrival()).toEqual({ ok: false, reason: 'not-riding' });
    expect(travel.currentTicket).toBeNull();
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

describe('ride director', () => {
  const run = (timing = RIDE_TIMING, commit = () => true, step = 16) => {
    const phases: string[] = [], commits: string[] = [], done: boolean[] = [];
    const d = new RideDirector('right', () => { commits.push(d.snapshot.phase); return commit(); }, ok => done.push(ok), timing);
    for (let i = 0; i < 20000 && !done.length; i++) { d.advance(step); const phase = d.snapshot.phase; if (phases.at(-1) !== phase) phases.push(phase); }
    return { phases, commits, done };
  };

  it('plays board, depart, blackout, arrive and alight in order, committing once at full black', () => {
    const { phases, commits, done } = run();
    expect(phases).toEqual(['walk-in', 'door-close', 'depart', 'fade-out', 'fade-in', 'arrive', 'door-open', 'walk-out', 'settle', 'done']);
    expect(commits).toEqual(['fade-out']);
    expect(done).toEqual([true]);
  });

  it('cannot skip or double the commit with a huge or repeated time step', () => {
    for (const step of [1, 16, 250, 1e9]) expect(run(RIDE_TIMING, () => true, step).commits).toHaveLength(1);
  });

  it('fades back in without arriving when the commit is refused', () => {
    const { phases, done } = run(RIDE_TIMING, () => false);
    expect(phases).toEqual(['walk-in', 'door-close', 'depart', 'fade-out', 'fade-in', 'done']);
    expect(done).toEqual([false]);
  });

  it('uses only short fades with reduced motion', () => {
    const { phases, done } = run(REDUCED_TIMING);
    expect(phases).toEqual(['fade-out', 'fade-in', 'done']);
    expect(done).toEqual([true]);
  });

  it('moves the departing car out along the heading and the arriving car in from the opposite side', () => {
    const snap = (phase: 'depart' | 'arrive', progress: number) => sceneState({ phase, progress, heading: 'right', failed: false });
    expect(snap('depart', 0).trainOffset).toBe(0);
    expect(snap('depart', 1).trainOffset).toBeGreaterThan(300);
    expect(snap('arrive', 0).trainOffset).toBeLessThan(-300);
    expect(Math.abs(snap('arrive', 1).trainOffset)).toBe(0);
    expect(sceneState({ phase: 'depart', progress: 1, heading: 'left', failed: false }).trainOffset).toBeLessThan(-300);
  });
});
