/** Evaluation only. No persistence option or game loading path is selected here. */
import type { AreaDef, FacilityDef, SpawnPoint, VariantDef } from '../core/types.ts';
import { canonicalJSON } from '../editor/schema.ts';
import type { EditOperation, EditorDocument, EditorTable, ValidationIssue } from '../editor/types.ts';
import type { World } from '../world/runtime.ts';

export interface WorldSourceSnapshot {
  schemaVersion: 1;
  areas: (Omit<AreaDef, 'ground'> & { ground: number[] })[];
  facilities: FacilityDef[];
  start: SpawnPoint;
  variant: VariantDef;
}

/** All generated source fields, including districts and variant metadata, detached from World. */
export function sourceSnapshot(world: World): WorldSourceSnapshot {
  const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return structuredClone({ schemaVersion: 1,
    areas: [...world.areas.values()].map(area => ({ ...area.def, ground: Array.from(area.def.ground) })).sort(byId),
    facilities: [...world.facilities.values()].sort(byId), start: world.start, variant: world.variant });
}

/** SHA-256 of the backend's canonical JSON (UTF-8, two spaces, trailing LF). */
export async function fingerprintValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJSON(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** A semantic generated-data fingerprint, not a hash of handwritten TypeScript bytes. */
export function sourceFingerprint(world: World): Promise<string> { return fingerprintValue(sourceSnapshot(world)); }

export type CheckStage = 'fingerprint' | 'ids' | 'backend' | 'scope';
export type CheckStatus = 'passed' | 'failed' | 'skipped';
export interface EditTarget { table: EditorTable; id: string }
export interface DryRunRequest {
  schemaVersion: 1;
  sourceFingerprint: string;
  operations: EditOperation[];
}
/** Trusted operator selection; supplied separately from the proposed patch. */
export interface DryRunScope { areaIds: string[]; targets: EditTarget[] }
export interface DryRunIssue extends ValidationIssue { stage: CheckStage }
export interface DryRunResult {
  schemaVersion: 1;
  evaluationOnly: true;
  domain: 'map' | 'npc';
  status: 'passed' | 'rejected';
  sourceFingerprint: string;
  expectedFingerprint: string | null;
  checks: Record<CheckStage, CheckStatus>;
  issues: DryRunIssue[];
  changes: { type: EditOperation['type']; table: EditorTable; id: string }[];
  /** Returned only after every gate passes. Never written to a source or runtime data path. */
  candidate?: EditorDocument;
}
