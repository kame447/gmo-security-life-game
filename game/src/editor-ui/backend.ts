import { EditorSession, serializeChangeSet, type ChangeSet, type EditOperation, type EditorDocument } from '../editor/index.ts';

/** Small UI port: the editor owns neither the document nor its validation/history. */
export interface EditorBackend {
  readonly document: EditorDocument;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  commit(operations: readonly EditOperation[]): EditorDocument;
  undo(): EditorDocument;
  redo(): EditorDocument;
  exportChanges(): ChangeSet;
  serializeChanges(): string;
}

export function createEditorBackend(source: unknown): EditorBackend {
  const session = new EditorSession(source);
  return {
    get document() { return session.document; },
    get canUndo() { return session.canUndo; },
    get canRedo() { return session.canRedo; },
    commit: operations => session.commit(operations),
    undo: () => session.undo(),
    redo: () => session.redo(),
    exportChanges: () => session.exportChanges(),
    serializeChanges: () => serializeChangeSet(session.exportChanges()),
  };
}
