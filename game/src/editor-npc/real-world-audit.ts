/** Read-only, evaluation-only projection. This does not change the game's data source. */
import type { InteractionDef } from '../core/types.ts';
import { assembleEditorWorld } from '../editor/runtime.ts';
import { canonicalJSON, checkEntity, validateDocument } from '../editor/schema.ts';
import { EditorValidationError, type EditorDocument, type EditorInteraction, type ValidationIssue } from '../editor/types.ts';
import type { AreaRuntime, World } from '../world/runtime.ts';
import { T, isSolidGround } from '../world/tiles.ts';
import { referenceScene } from '../editor-ui/map/reference.ts';
import type { DryRunResult, SourceIdentity } from '../editor-persistence/common.ts';
import { dryRunDocument } from '../editor-persistence/dry-run.ts';
import { validateNpc } from './model.ts';

type Footprint = { x: number; y: number; w?: number; h?: number };
const overlaps = (a: Footprint, b: Footprint): boolean =>
  a.x < b.x + (b.w ?? 1) && b.x < a.x + (a.w ?? 1) &&
  a.y < b.y + (b.h ?? 1) && b.y < a.y + (a.h ?? 1);

export interface NpcInventoryRow {
  areaId: string;
  areaName: string;
  npc: InteractionDef;
  footprint: { w: number; h: number; widthDefaulted: boolean; heightDefaulted: boolean };
  outOfBoundsCells: { x: number; y: number }[];
  groundSolidCells: { x: number; y: number }[];
  indexedInteractionIds: (string | null)[];
  solidCells: (boolean | null)[];
  overlappingObjects: { index: number; id: string | null; kind: string; solid: boolean }[];
  overlappingInteractions: string[];
  overlappingPortals: string[];
}

/** Runtime NPCs are interactions: include the actual lookup and collision relations. */
export function inventoryNpcs(world: World): NpcInventoryRow[] {
  const rows: NpcInventoryRow[] = [];
  for (const area of world.areas.values()) for (const npc of area.interactions) {
    if (npc.kind !== 'npc') continue;
    const outOfBoundsCells: { x: number; y: number }[] = [], groundSolidCells: { x: number; y: number }[] = [];
    const indexedInteractionIds: (string | null)[] = [], solidCells: (boolean | null)[] = [];
    for (let y = npc.y; y < npc.y + (npc.h ?? 1); y++) for (let x = npc.x; x < npc.x + (npc.w ?? 1); x++) {
      const index = y * area.width + x;
      const inBounds = x >= 0 && y >= 0 && x < area.width && y < area.height;
      if (!inBounds) outOfBoundsCells.push({ x, y });
      else if (isSolidGround(area.ground[index])) groundSolidCells.push({ x, y });
      indexedInteractionIds.push(inBounds ? area.interactionAt.get(index)?.id ?? null : null);
      solidCells.push(inBounds ? area.solid[index] === 1 : null);
    }
    rows.push({
      areaId: area.def.id, areaName: area.def.name, npc: structuredClone(npc),
      footprint: { w: npc.w ?? 1, h: npc.h ?? 1, widthDefaulted: npc.w === undefined, heightDefaulted: npc.h === undefined },
      outOfBoundsCells, groundSolidCells, indexedInteractionIds, solidCells,
      overlappingObjects: area.objects.flatMap((object, index) => overlaps(npc, object)
        ? [{ index, id: object.id ?? null, kind: object.kind, solid: object.solid }] : []),
      overlappingInteractions: area.interactions.filter(other => other !== npc && overlaps(npc, other)).map(other => other.id),
      overlappingPortals: area.def.portals.filter(portal => overlaps(npc, portal.from)).map(portal => portal.id),
    });
  }
  return rows;
}

/**
 * Build an unvalidated snapshot for comparing representations, not an apply source.
 * Anonymous objects receive temporary array-index IDs solely to fit EditorDocument.
 */
export function projectWorldForNpcAudit(world: World): { document: EditorDocument; temporaryObjectIds: string[] } {
  const scene = referenceScene(world);
  const document: EditorDocument = {
    schemaVersion: 1, id: world.variant.id, tileSize: 16, start: structuredClone(world.start),
    catalogs: { sprites: [], eventKeys: [] }, ...structuredClone(scene),
  };
  const temporaryObjectIds: string[] = [];
  for (const { def } of world.areas.values()) {
    const projectedObjects = document.objects.filter(object => object.areaId === def.id);
    def.objects.forEach((object, index) => {
      if (!object.id) temporaryObjectIds.push(projectedObjects[index].id);
    });
    for (const interaction of def.interactions) {
      if (interaction.sprite) document.catalogs.sprites.push(interaction.sprite);
      document.catalogs.eventKeys.push(interaction.eventKey);
    }
  }
  document.catalogs.sprites = [...new Set(document.catalogs.sprites)].sort();
  document.catalogs.eventKeys = [...new Set(document.catalogs.eventKeys)].sort();
  return { document, temporaryObjectIds };
}

