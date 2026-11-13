import { describe, expect, it } from 'vitest';
import type { AreaDef } from '../src/core/types';
import { buildWorld } from '../src/world';
import { STATION_ACCESS } from '../src/world/landmarks';
import { toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';
import { validateWorld, type RailLink } from '../src/world/validate';

function room(id: string): AreaDef {
  const width = 5, height = 5, ground = new Uint8Array(25).fill(T.FLOOR_CLASS);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!x || !y || x === width - 1 || y === height - 1) ground[y * width + x] = T.WALL;
  }
  return { id, name: id, kind: 'indoor', width, height, ground, objects: [], portals: [], interactions: [
    { id: `${id}-sign`, kind: 'sign', name: '暫定案内', x: 3, y: 3, solid: true, eventKey: `${id}.sign`, lines: ['暫定'] },
  ] };
}
function fixture() {
  const world = buildWorld();
  world.areas.clear(); world.facilities.clear();
  for (const id of ['rail-origin', 'rail-target']) world.areas.set(id, toRuntime(room(id)));
  world.start = { areaId: 'rail-origin', x: 1, y: 1, facing: 'down' };
  const link: RailLink = { from: { areaId: 'rail-origin', x: 1, y: 1 }, to: { areaId: 'rail-target', x: 1, y: 1 } };
  return { world, link };
}

describe('explicit railway reachability', () => {
  it('keeps existing calls compatible and publishes separate boarding/arrival points', () => {
    // Default validation remains backward compatible when no train-only areas are registered.
    const base = buildWorld();
    base.areas.delete('town-neighbor'); base.areas.delete('station-neighbor-interior');
    base.facilities.delete('station-neighbor');
    expect(validateWorld(base)).toEqual([]);
    expect(STATION_ACCESS.boarding).toEqual({ areaId: 'station-main-interior', x: 17, y: 9, facing: 'up' });
    expect(STATION_ACCESS.arrival.y).not.toBe(STATION_ACCESS.boarding.y);
  });
  it('visits a remote area only through a reachable departure, without creating portals', () => {
    const { world, link } = fixture();
    expect(validateWorld(world)).toContain('Unreachable interaction: rail-target-sign');
    expect(validateWorld(world, { railLinks: [link] })).toEqual([]);
    expect([...world.areas.values()].every(area => area.portalAt.size === 0 && area.def.portals.length === 0)).toBe(true);
  });
  it('treats each link as directed; returning needs a separate link', () => {
    const { world, link } = fixture();
    world.start = { ...link.to, facing: 'down' };
    expect(validateWorld(world, { railLinks: [link] })).toContain('Unreachable interaction: rail-origin-sign');
    expect(validateWorld(world, { railLinks: [link, { from: link.to, to: link.from }] })).toEqual([]);
  });
  it('does not seed a remote area from a disconnected walkable departure', () => {
    const { world, link } = fixture();
    const origin = world.areas.get('rail-origin')!;
    for (let y = 1; y < 4; y++) origin.solid[y * 5 + 2] = 1;
    const isolated = { ...link, from: { areaId: 'rail-origin', x: 3, y: 1 } };
    expect(validateWorld(world, { railLinks: [isolated] })).toContain('Unreachable interaction: rail-target-sign');
  });
  it.each([
    ['from', { areaId: 'missing', x: 1, y: 1 }, 'Unknown rail area'],
    ['to', { areaId: 'missing', x: 1, y: 1 }, 'Unknown rail area'],
    ['from', { areaId: 'rail-origin', x: 1.5, y: 1 }, 'Out of bounds rail point'],
    ['from', { areaId: 'rail-origin', x: 5, y: 1 }, 'Out of bounds rail point'],
    ['to', { areaId: 'rail-target', x: NaN, y: 1 }, 'Out of bounds rail point'],
    ['from', { areaId: 'rail-origin', x: 0, y: 1 }, 'Solid rail point'],
    ['to', { areaId: 'rail-target', x: 0, y: 1 }, 'Solid rail point'],
  ] as const)('rejects an invalid %s endpoint (%j)', (side, point, message) => {
    const { world, link } = fixture();
    const errors = validateWorld(world, { railLinks: [{ ...link, [side]: point }] });
    expect(errors.some(error => error.startsWith(message))).toBe(true);
    expect(errors).toContain('Unreachable interaction: rail-target-sign');
  });
  it('does not walk through an automatic portal to reach a departure behind it', () => {
    const { world, link } = fixture();
    const origin = room('rail-origin');
    origin.interactions = [];
    for (const y of [1, 3]) for (let x = 1; x < 4; x++) origin.ground[y * 5 + x] = T.WALL;
    origin.portals = [{ id: 'forced-door', from: { x: 2, y: 2 }, to: { areaId: 'rail-origin', x: 1, y: 2, facing: 'right' } }];
    world.areas.set(origin.id, toRuntime(origin));
    world.start = { areaId: origin.id, x: 1, y: 2, facing: 'right' };
    expect(validateWorld(world, { railLinks: [{ ...link, from: { areaId: origin.id, x: 3, y: 2 } }] }))
      .toContain('Unreachable interaction: rail-target-sign');
  });
});
