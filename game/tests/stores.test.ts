import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../src/app/loop';
import { feetAtTile, type Facing } from '../src/core/coords';
import type { AreaDef, MapEvent } from '../src/core/types';
import { STORE_CONTACTS, storeForClerk, type StoreContact } from '../src/data/stores';
import { canStand, HITBOX, RUN_SPEED } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { validateStoreContacts, type StoreProblemCode } from '../src/stores/validate';
import { buildWorld, findPath, validateWorld, type World } from '../src/world';
import { toRuntime } from '../src/world/runtime';
import { SHOP_INTERIORS } from '../src/world/shops';
import { buildStoreFixtureWorld, STORE_INVENTORY } from './fixtures/stores';

const contact: StoreContact = { storeId: 'test-store', interiorAreaId: 'test-room',
  entrancePortalId: 'test-enter', clerkEventKey: 'test.clerk', catalogId: 'test-catalog' };

function fakeWorld(edit?: (areas: AreaDef[]) => void): World {
  const area = (id: string, kind: AreaDef['kind']): AreaDef => ({ id, name: id, kind,
    width: 8, height: 8, ground: new Uint8Array(64), objects: [], interactions: [], portals: [] });
  const outside = area('test-outside', 'outdoor'), indoor = area('test-room', 'indoor');
  outside.portals.push({ id: 'test-enter', from: { x: 2, y: 2 },
    to: { areaId: indoor.id, x: 3, y: 3, facing: 'up' } });
  indoor.portals.push({ id: 'test-exit', from: { x: 3, y: 6 },
    to: { areaId: outside.id, x: 2, y: 3, facing: 'down' } });
  indoor.interactions.push({ id: 'test-clerk', kind: 'npc', name: 'テスト店員',
    x: 5, y: 2, solid: true, eventKey: contact.clerkEventKey, lines: ['テスト用の会話。'] });
  const areas = [outside, indoor, area('test-other-outside', 'outdoor')];
  edit?.(areas);
  return { areas: new Map(areas.map(def => [def.id, toRuntime(def)])), facilities: new Map(),
    start: { areaId: outside.id, x: 2, y: 3, facing: 'up' }, variant: { id: 'test', stage: 'childhood' } };
}

describe('UI-independent store connection validation', () => {
  it('accepts all seven store contracts without changing the composed world or records', () => {
    const world = buildStoreFixtureWorld(), before = structuredClone(world), records = structuredClone(STORE_CONTACTS);
    expect(validateStoreContacts(world, STORE_CONTACTS)).toEqual([]);
    expect(world).toEqual(before);
    expect(STORE_CONTACTS).toEqual(records);
  });

  it('accepts a fabricated world without any real map or catalogue', () => {
    expect(validateStoreContacts(fakeWorld(), [contact])).toEqual([]);
    expect(validateStoreContacts(fakeWorld(), [])).toEqual([]);
  });

  const invalidCases: [string, (areas: AreaDef[]) => void, StoreProblemCode][] = [
    ['missing interior', areas => { areas.splice(1, 1); }, 'missing-interior'],
    ['outdoor used as interior', areas => { areas[1].kind = 'outdoor'; }, 'not-indoor'],
    ['missing entrance', areas => { areas[0].portals = []; }, 'missing-entrance'],
    ['duplicate entrance ID', areas => { areas[2].portals.push(structuredClone(areas[0].portals[0])); }, 'ambiguous-entrance'],
    ['entrance starts indoors', areas => { areas[1].portals.push(areas[0].portals.pop()!); }, 'invalid-entrance'],
    ['entrance leads elsewhere', areas => { areas[0].portals[0].to.areaId = areas[2].id; }, 'invalid-entrance'],
    ['missing return', areas => { areas[1].portals = []; }, 'missing-return'],
    ['return to different outdoor area', areas => { areas[1].portals[0].to.areaId = areas[2].id; }, 'missing-return'],
    ['clerk key only outdoors', areas => { areas[0].interactions.push(areas[1].interactions.pop()!); }, 'missing-clerk'],
    ['duplicate clerk event in room', areas => { areas[1].interactions.push({ ...areas[1].interactions[0], id: 'another-clerk', x: 6 }); }, 'ambiguous-clerk'],
    ['shelf used as clerk', areas => { areas[1].interactions[0].kind = 'object'; }, 'not-npc'],
  ];
  it.each(invalidCases)('reports %s using test-only definitions', (_name, edit, code) => {
    expect(validateStoreContacts(fakeWorld(edit), [contact])).toContainEqual({ storeId: contact.storeId, code });
  });

  it('detects a duplicate store ID independently of its clerk combination', () => {
    const duplicate = { ...contact, clerkEventKey: 'another.clerk' };
    expect(validateStoreContacts(fakeWorld(), [contact, duplicate])).toContainEqual({ storeId: contact.storeId, code: 'duplicate-store' });
  });

  it('detects duplicate area + clerk keys even with different store IDs', () => {
    const other = { ...contact, storeId: 'other-store' };
    expect(validateStoreContacts(fakeWorld(), [contact, other])).toEqual([{ storeId: other.storeId, code: 'duplicate-clerk-contact' }]);
  });

  it('looks up only the registered indoor clerk contact, never outdoor or shelves', () => {
    expect(storeForClerk('shop-konbini-interior', 'shopping.konbini.clerk')).toBe(STORE_CONTACTS[0]);
    for (const [area, key] of [['town-main', 'shopping.candy'], ['town-main', 'shopping.vending'],
      ['shop-konbini-interior', 'shopping.konbini.snacks'], ['town-main', 'shopping.konbini.clerk']]) {
      expect(storeForClerk(area, key)).toBeUndefined();
    }
  });
});

