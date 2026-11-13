/** Proposed wire contract only. No game, DOM, JWT verifier or AWS dependency. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type GameData = { [key: string]: Json } & { v: number };
export const ENVELOPE_VERSION = 1;
export const GAME_VERSION = 1;
/** UTF-8 game data limit; proposal, not an agreed gameplay limit. */
export const MAX_SAVE_BYTES = 128 * 1024;
/** Shared request/envelope bound, with room for all validated metadata. */
export const MAX_SAVE_WIRE_BYTES = MAX_SAVE_BYTES + 1024;
export const LEGACY_SAVE_KEY = 'slg-map-save-v1';

export interface SaveEnvelope {
  schemaVersion: 1;
  slotId: string;
  /** 0 is local/unpublished; server revisions start at 1. */
  revision: number;
  updatedAt: string;
  data: GameData;
}
export interface WriteSaveRequest {
  schemaVersion: 1;
  expectedRevision: number;
  idempotencyKey: string;
  data: GameData;
}
/** GET path parameters; the verified principal is supplied outside the wire body. */
export interface ReadSaveRequest { slotId: string }
export interface SaveResponse { save: SaveEnvelope }
export const ERROR_HTTP = {
  INVALID_REQUEST: 400, TOO_LARGE: 413, UNSUPPORTED_VERSION: 422,
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
  REVISION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409,
  CORRUPT_SAVE: 500, UNAVAILABLE: 503,
} as const;
export type ApiErrorCode = keyof typeof ERROR_HTTP;
export interface ErrorResponse { error: { code: ApiErrorCode; current?: SaveEnvelope } }
export interface HttpResponse { status: number; body: unknown }

export class SaveError extends Error {
  constructor(readonly code: ApiErrorCode, message = code) { super(message); }
}
export function errorResponse(code: ApiErrorCode, current?: SaveEnvelope): HttpResponse {
  return { status: ERROR_HTTP[code], body: { error: { code, ...(current ? { current: copy(current) } : {}) } } satisfies ErrorResponse };
}
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function slotId(value: unknown): value is string {
  // Proposal: caller chooses an opaque ID; neither user IDs nor paths belong here.
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,31}$/.test(value);
}
export function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

/** Reject lossy JS values instead of silently dropping unknown properties. */
export function jsonText(value: unknown, maxBytes = MAX_SAVE_BYTES): string {
  const parents = new Set<object>();
  function visit(item: unknown, depth: number): void {
    if (depth > 64) throw new SaveError('INVALID_REQUEST');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || !item || parents.has(item)) throw new SaveError('INVALID_REQUEST');
    const proto: unknown = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) throw new SaveError('INVALID_REQUEST');
    if (Object.getOwnPropertySymbols(item).length) throw new SaveError('INVALID_REQUEST');
    parents.add(item);
    if (Array.isArray(item)) {
      if (Object.getOwnPropertyNames(item).length !== item.length + 1) throw new SaveError('INVALID_REQUEST');
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, i);
        if (!descriptor || !('value' in descriptor)) throw new SaveError('INVALID_REQUEST');
        visit(descriptor.value, depth + 1);
      }
    } else {
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(item))) {
        if (!descriptor.enumerable || !('value' in descriptor)) throw new SaveError('INVALID_REQUEST');
        visit(descriptor.value, depth + 1);
      }
    }
    parents.delete(item);
  }
  visit(value, 0);
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > maxBytes) throw new SaveError('TOO_LARGE');
  return text;
}
/** Internal clone of already validated JSON. Wrapper depth is not a wire limit. */
export function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

/** Stable comparison, independent of JSON member order. Never used as a security hash. */
export function sameJson(a: unknown, b: unknown): boolean {
  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
    return value;
  }
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}
export function parseGameData(value: unknown, currentVersion = GAME_VERSION): GameData {
  jsonText(value);
  if (!object(value) || !revision(value.v) || value.v === 0) throw new SaveError('INVALID_REQUEST');
  if (value.v !== currentVersion) throw new SaveError('UNSUPPORTED_VERSION');
  return copy(value) as GameData;
}
export function parseEnvelope(value: unknown, expectedSlot?: string): SaveEnvelope {
  jsonText(value, MAX_SAVE_WIRE_BYTES);
  if (!object(value)) throw new SaveError('INVALID_REQUEST');
  if (!revision(value.schemaVersion) || value.schemaVersion === 0) throw new SaveError('INVALID_REQUEST');
  if (value.schemaVersion !== ENVELOPE_VERSION) throw new SaveError('UNSUPPORTED_VERSION');
  if (!slotId(value.slotId) || (expectedSlot !== undefined && value.slotId !== expectedSlot) ||
      !revision(value.revision) || !timestamp(value.updatedAt)) throw new SaveError('INVALID_REQUEST');
  parseGameData(value.data);
  return copy(value) as unknown as SaveEnvelope;
}
export function parseWriteRequest(value: unknown): WriteSaveRequest {
  jsonText(value, MAX_SAVE_WIRE_BYTES);
  if (!object(value)) throw new SaveError('INVALID_REQUEST');
  if (!revision(value.schemaVersion) || value.schemaVersion === 0) throw new SaveError('INVALID_REQUEST');
  if (value.schemaVersion !== ENVELOPE_VERSION) throw new SaveError('UNSUPPORTED_VERSION');
  if (!revision(value.expectedRevision) || typeof value.idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(value.idempotencyKey)) throw new SaveError('INVALID_REQUEST');
  return { schemaVersion: 1, expectedRevision: value.expectedRevision, idempotencyKey: value.idempotencyKey,
    data: parseGameData(value.data) };
}
