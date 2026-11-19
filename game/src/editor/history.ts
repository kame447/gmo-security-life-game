import { cloneDocument, diffDocuments, prepareChangeSet } from './changes.ts';
import { canonicalJSON, parseDocument } from './schema.ts';
import type { ChangeSet, EditOperation, EditorDocument, EditorValidationContext } from './types.ts';

export interface EditorSessionOptions {
  historyLimit?: number;
  /** Supplied by trusted application code, never derived from an edited document. */
  context?: EditorValidationContext;
}

/** UI-independent snapshots; invalid gestures never alter the document or undo/redo stacks. */
export class EditorSession {
  private readonly baseline: EditorDocument;
  private current: EditorDocument;
  private past: EditorDocument[] = [];
  private future: EditorDocument[] = [];
  private readonly limit: number;
  private readonly context?: EditorValidationContext;

  constructor(document: unknown, options: EditorSessionOptions | number = {}) {
    const resolved = typeof options === 'number' ? { historyLimit: options } : options;
    if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) throw new RangeError('historyLimit must be a positive integer');
    const historyLimit = resolved.historyLimit === undefined ? 100 : resolved.historyLimit;
    if (!Number.isSafeInteger(historyLimit) || historyLimit < 1) throw new RangeError('historyLimit must be a positive integer');
    this.context = resolved.context === undefined ? undefined : structuredClone(resolved.context);
    this.baseline = parseDocument(document, this.context);
    this.current = structuredClone(this.baseline);
    this.limit = historyLimit;
  }
  get document(): EditorDocument { return cloneDocument(this.current); }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  commit(operations: readonly EditOperation[]): EditorDocument {
    const next = prepareChangeSet(this.current, operations, this.context).document;
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
  exportChanges(): ChangeSet { return diffDocuments(this.baseline, this.current, this.context); }
}
