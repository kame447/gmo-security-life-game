import { describe, expect, it } from 'vitest';
import { feetAtTile } from '../src/core/coords';
import type { MapEvent } from '../src/core/types';
import { RailwayNetwork, type RailwayStation } from '../src/world/railway';

const station = (id: string, areaId: string, x: number): RailwayStation => ({
  id, name: id, boarding: { areaId, x, y: 4, facing: 'up', interactionId: `${id}-board`, eventKey: 'travel.station.board' },
  arrival: { areaId, x, y: 5, facing: 'down' },
});
const a = station('a', 'area-a', 3), b = station('b', 'area-b', 4), c = station('c', 'area-c', 5);
const event: Extract<MapEvent, { type: 'interact' }> = { type: 'interact', areaId: 'area-a', interactionId: 'a-board', eventKey: 'travel.station.board' };

describe('data-driven railway network', () => {
  it('generates directed links and destination choices from data, including a later added stop', () => {
    const network = new RailwayNetwork([a, b, c], [{ id: 'line', stations: ['a', 'b', 'c'] }]);
    expect(network.destinations('a').map(item => item.id)).toEqual(['b', 'c']);
    expect(network.destinations('c').map(item => item.id)).toEqual(['a', 'b']);
    expect(network.railLinks()).toHaveLength(6);
    expect(network.railLinks()).toContainEqual({ from: { areaId: 'area-a', x: 3, y: 4 }, to: { areaId: 'area-b', x: 4, y: 5 } });
    expect(network.railLinks()).toContainEqual({ from: { areaId: 'area-b', x: 4, y: 4 }, to: { areaId: 'area-a', x: 3, y: 5 } });
  });

  it('requires the exact boarding tile, facing, area and interaction', () => {
    const network = new RailwayNetwork([a, b], [{ id: 'line', stations: ['a', 'b'] }]);
    const player = { areaId: 'area-a', ...feetAtTile(3, 4), facing: 'up' as const };
    expect(network.boardingStation(event, player)?.id).toBe('a');
    expect(network.boardingStation(event, { ...player, ...feetAtTile(4, 4) })).toBeUndefined();
    expect(network.boardingStation(event, { ...player, facing: 'left' })).toBeUndefined();
    expect(network.boardingStation(event, { ...player, areaId: 'area-b' })).toBeUndefined();
    expect(network.boardingStation({ ...event, interactionId: 'other' }, player)).toBeUndefined();
    expect(network.boardingStation({ ...event, eventKey: 'other' }, player)).toBeUndefined();
  });

  it('rejects ambiguous and dangling configuration rather than producing unsafe routes', () => {
    expect(() => new RailwayNetwork([a, a], [])).toThrow('Invalid railway station');
    expect(() => new RailwayNetwork([a, { ...b, boarding: { ...b.boarding, areaId: a.boarding.areaId, x: a.boarding.x } }], [])).toThrow('Invalid railway station');
    expect(() => new RailwayNetwork([a, b], [{ id: 'line', stations: ['a', 'missing'] }])).toThrow('Invalid railway line');
    expect(() => new RailwayNetwork([a, b], [{ id: 'line', stations: ['a', 'a'] }])).toThrow('Invalid railway line');
  });

  it('copies data so a caller cannot silently redirect an existing route', () => {
    const mutable = structuredClone(a), network = new RailwayNetwork([mutable, b], [{ id: 'line', stations: ['a', 'b'] }]);
    (mutable.arrival as { x: number }).x = 99;
    const returned = network.station('a')!;
    (returned.arrival as { x: number }).x = 98;
    expect(network.station('a')?.arrival.x).toBe(3);
  });
});
