import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHOPS } from '../src/data/shops';
import { PlayerAssets } from '../src/state/assets';
import { ShopPanel } from '../src/ui/shop-panel';

// A small event/focus surface; the panel, flow and asset updates are the real implementations.
const elements = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../src/ui/dom', () => ({ $: (selector: string) => elements.get(selector) }));
let active: ElementStub | null;
class ElementStub {
  hidden = false;
  textContent = '';
  dataset: Record<string, string> = {};
  parent: ElementStub | null = null;
  children: ElementStub[] = [];
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  private listeners = new Map<string, EventListener>();
  constructor(readonly tag = 'div') {}
  setAttribute(): void {}
  addEventListener(type: string, fn: EventListener): void { this.listeners.set(type, fn); }
  replaceChildren(...children: ElementStub[]): void {
    this.children = children;
    children.forEach(child => { child.parent = this; });
  }
  contains(element: ElementStub): boolean { return this === element || this.children.some(child => child.contains(element)); }
  querySelectorAll(): ElementStub[] {
    return this.children.flatMap(child => [...(child.tag === 'button' ? [child] : []), ...child.querySelectorAll()]);
  }
  closest(): ElementStub | null {
    for (let node: ElementStub | null = this; node; node = node.parent) if (node.hidden) return node;
    return null;
  }
  focus(): void { active = this; this.listeners.get('focus')?.({} as Event); }
  click(): void { this.listeners.get('click')?.({ detail: 0 } as unknown as Event); }
}
class ButtonStub extends ElementStub { constructor() { super('button'); } }

beforeEach(() => {
  elements.clear();
  active = null;
  const names = ['stage', 'shop-panel', 'shop-list', 'shop-details', 'shop-buy', 'shop-back', 'shop-close', 'shop-title', 'shop-balance', 'shop-result'];
  for (const id of names) elements.set(`#${id}`, ['shop-buy', 'shop-back', 'shop-close'].includes(id) ? new ButtonStub() : new ElementStub());
  const panel = elements.get('#shop-panel') as ElementStub;
  panel.replaceChildren(...names.slice(2).map(id => elements.get(`#${id}`) as ElementStub));
  vi.stubGlobal('document', {
    get activeElement() { return active; },
    createElement: (tag: string) => tag === 'button' ? new ButtonStub() : new ElementStub(tag),
  });
  vi.stubGlobal('HTMLButtonElement', ButtonStub);
});
afterEach(() => vi.unstubAllGlobals());

function key(code: string, repeat = false): KeyboardEvent {
  return { code, repeat, shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}
function setup() {
  const assets = new PlayerAssets();
  const close = vi.fn(), save = vi.fn();
  const panel = new ShopPanel(assets, close, save);
  panel.open(SHOPS[0]);
  const phase = () => (elements.get('#shop-panel') as ElementStub).dataset.phase;
  return { assets, close, save, panel, phase };
}

describe('focused shop button regression', () => {
  it.each(['Enter', 'Space', 'KeyZ'])('honors focused cancel/close with %s and never spends money', code => {
    for (const target of ['shop-back', 'shop-close']) {
      const { assets, close, save, panel, phase } = setup();
      const initial = assets.snapshot();
      panel.primaryAction();
      for (let i = 0; i < (target === 'shop-back' ? 2 : 3); i++) panel.handleKey(key('Tab'));
      expect(active).toBe(elements.get(`#${target}`));
      panel.handleKey(key(code, true));
      expect(phase()).toBe('confirm');
      panel.handleKey(key(code));
      expect(assets.snapshot()).toEqual(initial);
      expect(save).not.toHaveBeenCalled();
      expect(panel.isOpen).toBe(target === 'shop-back');
      if (target === 'shop-back') expect(phase()).toBe('browse');
      expect(close).toHaveBeenCalledTimes(target === 'shop-close' ? 1 : 0);
    }
  });

  it.each(['Enter', 'Space', 'KeyZ'])('selects the focused product with %s and charges only after confirmation', code => {
    const { assets, save, panel, phase } = setup();
    const initial = assets.moneyYen;
    panel.handleKey(key('Tab'));
    panel.handleKey(key('Tab'));
    panel.handleKey(key(code));
    expect(phase()).toBe('confirm');
    expect((elements.get('#shop-details') as ElementStub).textContent).toContain('みず');
    expect(assets.moneyYen).toBe(initial);
    expect(save).not.toHaveBeenCalled();
    panel.handleKey(key('Tab')); // focused buy button
    panel.handleKey(key(code));
    for (let i = 0; i < 5; i++) panel.handleKey(key(code));
    expect(assets.moneyYen).toBe(initial - 100);
    expect(assets.quantity('bottled-water')).toBe(1);
    expect(assets.quantity('small-snack')).toBe(0);
    expect(save).toHaveBeenCalledOnce();
  });

  it('keeps arrow selection consistent after tabbing to a product', () => {
    const { panel } = setup();
    panel.handleKey(key('Tab'));
    panel.handleKey(key('Tab')); // water
    panel.handleKey(key('ArrowUp')); // snack
    panel.handleKey(key('Enter'));
    expect((elements.get('#shop-details') as ElementStub).textContent).toContain('おかし');
  });
});
