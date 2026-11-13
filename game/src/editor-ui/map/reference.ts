import type { World } from '../../world/runtime.ts';
import type { MapScene } from './scene.ts';

/** Display-only projection: never feed this generated-world snapshot to the JSON apply pipeline. */
export function referenceScene(world: World): MapScene {
  const used = new Set<string>();
  for (const facility of world.facilities.values()) used.add(facility.id);
  for (const { def } of world.areas.values()) {
    used.add(def.id);
    for (const entity of [...def.objects, ...def.interactions, ...def.portals]) if (entity.id) used.add(entity.id);
  }
  const scene: MapScene = { areas: [], facilities: [...world.facilities.values()].map(f => ({ ...f })), objects: [], interactions: [], portals: [] };
  const entries = [...world.areas.values()].sort((a, b) => a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0);
  for (const { def } of entries) {
    scene.areas.push({ id: def.id, name: def.name, kind: def.kind, width: def.width, height: def.height, ground: Array.from(def.ground) });
    def.objects.forEach((object, index) => {
      let id = object.id;
      if (!id) {
        const prefix = `reference-${def.id}-object-${index}`;
        id = prefix;
        for (let suffix = 2; used.has(id); suffix++) id = `${prefix}-${suffix}`;
        used.add(id);
      }
      scene.objects.push({ ...object, id, areaId: def.id });
    });
    scene.interactions.push(...def.interactions.map(i => ({ ...i, areaId: def.id, lines: [...i.lines] })));
    scene.portals.push(...def.portals.map(p => ({ ...p, areaId: def.id, from: { ...p.from }, to: { ...p.to } })));
  }
  scene.facilities.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return scene;
}
