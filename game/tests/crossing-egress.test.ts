import { afterEach, describe, expect, it } from 'vitest';
import { Game } from '../src/session/game';
import { canStand, RUN_SPEED, WALK_SPEED } from '../src/map/explorer';
import { advanceCrossingClock, clearCrossingClock } from '../src/town-train/crossing-clock';
import { canTakeCrossingStep, crossingContains, crossingState, getCrossings } from '../src/town-train/crossings';
import { TOWN_TRAIN_PROTOTYPE } from '../src/town-train/config';
import { TownTrainService } from '../src/town-train/service';
import { buildWorld } from '../src/world';

afterEach(clearCrossingClock);
const world = buildWorld(), trains = new TownTrainService();
const all = ['town-main', 'town-neighbor'].flatMap(id => {
  const area = world.areas.get(id)!;
  return getCrossings(area).map(c => ({ area, c }));
});
const closingAt = (a: typeof all[number]) => Array.from({ length: TOWN_TRAIN_PROTOTYPE.intervalSeconds * 1000 }, (_, i) => i / 1000)
  .find(t => crossingState(a.area, a.c, t).phase === 'closing')! + 0.03;
const safe = (a: typeof all[number], p: { x: number; y: number }, t: number) => {
  expect(canStand(a.area, p.x, p.y)).toBe(true);
  for (const f of trains.frames(a.area, t)) expect(p.x + 9 <= f.x || p.x - 9 >= f.x + f.length ||
    p.y <= f.y || p.y - 26 >= f.footY, `${a.c.id} train overlap at ${t}`).toBe(true);
};

it('keeps automatic retreat continuous and distinguishes an ordinary corner correction after control returns', () => {
  const a = all[0], c = a.c, t = closingAt(a), input = { dir: 'left', run: false } as const;
  clearCrossingClock(); advanceCrossingClock(t - 0.016);
  const game = new Game(world);
  game.player = { areaId: a.area.def.id, x: (c.left + c.right) / 2, y: c.top + 8, facing: 'down' };
  let previous = { ...game.player }, outsideCorrection = false;
  for (let i = 0; i < 90; i++) {
    advanceCrossingClock(t + i * 0.016, input); game.update(1 / 60, input);
    const p = game.player, distance = Math.hypot(p.x - previous.x, p.y - previous.y);
    if (crossingContains(c, previous.x, previous.y) || crossingContains(c, p.x, p.y)) {
      expect(distance).toBeLessThanOrEqual(0.016 * WALK_SPEED + 1e-6);
    } else if (distance > 4) {
      outsideCorrection = true;
      expect(previous.y).toBe(c.northWaitY);
      expect(p.y).toBe(c.top - 2 * 16);
      expect(p.facing).toBe('left');
    }
    safe(a, p, t + i * 0.016); previous = { ...p };
  }
  expect(outsideCorrection).toBe(true);
});

