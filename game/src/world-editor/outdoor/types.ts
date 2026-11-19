import type { EditorDocument, EditorObject, EditorValidationContext } from '../../editor/types';

/** Existing world model owns the one session/history shared by town and rooms. */
export interface OutdoorHost {
  readonly initial: EditorDocument;
  readonly document: EditorDocument;
  readonly context: EditorValidationContext;
  commit(candidate: EditorDocument): void;
}

/** Area-local policy; global metadata and return destinations use assertWorldEdit. */
export interface OutdoorEditContext { readonly areaId: string }
export type OutdoorPolicy = (before: EditorDocument, after: EditorDocument, context: OutdoorEditContext) => void;

/** Runtime implementation is OutdoorModel in ./model; reason '' means allowed. */
export interface OutdoorModelApi {
  readonly areaId: string;
  object(id: string, document?: EditorDocument): EditorObject | undefined;
  readOnlyReason(id: string): string;
  protectedReason(id: string): string;
  rotationReason(id: string): string;
  candidate(object: EditorObject, adding?: boolean): EditorDocument;
  issues(candidate: EditorDocument): string[];
  create(entryId: string): EditorObject;
  duplicate(id: string): EditorObject;
  move(id: string, x: number, y: number): void;
  remove(id: string): void;
  rotate(id: string): void;
}
