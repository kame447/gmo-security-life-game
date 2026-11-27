import type { LifeEvaluation } from '../story/score';
import type { ModalPanel } from './modal-panels';
import './story-result.css';

type ResultAxis = 'daily' | 'security';
const AXES: readonly ResultAxis[] = ['daily', 'security'];
const AXIS_LABELS = { daily: '日常', security: 'セキュリティ' } as const;
const SCROLL_STEP = 64;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 保存した選択から計算した結果を表示する。進行・保存・採点の判断は持たない。 */
export class StoryResultPanel implements ModalPanel {
  readonly button = document.createElement('button');
  private readonly root = element('div', 'story-result-overlay');
  private readonly content = element('div', 'story-result-content');
  private readonly closeButton = document.createElement('button');
  private readonly tabs: Record<ResultAxis, HTMLButtonElement>;
  private evaluation?: LifeEvaluation;
  private axis: ResultAxis = 'daily';
  private opened = false;

  constructor(parent: HTMLElement, private readonly onClose: () => void) {
    this.button.type = 'button';
    this.button.id = 'btn-story-result';
    this.button.className = 'story-result-trigger';
    this.button.textContent = 'ふりかえり';
    this.button.title = '人生の振り返り（R）';
    this.button.hidden = true;

    this.root.id = 'story-result';
    this.root.hidden = true;
    const window = element('section', 'story-result-window panel');
    window.setAttribute('role', 'dialog');
    window.setAttribute('aria-modal', 'true');
    window.setAttribute('aria-labelledby', 'story-result-title');
    const title = element('h1', 'story-result-title', '人生の振り返り');
    title.id = 'story-result-title';
    const tabList = element('div', 'story-result-tabs');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', '振り返る内容');
    const makeTab = (axis: ResultAxis): HTMLButtonElement => {
      const tab = element('button', 'story-result-tab', AXIS_LABELS[axis]);
      tab.type = 'button';
      tab.id = `story-result-tab-${axis}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'story-result-content');
      tab.addEventListener('click', () => { this.select(axis); tab.focus({ preventScroll: true }); });
      tabList.append(tab);
      return tab;
    };
    this.tabs = { daily: makeTab('daily'), security: makeTab('security') };
    this.content.id = 'story-result-content';
    this.content.tabIndex = 0;
    this.content.setAttribute('role', 'tabpanel');
    const footer = element('div', 'story-result-footer');
    const help = element('span', 'story-result-help', '↑↓：スクロール　Esc / R：とじる');
    this.closeButton.id = 'story-result-close';
    this.closeButton.type = 'button';
    this.closeButton.textContent = '町にもどる';
    this.closeButton.addEventListener('click', () => this.close());
    footer.append(help, this.closeButton);
    window.append(title, tabList, this.content, footer);
    this.root.append(window);
    parent.append(this.root);
  }

  get isOpen(): boolean { return this.opened; }

  open(evaluation: LifeEvaluation): void {
    if (this.opened) return;
    this.evaluation = evaluation;
    this.opened = true;
    this.root.hidden = false;
    document.body.classList.add('story-result-open');
    this.select('daily');
    this.tabs.daily.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    document.body.classList.remove('story-result-open');
    this.onClose();
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.opened) return;
    if (event.code === 'Tab') {
      event.preventDefault();
      const focusable: HTMLElement[] = [this.tabs[this.axis], this.content, this.closeButton];
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const next = current < 0 ? (event.shiftKey ? focusable.length - 1 : 0)
        : (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[next].focus({ preventScroll: true });
      return;
    }
    if (event.code === 'Escape' || event.code === 'KeyR') {
      event.preventDefault();
      if (!event.repeat) this.close();
      return;
    }
    const onTab = AXES.some(axis => event.target === this.tabs[axis]);
    if (onTab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) {
      event.preventDefault();
      const next = event.code === 'Home' ? 'daily' : event.code === 'End' ? 'security'
        : AXES[(AXES.indexOf(this.axis) + 1) % AXES.length];
      this.select(next);
      this.tabs[next].focus({ preventScroll: true });
      return;
    }
    if (event.code === 'Enter' || event.code === 'Space' || event.code === 'NumpadEnter') {
      event.preventDefault();
      if (!event.repeat && event.target instanceof HTMLButtonElement && this.root.contains(event.target)) event.target.click();
      return;
    }
    const distance = event.code === 'ArrowUp' || event.code === 'KeyW' ? -SCROLL_STEP
      : event.code === 'ArrowDown' || event.code === 'KeyS' ? SCROLL_STEP
      : event.code === 'PageUp' ? -this.content.clientHeight
      : event.code === 'PageDown' ? this.content.clientHeight : undefined;
    if (distance !== undefined) {
      event.preventDefault();
      this.content.scrollTop += distance;
    } else if (event.code === 'Home' || event.code === 'End') {
      event.preventDefault();
      this.content.scrollTop = event.code === 'Home' ? 0 : this.content.scrollHeight;
    }
  }

  private select(axis: ResultAxis): void {
    this.axis = axis;
    for (const id of AXES) {
      this.tabs[id].setAttribute('aria-selected', String(id === axis));
      this.tabs[id].tabIndex = id === axis ? 0 : -1;
    }
    this.content.setAttribute('aria-labelledby', this.tabs[axis].id);
    this.render();
    this.content.scrollTop = 0;
  }

  private render(): void {
    const e = this.evaluation;
    if (!e) return;
    const daily = this.axis === 'daily';
    const summary = element('div', 'story-result-summary');
    const score = element('p', 'story-result-score');
    score.append(element('span', 'story-result-score-label', daily ? '日常の幸福度' : 'セキュリティ'),
      element('strong', 'story-result-score-value', String(daily ? e.daily.total : e.security.total)),
      element('span', 'story-result-score-unit', '/ 100 点'));
    const facts = element('p', 'story-result-facts', daily
      ? `所持金 ${e.moneyYen.toLocaleString('ja-JP')}円`
      : `被害 ${e.damages}回　対処 ${e.responses}回`);
    summary.append(score, facts);
    const breakdown = element('dl', 'story-result-breakdown');
    const parts: readonly [string, number][] = daily
      ? [['お金', e.daily.money], ['つながり', e.daily.ties], ['成長', e.daily.growth]]
      : [['判断', e.security.judgment], ['被害', e.security.damage], ['対処', e.security.response]];
    for (const [label, value] of parts) {
      const part = element('div', 'story-result-part');
      part.append(element('dt', '', label), element('dd', '', `${value} 点`));
      breakdown.append(part);
    }
    const memories = daily ? e.dailyMemories : e.securityMemories;
    const heading = element('h2', 'story-result-history-title', daily ? '日常の歩み' : '選んだこと、その後');
    const history = element('ol', 'story-result-history');
    for (const memory of memories) history.append(element('li', '', memory));
    const nodes: HTMLElement[] = [summary, breakdown];
    if (!daily) nodes.push(element('p', 'story-result-judgments',
      `安全な判断 ${e.judgments.safe}回・ふつう ${e.judgments.normal}回・危ない判断 ${e.judgments.risky}回`));
    nodes.push(heading, memories.length ? history : element('p', 'story-result-empty', '振り返る出来事はまだありません。'));
    this.content.replaceChildren(...nodes);
  }
}
