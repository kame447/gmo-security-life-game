import { describe, expect, it, vi } from 'vitest';
import { TILE } from '../src/core/coords';
import { Game } from '../src/session/game';
import { TOWN_TRAIN_PROTOTYPE } from '../src/town-train/config';
import { drawTrainFrame } from '../src/town-train/render';
import { TownTrainService } from '../src/town-train/service';
import { buildWorld } from '../src/world';
import { lineFootY, townRailLayout, type TownRailLayout } from '../src/world/rail-layout';
import { TOWN_RAIL_LAYOUTS } from '../src/world/rail-layouts';

describe('town train prototype', () => {
  it('runs on the registered layouts of both towns only; indoor and unregistered areas have no trains', () => {
    const world = buildWorld(), service = new TownTrainService();
    for (const id of ['town-main', 'town-neighbor']) {
      const area = world.areas.get(id)!;
      expect(TOWN_RAIL_LAYOUTS[id]).toBeDefined();
      expect(service.frames(area, 2).length).toBeGreaterThan(0);
    }
    expect(service.frames(world.areas.get('station-main-interior')!, 2)).toEqual([]);
    expect(service.frames(world.areas.get('station-neighbor-interior')!, 2)).toEqual([]);
    expect(service.frames(world.areas.get('home-family-interior')!, 2)).toEqual([]);
  });

  it('follows a supplied layout without hard-coded town coordinates', () => {
    const area = buildWorld().areas.get('town-neighbor')!;
    const layout: TownRailLayout = townRailLayout({ trackY: 20, trackRows: 2, building: { x: 10, w: 8 } });
    const service = new TownTrainService();
    const frames = service.frames(area, 2, layout);
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) expect(f.footY).toBe(lineFootY(layout, f.direction, f.x + f.length / 2));
    expect(frames.find(f => f.direction === 'down')!.footY).toBe(21 * TILE);
  });

  it('uses periodic elapsed time instead of accumulated frames, and accommodates multiple trains', () => {
    const town = buildWorld().areas.get('town-main')!, service = new TownTrainService();
    const baseline = service.frames(town, 3.25);
    expect(baseline.length).toBeGreaterThan(1);
    const round = (frames: ReturnType<typeof service.frames>) => frames.map(f => ({ ...f, x: Math.round(f.x * 1e4) / 1e4, y: Math.round(f.y * 1e4) / 1e4, footY: Math.round(f.footY * 1e4) / 1e4 }));
    expect(round(service.frames(town, 3.25 + TOWN_TRAIN_PROTOTYPE.intervalSeconds))).toEqual(round(baseline));
    const before = service.frames(town, 2)[0], after = service.frames(town, 2.5)[0];
    expect(after.x - before.x).toBeCloseTo(TOWN_TRAIN_PROTOTYPE.speedPixelsPerSecond / 2);
    for (let i = 0; i < 120; i++) service.frames(town, 3.25 * i / 120);
    expect(service.frames(town, 3.25)).toEqual(baseline);
    expect(service.frames(town, NaN)).toEqual([]);
    expect(service.frames(town, -1)).toEqual([]);
    const slower = new TownTrainService({ ...TOWN_TRAIN_PROTOTYPE, intervalSeconds: 8, speedPixelsPerSecond: 64 });
    expect(slower.frames(town, 2.5)[0].x - slower.frames(town, 2)[0].x).toBeCloseTo(32);
    expect(round(slower.frames(town, 10))).toEqual(round(slower.frames(town, 2)));
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
