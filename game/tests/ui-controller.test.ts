import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../src/input/controls';
import type { Minimap } from '../src/minimap/view';
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
  fire(name: string, event: object = {}): void {
    const input = /pointer/.test(name) ? { type: name, ...event } : event;
    for (const listener of this.listeners.get(name) ?? []) listener(input);
  }
  setAttribute(): void {}
  setPointerCapture(): void {}
  append(child: FakeElement): void { child.parentElement = this; this.children.push(child); }
  querySelectorAll(): FakeElement[] { return this.children; }
  closest(): FakeElement | null { return this.control ? this : null; }
}

function setup(minimap?: Minimap, travel?: () => ModalPanel | undefined) {
  const stage = new FakeElement(), menu = new FakeElement(), canvas = new FakeElement(), touch = new FakeElement();
  const toggle = new FakeElement(true), reset = new FakeElement(true);
  const direction = new FakeElement(true); direction.dataset.dir = 'up'; touch.children.push(direction);
  const right = new FakeElement(true); right.dataset.dir = 'right'; touch.children.push(right);
  const bicycle = new FakeElement(true); bicycle.dataset.bike = '1'; touch.children.push(bicycle);
  const elements: Record<string, FakeElement> = { '#stage': stage, '#menu': menu, '#touch': touch, '#btn-touch': toggle, '#btn-reset': reset };
  const win = new FakeElement();
  const doc = new FakeElement() as FakeElement & { querySelector(selector: string): FakeElement | null };
  doc.querySelector = selector => elements[selector] ?? null;
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const game = {
    dialog: null as object | null,
    riding: false,
    action: vi.fn(),
    toggleBicycle() { this.riding = !this.riding; },
  };
  const controls = new Controls();
  const ui = new UiController(game as unknown as Game, controls, canvas as unknown as HTMLCanvasElement, minimap, travel);
  const resetHandler = vi.fn();
  ui.bind({ onReset: resetHandler });
  return { stage, menu, canvas, touch, toggle, reset, direction, right, bicycle, win, game, controls, ui, resetHandler };
}

