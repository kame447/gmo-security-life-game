/**
 * 人生イベントの定義（データ）の型と検証。
 * イベントの中身（台詞・選択肢・影響）はデータとして分け、進行処理（director.ts）に個別イベントの分岐を書かない。
 * 共通仕様：docs/features/events.md、実装の範囲：docs/features/life-events.md。
 */

/** 日常イベントとセキュリティイベントの区別。配分（7:3〜6:4 目安）の集計に使う。 */
export type LifeEventCategory = 'daily' | 'security';

/** 状態への影響。数値の意味・範囲は未決定のため、加算と目印（フラグ）だけを扱う。 */
export type LifeEffect =
  | { kind: 'stat'; stat: string; add: number }
  | { kind: 'flag'; flag: string; value?: boolean };

/** 発生条件。すべて満たしたときだけ発生する。過去の選択を後のイベントの条件にできる。 */
export type LifeCondition =
  | { kind: 'flag'; flag: string; value?: boolean }
  | { kind: 'experienced'; eventId: string; value?: boolean }
  | { kind: 'chose'; eventId: string; choiceId: string };

export interface LifeChoiceDef {
  id: string;
  /** 選択肢の短い表示名。 */
  label: string;
  /** 選んだ後に会話欄で順に表示する結果。 */
  result: string[];
  effects?: LifeEffect[];
}

export interface LifeEventDef {
  id: string;
  title: string;
  category: LifeEventCategory;
  /** きっかけ：この eventKey を持つ NPC・物に話しかけたとき（core/types の InteractionDef.eventKey）。 */
  trigger: { eventKey: string };
  /** 一度経験したら再発生しない。省略時は true。 */
  once?: boolean;
  when?: LifeCondition[];
  /** 省略時は話しかけた相手の名前。 */
  speaker?: string;
  /** 選択肢の前に会話欄で順に表示する導入。 */
  intro: string[];
  /** 選択肢と一緒に表示する問いかけ。choices がないイベントでは使わない。 */
  prompt?: string;
  /** 省略または空なら、導入だけで終わる会話イベント（経験と影響は記録する）。 */
  choices?: LifeChoiceDef[];
  /** 選択肢がないイベントの影響。 */
  effects?: LifeEffect[];
}

/** 定義の不備を見つけて文で返す。空配列なら妥当。 */
export function validateLifeEvents(defs: readonly LifeEventDef[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const at = `イベント ${def.id || '(id なし)'}`;
    if (!def.id) errors.push(`${at}: id が空です`);
    if (ids.has(def.id)) errors.push(`${at}: id が重複しています`);
    ids.add(def.id);
    if (!def.title) errors.push(`${at}: title が空です`);
    if (!def.trigger?.eventKey) errors.push(`${at}: trigger.eventKey が空です`);
    const choices = def.choices ?? [];
    if (!def.intro.length && !choices.length) errors.push(`${at}: intro も choices も空です`);
    if (choices.length && !def.prompt) errors.push(`${at}: 選択肢があるのに prompt が空です`);
    if (choices.length === 1) errors.push(`${at}: 選択肢が 1 つだけです`);
    const choiceIds = new Set<string>();
    for (const choice of choices) {
      if (!choice.id || choiceIds.has(choice.id)) errors.push(`${at}: 選択肢の id が空か重複しています（${choice.id}）`);
      choiceIds.add(choice.id);
      if (!choice.label) errors.push(`${at}: 選択肢 ${choice.id} の label が空です`);
      if (!choice.result.length) errors.push(`${at}: 選択肢 ${choice.id} の result が空です`);
      for (const e of choice.effects ?? []) errors.push(...effectErrors(e, `${at} / ${choice.id}`));
    }
    for (const e of def.effects ?? []) errors.push(...effectErrors(e, at));
  }
  // Conditions may refer to events defined later, so check references after collecting ids.
  for (const def of defs) {
    for (const c of def.when ?? []) {
      if (c.kind === 'flag') continue;
      const target = defs.find(d => d.id === c.eventId);
      if (!target) { errors.push(`イベント ${def.id}: 条件が存在しないイベント ${c.eventId} を参照しています`); continue; }
      if (c.kind === 'chose' && !(target.choices ?? []).some(ch => ch.id === c.choiceId)) {
        errors.push(`イベント ${def.id}: 条件が存在しない選択肢 ${c.eventId}/${c.choiceId} を参照しています`);
      }
    }
  }
  return errors;
}

function effectErrors(e: LifeEffect, at: string): string[] {
  if (e.kind === 'stat') {
    if (!e.stat) return [`${at}: stat の名前が空です`];
    if (!Number.isFinite(e.add)) return [`${at}: stat ${e.stat} の add が数値ではありません`];
    return [];
  }
  return e.flag ? [] : [`${at}: flag の名前が空です`];
}
