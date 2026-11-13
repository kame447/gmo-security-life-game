import { EditorValidationError, type ChangeSet, type EditOperation, type EditorDocument, type EditorEntity, type EditorTable, type ValidationIssue } from '../editor/index.ts';
import type { EditorBackend } from './backend.ts';

export interface Selection { table: EditorTable; id: string }
export interface Draft {
  table: EditorTable;
  id: string | null;
  text: string;
  originalText: string;
  x: string;
  y: string;
  originalX: string;
  originalY: string;
  positioned: boolean;
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2);
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)]));
  return value;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

function position(table: EditorTable, value: EditorEntity): { x: number; y: number } | null {
  if (table === 'objects' || table === 'interactions') return value as { x: number; y: number };
  if (table === 'portals') return (value as EditorDocument['portals'][number]).from;
  return null;
}

function withoutPosition(table: EditorTable, entity: EditorEntity): unknown {
  const copy = structuredClone(entity) as unknown as Record<string, unknown>;
  if (table === 'objects' || table === 'interactions') { delete copy.areaId; delete copy.x; delete copy.y; }
  if (table === 'portals') {
    delete copy.areaId;
    const from = copy.from as Record<string, unknown>;
    delete from.x; delete from.y;
  }
  return copy;
}

/** Convert the form value to the API's full before/after operation. */
export function operationFromForm(table: EditorTable, before: EditorEntity | undefined, after: EditorEntity): EditOperation {
  if (!before) return { type: 'add', table, id: after.id, after } as EditOperation;
  const movable = table === 'objects' || table === 'interactions' || table === 'portals';
  const type = movable && equal(withoutPosition(table, before), withoutPosition(table, after)) && !equal(before, after) ? 'move' : 'update';
  return { type, table, id: before.id, before, after } as EditOperation;
}

function draftFor(table: EditorTable, entity: EditorEntity, isNew: boolean): Draft {
  const text = pretty(entity), pos = position(table, entity);
  const x = pos ? String(pos.x) : '', y = pos ? String(pos.y) : '';
  return { table, id: isNew ? null : entity.id, text, originalText: text, x, y, originalX: x, originalY: y, positioned: !!pos };
}

function template(table: Exclude<EditorTable, 'areas'>, areaId: string, document: EditorDocument): EditorEntity {
  const names = { facilities: 'facility', objects: 'object', interactions: 'interaction', portals: 'portal' };
  const used = new Set([document.areas, document.facilities, document.objects, document.interactions, document.portals].flat().map(item => item.id));
  let id = `new-${names[table]}`, n = 2;
  while (used.has(id)) id = `new-${names[table]}-${n++}`;
  switch (table) {
    case 'facilities': return { id, areaId, name: '新しい施設', interior: 'background', state: 'open' };
    case 'objects': return { id, areaId, kind: 'tree', x: 1, y: 1, w: 1, h: 1, solid: true };
    case 'interactions': return { id, areaId, kind: 'sign', name: '新しい対象', x: 1, y: 1, solid: false, eventKey: document.catalogs.eventKeys[0] ?? '', lines: [] };
    case 'portals': return { id, areaId, from: { x: 1, y: 1 }, to: { ...document.start } };
  }
}

/** DOM-independent selection, uncommitted form, history and export coordination. */
export class EditorModel {
  areaId: string;
  selection: Selection | null = null;
  draft: Draft | null = null;
  issues: ValidationIssue[] = [];
  notice = '';

