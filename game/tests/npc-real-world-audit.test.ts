import { describe, expect, it } from 'vitest';
import { canonicalJSON, validateDocument } from '../src/editor/schema.ts';
import { buildEditorWorld, parseDocument, type EditOperation } from '../src/editor/index.ts';
import { sourceFingerprint, sourceSnapshot } from '../src/editor-persistence/common.ts';
import { referenceScene } from '../src/editor-ui/map/reference.ts';
import { auditNpcWorld, checkNpcFields, checkNpcInIsolation, inventoryNpcs,
  dryRunNpc, npcSourceIdentities, projectWorldForNpcAudit, reconstructNpcAuditWorld } from '../src/editor-npc/real-world-audit.ts';
import { buildWorld } from '../src/world/index.ts';
import { PROTOTYPE_NPC_SPRITES } from '../src/editor-npc/sprites.ts';
import sample from '../data/editor-prototype.json';

describe('existing NPC evaluation (no persistence)', () => {
  it('inventories the actual area, dialogue, collision and interaction lookup without changing the source', () => {
    const world = buildWorld(), before = canonicalJSON(sourceSnapshot(world)), report = auditNpcWorld(world);
    expect(report.byArea.map(({ areaId, npcCount }) => [areaId, npcCount])).toEqual([
      ['town-main', 6], ['home-family-interior', 1], ['school-classroom-interior', 2], ['shop-konbini-interior', 1],
    ]);
    expect(report.npcCount).toBe(10);
    expect(new Set(report.rows.map(row => row.npc.id)).size).toBe(10);
    for (const row of report.rows) {
      expect(row.npc.id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(row.npc.sprite).toBeTruthy(); expect(row.npc.facing).toBeTruthy();
      expect(PROTOTYPE_NPC_SPRITES).toContain(row.npc.sprite);
      expect(row.npc.eventKey).toBeTruthy(); expect(row.npc.lines.length).toBeGreaterThan(0);
      expect(row.npc.solid).toBe(true);
      expect(row.footprint).toEqual({ w: 1, h: 1, widthDefaulted: true, heightDefaulted: true });
      expect(row.indexedInteractionIds).toEqual([row.npc.id]);
      expect(row.solidCells).toEqual([true]);
      expect(row.outOfBoundsCells).toEqual([]); expect(row.groundSolidCells).toEqual([]); expect(row.overlappingObjects).toEqual([]);
      expect(row.overlappingInteractions).toEqual([]); expect(row.overlappingPortals).toEqual([]);
    }
    expect(canonicalJSON(sourceSnapshot(world))).toBe(before);
  });

  it('preserves current NPC fields and their runtime lookup in the unvalidated raw round trip', () => {
    const source = buildWorld(), before = inventoryNpcs(source), projection = projectWorldForNpcAudit(source);
    const scene = referenceScene(source);
    expect(projection.document.interactions).toEqual(scene.interactions);
    const reconstructed = reconstructNpcAuditWorld(JSON.parse(JSON.stringify(projection.document)));
    const after = inventoryNpcs(reconstructed);
    for (const row of before) {
      const match = after.find(item => item.areaId === row.areaId && item.npc.id === row.npc.id);
      expect(match?.npc).toEqual(row.npc);
      expect(match?.indexedInteractionIds).toEqual(row.indexedInteractionIds);
      expect(match?.solidCells).toEqual(row.solidCells);
    }
    expect(source.areas.get('town-main')!.def.districts?.length).toBeGreaterThan(0);
    expect(reconstructed.areas.get('town-main')!.def.districts).toBeUndefined();
    expect(source.variant.edgeMessage).toBeTruthy();
    expect(reconstructed.variant.edgeMessage).toBeUndefined();
    expect(reconstructed.variant.stage).toBe('childhood');
    const originalName = source.areas.get('home-family-interior')!.def.interactions[0].name;
    projection.document.interactions.find(item => item.id === 'home-mother')!.name = 'audit-only';
    expect(source.areas.get('home-family-interior')!.def.interactions[0].name).toBe(originalName);
  });

  it('separates NPC field acceptance in isolation from full-document rejection', () => {
    const world = buildWorld(), report = auditNpcWorld(world);
    for (const row of report.rows) {
      expect(row.fieldIssues).toEqual([]);
      expect(row.isolatedBackendIssues).toEqual([]);
      expect(row.roundTripSameNpc).toBe(true);
    }
    expect(report.temporaryObjectIds).toEqual([]);
    expect(report.fullDocumentIssues).toHaveLength(61);
    expect(report.fullDocumentIssues.every(issue => issue.path.startsWith('$.objects[') && issue.path.endsWith('.style') && issue.code === 'format')).toBe(true);
    // The schema stops after these shape errors: this is not proof that contextual checks passed.
    expect(validateDocument(projectWorldForNpcAudit(world).document)).toEqual(report.fullDocumentIssues);
  });

  it('shows the actual NPC form constraints using a detached test copy', () => {
    const world = buildWorld(), area = world.areas.get('home-family-interior')!;
    const npc = structuredClone(area.interactions.find(item => item.id === 'home-mother')!);
    const empty = { ...npc, id: 'Bad_ID', lines: [], areaId: area.def.id };
    expect(checkNpcFields(empty)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'interaction.id', code: 'format' }),
      expect.objectContaining({ path: 'interaction.lines', code: 'required' }),
    ]));
    expect(checkNpcInIsolation(area, npc)).toEqual([]);
    const absentSprite = { ...npc, sprite: undefined };
    expect(checkNpcInIsolation(area, absentSprite)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'interactions.home-mother.sprite', code: 'reference' }),
    ]));
    expect(area.interactions.find(item => item.id === 'home-mother')).toEqual(npc);
  });

  it('applies only an independently scoped NPC proposal to a validated fixture copy', async () => {
    const document = parseDocument(sample), world = buildEditorWorld(document), identities = npcSourceIdentities(world);
    const beforeSource = canonicalJSON(sourceSnapshot(world)), beforeDocument = canonicalJSON(document);
    const npc = document.interactions.find(item => item.kind === 'npc')!;
    const operation: EditOperation = { type: 'update', table: 'interactions', id: npc.id,
      before: npc, after: { ...npc, name: '評価用の名前' } };
    const request = { schemaVersion: 1, sourceFingerprint: await sourceFingerprint(world), operations: [operation] };
    const scope = { areaIds: [npc.areaId], targets: [{ table: 'interactions', id: npc.id }] };
    const result = await dryRunNpc(world, document, identities, request, scope);
    expect(result.status).toBe('passed');
    expect(result.checks).toEqual({ fingerprint: 'passed', ids: 'passed', backend: 'passed', scope: 'passed' });
    expect(result.candidate?.interactions.find(item => item.id === npc.id)?.name).toBe('評価用の名前');
    expect(canonicalJSON(document)).toBe(beforeDocument); expect(canonicalJSON(sourceSnapshot(world))).toBe(beforeSource);

    const stale = await dryRunNpc(world, document, identities, { ...request, sourceFingerprint: `sha256:${'0'.repeat(64)}` }, scope);
    expect(stale.checks.fingerprint).toBe('failed'); expect(stale.candidate).toBeUndefined();
    const outside = await dryRunNpc(world, document, identities, request, { ...scope, targets: [] });
    expect(outside.checks.scope).toBe('failed'); expect(outside.candidate).toBeUndefined();
    const auxiliary = await dryRunNpc(world, document, identities.map(item => item.id === npc.id ? { ...item, sourceId: false } : item), request, scope);
    expect(auxiliary.issues).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'ids', code: 'auxiliary-id' })]));
    expect(auxiliary.candidate).toBeUndefined();
  });

  it('rejects an empty NPC dialogue even though the generic backend allows an empty array', async () => {
    const document = parseDocument(sample), world = buildEditorWorld(document), npc = document.interactions.find(item => item.kind === 'npc')!;
    const operation: EditOperation = { type: 'update', table: 'interactions', id: npc.id, before: npc, after: { ...npc, lines: [] } };
    const request = { schemaVersion: 1, sourceFingerprint: await sourceFingerprint(world), operations: [operation] };
    const result = await dryRunNpc(world, document, npcSourceIdentities(world), request,
      { areaIds: [npc.areaId], targets: [{ table: 'interactions', id: npc.id }] });
    expect(result.status).toBe('rejected'); expect(result.checks.backend).toBe('failed');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'backend', path: 'operations[0].after.lines', code: 'required' }),
    ]));
    expect(result.candidate).toBeUndefined(); expect(npc.lines.length).toBeGreaterThan(0);
  });
});
