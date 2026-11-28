/**
 * ストーリーの進み具合と、その保存形式（docs/features/story.md の「保存と再開」）。DOM・保存先に依存しない。
 * スマホ・自転車を持っているかは段階（phase）から決まるので、別の欄には持たない。
 */
import { STORY_ERRANDS, STORY_STAGES } from './config';

export type StoryPhase =
  /** 序章：目覚めたあと、1階の母親と話すまで（玄関から出られない・スマホなし）。 */
  | 'meet-mother'
  /** 序章：お使いで町を回っている。 */
  | 'errands'
  /** 序章：お使いを終え、家で自転車を買うところ。 */
  | 'return-home'
  /** 本編：ステージの必須イベントを順に経験している。 */
  | 'stage'
  /** 本編：必須イベントをすべて経験し、ベッドで次へ進めるようになった（節目の解放）。 */
  | 'milestone'
  /** 最後のステージを終え、人生を振り返った（自由に歩ける）。 */
  | 'finished';

const PHASES: readonly StoryPhase[] = ['meet-mother', 'errands', 'return-home', 'stage', 'milestone', 'finished'];

export interface StorySave {
  v: 2;
  phase: StoryPhase;
  /** 済ませたお使いの id。 */
  errandsDone: string[];
  /** 自転車の購入で選んだ選択肢（未購入なら null）。 */
  bikeChoice: string | null;
  /** 母親に報告し、スマホの通販で注文できるようになった。旧セーブでは未設定。 */
  bikeOrderReady?: true;
  stageIndex: number;
  /** 現在のステージで経験した必須イベントの id。 */
  stepsDone: string[];
  /** 現在の必須イベントが解放されてからの探索の時間（秒）。その場で始まる出来事に使う。 */
  stepElapsed: number;
  /** ストーリーの出来事で選んだ選択肢（イベント id → 選択肢 id）。後のステージの分岐と振り返りに使う。 */
  choices: Record<string, string>;
}

export function newStoryState(): StorySave {
  return { v: 2, phase: 'meet-mother', errandsDone: [], bikeChoice: null, stageIndex: 0, stepsDone: [], stepElapsed: 0, choices: {} };
}

/** The phone is handed over by the mother at the start of the errands. */
export const phoneGiven = (s: Pick<StorySave, 'phase'>): boolean => s.phase !== 'meet-mother';
/** The bicycle arrives when the first stage begins. */
export const bikeOwned = (s: Pick<StorySave, 'phase'>): boolean => s.phase === 'stage' || s.phase === 'milestone' || s.phase === 'finished';

const strings = (value: unknown, allowed: readonly string[]): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && allowed.includes(v)))] : [];

function choices(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/**
 * Unknown or broken data yields null (the caller then treats the save as free play). Damaged fields are repaired.
 * A v1 save (timed stages) resumes at the start of the same stage.
 */
export function parseStorySave(raw: unknown): StorySave | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  const phase = s.v === 1 && s.phase === 'stage-ending' ? 'stage' : s.phase;
  if ((s.v !== 1 && s.v !== 2) || !PHASES.includes(phase as StoryPhase)) return null;
  const stageIndex = typeof s.stageIndex === 'number' && Number.isInteger(s.stageIndex)
    ? Math.min(Math.max(s.stageIndex, 0), STORY_STAGES.length - 1) : 0;
  const stage = STORY_STAGES[stageIndex];
  const stepElapsed = typeof s.stepElapsed === 'number' && Number.isFinite(s.stepElapsed) ? Math.max(s.stepElapsed, 0) : 0;
  return {
    v: 2,
    phase: phase as StoryPhase,
    errandsDone: strings(s.errandsDone, STORY_ERRANDS.map(e => e.id)),
    bikeChoice: typeof s.bikeChoice === 'string' ? s.bikeChoice : null,
    ...(s.bikeOrderReady === true ? { bikeOrderReady: true as const } : {}),
    stageIndex,
    stepsDone: s.v === 1 ? [] : strings(s.stepsDone, stage.steps.map(f => f.eventId)),
    stepElapsed: s.v === 1 ? 0 : stepElapsed,
    choices: choices(s.choices),
  };
}
