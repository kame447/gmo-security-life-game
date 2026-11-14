/** Local persistence; failures are observable without stopping exploration. */
import { hasFutureSaveSection, parseSave, preserveSaveExtensions, type SaveData } from '../state/save';
import { checkSaveTree, saveJsonText, saveRecord, SaveValidationError, type SaveValidationOptions } from '../state/save-json';
import type { PhoneBudgetConfig } from '../phone/budget-config';
import type { World } from '../world';

const SAVE_KEY = 'slg-map-save-v1';
const PROTECTED_KEY = `${SAVE_KEY}.protected`;

export interface SaveReadOptions extends SaveValidationOptions {
  initialPhoneOwned?: boolean;
  phoneDataConfig?: Readonly<PhoneBudgetConfig>;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface SaveStoreOptions extends SaveValidationOptions { storage?: () => SaveStorage }
export type SaveFailure = 'quota-exceeded' | 'storage-unavailable' | 'storage-error' |
  'invalid-data' | 'too-large' | 'protected-save';
export interface SaveStatus {
  readonly failed: boolean;
  readonly reason: SaveFailure | null;
  readonly pending: boolean;
  readonly retryable: boolean;
  /** The latest flush saw a write since this session's last observation. */
  readonly changed: boolean;
  /** An unreadable old value has been preserved during this session. */
  readonly backedUp: boolean;
}

function storageFailure(error: unknown): SaveFailure {
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota-exceeded';
  if (name === 'SecurityError' || name === 'ReferenceError') return 'storage-unavailable';
  return 'storage-error';
}

/** A store owns one session's retry snapshot. No timer, UI, purchase or remote API. */
export function createSaveStore(options: SaveStoreOptions = {}) {
  const storage = options.storage ?? (() => localStorage);
  let failure: SaveFailure | null = null;
  let pending: string | undefined;
  let observed: string | null | undefined;
  let unreadAtStartup = false;
  let changed = false;
  let backedUp = false;

  function fail(reason: SaveFailure): false { failure = reason; return false; }
  function saveStatus(): SaveStatus {
    return { failed: failure !== null, reason: failure, pending: pending !== undefined,
      retryable: pending !== undefined, changed, backedUp };
  }

  function loadSave(world: World, readOptions: SaveReadOptions = {}): SaveData | undefined {
    let raw: string | null;
    try { raw = storage().getItem(SAVE_KEY); }
    catch (error) { unreadAtStartup = true; fail(storageFailure(error)); return undefined; }
    observed = raw;
    unreadAtStartup = false;
    if (raw === null) { if (pending === undefined) failure = null; return undefined; }
    try {
      const saved = parseSave(JSON.parse(raw), world, readOptions.initialPhoneOwned, readOptions.phoneDataConfig,
        { maxBytes: readOptions.maxBytes ?? options.maxBytes });
      if (!saved) { fail('protected-save'); return undefined; }
      if (pending === undefined) failure = null;
      return saved;
    } catch { fail('protected-save'); return undefined; }
  }

  function flush(): boolean {
    if (pending === undefined) return failure === null;
    let target: SaveStorage;
    let raw: string | null;
    try { target = storage(); raw = target.getItem(SAVE_KEY); }
    catch (error) { return fail(storageFailure(error)); }
    changed = observed !== undefined && raw !== observed;
    const current = JSON.parse(pending) as SaveData;
    let previous: unknown;
    let protect = unreadAtStartup && raw !== null;
    if (raw !== null) {
      try {
        previous = JSON.parse(raw);
        checkSaveTree(previous, true);
        if (!saveRecord(previous) || previous.v !== 1 || previous.variantId !== current.variantId ||
            hasFutureSaveSection(previous)) protect = true;
      } catch { protect = true; }
    }
    let text: string;
    try { text = saveJsonText(preserveSaveExtensions(protect ? undefined : previous, current), options); }
    catch (error) {
      if (error instanceof SaveValidationError && error.reason === 'too-large') return fail('too-large');
      // The caller's JSON was validated when queued. Only the old value could
      // have introduced invalid extensions, so preserve it before starting anew.
      protect = raw !== null;
      text = pending;
    }
    if (protect && raw !== null) {
      try {
        const backup = target.getItem(PROTECTED_KEY);
        if (backup !== null && backup !== raw) return fail('protected-save');
        if (backup === null) target.setItem(PROTECTED_KEY, raw);
        backedUp = true;
      } catch { return fail('protected-save'); }
    }
    // Keep the original caller snapshot in pending. A retry must merge the then
    // current disk extensions, rather than replay extensions from an earlier try.
    observed = raw;
    try { target.setItem(SAVE_KEY, text); }
    catch (error) { return fail(storageFailure(error)); }
    observed = text;
    pending = undefined;
    failure = null;
    unreadAtStartup = false;
    return true;
  }

  /** True means setItem succeeded. Invalid input never replaces an earlier valid retry. */
  function writeSave(data: SaveData): boolean {
    try {
      checkSaveTree(data);
      if (data.v !== 1 || typeof data.variantId !== 'string' || hasFutureSaveSection(data)) return fail('invalid-data');
      pending = saveJsonText(data, options);
    } catch (error) {
      return fail(error instanceof SaveValidationError ? error.reason : 'invalid-data');
    }
    return flush();
  }

  /** Retry the latest valid snapshot; never an older one after a successful save. */
  return { loadSave, writeSave, saveStatus, retrySave: flush };
}

const defaultStore = createSaveStore();
export const loadSave = defaultStore.loadSave;
export const writeSave = defaultStore.writeSave;
export const saveStatus = defaultStore.saveStatus;
export const retrySave = defaultStore.retrySave;
