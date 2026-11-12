import { describe, expect, it } from 'vitest';
import { feetAtTile, TILE, type Facing } from '../src/core/coords';
import { DEFAULT_APPEARANCE, type PlayerAppearance } from '../src/core/appearance';
import type { AreaDef, InteractionDef, MapEvent, PortalDef, SaveData } from '../src/core/types';
import { Game, HITBOX, RUN_SPEED, WALK_SPEED, parseSave } from '../src/engine/game';
import type { AreaRuntime, World } from '../src/world';

function smallWorld(): World {
  const width = 8, height = 8;
  const npc: InteractionDef = { id: 'friend', kind: 'npc', name: 'ともだち', x: 2, y: 2,
    solid: true, eventKey: 'test.friend', lines: ['こんにちは。', 'またあそぼうね。'] };
  const def: AreaDef = { id: 'test', name: 'テスト', kind: 'outdoor', width, height,
    ground: new Uint8Array(width * height), objects: [], portals: [], interactions: [npc] };
  const solid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) solid[y * width + 5] = 1;
  solid[npc.y * width + npc.x] = 1;
  const area: AreaRuntime = { def, width, height, ground: def.ground, solid,
    portalAt: new Map(), interactionAt: new Map([[npc.y * width + npc.x, npc]]),
    objects: [], interactions: [npc] };
  return { areas: new Map([['test', area]]), facilities: new Map(),
    start: { areaId: 'test', x: 2, y: 3, facing: 'up' }, variant: { id: 'childhood', stage: 'childhood' } };
}

function move(game: Game, dir: Facing, pixels: number): void {
  for (let i = 0; i < pixels; i++) game.update(1 / RUN_SPEED, { dir, run: true });
}

