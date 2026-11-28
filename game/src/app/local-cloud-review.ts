/** Local-only account/save demonstration. No JWT, HTTP, AWS or real identity provider. */
import { copy, object, parseEnvelope, parseGameData, SaveError, type ApiErrorCode, type HttpResponse, type SaveEnvelope } from '../save-api/contract';
import { readSave, writeSave, type StoredSave } from '../save-api/server';
import type { SaveData } from '../state/save';

export const REVIEW_ACCOUNTS = ['account-a', 'account-b'] as const;
export type ReviewAccount = typeof REVIEW_ACCOUNTS[number];
export const REVIEW_CLOUD_PREFIX = 'slg-cloud-review-v1:';
const SLOT = 'main';
export type ReviewCloudProblem = ApiErrorCode | 'LOCAL_UNAVAILABLE' | 'SESSION_CHANGED';
export interface ReviewCloudStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface ReviewCloudState {
  account?: ReviewAccount;
  confirmed?: SaveEnvelope;
  conflict?: SaveEnvelope;
  problem?: ReviewCloudProblem;
}
export interface ReviewCloudCandidate {
  account: ReviewAccount;
  generation: number;
  envelope: SaveEnvelope;
  data: SaveData;
}
export interface ReviewCloudOptions {
  storage?: () => ReviewCloudStorage;
  now?: () => string;
  newId?: () => string;
  locks?: Pick<LockManager, 'request'> | null;
}

/** Validate the transport shape; world/story compatibility belongs to the restore callback. */
export function copyReviewSave(value: unknown): SaveData {
  const data = parseGameData(value);
  if (typeof data.variantId !== 'string' || typeof data.areaId !== 'string' ||
      typeof data.x !== 'number' || typeof data.y !== 'number' ||
      typeof data.facing !== 'string' || !['up', 'down', 'left', 'right'].includes(data.facing)) throw new SaveError('INVALID_REQUEST');
  return data as unknown as SaveData;
}

export class LocalCloudReviewGateway {
  private state: ReviewCloudState = {};
  private generation = 0;
  private readonly storage: () => ReviewCloudStorage;
  private readonly now: () => string;
  private readonly newId: () => string;
  private readonly locks?: Pick<LockManager, 'request'> | null;

  constructor(options: ReviewCloudOptions = {}) {
    this.storage = options.storage ?? (() => localStorage);
    this.now = options.now ?? (() => new Date().toISOString());
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.locks = options.locks === undefined ? (typeof navigator === 'undefined' ? undefined : navigator.locks) : options.locks;
  }

  snapshot(): ReviewCloudState { return copy(this.state); }
  private key(account: ReviewAccount): string { return `${REVIEW_CLOUD_PREFIX}${account}:${SLOT}`; }
  private current(account: ReviewAccount, generation: number): boolean {
    return this.state.account === account && this.generation === generation;
  }
  private async locked<T>(account: ReviewAccount, action: () => T): Promise<T> {
    return this.locks ? this.locks.request(this.key(account), action) : action();
  }
  private readStored(account: ReviewAccount): StoredSave | undefined {
    const raw = this.storage().getItem(this.key(account));
    if (raw === null) return undefined;
    try {
      const data: unknown = JSON.parse(raw);
      if (!object(data)) throw new SaveError('CORRUPT_SAVE');
      const response = readSave({ sub: account }, SLOT, data as unknown as StoredSave);
      if (response.status !== 200) throw new SaveError(this.problem(response));
      return data as unknown as StoredSave;
    } catch (error) { throw error instanceof SaveError ? error : new SaveError('CORRUPT_SAVE'); }
  }
  private problem(response: HttpResponse): ApiErrorCode {
    return object(response.body) && object(response.body.error) && typeof response.body.error.code === 'string'
      ? response.body.error.code as ApiErrorCode : 'UNAVAILABLE';
  }
  private envelope(response: HttpResponse): SaveEnvelope {
    if (response.status !== 200 || !object(response.body)) throw new SaveError(this.problem(response));
    return parseEnvelope(response.body.save, SLOT);
  }
  private failure(error: unknown, account: ReviewAccount, generation: number): void {
    if (this.current(account, generation)) this.state.problem = error instanceof SaveError ? error.code : 'LOCAL_UNAVAILABLE';
  }

