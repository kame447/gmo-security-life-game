import { describe, expect, it } from 'vitest';
import { STORY_BIKE, STORY_STAGES } from '../src/story/config';
import { STORY_EVENTS } from '../src/story/events';
import { validateLifeEvents } from '../src/events/life-events';

describe('story choices without answer labels', () => {
  const security = STORY_EVENTS.filter(event => event.category === 'security');

  it('retains the event and choice IDs used by saved progress and later branches', () => {
    expect(validateLifeEvents(STORY_EVENTS)).toEqual([]);
    for (const stage of STORY_STAGES) for (const step of stage.steps) {
      expect(STORY_EVENTS.some(event => event.id === step.eventId), step.eventId).toBe(true);
    }
    expect(STORY_EVENTS.find(event => event.id === STORY_BIKE.eventId)?.choices?.map(choice => choice.id))
      .toEqual(['site-a', 'site-b', 'site-c']);
  });

  it('does not put every safe choice in the same position', () => {
    const positions = new Set(security.flatMap(event => event.choices?.flatMap((choice, index) => choice.score?.judgment === 'safe' ? [index] : []) ?? []));
    expect(positions.size).toBeGreaterThan(1);
    expect(security.some(event => event.choices?.[0]?.score?.judgment === 'risky')).toBe(true);
    expect(security.some(event => event.choices?.[0]?.score?.judgment === 'safe')).toBe(true);
  });

  it('lets the player compare circumstances instead of seeing future outcomes in choice labels', () => {
    for (const event of security) {
      expect(event.intro.length, event.id).toBeGreaterThan(0);
      for (const choice of event.choices ?? []) {
        expect(choice.label, `${event.id}/${choice.id}`).not.toMatch(/正解|不正解|安全な|危険な|この先もずっと|だまされる|いらない許可/);
        expect(choice.result?.length, `${event.id}/${choice.id}`).toBeGreaterThan(0);
      }
    }
    const invoice = STORY_EVENTS.find(event => event.id === 'story.work.invoice')!;
    expect(invoice.intro.join(' ')).toContain('tanaka@torihlki.example');
    expect(invoice.intro.join(' ')).toContain('tanaka@torihiki.example');
    const captcha = STORY_EVENTS.find(event => event.id === 'story.univ.captcha')!;
    expect(captcha.intro.join(' ')).toContain('Windowsキー＋R');
    expect(captcha.choices?.find(choice => choice.id === 'close')?.result?.join(' ')).toContain('ブラウザ');
  });
});
