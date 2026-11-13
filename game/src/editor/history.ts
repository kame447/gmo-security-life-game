import { applyChangeSet, createChangeSet, diffDocuments } from './changes.ts';
import { canonicalJSON, parseDocument } from './schema.ts';
import type { ChangeSet, EditOperation, EditorDocument } from './types.ts';

/** UI-independent snapshots; invalid gestures never alter the document or undo/redo stacks. */
export class EditorSession {
  private readonly baseline: EditorDocument;
  private current: EditorDocument;
  private past: EditorDocument[] = [];
  private future: EditorDocument[] = [];
  private readonly limit: number;

  constructor(document: unknown, historyLimit = 100) {
    if (!Number.isSafeInteger(historyLimit) || historyLimit < 1) throw new RangeError('historyLimit must be a positive integer');
    this.baseline = parseDocument(document);
    this.current = structuredClone(this.baseline);
    this.limit = historyLimit;
  }
  get document(): EditorDocument { return structuredClone(this.current); }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  commit(operations: readonly EditOperation[]): EditorDocument {
    const next = applyChangeSet(this.current, createChangeSet(this.current, operations));
    if (canonicalJSON(next) !== canonicalJSON(this.current)) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
      this.current = next;
      this.future = [];
    }
    return this.document;
  }
  undo(): EditorDocument {
    const previous = this.past.pop();
    if (previous) { this.future.push(this.current); this.current = previous; }
    return this.document;
  }
  redo(): EditorDocument {
    const next = this.future.pop();
    if (next) { this.past.push(this.current); this.current = next; }
    return this.document;
  }
  exportChanges(): ChangeSet { return diffDocuments(this.baseline, this.current); }
}
