import { canonicalJSON, checkEntity, fail, idCheck, locationless, parseDocument, shape } from './schema.ts';
import { EDITOR_TABLES, EditorValidationError, type ChangeSet, type EditOperation, type EditorDocument, type EditorEntity, type EditorTable, type EditorValidationContext, type ValidationIssue } from './types.ts';

const equal = (a: unknown, b: unknown) => canonicalJSON(a) === canonicalJSON(b);

export function parseChangeSet(raw: unknown, context?: EditorValidationContext): ChangeSet {
  const issues: ValidationIssue[] = [];
  const addIssue = (path: string, message: string) => { issues.push({ path, code: 'schema', message }); };
  shape({
    schemaVersion: (v, p) => { if (v !== 1) addIssue(p, 'Expected change-set schemaVersion 1'); },
    documentId: idCheck,
    baseDocument: (v, p) => {
      try { parseDocument(v, context); } catch (error) {
        if (!(error instanceof EditorValidationError)) throw error;
        issues.push(...error.issues.map(i => ({ ...i, path: `${p}.${i.path}` })));
      }
    },
    operations: (value, path) => {
      if (!Array.isArray(value) || value.length > 10000) { addIssue(path, 'Expected at most 10000 operations'); return; }
      value.forEach((rawOp: unknown, n) => {
        const p = `${path}[${n}]`;
        if (!rawOp || typeof rawOp !== 'object' || Array.isArray(rawOp)) { addIssue(p, 'Expected operation'); return; }
        const op = rawOp as Record<string, unknown>;
        if (!EDITOR_TABLES.includes(op.table as EditorTable) || !['add', 'delete', 'update', 'move'].includes(op.type as string)) {
          addIssue(p, 'Unknown table or operation type'); return;
        }
        const table = op.table as EditorTable;
        const check = (v: unknown, field: string, errors: ValidationIssue[]) => checkEntity(table, v, field, errors);
        shape({ type: () => {}, table: () => {}, id: idCheck,
          ...(op.type === 'add' ? {} : { before: check }),
          ...(op.type === 'delete' ? {} : { after: check }),
        })(op, p, issues);
      });
    },
  })(raw, '$', issues);
  if (issues.length) throw new EditorValidationError(issues);
  const copy: ChangeSet = JSON.parse(canonicalJSON(raw));
  copy.baseDocument = parseDocument(copy.baseDocument, context);
  if (copy.documentId !== copy.baseDocument.id) fail('documentId', 'conflict', 'Change set belongs to another document');
  return copy;
}

/** Pure transaction: validate the complete candidate before returning; never mutates the input. */
function applyParsed(document: EditorDocument, changes: ChangeSet, context?: EditorValidationContext): EditorDocument {
  if (document.id !== changes.documentId || !equal(document, changes.baseDocument)) {
    fail('baseDocument', 'conflict', 'Source data changed; reload and re-export the edit before applying');
  }
  const draft = structuredClone(document);
  for (const [n, op] of changes.operations.entries()) {
    const path = `operations[${n}]`, list = draft[op.table] as EditorEntity[];
    const index = list.findIndex(entity => entity.id === op.id);
    if (op.type === 'add') {
      if (index !== -1) fail(path, 'duplicate-id', `ID ${op.id} already exists in ${op.table}`);
    } else {
      if (index === -1) fail(path, 'missing-id', `ID ${op.id} does not exist in ${op.table}`);
      if (op.before.id !== op.id || !equal(list[index], op.before)) fail(path, 'conflict', `Before value does not match ${op.id}`);
    }
    if (op.type !== 'delete' && op.after.id !== op.id) fail(path, 'immutable-id', 'An operation cannot rename an ID');
    if (op.type === 'move') {
      if (!['objects', 'interactions', 'portals'].includes(op.table) || !equal(locationless(op.before, op.table), locationless(op.after, op.table))) {
        fail(path, 'move', 'Move may change only areaId and source x/y; use update for attributes');
      }
    }
    if (op.type === 'delete') list.splice(index, 1);
    else if (op.type === 'add') list.push(structuredClone(op.after));
    else list[index] = structuredClone(op.after);
  }
  return parseDocument(draft, context);
}

export function applyChangeSet(document: unknown, changes: unknown, context?: EditorValidationContext): EditorDocument {
  return applyParsed(parseDocument(document, context), parseChangeSet(changes, context), context);
}

/** GUI entry point; a multi-object gesture is one atomic transaction and one undo step. */
export function createChangeSet(document: unknown, operations: readonly EditOperation[], context?: EditorValidationContext): ChangeSet {
  const baseDocument = parseDocument(document, context);
  const changes = parseChangeSet({ schemaVersion: 1, documentId: baseDocument.id, baseDocument, operations }, context);
  applyParsed(baseDocument, changes, context);
  return changes;
}

/** Stable ID-based output, independent of insertion order or JSON property order. */
export function diffDocuments(before: unknown, after: unknown, context?: EditorValidationContext): ChangeSet {
  const base = parseDocument(before, context), next = parseDocument(after, context);
  const metadata = (document: EditorDocument) => {
    const { areas: _, facilities: __, objects: ___, interactions: ____, portals: _____, ...rest } = document;
    return rest;
  };
  if (!equal(metadata(base), metadata(next))) fail('$', 'metadata', 'Document identity, tileSize, start and catalogs are authored separately in schema v1');
  const operations: EditOperation[] = [];
  for (const table of EDITOR_TABLES) {
    const old = new Map<string, EditorEntity>(base[table].map(entity => [entity.id, entity]));
    const updated = new Map<string, EditorEntity>(next[table].map(entity => [entity.id, entity]));
    for (const [id, entity] of old) {
      if (!updated.has(id)) operations.push({ type: 'delete', table, id, before: entity } as EditOperation);
      else {
        const replacement = updated.get(id)!;
        if (!equal(entity, replacement)) {
          const type = ['objects', 'interactions', 'portals'].includes(table) && equal(locationless(entity, table), locationless(replacement, table)) ? 'move' : 'update';
          operations.push({ type, table, id, before: entity, after: replacement } as EditOperation);
        }
      }
    }
    for (const [id, entity] of updated) if (!old.has(id)) operations.push({ type: 'add', table, id, after: entity } as EditOperation);
  }
  return createChangeSet(base, operations, context);
}

export function serializeChangeSet(raw: unknown, context?: EditorValidationContext): string {
  const changes = parseChangeSet(raw, context);
  applyParsed(changes.baseDocument, changes, context);
  return canonicalJSON(changes);
}
export function loadChangeSet(json: string, context?: EditorValidationContext): ChangeSet {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return fail('$', 'json', 'Invalid change-set JSON'); }
  const changes = parseChangeSet(raw, context);
  applyParsed(changes.baseDocument, changes, context);
  return changes;
}

export interface ChangePreview { changes: ChangeSet; document: EditorDocument; before: string; after: string; summary: string[] }
export function previewChangeSet(document: unknown, raw: unknown, context?: EditorValidationContext): ChangePreview {
  const base = parseDocument(document, context), changes = parseChangeSet(raw, context), next = applyParsed(base, changes, context);
  return { changes, document: next, before: canonicalJSON(base), after: canonicalJSON(next),
    summary: changes.operations.map(op => `${op.type} ${op.table}/${op.id}`) };
}
