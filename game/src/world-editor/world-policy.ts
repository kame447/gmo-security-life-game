import { deriveMetadata, sameFiniteNumbers } from '../editor/changes';
import { assembleEditorWorld } from '../editor/runtime';
import type { EditorArea, EditorDocument, EditorInteraction, EditorObject, EditorPortal, EditorValidationContext } from '../editor/types';
import { equal } from '../world/layouts/codec';
import { assertInteriorEdit } from './policy';
import { trustedContext, worldRailLinks } from './trusted-context';
import { assertOutdoorEdit } from './outdoor/policy';

export type AreaEditPolicy = (before: EditorDocument, after: EditorDocument, areaId: string) => void;
export type AreaEditPolicies = Readonly<Record<string, AreaEditPolicy>>;

/** Explicit non-indoor edit policies (e.g. audited outdoor areas). Indoor rooms are derived dynamically from the trusted world data. */
export const AREA_EDIT_POLICIES: AreaEditPolicies = Object.freeze({
  'town-main': (before, after, areaId) => assertOutdoorEdit(before, after, { areaId }),
});

/** Resolves an area's edit policy from the trusted world document so every indoor area is editable without a fixed area allowlist. */
export function areaEditPolicy(
  document: Pick<EditorDocument, 'areas'>,
  areaId: string,
  policies: AreaEditPolicies = AREA_EDIT_POLICIES,
): AreaEditPolicy | undefined {
  if (Object.hasOwn(policies, areaId)) return policies[areaId];
  const area = document.areas.find(candidate => candidate.id === areaId);
  return area?.kind === 'indoor' ? assertInteriorEdit : undefined;
}

/** Whether the area can be edited under the world-derived policy rules. */
export function isEditableArea(
  document: Pick<EditorDocument, 'areas'>,
  areaId: string,
  policies: AreaEditPolicies = AREA_EDIT_POLICIES,
): boolean {
  return typeof areaEditPolicy(document, areaId, policies) === 'function';
}

const fixed = (before: unknown, after: unknown, message: string) => {
  if (!equal(before, after)) throw new Error(message);
};

interface GroupedArea {
  area?: EditorArea;
  objects: EditorObject[];
  interactions: EditorInteraction[];
  portals: EditorPortal[];
}

function groupByArea(document: EditorDocument): Map<string, GroupedArea> {
  const map = new Map<string, GroupedArea>();
  const bucket = (areaId: string) => {
    let entry = map.get(areaId);
    if (!entry) { entry = { objects: [], interactions: [], portals: [] }; map.set(areaId, entry); }
    return entry;
  };
  for (const area of document.areas) bucket(area.id).area = area;
  for (const object of document.objects) bucket(object.areaId).objects.push(object);
  for (const item of document.interactions) bucket(item.areaId).interactions.push(item);
  for (const portal of document.portals) bucket(portal.areaId).portals.push(portal);
  return map;
}

function sameAreaValue(a: EditorArea | undefined, b: EditorArea | undefined, omitSurfaces = false): boolean {
  if (a === b) return true;
  if (!a || !b) return equal(a, b);
  if (sameFiniteNumbers(a.ground, b.ground)) {
    const strip = (area: EditorArea) => {
      const { ground: _, surfaces, ...rest } = area;
      return omitSurfaces ? rest : { ...rest, ...(surfaces === undefined ? {} : { surfaces }) };
    };
    return equal(strip(a), strip(b));
  }
  if (omitSurfaces) {
    const { surfaces: _a, ...ra } = a;
    const { surfaces: _b, ...rb } = b;
    return equal(ra, rb);
  }
  return equal(a, b);
}

/** The save plan is computed from complete documents, independent of the open UI area. */
export function changedAreaIds(before: EditorDocument, after: EditorDocument): string[] {
  const beforeGroups = groupByArea(before), afterGroups = groupByArea(after);
  const changed: string[] = [];
  for (const area of after.areas) {
    const b = beforeGroups.get(area.id), a = afterGroups.get(area.id)!;
    if (!equal(b?.objects ?? [], a.objects) ||
        !equal(b?.interactions ?? [], a.interactions) ||
        !equal(b?.portals ?? [], a.portals) ||
        !sameAreaValue(b?.area, a.area)) {
      changed.push(area.id);
    }
  }
  return changed.sort();
}

