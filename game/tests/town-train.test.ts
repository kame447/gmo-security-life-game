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
    expect(strips).toHaveLength(2);
    for (const strip of strips) {
      expect(strip.left).toBe(0);
      expect(strip.right).toBe(town.width * TILE);
      expect(strip.bottom - strip.top).toBe(TILE);
      expectRailOnly(town, strip);
    }
    expect(strips[1].top - strips[0].top).toBe(TILE);
    const y = strips[0].top / TILE;
    expect(town.ground[y * town.width + 56]).toBe(T.CROSSING);
    expect(town.ground[y * town.width + 117]).toBe(T.RAIL_BRIDGE);
  });

  it('follows new outdoor rail positions without hard-coded town coordinates', () => {
    for (const [y, rows] of [[80, 2], [36, 2], [0, 1]]) {
      const area = syntheticRail(y, rows), strips = findRailStrips(area);
      expect(strips).toHaveLength(rows);
      expect(strips[0].top).toBe(y * TILE);
      expect(strips.map(s => s.direction)).toEqual(rows === 2 ? ['down', 'up'] : ['down']);
      for (const strip of strips) expectRailOnly(area, strip);
      expect(new TownTrainService().frames(area, 2).length).toBeGreaterThan(0);
    }
  });

  it('does not bridge gaps, invent rails on empty ground, or animate indoor station trains', () => {
    const split = syntheticRail(36, 2, 24), strips = findRailStrips(split);
    expect(strips).toHaveLength(4);
    for (const strip of strips) expectRailOnly(split, strip);
    const world = buildWorld();
    const original = world.areas.get('town-neighbor')!;
    const ground = new Uint8Array(original.width * original.height).fill(T.GRASS);
    const empty = { ...original, def: { ...original.def, ground }, ground };
    expect(findRailStrips(empty)).toEqual([]);
    expect(findRailStrips(world.areas.get('station-neighbor-interior')!)).toEqual([]);
  });

  it('detects actual neighbor-town rails whenever the World contains them', () => {
    const neighbor = buildWorld().areas.get('town-neighbor')!, strips = findRailStrips(neighbor);
    // The base version has no outdoor rail. The station geography adds it later.
    const hasRail = neighbor.ground.some(tile => tile === T.RAIL || tile === T.RAIL_BRIDGE);
    expect(strips.length > 0).toBe(hasRail);
    const frames = new TownTrainService().frames(neighbor, 2);
    for (const strip of strips) {
      expectRailOnly(neighbor, strip);
      expect(frames.some(f => f.direction === strip.direction && f.strip.top === strip.top)).toBe(true);
    }
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

  it('clips partially entering and leaving trains to the rail rectangle horizontally', () => {
    const town = buildWorld().areas.get('town-main')!, service = new TownTrainService();
    const frame = service.frames(town, 0.5).find(f => f.heading === 'right')!;
    expect(frame.x).toBeLessThan(frame.strip.left);
    const draws: number[][] = [];
    const ctx = { drawImage: (_image: unknown, ...args: number[]) => draws.push(args) } as unknown as CanvasRenderingContext2D;
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => undefined, set: () => true }) }) });
    drawTrainFrame(ctx, frame);
    vi.unstubAllGlobals();
    expect(draws).toHaveLength(1);
    const [sx, sy, sw, sh, dx, dy, dw, dh] = draws[0];
    // 切り出しは線路の左端から。はみ出す部分は描かない。足元は線路の行の下端。
    expect(dx).toBe(frame.strip.left);
    expect(sx).toBeGreaterThan(0);
    expect(sw).toBe(dw); expect(sh).toBe(dh); expect(sy).toBe(0);
    expect(dy + dh).toBe(frame.strip.bottom);
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
