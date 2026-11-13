import { applyChangeSet, createChangeSet, EditorValidationError, type EditOperation, type EditorDocument, type EditorEntity, type EditorTable, type ValidationIssue } from '../../editor/index.ts';
import { operationFromForm, type Draft, type Selection } from '../model.ts';
import { footprint, selectedEntity } from './scene.ts';

/** Move physical facility parts and the corresponding return arrivals as one transaction. */
function translateFacility(document: EditorDocument, facilityId: string, dx: number, dy: number): EditOperation[] {
  const facility = document.facilities.find(f => f.id === facilityId);
  if (!facility) throw new Error('施設が見つかりません。');
  const objects = document.objects.filter(o => o.facilityId === facilityId);
  const objectIds = new Set(objects.map(o => o.id));
  const operations: EditOperation[] = objects.map(o => operationFromForm('objects', o, { ...o, x: o.x + dx, y: o.y + dy }));
  for (const i of document.interactions) if (i.objectId && objectIds.has(i.objectId)) operations.push(operationFromForm('interactions', i, { ...i, x: i.x + dx, y: i.y + dy }));
  for (const p of document.portals) if (p.facilityId === facilityId) {
    const after = structuredClone(p);
    if (p.areaId === facility.areaId) { after.from.x += dx; after.from.y += dy; }
    if (p.to.areaId === facility.areaId) { after.to.x += dx; after.to.y += dy; }
    operations.push(operationFromForm('portals', p, after));
  }
  return operations;
}

export function mapDraftOperations(document: EditorDocument, table: EditorTable, before: EditorEntity | undefined, after: EditorEntity, anchor?: { x: number; y: number }): EditOperation[] {
  if (!before) return [operationFromForm(table, before, after)];
  let operations: EditOperation[] = [];
  if (table === 'facilities' && anchor) {
    const rect = footprint(document, { table, id: before.id });
    if (!rect) throw new Error('配置物がない施設は座標移動できません。');
    operations = translateFacility(document, before.id, anchor.x - rect.x, anchor.y - rect.y);
  }
  if (table === 'objects') {
    const old = before as EditorDocument['objects'][number], next = after as typeof old;
    const dx = next.x - old.x, dy = next.y - old.y;
    if ((dx || dy) && old.facilityId && next.facilityId === old.facilityId) {
      if (old.areaId !== next.areaId) throw new Error('施設の一式移動は同じエリア内で行ってください。');
      operations = translateFacility(document, old.facilityId, dx, dy);
    } else if (dx || dy || old.areaId !== next.areaId) {
      for (const i of document.interactions) if (i.objectId === old.id) operations.push(operationFromForm('interactions', i, { ...i, areaId: next.areaId, x: i.x + dx, y: i.y + dy }));
    }
  }
  if (table === 'portals') {
    const old = before as EditorDocument['portals'][number], next = after as typeof old;
    if (old.returnPortalId && old.returnPortalId === next.returnPortalId && (old.areaId !== next.areaId || old.from.x !== next.from.x || old.from.y !== next.from.y)) {
      const back = document.portals.find(p => p.id === old.returnPortalId);
      if (back) operations.push(operationFromForm('portals', back, { ...back, to: { ...back.to,
        areaId: next.areaId, x: back.to.x + next.from.x - old.from.x, y: back.to.y + next.from.y - old.from.y } }));
    }
  }
  // Replace a group-generated operation for the edited entity with all of its submitted attributes.
  operations = operations.filter(op => op.table !== table || op.id !== before.id);
  operations.push(operationFromForm(table, before, after));
  return operations.filter(op => op.type === 'add' || op.type === 'delete' || JSON.stringify(op.before) !== JSON.stringify(op.after));
}

export function mapMoveOperations(document: EditorDocument, selection: Selection, x: number, y: number): EditOperation[] {
  const before = selectedEntity(document, selection);
  if (!before || !['objects', 'facilities', 'portals'].includes(selection.table)) throw new Error('この対象はマップ編集で移動できません。');
  const after = structuredClone(before);
  if (selection.table === 'portals') Object.assign((after as EditorDocument['portals'][number]).from, { x, y });
  else if (selection.table === 'objects') Object.assign(after, { x, y });
  return mapDraftOperations(document, selection.table, before, after, selection.table === 'facilities' ? { x, y } : undefined);
}

export function operationsFromDraft(document: EditorDocument, draft: Draft): EditOperation[] {
  const after = JSON.parse(draft.text) as EditorEntity;
  const before = draft.id === null ? undefined : selectedEntity(document, { table: draft.table, id: draft.id });
  const x = draft.x === '' ? NaN : Number(draft.x), y = draft.y === '' ? NaN : Number(draft.y);
  if (draft.positioned && (draft.x !== draft.originalX || draft.y !== draft.originalY)) {
    if (draft.table === 'portals') Object.assign((after as EditorDocument['portals'][number]).from, { x, y });
    else Object.assign(after, { x, y });
  }
  const anchored = draft.table === 'facilities' && (draft.originalX !== '' || draft.x !== '');
  return mapDraftOperations(document, draft.table, before, after, anchored ? { x, y } : undefined);
}
export function validateMapOperations(document: EditorDocument, operations: readonly EditOperation[]): ValidationIssue[] {
  try { applyChangeSet(document, createChangeSet(document, operations)); return []; }
  catch (error) { return mapIssues(error); }
}
export function mapIssues(error: unknown): ValidationIssue[] {
  return error instanceof EditorValidationError ? error.issues : [{ path: 'マップ編集', code: 'form', message: error instanceof Error ? error.message : '入力を確認してください。' }];
}
