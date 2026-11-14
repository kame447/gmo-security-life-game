/** Manual save/navigation policy over the existing local save store. */
import { createSaveStore, type SaveFailure, type SaveReadOptions, type SaveStorage, type SaveStoreOptions } from './save-store';
import type { SaveData } from '../state/save';
import type { World } from '../world';

export type LocalSaveProblem = SaveFailure | 'missing' | 'review';
export type LocalSaveResult = { ok: true } | { ok: false; reason: LocalSaveProblem | 'paused' };
export type LocalSaveNotice = { kind: 'none' | 'saved' } | { kind: 'error'; reason: LocalSaveProblem };
export interface LocalSaveOptions extends SaveStoreOptions {
  readOptions?: SaveReadOptions;
  /** Review sessions never read or write browser storage. */
  disabled?: boolean;
}

export class LocalSaveSession {
  readonly initialSave: SaveData | undefined;
  private writer: ReturnType<typeof createSaveStore>;
  private readonly listeners = new Set<() => void>();
  private held = false;
  private switching = false;
  private automaticAllowed = true;
  private saved = false;
  private currentNotice: LocalSaveNotice = { kind: 'none' };

  constructor(private readonly world: World, private readonly options: LocalSaveOptions = {}) {
    this.writer = createSaveStore(options);
    if (options.disabled) return;
    this.initialSave = this.writer.loadSave(world, options.readOptions);
    this.saved = this.initialSave !== undefined;
    if (this.writer.saveStatus().failed) {
      this.automaticAllowed = false;
      this.currentNotice = { kind: 'error', reason: this.writer.saveStatus().reason! };
    }
  }

  get hasSave(): boolean { return this.saved; }
  get disabled(): boolean { return this.options.disabled === true; }
  get isSwitching(): boolean { return this.switching; }
  get notice(): LocalSaveNotice { return { ...this.currentNotice }; }
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  pause(paused: boolean): void { this.held = paused; }

  private announce(notice: LocalSaveNotice): void {
    this.currentNotice = notice;
    for (const listener of this.listeners) listener();
  }
  private fail(reason: LocalSaveProblem): LocalSaveResult {
    this.announce({ kind: 'error', reason }); return { ok: false, reason };
  }

  /** Fresh read for a menu/continue action; it never changes the current game. */
  inspect(): SaveData | undefined {
    if (this.disabled) return undefined;
    const reader = createSaveStore(this.options);
    const saved = reader.loadSave(this.world, this.options.readOptions);
    this.saved = saved !== undefined;
    if (reader.saveStatus().failed) {
      this.automaticAllowed = false;
      this.fail(reader.saveStatus().reason!);
    } else if (!saved && !this.automaticAllowed) {
      // Storage recovered and is provably empty. The current in-memory game can
      // now be saved without replacing an unread old checkpoint.
      this.automaticAllowed = true;
      this.writer = createSaveStore(this.options);
      this.announce({ kind: 'none' });
    }
    return saved;
  }

  /** Every autosave source uses this same gate; manual saves may run inside the panel. */
  save(data: SaveData, manual = false): LocalSaveResult {
    if (this.disabled) return { ok: false, reason: 'review' };
    if (this.switching || (this.held && !manual)) return { ok: false, reason: 'paused' };
    if (!this.automaticAllowed) {
      return this.fail(this.currentNotice.kind === 'error' ? this.currentNotice.reason : 'protected-save');
    }
    if (!this.writer.writeSave(data)) return this.fail(this.writer.saveStatus().reason!);
    this.saved = true;
    this.announce({ kind: manual ? 'saved' : 'none' });
    return { ok: true };
  }

  /** Caller reloads only after success. pagehide remains gated until that reload. */
  continue(): LocalSaveResult {
    if (this.disabled) return { ok: false, reason: 'review' };
    if (this.switching) return { ok: false, reason: 'paused' };
    if (!this.inspect()) return this.fail(this.saved ? 'protected-save'
      : this.currentNotice.kind === 'error' ? this.currentNotice.reason : 'missing');
    this.writer = createSaveStore(this.options); // Explicitly abandon the old session's pending snapshot.
    this.switching = true;
    return { ok: true };
  }

  /** Confirmed new game: preserve the current raw string, then replace without old extensions. */
  startNew(data: SaveData): LocalSaveResult {
    if (this.disabled) return { ok: false, reason: 'review' };
    if (this.switching) return { ok: false, reason: 'paused' };
    const getStorage = this.options.storage ?? (() => localStorage);
    // This adapter is used for this one explicit replacement only. The existing
    // store still validates JSON and reports failures; its read sees no old DTO.
    const replacement: SaveStorage = {
      getItem: () => null,
      setItem: (key, text) => {
        const storage = getStorage();
        const previous = storage.getItem(key);
        if (previous !== null) storage.setItem(`${key}.previous`, previous);
        storage.setItem(key, text);
      },
    };
    const writer = createSaveStore({ ...this.options, storage: () => replacement });
    if (!writer.writeSave(data)) return this.fail(writer.saveStatus().reason!);
    this.writer = createSaveStore(this.options);
    this.saved = true;
    this.automaticAllowed = true;
    this.switching = true;
    return { ok: true };
  }
}
