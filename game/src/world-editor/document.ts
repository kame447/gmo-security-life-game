import type { World } from '../world/runtime';
import { areaLayout } from '../world/layouts';
import { initialLayout, type AreaLayout } from '../world/layouts/codec';
import type { EditorDocument } from '../editor/types';
import { EDITABLE_PEOPLE } from './npc';

/** Trusted application snapshot. Rendering reference projections are never save data. */
export function worldDocument(world: World): EditorDocument {
  const layouts = new Map([...world.areas].map(([id, a]) => [id, areaLayout(id) ?? initialLayout(a.def, 'AreaFactory')]));
  return { schemaVersion: 1, id: 'world-layout-editor', tileSize: 16,
    start: { ...world.start }, variant: structuredClone(world.variant),
    catalogs: { sprites: [...new Set([...EDITABLE_PEOPLE.map(person => person.id),
      ...[...world.areas.values()].flatMap(a => a.interactions.flatMap(i => i.sprite ? [i.sprite] : []))])].sort(),
      eventKeys: [...new Set([...world.areas.values()].flatMap(a => a.interactions.map(i => i.eventKey)))].sort() },
    areas: [...world.areas.values()].map(({ def: a }) => ({ id: a.id, name: a.name, kind: a.kind, width: a.width, height: a.height,
      ground: Array.from(a.ground), ...(a.districts ? { districts: structuredClone(a.districts) } : {}),
      ...(a.surfaces ? { surfaces: { palette: [...a.surfaces.palette], cells: Array.from(a.surfaces.cells) } } : {}) })),
    facilities: structuredClone([...world.facilities.values()]),
    objects: [...world.areas.values()].flatMap(({ def }) => def.objects.map(o => {
      if (!o.id) throw new Error(`Missing source object ID in ${def.id}`);
      return { ...structuredClone(o), id: o.id, areaId: def.id };
    })),
    interactions: [...world.areas.values()].flatMap(({ def }) => def.interactions.map(i => ({ ...structuredClone(i), areaId: def.id,
      ...(layouts.get(def.id)?.interactions.find(j => j.id === i.id)?.objectId ? {
        objectId: layouts.get(def.id)!.interactions.find(j => j.id === i.id)!.objectId } : {}) }))),
    portals: [...world.areas.values()].flatMap(({ def }) => def.portals.map(p => ({ ...structuredClone(p), areaId: def.id }))),
  };
}
export function documentLayout(document: EditorDocument, source: AreaLayout): AreaLayout {
  const area = document.areas.find(a => a.id === source.areaId)!;
  return { schemaVersion: 1, areaId: source.areaId, source: structuredClone(source.source),
    area: { name: area.name, kind: area.kind, width: area.width, height: area.height, ground: [...area.ground],
      ...(area.surfaces ? { surfaces: structuredClone(area.surfaces) } : {}) },
    objects: document.objects.filter(o => o.areaId === source.areaId).map(({ areaId: _, ...o }) => o),
    interactions: document.interactions.filter(i => i.areaId === source.areaId).map(({ areaId: _, ...i }) => i),
    portals: document.portals.filter(p => p.areaId === source.areaId).map(({ areaId: _, returnPortalId: __, ...p }) => p) };
}
