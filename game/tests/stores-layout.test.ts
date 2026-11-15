import { describe, expect, it } from 'vitest';
import { STORE_CONTACTS } from '../src/data/stores';
import { buildWorld } from '../src/world';
import { isSolidTile, neighbors, type AreaRuntime, type Point } from '../src/world/runtime';
import { validateWorld } from '../src/world/validate';

const pointKey = (p: Point) => `${p.x},${p.y}`;

function touchesAny(tiles: Set<string>, rect: { x: number; y: number; w?: number; h?: number }): boolean {
  const w = rect.w ?? 1;
  const h = rect.h ?? 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      for (const n of neighbors({ x: rect.x + dx, y: rect.y + dy })) {
        if (tiles.has(pointKey(n))) return true;
      }
    }
  }
  return false;
}

function analyzeCustomerCirculation(area: AreaRuntime) {
  const portal = area.def.portals[0];
  const portalSet = new Set<string>();
  for (let dx = 0; dx < (portal.from.w ?? 1); dx++) {
    portalSet.add(`${portal.from.x + dx},${portal.from.y}`);
  }
  const start: Point = { x: portal.from.x, y: portal.from.y - 1 };

  const reachable = new Map<string, Point>();
  const queue: Point[] = [];
  if (!isSolidTile(area, start.x, start.y)) {
    reachable.set(pointKey(start), start);
    queue.push(start);
  }
  for (let i = 0; i < queue.length; i++) {
    for (const next of neighbors(queue[i])) {
      const k = pointKey(next);
      if (reachable.has(k) || portalSet.has(k) || isSolidTile(area, next.x, next.y)) continue;
      reachable.set(k, next);
      queue.push(next);
    }
  }

  const adj = new Map<string, string[]>();
  for (const [k, p] of reachable) {
    adj.set(k, neighbors(p).map(pointKey).filter(nk => reachable.has(nk)));
  }

  const core = new Set(reachable.keys());
  const degree = new Map([...adj].map(([k, ns]) => [k, ns.length]));
  const peelQueue = [...core].filter(k => (degree.get(k) ?? 0) <= 1);
  const peeled = new Set<string>();
  for (let i = 0; i < peelQueue.length; i++) {
    const k = peelQueue[i];
    if (peeled.has(k)) continue;
    peeled.add(k);
    core.delete(k);
    for (const nk of adj.get(k) ?? []) {
      if (peeled.has(nk)) continue;
      const nextDeg = (degree.get(nk) ?? 0) - 1;
      degree.set(nk, nextDeg);
      if (nextDeg <= 1) peelQueue.push(nk);
    }
  }

  const spurs: Point[][] = [];
  const seenSpur = new Set<string>();
  for (const k of peeled) {
    if (seenSpur.has(k)) continue;
    const comp: Point[] = [];
    const stack = [k];
    seenSpur.add(k);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      comp.push(reachable.get(cur)!);
      for (const nk of adj.get(cur) ?? []) {
        if (!peeled.has(nk) || seenSpur.has(nk)) continue;
        seenSpur.add(nk);
        stack.push(nk);
      }
    }
    spurs.push(comp);
  }

  return { reachable, core, spurs };
}

describe('store layout circulation and alignment', () => {
  it('validates world connectivity across all seven stores', () => {
    const world = buildWorld();
    expect(validateWorld(world)).toEqual([]);
    for (const contact of STORE_CONTACTS) {
      expect(world.areas.has(contact.interiorAreaId)).toBe(true);
    }
  });

  it('leaves at most one short customer-side dead end in greengrocer with full loop access and no sprite overlap', () => {
    const world = buildWorld();
    const area = world.areas.get('shop-greengrocer-interior')!;
    const { core, spurs } = analyzeCustomerCirculation(area);

    const corridors = spurs.filter(s => s.length >= 2);
    expect(corridors).toHaveLength(1);
    expect(corridors[0]).toHaveLength(3);
    expect(corridors[0].every(p => p.x <= 3 && p.y === 6)).toBe(true);
    expect(spurs.flat().some(p => p.x >= 12)).toBe(false);

    for (const interaction of area.interactions) {
      expect(touchesAny(core, interaction), interaction.id).toBe(true);
    }
    expect(touchesAny(core, area.def.portals[0].from)).toBe(true);

    const byId = new Map(area.objects.filter(o => o.id).map(o => [o.id!, o]));
    for (const id of ['cooler', 'vegetables', 'baskets', 'crates', 'fruit']) {
      const obj = byId.get(`shop-greengrocer-interior-${id}`);
      expect(obj, id).toBeDefined();
      const match = area.interactions.find(i => i.id === `shop-greengrocer-interior-${id}-inspect`);
      expect(match, `interaction for ${id}`).toMatchObject({
        x: obj!.x,
        y: obj!.y,
        w: obj!.w,
        h: obj!.h,
        eventKey: `shopping.greengrocer.${id}`,
      });
    }
    expect(area.interactions.find(i => i.id === 'greengrocer-indoor-clerk')).toMatchObject({
      eventKey: 'shopping.greengrocer.clerk',
    });

    const crates = byId.get('shop-greengrocer-interior-crates')!;
    const fruit = byId.get('shop-greengrocer-interior-fruit')!;
    expect(fruit).toMatchObject({ kind: 'greengrocer-fruit-table', x: 12, y: 6, w: 3, h: 2 });
    expect(fruit.y).toBe(crates.y + crates.h);
  });
});