describe.each(all)('$c.id one-way egress', a => {
  it('places gate hardware beside the actual rail band and keeps its waiting lines safe', () => {
    expect(a.c.top - a.c.northGateY).toBeGreaterThanOrEqual(0);
    expect(a.c.top - a.c.northGateY).toBeLessThanOrEqual(4);
    expect(a.c.southGateY - a.c.bottom).toBeGreaterThanOrEqual(0);
    expect(a.c.southGateY - a.c.bottom).toBeLessThanOrEqual(12);
    expect(a.c.northGateY).toBeGreaterThan(a.c.northWaitY);
    expect(a.c.southGateY).toBeLessThan(a.c.southWaitY);
  });

  it.each(['up', 'down'] as const)('allows an internal %s step and rejects a fresh entry after closure starts', direction => {
    const c = a.c, x = (c.left + c.right) / 2, state = crossingState(a.area, c, closingAt(a));
    expect(state.blocked).toBe(true);
    const from = { x, y: direction === 'up' ? c.top + 4 : c.bottom - 4 };
    expect(canTakeCrossingStep(c, state, from, { x, y: from.y + (direction === 'up' ? -1 : 1) })).toBe(true);
    expect(canTakeCrossingStep(c, state, from, { x: x + 1, y: from.y })).toBe(false);
    const y = direction === 'up' ? c.southWaitY : c.northWaitY;
    expect(canTakeCrossingStep(c, state, { x, y }, { x, y: y + (direction === 'up' ? -1 : 1) })).toBe(false);
  });

  it.each([false, true])('lets direct Game movement exit north and south through a closed bar (run=%s)', run => {
    for (const dir of ['up', 'down'] as const) {
      const closed = closingAt(a) + 0.8;
      expect(crossingState(a.area, a.c, closed).phase).toBe('closed');
      clearCrossingClock(); advanceCrossingClock(closed);
      const game = new Game(world), c = a.c;
      const start = dir === 'up' ? c.top + 4 : c.bottom - 4;
      const end = dir === 'up' ? c.northWaitY - 2 : c.southWaitY + 2;
      game.player = { areaId: a.area.def.id, x: (c.left + c.right) / 2, y: start, facing: dir };
      game.update(Math.abs(end - start) / (run ? RUN_SPEED : WALK_SPEED), { dir, run });
      expect(game.player.y).toBeCloseTo(end);
      expect(crossingContains(c, game.player.x, game.player.y)).toBe(false);
      safe(a, game.player, closed);
      const before = game.player.y;
      game.update(0.2, { dir: dir === 'up' ? 'down' : 'up', run });
      expect(dir === 'up' ? game.player.y <= c.northWaitY : game.player.y >= c.southWaitY).toBe(true);
      expect(Math.abs(game.player.y - before)).toBeLessThanOrEqual(2.01);
    }
  });

  it.each([false, true])('honors the actual exit input and its walk/run speed in the frame clock (run=%s)', run => {
    for (const delay of [0, 0.8]) for (const dir of ['up', 'down'] as const) {
      clearCrossingClock(); const t = closingAt(a) + delay; advanceCrossingClock(t - 0.01);
      expect(crossingState(a.area, a.c, t).phase).toBe(delay ? 'closed' : 'closing');
      const game = new Game(world), c = a.c, speed = run ? RUN_SPEED : WALK_SPEED;
      game.player = { areaId: a.area.def.id, x: (c.left + c.right) / 2,
        y: dir === 'up' ? c.top + 4 : c.bottom - 4, facing: 'left' };
      const before = game.player.y;
      advanceCrossingClock(t, { dir, run }); game.update(1 / 120, { dir, run });
      expect(Math.abs(game.player.y - before)).toBeCloseTo(speed * 0.01, 6);
      expect(game.player.facing).toBe(dir);
      for (let i = 1; i <= 120; i++) {
        advanceCrossingClock(t + i / 120, { dir, run }); game.update(1 / 120, { dir, run }); safe(a, game.player, t + i / 120);
      }
      expect(crossingContains(c, game.player.x, game.player.y)).toBe(false);
    }
  });

  it('keeps alternating/resisting input and a paused UI safe without a teleport during ordinary frames', () => {
    clearCrossingClock(); const t = closingAt(a); advanceCrossingClock(t - 0.01);
    const game = new Game(world), c = a.c;
    game.player = { areaId: a.area.def.id, x: (c.left + c.right) / 2, y: (c.top + c.bottom) / 2, facing: 'left' };
    let previous = { ...game.player };
    for (let i = 0; i < 300; i++) {
      const dir = i < 120 ? (Math.floor(i / 5) % 2 ? 'up' : 'down') : null;
      const input = { dir, run: i % 3 === 0 } as const;
      advanceCrossingClock(t + i / 120, input);
      if (i < 120) game.update(1 / 120, input); // Then simulate an open full map: no ordinary update.
      safe(a, game.player, t + i / 120);
      expect(Math.hypot(game.player.x - previous.x, game.player.y - previous.y)).toBeLessThanOrEqual(RUN_SPEED * 0.01 + 1e-6);
      previous = { ...game.player };
    }
    expect(crossingContains(c, game.player.x, game.player.y)).toBe(false);
  });
});
