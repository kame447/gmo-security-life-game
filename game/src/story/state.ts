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
  /** 本編：ステージの制限時間が進んでいる。 */
  | 'stage'
  /** 本編：時間切れ。残りの強制イベントと節目の演出を消化している。 */
  | 'stage-ending'
  /** 用意したステージをすべて終えた（自由に歩ける）。 */
  | 'finished';

const PHASES: readonly StoryPhase[] = ['meet-mother', 'errands', 'return-home', 'stage', 'stage-ending', 'finished'];

export interface StorySave {
  v: 1;
  phase: StoryPhase;
  /** 済ませたお使いの id。 */
  errandsDone: string[];
  /** 自転車の購入で選んだ選択肢（未購入なら null）。 */
  bikeChoice: string | null;
  stageIndex: number;
  /** 現在のステージの経過時間（秒）。 */
  stageElapsed: number;
  /** 現在のステージで経験した強制イベントの id。 */
  forcedDone: string[];
}

export function newStoryState(): StorySave {
  return { v: 1, phase: 'meet-mother', errandsDone: [], bikeChoice: null, stageIndex: 0, stageElapsed: 0, forcedDone: [] };
}

/** The phone is handed over by the mother at the start of the errands. */
export const phoneGiven = (s: Pick<StorySave, 'phase'>): boolean => s.phase !== 'meet-mother';
/** The bicycle arrives when the first stage begins. */
export const bikeOwned = (s: Pick<StorySave, 'phase'>): boolean => s.phase === 'stage' || s.phase === 'stage-ending' || s.phase === 'finished';

const strings = (value: unknown, allowed: readonly string[]): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && allowed.includes(v)))] : [];

/** Unknown or broken data yields null (the caller then treats the save as free play). Damaged fields are repaired. */
export function parseStorySave(raw: unknown): StorySave | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Partial<Record<keyof StorySave, unknown>>;
  if (s.v !== 1 || !PHASES.includes(s.phase as StoryPhase)) return null;
  const stageIndex = typeof s.stageIndex === 'number' && Number.isInteger(s.stageIndex)
    ? Math.min(Math.max(s.stageIndex, 0), STORY_STAGES.length - 1) : 0;
  const stage = STORY_STAGES[stageIndex];
  const stageElapsed = typeof s.stageElapsed === 'number' && Number.isFinite(s.stageElapsed)
    ? Math.min(Math.max(s.stageElapsed, 0), stage.limitSeconds) : 0;
  return {
    v: 1,
    phase: s.phase as StoryPhase,
    errandsDone: strings(s.errandsDone, STORY_ERRANDS.map(e => e.id)),
    bikeChoice: typeof s.bikeChoice === 'string' ? s.bikeChoice : null,
    stageIndex,
    stageElapsed,
    forcedDone: strings(s.forcedDone, stage.forced.map(f => f.eventId)),
  };
}
