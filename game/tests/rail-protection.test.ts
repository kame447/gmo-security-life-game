import { describe, expect, it } from 'vitest';
import { feetAtTile, TILE } from '../src/core/coords';
import { canStand } from '../src/map/explorer';
import { buildWorld, findPath, isSolidTile, LANDMARKS, validateWorld } from '../src/world';
import { TOWN_RAIL_LAYOUTS } from '../src/world/rail-layouts';
import { applyRailProtection, RAIL_BUFFER_TILES } from '../src/world/rail-protection';
import { T, isSolidGround } from '../src/world/tiles';
import { getCrossings } from '../src/town-train/crossings';
import { TRAIN_NETWORK } from '../src/travel/network';

it('protects verges while preserving rail, crossings, river water and banks byte for byte', () => {
  const width = 8, height = 10, ground = new Uint8Array(width * height).fill(T.GRASS);
  for (let y = 0; y < height; y++) { ground[y * width + 5] = T.WATER; ground[y * width + 6] = T.BANK; }
  for (const y of [4, 5]) for (let x = 0; x < width; x++) ground[y * width + x] = x === 2 ? T.CROSSING : x === 5 ? T.RAIL_BRIDGE : T.RAIL;
  const before = ground.slice();
  applyRailProtection(ground, width, height, { northRow: 4, southRow: 5, singleX0: 3, singleX1: 4 });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x === 2 || x === 5 || x === 6 || y === 4 || y === 5) expect(ground[y * width + x]).toBe(before[y * width + x]);
  }
  expect(ground[3 * width]).toBe(T.RAIL_GUARD);
  expect(isSolidGround(T.RAIL_GUARD)).toBe(true);
});

describe.each(['town-main', 'town-neighbor'])('%s continuous rail protection', id => {
  const world = buildWorld(), area = world.areas.get(id)!, layout = TOWN_RAIL_LAYOUTS[id];
  it('has no unprotected gap except the actual pedestrian crossing openings', () => {
    const crossings = getCrossings(area);
    let guards = 0;
    for (let x = 0; x < area.width; x++) {
      const opening = crossings.some(c => x * TILE >= c.left && x * TILE < c.right);
      for (let d = 1; d <= RAIL_BUFFER_TILES; d++) for (const y of [layout.northRow - d, layout.southRow + d]) {
        const tile = area.ground[y * area.width + x];
        if (opening) { expect(tile).not.toBe(T.RAIL_GUARD); expect(isSolidTile(area, x, y)).toBe(false); }
        else { expect(isSolidTile(area, x, y), `${x},${y}`).toBe(true); if (tile === T.RAIL_GUARD) guards++; }
      }
    }
    expect(guards).toBeGreaterThan(100);
  });
  it('keeps every north-south crossing path and blocks lateral entry into the protected verge', () => {
    for (const c of getCrossings(area)) {
      const x = Math.floor((c.left + c.right) / (2 * TILE));
      expect(findPath(area, { x, y: layout.northRow - RAIL_BUFFER_TILES - 1 },
        { x, y: layout.southRow + RAIL_BUFFER_TILES + 1 })).not.toBeNull();
      for (let y = c.northWaitY + 1; y < c.southWaitY; y++) {
        const p = { x: (c.left + c.right) / 2, y };
        expect(canStand(area, p.x, p.y)).toBe(true);
        expect(canStand(area, c.left + 4, y)).toBe(false);
        if (c.right < area.width * TILE) expect(canStand(area, c.right - 4, y)).toBe(false);
      }
    }
  });
  it('keeps the station contract and all authored portals reachable', () => {
    expect(validateWorld(world, { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
    if (id === 'town-main') for (const target of [LANDMARKS.schoolGate, LANDMARKS.stationFront, LANDMARKS.parkPlaza]) {
      expect(findPath(area, LANDMARKS.homeFront, target)).not.toBeNull();
      const p = feetAtTile(target.x, target.y); expect(canStand(area, p.x, p.y)).toBe(true);
    }
  });
});
