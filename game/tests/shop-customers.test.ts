import { describe, expect, it } from 'vitest';
import { STORE_CONTACTS } from '../src/data/stores';
import { buildWorld, findPath, validateWorld } from '../src/world';
import { shopCustomers } from '../src/world/shop-customers';
import { TRAIN_NETWORK } from '../src/travel/network';

describe('店内の客と喫茶店の着席', () => {
  it('すべての店で買い物客を配置し、店員と通路を保つ', () => {
    const world = buildWorld();
    expect(validateWorld(world, { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
    for (const contact of STORE_CONTACTS) {
      const area = world.areas.get(contact.interiorAreaId)!;
      const customerDefs = shopCustomers(contact.catalogId);
      expect(customerDefs.length).toBeGreaterThan(0);
      const clerk = area.interactions.find(npc => npc.eventKey === contact.clerkEventKey)!;
      const entrance = [...world.areas.values()].flatMap(room => room.def.portals)
        .find(portal => portal.id === contact.entrancePortalId)!;
      for (const customer of customerDefs) {
        expect(area.interactions.some(npc => npc.id === customer.id)).toBe(true);
        expect([customer.x,customer.y]).not.toEqual([entrance.to.x,entrance.to.y]);
        expect([customer.x,customer.y]).not.toEqual([clerk.x,clerk.y]);
        const neighbors = [[1,0],[-1,0],[0,1],[0,-1]];
        expect(neighbors.some(([dx,dy]) => findPath(area, entrance.to, { x: customer.x + dx, y: customer.y + dy }) !== null), customer.id).toBe(true);
        const furniture = area.objects.filter(o => o.solid && customer.x >= o.x && customer.x < o.x + o.w && customer.y >= o.y && customer.y < o.y + o.h);
        if (contact.catalogId === 'cafe') {
          expect(customer.sprite).toMatch(/-seated$/);
          expect(furniture).toHaveLength(1);
          expect(furniture[0]).toMatchObject({ kind:'cafe-chair', facing:customer.facing, layer:'decal' });
        } else {
          expect(furniture).toEqual([]);
          const [dx,dy] = ({ up:[0,-1],down:[0,1],left:[-1,0],right:[1,0] } as Record<string,number[]>)[customer.facing!];
          const x=customer.x+dx,y=customer.y+dy;
          expect(area.objects.some(o => o.solid && x >= o.x && x < o.x+o.w && y >= o.y && y < o.y+o.h), customer.id).toBe(true);
        }
      }
    }
  });
});
