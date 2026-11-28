import { describe, expect, it } from 'vitest';
import { feetAtTile, TILE, type Facing } from '../src/core/coords';
import type { PortalDef } from '../src/core/types';
import { RUN_SPEED } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { parseSave, type SaveData } from '../src/state/save';
import { buildWorld, CHILDHOOD_VARIANT, findPath, isSolidTile, LANDMARKS } from '../src/world';
import { MAIN_STATION_LAYOUT } from '../src/world/landmarks';
import { T } from '../src/world/tiles';

function move(game: Game, dir: Facing, pixels: number): void {
  for (let i = 0; i < pixels; i++) game.update(1 / RUN_SPEED, { dir, run: true });
}

describe('konbini relocation (Candidate E)', () => {
  it('places konbini at Candidate E while preserving shop-konbini, town-shop-51-47, and interior', () => {
    const world = buildWorld();
    const town = world.areas.get('town-main')!;

    expect(world.facilities.get('shop-konbini')).toEqual({
      id: 'shop-konbini',
      kind: 'konbini',
      name: 'コンビニ',
      areaId: 'town-main',
      interior: 'full',
      state: 'open',
    });

    const konbiniBuildings = town.objects.filter(o => o.facilityId === 'shop-konbini');
    expect(konbiniBuildings).toHaveLength(1);
    expect(konbiniBuildings[0]).toMatchObject({
      id: 'town-shop-51-47',
      kind: 'shop',
      style: 'konbini',
      x: 60,
      y: 67,
      w: 6,
      h: 6,
      solid: true,
      facilityId: 'shop-konbini',
    });

    expect(LANDMARKS.konbiniDoorFront).toEqual({ x: 63, y: 73 });
    expect(town.def.portals.filter(p => p.id === 'konbini-enter')).toHaveLength(1);
    expect(town.def.portals.find(p => p.id === 'konbini-enter')?.from).toEqual({ x: 63, y: 72 });
    expect(town.portalAt.get(52 * town.width + 63)).toBeUndefined();
    expect(town.portalAt.get(72 * town.width + 63)?.id).toBe('konbini-enter');

    // Front apron (y=73..74 plaza + y=75 sidewalk) and east parking lot (67..69, 70..74)
    for (let y = 73; y <= 74; y++) {
      for (let x = 59; x <= 66; x++) {
        expect(town.ground[y * town.width + x]).toBe(T.PLAZA);
        expect(isSolidTile(town, x, y), `(${x},${y}) front plaza walkable`).toBe(false);
      }
    }
    expect(town.ground[75 * town.width + 63]).toBe(T.SIDEWALK);
    expect(isSolidTile(town, 63, 75)).toBe(false);
    expect(town.ground[71 * town.width + 67]).toBe(T.PARKING);
    expect(town.objects.find(o => o.kind === 'car' && o.x === 67 && o.y === 71)).toBeDefined();

    // #65 changes the old nonfunctional cafe at 60,59 into an unlinked apartment, preserving its ID.
    expect(town.objects.find(o => o.id === 'town-shop-60-59')).toMatchObject({
      x: 60, y: 59, w: 6, h: 6, kind: 'apartment', style: '0', facilityId: undefined,
    });
    expect(town.objects.find(o => o.id === 'town-house-70-59')).toMatchObject({ x: 70, y: 59, w: 5, h: 4 });
    expect(town.objects.find(o => o.id === 'town-apartment-70-66')).toMatchObject({ x: 70, y: 66, w: 6, h: 5 });

    // shop-konbini-interior stays intact and exits back to the updated LANDMARKS.konbiniDoorFront
    const interior = world.areas.get('shop-konbini-interior')!;
    expect(interior.interactions.map(i => i.eventKey)).toEqual([
      'shopping.konbini.clerk',
      'shopping.konbini.snacks',
      'shopping.konbini.drinks',
      'customer.konbini.after-school',
    ]);
    expect(interior.def.portals.find(p => p.id === 'konbini-exit')?.to).toEqual({
      areaId: 'town-main',
      x: LANDMARKS.konbiniDoorFront.x,
      y: LANDMARKS.konbiniDoorFront.y,
      facing: 'down',
    });
  });

  it('connects home, station, and shopping street to the relocated konbini and supports enter/exit roundtrip', () => {
    const world = buildWorld();
    const town = world.areas.get('town-main')!;

    for (const startKey of ['homeFront', 'stationFront', 'shoppingStreet'] as const) {
      expect(findPath(town, LANDMARKS[startKey], LANDMARKS.konbiniDoorFront), `route from ${startKey}`).not.toBeNull();
    }

    const save: SaveData = {
      v: 1,
      variantId: world.variant.id,
      areaId: 'town-main',
      ...feetAtTile(LANDMARKS.konbiniDoorFront.x, LANDMARKS.konbiniDoorFront.y),
      facing: 'up',
    };
    const game = new Game(world, { save });
    for (let i = 0; i < 32 && game.player.areaId === 'town-main'; i++) move(game, 'up', 1);
    expect(game.player.areaId).toBe('shop-konbini-interior');

    const exit = game.area.def.portals.find((p: PortalDef) => p.id === 'konbini-exit')!;
    expect(Math.floor(game.player.x / TILE)).toBe(exit.from.x);
    for (let i = 0; i < 48 && game.player.areaId === 'shop-konbini-interior'; i++) move(game, 'down', 1);
    expect(game.player).toEqual({
      areaId: 'town-main',
      ...feetAtTile(LANDMARKS.konbiniDoorFront.x, LANDMARKS.konbiniDoorFront.y),
      facing: 'down',
    });
  });

  it('turns the former lot (51,47) into a shopping-street pocket plaza while preserving neighbors and NPCs', () => {
    const world = buildWorld();
    const town = world.areas.get('town-main')!;

    // Former lot has no solid building over (51..56, 47..52), keeps surrounding paths/alleys open
    expect(town.objects.filter(o => o.kind === 'board')).toHaveLength(1);
    expect(isSolidTile(town, 54, 52)).toBe(false);
    expect(isSolidTile(town, 54, 53)).toBe(false);
    for (let y = 47; y <= 53; y++) {
      expect(isSolidTile(town, 51, y), `west corridor (51,${y})`).toBe(false);
      expect(isSolidTile(town, 56, y), `east corridor (56,${y})`).toBe(false);
    }

    // Pocket plaza features: bench, greenery, streetlamp
    expect(town.objects.some(o => o.kind === 'bench' && o.x >= 51 && o.x < 57 && o.y >= 47 && o.y <= 53)).toBe(true);
    expect(town.objects.some(o => (o.kind === 'tree' || o.kind === 'flowerbed') && o.x >= 51 && o.x < 57 && o.y >= 47 && o.y <= 53)).toBe(true);
    expect(town.objects.some(o => o.kind === 'lamp' && o.x >= 51 && o.x < 57 && o.y >= 47 && o.y <= 53)).toBe(true);

    // Remaining 6 shopping street shops keep exact footprints and facilityIds
    const expectedShops = [
      ['greengrocer', 30], ['bookstore', 37], ['candy', 44],
      ['bakery', 58], ['cafe', 65], ['pharmacy', 72],
    ] as const;
    for (const [style, x] of expectedShops) {
      expect(town.objects.find(o => o.facilityId === `shop-${style}`)).toMatchObject({ x, y: 47, w: 6, h: 6 });
    }

    // Vending machine (50,53) and candy shopkeeper (48,53) remain reachable on y=53 plaza
    expect(findPath(town, LANDMARKS.shoppingStreet, { x: 48, y: 54 })).not.toBeNull();
    expect(findPath(town, LANDMARKS.shoppingStreet, { x: 50, y: 54 })).not.toBeNull();
  });

  it('closes only the new portal in closed variants and handles legacy saves safely', () => {
    for (const variant of [
      { ...CHILDHOOD_VARIANT, facilityStates: { 'shop-konbini': 'closed' as const } },
      { ...CHILDHOOD_VARIANT, disabledPortals: ['konbini-enter'] },
    ]) {
      const closed = buildWorld(variant);
      const town = closed.areas.get('town-main')!;
      expect(town.def.portals.some(p => p.id === 'konbini-enter')).toBe(false);
      expect(town.portalAt.get(72 * town.width + 63)).toBeUndefined();
      expect(isSolidTile(town, 63, 72)).toBe(true);
      expect(isSolidTile(town, 54, 52)).toBe(false);
    }

    const openWorld = buildWorld();
    const legacyFrontSave = parseSave({
      v: 1,
      variantId: openWorld.variant.id,
      areaId: 'town-main',
      ...feetAtTile(54, 53),
      facing: 'up',
    }, openWorld)!;
    expect({ x: legacyFrontSave.x, y: legacyFrontSave.y }).toEqual(feetAtTile(54, 53));

    const blockedByNewBuildingSave = parseSave({
      v: 1,
      variantId: openWorld.variant.id,
      areaId: 'town-main',
      ...feetAtTile(62, 69),
      facing: 'down',
    }, openWorld)!;
    expect({ x: blockedByNewBuildingSave.x, y: blockedByNewBuildingSave.y }).toEqual(
      feetAtTile(openWorld.start.x, openWorld.start.y),
    );
  });

  it('does not overlap station, rail buffer, or crossing zones', () => {
    const world = buildWorld();
    const town = world.areas.get('town-main')!;
    const konbini = town.objects.find(o => o.facilityId === 'shop-konbini')!;
    const car = town.objects.find(o => o.kind === 'car' && o.x === 67 && o.y === 71)!;

    // Station track starts at MAIN_STATION_LAYOUT.trackY (82); y>=75 belongs to y=75 sidewalk, y=76..78 arterial, y>=79 crossing/rail buffer
    expect(konbini.y + konbini.h).toBeLessThanOrEqual(73);
    expect(car.y + car.h).toBeLessThanOrEqual(72);
    expect(MAIN_STATION_LAYOUT.trackY).toBe(82);
    expect(town.objects.find(o => o.facilityId === 'station')).toMatchObject({
      x: MAIN_STATION_LAYOUT.building.x,
      y: MAIN_STATION_LAYOUT.building.y,
      w: MAIN_STATION_LAYOUT.building.w,
      h: MAIN_STATION_LAYOUT.building.h,
    });
  });
});
