/** Local JSON safety only. A future API adapter supplies its own byte limit. */
export interface SaveValidationOptions { maxBytes?: number }
export class SaveValidationError extends Error {
  constructor(readonly reason: 'invalid-data' | 'too-large') { super(reason); }
}

export function saveRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Inspect descriptors so getters/toJSON cannot silently change or discard data. */
export function checkSaveTree(value: unknown, repairableScalars = false): void {
  const parents = new Set<object>();
  function visit(item: unknown, depth: number): void {
    if (depth > 64) throw new SaveValidationError('invalid-data');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && (Number.isFinite(item) || repairableScalars)) return;
    if (item === undefined && repairableScalars) return;
    if (!item || typeof item !== 'object' || parents.has(item)) throw new SaveValidationError('invalid-data');
    const prototype: unknown = Object.getPrototypeOf(item);
    if ((!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) ||
        Object.getOwnPropertySymbols(item).length) throw new SaveValidationError('invalid-data');
    parents.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Array.isArray(item)) {
      if (Object.keys(descriptors).length !== item.length + 1) throw new SaveValidationError('invalid-data');
      for (let i = 0; i < item.length; i++) {
        const descriptor = descriptors[i];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new SaveValidationError('invalid-data');
        visit(descriptor.value, depth + 1);
      }
    } else {
      for (const descriptor of Object.values(descriptors)) {
        if (!descriptor.enumerable || !('value' in descriptor)) throw new SaveValidationError('invalid-data');
        visit(descriptor.value, depth + 1);
      }
    }
    parents.delete(item);
  }
  visit(value, 0);
}

export function saveJsonText(value: unknown, { maxBytes }: SaveValidationOptions = {}): string {
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
    throw new SaveValidationError('invalid-data');
  }
  checkSaveTree(value);
  const text = JSON.stringify(value);
  if (maxBytes !== undefined && new TextEncoder().encode(text).length > maxBytes) {
    throw new SaveValidationError('too-large');
  }
  return text;
}

export function copySaveJson<T>(value: T, options?: SaveValidationOptions): T {
  return JSON.parse(saveJsonText(value, options)) as T;
}
