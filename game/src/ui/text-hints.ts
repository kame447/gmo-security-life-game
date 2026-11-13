/** Review candidates for the existing exploration hint, independent of DOM and game state. */
export type HintCandidate = 'quiet' | 'first';
export const INTRO_HINT_MS = 6000;

export function hintCandidate(value: string | null): HintCandidate {
  return value === 'first' ? 'first' : 'quiet';
}

export function visibleHint(input: {
  candidate: HintCandidate;
  now: number;
  startedAt: number;
  dialog: boolean;
  target?: { name: string; kind: string };
}): string | null {
  if (input.dialog) return null;
  if (input.target) return `${input.target.name}　${input.target.kind === 'npc' ? 'はなす' : 'しらべる'}`;
  if (input.candidate === 'first' && input.now - input.startedAt < INTRO_HINT_MS) return '↑↓←→ あるく　Z しらべる';
  return null;
}
