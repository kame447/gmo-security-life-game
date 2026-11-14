import { describe, expect, it } from 'vitest';
import { canonicalJSON } from '../src/editor/schema.ts';
import { evaluationDocument, inventoryMap, roundTripMap, sourceIdentities } from '../src/editor-persistence/map.ts';
import { buildWorld } from '../src/world/index.ts';
import { persistenceWorld } from './fixtures/persistence-world.ts';

describe('read-only inventory and fidelity measurements', () => {
  it('inventories all current areas with explicit IDs and separately derived collision cells', () => {
    const world = buildWorld(), before = structuredClone(world), report = inventoryMap(world);
    expect(report.areas.map(a => [a.areaId, a.objects.sourceId, a.objects.auxiliary, a.portals.sourceId])).toEqual([
      ['home-family-interior', 13, 0, 1], ['school-classroom-interior', 21, 0, 1],
      ['shop-konbini-interior', 8, 0, 1], ['town-main', 270, 0, 3],
    ]);
    expect(report.areas.reduce((n, a) => n + a.facilities.sourceId, 0)).toBe(11);
    expect(report.areas.reduce((n, a) => n + a.decals.sourceId, 0)).toBe(9);
    expect(report.areas.reduce((n, a) => n + a.coordinatePatternObjectIds, 0)).toBe(312);
    expect(report.areas.reduce((n, a) => n + a.groundSolidCells.auxiliary, 0)).toBe(1681);
    expect(report.areas.reduce((n, a) => n + a.runtimeSolidCells.auxiliary, 0)).toBe(3975);
    expect(report.duplicateSourceIds).toEqual([]);
    expect(world).toEqual(before);
  });
  it('reports anonymous-object addresses as auxiliary and detects duplicate source IDs', () => {
    const world = persistenceWorld(), area = world.areas.get('fixture-yard')!;
    delete area.def.objects[0].id;
    const identity = sourceIdentities(world).find(i => i.table === 'objects')!;
    expect(identity).toMatchObject({ sourceId: false, sourceIndex: 0, areaId: 'fixture-yard' });
    expect(identity.id).toBe('reference-fixture-yard-object-0');
    expect(inventoryMap(world).areas.find(a => a.areaId === 'fixture-yard')!.objects).toEqual({ total: 1, sourceId: 0, auxiliary: 1 });
    area.def.objects[0].id = 'fixture-clerk';
    expect(inventoryMap(world).duplicateSourceIds).toEqual([{ id: 'fixture-clerk', count: 2 }]);
  });
  it('measures current geometry/masks/indexes as equal while exposing metadata and normalization losses', () => {
    const world = buildWorld(), before = structuredClone(world), report = roundTripMap(world);
    for (const area of report.areas) {
      expect(area).toMatchObject({ groundEqual: true, solidMaskEqual: true, portalIndexEqual: true,
        interactionIndexEqual: true, interactionsEqual: true, portalsEqual: true, objectsEqualIgnoringAddedDisplayIds: true, addedDisplayIds: 0 });
    }
    expect(report.areas.find(a => a.areaId === 'town-main')!.lostDistricts).toBe(4);
    expect(report.variantEqual).toBe(false);
    expect(report.variantAfter).toEqual({ id: 'evaluation-map-document', stage: 'childhood' });
    expect(report.startEqualWhenProvidedFromSource).toBe(true);
    expect(report.facilitiesEqual).toBe(true);
    expect(report.areaIterationOrderChanged).toBe(true);
    expect(report.facilityIterationOrderChanged).toBe(true);
    expect(report.normalizedOrderChanges).toHaveLength(9);
    expect(report.backendAccepted).toBe(false);
    // First-stage shape validation stops here; this is not a complete overlap/reachability audit.
    expect(report.backendIssues).toHaveLength(61);
    expect(report.backendIssues.every(issue => issue.code === 'format')).toBe(true);
    expect(world).toEqual(before);
  });
  it('does not infer paired-door or object links and preserves the existing store portal references', () => {
    const document = evaluationDocument(buildWorld());
    expect(document.portals.every(p => p.returnPortalId === undefined)).toBe(true);
    expect(document.interactions.every(i => i.objectId === undefined)).toBe(true);
    const entering = document.portals.find(p => p.id === 'konbini-enter')!;
    expect(entering).toMatchObject({ areaId: 'town-main', facilityId: 'shop-konbini', to: { areaId: 'shop-konbini-interior' } });
    const back = document.portals.find(p => p.areaId === entering.to.areaId && p.to.areaId === entering.areaId)!;
    expect(back.facilityId).toBe('shop-konbini');
  });
  it('keeps variant rules in the fingerprint source but does not pretend the document can reconstruct them', () => {
    const variant = { id: 'fixture-age', stage: 'adult' as const, disabledInteractions: ['home-mother'],
      facilityStates: { 'home-family': 'closed' as const }, edgeMessage: 'Fixture variant.' };
    const report = roundTripMap(buildWorld(variant));
    expect(canonicalJSON(report.variantBefore)).toBe(canonicalJSON(variant));
    expect(report.variantAfter).not.toHaveProperty('disabledInteractions');
    expect(report.variantAfter).not.toHaveProperty('facilityStates');
    expect(report.variantAfter.stage).toBe('childhood');
  });
});
