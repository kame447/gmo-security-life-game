import { parseSave, type SaveData } from '../state/save';
import type { SaveReadOptions } from './save-store';
import type { World } from '../world';

export const SAVE_KEY = 'slg-map-save-v1';
export const RECOVERY_LIMIT = 3;
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type SaveFailure = 'storage' | 'backup' | 'changed' | 'unsupported' | 'invalid' | 'reload';
export type SaveResult = { ok: true; savedAt?: number } | { ok: false; reason: SaveFailure };
export interface RecoveryPoint { id: string; createdAt: number; raw: string }
export type SaveInspection =
  | { kind: 'empty'; raw: null }
  | { kind: 'valid'; raw: string; data: SaveData; savedAt?: number }
  | { kind: 'blocked'; raw: string | null; reason: SaveFailure };

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** A newer owned section must never silently become a fresh game. */
export function readableSaveVersion(value: unknown): boolean {
  if (!record(value) || value.v !== 1 || typeof value.variantId !== 'string') return false;
  if (record(value.story) && value.story.v !== 1 && value.story.v !== 2) return false;
  if (!record(value.phone)) return true;
  return [value.phone, value.phone.dataBudget, value.phone.chat, value.phone.mail]
    .every(part => !record(part) || part.v === undefined || part.v === 1);
}

