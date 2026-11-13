import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../src/input/controls';
import type { Game } from '../src/session/game';
import { UiController } from '../src/ui/controller';
import type { ModalPanel } from '../src/ui/modal-panels';

type Listener = (event: any) => void;
class FakeClassList {
  private readonly values = new Set<string>();
  toggle(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.values.has(name);
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
  contains(name: string): boolean { return this.values.has(name); }
}
class FakeElement {
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  readonly children: FakeElement[] = [];
  readonly focus = vi.fn();
  parentElement: FakeElement | null = null;
  disabled = false;
  constructor(readonly control = false) {}
  addEventListener(name: string, listener: Listener): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener); this.listeners.set(name, listeners);
  }
  fire(name: string, event: object = {}): void { for (const listener of this.listeners.get(name) ?? []) listener(event); }
  setAttribute(): void {}
  setPointerCapture(): void {}
  append(child: FakeElement): void { child.parentElement = this; this.children.push(child); }
  querySelectorAll(): FakeElement[] { return this.children; }
  closest(): FakeElement | null { return this.control ? this : null; }
}

function setup() {
  const stage = new FakeElement(), menu = new FakeElement(), canvas = new FakeElement(), touch = new FakeElement();
  const toggle = new FakeElement(true), reset = new FakeElement(true);
  const direction = new FakeElement(true); direction.dataset.dir = 'up'; touch.children.push(direction);
  const elements: Record<string, FakeElement> = { '#stage': stage, '#menu': menu, '#touch': touch, '#btn-touch': toggle, '#btn-reset': reset };
  const win = new FakeElement();
  const doc = new FakeElement() as FakeElement & { querySelector(selector: string): FakeElement | null };
  doc.querySelector = selector => elements[selector] ?? null;
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const game = { dialog: null as object | null, action: vi.fn() };
  const controls = new Controls();
  const ui = new UiController(game as unknown as Game, controls, canvas as unknown as HTMLCanvasElement);
  const resetHandler = vi.fn();
  ui.bind({ onReset: resetHandler });
  return { stage, menu, canvas, touch, toggle, reset, direction, win, game, controls, ui, resetHandler };
}

function fakePanel() {
  let opened = false;
  const panel: ModalPanel = { get isOpen() { return opened; }, handleKey: vi.fn() };
  return { panel, open: () => { opened = true; }, close: () => { opened = false; } };
}
function key(code: string, target: FakeElement, repeat = false) {
  return { code, target, repeat, preventDefault: vi.fn() };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('UiController modal integration', () => {
  it('routes buttons, shortcuts, movement and touch through the active modal', () => {
    const { ui, controls, game, canvas, stage, menu, direction, reset, resetHandler, win } = setup();
    const inventory = fakePanel(), phone = fakePanel();
    const inventoryButton = new FakeElement(true), phoneButton = new FakeElement(true);
    menu.append(inventoryButton); menu.append(phoneButton);
    ui.registerPanel({ id: 'inventory', panel: inventory.panel, open: inventory.open, button: inventoryButton as unknown as HTMLButtonElement, shortcut: 'KeyI' });
    ui.registerPanel({ id: 'phone', panel: phone.panel, open: phone.open, button: phoneButton as unknown as HTMLButtonElement, shortcut: 'KeyP' });
    controls.press('KeyW', 'up');
    const openKey = key('KeyI', canvas);
    win.fire('keydown', openKey);
    expect(openKey.preventDefault).toHaveBeenCalledOnce();
    expect(ui.mode).toBe('inventory');
    expect(ui.movementInput()).toEqual({ dir: null, run: false });
    expect(stage.classList.contains('modal-open')).toBe(true);
    expect(inventoryButton.dataset.modalTrigger).toBe('true');
    expect(inventoryButton.disabled).toBe(true);
    expect(phoneButton.disabled).toBe(true);
    phoneButton.fire('click');
    expect(phone.panel.isOpen).toBe(false);
    const modalKey = key('KeyW', canvas);
    win.fire('keydown', modalKey);
    expect(inventory.panel.handleKey).toHaveBeenCalledWith(modalKey);
    expect(controls.state()).toEqual({ dir: null, run: false });
    direction.fire('pointerdown', { preventDefault: vi.fn(), pointerId: 1 });
    reset.fire('click');
    ui.primaryAction();
    expect(controls.state()).toEqual({ dir: null, run: false });
    expect(resetHandler).not.toHaveBeenCalled();
    expect(game.action).not.toHaveBeenCalled();
    inventory.close();
    ui.update();
    expect(ui.mode).toBe('explore');
    expect(stage.classList.contains('modal-open')).toBe(false);
    expect(phoneButton.disabled).toBe(false);
    expect(canvas.focus).toHaveBeenCalled();
  });

  it('blocks openings during dialog, honors availability, and passes a shop context', () => {
    const { ui, game, menu, canvas, win } = setup();
    const phone = fakePanel(), shop = fakePanel();
    const phoneButton = new FakeElement(true);
    menu.append(phoneButton);
    let owned = false;
    ui.registerPanel({ id: 'phone', panel: phone.panel, open: phone.open, button: phoneButton as unknown as HTMLButtonElement, shortcut: 'KeyP', canOpen: () => owned });
    ui.registerPanel({ id: 'shop', panel: shop.panel });
    expect(phoneButton.disabled).toBe(true);
    owned = true; game.dialog = {};
    ui.update();
    expect(ui.mode).toBe('dialog');
    expect(phoneButton.disabled).toBe(true);
    expect(ui.openPanel('phone')).toBe(false);
    expect(ui.openPanel('shop', shop.open)).toBe(false);
    win.fire('keydown', key('KeyP', canvas));
    expect(phone.panel.isOpen).toBe(false);
    ui.primaryAction();
    expect(game.action).toHaveBeenCalledOnce();
    game.dialog = null; ui.update();
    expect(phoneButton.disabled).toBe(false);
    const context = { areaId: 'room', eventKey: 'clerk' };
    const openShop = vi.fn((value: typeof context) => { expect(value).toEqual(context); shop.open(); });
    expect(ui.openPanel('shop', () => openShop(context))).toBe(true);
    expect(openShop).toHaveBeenCalledOnce();
    expect(ui.mode).toBe('shop');
  });

  it('does not hijack keys reserved by the game or focused buttons', () => {
    const { ui, canvas, win } = setup();
    const panel = fakePanel();
    expect(() => ui.registerPanel({ id: 'inventory', panel: panel.panel, open: panel.open, shortcut: 'KeyW' })).toThrow('conflicts');
    ui.registerPanel({ id: 'inventory', panel: panel.panel, open: panel.open, shortcut: 'KeyI' });
    win.fire('keydown', key('KeyI', new FakeElement(true)));
    expect(panel.panel.isOpen).toBe(false);
    win.fire('keydown', key('KeyI', canvas, true));
    expect(panel.panel.isOpen).toBe(false);
    win.fire('keydown', key('KeyI', canvas));
    expect(panel.panel.isOpen).toBe(true);
  });

  it('rejects a launch button outside the shared menu before registering the panel', () => {
    const { ui, menu } = setup();
    const panel = fakePanel(), button = new FakeElement(true);
    const registration = { id: 'inventory' as const, panel: panel.panel, open: panel.open, button: button as unknown as HTMLButtonElement };
    expect(() => ui.registerPanel(registration)).toThrow('direct child of #menu');
    menu.append(button);
    expect(() => ui.registerPanel(registration)).not.toThrow();
  });
});
