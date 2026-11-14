import { afterEach, describe, expect, it } from 'vitest';
import { TILE, type Facing } from '../src/core/coords';
import { canStand, HITBOX, MapExplorer, WALK_SPEED } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { advanceCrossingClock, clearCrossingClock } from '../src/town-train/crossing-clock';
import { CROSSING_PROTOTYPE, crossingContains, crossingState, getCrossings } from '../src/town-train/crossings';
import { TOWN_TRAIN_PROTOTYPE } from '../src/town-train/config';
import { TownTrainService } from '../src/town-train/service';
import { crossingVisual } from '../src/town-train/crossing-render';
import { buildWorld } from '../src/world';
import { TOWN_RAIL_LAYOUTS } from '../src/world/rail-layouts';
import { T } from '../src/world/tiles';

afterEach(clearCrossingClock);
const world = buildWorld();
const towns = ['town-main', 'town-neighbor'];
const period = TOWN_TRAIN_PROTOTYPE.intervalSeconds;
const idle = { dir: null, run: false } as const;

it('suppresses bar interpolation and lamp blinking for reduced motion without changing collision', () => {
  const area = world.areas.get('town-main')!, c = getCrossings(area)[0];
  const t = Array.from({ length: period * 100 }, (_, i) => i / 100).find(t => crossingState(area, c, t).phase === 'closing')!;
  const state = crossingState(area, c, t + 0.25);
  expect(state.armDown).toBeGreaterThan(0); expect(state.armDown).toBeLessThan(1);
  expect(crossingVisual(state, 0.1, false).lamps).not.toEqual(crossingVisual(state, 0.6, false).lamps);
  expect(crossingVisual(state, 0.1, true)).toEqual({ armDown: 1, lamps: [true, true] });
  expect(crossingVisual(state, 0.6, true)).toEqual(crossingVisual(state, 0.1, true));
  expect(state.blocked).toBe(true);
});

describe.each(towns)('%s crossing schedule', areaId => {
  const area = world.areas.get(areaId)!;
  it('leaves at least eight continuous seconds per cycle for walking across every crossing', () => {
    for (const c of getCrossings(area)) {
      let run = 0, longest = 0;
      for (let n = 0; n < period * 2 * 100; n++) {
        run = crossingState(area, c, n / 100).blocked ? 0 : run + 0.01;
        longest = Math.max(longest, run);
      }
      expect(longest, c.id).toBeGreaterThanOrEqual(CROSSING_PROTOTYPE.minimumOpenSeconds);
    }
  });
  it('covers every walking crossing, both track rows, and no indoor track', () => {
    const crossings = getCrossings(area), layout = TOWN_RAIL_LAYOUTS[areaId];
    expect(crossings).toHaveLength(areaId === 'town-main' ? 3 : 2);
    for (let i = 0; i < area.ground.length; i++) if (area.ground[i] === T.CROSSING) {
      const x = (i % area.width) * TILE + 8, y = Math.floor(i / area.width) * TILE + 14;
      expect(crossings.filter(c => crossingContains(c, x, y))).toHaveLength(1);
    }
    for (const c of crossings) {
      expect(c.top).toBe(layout.northRow * TILE);
      expect(c.bottom).toBe((layout.southRow + 1) * TILE);
      // Even walking the whole protected corridor, rather than its nearer half, leaves a margin.
      expect((c.southWaitY - c.northWaitY) / WALK_SPEED + CROSSING_PROTOTYPE.escapeMarginSeconds)
        .toBeLessThan(CROSSING_PROTOTYPE.warningSeconds);
    }
    expect(getCrossings(world.areas.get('station-main-interior')!)).toEqual([]);
    expect(getCrossings(world.areas.get('station-neighbor-interior')!)).toEqual([]);
  });

  it('closes before every train arrives and stays closed until its tail clears, across cycle boundaries', () => {
    const trains = new TownTrainService(), seen = new Set<string>(), crossings = getCrossings(area);
    const failures: { t: number; crossing: string; property: string; direction?: string }[] = [];
    const record = (t: number, crossing: string, property: string, direction?: string) => {
      if (failures.length < 10) failures.push({ t, crossing, property, direction });
    };
    const lastSample = Math.floor(period * 3 * 100);
    let samples = 0;
    // Keep every 10ms sample across all three cycles. Reuse the two frame queries per instant and
    // collect only failures: creating Vitest matcher stacks at every point made parallel runs time out.
    for (let n = 0; n <= lastSample; n++) {
      const t = n / 100, current = trains.frames(area, t);
      const ahead = trains.frames(area, t + CROSSING_PROTOTYPE.warningSeconds - 0.02);
      samples++;
      for (const c of crossings) {
        const state = crossingState(area, c, t);
        if (!(state.armDown >= 0 && state.armDown <= 1)) record(t, c.id, `armDown outside [0,1]: ${state.armDown}`);
        if (crossingState(area, c, t + period).phase !== state.phase) record(t, c.id, 'phase differs one period later');
        for (const train of current) {
          if (train.x + train.length <= c.left || train.x >= c.right) continue;
          seen.add(`${c.id}:${train.direction}`);
          if (state.blocked !== true) record(t, c.id, 'open while occupied', train.direction);
          if (state.armDown !== 1) record(t, c.id, 'bar not fully down while occupied', train.direction);
        }
        // The leading end of either direction reaches the crossing during the next warning interval.
        for (const train of ahead) if (train.x + train.length > c.left && train.x < c.right) {
          if (state.blocked !== true) record(t, c.id, 'open during approach warning', train.direction);
        }
      }
    }
    expect(samples).toBe(lastSample + 1);
    expect(failures).toEqual([]);
    expect(seen.size).toBe(crossings.length * 2);
  });

  it('has visible lowering and raising, opens between trains, and never opens for one line while the other approaches', () => {
    for (const c of getCrossings(area)) {
      const phases = new Set<string>();
      for (let n = 0; n < period * 200; n++) {
        const state = crossingState(area, c, n / 200); phases.add(state.phase);
        if (state.phase === 'closing' || state.phase === 'opening') expect(state.blocked).toBe(true);
        if (state.warningDirections.length === 2) expect(state.blocked).toBe(true);
      }
      expect([...phases].sort()).toEqual(['closed', 'closing', 'open', 'opening']);
    }
  });
});

