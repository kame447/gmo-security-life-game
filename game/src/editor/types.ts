import type { AreaKind, FacilityDef, InteractionDef, ObjectDef, PortalDef, SpawnPoint } from '../core/types.ts';

/** JSON authoring data, independent of generated town/NPC definitions and editor UI state. */
export interface EditorArea {
  id: string;
  name: string;
  kind: AreaKind;
  width: number;
  height: number;
  ground: number[];
}
export interface EditorObject extends ObjectDef { id: string; areaId: string }
export interface EditorInteraction extends InteractionDef {
  areaId: string;
  /** Object/sign interactions may share the footprint of their explicitly linked object. */
  objectId?: string;
}
export interface EditorPortal extends PortalDef {
  areaId: string;
  /** Optional reciprocal door reference; omit for an intentional one-way portal. */
  returnPortalId?: string;
}
export interface EditorTables {
  areas: EditorArea;
  facilities: FacilityDef;
  objects: EditorObject;
  interactions: EditorInteraction;
  portals: EditorPortal;
}
export type EditorTable = keyof EditorTables;
export type EditorEntity = EditorTables[EditorTable];

export interface EditorDocument {
  schemaVersion: 1;
  id: string;
  tileSize: 16;
  start: SpawnPoint;
  /** References only; branching scenarios and sprite implementation remain outside this file. */
  catalogs: { sprites: string[]; eventKeys: string[] };
  areas: EditorArea[];
  facilities: FacilityDef[];
  objects: EditorObject[];
  interactions: EditorInteraction[];
  portals: EditorPortal[];
}

type OperationFor<K extends EditorTable> =
  | { type: 'add'; table: K; id: string; after: EditorTables[K] }
  | { type: 'delete'; table: K; id: string; before: EditorTables[K] }
  | { type: 'update' | 'move'; table: K; id: string; before: EditorTables[K]; after: EditorTables[K] };
export type EditOperation = { [K in EditorTable]: OperationFor<K> }[EditorTable];

export interface ChangeSet {
  schemaVersion: 1;
  documentId: string;
  /** Exact semantic baseline: detects concurrent edits without hash collisions or code execution. */
  baseDocument: EditorDocument;
  operations: EditOperation[];
}
export interface ValidationIssue { path: string; code: string; message: string }
export class EditorValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues.map(i => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'EditorValidationError';
    this.issues = issues;
  }
}
export const EDITOR_TABLES: readonly EditorTable[] = ['areas', 'facilities', 'objects', 'interactions', 'portals'];
