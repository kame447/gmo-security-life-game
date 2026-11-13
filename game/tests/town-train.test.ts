import { describe, expect, it, vi } from 'vitest';
import { TILE } from '../src/core/coords';
import { Game } from '../src/session/game';
import { TOWN_TRAIN_PROTOTYPE } from '../src/town-train/config';
import { drawTrainFrame } from '../src/town-train/render';
import { findRailStrips, TownTrainService, type RailStrip } from '../src/town-train/service';
import { buildWorld, type AreaRuntime } from '../src/world';
import { isRailGround, T } from '../src/world/tiles';

function syntheticRail(y: number, rows: number, gap = -1): AreaRuntime {
  const base = buildWorld().areas.get('town-neighbor')!;
  const width = 48, height = Math.max(52, y + rows + 1), ground = new Uint8Array(width * height).fill(T.GRASS);
  for (let ty = y; ty < y + rows; ty++) for (let x = 0; x < width; x++) {
    ground[ty * width + x] = x === gap ? T.GRASS : x === 20 ? T.CROSSING : x === 37 ? T.RAIL_BRIDGE : T.RAIL;
  }
  return { ...base, def: { ...base.def, width, height, ground }, width, height, ground };
}
function expectRailOnly(area: AreaRuntime, strip: RailStrip) {
  for (let y = strip.top / TILE; y < strip.bottom / TILE; y++) {
    for (let x = strip.left / TILE; x < strip.right / TILE; x++) {
      expect(isRailGround(area.ground[y * area.width + x]), `tile ${x},${y}`).toBe(true);
    }
  }
}

describe('town train prototype', () => {
  it('detects the actual uninterrupted town railway, including crossings and the rail bridge', () => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    const strips = findRailStrips(town);
    expect(strips).toHaveLength(1);
    expect(strips[0].left).toBe(0);
    expect(strips[0].right).toBe(town.width * TILE);
    expect(strips[0].bottom - strips[0].top).toBe(2 * TILE);
    expectRailOnly(town, strips[0]);
    const y = strips[0].top / TILE;
    expect(town.ground[y * town.width + 56]).toBe(T.CROSSING);
    expect(town.ground[y * town.width + 117]).toBe(T.RAIL_BRIDGE);
  });

  it('follows new outdoor rail positions without hard-coded town coordinates', () => {
    for (const [y, rows] of [[80, 4], [36, 4], [0, 2]]) {
      const area = syntheticRail(y, rows), strips = findRailStrips(area);
      expect(strips).toHaveLength(1);
      expect(strips[0].top).toBe((y + (rows === 4 ? 1 : 0)) * TILE);
      expectRailOnly(area, strips[0]);
      expect(new TownTrainService().frames(area, 2).length).toBeGreaterThan(0);
    }
  });

  it('does not bridge gaps, invent rails in another town, or animate indoor station trains', () => {
    const split = syntheticRail(36, 4, 24), strips = findRailStrips(split);
    expect(strips).toHaveLength(2);
    for (const strip of strips) expectRailOnly(split, strip);
    const world = buildWorld();
    expect(findRailStrips(world.areas.get('town-neighbor')!)).toEqual([]);
    expect(findRailStrips(world.areas.get('station-neighbor-interior')!)).toEqual([]);
  });

  it('uses periodic elapsed time instead of accumulated frames, and accommodates multiple trains', () => {
    const town = buildWorld().areas.get('town-main')!, service = new TownTrainService();
    const baseline = service.frames(town, 3.25);
    expect(baseline.length).toBeGreaterThan(1);
    expect(service.frames(town, 3.25 + TOWN_TRAIN_PROTOTYPE.intervalSeconds)).toEqual(baseline);
    const before = service.frames(town, 2)[0], after = service.frames(town, 2.5)[0];
    expect(after.x - before.x).toBeCloseTo(TOWN_TRAIN_PROTOTYPE.speedPixelsPerSecond / 2);
    for (let i = 0; i < 120; i++) service.frames(town, 3.25 * i / 120);
    expect(service.frames(town, 3.25)).toEqual(baseline);
    expect(service.frames(town, NaN)).toEqual([]);
    expect(service.frames(town, -1)).toEqual([]);
    const slower = new TownTrainService({ ...TOWN_TRAIN_PROTOTYPE, intervalSeconds: 8, speedPixelsPerSecond: 64 });
    expect(slower.frames(town, 2.5)[0].x - slower.frames(town, 2)[0].x).toBeCloseTo(32);
    expect(slower.frames(town, 10)).toEqual(slower.frames(town, 2));
    expect(() => new TownTrainService({ ...TOWN_TRAIN_PROTOTYPE, intervalSeconds: 0 })).toThrow();
    expect(() => new TownTrainService({ ...TOWN_TRAIN_PROTOTYPE, intervalSeconds: 0.1 })).toThrow();
  });

  it('clips partially entering and leaving trains to the rail rectangle', () => {
    const town = buildWorld().areas.get('town-main')!, frame = new TownTrainService().frames(town, 0.5)[0];
    expect(frame.x).toBeLessThan(frame.strip.left);
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push('save'), beginPath: () => calls.push('beginPath'),
      rect: (...args: number[]) => calls.push(`rect:${args.join(',')}`), clip: () => calls.push('clip'),
      fillRect: vi.fn(() => calls.push('paint')), restore: () => calls.push('restore'), fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
    drawTrainFrame(ctx, frame);
    expect(calls.slice(0, 4)).toEqual(['save', 'beginPath', `rect:${frame.strip.left},${frame.strip.top},${frame.strip.right - frame.strip.left},${frame.strip.bottom - frame.strip.top}`, 'clip']);
    expect(calls.at(-1)).toBe('restore');
    expect(calls.indexOf('paint')).toBeGreaterThan(calls.indexOf('clip'));
  });

  it('leaves collision, player position, save data and life stage unchanged', () => {
    const world = buildWorld(), game = new Game(world), town = world.areas.get('town-main')!;
    const solid = town.solid.slice(), ground = town.ground.slice(), saved = game.serialize();
    const service = new TownTrainService();
    for (let i = 0; i < 1200; i++) service.frames(town, i / 60);
    expect(town.solid).toEqual(solid);
    expect(town.ground).toEqual(ground);
    expect(game.serialize()).toEqual(saved);
    expect(game.world.variant.stage).toBe('childhood');
  });
});