function fakePanel() {
  let opened = false;
  const panel: ModalPanel = { get isOpen() { return opened; }, handleKey: vi.fn() };
  return { panel, open: () => { opened = true; }, close: () => { opened = false; } };
}
function key(code: string, target: FakeElement, repeat = false) {
  return { code, target, repeat, preventDefault: vi.fn() };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('UiController modal integration', () => {
  it('keeps travel exclusive with phone, appearance, movement, reset and touch', () => {
    const travel = fakePanel();
    const { ui, controls, game, stage, menu, canvas, win, direction, toggle, touch, reset, resetHandler } = setup(undefined, () => travel.panel);
    const phone = fakePanel(), avatar = fakePanel();
    const phoneButton = new FakeElement(true), avatarButton = new FakeElement(true);
    menu.append(phoneButton); menu.append(avatarButton);
    ui.registerPanel({ id: 'phone', panel: phone.panel, open: phone.open, button: phoneButton as unknown as HTMLButtonElement, shortcut: 'KeyP' });
    ui.registerPanel({ id: 'avatar', panel: avatar.panel, open: avatar.open, button: avatarButton as unknown as HTMLButtonElement });
    travel.open(); ui.update();
    expect(ui.mode).toBe('travel');
    expect(stage.classList.contains('modal-open')).toBe(true);
    expect(phoneButton.disabled).toBe(true);
    expect(avatarButton.disabled).toBe(true);
    controls.press('KeyW', 'up');
    expect(ui.movementInput()).toEqual({ dir: null, run: false });
    controls.clear();
    expect(ui.openPanel('phone')).toBe(false);
    phoneButton.fire('click'); avatarButton.fire('click');
    const shortcut = key('KeyP', canvas);
    win.fire('keydown', shortcut);
    expect(travel.panel.handleKey).toHaveBeenCalledWith(shortcut);
    ui.primaryAction(); reset.fire('click'); toggle.fire('click');
    direction.fire('pointerdown', { preventDefault: vi.fn(), pointerId: 1 });
    expect(game.action).not.toHaveBeenCalled();
    expect(resetHandler).not.toHaveBeenCalled();
    expect(controls.state()).toEqual({ dir: null, run: false });
    expect(touch.classList.contains('on')).toBe(false);
    expect(phone.panel.isOpen).toBe(false);
    expect(avatar.panel.isOpen).toBe(false);
    travel.close(); ui.update();
    expect(ui.mode).toBe('explore');
    expect(stage.classList.contains('modal-open')).toBe(false);
    expect(phoneButton.disabled).toBe(false);
    phoneButton.fire('click');
    expect(ui.mode).toBe('phone');
  });

  it('gives the full map priority over phone openings, movement, reset, action and touch', () => {
    const minimap = { isOpen: true, handleKey: vi.fn() };
    const { ui, controls, game, menu, canvas, win, direction, toggle, touch, reset, resetHandler } = setup(minimap as unknown as Minimap);
    const phone = fakePanel(), button = new FakeElement(true);
    menu.append(button);
    ui.registerPanel({ id: 'phone', panel: phone.panel, open: phone.open,
      button: button as unknown as HTMLButtonElement, shortcut: 'KeyP' });
    expect(ui.mode).toBe('map');
    expect(button.disabled).toBe(true);
    expect(ui.openPanel('phone')).toBe(false);
    button.fire('click');
    const shortcut = key('KeyP', canvas);
    win.fire('keydown', shortcut);
    expect(minimap.handleKey).toHaveBeenCalledWith(shortcut);
    expect(phone.panel.isOpen).toBe(false);
    controls.press('KeyW', 'up');
    expect(ui.movementInput()).toEqual({ dir: null, run: false });
    controls.clear();
    ui.primaryAction(); reset.fire('click'); toggle.fire('click');
    direction.fire('pointerdown', { preventDefault: vi.fn(), pointerId: 1 });
    expect(game.action).not.toHaveBeenCalled();
    expect(resetHandler).not.toHaveBeenCalled();
    expect(touch.classList.contains('on')).toBe(false);
    expect(controls.state()).toEqual({ dir: null, run: false });
    minimap.isOpen = false; ui.update();
    expect(button.disabled).toBe(false);
    button.fire('click');
    expect(ui.mode).toBe('phone');
    const phoneKey = key('ArrowLeft', canvas);
    win.fire('keydown', phoneKey);
    expect(phone.panel.handleKey).toHaveBeenCalledWith(phoneKey);
    expect(minimap.handleKey).toHaveBeenCalledTimes(1);
  });

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

function pointer(pointerId = 1) { return { pointerId, preventDefault: vi.fn() }; }

function touchSetup(minimap?: Minimap, travel?: () => ModalPanel) {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const state = setup(minimap, travel);
  state.toggle.fire('click');
  return { ...state, at: (ms: number) => clock.mockReturnValue(ms) };
}

describe('bicycle touch acceleration', () => {
  it('starts at 300 ms and restarts after all fingers leave', () => {
    const { ui, direction, bicycle, at } = touchSetup();
    bicycle.fire('pointerdown', pointer(10));
    direction.fire('pointerdown', pointer());
    at(299);
    expect(ui.movementInput()).toEqual({ dir: 'up', run: false });
    at(300);
    expect(ui.movementInput()).toEqual({ dir: 'up', run: true });
    direction.fire('pointerup', pointer());
    expect(ui.movementInput()).toEqual({ dir: null, run: false });
    direction.fire('pointerdown', pointer());
    at(599);
    expect(ui.movementInput()).toEqual({ dir: 'up', run: false });
    at(600);
    expect(ui.movementInput()).toEqual({ dir: 'up', run: true });
  });

  it('starts the hold over when a second finger changes direction', () => {
    const { ui, direction, right, bicycle, at } = touchSetup();
    bicycle.fire('pointerdown', pointer(10));
    direction.fire('pointerdown', pointer(1));
    at(300);
    expect(ui.movementInput()).toEqual({ dir: 'up', run: true });
    right.fire('pointerdown', pointer(2));
    expect(ui.movementInput()).toEqual({ dir: 'right', run: false });
    direction.fire('pointerup', pointer(1));
    at(600);
    expect(ui.movementInput()).toEqual({ dir: 'right', run: true });
    direction.fire('pointerdown', pointer(3));
    direction.fire('pointerup', pointer(3));
    at(899);
    expect(ui.movementInput()).toEqual({ dir: 'right', run: false });
    at(900);
    expect(ui.movementInput()).toEqual({ dir: 'right', run: true });
  });

  it.each(['pointercancel', 'lostpointercapture'])('ends the hold on %s while preserving Shift', event => {
    const { ui, direction, bicycle, win, canvas, at } = touchSetup();
    bicycle.fire('pointerdown', pointer(10));
    direction.fire('pointerdown', pointer());
    at(300);
    expect(ui.movementInput()).toEqual({ dir: 'up', run: true });
    win.fire('keydown', key('ShiftLeft', canvas));
    direction.fire(event, pointer());
    expect(ui.movementInput()).toEqual({ dir: null, run: true });
    win.fire('keyup', key('ShiftLeft', canvas));
    expect(ui.movementInput()).toEqual({ dir: null, run: false });
  });

  it('requires a new hold after conversation, menu, map or travel', () => {
    const minimap = { isOpen: false, handleKey: vi.fn() };
    const travel = fakePanel(), avatar = fakePanel();
    const { ui, game, direction, bicycle, at } = touchSetup(minimap as unknown as Minimap, () => travel.panel);
    ui.registerPanel({ id: 'avatar', panel: avatar.panel, open: avatar.open });
    bicycle.fire('pointerdown', pointer(10));
    let now = 0;
    for (const [open, close] of [
      [() => { game.dialog = {}; }, () => { game.dialog = null; }],
      [() => { ui.openPanel('avatar'); }, avatar.close],
      [() => { minimap.isOpen = true; }, () => { minimap.isOpen = false; }],
      [travel.open, travel.close],
    ]) {
      direction.fire('pointerdown', pointer());
      at(now += 300);
      expect(ui.movementInput().run).toBe(true);
      open(); ui.update();
      expect(ui.movementInput().run).toBe(false);
      close(); ui.update();
      at(now += 600);
      expect(ui.movementInput().run).toBe(false);
      direction.fire('pointerup', pointer());
    }
  });

  it('keeps walking at normal speed and clears on either dismount control', () => {
    const { ui, direction, bicycle, win, canvas, at } = touchSetup();
    direction.fire('pointerdown', pointer());
    at(600);
    expect(ui.movementInput()).toEqual({ dir: 'up', run: false });
    direction.fire('pointerup', pointer());
    let now = 600;
    for (const toggleBicycle of [
      () => bicycle.fire('pointerdown', pointer(10)),
      () => win.fire('keydown', key('KeyB', canvas)),
    ]) {
      toggleBicycle();
      direction.fire('pointerdown', pointer());
      at(now += 300);
      expect(ui.movementInput()).toEqual({ dir: 'up', run: true });
      toggleBicycle();
      expect(ui.movementInput()).toEqual({ dir: 'up', run: false });
      direction.fire('pointerup', pointer());
    }
  });
});
