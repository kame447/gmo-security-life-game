/** Node-only DOM and animation queue. No browser layout or elapsed-time simulation. */
import { vi } from 'vitest';

type Listener = (event: any) => void;
class Events {
  readonly listeners = new Map<string, Listener[]>();
  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? []; list.push(fn); this.listeners.set(type, list);
  }
  fire(type: string, event: object = {}): void { for (const fn of this.listeners.get(type) ?? []) fn(event); }
}
class Classes {
  values = new Set<string>();
  toggle(name: string, force?: boolean): boolean {
    const yes = force ?? !this.values.has(name);
    if (yes) this.values.add(name); else this.values.delete(name);
    return yes;
  }
  contains(name: string): boolean { return this.values.has(name); }
}

export function shopDom() {
  let doc: Events & { activeElement: FakeElement | null };
  class FakeElement extends Events {
    readonly classList = new Classes();
    readonly dataset: Record<string, string> = {};
    readonly style: Record<string, any> = { values: {}, setProperty(k: string, v: string) { this.values[k] = v; } };
    children: FakeElement[] = [];
    parentElement: FakeElement | null = null;
    hidden = false; disabled = false; id = ''; textContent = ''; width = 1280; height = 800;
    scrollTop = 0; scrollHeight = 144; clientHeight = 144;
    rect = { x: 0, y: 0, width: 1280, height: 800, right: 1280, bottom: 800 };
    constructor(readonly tagName = 'DIV') { super(); }
    set className(value: string) { this.classList.values = new Set(value.split(/\s+/).filter(Boolean)); }
    get className(): string { return [...this.classList.values].join(' '); }
    append(...nodes: FakeElement[]): void { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
    replaceChildren(...nodes: FakeElement[]): void { this.children = []; this.append(...nodes); }
    setAttribute(name: string, value: string): void {
      if (name === 'id') this.id = value;
      else if (name === 'class') this.className = value;
      else if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
    }
    set innerHTML(html: string) {
      this.children = [];
      for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
        const child = make(match[1]);
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(attr[1], attr[2]);
        this.append(child);
      }
    }
    matches(selector: string): boolean {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector === 'button[data-action]') return this.tagName === 'BUTTON' && !!this.dataset.action;
      return this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector: string): FakeElement[] {
      const selectors = selector.split(',').map(s => s.trim()), out: FakeElement[] = [];
      const visit = (el: FakeElement): void => { for (const c of el.children) { if (selectors.some(s => c.matches(s))) out.push(c); visit(c); } };
      visit(this); return out;
    }
    querySelector(selector: string): FakeElement | null { return this.querySelectorAll(selector)[0] ?? null; }
    contains(el: FakeElement): boolean { return this === el || this.children.some(c => c.contains(el)); }
    closest(selector: string): FakeElement | null {
      for (let el: FakeElement | null = this; el; el = el.parentElement) if (selector.split(',').some(s => el!.matches(s.trim()))) return el;
      return null;
    }
    focus(): void { doc.activeElement = this; doc.fire('focusin', { target: this }); }
    click(): void { for (let el: FakeElement | null = this; el; el = el.parentElement) el.fire('click', { target: this, detail: 0 }); }
    getBoundingClientRect() { return this.rect; }
    getClientRects() { return this.hidden ? [] : [this.rect]; }
    scrollIntoView(): void {}
    setPointerCapture(): void {}
  }
  class FakeButton extends FakeElement { constructor() { super('BUTTON'); } }
  const make = (tag: string): FakeElement => tag.toLowerCase() === 'button' ? new FakeButton() : new FakeElement(tag.toUpperCase());
  doc = Object.assign(new Events(), { activeElement: null });
  const stage = make('div'); stage.id = 'stage';
  const canvas = make('canvas'); canvas.id = 'view'; stage.append(canvas);
  const document = Object.assign(doc, {
    createElement: make, createElementNS: (_namespace: string, tag: string) => make(tag),
    querySelector: (selector: string) => stage.matches(selector) ? stage : stage.querySelector(selector),
  });
  const raf = new Map<number, FrameRequestCallback>(), timers = new Map<number, () => void>();
  let frameId = 0, timerId = 0;
  const window = Object.assign(new Events(), {
    __slg: undefined as unknown,
    setTimeout: (fn: () => void) => { const id = timerId++; timers.set(id, fn); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  vi.stubGlobal('window', window); vi.stubGlobal('document', document);
  vi.stubGlobal('Element', FakeElement); vi.stubGlobal('HTMLElement', FakeElement); vi.stubGlobal('HTMLButtonElement', FakeButton);
  vi.stubGlobal('navigator', { maxTouchPoints: 0 }); vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { const id = frameId++; raf.set(id, fn); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { raf.delete(id); });
  return { window, document, canvas, raf,
    frame() { const batch = [...raf.values()]; raf.clear(); for (const fn of batch) fn(0); return batch.length; },
  };
}
