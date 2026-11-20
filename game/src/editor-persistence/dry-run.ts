/** Evaluation-only gate shared by map/NPC experiments. This module performs no I/O. */
import { applyChangeSet } from '../editor/changes.ts';
import { checkEntity, idCheck, shape, validateDocument } from '../editor/schema.ts';
import { EDITOR_TABLES, EditorValidationError, type EditorDocument, type EditorTable, type ValidationIssue } from '../editor/types.ts';
import type { World } from '../world/runtime.ts';
import { sourceFingerprint, type CheckStage, type DryRunRequest, type DryRunResult, type DryRunScope, type SourceIdentity } from './common.ts';

type Check = (value: unknown, path: string, issues: ValidationIssue[]) => void;
const stringValue: Check = (value, path, issues) => {
  if (typeof value !== 'string') issues.push({ path, code: 'schema', message: 'Expected string' });
};
const tableValue: Check = (value, path, issues) => {
  if (!EDITOR_TABLES.includes(value as EditorTable)) issues.push({ path, code: 'schema', message: 'Unknown editor table' });
};
const list = (check: Check, max: number): Check => (value, path, issues) => {
  if (!Array.isArray(value) || value.length > max) { issues.push({ path, code: 'schema', message: `Expected at most ${max} entries` }); return; }
  value.forEach((item, index) => check(item, `${path}[${index}]`, issues));
};
const operation: Check = (value, path, issues) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { issues.push({ path, code: 'schema', message: 'Expected operation' }); return; }
  const op = value as Record<string, unknown>;
  if (!['add', 'delete', 'update', 'move'].includes(op.type as string) || !EDITOR_TABLES.includes(op.table as EditorTable)) {
    issues.push({ path, code: 'schema', message: 'Unknown operation type/table' }); return;
  }
  const entity: Check = (value, path, errors) => checkEntity(op.table as EditorTable, value, path, errors);
  shape({ type: stringValue, table: tableValue, id: idCheck,
    ...(op.type === 'add' ? {} : { before: entity }), ...(op.type === 'delete' ? {} : { after: entity }),
  })(op, path, issues);
};
const requestCheck = shape({ schemaVersion: (v, p, e) => {
  if (v !== 1) e.push({ path: p, code: 'schema', message: 'Expected schemaVersion 1' });
}, sourceFingerprint: (v, p, e) => {
  if (typeof v !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(v)) e.push({ path: p, code: 'fingerprint', message: 'Expected sha256:<64 lowercase hex>' });
}, operations: list(operation, 10000) });
const scopeCheck = shape({ areaIds: list(idCheck, 64), targets: list(shape({ table: tableValue, id: idCheck }), 10000) });