describe('DOM-independent game engine', () => {
  it('walks and runs at the contracted speeds, with fractional pixels', () => {
    const game = new Game(smallWorld());
    const start = game.player.x;
    game.update(0.125, { dir: 'right', run: false });
    expect(game.player.x).toBe(start + WALK_SPEED * 0.125);
    game.update(0.125, { dir: 'right', run: true });
    expect(game.player.x).toBe(start + (WALK_SPEED + RUN_SPEED) * 0.125);
    expect(game.moving).toBe(true);
    expect(game.walkTime).toBeCloseTo(0.25);
    game.update(1, { dir: null, run: false });
    expect(game.moving).toBe(false);
  });

  it('cannot enter a wall when movement is held, even across a long update', () => {
    const game = new Game(smallWorld());
    move(game, 'right', 300);
    expect(game.player.x + HITBOX.halfW).toBe(5 * TILE);
    const stopped = { ...game.player };
    game.update(3, { dir: 'right', run: true });
    expect(game.player).toEqual(stopped);
    expect(game.moving).toBe(false);
  });

  it.each(['up', 'down', 'left', 'right'] as const)('stops at the %s edge and emits once while held', dir => {
    const world = smallWorld();
    world.areas.get('test')!.solid.fill(0);
    const game = new Game(world);
    const events: MapEvent[] = [];
    const unsubscribe = game.on(e => events.push(e));
    move(game, dir, 300);
    const stopped = { ...game.player };
    move(game, dir, 100);
    expect(game.player).toEqual(stopped);
    expect(events).toEqual([{ type: 'edge', areaId: 'test', side: dir }]);
    expect(game.player.x).toBeGreaterThanOrEqual(HITBOX.halfW);
    expect(game.player.x).toBeLessThanOrEqual(8 * TILE - HITBOX.halfW);
    expect(game.player.y).toBeGreaterThanOrEqual(HITBOX.h);
    expect(game.player.y).toBeLessThanOrEqual(8 * TILE);
    unsubscribe();
    game.reset();
    expect(events).toHaveLength(1);
  });

  it('corrects a small corner overlap without entering the obstacle', () => {
    const world = smallWorld();
    const area = world.areas.get('test')!;
    area.solid.fill(0);
    area.solid[2 * area.width + 3] = 1;
    const game = new Game(world);
    game.player = { areaId: 'test', x: 46, y: 56, facing: 'up' };
    move(game, 'up', 2);
    expect(game.player.x + HITBOX.halfW).toBeLessThanOrEqual(3 * TILE);
    expect(game.player.y).toBe(54);
    expect(parseSave(game.serialize(), world)).not.toBeNull();
  });

  it('stops the current movement at a portal and notifies in order', () => {
    const world = smallWorld();
    const source = world.areas.get('test')!;
    const portal: PortalDef = { id: 'door', from: { x: 3, y: 3 },
      to: { areaId: 'room', x: 1, y: 1, facing: 'down' }, facilityId: 'home' };
    source.portalAt.set(3 * source.width + 3, portal);
    const room: AreaRuntime = { ...source, def: { ...source.def, id: 'room', portals: [] },
      solid: new Uint8Array(64), portalAt: new Map(), interactionAt: new Map(), interactions: [] };
    world.areas.set('room', room);
    const sinkEvents: MapEvent[] = [];
    const game = new Game(world, { sink: { onMapEvent: e => { sinkEvents.push(e); } } });
    const events: MapEvent[] = [];
    game.on(e => events.push(e));
    game.update(1, { dir: 'right', run: true });
    expect(game.player).toEqual({ areaId: 'room', ...feetAtTile(1, 1), facing: 'down' });
    expect(events).toEqual([
      { type: 'portal', portalId: 'door', fromAreaId: 'test', toAreaId: 'room', facilityId: 'home' },
      { type: 'area-enter', areaId: 'room' },
    ]);
    expect(sinkEvents).toEqual(events);
  });

  it('notifies and opens NPC dialog, blocks movement, advances and closes it', () => {
    const game = new Game(smallWorld());
    const events: MapEvent[] = [];
    game.on(e => events.push(e));
    expect(game.facingInteraction()?.id).toBe('friend');
    game.action();
    expect(events).toEqual([{ type: 'interact', areaId: 'test', interactionId: 'friend', eventKey: 'test.friend' }]);
    expect(game.dialog).toEqual({ speaker: 'ともだち', lines: ['こんにちは。', 'またあそぼうね。'], index: 0 });
    const before = { ...game.player };
    move(game, 'right', 32);
    expect(game.player).toEqual(before);
    expect(game.moving).toBe(false);
    game.action();
    expect(game.dialog?.index).toBe(1);
    game.action();
    expect(game.dialog).toBeNull();
    move(game, 'right', 1);
    expect(game.player.x).toBe(before.x + 1);
  });

  it('uses sink dialog and supports an empty response to suppress default dialog', () => {
    const world = smallWorld();
    const game = new Game(world, { sink: { onMapEvent: () => ({ speaker: 'イベント', lines: ['べつのはなし。'] }) } });
    game.action();
    expect(game.dialog).toEqual({ speaker: 'イベント', lines: ['べつのはなし。'], index: 0 });
    const silent = new Game(world, { sink: { onMapEvent: () => ({ lines: [] }) } });
    silent.action();
    expect(silent.dialog).toBeNull();
  });

  it('serializes and restores exact pixel position and facing; reset returns to start', () => {
    const world = smallWorld();
    const game = new Game(world);
    game.update(0.1, { dir: 'right', run: false });
    const save = JSON.parse(JSON.stringify(game.serialize()));
    const restored = new Game(world, { save });
    expect(restored.player).toEqual(game.player);
    expect(restored.serialize()).toEqual(save);
    restored.reset();
    expect(restored.player).toEqual({ areaId: world.start.areaId, ...feetAtTile(world.start.x, world.start.y), facing: world.start.facing });
    expect(restored.dialog).toBeNull();
    expect(restored.walkTime).toBe(0);
    expect(new Game(world, { save: { v: 99 } }).player).toEqual(restored.player);
  });

  it('rejects corrupt saves, unknown areas, solid tiles and partial hitbox overlap', () => {
    const world = smallWorld();
    const valid = new Game(world).serialize();
    const invalid: unknown[] = [null, undefined, [], 'save', {}, { ...valid, v: 2 },
      { ...valid, variantId: 'unknown' }, { ...valid, areaId: 'missing' },
      { ...valid, facing: 'north' }, { ...valid, x: '40' }, { ...valid, x: NaN },
      { ...valid, y: Infinity }, { ...valid, x: -1 }, { ...valid, y: -1 },
      { ...valid, y: 8 * TILE + 1 }, { ...valid, x: 8 * TILE },
      { ...valid, ...feetAtTile(5, 3) }, { ...valid, x: 5 * TILE - 4 },
      { ...valid, x: 0 }, { ...valid, y: 0 }];
    for (const value of invalid) expect(parseSave(value, world), JSON.stringify(value)).toBeNull();
    expect(parseSave(valid, world)).toEqual(valid);
  });

  it('ignores invalid time deltas', () => {
    const game = new Game(smallWorld());
    const before = game.serialize();
    for (const dt of [NaN, Infinity, -1, 0]) game.update(dt, { dir: 'right', run: true });
    expect(game.serialize()).toEqual(before);
  });

  it('applies appearance changes without emitting map events or sharing caller objects', () => {
    const game = new Game(smallWorld());
    const events: MapEvent[] = [];
    game.on(e => events.push(e));
    expect(game.appearance).toEqual(DEFAULT_APPEARANCE);
    const changed = { ...DEFAULT_APPEARANCE, hairStyle: 'bob', outfitColor: 'red' };
    game.setAppearance(changed);
    expect(game.appearance).toEqual(changed);
    changed.hairStyle = 'tied';
    expect(game.appearance.hairStyle).toBe('bob');
    game.setAppearance({ ...changed, hairColor: 'unknown' });
    expect(game.appearance).toEqual({ ...changed, hairColor: DEFAULT_APPEARANCE.hairColor });
    expect(events).toEqual([]);
  });

  it('restores appearance, repairs partial damage, and accepts v1 saves without appearance', () => {
    const world = smallWorld();
    const game = new Game(world);
    game.setAppearance({ ...DEFAULT_APPEARANCE, silhouette: 'type-b', hairColor: 'black', outfit: 'overalls' });
    const saved = game.serialize();
    const restored = new Game(world, { save: JSON.parse(JSON.stringify(saved)) });
    expect(restored.appearance).toEqual(game.appearance);
    const damaged = { ...saved, appearance: { ...saved.appearance, hairStyle: 'unknown', outfitColor: null } };
    const repaired = new Game(world, { save: damaged });
    expect(repaired.player).toEqual(game.player);
    expect(repaired.appearance).toEqual(game.appearance);
    const { appearance: _oldAppearance, ...oldSave } = saved;
    expect(parseSave(oldSave, world)).not.toBeNull();
    expect(new Game(world, { save: oldSave }).appearance).toEqual(DEFAULT_APPEARANCE);
    saved.appearance!.hairColor = 'gold';
    expect(game.appearance.hairColor).toBe('black');
  });

  it('keeps appearance through reset and does not affect movement, collision or notification', () => {
    const world = smallWorld();
    const original = new Game(world);
    const changed = new Game(world);
    const appearance: PlayerAppearance = { silhouette: 'type-b', hairStyle: 'tied', hairColor: 'gold', outfit: 'shirt', outfitColor: 'purple' };
    changed.setAppearance(appearance);
    const originalEvents: MapEvent[] = [], changedEvents: MapEvent[] = [];
    original.on(e => originalEvents.push(e));
    changed.on(e => changedEvents.push(e));
    for (const game of [original, changed]) {
      move(game, 'right', 300);
      move(game, 'down', 300);
      game.reset();
      game.action();
    }
    expect(changed.player).toEqual(original.player);
    expect(changed.dialog).toEqual(original.dialog);
    expect(changedEvents).toEqual(originalEvents);
    expect(changed.appearance).toEqual(appearance);
  });

  it.each([1 / 240, 1 / 60, 1 / 30, 0.05])('keeps walk/run distance proportional to elapsed time at dt=%s', dt => {
    for (const run of [false, true]) {
      const world = smallWorld();
      const area = world.areas.get('test')!;
      area.width = area.def.width = 40;
      area.solid = new Uint8Array(40 * area.height);
      const game = new Game(world);
      const startX = game.player.x;
      let elapsed = 0;
      while (elapsed < 1 - 1e-10) {
        const step = Math.min(dt, 1 - elapsed);
        game.update(step, { dir: 'right', run });
        elapsed += step;
      }
      expect(game.player.x - startX).toBeCloseTo(run ? RUN_SPEED : WALK_SPEED, 8);
    }
  });

  it.each([1 / 240, 1 / 60, 1 / 30, 0.05, 1])('cannot skip walls or narrow entrances at dt=%s', dt => {
    for (const run of [false, true]) {
      const world = smallWorld();
      const game = new Game(world);
      for (let time = 0; time < 2; time += dt) game.update(dt, { dir: 'right', run });
      expect(game.player.x + HITBOX.halfW).toBeLessThanOrEqual(5 * TILE);
      expect(parseSave(game.serialize(), world)).not.toBeNull();
      const portal: PortalDef = { id: 'narrow-door', from: { x: 3, y: 3 },
        to: { areaId: 'test', x: 1, y: 6, facing: 'down' } };
      game.area.portalAt.set(3 * game.area.width + 3, portal);
      game.reset();
      const events: MapEvent[] = [];
      game.on(e => events.push(e));
      for (let time = 0; time < 1 && !events.some(e => e.type === 'portal'); time += dt) {
        game.update(dt, { dir: 'right', run });
      }
      expect(game.player).toEqual({ areaId: 'test', ...feetAtTile(1, 6), facing: 'down' });
      expect(events.map(e => e.type)).toEqual(['portal', 'area-enter']);
    }
  });

  it('keeps the hitbox outside a corner and the authored river bank at dt=0.05', async () => {
    const world = smallWorld();
    const area = world.areas.get('test')!;
    area.solid.fill(0);
    area.solid[2 * area.width + 3] = 1;
    const game = new Game(world);
    game.player = { areaId: 'test', x: 46, y: 56, facing: 'up' };
    for (let i = 0; i < 20; i++) game.update(0.05, { dir: 'up', run: true });
    expect(parseSave(game.serialize(), world)).not.toBeNull();
    const { buildWorld } = await import('../src/world');
    const { T } = await import('../src/world/tiles');
    const town = buildWorld();
    const riverGame = new Game(town);
    const a = riverGame.area;
    let bank: { x: number; y: number } | undefined;
    for (let y = 1; y < a.height - 1 && !bank; y++) for (let x = 1; x < a.width - 1; x++) {
      if (a.ground[y * a.width + x] === T.BANK && !a.solid[y * a.width + x - 1] &&
          a.solid[(y - 1) * a.width + x] && a.solid[(y + 1) * a.width + x]) {
        bank = { x, y }; break;
      }
    }
    expect(bank).toBeDefined();
    riverGame.player = { areaId: 'town-main', ...feetAtTile(bank!.x - 1, bank!.y), facing: 'right' };
    expect(parseSave(riverGame.serialize(), town)).not.toBeNull();
    for (let i = 0; i < 100; i++) riverGame.update(0.05, { dir: 'right', run: true });
    expect(riverGame.player.x + HITBOX.halfW).toBeLessThanOrEqual(bank!.x * TILE);
    expect(parseSave(riverGame.serialize(), town)).not.toBeNull();
  });

  it('continues the remaining fixed substeps after entering a portal in one rendered frame', async () => {
    const { buildWorld } = await import('../src/world');
    const game = new Game(buildWorld());
    const events: MapEvent[] = [];
    game.on(e => events.push(e));
    for (let step = 0; step < 30; step++) game.update(1 / 120, { dir: 'up', run: false });
    expect(game.player.areaId).toBe('home-family-interior');
    expect(game.player.facing).toBe('up');
    expect(game.player.y).toBeLessThan(feetAtTile(7, 10).y);
    expect(game.player.y).toBeGreaterThan(feetAtTile(7, 9).y);
    expect(events.map(e => e.type)).toEqual(['portal', 'area-enter']);
    expect(parseSave(game.serialize(), game.world)).not.toBeNull();
  });

  it('keeps edge notification and dialog pause stable across multiple substeps per frame', () => {
    const world = smallWorld();
    const game = new Game(world);
    game.action();
    const before = { ...game.player };
    for (let step = 0; step < 30; step++) game.update(1 / 120, { dir: 'left', run: true });
    expect(game.player).toEqual(before);
    game.action(); game.action();
    const events: MapEvent[] = [];
    game.on(e => events.push(e));
    for (let frame = 0; frame < 20; frame++) {
      for (let step = 0; step < 30; step++) game.update(1 / 120, { dir: 'left', run: true });
    }
    expect(game.player.x).toBeGreaterThanOrEqual(HITBOX.halfW);
    expect(game.player.x).toBeLessThan(HITBOX.halfW + 1);
    expect(events).toEqual([{ type: 'edge', areaId: 'test', side: 'left' }]);
  });
});