function savedAt(raw: string): number | undefined {
  try {
    const n: unknown = JSON.parse(raw).savedAtEpochMs;
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch { return undefined; }
}

function identity(raw: string): string {
  try {
    const value: unknown = JSON.parse(raw);
    if (record(value)) delete value.savedAtEpochMs;
    const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
      : record(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
    return JSON.stringify(canonical(value));
  } catch { return raw; }
}

export function saveFailureMessage(reason: SaveFailure): string {
  if (reason === 'reload') return '復元した記録を読み込み直してください。復元前の進行では上書きしません。';
  if (reason === 'changed') return '別の画面で保存が変更されました。上書きせずに止めました。再読み込みして確認してください。';
  if (reason === 'backup') return '復元ポイントを保存できませんでした。元の保存を残して操作を止めました。';
  if (reason === 'unsupported') return 'この版で読み込めない保存です。保存内容は変更していません。';
  if (reason === 'invalid') return '読み込めないデータです。現在の保存は変更していません。';
  return '保存できませんでした。空き容量やブラウザーの設定を確認して、もう一度保存してください。';
}

/** One session owns its observation. Each localStorage write is atomic; protect the old value first. */
export class LocalSaveStore {
  private observed: string | null | undefined;
  private protectedThisSession = false;
  private restored = false;
  readonly recoveryKey: string;

  constructor(readonly key = SAVE_KEY, private readonly storage: () => SaveStorage = () => localStorage,
    private readonly now: () => number = Date.now) {
    this.recoveryKey = `${key}.recovery-v1`;
  }

  inspect(world: World, options: SaveReadOptions = {}): SaveInspection {
    let raw: string | null = null;
    try {
      raw = this.storage().getItem(this.key);
      if (this.observed === undefined) this.observed = raw;
      if (raw === null) return { kind: 'empty', raw };
      const value: unknown = JSON.parse(raw);
      if (!readableSaveVersion(value)) return { kind: 'blocked', raw, reason: 'unsupported' };
      const data = parseSave(value, world, options.initialPhoneOwned, options.phoneDataConfig);
      return data ? { kind: 'valid', raw, data, savedAt: savedAt(raw) }
        : { kind: 'blocked', raw, reason: 'invalid' };
    } catch { return { kind: 'blocked', raw, reason: raw === null ? 'storage' : 'invalid' }; }
  }

  history(): RecoveryPoint[] {
    const raw = this.storage().getItem(this.recoveryKey);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.v !== 1 || !Array.isArray(value.points) || value.points.length > RECOVERY_LIMIT ||
      !value.points.every(p => record(p) && typeof p.id === 'string' && typeof p.raw === 'string' &&
        typeof p.createdAt === 'number' && Number.isFinite(p.createdAt))) throw new Error('Invalid recovery history');
    return value.points.map(p => ({ ...p as RecoveryPoint }));
  }

  private archive(raw: string): boolean {
    try {
      const history = this.history();
      const key = identity(raw);
      const same = history.find(p => identity(p.raw) === key);
      if (history[0] === same && same?.raw === raw) return true;
      const createdAt = Math.max(this.now(), ...history.map(p => p.createdAt + 1));
      const points = [{ id: String(createdAt), createdAt, raw }, ...history.filter(p => p !== same)].slice(0, RECOVERY_LIMIT);
      const serialized = JSON.stringify({ v: 1, points });
      const storage = this.storage();
      storage.setItem(this.recoveryKey, serialized);
      return storage.getItem(this.recoveryKey) === serialized;
    } catch { return false; }
  }

  private current(): string | null {
    const raw = this.storage().getItem(this.key);
    if (this.observed === undefined) this.observed = raw;
    if (this.observed !== raw) throw new Error('changed');
    return raw;
  }

  save(data: SaveData, checkpoint = false): SaveResult {
    try {
      if (this.restored) return { ok: false, reason: 'reload' };
      if (!readableSaveVersion(data)) return { ok: false, reason: 'invalid' };
      const previous = this.current();
      let extensions: Record<string, unknown> = {};
      if (previous !== null) {
        try {
          const value: unknown = JSON.parse(previous);
          if (!readableSaveVersion(value)) return { ok: false, reason: 'unsupported' };
          extensions = value as Record<string, unknown>;
          if (extensions.variantId !== data.variantId) return { ok: false, reason: 'unsupported' };
        } catch { return { ok: false, reason: 'unsupported' }; }
      }
      const at = this.now();
      const raw = JSON.stringify({ ...extensions, ...data, savedAtEpochMs: at });
      if (previous !== null && identity(previous) === identity(raw)) return { ok: true, savedAt: savedAt(previous) };
      if (previous !== null && (!this.protectedThisSession || checkpoint) && !this.archive(previous)) return { ok: false, reason: 'backup' };
      this.current();
      this.storage().setItem(this.key, raw);
      if (this.storage().getItem(this.key) !== raw) return { ok: false, reason: 'storage' };
      this.observed = raw;
      this.protectedThisSession = true;
      return { ok: true, savedAt: at };
    } catch (error) { return { ok: false, reason: error instanceof Error && error.message === 'changed' ? 'changed' : 'storage' }; }
  }

  clearForNew(expected: string | null): SaveResult {
    try {
      const raw = this.current();
      if (raw !== expected) return { ok: false, reason: 'changed' };
      if (raw !== null && !this.archive(raw)) return { ok: false, reason: 'backup' };
      this.current();
      this.storage().removeItem(this.key);
      if (this.storage().getItem(this.key) !== null) return { ok: false, reason: 'storage' };
      this.observed = null;
      this.protectedThisSession = false;
      return { ok: true };
    } catch (error) { return { ok: false, reason: error instanceof Error && error.message === 'changed' ? 'changed' : 'storage' }; }
  }

  restore(id: string, world: World, options: SaveReadOptions = {}): SaveResult {
    try {
      const point = this.history().find(p => p.id === id);
      return point ? this.replaceRaw(point.raw, world, options) : { ok: false, reason: 'invalid' };
    } catch { return { ok: false, reason: 'backup' }; }
  }

  replace(data: SaveData, world: World, options: SaveReadOptions = {}): SaveResult {
    try { return this.replaceRaw(JSON.stringify(data), world, options); }
    catch { return { ok: false, reason: 'invalid' }; }
  }

  private replaceRaw(raw: string, world: World, options: SaveReadOptions): SaveResult {
    try {
      const value: unknown = JSON.parse(raw);
      if (!readableSaveVersion(value) || !parseSave(value, world, options.initialPhoneOwned, options.phoneDataConfig)) {
        return { ok: false, reason: 'invalid' };
      }
      const current = this.current();
      if (current !== null && current !== raw && !this.archive(current)) return { ok: false, reason: 'backup' };
      this.current();
      this.storage().setItem(this.key, raw);
      if (this.storage().getItem(this.key) !== raw) return { ok: false, reason: 'storage' };
      this.observed = raw;
      this.restored = true;
      return { ok: true, savedAt: savedAt(raw) };
    } catch (error) { return { ok: false, reason: error instanceof Error && error.message === 'changed' ? 'changed' : 'storage' }; }
  }
}

export function saveDateLabel(timestamp?: number): string {
  return timestamp === undefined ? '保存日時の記録なし' : new Date(timestamp).toLocaleString('ja-JP');
}
