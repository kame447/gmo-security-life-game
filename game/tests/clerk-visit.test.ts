import { describe, expect, it } from 'vitest';
import type { InteractionDef } from '../src/core/types';
import { SHOP_CATALOGS } from '../src/data/shop-catalogs';
import { STORE_CONTACTS } from '../src/data/stores';
import { clerkVisit } from '../src/shop/clerk-visit';
import { buildWorld } from '../src/world';

describe('store and clerk event contract', () => {
  it('uses the existing indoor clerk name/lines without modifying the NPC definition', () => {
    const world = buildWorld(); const area = world.areas.get('shop-konbini-interior')!;
    const clerk = area.interactions.find(item => item.eventKey === 'shopping.konbini.clerk')!;
    const visit = clerkVisit(area.def, clerk)!;
    expect(visit.store.storeId).toBe('shop-konbini'); expect(visit.greeting.speaker).toBe(clerk.name);
    expect(visit.greeting.lines).toBe(clerk.lines);
    expect(world.areas.get('town-main')!.def.portals.some(portal => portal.id === visit.store.entrancePortalId)).toBe(true);
  });
  it('does not open shopping for a shelf, an outdoor service, a wrong room or an unknown key', () => {
    const world = buildWorld();
    for (const area of world.areas.values()) for (const item of area.interactions) {
      if (item.eventKey !== 'shopping.konbini.clerk') expect(clerkVisit(area.def, item)).toBeUndefined();
    }
    const clerk = world.areas.get('shop-konbini-interior')!.interactions[0];
    expect(clerkVisit({ id: 'town-main', kind: 'outdoor' }, clerk)).toBeUndefined();
    expect(clerkVisit({ id: 'other-interior', kind: 'indoor' }, clerk)).toBeUndefined();
    expect(clerkVisit({ id: 'shop-konbini-interior', kind: 'indoor' }, undefined)).toBeUndefined();
  });
  it('allows a test-only indoor clerk contract without adding any world or NPC data', () => {
    const target: InteractionDef = { id: 'fixture-clerk', kind: 'npc', name: '仮の店員', x: 1, y: 1, solid: true,
      eventKey: 'test.shopping.clerk', lines: ['テスト用の仮会話です。'] };
    const stores = [{ ...STORE_CONTACTS[0], storeId: 'fixture-store', interiorAreaId: 'fixture-interior', clerkEventKey: target.eventKey }];
    const visit = clerkVisit({ id: 'fixture-interior', kind: 'indoor' }, target, stores, SHOP_CATALOGS)!;
    expect(visit.greeting.lines).toEqual(target.lines);
    expect(clerkVisit({ id: 'fixture-interior', kind: 'outdoor' }, target, stores)).toBeUndefined();
  });
});