/** NPC form checks and backend shape checks, independent of a whole-world document failure. */
export function checkNpcFields(npc: EditorInteraction): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  try { validateNpc(npc); }
  catch (error) {
    if (!(error instanceof EditorValidationError)) throw error;
    issues.push(...error.issues);
  }
  checkEntity('interactions', npc, 'interaction', issues);
  return issues;
}

/** Test an unchanged NPC in an intentionally empty world; this does not prove real-world context is valid. */
export function checkNpcInIsolation(area: AreaRuntime, npc: InteractionDef): ValidationIssue[] {
  const x = npc.x > 0 ? npc.x - 1 : npc.x + (npc.w ?? 1);
  const document: EditorDocument = {
    schemaVersion: 1, id: 'npc-isolation-audit', tileSize: 16,
    start: { areaId: area.def.id, x, y: npc.y, facing: 'down' },
    catalogs: { sprites: npc.sprite ? [npc.sprite] : [], eventKeys: [npc.eventKey] },
    areas: [{ id: area.def.id, name: area.def.name, kind: area.def.kind, width: area.width, height: area.height,
      ground: Array.from({ length: area.width * area.height }, () => T.GRASS) }],
    facilities: [], objects: [], portals: [], interactions: [{ ...structuredClone(npc), areaId: area.def.id }],
  };
  return validateDocument(document);
}

/** Unvalidated reconstruction is deliberate: current generated worlds may fail editor validation. */
export function reconstructNpcAuditWorld(document: EditorDocument): World {
  return assembleEditorWorld(structuredClone(document));
}

/** Keep source IDs distinct from temporary display IDs for every table. */
export function npcSourceIdentities(world: World): SourceIdentity[] {
  const scene = referenceScene(world);
  const records: SourceIdentity[] = scene.areas.map(area => ({ table: 'areas', id: area.id, areaId: area.id, sourceId: true }));
  records.push(...scene.facilities.map(facility => ({ table: 'facilities' as const, id: facility.id, areaId: facility.areaId, sourceId: true })));
  for (const area of scene.areas) for (const table of ['objects', 'interactions', 'portals'] as const) {
    const source = world.areas.get(area.id)!.def[table];
    scene[table].filter(entity => entity.areaId === area.id).forEach((entity, sourceIndex) => {
      records.push({ table, id: entity.id, areaId: area.id, sourceId: !!source[sourceIndex].id, sourceIndex });
    });
  }
  return records;
}

/** Add the NPC form's non-empty-dialogue rule to the shared backend/scope gates. */
export async function dryRunNpc(world: World, document: EditorDocument, identities: readonly SourceIdentity[],
  request: unknown, scope: unknown): Promise<DryRunResult> {
  const result = await dryRunDocument(world, document, identities, request, scope, 'npc');
  if (!request || typeof request !== 'object' || !('operations' in request) || !Array.isArray(request.operations)) return result;
  for (const [index, operation] of request.operations.entries()) {
    if (!operation || typeof operation !== 'object' || !('table' in operation) || operation.table !== 'interactions' ||
        !('after' in operation)) continue;
    try { validateNpc(operation.after as EditorInteraction); }
    catch (error) {
      if (!(error instanceof EditorValidationError)) throw error;
      for (const issue of error.issues) result.issues.push({ ...issue, stage: 'backend',
        path: `operations[${index}].after${issue.path.startsWith('interaction') ? issue.path.slice('interaction'.length) : ''}` });
      result.checks.backend = 'failed'; result.status = 'rejected'; delete result.candidate;
    }
  }
  return result;
}

export function auditNpcWorld(world: World) {
  const inventory = inventoryNpcs(world);
  const projected = projectWorldForNpcAudit(world);
  const fullIssues = validateDocument(projected.document);
  const reconstructed = reconstructNpcAuditWorld(projected.document);
  const after = inventoryNpcs(reconstructed);
  const byArea = [...world.areas.values()].map(area => ({ areaId: area.def.id, areaName: area.def.name,
    npcCount: inventory.filter(row => row.areaId === area.def.id).length }));
  const ids = new Map<string, number>();
  for (const table of ['areas', 'facilities', 'objects', 'interactions', 'portals'] as const) {
    for (const entity of projected.document[table]) ids.set(entity.id, (ids.get(entity.id) ?? 0) + 1);
  }
  return {
    variant: structuredClone(world.variant), byArea, npcCount: inventory.length, temporaryObjectIds: projected.temporaryObjectIds,
    rows: inventory.map(row => {
      const editorNpc = projected.document.interactions.find(i => i.areaId === row.areaId && i.id === row.npc.id)!;
      const area = world.areas.get(row.areaId)!;
      const reconstructedRow = after.find(item => item.areaId === row.areaId && item.npc.id === row.npc.id);
      return { ...row, fieldIssues: checkNpcFields(editorNpc), isolatedBackendIssues: checkNpcInIsolation(area, row.npc),
        roundTripSameNpc: canonicalJSON(row.npc) === canonicalJSON(reconstructedRow?.npc) };
    }),
    fullDocumentIssues: fullIssues,
    duplicateDocumentIds: [...ids].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count })),
    omittedAreaDistricts: [...world.areas.values()].filter(area => area.def.districts !== undefined).map(area => area.def.id),
    reconstructedVariant: structuredClone(reconstructed.variant),
  };
}