describe('real childhood world movement', () => {
  it.each(['schoolGate', 'stationFront', 'parkPlaza'] as const)('walks the BFS path from home to %s through Game.update', async name => {
    const { buildWorld, findPath, LANDMARKS } = await import('../src/world');
    const world = buildWorld();
    const game = new Game(world);
    const path = findPath(game.area, LANDMARKS.homeFront, LANDMARKS[name]);
    expect(path).not.toBeNull();
    for (const next of path!) {
      const destination = feetAtTile(next.x, next.y);
      const dx = destination.x - game.player.x;
      const dy = destination.y - game.player.y;
      if (dx) move(game, dx > 0 ? 'right' : 'left', Math.abs(dx));
      if (dy) move(game, dy > 0 ? 'down' : 'up', Math.abs(dy));
      expect(game.player.areaId).toBe('town-main');
      expect({ x: game.player.x, y: game.player.y }).toEqual(destination);
    }
    expect(game.player).toMatchObject({ areaId: 'town-main', ...feetAtTile(LANDMARKS[name].x, LANDMARKS[name].y) });
  });

  it.each([
    ['home-family-interior', 'homeFront'],
    ['school-classroom-interior', 'schoolDoorFront'],
    ['shop-konbini-interior', 'konbiniDoorFront'],
  ] as const)('enters and exits %s at the exact outdoor position facing down', async (interiorId, landmark) => {
    const { buildWorld, LANDMARKS } = await import('../src/world');
    const world = buildWorld();
    const point = LANDMARKS[landmark];
    const save: SaveData = { v: 1, variantId: world.variant.id, areaId: 'town-main', ...feetAtTile(point.x, point.y), facing: 'up' };
    const game = new Game(world, { save });
    const events: MapEvent[] = [];
    game.on(e => events.push(e));
    for (let i = 0; i < 32 && game.player.areaId === 'town-main'; i++) move(game, 'up', 1);
    expect(game.player.areaId).toBe(interiorId);
    expect(game.player.facing).toBe('up');
    expect(events.map(e => e.type)).toEqual(['portal', 'area-enter']);
    const exit = game.area.def.portals.find((p: PortalDef) => p.to.areaId === 'town-main')!;
    // The authored entrance spawns immediately north of the exit mat.
    expect(Math.floor(game.player.x / TILE)).toBeGreaterThanOrEqual(exit.from.x);
    expect(Math.floor(game.player.x / TILE)).toBeLessThan(exit.from.x + (exit.from.w ?? 1));
    for (let i = 0; i < 48 && game.player.areaId === interiorId; i++) move(game, 'down', 1);
    expect(game.player).toEqual({ areaId: 'town-main', ...feetAtTile(point.x, point.y), facing: 'down' });
    expect(events.map(e => e.type)).toEqual(['portal', 'area-enter', 'portal', 'area-enter']);
    game.update(0.05, { dir: null, run: false });
    expect(game.player.areaId).toBe('town-main');
  });
});
