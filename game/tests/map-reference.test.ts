import { describe, expect, it } from 'vitest';
import { buildWorld } from '../src/world';
import { referenceScene } from '../src/editor-ui/map/reference.ts';

describe('read-only map reference projection', () => {
  it('preserves all areas, facilities and geometry with detached arrays and tile data', () => {
    const world = buildWorld(), before = structuredClone(world), scene = referenceScene(world);
    expect(scene.areas).toHaveLength(world.areas.size);
    expect(scene.facilities).toHaveLength(world.facilities.size);
    for (const area of scene.areas) {
      const original = world.areas.get(area.id)!.def;
      expect(area.ground).toEqual(Array.from(original.ground));
      expect(scene.objects.filter(o => o.areaId === area.id)).toHaveLength(original.objects.length);
      expect(scene.interactions.filter(i => i.areaId === area.id)).toHaveLength(original.interactions.length);
      expect(scene.portals.filter(p => p.areaId === area.id)).toHaveLength(original.portals.length);
    }
    scene.areas[0].ground[0] = 255;
    scene.objects[0].x = 999;
    scene.interactions[0].lines.push('reference only');
    scene.portals[0].from.x = 999; scene.portals[0].to.x = 999;
    scene.facilities[0].name = 'reference only';
    expect(world).toEqual(before);
    expect(referenceScene(world)).toEqual(referenceScene(buildWorld()));
  });
  it('assigns deterministic display IDs to anonymous objects without collisions or source mutations', () => {
    const world = buildWorld(), area = world.areas.get('town-main')!;
    delete area.def.objects[0].id;
    const collision = 'reference-town-main-object-0';
    area.def.objects.push({ ...area.def.objects[1], id: collision });
    const first = referenceScene(world), second = referenceScene(world);
    const objects = first.objects.filter(o => o.areaId === area.def.id);
    expect(objects[0].id).toBe(`${collision}-2`);
    expect(new Set(objects.map(o => o.id)).size).toBe(objects.length);
    expect(first).toEqual(second);
    expect(area.def.objects[0].id).toBeUndefined();
  });
  it('stabilizes area order without sorting the source Map or adopting an editable document identity', () => {
    const world = buildWorld(), sourceOrder = [...world.areas.keys()];
    const projected = referenceScene(world);
    expect(projected.areas.map(a => a.id)).toEqual([...sourceOrder].sort());
    expect([...world.areas.keys()]).toEqual(sourceOrder);
    expect(projected).not.toHaveProperty('schemaVersion');
    expect(projected).not.toHaveProperty('start');
    expect(projected).not.toHaveProperty('catalogs');
  });
});
