/** Read-only measurements for ADR 0009. These are not a migration or a game data source. */
import { referenceScene } from '../editor-ui/map/reference.ts';
import { assembleEditorWorld } from '../editor/runtime.ts';
import { canonicalJSON, validateDocument } from '../editor/schema.ts';
import type { EditorDocument } from '../editor/types.ts';
import type { World } from '../world/runtime.ts';
import { isSolidGround } from '../world/tiles.ts';
import { sourceSnapshot, type SourceIdentity } from './common.ts';

export type { SourceIdentity } from './common.ts';
export function evaluationDocument(world: World): EditorDocument {
  const scene = referenceScene(world);
  return { schemaVersion: 1, id: 'evaluation-map-document', tileSize: 16, start: { ...world.start },
    catalogs: {
      sprites: [...new Set(scene.interactions.flatMap(i => i.sprite ? [i.sprite] : []))].sort(),
      eventKeys: [...new Set(scene.interactions.map(i => i.eventKey))].sort(),
    }, ...scene };
}

/** Source IDs are explicit source fields, not a promise of ownership across future generations. */
export function sourceIdentities(world: World): SourceIdentity[] {
  const scene = referenceScene(world);
  const records: SourceIdentity[] = scene.areas.map(a => ({ table: 'areas', id: a.id, areaId: a.id, sourceId: true }));
  records.push(...scene.facilities.map(f => ({ table: 'facilities' as const, id: f.id, areaId: f.areaId, sourceId: true })));
  for (const area of scene.areas) {
    for (const table of ['objects', 'interactions', 'portals'] as const) {
      const source = world.areas.get(area.id)!.def[table];
      scene[table].filter(e => e.areaId === area.id).forEach((entity, index) => {
        records.push({ table, id: entity.id, areaId: area.id, sourceId: !!source[index].id, sourceIndex: index });
      });
    }
  }
  return records;
}

export function inventoryMap(world: World) {
  const identities = sourceIdentities(world);
  const count = (values: { id?: string }[]) => ({ total: values.length,
    sourceId: values.filter(value => !!value.id).length, auxiliary: values.filter(value => !value.id).length });
  const areas = [...world.areas.values()].sort((a, b) => a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0).map(area => ({
    areaId: area.def.id, facilities: count([...world.facilities.values()].filter(f => f.areaId === area.def.id)),
    objects: count(area.def.objects), decals: count(area.def.objects.filter(o => o.layer === 'decal')),
    // Matches the formulas currently read in town.ts/object() and interiors.ts/add().
    coordinatePatternObjectIds: area.def.objects.filter(o => o.id === `${area.def.id === 'town-main' ? 'town' : area.def.id}-${o.kind}-${o.x}-${o.y}`).length,
    nonSolidObjects: count(area.def.objects.filter(o => !o.solid)), portals: count(area.def.portals),
    interactions: count(area.def.interactions), solidObjects: count(area.def.objects.filter(o => o.solid)),
    solidInteractions: count(area.def.interactions.filter(i => i.solid)),
    // Terrain and runtime masks have no entity ID; cell addresses depend on area width/coordinates.
    groundSolidCells: { total: [...area.ground].filter(isSolidGround).length, sourceId: 0,
      auxiliary: [...area.ground].filter(isSolidGround).length, addressing: 'derived-area-coordinate' },
    runtimeSolidCells: { total: [...area.solid].filter(Boolean).length, sourceId: 0,
      auxiliary: [...area.solid].filter(Boolean).length, addressing: 'derived-area-coordinate' },
  }));
  const ids = new Map<string, number>();
  for (const identity of identities.filter(i => i.sourceId)) ids.set(identity.id, (ids.get(identity.id) ?? 0) + 1);
  return { schemaVersion: 1, evaluationOnly: true,
    definitions: { sourceId: 'Explicit ID in the generated source; future ownership/stability is unproven',
      auxiliary: 'Display-only reference ID derived from the source array index',
      coordinatePatternObjectIds: 'Source IDs matching the current kind/x/y generator formula; not independent persistent identities',
      decals: 'Objects with layer=decal, a subset of objects; nonSolidObjects is a separate overlapping subset' },
    areas, duplicateSourceIds: [...ids].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count })) };
}

/** Intentionally measures raw reconstruction even if the strict backend refuses the source. */
export function roundTripMap(world: World) {
  const before = sourceSnapshot(world), document = evaluationDocument(world);
  const reconstructed = assembleEditorWorld(document), after = sourceSnapshot(reconstructed);
  const same = (a: unknown, b: unknown) => canonicalJSON(a) === canonicalJSON(b);
  const areas = before.areas.map(area => {
    const restored = reconstructed.areas.get(area.id)!;
    const original = world.areas.get(area.id)!;
    return { areaId: area.id, groundEqual: same(area.ground, [...restored.ground]),
      solidMaskEqual: same([...original.solid], [...restored.solid]),
      portalIndexEqual: same([...original.portalAt], [...restored.portalAt]),
      interactionIndexEqual: same([...original.interactionAt], [...restored.interactionAt]),
      interactionsEqual: same(area.interactions, restored.def.interactions), portalsEqual: same(area.portals, restored.def.portals),
      // Restoring absence of source IDs is measurement only: not an approved persistence transformation.
      objectsEqualIgnoringAddedDisplayIds: same(area.objects, restored.def.objects.map((object, index) => {
        const copy = { ...object }; if (!area.objects[index].id) delete copy.id; return copy;
      })),
      addedDisplayIds: area.objects.filter(o => !o.id).length,
      lostDistricts: area.districts?.length ?? 0,
    };
  });
  const backendIssues = validateDocument(document);
  const normalizedOrderChanges = (['objects', 'interactions', 'portals'] as const).flatMap(table =>
    document.areas.filter(area => {
      const ids = document[table].filter(e => e.areaId === area.id).map(e => e.id);
      return !same(ids, [...ids].sort());
    }).map(area => ({ table, areaId: area.id })));
  return { schemaVersion: 1, evaluationOnly: true, measurementOnly: true, backendAccepted: backendIssues.length === 0,
    backendIssues, areas, sourceFieldsRequiredOutsideReferenceScene: ['start', 'catalogs', 'document identity', 'variant', 'districts'],
    variantEqual: same(before.variant, after.variant), variantBefore: before.variant, variantAfter: after.variant,
    startEqualWhenProvidedFromSource: same(before.start, after.start), facilitiesEqual: same(before.facilities, after.facilities),
    areaIterationOrderChanged: !same([...world.areas.keys()], [...reconstructed.areas.keys()]),
    facilityIterationOrderChanged: !same([...world.facilities.keys()], [...reconstructed.facilities.keys()]),
    normalizedOrderChanges,
    limitations: ['Source factories and variant application rules cannot be recovered from a display projection',
      'Backend normalization sorts entities by ID; listed per-area array orders would change',
      'No objectId or returnPortalId is inferred; source incompatibilities remain visible',
      'Raw reconstruction is used only for measurement and is never admitted to the game loader'] };
}
