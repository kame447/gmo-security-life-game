/**
 * 人生イベントの進行：きっかけの判定 → 導入の会話 → 選択 → 結果・状態変化・履歴。
 * session/game.ts の MapEventSink として接続し、該当するイベントがなければ既定の台詞に任せる。
 * 表示は ui/life-event-panel.ts が担当する（ここは DOM に依存しない）。
 */
import type { MapEvent, MapEventSink } from '../core/types';
import { validateLifeEvents, type LifeChoiceDef, type LifeEventDef } from './life-events';
import { LifeState } from './life-state';

export interface PendingLifeChoice {
  event: LifeEventDef;
  /** 話しかけた相手（名前の解決に使う）。 */
  areaId: string;
  interactionId: string;
}

export interface LifeEventOutcome {
  event: LifeEventDef;
  choice: LifeChoiceDef;
  lines: string[];
}

export class LifeEventDirector implements MapEventSink {
  private readonly defs: readonly LifeEventDef[];
  private current: PendingLifeChoice | null = null;

  constructor(defs: readonly LifeEventDef[], readonly state: LifeState = new LifeState()) {
    const errors = validateLifeEvents(defs);
    if (errors.length) throw new Error(`人生イベントの定義に不備があります:\n${errors.join('\n')}`);
    this.defs = defs;
  }

  /** 選択待ちのイベント。導入の会話中から選択が終わるまで残る。 */
  get pending(): PendingLifeChoice | null { return this.current; }

  /** その eventKey で今発生するイベント（定義順で最初の 1 件）。 */
  available(eventKey: string): LifeEventDef | undefined {
    return this.defs.find(def => def.trigger.eventKey === eventKey &&
      !((def.once ?? true) && this.state.experienced(def.id)) &&
      this.state.meets(def.when));
  }

  onMapEvent(e: MapEvent): { speaker?: string; lines: string[] } | void {
    if (e.type !== 'interact' || this.current) return;
    const event = this.available(e.eventKey);
    if (!event) return;
    if (!event.choices?.length) {
      this.state.apply(event.effects);
      this.state.record(event.id, null);
      return { speaker: event.speaker, lines: [...event.intro] };
    }
    this.current = { event, areaId: e.areaId, interactionId: e.interactionId };
    return { speaker: event.speaker, lines: event.intro.length ? [...event.intro] : [event.prompt ?? ''] };
  }

  /** 選択を確定し、影響と履歴を反映して結果の台詞を返す。選択待ちでない・不明な選択肢なら null。 */
  choose(choiceId: string): LifeEventOutcome | null {
    const event = this.current?.event;
    const choice = event?.choices?.find(c => c.id === choiceId);
    if (!event || !choice) return null;
    this.current = null;
    this.state.apply(choice.effects);
    this.state.record(event.id, choice.id);
    return { event, choice, lines: [...choice.result] };
  }

  /** 選ばずに中断した（やり直し等）。経験として記録しないので、次に話しかけたとき再発生する。 */
  cancel(): void { this.current = null; }
}