  async signIn(account: ReviewAccount): Promise<ReviewCloudState> {
    if (!REVIEW_ACCOUNTS.includes(account)) throw new SaveError('INVALID_REQUEST');
    const generation = ++this.generation;
    this.state = { account };
    try {
      const stored = await this.locked(account, () => this.current(account, generation) ? this.readStored(account) : undefined);
      if (this.current(account, generation) && stored) this.state.confirmed = copy(stored.save);
    } catch (error) { this.failure(error, account, generation); }
    return this.snapshot();
  }

  signOut(): ReviewCloudState {
    this.generation++;
    this.state = {};
    return this.snapshot();
  }

  /** Explicit save; the revision last seen by this account is never rebased after conflict. */
  async save(value: SaveData): Promise<ReviewCloudState> {
    const { account } = this.state, generation = this.generation;
    if (!account) { this.state.problem = 'UNAUTHENTICATED'; return this.snapshot(); }
    try {
      const data = copyReviewSave(value);
      const expectedRevision = this.state.confirmed?.revision ?? 0;
      const idempotencyKey = this.newId();
      await this.locked(account, () => {
        if (!this.current(account, generation)) return;
        const decision = writeSave({ sub: account }, SLOT, { schemaVersion: 1, expectedRevision, idempotencyKey, data },
          this.readStored(account), this.now());
        if (!decision.next) {
          this.state.problem = this.problem(decision.response);
          if (this.state.problem === 'REVISION_CONFLICT' && object(decision.response.body) && object(decision.response.body.error)) {
            this.state.conflict = decision.response.body.error.current === undefined
              ? undefined : parseEnvelope(decision.response.body.error.current, SLOT);
          }
          return;
        }
        const text = JSON.stringify(decision.next);
        const storage = this.storage();
        storage.setItem(this.key(account), text);
        if (storage.getItem(this.key(account)) !== text) throw new Error('not durable');
        this.state = { account, confirmed: this.envelope(decision.response) };
      });
    } catch (error) { this.failure(error, account, generation); }
    return this.snapshot();
  }

  /** Reading a candidate does not apply it or advance the local writer's expected revision. */
  async loadCandidate(): Promise<ReviewCloudCandidate | undefined> {
    const { account } = this.state, generation = this.generation;
    if (!account) { this.state.problem = 'UNAUTHENTICATED'; return; }
    try {
      const candidate = await this.locked(account, () => {
        if (!this.current(account, generation)) return;
        const envelope = this.envelope(readSave({ sub: account }, SLOT, this.readStored(account)));
        if (!this.state.conflict) this.state.problem = undefined;
        return { account, generation, envelope, data: copyReviewSave(envelope.data) };
      });
      return this.current(account, generation) ? candidate : undefined;
    } catch (error) { this.failure(error, account, generation); return; }
  }

  /** Call only after the host has safely accepted the complete candidate. */
  acceptRestored(candidate: ReviewCloudCandidate): boolean {
    if (!this.current(candidate.account, candidate.generation)) return false;
    this.state = { account: candidate.account, confirmed: copy(candidate.envelope) };
    return true;
  }

  isCurrent(candidate: ReviewCloudCandidate): boolean { return this.current(candidate.account, candidate.generation); }

  /** Another local demonstration device writes; this device deliberately keeps its old revision. */
  async simulateOtherDevice(value: SaveData): Promise<ReviewCloudState> {
    const { account } = this.state, generation = this.generation;
    if (!account) { this.state.problem = 'UNAUTHENTICATED'; return this.snapshot(); }
    try {
      const data = copyReviewSave(value);
      await this.locked(account, () => {
        if (!this.current(account, generation)) return;
        const current = this.readStored(account);
        const decision = writeSave({ sub: account }, SLOT,
          { schemaVersion: 1, expectedRevision: current?.save.revision ?? 0, idempotencyKey: this.newId(), data }, current, this.now());
        if (!decision.next) throw new SaveError(this.problem(decision.response));
        const storage = this.storage(), text = JSON.stringify(decision.next);
        storage.setItem(this.key(account), text);
        if (storage.getItem(this.key(account)) !== text) throw new Error('not durable');
        this.state.problem = undefined;
      });
    } catch (error) { this.failure(error, account, generation); }
    return this.snapshot();
  }
}
