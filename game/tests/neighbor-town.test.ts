import { describe, expect, it } from 'vitest';
import { DIR, feetAtTile } from '../src/core/coords';
import { canStand } from '../src/map/explorer';
import { findPath } from '../src/world/path';
import { isSolidTile, toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';
import { createNeighborStation, createNeighborTown, NEIGHBOR_STATION_ACCESS as stop } from '../src/world/towns/neighbor';

describe('provisional neighboring town', () => {
  it('has different geography, a walkable bridge and reachable exploration targets', () => {
    const town = toRuntime(createNeighborTown());
    expect(town.def.id).toBe('town-neighbor');
    expect(town.def.kind).toBe('outdoor');
    expect(town.def.interactions.length).toBeGreaterThanOrEqual(2);
    expect(town.ground[12 * town.width + 38]).toBe(T.BRIDGE);
    expect(isSolidTile(town, 38, 12)).toBe(false);
    expect(isSolidTile(town, 38, 20)).toBe(true);
    expect(findPath(town, stop.townFront, { x: 43, y: 12 })).not.toBeNull();
    for (const target of town.interactions) {
      const adjacent = Object.values(DIR).some(({ dx, dy }) => findPath(town, stop.townFront, { x: target.x + dx, y: target.y + dy }));
      expect(adjacent, target.id).toBe(true);
    }
  });

  it('connects the town and station in both directions without rail-triggered portals', () => {
    const town = toRuntime(createNeighborTown()), station = toRuntime(createNeighborStation());
    const enter = town.def.portals[0], exit = station.def.portals[0];
    expect(enter.to).toEqual(stop.entrance);
    expect(exit.to).toEqual(stop.townFront);
    expect(findPath(town, stop.townFront, enter.from)).not.toBeNull();
    expect(findPath(station, stop.entrance, exit.from)).not.toBeNull();
    expect(findPath(station, stop.entrance, stop.boarding)).not.toBeNull();
    expect(findPath(station, stop.arrival, stop.boarding)).not.toBeNull();
    expect(station.portalAt.has(stop.arrival.y * station.width + stop.arrival.x)).toBe(false);
    expect(station.portalAt.has(stop.boarding.y * station.width + stop.boarding.x)).toBe(false);
    for (let x = 1; x < station.width - 1; x++) for (const y of [2, 3]) {
      expect(station.ground[y * station.width + x]).toBe(T.RAIL);
      expect(isSolidTile(station, x, y)).toBe(true);
      expect(station.portalAt.has(y * station.width + x)).toBe(false);
    }
  });

  it('places the boarding interaction in front of the safe action point and the arrival away from doors', () => {
    const station = toRuntime(createNeighborStation());
    for (const point of [stop.boarding, stop.arrival, stop.entrance]) {
      const feet = feetAtTile(point.x, point.y);
      expect(canStand(station, feet.x, feet.y)).toBe(true);
      expect(station.portalAt.has(point.y * station.width + point.x)).toBe(false);
    }
    const { dx, dy } = DIR[stop.boarding.facing];
    const interaction = station.interactionAt.get((stop.boarding.y + dy) * station.width + stop.boarding.x + dx);
    expect(interaction?.id).toBe(stop.boarding.interactionId);
    expect(interaction?.eventKey).toBe(stop.boarding.eventKey);
  });
});
