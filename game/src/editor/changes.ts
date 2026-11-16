import { canonicalJSON, checkEntity, fail, idCheck, locationless, parseDocument, shape } from './schema.ts';
import { EDITOR_TABLES, EditorValidationError, type ChangeSet, type EditOperation, type EditorDocument, type EditorEntity, type EditorTable, type EditorValidationContext, type ValidationIssue } from './types.ts';

const equal = (a: unknown, b: unknown) => canonicalJSON(a) === canonicalJSON(b);

/** Derive only the application-declared fields, before validating a draft's references. */
export function withDerived(document: EditorDocument, context?: EditorValidationContext): EditorDocument {
  const rule=context?.derived;
  if(!rule)return document;
  if(Object.keys(rule).some(key=>!['startPortalId','placedNpcEventKeys'].includes(key)) ||
      (rule.placedNpcEventKeys!==undefined&&rule.placedNpcEventKeys!==true))
    fail('context.derived','metadata','Unknown derived metadata declaration');
  const next=structuredClone(document);
  if(rule.startPortalId!==undefined){
    const portal=next.portals.find(portal=>portal.id===rule.startPortalId);
    if(!portal)return fail('context.derived.startPortalId','reference','The declared start portal does not exist');
    next.start=structuredClone(portal.to);
  }
  if(rule.placedNpcEventKeys){
    const source=new Map([...context!.baselineWorld.areas.values()].flatMap(area=>area.def.interactions.map(item=>[item.id,item] as const)));
    for(const item of next.interactions){
      const original=source.get(item.id);
      if(original ? original.eventKey!==item.eventKey : item.kind!=='npc'||item.eventKey!==`npc.${item.id}`)
        fail(`interactions.${item.id}.eventKey`,'reference','Preserve the source event key or use the new NPC own key');
    }
    next.catalogs.eventKeys=[...new Set(next.interactions.map(item=>item.eventKey))].sort();
  }
  return next;
}

/** Copy validated editor snapshots; bulk numeric layers need no per-cell structured cloning. */
export function cloneDocument(document: EditorDocument): EditorDocument {
  const areas = document.areas.map(({ ground, surfaces, ...area }) => ({
    ...structuredClone(area), ground: ground.slice(),
    ...(surfaces ? { surfaces: { ...structuredClone({ ...surfaces, cells: [] }), cells: surfaces.cells.slice() } } : {}),
  }));
  return { ...structuredClone({ ...document, areas: [] }), areas };
}

/** Read-only derived view for validators; nested authoring data is never mutated. */
export function withDerivedView(document: EditorDocument, context?: EditorValidationContext): EditorDocument {
  const rule=context?.derived;
  if(!rule)return document;
  if(Object.keys(rule).some(key=>!['startPortalId','placedNpcEventKeys'].includes(key)) ||
      (rule.placedNpcEventKeys!==undefined&&rule.placedNpcEventKeys!==true))
    fail('context.derived','metadata','Unknown derived metadata declaration');
  const next={...document,catalogs:{...document.catalogs}};
  if(rule.startPortalId!==undefined){
    const portal=next.portals.find(portal=>portal.id===rule.startPortalId);
    if(!portal)return fail('context.derived.startPortalId','reference','The declared start portal does not exist');
    next.start=structuredClone(portal.to);
  }
  if(rule.placedNpcEventKeys){
    const source=new Map([...context!.baselineWorld.areas.values()].flatMap(area=>area.def.interactions.map(item=>[item.id,item] as const)));
    for(const item of next.interactions){
      const original=source.get(item.id);
      if(original ? original.eventKey!==item.eventKey : item.kind!=='npc'||item.eventKey!==`npc.${item.id}`)
        fail(`interactions.${item.id}.eventKey`,'reference','Preserve the source event key or use the new NPC own key');
    }
    next.catalogs.eventKeys=[...new Set(next.interactions.map(item=>item.eventKey))].sort();
  }
  return next;
}

/** Read derived fields through the same non-mutating validation path. */
export function deriveMetadata(document: EditorDocument, context?: EditorValidationContext): { start: EditorDocument['start']; eventKeys: string[] } {
  const derived=withDerivedView(document,context);
  return {start:derived.start,eventKeys:derived.catalogs.eventKeys};
}

/** True when both values are arrays of identical finite numbers (canonicalJSON-equivalent). */
export function sameFiniteNumbers(a: unknown, b: unknown): boolean {
  if (a === b && Array.isArray(a)) {
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    }
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const av = a[i], bv = b[i];
    if (typeof av !== 'number' || typeof bv !== 'number' || !Number.isFinite(av) || !Number.isFinite(bv) || av !== bv) {
      return false;
    }
  }
  return true;
}


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
  return parseDocument(withDerived(draft, context), context);
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
    const derived=withDerived(document,context),rule=context?.derived;
    if(rule?.startPortalId!==undefined&&!equal(document.start,derived.start))fail('start','derived','Start must match the declared portal destination');
    if(rule?.placedNpcEventKeys&&!equal(document.catalogs.eventKeys,derived.catalogs.eventKeys))fail('catalogs.eventKeys','derived','Event keys must match the current interactions');
    const { areas: _, facilities: __, objects: ___, interactions: ____, portals: _____, start, catalogs, ...rest } = document;
    return {...rest,...(rule?.startPortalId!==undefined?{}:{start}),catalogs:{sprites:catalogs.sprites,
      ...(rule?.placedNpcEventKeys?{}:{eventKeys:catalogs.eventKeys})}};
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