describe('named store inventory in the module composition', () => {
  const world = buildStoreFixtureWorld(), town = world.areas.get('town-main')!;

  it('lists every shop building, including the cafe exterior without a facility', () => {
    expect(town.objects.filter(item => item.kind === 'shop').map(item => item.id).sort())
      .toEqual(STORE_INVENTORY.map(item => item.objectId).sort());
    // This prefix describes current FACILITIES data, not a naming rule for new stores.
    expect([...world.facilities.keys()].filter(id => id.startsWith('shop-')).sort())
      .toEqual(STORE_INVENTORY.flatMap(item => item.facilityId ? [item.facilityId] : []).sort());
  });

  it.each(STORE_INVENTORY)('preserves $objectId and its current classification', entry => {
    const building = town.objects.find(item => item.id === entry.objectId);
    expect(building, 'Building renamed/deleted: review stores.md and the inventory fixture').toBeDefined();
    expect(building).toMatchObject({ kind: 'shop', style: entry.style });
    expect(building!.facilityId).toBe(entry.facilityId);
    const facility = entry.facilityId ? world.facilities.get(entry.facilityId) : undefined;
    expect(facility?.name).toBe(entry.name);
    if (entry.facilityId) expect(facility?.areaId).toBe(town.def.id);
    const records = STORE_CONTACTS.filter(store => store.storeId === entry.facilityId);
    const entrances = town.def.portals.filter(portal => portal.facilityId && portal.facilityId === entry.facilityId);
    if (entry.status === 'connected') {
      expect(facility?.interior).toBe('full');
      expect(records).toHaveLength(1);
      expect(entrances.map(portal => portal.id)).toContain(records[0].entrancePortalId);
      expect(validateStoreContacts(world, records)).toEqual([]);
    } else {
      expect(facility?.interior, 'Interior added: review classification and add a StoreContact').not.toBe('full');
      expect(entrances, 'Entrance added: review classification and add a StoreContact').toEqual([]);
      expect(records).toEqual([]);
    }
  });

  it('classifies every contract as an inventoried connected store', () => {
    expect(STORE_CONTACTS.map(store => store.storeId).sort()).toEqual(STORE_INVENTORY
      .filter(entry => entry.status === 'connected').map(entry => entry.facilityId).sort());
  });
});

type TileRect = { x: number; y: number; w?: number; h?: number };

/** Find a real walking route to any edge of a display, table or NPC. */
function approach(game: Game, target: TileRect): { x: number; y: number; facing: Facing } {
  const from = { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) };
  for (let dy = 0; dy < (target.h ?? 1); dy++) for (let dx = 0; dx < (target.w ?? 1); dx++) {
    const x = target.x + dx, y = target.y + dy;
    const choices: { x: number; y: number; facing: Facing }[] = [
      { x, y: y + 1, facing: 'up' }, { x: x - 1, y, facing: 'right' },
      { x, y: y - 1, facing: 'down' }, { x: x + 1, y, facing: 'left' },
    ];
    const result = choices.find(tile => findPath(game.area, from, tile));
    if (result) return result;
  }
  throw new Error(`Unreachable object in ${game.player.areaId}: ${JSON.stringify(target)}`);
}

