/**
 * 幸福度スコア・最終評価（Issue #62）。評価は「日常」と「セキュリティ」の2軸。
 * - 日常軸：お金（増えるほど伸びが小さくなる）・つながり・成長
 * - セキュリティ軸：判断（安全／ふつう／危ない）・被害・対処（被害のあとに相談・連絡・手続きをしたか）
 * スコアは保存せず、ストーリーで選んだ選択肢の履歴と所持金から都度計算する。DOM に依存しない。
 *
 * 各要素の重み・お金の式・上限は Issue #62 で未決定のため、下の SCORE_TUNING に仮値として置く。
 */
import type { LifeChoiceDef, LifeEventDef } from '../events/life-events';

export type Judgment = 'safe' | 'normal' | 'risky';

/** 選択肢が人生に与える影響と、評価に使う情報。 */
export interface ChoiceScore {
  /** 所持金の増減（円）。選んだときに所持金へ反映する。 */
  moneyYen?: number;
  /** つながり（交友関係）の増減。 */
  ties?: number;
  /** 成長（能力・経験）の増減。 */
  growth?: number;
  /** セキュリティの判断の良し悪し。 */
  judgment?: Judgment;
  /** 実際に被害が出た。 */
  damage?: boolean;
  /** 被害のあとの対処（true：相談・連絡・手続きをした、false：しなかった）。 */
  response?: boolean;
}

export interface StoryChoiceDef extends LifeChoiceDef {
  score?: ChoiceScore;
  /** 最後の振り返りに出す一文（あのとき何を選び、どうなったか）。 */
  memory?: string;
}

export interface StoryEventDef extends LifeEventDef {
  choices?: StoryChoiceDef[];
}

/** 仮値（Issue #62 の未決定事項：重み・お金の式・上限）。 */
export const SCORE_TUNING = {
  /** お金の点数が満点になる所持金（円）。log で伸びが小さくなる。 */
  moneyFullYen: 3_000_000,
  /** お金の点数の目盛り（円）。これより小さい額は点数にほとんど効かない。 */
  moneyUnitYen: 10_000,
  /** つながり・成長が満点になる合計。 */
  tiesFull: 10,
  growthFull: 10,
  /** 判断の点数（安全・ふつう・危ない）。 */
  judgment: { safe: 100, normal: 50, risky: 0 } as Readonly<Record<Judgment, number>>,
  /** 各軸の中の重み（合計で割る）。 */
  dailyWeights: { money: 1, ties: 1, growth: 1 },
  securityWeights: { judgment: 1, damage: 1, response: 1 },
} as const;

export interface LifeEvaluation {
  moneyYen: number;
  ties: number;
  growth: number;
  daily: { total: number; money: number; ties: number; growth: number };
  judgments: Record<Judgment, number>;
  damages: number;
  responses: number;
  security: { total: number; judgment: number; damage: number; response: number };
  /** 選んだ順の、振り返りの一文（日常・セキュリティ）。 */
  dailyMemories: string[];
  securityMemories: string[];
}

const clamp100 = (value: number) => Math.round(Math.min(100, Math.max(0, value)));
const weighted = (parts: Record<string, number>, weights: Record<string, number>) => {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return clamp100(Object.entries(parts).reduce((total, [key, value]) => total + value * (weights[key] ?? 0), 0) / sum);
};

/** お金の点数：増えるほど1円あたりの伸びが小さくなる。 */
export function moneyPoints(yen: number): number {
  const { moneyFullYen, moneyUnitYen } = SCORE_TUNING;
  return clamp100(100 * Math.log1p(Math.max(0, yen) / moneyUnitYen) / Math.log1p(moneyFullYen / moneyUnitYen));
}

/** 選んだ選択肢（イベント id → 選択肢 id、選んだ順）と所持金から評価する。 */
export function evaluateLife(choices: Readonly<Record<string, string>>, moneyYen: number, events: readonly StoryEventDef[]): LifeEvaluation {
  let ties = 0;
  let growth = 0;
  let damages = 0;
  let responses = 0;
  const judgments: Record<Judgment, number> = { safe: 0, normal: 0, risky: 0 };
  const dailyMemories: string[] = [];
  const securityMemories: string[] = [];
  for (const [eventId, choiceId] of Object.entries(choices)) {
    const event = events.find(e => e.id === eventId);
    const choice = event?.choices?.find(c => c.id === choiceId);
    if (!event || !choice) continue;
    const s = choice.score ?? {};
    ties += s.ties ?? 0;
    growth += s.growth ?? 0;
    if (s.judgment) judgments[s.judgment]++;
    if (s.damage) damages++;
    if (s.response) responses++;
    if (choice.memory) (event.category === 'security' ? securityMemories : dailyMemories).push(choice.memory);
  }
  const { tiesFull, growthFull, judgment, dailyWeights, securityWeights } = SCORE_TUNING;
  const daily = { money: moneyPoints(moneyYen), ties: clamp100(100 * ties / tiesFull), growth: clamp100(100 * growth / growthFull) };
  const judged = judgments.safe + judgments.normal + judgments.risky;
  const security = {
    judgment: judged ? clamp100((judgments.safe * judgment.safe + judgments.normal * judgment.normal + judgments.risky * judgment.risky) / judged) : 100,
    damage: judged ? clamp100(100 - 100 * damages / judged) : 100,
    response: damages ? clamp100(100 * Math.min(responses, damages) / damages) : 100,
  };
  return {
    moneyYen, ties, growth,
    daily: { ...daily, total: weighted(daily, dailyWeights) },
    judgments, damages, responses: Math.min(responses, damages),
    security: { ...security, total: weighted(security, securityWeights) },
    dailyMemories, securityMemories,
  };
}

/** 最後の振り返り（結果画面がまだないため、会話欄に出す文言）。 */
export function resultLines(e: LifeEvaluation): string[][] {
  return [
    [
      '――― 人生の振り返り ―――',
      `【日常】幸福度 ${e.daily.total}点（お金 ${e.daily.money}・つながり ${e.daily.ties}・成長 ${e.daily.growth}）`,
      `最後の所持金は ${e.moneyYen.toLocaleString('ja-JP')}円。`,
      ...e.dailyMemories,
    ],
    [
      `【セキュリティ】${e.security.total}点（判断 ${e.security.judgment}・被害 ${e.security.damage}・対処 ${e.security.response}）`,
      `安全な判断 ${e.judgments.safe}回・ふつう ${e.judgments.normal}回・危ない判断 ${e.judgments.risky}回。被害は ${e.damages}回、そのうち対処できたのは ${e.responses}回。`,
      ...(e.securityMemories.length ? ['あのとき、何を選び、どうなったか――', ...e.securityMemories] : []),
    ],
  ];
}
