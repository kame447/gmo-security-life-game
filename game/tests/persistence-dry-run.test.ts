import { describe, expect, it } from 'vitest';
import { applyChangeSet, buildEditorWorld } from '../src/editor/index.ts';
import type { EditOperation } from '../src/editor/types.ts';
import { sourceFingerprint, type DryRunRequest, type DryRunScope } from '../src/editor-persistence/common.ts';
import { dryRunDocument } from '../src/editor-persistence/dry-run.ts';
import { evaluationDocument, sourceIdentities } from '../src/editor-persistence/map.ts';
import { buildWorld } from '../src/world/index.ts';
import { persistenceWorld } from './fixtures/persistence-world.ts';

async function fixture() {
  const world = persistenceWorld(), document = evaluationDocument(world), before = document.objects[0];
  const request: DryRunRequest = { schemaVersion: 1, sourceFingerprint: await sourceFingerprint(world),
    operations: [{ type: 'move', table: 'objects', id: before.id, before, after: { ...before, x: 2 } }] };
  const scope: DryRunScope = { areaIds: ['fixture-yard'], targets: [{ table: 'objects', id: before.id }] };
  const run = (patch: unknown = request, selected: unknown = scope, domain: 'map' | 'npc' = 'map') =>
    dryRunDocument(world, document, sourceIdentities(world), patch, selected, domain);
  return { world, document, request, scope, run };
}

