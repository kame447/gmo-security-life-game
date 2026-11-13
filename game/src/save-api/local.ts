import { copy, MAX_SAVE_BYTES, object, parseEnvelope, parseWriteRequest, SaveError, slotId,
  type SaveEnvelope, type WriteSaveRequest } from './contract';

/** Structural localStorage port; accessing the browser global is the caller's job. */
export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface SaveJournal {
  v: 1;
  ownerSub: string;
  slotId: string;
  confirmed?: SaveEnvelope;
  pending: WriteSaveRequest[];
}
export type LocalProblem = 'LOCAL_UNAVAILABLE' | 'CORRUPT_LOCAL' | 'FUTURE_LOCAL';
export interface LocalState { journal: SaveJournal; durable: boolean; problem?: LocalProblem }
/** One possibly delivered request plus the latest complete unsent snapshot. */
export const MAX_PENDING = 2;

function parseJournal(value: unknown, owner: string, slot: string): SaveJournal {
  if (!object(value)) throw new SaveError('INVALID_REQUEST');
  if (value.v !== 1) throw new SaveError('UNSUPPORTED_VERSION');
  if (value.ownerSub !== owner || value.slotId !== slot || !Array.isArray(value.pending) || value.pending.length > MAX_PENDING) {
    throw new SaveError('INVALID_REQUEST');
  }
  const confirmed = value.confirmed === undefined ? undefined : parseEnvelope(value.confirmed, slot);
  const pending = value.pending.map(parseWriteRequest);
  const keys = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    if (pending[i].expectedRevision !== (confirmed?.revision ?? 0) + i || keys.has(pending[i].idempotencyKey)) {
      throw new SaveError('INVALID_REQUEST');
    }
    keys.add(pending[i].idempotencyKey);
  }
  return { v: 1, ownerSub: owner, slotId: slot, ...(confirmed ? { confirmed } : {}), pending };
}

/** One owner/slot journal. Memory survives storage failures for this instance's lifetime. */
export class LocalSaveJournal {
  readonly key: string;
  private state?: LocalState;
  private protectedRaw = false;
  private unreadStorage = false;
  constructor(readonly ownerSub: string, readonly slot: string,
    private readonly storage: () => KeyValueStorage | undefined = () => undefined) {
    if (!ownerSub || ownerSub.length > 128 || !slotId(slot)) throw new SaveError('INVALID_REQUEST');
    this.key = `slg-save-api-v1:${encodeURIComponent(ownerSub)}:${slot}`;
  }
  read(): LocalState {
    if (this.state) return copy(this.state);
    const empty: SaveJournal = { v: 1, ownerSub: this.ownerSub, slotId: this.slot, pending: [] };
    let raw: string | null;
    try {
      const storage = this.storage();
      if (!storage) throw new Error('unavailable');
      raw = storage.getItem(this.key);
    } catch {
      // A later successful setItem must not overwrite bytes we never read.
      this.unreadStorage = true;
      this.state = { journal: empty, durable: false, problem: 'LOCAL_UNAVAILABLE' };
      return copy(this.state);
    }
    try {
      if (raw && raw.length > (MAX_SAVE_BYTES + 2048) * (MAX_PENDING + 1)) throw new SaveError('TOO_LARGE');
      this.state = { journal: raw === null ? empty : parseJournal(JSON.parse(raw), this.ownerSub, this.slot), durable: true };
    } catch (error) {
      this.protectedRaw = true;
      this.state = { journal: empty, durable: false,
        problem: error instanceof SaveError && error.code === 'UNSUPPORTED_VERSION' ? 'FUTURE_LOCAL' : 'CORRUPT_LOCAL' };
    }
    return copy(this.state);
  }
  write(journal: SaveJournal): LocalState {
    const previous = this.read();
    const valid = parseJournal(journal, this.ownerSub, this.slot);
    this.state = { journal: copy(valid), durable: false };
    if (this.unreadStorage) {
      this.state.problem = 'LOCAL_UNAVAILABLE';
      return copy(this.state);
    }
    if (this.protectedRaw) {
      this.state.problem = previous.problem;
      return copy(this.state);
    }
    try {
      const storage = this.storage();
      if (!storage) throw new Error('unavailable');
      storage.setItem(this.key, JSON.stringify(valid));
      this.state.durable = true;
    } catch { this.state.problem = 'LOCAL_UNAVAILABLE'; }
    return copy(this.state);
  }
}