export async function dryRunDocument(world: World, document: EditorDocument, identities: readonly SourceIdentity[],
  rawRequest: unknown, rawScope: unknown, domain: 'map' | 'npc'): Promise<DryRunResult> {
  const current = await sourceFingerprint(world);
  const expected = rawRequest && typeof rawRequest === 'object' && 'sourceFingerprint' in rawRequest &&
    typeof rawRequest.sourceFingerprint === 'string' ? rawRequest.sourceFingerprint : null;
  const result: DryRunResult = { schemaVersion: 1, evaluationOnly: true, domain, status: 'rejected',
    sourceFingerprint: current, expectedFingerprint: expected,
    checks: { fingerprint: 'skipped', ids: 'skipped', backend: 'skipped', scope: 'skipped' }, issues: [], changes: [] };
  const add = (stage: CheckStage, issue: ValidationIssue) => { result.issues.push({ stage, ...issue }); result.checks[stage] = 'failed'; };
  const fail = (stage: CheckStage, path: string, code: string, message: string) => add(stage, { path, code, message });
  result.checks.fingerprint = expected === current ? 'passed' : 'failed';
  if (expected !== current) fail('fingerprint', 'sourceFingerprint', 'stale-source', 'Generated source changed; recreate the request from the current fingerprint');
  const requestIssues: ValidationIssue[] = [], scopeIssues: ValidationIssue[] = [];
  requestCheck(rawRequest, '$', requestIssues); scopeCheck(rawScope, 'scope', scopeIssues);
  requestIssues.forEach(issue => add('backend', issue)); scopeIssues.forEach(issue => add('scope', issue));
  validateDocument(document).forEach(issue => add('backend', { ...issue, path: `base.${issue.path}` }));
  if (requestIssues.length) return result;
  const request = rawRequest as DryRunRequest;
  result.changes = request.operations.map(({ type, table, id }) => ({ type, table, id }));
  const key = (value: { table: EditorTable; id: string }) => `${value.table}/${value.id}`;
  const live = new Map<string, SourceIdentity[]>();
  for (const identity of identities) live.set(key(identity), [...(live.get(key(identity)) ?? []), identity]);
  result.checks.ids = 'passed';
  for (const [n, op] of request.operations.entries()) {
    const found = live.get(key(op)) ?? [], path = `operations[${n}]`;
    if (op.type === 'add') {
      if ([...live.values()].flat().some(identity => identity.id === op.id)) fail('ids', path, 'duplicate-id', 'Added ID already exists');
      else live.set(key(op), [{ table: op.table, id: op.id, areaId: 'areaId' in op.after ? op.after.areaId : op.after.id, sourceId: true }]);
    } else {
      if (found.length !== 1) fail('ids', path, found.length ? 'ambiguous-id' : 'missing-id', 'Target must resolve to exactly one source entity');
      else if (!found[0].sourceId) fail('ids', path, 'auxiliary-id', 'Display-only array-index IDs cannot identify a persistent edit');
      if (op.type === 'delete') live.delete(key(op));
    }
  }
  if (!scopeIssues.length) {
    const scope = rawScope as DryRunScope;
    result.checks.scope = 'passed';
    const knownAreas = new Set(document.areas.map(area => area.id));
    for (const id of scope.areaIds) if (!knownAreas.has(id)) fail('scope', 'scope.areaIds', 'missing-area', `Unknown scope area ${id}`);
    const targets = new Set(scope.targets.map(key));
    if (targets.size !== scope.targets.length || new Set(scope.areaIds).size !== scope.areaIds.length) fail('scope', 'scope', 'duplicate-scope', 'Scope entries must be unique');
    for (const [n, op] of request.operations.entries()) {
      const path = `operations[${n}]`;
      const values = [...(op.type === 'add' ? [] : [op.before]), ...(op.type === 'delete' ? [] : [op.after])];
      const npc = op.table === 'interactions' && values.some(value => 'kind' in value && value.kind === 'npc');
      const allowed = domain === 'npc' ? op.table === 'interactions' && values.every(value => 'kind' in value && value.kind === 'npc') : !npc;
      if (!allowed || !targets.has(key(op))) fail('scope', path, 'out-of-scope', 'Operation is outside the independently selected domain/targets');
      for (const value of values) {
        const areaId = op.table === 'areas' ? value.id : 'areaId' in value ? value.areaId : '';
        if (!scope.areaIds.includes(areaId)) fail('scope', path, 'out-of-area', 'Source and destination must be inside the selected areas');
        if ('to' in value && !scope.areaIds.includes(value.to.areaId)) fail('scope', path, 'out-of-area', 'Portal arrival area is outside the selected scope');
      }
    }
  }
  if (result.issues.length) return result;
  try {
    result.candidate = applyChangeSet(document, { schemaVersion: 1, documentId: document.id, baseDocument: document, operations: request.operations });
    result.checks.backend = 'passed'; result.status = 'passed';
  } catch (error) {
    if (!(error instanceof EditorValidationError)) throw error;
    error.issues.forEach(issue => add('backend', issue));
  }
  return result;
}