describe('six store modules: movement, displays, greetings and save/resume', () => {
  it('connects every named store and keeps the unidentified cafe outside the contract', () => {
    const world = buildStoreFixtureWorld();
    expect(validateWorld(world)).toEqual([]);
    expect(validateStoreContacts(world, STORE_CONTACTS)).toEqual([]);
    expect(STORE_CONTACTS).toHaveLength(7);
    expect(world.areas.get('town-main')!.objects.find(item => item.id === 'town-shop-60-59')?.facilityId).toBeUndefined();
  });

  it.each(SHOP_INTERIORS)('walks into $name, reaches its displays and clerk, saves inside and returns', definition => {
    const world = buildStoreFixtureWorld(), game = new Game(world), events: MapEvent[] = [];
    const store = STORE_CONTACTS.find(item => item.storeId === `shop-${definition.id}`)!;
    game.on(event => events.push(event));
    game.setAppearance({ ...game.appearance, hairColor: 'black', outfit: 'shirt', outfitColor: 'green' });
    const entrance = game.area.def.portals.find(portal => portal.id === store.entrancePortalId)!;
    walkToTile(game, entrance.from);
    expect(game.player).toEqual({ areaId: store.interiorAreaId, ...feetAtTile(entrance.to.x, entrance.to.y), facing: 'up' });
    const indoor = game.area;

    for (const display of indoor.interactions.filter(item => item.kind === 'object')) {
      const tile = approach(game, display);
      walkToTile(game, tile);
      game.player.facing = tile.facing;
      expect(game.facingInteraction()).toBe(display);
      game.action();
      expect(game.dialog).toMatchObject({ speaker: display.name, lines: display.lines });
      for (let i = 0; i < display.lines.length; i++) game.action();
      expect(game.dialog).toBeNull();
    }

    const clerk = indoor.interactions.find(item => item.kind === 'npc' && item.eventKey === store.clerkEventKey)!;
    const tile = approach(game, clerk);
    walkToTile(game, tile);
    game.player.facing = tile.facing;
    expect(storeForClerk(indoor.def.id, clerk.eventKey)).toBe(store);
    expect(storeForClerk('town-main', clerk.eventKey)).toBeUndefined();
    const before = { ...game.player }, save = JSON.parse(JSON.stringify(game.serialize()));
    const resumed = new Game(world, { save });
    expect(resumed.player).toEqual(before);
    expect(resumed.appearance).toEqual(game.appearance);
    expect(resumed.facingInteraction()?.eventKey).toBe(store.clerkEventKey);
    game.action();
    expect(game.dialog).toMatchObject({ speaker: clerk.name, lines: clerk.lines });
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      for (let frame = 0; frame < 40; frame++) game.update(FIXED_STEP, { dir, run: true });
      expect(game.player).toEqual(before);
    }
    for (let i = 0; i < clerk.lines.length; i++) game.action();
    expect(game.dialog).toBeNull();
    expect(game.player).toEqual(before);
    const exit = indoor.def.portals[0];
    walkToTile(game, exit.from);
    expect(game.player).toEqual({ areaId: 'town-main', ...feetAtTile(exit.to.x, exit.to.y), facing: 'down' });
    expect(exit.to).toMatchObject({ x: entrance.from.x, y: entrance.from.y + 1 });
    expect(events.filter(event => event.type === 'portal').map(event => event.portalId)).toEqual([entrance.id, exit.id]);
    expect(events).toContainEqual({ type: 'interact', areaId: indoor.def.id, interactionId: clerk.id, eventKey: store.clerkEventKey });
    const returned = new Game(world, { save: JSON.parse(JSON.stringify(game.serialize())) });
    expect(returned.player).toEqual(game.player);
    expect(returned.appearance).toEqual(game.appearance);
  });

  it.each(SHOP_INTERIORS)('stops real movement at every solid furnishing in $name', definition => {
    const world = buildStoreFixtureWorld(), game = new Game(world);
    const entry = world.areas.get('town-main')!.def.portals.find(portal => portal.id === `${definition.id}-enter`)!;
    walkToTile(game, entry.from);
    const area = game.area;
    for (const item of area.objects.filter(object => object.solid)) {
      const tile = approach(game, item);
      walkToTile(game, tile);
      game.update(0.6, { dir: tile.facing, run: true });
      const stopped = { ...game.player };
      expect(stopped.areaId).toBe(area.def.id);
      expect(canStand(area, stopped.x, stopped.y)).toBe(true);
      if (tile.facing === 'up') expect(stopped.y).toBeCloseTo((item.y + item.h) * 16 + HITBOX.h, 7);
      if (tile.facing === 'down') expect(stopped.y).toBeCloseTo(item.y * 16, 7);
      if (tile.facing === 'left') expect(stopped.x).toBeCloseTo((item.x + item.w) * 16 + HITBOX.halfW, 7);
      if (tile.facing === 'right') expect(stopped.x).toBeCloseTo(item.x * 16 - HITBOX.halfW, 7);
      game.update(0.6, { dir: tile.facing, run: true });
      expect(game.player).toEqual(stopped);
    }
  });
});

