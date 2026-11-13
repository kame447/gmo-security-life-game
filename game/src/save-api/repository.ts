import { copy, ERROR_HTTP, object, parseEnvelope, parseGameData, parseWriteRequest, sameJson, SaveError,
  type ApiErrorCode, type GameData, type HttpResponse, type SaveEnvelope, type WriteSaveRequest } from './contract';
import { LocalSaveJournal, MAX_PENDING, type LocalProblem, type LocalState } from './local';

/** The HTTP adapter supplies credentials; owner IDs never travel as request authority. */
export interface SaveRemote {
  read(slot: string): Promise<HttpResponse>;
  write(slot: string, request: WriteSaveRequest): Promise<HttpResponse>;
}
export type ClientProblem = ApiErrorCode | LocalProblem | 'NETWORK' | 'TIMEOUT' | 'INVALID_RESPONSE';
export interface RepositoryState {
  /** Latest complete local snapshot, including unsent progress. Never a field merge. */
  data?: GameData;
  confirmed?: SaveEnvelope;
  pendingCount: number;
  durable: boolean;
  problem?: ClientProblem;
  /** Separate remote snapshot for an eventual explicit conflict-resolution UI. */
  conflict?: SaveEnvelope;
}
class RemoteFailure extends Error {
  constructor(readonly problem: ClientProblem, readonly current?: SaveEnvelope) { super(problem); }
}

