import { describe, expect, it } from 'vitest';
import type { MapEvent } from '../src/core/types';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { directionBetween, headingOf } from '../src/travel/direction';
import { TRAIN_NETWORK } from '../src/travel/network';
import { REDUCED_TIMING, RIDE_TIMING, RideDirector } from '../src/travel/ride';
import { geometryOf, sceneState } from '../src/travel/scene';
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
    const { game, travel } = station({ ...down.boardTile });
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

describe('ride director', () => {
  const run = (timing = RIDE_TIMING, commit = () => true, step = 16) => {
    const phases: string[] = [], commits: string[] = [], done: boolean[] = [];
    const d = new RideDirector('right', () => { commits.push(d.snapshot.phase); return commit(); }, ok => done.push(ok), timing);
    for (let i = 0; i < 20000 && !done.length; i++) { d.advance(step); const phase = d.snapshot.phase; if (phases.at(-1) !== phase) phases.push(phase); }
    return { phases, commits, done };
  };

  it('plays walk-in, door, depart, arrive and alight in order with no darkening phase', () => {
    const { phases, done } = run();
    expect(phases).toEqual(['walk-in', 'door-close', 'depart', 'arrive', 'door-open', 'walk-out', 'settle', 'done']);
    expect(phases.join()).not.toMatch(/fade|black/);
    expect(done).toEqual([true]);
  });

  it('commits once, after the departing train is gone and before the arriving train enters', () => {
    const commits: string[] = [];
    const seen: string[] = [];
    const d = new RideDirector('right', () => { commits.push(d.snapshot.phase); seen.push(...phasesSoFar); return true; }, () => {});
    const phasesSoFar: string[] = [];
    for (let i = 0; i < 600; i++) { d.advance(16); const p = d.snapshot.phase; if (phasesSoFar.at(-1) !== p) phasesSoFar.push(p); }
    expect(commits).toHaveLength(1);
    expect(seen).toContain('depart');
    expect(seen).not.toContain('arrive');
  });

  it('cannot skip or double the commit with a huge or repeated time step', () => {
    for (const step of [1, 16, 250, 1e9]) expect(run(RIDE_TIMING, () => true, step).commits).toHaveLength(1);
  });

  it('ends at once without an arrival scene when the commit is refused', () => {
    const { phases, done } = run(RIDE_TIMING, () => false);
    expect(phases).toEqual(['walk-in', 'door-close', 'depart', 'done']);
    expect(done).toEqual([false]);
  });

  it('shows only the arrived state, briefly, with reduced motion', () => {
    const commits: number[] = [], phases: string[] = [], done: boolean[] = [];
    const d = new RideDirector('right', () => { commits.push(1); return true; }, ok => done.push(ok), REDUCED_TIMING);
    for (let i = 0; i < 200 && !done.length; i++) { phases.push(d.snapshot.phase); d.advance(16); }
    expect(phases[0]).toBe('settle');
    expect(commits).toHaveLength(1);
    expect(done).toEqual([true]);
  });
});

describe('scene', () => {
  const snap = (phase: 'depart' | 'arrive', progress: number, heading: 'left' | 'right' = 'right') => sceneState({ phase, progress, heading }, geometryOf('down'));
  it('moves the departing car out along the heading and the arriving car in from the opposite side', () => {
    expect(snap('depart', 0).trainOffset).toBe(0);
    expect(snap('depart', 1).trainOffset).toBeGreaterThan(300);
    expect(snap('arrive', 0).trainOffset).toBeLessThan(-300);
    expect(Math.abs(snap('arrive', 1).trainOffset)).toBe(0);
    expect(snap('depart', 1, 'left').trainOffset).toBeLessThan(-300);
  });

  it('fills the whole view with floor, track and walls, never a blank border', () => {
    for (const direction of ['down', 'up'] as const) {
      const g = geometryOf(direction, 30, 20);
      expect(g.layout).toHaveLength(20);
      expect(g.layout.every(tile => tile !== 0)).toBe(true);
      expect(g.trackRow).toBeGreaterThan(0);
      expect(g.trackRow).toBeLessThan(19);
    }
  });
});
