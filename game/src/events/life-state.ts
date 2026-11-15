/**
 * イベントで変わる人生の状態（数値・目印・選択の履歴）。DOM・保存先に依存しない。
 * 所持金・持ち物は #20 の担当のためここでは持たない。保存への組み込みも #20 の保存基盤に合わせて後で行う。
 */
import type { LifeCondition, LifeEffect } from './life-events';

export interface LifeHistoryEntry {
  eventId: string;
  /** 選択肢のないイベントでは null。 */
  choiceId: string | null;
}

export interface LifeStateData {
  v: 1;
  stats: Record<string, number>;
  flags: Record<string, boolean>;
  history: LifeHistoryEntry[];
}

export class LifeState {
  readonly stats = new Map<string, number>();
  readonly flags = new Map<string, boolean>();
  readonly history: LifeHistoryEntry[] = [];

  stat(name: string): number { return this.stats.get(name) ?? 0; }
  flag(name: string): boolean { return this.flags.get(name) ?? false; }
  experienced(eventId: string): boolean { return this.history.some(h => h.eventId === eventId); }
  chose(eventId: string, choiceId: string): boolean {
    return this.history.some(h => h.eventId === eventId && h.choiceId === choiceId);
  }

  meets(conditions: readonly LifeCondition[] = []): boolean {
    return conditions.every(c => {
      switch (c.kind) {
        case 'flag': return this.flag(c.flag) === (c.value ?? true);
        case 'experienced': return this.experienced(c.eventId) === (c.value ?? true);
        case 'chose': return this.chose(c.eventId, c.choiceId);
      }
    });
  }

  apply(effects: readonly LifeEffect[] = []): void {
    for (const e of effects) {
      if (e.kind === 'stat') this.stats.set(e.stat, this.stat(e.stat) + e.add);
      else this.flags.set(e.flag, e.value ?? true);
    }
  }

  record(eventId: string, choiceId: string | null): void {
    this.history.push({ eventId, choiceId });
  }

  toJSON(): LifeStateData {
    return { v: 1, stats: Object.fromEntries(this.stats), flags: Object.fromEntries(this.flags),
      history: this.history.map(h => ({ ...h })) };
  }

  /** 壊れた・形式違いのデータは空の状態として扱う（不正な値だけを捨てる）。 */
  static from(raw: unknown): LifeState {
    const state = new LifeState();
    if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return state;
    const data = raw as Partial<LifeStateData>;
    for (const [k, v] of Object.entries(isRecord(data.stats) ? data.stats : {})) {
      if (typeof v === 'number' && Number.isFinite(v)) state.stats.set(k, v);
    }
    for (const [k, v] of Object.entries(isRecord(data.flags) ? data.flags : {})) {
      if (typeof v === 'boolean') state.flags.set(k, v);
    }
    for (const h of Array.isArray(data.history) ? data.history : []) {
      if (h && typeof h.eventId === 'string' && (typeof h.choiceId === 'string' || h.choiceId === null)) {
        state.history.push({ eventId: h.eventId, choiceId: h.choiceId });
      }
    }
    return state;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
