import { copy, GAME_VERSION, parseEnvelope, parseGameData, SaveError, slotId, timestamp, type GameData, type SaveEnvelope } from './contract';

/** Register each v -> v+1 step explicitly when the game schema actually changes. */
export class GameMigrations {
  private readonly steps = new Map<number, (data: GameData) => GameData>();
  constructor(readonly currentVersion = GAME_VERSION) {
    if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) throw new SaveError('INVALID_REQUEST');
  }
  register(from: number, migrate: (data: GameData) => GameData): this {
    if (!Number.isSafeInteger(from) || from < 1 || from >= this.currentVersion || this.steps.has(from)) {
      throw new SaveError('INVALID_REQUEST');
    }
    this.steps.set(from, migrate); return this;
  }
  migrate(raw: unknown): GameData {
    // Check the JSON shape without accepting future versions or modifying raw.
    const version = (raw as Partial<GameData> | null)?.v;
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) throw new SaveError('INVALID_REQUEST');
    if (version > this.currentVersion) throw new SaveError('UNSUPPORTED_VERSION');
    let data = parseGameData(raw, version);
    while (data.v < this.currentVersion) {
      const step = this.steps.get(data.v);
      if (!step) throw new SaveError('UNSUPPORTED_VERSION');
      const nextVersion = data.v + 1;
      data = parseGameData(step(copy(data)), nextVersion);
    }
    return data;
  }
}

/** Non-destructive import: caller retains the original legacy key, even on failure. */
export function importLegacy(rawText: string, targetSlot: string, importedAt: string): SaveEnvelope {
  if (!slotId(targetSlot) || !timestamp(importedAt)) throw new SaveError('INVALID_REQUEST');
  let raw: unknown;
  try { raw = JSON.parse(rawText); } catch { throw new SaveError('INVALID_REQUEST'); }
  return parseEnvelope({ schemaVersion: 1, slotId: targetSlot, revision: 0, updatedAt: importedAt,
    data: new GameMigrations().migrate(raw) });
}