describe('evaluation-only persistence gates', () => {
  it('validates a scoped move on a copy and matches backend application plus reload', async () => {
    const f = await fixture(), before = structuredClone({ world: f.world, document: f.document, request: f.request });
    const result = await f.run();
    expect(result.status).toBe('passed');
    expect(result.checks).toEqual({ fingerprint: 'passed', ids: 'passed', backend: 'passed', scope: 'passed' });
    expect(result.candidate).toEqual(applyChangeSet(f.document, { schemaVersion: 1, documentId: f.document.id, baseDocument: f.document, operations: f.request.operations }));
    expect(buildEditorWorld(JSON.parse(JSON.stringify(result.candidate))).areas.get('fixture-yard')!.objects[0].x).toBe(2);
    expect(f.world).toEqual(before.world);
    expect(f.document).toEqual(before.document);
    expect(f.request).toEqual(before.request);
  });
  it('rejects a changed source fingerprint even when the target still exists', async () => {
    const f = await fixture(); f.world.variant.edgeMessage = 'Concurrent fixture change';
    const result = await f.run();
    expect(result.checks.fingerprint).toBe('failed');
    expect(result.issues.some(i => i.code === 'stale-source')).toBe(true);
    expect(result.candidate).toBeUndefined();
  });
  it('rejects missing, ambiguous and auxiliary source IDs', async () => {
    const f = await fixture();
    const missing = await f.run({ ...f.request, operations: [{ ...f.request.operations[0], id: 'missing' }] }, { ...f.scope, targets: [{ table: 'objects', id: 'missing' }] });
    expect(missing.issues.some(i => i.code === 'missing-id')).toBe(true);
    const identities = sourceIdentities(f.world), duplicate = identities.find(i => i.table === 'objects')!;
    const ambiguous = await dryRunDocument(f.world, f.document, [...identities, duplicate], f.request, f.scope, 'map');
    expect(ambiguous.issues.some(i => i.code === 'ambiguous-id')).toBe(true);
    delete f.world.areas.get('fixture-yard')!.def.objects[0].id;
    const document = evaluationDocument(f.world), before = document.objects[0];
    const auxiliary = await dryRunDocument(f.world, document, sourceIdentities(f.world), {
      schemaVersion: 1, sourceFingerprint: await sourceFingerprint(f.world),
      operations: [{ type: 'move', table: 'objects', id: before.id, before, after: { ...before, x: 2 } }],
    }, { areaIds: ['fixture-yard'], targets: [{ table: 'objects', id: before.id }] }, 'map');
    expect(auxiliary.issues.some(i => i.code === 'auxiliary-id')).toBe(true);
    expect(auxiliary.candidate).toBeUndefined();
  });
  it.each(['bounds', 'overlap', 'reference', 'conflict', 'immutable-id'])('keeps the baseline intact on backend %s rejection', async kind => {
    const f = await fixture(), baseline = structuredClone(f.document), op = f.request.operations[0];
    if (op.type !== 'move' || op.table !== 'objects') throw new Error('Fixture requires an object move');
    if (kind === 'bounds') op.after.x = 999;
    if (kind === 'overlap') { op.after.x = 4; op.after.y = 2; }
    if (kind === 'reference') f.request.operations[0] = { ...op, type: 'update', after: { ...op.after, facilityId: 'missing' } };
    if (kind === 'conflict') op.before = { ...op.before, x: 1 };
    if (kind === 'immutable-id') op.after.id = 'renamed';
    const result = await f.run();
    expect(result.status).toBe('rejected'); expect(result.checks.backend).toBe('failed');
    expect(result.issues.some(i => i.code === kind)).toBe(true);
    expect(result.candidate).toBeUndefined(); expect(f.document).toEqual(baseline);
  });
  it('rejects unselected targets, cross-area moves and the NPC table in a map request', async () => {
    const f = await fixture();
    expect((await f.run(f.request, { ...f.scope, targets: [] })).issues.some(i => i.code === 'out-of-scope')).toBe(true);
    const move = f.request.operations[0]; if (move.type !== 'move' || move.table !== 'objects') throw new Error('Fixture requires an object move');
    const cross = await f.run({ ...f.request, operations: [{ ...move, after: { ...move.after, areaId: 'fixture-room' } }] });
    expect(cross.issues.some(i => i.code === 'out-of-area')).toBe(true);
    const npc = f.document.interactions[0], request = { ...f.request, operations: [{ type: 'update', table: 'interactions', id: npc.id, before: npc, after: { ...npc, lines: ['Changed fixture.'] } }] };
    const scope = { areaIds: ['fixture-yard'], targets: [{ table: 'interactions', id: npc.id }] };
    expect((await f.run(request, scope)).issues.some(i => i.code === 'out-of-scope')).toBe(true);
    expect((await f.run(request, scope, 'npc')).status).toBe('passed');
  });
  it('requires both connected areas in the independent scope for a portal edit', async () => {
    const f = await fixture(), before = f.document.portals.find(p => p.id === 'fixture-enter')!;
    const request = { ...f.request, operations: [{ type: 'move', table: 'portals', id: before.id, before, after: { ...before, from: { ...before.from, x: 7 } } }] };
    const scope = { areaIds: ['fixture-yard'], targets: [{ table: 'portals', id: before.id }] };
    expect((await f.run(request, scope)).issues.some(i => i.code === 'out-of-area')).toBe(true);
    expect((await f.run(request, { ...scope, areaIds: ['fixture-yard', 'fixture-room'] })).status).toBe('passed');
  });
  it('allows explicitly scoped non-NPC interactions in the map domain without granting NPC changes', async () => {
    const world = persistenceWorld(), sign = world.areas.get('fixture-yard')!.def.interactions[0];
    sign.kind = 'sign'; delete sign.sprite;
    const document = evaluationDocument(world), before = document.interactions[0];
    const request = { schemaVersion: 1, sourceFingerprint: await sourceFingerprint(world),
      operations: [{ type: 'move', table: 'interactions', id: before.id, before, after: { ...before, x: 5 } }] };
    const scope = { areaIds: ['fixture-yard'], targets: [{ table: 'interactions', id: before.id }] };
    expect((await dryRunDocument(world, document, sourceIdentities(world), request, scope, 'map')).status).toBe('passed');
    expect((await dryRunDocument(world, document, sourceIdentities(world), request, scope, 'npc')).checks.scope).toBe('failed');
  });
  it('rejects extra paths/code/commands and scopes that attempt to come from the patch', async () => {
    const f = await fixture();
    for (const extra of [{ target: 'src/world/town.ts' }, { scope: f.scope }, { code: 'anything' }]) {
      expect((await f.run({ ...f.request, ...extra })).issues.some(i => i.code === 'unknown-field')).toBe(true);
    }
    const missingScope = await dryRunDocument(f.world, f.document, sourceIdentities(f.world), f.request, undefined, 'map');
    expect(missingScope.checks.scope).toBe('failed'); expect(missingScope.candidate).toBeUndefined();
    const badScope = await f.run(f.request, { ...f.scope, areaIds: ['missing'] });
    expect(badScope.issues.some(i => i.code === 'missing-area')).toBe(true);
  });
  it('supports explicit add/delete transactions while rejecting a later failing operation atomically', async () => {
    const f = await fixture(), before = f.document.objects[0];
    const extra = { ...before, id: 'fixture-decoration', solid: false, x: 5, y: 4 };
    const operations: EditOperation[] = [{ type: 'add', table: 'objects', id: extra.id, after: extra }, { type: 'delete', table: 'objects', id: before.id, before }];
    const scope = { ...f.scope, targets: [...f.scope.targets, { table: 'objects', id: extra.id }] };
    const accepted = await f.run({ ...f.request, operations }, scope);
    expect(accepted.status).toBe('passed'); expect(accepted.candidate!.objects.map(o => o.id)).toEqual([extra.id]);
    const failed = await f.run({ ...f.request, operations: [...f.request.operations,
      { type: 'update', table: 'objects', id: before.id, before: { ...before, x: 2 }, after: { ...before, x: 999 } }] });
    expect(failed.status).toBe('rejected'); expect(failed.candidate).toBeUndefined();
    expect(f.document.objects[0]).toEqual(before);
  });
  it('reports actual source incompatibilities without sanitizing IDs/styles or publishing a candidate', async () => {
    const world = buildWorld(), before = structuredClone(world), document = evaluationDocument(world);
    const result = await dryRunDocument(world, document, sourceIdentities(world), {
      schemaVersion: 1, sourceFingerprint: await sourceFingerprint(world), operations: [],
    }, { areaIds: ['town-main'], targets: [] }, 'map');
    expect(result.status).toBe('rejected'); expect(result.checks.backend).toBe('failed');
    expect(result.issues).toHaveLength(61); expect(result.candidate).toBeUndefined(); expect(world).toEqual(before);
  });
});