export class SaveRepository {
  private state: LocalState;
  private tail: Promise<unknown> = Promise.resolve();
  private problem?: ClientProblem;
  private conflict?: SaveEnvelope;
  constructor(private readonly local: LocalSaveJournal, private readonly remote: SaveRemote,
    private readonly newId: () => string, private readonly timeoutMs = 5000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new SaveError('INVALID_REQUEST');
    this.state = local.read();
  }
  snapshot(): RepositoryState {
    const { journal, durable, problem } = this.state;
    const data = journal.pending.at(-1)?.data ?? journal.confirmed?.data;
    return copy({ ...(data ? { data } : {}), ...(journal.confirmed ? { confirmed: journal.confirmed } : {}),
      pendingCount: journal.pending.length, durable, ...(this.problem ?? problem ? { problem: this.problem ?? problem } : {}),
      ...(this.conflict ? { conflict: this.conflict } : {}) });
  }
  private serial(run: () => Promise<RepositoryState>): Promise<RepositoryState> {
    const next = this.tail.then(run, run);
    this.tail = next.catch(() => undefined); return next;
  }
  private persist(): void { this.state = this.local.write(this.state.journal); }
  private protectedLocal(): boolean { return this.state.problem === 'CORRUPT_LOCAL' || this.state.problem === 'FUTURE_LOCAL'; }
  private async request(run: () => Promise<HttpResponse>): Promise<HttpResponse> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(run).catch(() => { throw new RemoteFailure('NETWORK'); }),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new RemoteFailure('TIMEOUT')), this.timeoutMs); }),
      ]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  private response(response: HttpResponse): SaveEnvelope {
    if (!object(response) || !Number.isInteger(response.status)) throw new RemoteFailure('INVALID_RESPONSE');
    if (response.status === 200) {
      try {
        if (!object(response.body)) throw new SaveError('INVALID_REQUEST');
        const save = parseEnvelope(response.body.save, this.local.slot);
        if (save.revision < 1) throw new SaveError('INVALID_REQUEST');
        return save;
      } catch (error) {
        throw new RemoteFailure(error instanceof SaveError && error.code === 'UNSUPPORTED_VERSION' ? error.code : 'INVALID_RESPONSE');
      }
    }
    const code = object(response.body) && object(response.body.error) ? response.body.error.code : undefined;
    let problem: ClientProblem = typeof code === 'string' && Object.hasOwn(ERROR_HTTP, code) &&
      ERROR_HTTP[code as ApiErrorCode] === response.status ? code as ApiErrorCode :
      response.status === 401 ? 'UNAUTHENTICATED' : response.status === 403 ? 'FORBIDDEN' :
      response.status === 409 ? 'REVISION_CONFLICT' : response.status === 404 ? 'NOT_FOUND' :
      response.status >= 500 && response.status <= 599 ? 'UNAVAILABLE' : 'INVALID_RESPONSE';
    let current: SaveEnvelope | undefined;
    if (problem === 'REVISION_CONFLICT' && object(response.body) && object(response.body.error) && response.body.error.current !== undefined) {
      try { current = parseEnvelope(response.body.error.current, this.local.slot); }
      catch { problem = 'INVALID_RESPONSE'; }
    }
    throw new RemoteFailure(problem, current);
  }
  private failure(error: unknown): RepositoryState {
    this.problem = error instanceof RemoteFailure ? error.problem : error instanceof SaveError ? error.code : 'INVALID_RESPONSE';
    this.conflict = error instanceof RemoteFailure ? error.current : undefined;
    return this.snapshot();
  }

  /** Writes local first, then attempts delivery. Failed delivery keeps the exact request. */
  save(raw: unknown): Promise<RepositoryState> {
    return this.serial(async () => {
      try {
        const data = parseGameData(raw);
        const journal = this.state.journal;
        const request = parseWriteRequest({ schemaVersion: 1,
          expectedRevision: (journal.confirmed?.revision ?? 0) + Math.min(journal.pending.length, MAX_PENDING - 1),
          idempotencyKey: this.newId(), data });
        if (journal.pending.some(item => item.idempotencyKey === request.idempotencyKey)) throw new SaveError('INVALID_REQUEST');
        // The head may have reached the server. Keep its key/content immutable.
        // A tail has never been attempted, so a newer full snapshot supersedes it.
        if (journal.pending.length === MAX_PENDING) journal.pending[MAX_PENDING - 1] = request;
        else journal.pending.push(request);
        this.persist();
        return await this.flush();
      } catch (error) { return this.failure(error); }
    });
  }
  /** Explicit retry (e.g. reconnect/re-authentication). No automatic rebasing or timers. */
  sync(): Promise<RepositoryState> { return this.serial(() => this.flush()); }
  private async flush(): Promise<RepositoryState> {
    this.problem = undefined; this.conflict = undefined;
    if (this.protectedLocal()) return this.snapshot();
    try {
      while (this.state.journal.pending.length) {
        const pending = copy(this.state.journal.pending[0]);
        const save = this.response(await this.request(() => this.remote.write(this.local.slot, copy(pending))));
        if (save.revision !== pending.expectedRevision + 1 || !sameJson(save.data, pending.data)) {
          throw new RemoteFailure('INVALID_RESPONSE');
        }
        this.state.journal.confirmed = save;
        this.state.journal.pending.shift();
        this.persist();
      }
      return this.snapshot();
    } catch (error) { return this.failure(error); }
  }
  /** Unsent progress wins locally; a remote read cannot overwrite it. */
  load(): Promise<RepositoryState> {
    return this.serial(async () => {
      if (this.protectedLocal() || this.state.journal.pending.length) return this.snapshot();
      this.problem = undefined; this.conflict = undefined;
      try {
        const save = this.response(await this.request(() => this.remote.read(this.local.slot)));
        const confirmed = this.state.journal.confirmed;
        if (confirmed && (save.revision < confirmed.revision ||
          (save.revision === confirmed.revision && !sameJson(save, confirmed)))) throw new RemoteFailure('INVALID_RESPONSE');
        this.state.journal.confirmed = save; this.persist();
        return this.snapshot();
      } catch (error) {
        if (error instanceof RemoteFailure && error.problem === 'NOT_FOUND' && !this.state.journal.confirmed) return this.snapshot();
        return this.failure(error);
      }
    });
  }
}