describe.each(towns)('%s physical crossing and safety', areaId => {
  const area = world.areas.get(areaId)!;
  const trains = new TownTrainService();
  const noOverlap = (p: { x: number; y: number }, t: number) => {
    // Check the entire drawn person (18 x 26), not only the smaller feet hitbox.
    for (const f of trains.frames(area, t)) expect(p.x + 9 <= f.x || p.x - 9 >= f.x + f.length ||
      p.y <= f.y || p.y - 26 >= f.footY, `train overlap at ${t}: ${JSON.stringify(p)}`).toBe(true);
    expect(canStand(area, p.x, p.y)).toBe(true);
  };

  it('lets both directions cross while open, stops all approaches while closed, and releases after passage', () => {
    for (const c of getCrossings(area)) for (const direction of ['down', 'up'] as const) {
      const open = Array.from({ length: period * 100 }, (_, i) => i / 100).find(t =>
        Array.from({ length: 150 }, (_, i) => i / 100).every(dt => !crossingState(area, c, t + dt).blocked))!;
      expect(open).toBeDefined();
      advanceCrossingClock(open);
      const x = (c.left + c.right) / 2, y = direction === 'down' ? c.northWaitY : c.southWaitY;
      const explorer = new MapExplorer(world, { areaId, x, y, facing: direction }, () => {});
      explorer.update((c.southWaitY - c.northWaitY + 2) / WALK_SPEED, { dir: direction, run: false });
      expect(direction === 'down' ? explorer.player.y >= c.southWaitY : explorer.player.y <= c.northWaitY).toBe(true);
      const closed = Array.from({ length: period * 100 }, (_, i) => i / 100).find(t => crossingState(area, c, t).phase === 'closed')!;
      advanceCrossingClock(closed);
      for (const dx of [HITBOX.halfW, (c.right - c.left) / 2, c.right - c.left - HITBOX.halfW]) {
        explorer.player = { areaId, x: c.left + dx, y, facing: direction };
        explorer.update(2, { dir: direction, run: true });
        expect(explorer.player.y).toBe(y);
        noOverlap(explorer.player, closed);
      }
      advanceCrossingClock(open + period * 2);
      explorer.update(1.5, { dir: direction, run: true });
      expect(direction === 'down' ? explorer.player.y >= c.southWaitY : explorer.player.y <= c.northWaitY).toBe(true);
    }
  });

  it.each([null, 'up', 'down', 'left', 'right'] as (Facing | null)[])('walks a stationary or resisting occupant out safely (input=%s)', input => {
    for (const c of getCrossings(area)) {
      const closing = Array.from({ length: period * 1000 }, (_, i) => i / 1000)
        .find(t => crossingState(area, c, t).phase === 'closing')!;
      for (const y of [c.top + 2, (c.northWaitY + c.southWaitY) / 2, c.bottom - 2]) {
        clearCrossingClock(); advanceCrossingClock(closing - 0.01);
        const explorer = new MapExplorer(world, { areaId, x: (c.left + c.right) / 2, y, facing: 'left' }, () => {});
        let prev = { ...explorer.player }, moved = false;
        for (let i = 0; i < 240; i++) {
          const t = closing + i / 120;
          advanceCrossingClock(t);
          explorer.update(1 / 120, { dir: crossingContains(c, prev.x, prev.y) ? input : null, run: true });
          const distance = Math.hypot(explorer.player.x - prev.x, explorer.player.y - prev.y);
          expect(distance).toBeLessThanOrEqual(WALK_SPEED / 120 + 0.13);
          if (distance > 0) { moved = true; expect(['up', 'down']).toContain(explorer.player.facing); }
          noOverlap(explorer.player, t); prev = { ...explorer.player };
        }
        expect(moved).toBe(true);
        expect(crossingContains(c, explorer.player.x, explorer.player.y)).toBe(false);
        const oldX = explorer.player.x; explorer.update(0.05, { dir: 'right', run: false });
        expect(explorer.player.x).toBeGreaterThan(oldX);
      }
    }
  });

  it('has a statically clear retreat from every standable position throughout every protected corridor', () => {
    let checked = 0;
    for (const c of getCrossings(area)) {
      clearCrossingClock();
      const closing = Array.from({ length: period * 1000 }, (_, i) => i / 1000).find(t => crossingState(area, c, t).phase === 'closing')!;
      const explorer = new MapExplorer(world, { areaId, x: c.left + 8, y: c.northWaitY, facing: 'down' }, () => {});
      for (let x = c.left - HITBOX.halfW + 1; x < c.right + HITBOX.halfW; x += 2) {
        for (let y = c.northWaitY + 1; y < c.southWaitY; y += 2) {
          if (!canStand(area, x, y)) continue;
          advanceCrossingClock(closing - 0.01);
          explorer.player = { areaId, x, y, facing: 'left' };
          advanceCrossingClock(closing);
          expect(Math.hypot(explorer.player.x - x, explorer.player.y - y)).toBeLessThanOrEqual(WALK_SPEED * 0.01 + 1e-7);
          noOverlap(explorer.player, closing);
          advanceCrossingClock(closing + 0.7);
          expect(crossingContains(c, explorer.player.x, explorer.player.y), `${x},${y}`).toBe(false);
          noOverlap(explorer.player, closing + 0.7); checked++;
        }
      }
    }
    // The static guard intentionally removes side positions; every remaining standable point above was checked.
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps retreat running with Game.update paused, recovers a time jump and a closed-crossing save before drawing', () => {
    for (const c of getCrossings(area)) {
      const closing = Array.from({ length: period * 1000 }, (_, i) => i / 1000).find(t => crossingState(area, c, t).phase === 'closing')!;
      clearCrossingClock(); advanceCrossingClock(closing - 0.01);
      const game = new Game(world);
      game.player = { areaId, x: (c.left + c.right) / 2, y: (c.top + c.bottom) / 2, facing: 'left' };
      const saved = game.serialize();
      for (let i = 0; i < 120; i++) { const t = closing + i / 120; advanceCrossingClock(t); noOverlap(game.player, t); }
      expect(crossingContains(c, game.player.x, game.player.y)).toBe(false);
      const passing = Array.from({ length: period * 1000 }, (_, i) => i / 1000).find(t => crossingState(area, c, t).trainPresent)!;
      clearCrossingClock();
      const restored = new Game(world, { save: saved });
      expect(restored.serialize()).toEqual(saved); // Static save validation remains unchanged.
      advanceCrossingClock(passing); noOverlap(restored.player, passing);
      expect(crossingContains(c, restored.player.x, restored.player.y)).toBe(false);
      expect(restored.serialize()).toMatchObject({ areaId, appearance: saved.appearance, variantId: saved.variantId });
      advanceCrossingClock(closing + period - 0.01);
      restored.player = { ...saved };
      advanceCrossingClock(passing + period * 2); noOverlap(restored.player, passing + period * 2);
      expect(crossingContains(c, restored.player.x, restored.player.y)).toBe(false);
      restored.update(0.05, idle);
      expect(restored.moving).toBe(false);
    }
  });
});