function assertReturnMove(before: EditorDocument, after: EditorDocument, previous: EditorPortal, next: EditorPortal) {
  if (equal(previous.to, next.to)) return;
  const facility = before.facilities.find(item => item.id === previous.facilityId);
  const destination = before.areas.find(area => area.id === previous.to.areaId);
  if (!facility || destination?.kind !== 'outdoor' || facility.areaId !== destination.id ||
      next.to.areaId !== previous.to.areaId || next.to.facing !== previous.to.facing) {
    throw new Error('屋内の到着位置と出入口の行き先は変更できません');
  }
  const dx = next.to.x - previous.to.x, dy = next.to.y - previous.to.y;
  const buildings = before.objects.filter(object => object.areaId === destination.id && object.facilityId === facility.id);
  const moved = after.objects.filter(object => object.areaId === destination.id && object.facilityId === facility.id);
  if ((!dx && !dy) || !buildings.length || buildings.length !== moved.length || buildings.some(object => {
    const candidate = moved.find(item => item.id === object.id);
    return !candidate || candidate.x - object.x !== dx || candidate.y - object.y !== dy;
  })) throw new Error('戻り先は同じ施設の建物と同じだけ動かしてください');
}

function defaultWorldContext(before: EditorDocument): EditorValidationContext {
  const world = assembleEditorWorld(before);
  return trustedContext(world, worldRailLinks(world));
}

/** before is the application's trusted document, never ChangeSet.baseDocument from a request. */
export function assertWorldEdit(before: EditorDocument, after: EditorDocument,
  context: EditorValidationContext = defaultWorldContext(before), policies: AreaEditPolicies = AREA_EDIT_POLICIES): void {
  fixed(before.schemaVersion, after.schemaVersion, '文書の形式は変更できません');
  fixed(before.id, after.id, '文書のIDは変更できません');
  fixed(before.tileSize, after.tileSize, 'マスの大きさは変更できません');
  fixed(before.facilities, after.facilities, '施設は変更できません');
  fixed(before.variant, after.variant, '年代の設定は変更できません');
  fixed(before.catalogs.sprites, after.catalogs.sprites, '見た目の参照は変更できません');
  if (!context.derived?.startPortalId) fixed(before.start, after.start, '開始位置は変更できません');
  if (!context.derived?.placedNpcEventKeys) fixed(before.catalogs.eventKeys, after.catalogs.eventKeys, '会話の参照は変更できません');
  for (const document of [before, after]) {
    const derived = deriveMetadata(document, context);
    if (derived) {
      fixed(document.start, derived.start, '開始位置は出口の戻り先から導いてください');
      fixed(document.catalogs.eventKeys, derived.eventKeys, '会話の参照は現在の対象から導いてください');
    }
  }
  if (before.areas.length !== after.areas.length ||
      before.areas.some((area, index) => !sameAreaValue(area, after.areas[index], true))) {
    const areaIdentity = (document: EditorDocument) => document.areas.map(({ surfaces: _, ...area }) => area);
    fixed(areaIdentity(before), areaIdentity(after), 'エリア・地区・大きさと地面は変更できません');
  }
  const doorIdentity = (document: EditorDocument) => document.portals.map(({ from: _, to: __, ...portal }) => portal);
  fixed(doorIdentity(before), doorIdentity(after), '出入口のIDと所属は変更できません');
  const afterPortalsById = new Map(after.portals.map(portal => [portal.id, portal]));
  for (const portal of before.portals) {
    assertReturnMove(before, after, portal, afterPortalsById.get(portal.id)!);
  }
  const beforeGroups = groupByArea(before), afterGroups = groupByArea(after);
  const changedIds: string[] = [];
  for (const area of after.areas) {
    const b = beforeGroups.get(area.id), a = afterGroups.get(area.id)!;
    const objDiff = !equal(b?.objects ?? [], a.objects);
    const interDiff = !equal(b?.interactions ?? [], a.interactions);
    const portalDiff = !equal(b?.portals ?? [], a.portals);
    const areaDiff = !sameAreaValue(b?.area, a.area);
    if (!objDiff && !interDiff && !portalDiff && !areaDiff) continue;
    // Uneditable or secondary rooms may still receive a verified return-to translation from an outdoor move.
    if (!objDiff && !interDiff && !areaDiff) {
      const strip = (portals: EditorPortal[]) => portals.map(({ to: _, ...rest }) => rest);
      if (equal(strip(b?.portals ?? []), strip(a.portals))) continue;
    }
    changedIds.push(area.id);
  }
  changedIds.sort();
  for (const areaId of changedIds) {
    const policy = areaEditPolicy(before, areaId, policies);
    if (typeof policy !== 'function') throw new Error(`このエリアは変更できません: ${areaId}`);
    policy(before, after, areaId);
  }
}
