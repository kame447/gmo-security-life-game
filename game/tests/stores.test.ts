import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../src/app/loop';
import { feetAtTile, type Facing } from '../src/core/coords';
import type { AreaDef, MapEvent } from '../src/core/types';
import { STORE_CONTACTS, storeForClerk, type StoreContact } from '../src/data/stores';
import { RUN_SPEED } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { validateStoreContacts, type StoreProblemCode } from '../src/stores/validate';
import { buildWorld, findPath, type World } from '../src/world';
import { toRuntime } from '../src/world/runtime';
import { STORE_INVENTORY } from './fixtures/stores';

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
  it('accepts the existing konbini contract without changing the world or records', () => {
    const world = buildWorld(), before = structuredClone(world), records = structuredClone(STORE_CONTACTS);
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

describe('current store inventory (facts, not future ID decisions)', () => {
  const world = buildWorld(), town = world.areas.get('town-main')!;

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