/** Follow BFS tiles via the real movement/collision/portal code, without teleporting. */
function walkToTile(game: Game, target: { x: number; y: number }): void {
  const areaId = game.player.areaId;
  const route = findPath(game.area, { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) }, target);
  expect(route, `No route in ${areaId} to ${JSON.stringify(target)}`).not.toBeNull();
  for (const tile of route!.slice(1)) {
    const center = feetAtTile(tile.x, tile.y);
    for (const axis of ['x', 'y'] as const) {
      const delta = center[axis] - game.player[axis];
      if (Math.abs(delta) < 1e-6) continue;
      const dir: Facing = axis === 'x' ? (delta > 0 ? 'right' : 'left') : (delta > 0 ? 'down' : 'up');
      game.update(Math.abs(delta) / RUN_SPEED, { dir, run: true });
      if (game.player.areaId !== areaId) return;
      expect(game.player[axis]).toBeCloseTo(center[axis], 7);
    }
  }
}

describe('existing konbini round trip', () => {
  it('walks from outdoors to the clerk, talks without movement, and returns through the exit', () => {
    const world = buildWorld(), store = STORE_CONTACTS[0], game = new Game(world), events: MapEvent[] = [];
    game.on(event => events.push(event));
    const town = game.area;
    const entrance = town.def.portals.find(portal => portal.id === store.entrancePortalId)!;
    walkToTile(game, entrance.from);
    expect(game.player.areaId).toBe(store.interiorAreaId);
    const indoor = game.area;
    const clerk = indoor.interactions.find(item => item.eventKey === store.clerkEventKey)!;
    const approaches: { x: number; y: number; facing: Facing }[] = [
      { x: clerk.x, y: clerk.y + 1, facing: 'up' }, { x: clerk.x - 1, y: clerk.y, facing: 'right' },
      { x: clerk.x, y: clerk.y - 1, facing: 'down' }, { x: clerk.x + 1, y: clerk.y, facing: 'left' },
    ];
    const approach = approaches.find(tile => findPath(indoor, entrance.to, tile));
    expect(approach).toBeDefined();
    walkToTile(game, approach!);
    game.player.facing = approach!.facing;
    expect(game.facingInteraction()).toBe(clerk);
    const beforeTalking = { ...game.player };
    game.action();
    expect(game.dialog).toMatchObject({ speaker: clerk.name, lines: clerk.lines });
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      for (let frame = 0; frame < 40; frame++) game.update(FIXED_STEP, { dir, run: true });
      expect(game.player).toEqual(beforeTalking);
    }
    for (let line = 0; line < clerk.lines.length; line++) game.action();
    expect(game.dialog).toBeNull();
    const exit = indoor.def.portals.find(portal => portal.to.areaId === town.def.id)!;
    walkToTile(game, exit.from);
    expect(game.player).toEqual({ areaId: town.def.id, ...feetAtTile(exit.to.x, exit.to.y), facing: exit.to.facing });
    expect(exit.to).toMatchObject({ x: entrance.from.x, y: entrance.from.y + 1, facing: 'down' });
    expect(events.filter(event => event.type === 'portal')).toEqual([
      { type: 'portal', portalId: entrance.id, fromAreaId: town.def.id, toAreaId: indoor.def.id, facilityId: 'shop-konbini' },
      { type: 'portal', portalId: exit.id, fromAreaId: indoor.def.id, toAreaId: town.def.id, facilityId: 'shop-konbini' },
    ]);
    expect(events).toContainEqual({ type: 'interact', areaId: indoor.def.id, interactionId: clerk.id, eventKey: store.clerkEventKey });
    expect(new Game(world, { save: game.serialize() }).player).toEqual(game.player);
  });
});
