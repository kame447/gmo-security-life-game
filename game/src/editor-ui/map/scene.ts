import type { EditorDocument, EditorEntity, EditorTable } from '../../editor/index.ts';
import type { Selection } from '../model.ts';

/** A view of existing data, without pretending the generated world is editable JSON. */
export type MapScene = Pick<EditorDocument, 'areas' | 'objects' | 'interactions' | 'portals' | 'facilities'>;
export interface Footprint { x: number; y: number; w: number; h: number }
export function selectedEntity(scene: MapScene, selection: Selection | null): EditorEntity | undefined {
  return selection ? (scene[selection.table] as EditorEntity[]).find(e => e.id === selection.id) : undefined;
}
export function footprint(scene: MapScene, selection: Selection): Footprint | null {
  const value = selectedEntity(scene, selection);
  if (!value) return null;
  if (selection.table === 'objects' || selection.table === 'interactions') {
    const r = value as EditorDocument['objects'][number];
    return { x: r.x, y: r.y, w: r.w ?? 1, h: r.h ?? 1 };
  }
  if (selection.table === 'portals') {
    const r = (value as EditorDocument['portals'][number]).from;
    return { x: r.x, y: r.y, w: r.w ?? 1, h: 1 };
  }
  if (selection.table === 'facilities') {
    const objects = scene.objects.filter(o => o.facilityId === value.id);
    if (!objects.length) return null;
    const x = Math.min(...objects.map(o => o.x)), y = Math.min(...objects.map(o => o.y));
    return { x, y, w: Math.max(...objects.map(o => o.x + o.w)) - x, h: Math.max(...objects.map(o => o.y + o.h)) - y };
  }
  return null;
}
export function hitSelection(scene: MapScene, areaId: string, x: number, y: number, preferred: Selection | null = null): Selection | null {
  const within = (r: Footprint) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  if (preferred?.table === 'facilities') {
    const f = scene.facilities.find(f => f.id === preferred.id);
    const r = footprint(scene, preferred);
    if (f?.areaId === areaId && r && within(r)) return preferred;
  }
  for (const table of ['portals', 'interactions', 'objects'] as const) {
    for (const e of scene[table]) {
      const selection = { table, id: e.id }, r = footprint(scene, selection);
      if (e.areaId === areaId && r && within(r)) return selection;
    }
  }
  return null;
}
export function sceneEntries(scene: MapScene, areaId: string): { table: EditorTable; entity: EditorEntity }[] {
  return (['areas', 'facilities', 'objects', 'interactions', 'portals'] as const).flatMap(table =>
    (scene[table] as EditorEntity[]).filter(e => 'areaId' in e ? e.areaId === areaId : e.id === areaId).map(entity => ({ table, entity })));
}
