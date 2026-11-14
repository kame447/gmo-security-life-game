import { withDerived } from '../editor/changes';
import { assembleEditorWorld } from '../editor/runtime';
import type { EditorDocument, EditorPortal, EditorValidationContext } from '../editor/types';
import { equal } from '../world/layouts/codec';
import { assertInteriorEdit } from './policy';
import { trustedContext } from './trusted-context';

export type AreaEditPolicy = (before: EditorDocument, after: EditorDocument, areaId: string) => void;
export type AreaEditPolicies = Readonly<Record<string, AreaEditPolicy>>;

/** Application-owned registry. Outdoor editing is registered by U4, never by a save request. */
export const AREA_EDIT_POLICIES: AreaEditPolicies = Object.freeze({
  'home-family-interior': assertInteriorEdit,
});

const fixed = (before: unknown, after: unknown, message: string) => {
  if (!equal(before, after)) throw new Error(message);
};

function local(document: EditorDocument, areaId: string, omitReturn = false) {
  return {
    area: document.areas.find(area => area.id === areaId),
    objects: document.objects.filter(object => object.areaId === areaId),
    interactions: document.interactions.filter(item => item.areaId === areaId),
    portals: document.portals.filter(portal => portal.areaId === areaId)
      .map(portal => omitReturn ? (({ to: _, ...rest }) => rest)(portal) : portal),
  };
}

/** The save plan is computed from complete documents, independent of the open UI area. */
export function changedAreaIds(before: EditorDocument, after: EditorDocument): string[] {
  return after.areas.filter(area => !equal(local(before, area.id), local(after, area.id)))
    .map(area => area.id).sort();
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

/** before is the application's trusted document, never ChangeSet.baseDocument from a request. */
export function assertWorldEdit(before: EditorDocument, after: EditorDocument,
  context: EditorValidationContext = trustedContext(assembleEditorWorld(before)), policies: AreaEditPolicies = AREA_EDIT_POLICIES): void {
  fixed(before.schemaVersion, after.schemaVersion, '文書の形式は変更できません');
  fixed(before.id, after.id, '文書のIDは変更できません');
  fixed(before.tileSize, after.tileSize, 'マスの大きさは変更できません');
  fixed(before.facilities, after.facilities, '施設は変更できません');
  fixed(before.variant, after.variant, '年代の設定は変更できません');
  fixed(before.catalogs.sprites, after.catalogs.sprites, '見た目の参照は変更できません');
  if (!context.derived?.startPortalId) fixed(before.start, after.start, '開始位置は変更できません');
  if (!context.derived?.placedNpcEventKeys) fixed(before.catalogs.eventKeys, after.catalogs.eventKeys, '会話の参照は変更できません');
  for (const document of [before, after]) {
    const derived = withDerived(document, context);
    fixed(document.start, derived.start, '開始位置は出口の戻り先から導いてください');
    fixed(document.catalogs.eventKeys, derived.catalogs.eventKeys, '会話の参照は現在の対象から導いてください');
  }
  const areaIdentity = (document: EditorDocument) => document.areas.map(({ surfaces: _, ...area }) => area);
  fixed(areaIdentity(before), areaIdentity(after), 'エリア・地区・大きさと地面は変更できません');
  const doorIdentity = (document: EditorDocument) => document.portals.map(({ from: _, to: __, ...portal }) => portal);
  fixed(doorIdentity(before), doorIdentity(after), '出入口のIDと所属は変更できません');
  for (const portal of before.portals) {
    assertReturnMove(before, after, portal, after.portals.find(candidate => candidate.id === portal.id)!);
  }
  for (const areaId of changedAreaIds(before, after)) {
    // An unregistered room may receive only a verified return-to translation.
    if (equal(local(before, areaId, true), local(after, areaId, true))) continue;
    const policy = Object.hasOwn(policies, areaId) ? policies[areaId] : undefined;
    if (typeof policy !== 'function') throw new Error(`このエリアは変更できません: ${areaId}`);
    policy(before, after, areaId);
  }
}