  constructor(readonly backend: EditorBackend) {
    this.areaId = backend.document.start.areaId;
  }
  get document(): EditorDocument { return this.backend.document; }
  get pending(): boolean {
    const d = this.draft;
    return !!d && (d.id === null || d.text !== d.originalText || d.x !== d.originalX || d.y !== d.originalY);
  }
  get changes(): ChangeSet { return this.backend.exportChanges(); }
  get canExport(): boolean { return !this.pending && this.issues.length === 0 && this.changes.operations.length > 0; }
  private entity(selection: Selection): EditorEntity | undefined {
    return (this.document[selection.table] as EditorEntity[]).find(item => item.id === selection.id);
  }
  private mayLeave(): boolean {
    if (!this.pending) return true;
    this.notice = '未反映の入力があります。反映するか、入力を取り消してください。';
    return false;
  }
  selectArea(id: string): boolean {
    if (!this.mayLeave() || !this.document.areas.some(area => area.id === id)) return false;
    this.areaId = id; this.selection = null; this.draft = null; this.issues = []; this.notice = '';
    return true;
  }
  select(selection: Selection): boolean {
    if (this.selection?.id === selection.id && this.selection.table === selection.table && !this.pending) return true;
    if (!this.mayLeave()) return false;
    const entity = this.entity(selection);
    if (!entity) return false;
    this.selection = selection; this.draft = draftFor(selection.table, entity, false); this.issues = []; this.notice = '';
    return true;
  }
  startAdd(table: Exclude<EditorTable, 'areas'>): boolean {
    if (!this.mayLeave()) return false;
    this.selection = null; this.draft = draftFor(table, template(table, this.areaId, this.document), true);
    this.issues = []; this.notice = '';
    return true;
  }
  cancelDraft(): void {
    if (this.selection) {
      const entity = this.entity(this.selection);
      this.draft = entity ? draftFor(this.selection.table, entity, false) : null;
    } else this.draft = null;
    this.issues = []; this.notice = '';
  }
  applyDraft(): boolean {
    const d = this.draft;
    if (!d) return false;
    try {
      const raw: unknown = JSON.parse(d.text);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('JSON はオブジェクトにしてください。');
      const after = raw as EditorEntity;
      if (d.positioned && (d.x !== d.originalX || d.y !== d.originalY)) {
        if (!/^\d+$/.test(d.x) || !/^\d+$/.test(d.y) || !Number.isSafeInteger(Number(d.x)) || !Number.isSafeInteger(Number(d.y))) throw new Error('座標は 0 以上の整数で入力してください。');
        if (d.table === 'portals') {
          const from = (after as EditorDocument['portals'][number]).from;
          if (!from || typeof from !== 'object') throw new Error('出入口の from を入力してください。');
          from.x = Number(d.x); from.y = Number(d.y);
        } else Object.assign(after, { x: Number(d.x), y: Number(d.y) });
      }
      const before = d.id === null ? undefined : this.entity({ table: d.table, id: d.id });
      if (d.id !== null && !before) throw new Error('対象が見つかりません。');
      this.backend.commit([operationFromForm(d.table, before, after)]);
      this.selection = { table: d.table, id: after.id };
      const committed = this.entity(this.selection);
      if (!committed) throw new Error('反映後の対象が見つかりません。');
      this.draft = draftFor(d.table, committed, false); this.issues = []; this.notice = '編集を反映しました。';
      return true;
    } catch (error) {
      this.issues = error instanceof EditorValidationError ? error.issues : [{ path: '入力', code: 'form', message: error instanceof SyntaxError ? 'JSON の形式を確認してください。' : error instanceof Error ? error.message : '入力を確認してください。' }];
      this.notice = '反映できませんでした。入力と検証結果を確認してください。';
      return false;
    }
  }
  deleteSelection(): boolean {
    if (!this.mayLeave() || !this.selection) return false;
    const before = this.entity(this.selection);
    if (!before) return false;
    try {
      this.backend.commit([{ type: 'delete', table: this.selection.table, id: before.id, before } as EditOperation]);
      this.selection = null; this.draft = null; this.issues = []; this.notice = '対象を削除しました。';
      return true;
    } catch (error) {
      this.issues = error instanceof EditorValidationError ? error.issues : [{ path: '削除', code: 'error', message: error instanceof Error ? error.message : '削除できません。' }];
      this.notice = '削除できませんでした。検証結果を確認してください。';
      return false;
    }
  }
  history(direction: 'undo' | 'redo'): boolean {
    if (!this.mayLeave() || !(direction === 'undo' ? this.backend.canUndo : this.backend.canRedo)) return false;
    this.backend[direction]();
    if (!this.document.areas.some(area => area.id === this.areaId)) this.areaId = this.document.start.areaId;
    const entity = this.selection && this.entity(this.selection);
    if (this.selection && entity) this.draft = draftFor(this.selection.table, entity, false);
    else { this.selection = null; this.draft = null; }
    this.issues = []; this.notice = direction === 'undo' ? '変更を取り消しました。' : '変更をやり直しました。';
    return true;
  }
  exportText(): string {
    if (!this.canExport) throw new Error('未反映の入力または検証エラーを解消し、変更を反映してください。');
    return this.backend.serializeChanges();
  }
}
