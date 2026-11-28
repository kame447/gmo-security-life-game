import { copy, errorResponse, parseEnvelope, parseWriteRequest, sameJson, SaveError, slotId, timestamp,
  type HttpResponse, type SaveEnvelope, type WriteSaveRequest } from './contract';

/** Supplied ONLY after signature/issuer/audience/token_use/expiry verification. */
export interface AuthenticatedPrincipal { sub: string; canSave?: boolean }
export interface SaveKey { pk: string; sk: string }
export interface StoredSave {
  ownerSub: string;
  save: SaveEnvelope;
  lastWrite: { idempotencyKey: string; expectedRevision: number };
}
/** CAS must be atomic across all writers; reads must be strongly consistent. */
export interface SaveStorage {
  read(key: SaveKey): Promise<StoredSave | undefined>;
  compareAndSwap(key: SaveKey, expectedRevision: number, next: StoredSave): Promise<boolean>;
}

export function authorize(principal: AuthenticatedPrincipal | null, slot: unknown): SaveKey | HttpResponse {
  if (!principal || typeof principal.sub !== 'string' || !principal.sub || principal.sub.length > 128) {
    return errorResponse('UNAUTHENTICATED');
  }
  if (principal.canSave === false) return errorResponse('FORBIDDEN');
  if (!slotId(slot)) return errorResponse('INVALID_REQUEST');
  return { pk: `USER#${encodeURIComponent(principal.sub)}`, sk: `SAVE#${slot}` };
}
function validateStored(principal: AuthenticatedPrincipal, slot: string, current: StoredSave): HttpResponse | undefined {
  if (current.ownerSub !== principal.sub) return errorResponse('FORBIDDEN');
  try {
    if (parseEnvelope(current.save, slot).revision < 1) return errorResponse('CORRUPT_SAVE');
    const last = current.lastWrite;
    if (!last || last.expectedRevision !== current.save.revision - 1 ||
        typeof last.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(last.idempotencyKey)) return errorResponse('CORRUPT_SAVE');
  } catch (error) {
    return errorResponse(error instanceof SaveError && error.code === 'UNSUPPORTED_VERSION' ? error.code : 'CORRUPT_SAVE');
  }
  return undefined;
}

/** Pure read handler. The storage driver obtains current using authorize()'s key. */
export function readSave(principal: AuthenticatedPrincipal | null, slot: string, current?: StoredSave): HttpResponse {
  const key = authorize(principal, slot);
  if ('status' in key) return key;
  if (!current) return errorResponse('NOT_FOUND');
  return validateStored(principal!, slot, current) ?? { status: 200, body: { save: copy(current.save) } };
}
export interface WriteDecision { response: HttpResponse; next?: StoredSave }
/** Pure transition; no client userId, revision or clock is trusted as owner/server time. */
export function writeSave(principal: AuthenticatedPrincipal | null, slot: string, body: unknown,
  current: StoredSave | undefined, serverNow: string): WriteDecision {
  const key = authorize(principal, slot);
  if ('status' in key) return { response: key };
  let request: WriteSaveRequest;
  try { request = parseWriteRequest(body); }
  catch (error) { return { response: errorResponse(error instanceof SaveError ? error.code : 'INVALID_REQUEST') }; }
  if (!timestamp(serverNow)) return { response: errorResponse('UNAVAILABLE') };
  if (current) {
    const invalid = validateStored(principal!, slot, current);
    if (invalid) return { response: invalid };
    if (current.lastWrite.idempotencyKey === request.idempotencyKey) {
      const identical = current.lastWrite.expectedRevision === request.expectedRevision && sameJson(current.save.data, request.data);
      return { response: identical ? { status: 200, body: { save: copy(current.save) } } : errorResponse('IDEMPOTENCY_CONFLICT') };
    }
  }
  if (request.expectedRevision !== (current?.save.revision ?? 0)) {
    return { response: errorResponse('REVISION_CONFLICT', current?.save) };
  }
  if (request.expectedRevision === Number.MAX_SAFE_INTEGER) return { response: errorResponse('UNAVAILABLE') };
  let save: SaveEnvelope;
  try {
    save = parseEnvelope({ schemaVersion: 1, slotId: slot, revision: request.expectedRevision + 1,
      updatedAt: serverNow, data: request.data });
  } catch (error) { return { response: errorResponse(error instanceof SaveError ? error.code : 'INVALID_REQUEST') }; }
  return { response: { status: 200, body: { save } }, next: { ownerSub: principal!.sub, save,
    lastWrite: { idempotencyKey: request.idempotencyKey, expectedRevision: request.expectedRevision } } };
}

/** Effect adapter around pure handlers. No HTTP listener or JWT parsing is installed. */
export class SaveService {
  constructor(private readonly storage: SaveStorage, private readonly now: () => string) {}
  async read(principal: AuthenticatedPrincipal | null, slot: string): Promise<HttpResponse> {
    const key = authorize(principal, slot);
    if ('status' in key) return key;
    try { return readSave(principal, slot, await this.storage.read(key)); }
    catch { return errorResponse('UNAVAILABLE'); }
  }
  async write(principal: AuthenticatedPrincipal | null, slot: string, body: unknown): Promise<HttpResponse> {
    const key = authorize(principal, slot);
    if ('status' in key) return key;
    try {
      const current = await this.storage.read(key);
      const decision = writeSave(principal, slot, body, current, this.now());
      if (!decision.next) return decision.response;
      if (await this.storage.compareAndSwap(key, current?.save.revision ?? 0, decision.next)) return decision.response;
      // Re-evaluate after a race: identical retries succeed; stale writes conflict.
      const raced = writeSave(principal, slot, body, await this.storage.read(key), this.now());
      return raced.next ? errorResponse('UNAVAILABLE') : raced.response;
    } catch { return errorResponse('UNAVAILABLE'); }
  }
}

/** Test/reference implementation; synchronous check+set is atomic in one JS isolate. */
export class MemorySaveStorage implements SaveStorage {
  private readonly rows = new Map<string, StoredSave>();
  private key(key: SaveKey): string { return JSON.stringify([key.pk, key.sk]); }
  async read(key: SaveKey): Promise<StoredSave | undefined> {
    const row = this.rows.get(this.key(key)); return row ? copy(row) : undefined;
  }
  async compareAndSwap(key: SaveKey, expectedRevision: number, next: StoredSave): Promise<boolean> {
    const id = this.key(key);
    if ((this.rows.get(id)?.save.revision ?? 0) !== expectedRevision) return false;
    this.rows.set(id, copy(next)); return true;
  }
}
