import { describe, expect, it } from 'vitest';
import { APPEARANCE_OPTIONS, DEFAULT_APPEARANCE, type PlayerAppearance } from '../src/core/appearance';
import type { Facing } from '../src/core/coords';
import type { AreaDef, PortalDef } from '../src/core/types';
import { BIKE_SPEED, RUN_SPEED } from '../src/map/explorer';
import { drawRider, RIDER_H, RIDER_W } from '../src/render/bicycle-sprite';
import type { C2D } from '../src/render/draw';
import { Game } from '../src/session/game';
import type { AreaRuntime, World } from '../src/world';

/** An open 8×8 outdoor area with a door at (3,3) into an indoor room. */
function world(): World {
  const area = (id: string, kind: AreaDef['kind']): AreaRuntime => {
    const def: AreaDef = { id, name: id, kind, width: 8, height: 8, ground: new Uint8Array(64), objects: [], portals: [], interactions: [] };
    return { def, width: 8, height: 8, ground: def.ground, solid: new Uint8Array(64),
      portalAt: new Map(), interactionAt: new Map(), objects: [], interactions: [] };
  };
  const town = area('town', 'outdoor'), room = area('room', 'indoor');
  const door: PortalDef = { id: 'door', from: { x: 3, y: 3 }, to: { areaId: 'room', x: 1, y: 1, facing: 'down' } };
  town.portalAt.set(3 * 8 + 3, door);
  return { areas: new Map([['town', town], ['room', room]]), facilities: new Map(),
    start: { areaId: 'town', x: 1, y: 3, facing: 'right' }, variant: { id: 'childhood', stage: 'childhood' } };
}

describe('bicycle riding', () => {
  it('gets on outdoors and moves faster than running, ignoring the run key', () => {
    const game = new Game(world());
    expect(game.riding).toBe(false);
    expect(game.toggleBicycle()).toBe(true);
    expect(game.riding).toBe(true);
    expect(BIKE_SPEED).toBeGreaterThan(RUN_SPEED);
    const start = game.player.x;
    game.update(0.05, { dir: 'right', run: false });
    expect(game.player.x).toBeCloseTo(start + BIKE_SPEED * 0.05);
    game.update(0.05, { dir: 'right', run: true });
    expect(game.player.x).toBeCloseTo(start + BIKE_SPEED * 0.1);
    expect(game.toggleBicycle()).toBe(true);
    expect(game.riding).toBe(false);
  });

  it('gets off when entering an indoor area and cannot get on there', () => {
    const game = new Game(world());
    game.toggleBicycle();
    game.update(1, { dir: 'right', run: false });
    expect(game.player.areaId).toBe('room');
    expect(game.riding).toBe(false);
    expect(game.toggleBicycle()).toBe(false);
    expect(game.riding).toBe(false);
  });

  it('cannot toggle during a dialog, and starting over gets off', () => {
    const game = new Game(world());
    game.dialog = { speaker: 'ともだち', lines: ['やあ'], index: 0 };
    expect(game.toggleBicycle()).toBe(false);
    game.dialog = null;
    game.toggleBicycle();
    game.reset();
    expect(game.riding).toBe(false);
  });

  it('is not written to the save data', () => {
    const game = new Game(world());
    game.toggleBicycle();
    expect(Object.keys(game.serialize())).not.toContain('riding');
    expect(new Game(world(), { save: game.serialize() }).riding).toBe(false);
  });
});

describe('rider sprite', () => {
  /** Records every dot drawn, after the left-facing mirror transform. */
  function dots(a: PlayerAppearance, facing: Facing, frame: 0 | 1 | 2) {
    const out: { x: number; y: number; color: string }[] = [];
    let flip = false;
    const c = {
      fillStyle: '',
      translate() { flip = true; },
      scale() {},
      fillRect(x: number, y: number, w: number, h: number) {
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
          out.push({ x: flip ? RIDER_W - 1 - (x + dx) : x + dx, y: y + dy, color: this.fillStyle });
        }
      },
    };
    drawRider(c as unknown as C2D, a, facing, frame);
    return out;
  }

  it('stays inside its canvas for every facing, frame and appearance option', () => {
    const appearances = [DEFAULT_APPEARANCE,
      ...APPEARANCE_OPTIONS.outfit.map(({ id }) => ({ ...DEFAULT_APPEARANCE, outfit: id })),
      ...APPEARANCE_OPTIONS.hairStyle.map(({ id }) => ({ ...DEFAULT_APPEARANCE, hairStyle: id })),
      ...APPEARANCE_OPTIONS.silhouette.map(({ id }) => ({ ...DEFAULT_APPEARANCE, silhouette: id }))] as PlayerAppearance[];
    for (const a of appearances) for (const facing of ['up', 'down', 'left', 'right'] as const) for (const frame of [0, 1, 2] as const) {
      const drawn = dots(a, facing, frame);
      expect(drawn.length).toBeGreaterThan(0);
      for (const { x, y, color } of drawn) {
        expect(x >= 0 && x < RIDER_W && y >= 0 && y < RIDER_H, `${facing}/${frame} (${x},${y})`).toBe(true);
        expect(color, `${facing}/${frame} (${x},${y})`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('touches the ground (bottom row) so the feet anchor sits under the wheels', () => {
    for (const facing of ['up', 'down', 'right'] as const) {
      expect(dots(DEFAULT_APPEARANCE, facing, 0).some(d => d.y === RIDER_H - 1), facing).toBe(true);
    }
  });

  it('mirrors the right-facing rider for left', () => {
    const key = (d: { x: number; y: number; color: string }) => `${d.x},${d.y},${d.color}`;
    const right = new Set(dots(DEFAULT_APPEARANCE, 'right', 1).map(d => key({ ...d, x: RIDER_W - 1 - d.x })));
    expect(new Set(dots(DEFAULT_APPEARANCE, 'left', 1).map(key))).toEqual(right);
  });

  it('turns the pedals between walking frames', () => {
    const frames = ([0, 1, 2] as const).map(f => JSON.stringify(dots(DEFAULT_APPEARANCE, 'right', f)));
    expect(new Set(frames).size).toBe(3);
  });
});
