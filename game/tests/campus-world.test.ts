import { describe, expect, it } from 'vitest';
import { STORE_CONTACTS } from '../src/data/stores';
import { buildAreaMap } from '../src/minimap/model';
import { resolveGoalLocations } from '../src/minimap/targets';
import { TRAIN_NETWORK } from '../src/travel/network';
import { buildWorld, findPath, validateWorld } from '../src/world';
import { CAMPUS_PLACES } from '../src/world/campus';
import { shopCustomers } from '../src/world/shop-customers';

describe('school, university, office and store visitors', () => {
  it('connects all rooms and people through the live world and railway network', () => {
    expect(validateWorld(buildWorld(), { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
  });

  it.each(CAMPUS_PLACES)('walks from the neighboring station to $name and back out of its room', place => {
    const world = buildWorld(), town = world.areas.get('town-neighbor')!, room = world.areas.get(place.areaId)!;
    const entrance = town.def.portals.find(portal => portal.facilityId === place.id)!;
    expect(findPath(town, { x: 24, y: 45 }, entrance.from)).not.toBeNull();
    const exit = room.def.portals[0];
    expect(findPath(room, entrance.to, exit.from)).not.toBeNull();
    expect(exit.to).toMatchObject({ areaId: town.def.id, x: entrance.from.x, y: entrance.from.y + 1 });
    expect(room.interactions.filter(person => person.kind === 'npc').length).toBeGreaterThanOrEqual(2);
  });

  it('places visitors beside products or in cafe seats without occupying arrival tiles or clerks', () => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    for (const contact of STORE_CONTACTS) {
      const area = world.areas.get(contact.interiorAreaId)!;
      const entrance = town.def.portals.find(portal => portal.id === contact.entrancePortalId)!;
      const customers = shopCustomers(contact.catalogId);
      expect(customers.length).toBeGreaterThan(0);
      for (const customer of customers) {
        expect(area.interactions.some(person => person.id === customer.id)).toBe(true);
        const furniture = area.objects.filter(object => object.solid && customer.x >= object.x && customer.x < object.x + object.w &&
          customer.y >= object.y && customer.y < object.y + object.h);
        if (contact.catalogId === 'cafe') {
          expect(customer.sprite).toMatch(/-seated$/);
          expect(furniture).toHaveLength(1);
          expect(furniture[0]).toMatchObject({ kind: 'cafe-chair', facing: customer.facing, layer: 'decal' });
        } else {
          expect(furniture, customer.id).toEqual([]);
          const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[customer.facing!];
          const x = customer.x + step[0], y = customer.y + step[1];
          expect(area.objects.some(object => object.solid && x >= object.x && x < object.x + object.w &&
            y >= object.y && y < object.y + object.h), `${customer.id} faces a product display`).toBe(true);
        }
        expect(customer.x === entrance.to.x && customer.y === entrance.to.y).toBe(false);
        const clerk = area.interactions.find(person => person.eventKey === contact.clerkEventKey)!;
        expect(customer.x === clerk.x && customer.y === clerk.y).toBe(false);
      }
    }
  });

  it.each(CAMPUS_PLACES)('keeps the route to $name visible before and after the train ride', place => {
    const world = buildWorld();
    const goals = { pending: [place.id], done: [], targets: [{ id: place.id, areaIds: [place.areaId] }] };
    const locations = (areaId: string) => {
      const area = world.areas.get(areaId)!;
      return resolveGoalLocations(world, area, buildAreaMap(area, world.facilities.values()).markers, goals);
    };
    const stationDoor = world.areas.get('town-main')!.def.portals.find(portal => portal.id === 'station-enter')!.from;
    expect(locations('town-main')).toEqual([{ id: place.id, x: stationDoor.x + (stationDoor.w ?? 1) / 2, y: stationDoor.y + .5 }]);
    const boarding = TRAIN_NETWORK.railLinks().find(link => link.from.areaId === 'station-main-interior' && link.to.areaId === 'station-neighbor-interior')!.from;
    expect(locations('station-main-interior')).toEqual([{ id: place.id, x: boarding.x + .5, y: boarding.y + .5 }]);
    const door = world.areas.get('town-neighbor')!.def.portals.find(portal => portal.facilityId === place.id)!.from;
    expect(locations('town-neighbor')).toEqual([{ id: place.id, x: door.x + (door.w ?? 1) / 2, y: door.y + .5 }]);
    expect(locations(place.areaId)).toEqual([]);
  });
});
