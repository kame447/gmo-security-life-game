import { describe, expect, it } from 'vitest';
import { hintCandidate, INTRO_HINT_MS, visibleHint } from '../src/ui/text-hints';

describe('exploration text candidates', () => {
  it('uses an empty exploration hint for quiet and unknown candidates', () => {
    expect(hintCandidate('quiet')).toBe('quiet');
    expect(hintCandidate('other')).toBe('quiet');
    expect(visibleHint({ candidate: 'quiet', now: 2, startedAt: 0, dialog: false })).toBeNull();
  });

  it('shows the short initial hint only for the proposed initial interval', () => {
    const state = { candidate: hintCandidate('first'), startedAt: 10, dialog: false };
    expect(visibleHint({ ...state, now: 10 })).toBe('↑↓←→ あるく　Z しらべる');
    expect(visibleHint({ ...state, now: 10 + INTRO_HINT_MS })).toBeNull();
  });

  it('prioritizes the current target and hides hints during dialog', () => {
    const state = { candidate: hintCandidate('first'), startedAt: 0, now: 1 };
    expect(visibleHint({ ...state, dialog: false, target: { name: 'ひと', kind: 'npc' } })).toBe('ひと　はなす');
    expect(visibleHint({ ...state, dialog: false, target: { name: 'ポスト', kind: 'object' } })).toBe('ポスト　しらべる');
    expect(visibleHint({ ...state, dialog: true, target: { name: 'ひと', kind: 'npc' } })).toBeNull();
  });
});
