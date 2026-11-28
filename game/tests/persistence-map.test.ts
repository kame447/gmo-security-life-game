import { describe, expect, it } from 'vitest';
import { canonicalJSON, validateDocument } from '../src/editor/schema.ts';
import { evaluationDocument, inventoryMap, roundTripMap, sourceIdentities } from '../src/editor-persistence/map.ts';
import { buildWorld } from '../src/world/index.ts';
import { isSolidGround } from '../src/world/tiles.ts';
import { persistenceWorld } from './fixtures/persistence-world.ts';

describe('read-only inventory and fidelity measurements', () => {
  it('inventories all current areas with explicit IDs and separately derived collision cells', () => {
    const world = buildWorld(), before = structuredClone(world), report = inventoryMap(world);
    expect(report.areas.map(area => area.areaId)).toEqual([...world.areas.keys()].sort());
    for (const area of report.areas) {
      const source = world.areas.get(area.areaId)!;
      expect(area.objects).toEqual({ total: source.def.objects.length, sourceId: source.def.objects.length, auxiliary: 0 });
      expect(area.portals.sourceId).toBe(source.def.portals.length);
      expect(area.decals.sourceId).toBe(source.def.objects.filter(object => object.layer === 'decal').length);
      expect(area.groundSolidCells).toMatchObject({ sourceId: 0, auxiliary: source.ground.filter(isSolidGround).length });
      expect(area.runtimeSolidCells).toMatchObject({ sourceId: 0, auxiliary: source.solid.filter(Boolean).length });
    }
    expect(report.areas.reduce((sum, area) => sum + area.facilities.sourceId, 0)).toBe(world.facilities.size);
    const cafe = world.areas.get('shop-cafe-interior')!;
    const cafeReport = report.areas.find(area => area.areaId === cafe.def.id)!;
    expect(cafe.def.objects.filter(object => object.kind === 'cafe-chair' && object.layer === 'decal')).toHaveLength(2);
    expect(cafeReport.runtimeSolidCells.auxiliary).toBeGreaterThan(cafeReport.groundSolidCells.auxiliary);
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
    expect(report.normalizedOrderChanges).toContainEqual({ table: 'objects', areaId: 'town-main' });
    expect(report.backendAccepted).toBe(false);
    // Shape validation now accepts numeric styles; raw, unlinked data is still rejected for overlaps.
    expect(report.backendIssues.length).toBeGreaterThan(0);
    expect(report.backendIssues).toEqual(validateDocument(evaluationDocument(world)));
    expect(report.backendIssues.every(issue => issue.code === 'overlap')).toBe(true);
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
