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
  readonly attributes = new Map<string, string>();
  parentElement: FakeElement | null = null;
  disabled = false;
  hidden = false;
  constructor(readonly control = false) {}
  addEventListener(name: string, listener: Listener): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener); this.listeners.set(name, listeners);
  }
  fire(name: string, event: object = {}): void { for (const listener of this.listeners.get(name) ?? []) listener(event); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
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
  const accelerate = new FakeElement(true); accelerate.dataset.accelerate = '1'; touch.children.push(accelerate);
  const bicycle = new FakeElement(true); bicycle.dataset.bike = '1'; touch.children.push(bicycle);
  const elements: Record<string, FakeElement> = { '#stage': stage, '#menu': menu, '#touch': touch, '#btn-touch': toggle, '#btn-reset': reset };
  const win = new FakeElement();
  const doc = new FakeElement() as FakeElement & { querySelector(selector: string): FakeElement | null };
  doc.querySelector = selector => elements[selector] ?? null;
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const game = { dialog: null as object | null, riding: false, action: vi.fn(), toggleBicycle: vi.fn(() => true) };
  game.toggleBicycle.mockImplementation(() => { game.riding = !game.riding; return true; });
  const controls = new Controls();
  const ui = new UiController(game as unknown as Game, controls, canvas as unknown as HTMLCanvasElement, minimap, travel);
  const resetHandler = vi.fn();
  ui.bind({ onReset: resetHandler });
  return { stage, menu, canvas, touch, toggle, reset, direction, right, accelerate, bicycle, win, doc, game, controls, ui, resetHandler };
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

function pointer(pointerId: number) { return { pointerId, preventDefault: vi.fn() }; }

function ridingSetup(minimap?: Minimap, travel?: () => ModalPanel) {
  const state = setup(minimap, travel);
  state.toggle.fire('click');
  state.bicycle.fire('pointerdown', pointer(10));
  return state;
}

describe('bicycle touch acceleration', () => {
  it('appears only while riding and accelerates while another finger changes direction', () => {
    const { ui, controls, toggle, bicycle, accelerate, direction, right } = setup();
    toggle.fire('click');
    expect(accelerate.hidden).toBe(true);
    accelerate.fire('pointerdown', pointer(2));
    expect(controls.state().run).toBe(false);
    bicycle.fire('pointerdown', pointer(10));
    expect(accelerate.hidden).toBe(false);
    expect(accelerate.disabled).toBe(false);
    direction.fire('pointerdown', pointer(1));
    accelerate.fire('pointerdown', pointer(2));
    expect(ui.movementInput()).toEqual({ dir: 'up', run: true });
    expect(accelerate.attributes.get('aria-pressed')).toBe('true');
    direction.fire('pointerup', pointer(1));
    right.fire('pointerdown', pointer(3));
    expect(ui.movementInput()).toEqual({ dir: 'right', run: true });
    accelerate.fire('pointerup', pointer(2));
    expect(ui.movementInput()).toEqual({ dir: 'right', run: false });
    expect(accelerate.attributes.get('aria-pressed')).toBe('false');
  });

  it.each(['pointerup', 'pointercancel', 'lostpointercapture'])('releases on %s without clearing a keyboard Shift source', event => {
    const { ui, controls, accelerate } = ridingSetup();
    controls.pressRun('ShiftLeft');
    accelerate.fire('pointerdown', pointer(2));
    accelerate.fire(event, pointer(2));
    expect(accelerate.attributes.get('aria-pressed')).toBe('false');
    expect(ui.movementInput().run).toBe(true);
    controls.release('ShiftLeft');
    expect(ui.movementInput().run).toBe(false);
  });

  it('releases when a pointer ends outside the button or the document loses input', () => {
    const { ui, accelerate, win, doc, canvas } = ridingSetup();
    for (const end of [
      () => win.fire('pointerup', pointer(2)),
      () => win.fire('pointercancel', pointer(2)),
      () => win.fire('blur'),
      () => doc.fire('visibilitychange'),
      () => doc.fire('focusin', { target: new FakeElement(true) }),
    ]) {
      accelerate.fire('pointerdown', pointer(2));
      expect(ui.movementInput().run).toBe(true);
      end();
      doc.fire('focusin', { target: canvas });
      expect(ui.movementInput().run).toBe(false);
      expect(accelerate.attributes.get('aria-pressed')).toBe('false');
    }
  });

  it('does not resume acceleration after dialog, modal, map or travel closes', () => {
    const minimap = { isOpen: false, handleKey: vi.fn() }, travel = fakePanel();
    const { ui, accelerate, game } = ridingSetup(minimap as unknown as Minimap, () => travel.panel);
    const phone = fakePanel();
    ui.registerPanel({ id: 'phone', panel: phone.panel, open: phone.open });
    for (const [open, close] of [
      [() => { game.dialog = {}; }, () => { game.dialog = null; }],
      [() => { ui.openPanel('phone'); }, phone.close],
      [() => { minimap.isOpen = true; }, () => { minimap.isOpen = false; }],
      [travel.open, travel.close],
    ]) {
      accelerate.fire('pointerdown', pointer(2));
      expect(ui.movementInput().run).toBe(true);
      open(); ui.update();
      accelerate.fire('pointerdown', pointer(3));
      expect(accelerate.disabled).toBe(true);
      close(); ui.update();
      expect(ui.movementInput().run).toBe(false);
      expect(accelerate.attributes.get('aria-pressed')).toBe('false');
    }
  });

  it('releases on dismount and when touch controls are hidden, requiring a new press', () => {
    const { ui, accelerate, game, toggle, bicycle, win, canvas } = ridingSetup();
    for (const [leave, resume] of [
      [() => bicycle.fire('pointerdown', pointer(10)), () => bicycle.fire('pointerdown', pointer(10))],
      [() => win.fire('keydown', key('KeyB', canvas)), () => win.fire('keydown', key('KeyB', canvas))],
      [() => { game.riding = false; }, () => { game.riding = true; }],
      [() => toggle.fire('click'), () => toggle.fire('click')],
    ]) {
      accelerate.fire('pointerdown', pointer(2));
      expect(ui.movementInput().run).toBe(true);
      leave(); ui.update();
      expect(ui.movementInput().run).toBe(false);
      resume(); ui.update();
      expect(ui.movementInput().run).toBe(false);
      expect(accelerate.attributes.get('aria-pressed')).toBe('false');
    }
  });
});
