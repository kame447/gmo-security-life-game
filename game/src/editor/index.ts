import { assembleEditorWorld } from './runtime.ts';
import { parseDocument } from './schema.ts';
export * from './types.ts';
export { loadDocument, parseDocument, serializeDocument, validateDocument } from './schema.ts';
export { applyChangeSet, createChangeSet, diffDocuments, loadChangeSet, parseChangeSet, previewChangeSet, serializeChangeSet } from './changes.ts';
export { EditorSession } from './history.ts';
/** Builds a fresh World accepted by the existing Game/Renderer, with no town/NPC source edits. */
export function buildEditorWorld(raw: unknown) { return assembleEditorWorld(parseDocument(raw)); }
