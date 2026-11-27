import type { FacilityDef } from '../core/types';
import type { EditorDocument, EditorInteraction, EditorObject, EditorPortal } from '../editor/types';
import { furnitureById } from '../render/furniture/catalog';
import { outdoorForObject } from '../render/outdoor/catalog';

export type EntityKind = 'npc' | 'object' | 'facility' | 'interaction' | 'portal';
export type EntityFilter = EntityKind | 'all';
export const ENTITY_LABELS: Record<EntityKind, string> = {
  npc: '人物', object: '配置物', facility: '施設', interaction: '調べる場所', portal: '出入口',
};
type Bounds = { x: number; y: number; w: number; h: number };
type EntrySource =
  | { kind: 'npc' | 'interaction'; entity: EditorInteraction }
  | { kind: 'object'; entity: EditorObject }
  | { kind: 'facility'; entity: FacilityDef }
  | { kind: 'portal'; entity: EditorPortal };
export type EntityListEntry = EntrySource & {
  key: string;
  id: string;
  name: string;
  bounds?: Bounds;
  objectId?: string;
};

const LEGACY_NAMES: Record<string, string> = {
  desk: '学習づくえ', lowtable: 'ローテーブル', sofa: 'ソファ', blackboard: '黒板',
  window: 'まど', tdesk: '教卓', sdesk: '机といす', shelf: 'ロッカー',
  cooler: '冷蔵ケース', magazine: '雑誌ラック', shopshelf: '商品だな', counter: 'レジカウンター',
  bookshelf: '本だな', kitchen: 'キッチン', table: 'テーブル', bench: 'ベンチ',
};

export function objectName(object: EditorObject, facilities: readonly FacilityDef[]): string {
  return facilities.find(facility => facility.id === object.facilityId)?.name
    ?? outdoorForObject(object)?.name
    ?? furnitureById(object.catalogId ?? '')?.name
    ?? LEGACY_NAMES[object.kind]
    ?? object.kind;
}

const footprint = (entry: { x: number; y: number; w?: number; h?: number }): Bounds => ({
  x: entry.x, y: entry.y, w: entry.w ?? 1, h: entry.h ?? 1,
});

/** Project only the active area's committed data; browsing never changes the document. */
export function areaEntries(document: EditorDocument, areaId: string): EntityListEntry[] {
  const objects = document.objects.filter(entry => entry.areaId === areaId);
  const portals = document.portals.filter(entry => entry.areaId === areaId);
  const interactions = document.interactions.filter(entry => entry.areaId === areaId);
  const linkedObject = (facilityId?: string) =>
    facilityId ? objects.find(object => object.facilityId === facilityId) : undefined;
  const entries: EntityListEntry[] = [];

  for (const entity of interactions.filter(entry => entry.kind === 'npc')) {
    entries.push({ kind: 'npc', key: 'npc:' + entity.id, id: entity.id,
      name: entity.name, bounds: footprint(entity), entity });
  }
  for (const entity of objects) {
    entries.push({ kind: 'object', key: 'object:' + entity.id, id: entity.id,
      name: objectName(entity, document.facilities), bounds: footprint(entity), objectId: entity.id, entity });
  }
  for (const entity of document.facilities.filter(entry => entry.areaId === areaId)) {
    const object = linkedObject(entity.id);
    const portal = portals.find(entry => entry.facilityId === entity.id);
    entries.push({ kind: 'facility', key: 'facility:' + entity.id, id: entity.id,
      name: entity.name, bounds: object ? footprint(object) : portal ? footprint(portal.from) : undefined,
      objectId: object?.id, entity });
  }
  for (const entity of interactions.filter(entry => entry.kind !== 'npc')) {
    const object = objects.find(entry => entry.id === entity.objectId);
    entries.push({ kind: 'interaction', key: 'interaction:' + entity.id, id: entity.id,
      name: entity.name, bounds: footprint(entity), objectId: object?.id, entity });
  }
  for (const entity of portals) {
    const facility = document.facilities.find(entry => entry.id === entity.facilityId);
    const destination = document.areas.find(entry => entry.id === entity.to.areaId);
    entries.push({ kind: 'portal', key: 'portal:' + entity.id, id: entity.id,
      name: facility ? facility.name + 'の出入口' : (destination?.name ?? entity.to.areaId) + 'への出入口',
      bounds: footprint(entity.from), objectId: linkedObject(entity.facilityId)?.id, entity });
  }
  return entries;
}

export function filterEntries(
  entries: readonly EntityListEntry[], kind: EntityFilter = 'all', query = '',
): EntityListEntry[] {
  const term = query.trim().toLowerCase();
  return entries.filter(entry => (kind === 'all' || entry.kind === kind)
    && (!term || entry.name.toLowerCase().includes(term) || entry.id.toLowerCase().includes(term)));
}
