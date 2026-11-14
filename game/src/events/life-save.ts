/**
 * Standalone adapter for a save's optional `life` section. No storage or session imports.
 * Recovery is readable gameplay state, not permission to overwrite the original data.
 */
import { LifeState, type LifeHistoryEntry, type LifeStateData } from './life-state';

export type LifeSaveJson = null | boolean | number | string | LifeSaveJson[] | { [key: string]: LifeSaveJson };
export interface LifeSavedHistoryEntry extends LifeHistoryEntry { [key: string]: LifeSaveJson }
export interface LifeSaveData extends LifeStateData {
  [key: string]: LifeSaveJson;
  history: LifeSavedHistoryEntry[];
}

export interface LifeSaveOptions { maxBytes?: number }
export type LifeSaveStatus = 'missing' | 'ready' | 'recovered' | 'protected';
export interface LifeSaveIssue {
  /** JSON pointer within life; no input values are copied into diagnostics. */
  readonly path: string;
  readonly code: 'invalid-json' | 'unsupported-version' | 'invalid-field';
}
export class LifeSaveError extends Error {
  constructor(readonly reason: 'protected-life' | 'invalid-data' | 'too-large') {
    super(reason);
    this.name = 'LifeSaveError';
  }
}
export interface LifeSaveRestoration {
  readonly state: LifeState;
  readonly status: LifeSaveStatus;
  readonly issues: readonly LifeSaveIssue[];
  /** Plain JSON only. Throws on protected/recovered input, invalid state or capacity overflow. */
  serialize(options?: LifeSaveOptions): LifeSaveData;
}

/**
 * Pass the life section after the outer save/variant has been validated. Undefined means
 * a legacy save without life. Unknown v1 fields/IDs are retained; unsupported versions
 * are never interpreted as v1. Restore does not apply any event effects.
 */
export function restoreLifeSave(raw?: unknown): LifeSaveRestoration {
  const issues: LifeSaveIssue[] = [];
  let source: LifeSaveJson | undefined;
  let jsonValid = true;
  if (raw !== undefined) {
    try { source = copyJson(raw); }
    catch { jsonValid = false; issues.push({ path: '', code: 'invalid-json' }); }
  }
  let state = new LifeState();
  let status: LifeSaveStatus;
  if (raw === undefined) status = 'missing';
  else if (!record(raw) || field(raw, 'v') !== 1) {
    status = 'protected';
    issues.push({ path: '/v', code: 'unsupported-version' });
  } else {
    // On valid JSON, decode our own snapshot so later caller mutations cannot affect it.
    state = decodeV1(jsonValid ? source : raw, issues);
    status = !jsonValid ? 'protected' : issues.length ? 'recovered' : 'ready';
  }
  const original = status === 'ready' ? source as LifeSaveData : undefined;
  return Object.freeze({
    state, status, issues: Object.freeze(issues.map(issue => Object.freeze(issue))),
    serialize(options: LifeSaveOptions = {}): LifeSaveData {
      if (status === 'protected' || status === 'recovered') throw new LifeSaveError('protected-life');
      const current = copyJson(state.toJSON()) as LifeSaveData;
      const errors: LifeSaveIssue[] = [];
      decodeV1(current, errors);
      if (errors.length) throw new LifeSaveError('invalid-data');
      // LifeState's supported record() operation appends. Never discard old entries or
      // accidentally attach their unknown metadata to different, reordered experiences.
      if (original?.history.some((entry, index) => entry.eventId !== current.history[index]?.eventId ||
          entry.choiceId !== current.history[index]?.choiceId)) throw new LifeSaveError('invalid-data');
      const data: LifeSaveData = { ...original, ...current,
        history: current.history.map((entry, index) => ({ ...original?.history[index], ...entry })) };
      const result = copyJson(data) as LifeSaveData;
      if (options.maxBytes !== undefined) {
        if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) throw new LifeSaveError('invalid-data');
        if (new TextEncoder().encode(JSON.stringify(result)).length > options.maxBytes) throw new LifeSaveError('too-large');
      }
      return result;
    },
  });
}

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Reading recovery candidates must not invoke getters or follow inherited members. */
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
}

function pointer(key: string): string { return key.replace(/~/g, '~0').replace(/\//g, '~1'); }

function decodeV1(raw: unknown, issues: LifeSaveIssue[]): LifeState {
  const state = new LifeState();
  const invalid = (path: string): void => { issues.push({ path, code: 'invalid-field' }); };
  for (const section of ['stats', 'flags'] as const) {
    const values = field(raw, section);
    if (!record(values)) { invalid(`/${section}`); continue; }
    for (const key of Object.keys(values)) {
      const value = field(values, key);
      if (section === 'stats' && typeof value === 'number' && Number.isFinite(value)) state.stats.set(key, value);
      else if (section === 'flags' && typeof value === 'boolean') state.flags.set(key, value);
      else invalid(`/${section}/${pointer(key)}`);
    }
  }
  const history = field(raw, 'history');
  if (!Array.isArray(history)) invalid('/history');
  else for (let index = 0; index < history.length; index++) {
    const path = `/history/${index}`;
    const entry = field(history, String(index));
    if (!record(entry)) { invalid(path); continue; }
    const eventId = field(entry, 'eventId');
    const choiceId = field(entry, 'choiceId');
    if (typeof eventId !== 'string') { invalid(`${path}/eventId`); continue; }
    if (typeof choiceId === 'string' || choiceId === null) state.record(eventId, choiceId);
    else {
      // There is evidence of experience, but no evidence for a particular choice.
      // This prevents replay of once-only effects without inventing a chosen branch.
      state.record(eventId, null);
      invalid(`${path}/choiceId`);
    }
  }
  return state;
}

/**
 * Lossless JSON snapshot. Inspect descriptors before JSON.stringify can invoke getters,
 * toJSON or silently remove unsupported values. Same depth boundary as the save candidate;
 * not an event/history count or byte limit. Shared references are allowed, cycles are not.
 */
function copyJson(value: unknown, parents = new Set<object>(), depth = 0): LifeSaveJson {
  const invalid = (): never => { throw new LifeSaveError('invalid-data'); };
  if (depth > 64) return invalid();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : invalid();
  if (!value || typeof value !== 'object' || parents.has(value)) return invalid();
  if ((!Array.isArray(value) && !record(value)) || Object.getOwnPropertySymbols(value).length) return invalid();
  parents.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  let result: LifeSaveJson;
  if (Array.isArray(value)) {
    if (Object.keys(descriptors).length !== value.length + 1) return invalid();
    const items: LifeSaveJson[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[index];
      if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
      items.push(copyJson(descriptor.value, parents, depth + 1));
    }
    result = items;
  } else {
    result = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => {
      if (!descriptor.enumerable || !('value' in descriptor)) return invalid();
      return [key, copyJson(descriptor.value, parents, depth + 1)];
    }));
  }
  parents.delete(value);
  return result;
}
