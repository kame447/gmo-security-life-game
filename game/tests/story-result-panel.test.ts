import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LifeEvaluation } from '../src/story/score';
import { StoryResultPanel } from '../src/ui/story-result-panel';
import { shopDom } from './fixtures/shop-review-dom';

const evaluation = (): LifeEvaluation => ({
  moneyYen: 42000, ties: 9, growth: 13,
  daily: { total: 44, money: 24, ties: 45, growth: 65 },
  judgments: { safe: 3, normal: 2, risky: 1 }, damages: 2, responses: 1,
  security: { total: 61, judgment: 67, damage: 67, response: 50 },
  dailyMemories: ['友達と準備して、文化祭を楽しんだ。'],
  securityMemories: ['<img src=x onerror="alert(1)">というメールを確認した。'],
});

function setup() {
  const dom = shopDom();
  const bodyClasses = new Set<string>();
  Object.assign(dom.document, { body: { classList: {
    add: (name: string) => bodyClasses.add(name),
    remove: (name: string) => bodyClasses.delete(name),
  } } });
  const onClose = vi.fn();
  const panel = new StoryResultPanel(dom.document.querySelector('#stage')! as unknown as HTMLElement, onClose);
  const key = (code: string, extra: Partial<KeyboardEvent> = {}) => {
    const event = { code, repeat: false, shiftKey: false, target: dom.document.activeElement,
      preventDefault: vi.fn(), ...extra } as unknown as KeyboardEvent;
    panel.handleKey(event);
    return event;
  };
  return { ...dom, panel, onClose, bodyClasses, key };
}

afterEach(() => vi.unstubAllGlobals());

describe('life reflection panel', () => {
  it('shows existing scores and literal memories without interpreting their markup', () => {
    const s = setup();
    s.panel.open(evaluation());
    expect(s.document.querySelector('.story-result-score-value')!.textContent).toBe('44');
    expect(s.document.querySelector('.story-result-facts')!.textContent).toBe('所持金 42,000円');
    expect(s.document.querySelector('.story-result-history')!.children[0].textContent).toBe(evaluation().dailyMemories[0]);
    s.document.querySelector('#story-result-tab-security')!.click();
    expect(s.document.querySelector('.story-result-score-value')!.textContent).toBe('61');
    expect(s.document.querySelector('.story-result-facts')!.textContent).toBe('被害 2回　対処 1回');
    expect(s.document.querySelector('.story-result-history')!.children[0].textContent).toBe(evaluation().securityMemories[0]);
    expect(s.document.querySelector('img')).toBeNull();
  });

  it('keeps Tab focus inside the panel and allows tab selection and memory scrolling with keys', () => {
    const s = setup();
    s.panel.open(evaluation());
    expect(s.document.activeElement!.id).toBe('story-result-tab-daily');
    s.key('ArrowRight');
    expect(s.document.activeElement!.id).toBe('story-result-tab-security');
    s.key('Tab');
    expect(s.document.activeElement!.id).toBe('story-result-content');
    s.key('ArrowDown');
    const content = s.document.querySelector('#story-result-content')!;
    expect(content.scrollTop).toBe(64);
    s.key('PageDown');
    expect(content.scrollTop).toBe(64 + content.clientHeight);
    s.key('Home');
    expect(content.scrollTop).toBe(0);
    s.key('Tab');
    expect(s.document.activeElement!.id).toBe('story-result-close');
    s.key('Tab');
    expect(s.document.activeElement!.id).toBe('story-result-tab-security');
    s.key('Tab', { shiftKey: true });
    expect(s.document.activeElement!.id).toBe('story-result-close');
  });

  it('closes only once, restores touch policy, and rebuilds a later opening from the new evaluation', () => {
    const s = setup();
    s.panel.open(evaluation());
    expect(s.bodyClasses.has('story-result-open')).toBe(true);
    s.key('Escape', { repeat: true });
    expect(s.panel.isOpen).toBe(true);
    s.key('Escape');
    s.panel.close();
    expect(s.onClose).toHaveBeenCalledOnce();
    expect(s.bodyClasses.has('story-result-open')).toBe(false);
    expect(s.document.querySelector('#story-result')!.hidden).toBe(true);
    s.panel.open({ ...evaluation(), moneyYen: 25, dailyMemories: [] });
    expect(s.document.querySelector('.story-result-facts')!.textContent).toBe('所持金 25円');
    expect(s.document.querySelector('.story-result-empty')!.textContent).toBe('振り返る出来事はまだありません。');
    expect(s.document.activeElement!.id).toBe('story-result-tab-daily');
    s.key('Tab', { shiftKey: true });
    s.key('Enter', { repeat: true });
    expect(s.panel.isOpen).toBe(true);
    s.key('Enter');
    expect(s.panel.isOpen).toBe(false);
    expect(s.onClose).toHaveBeenCalledTimes(2);
  });
});
