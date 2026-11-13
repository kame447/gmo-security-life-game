import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../src/input/controls';
import { Game } from '../src/session/game';
import type { AvatarPanel } from '../src/ui/avatar-panel';
import { UiController } from '../src/ui/controller';
import type { InventoryPanel } from '../src/ui/inventory-panel';
import type { ShopPanel } from '../src/ui/shop-panel';
import { buildWorld } from '../src/world';

// Only event targets are stubbed; exercise the real controller, controls and session in Node.
const elements = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../src/ui/dom', () => ({ $: (selector: string) => elements.get(selector) }));

class Target {
  readonly listeners = new Map<string, EventListener>();
  readonly classList = { toggle: vi.fn(), contains: () => false };
  readonly dataset: Record<string, string> = {};
  addEventListener(type: string, fn: EventListener): void { this.listeners.set(type, fn); }
  setAttribute(): void {}
  querySelectorAll(): Target[] { return []; }
  focus(): void {}
  fire(type: string, properties: Record<string, unknown> = {}): void {
    this.listeners.get(type)?.({ preventDefault: vi.fn(), ...properties } as unknown as Event);
  }
}

const world = buildWorld();
beforeEach(() => {
  elements.clear();
  for (const selector of ['#touch', '#btn-touch', '#btn-inventory', '#btn-avatar', '#btn-reset']) elements.set(selector, new Target());
  vi.stubGlobal('window', new Target());
  vi.stubGlobal('document', new Target());
  vi.stubGlobal('HTMLElement', Target);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  let ui: UiController;
  const game = new Game(world, { sink: { onMapEvent: event => {
    if (event.type === 'interact' && ui.openShop(event.eventKey)) return { lines: [] };
  } } });
  const controls = new Controls();
  const panel = () => ({ isOpen: false, open: vi.fn(function (this: { isOpen: boolean }) { this.isOpen = true; }), handleKey: vi.fn() });
  const avatar = panel(), inventory = panel(), shop = panel();
  ui = new UiController(game, controls, avatar as unknown as AvatarPanel, new Target() as unknown as HTMLCanvasElement,
    inventory as unknown as InventoryPanel, shop as unknown as ShopPanel);
  const reset = vi.fn();
  ui.bind({ onReset: reset });
  const key = (code: string, repeat = false) => (window as unknown as Target).fire('keydown', { code, repeat });
  const click = (selector: string) => (elements.get(selector) as Target).fire('click');
  return { game, controls, avatar, inventory, shop, ui, key, click, reset };
}

describe('shop and existing UI input modes', () => {
  it('opens through the real interaction sink without opening the default dialog', () => {
    const { game, controls, ui, shop, key } = setup();
    const target = game.area.interactions.find(item => item.eventKey === 'shopping.candy')!;
    game.player = { areaId: game.area.def.id, x: target.x * 16 + 8, y: (target.y + 1) * 16 + 14, facing: 'up' };
    controls.press('ArrowDown', 'down');
    key('KeyZ');
    expect(ui.mode).toBe('shop');
    expect(shop.open).toHaveBeenCalledOnce();
    expect(game.dialog).toBeNull();
    expect(controls.state()).toEqual({ dir: null, run: false });
  });

  it.each(['shop', 'inventory', 'avatar', 'dialog'] as const)('cannot open a shop from %s mode', mode => {
    const state = setup();
    if (mode === 'dialog') state.game.dialog = { speaker: 'test', lines: ['hello'], index: 0 };
    else state[mode].isOpen = true;
    expect(state.ui.openShop('shopping.candy')).toBe(false);
    expect(state.shop.open).not.toHaveBeenCalled();
  });

  it('routes keys to the shop and blocks world actions, held movement and other menu buttons', () => {
    const { game, controls, ui, key, click, shop, avatar, inventory, reset } = setup();
    expect(ui.openShop('shopping.konbini.clerk')).toBe(true);
    const action = vi.spyOn(game, 'action');
    controls.press('ArrowRight', 'right');
    controls.pressRun('ShiftLeft');
    const before = { ...game.player };
    game.update(1, ui.movementInput());
    expect(game.player).toEqual(before);
    for (const code of ['ArrowUp', 'KeyZ', 'KeyI', 'KeyP', 'Escape']) key(code);
    expect(shop.handleKey).toHaveBeenCalledTimes(5);
    ui.primaryAction();
    click('#btn-avatar');
    click('#btn-inventory');
    click('#btn-reset');
    expect(action).not.toHaveBeenCalled();
    expect(avatar.open).not.toHaveBeenCalled();
    expect(inventory.open).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it.each(['inventory', 'avatar'] as const)('keeps action keys in the existing %s panel', mode => {
    const state = setup();
    state[mode].isOpen = true;
    const action = vi.spyOn(state.game, 'action');
    state.key('KeyZ');
    expect(state[mode].handleKey).toHaveBeenCalledOnce();
    expect(state.shop.handleKey).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(state.ui.movementInput()).toEqual({ dir: null, run: false });
  });

  it('keeps non-shopping interactions and their dialog controls available', () => {
    const { ui, game, key, shop } = setup();
    expect(ui.openShop('not-a-shop')).toBe(false);
    game.dialog = { speaker: 'test', lines: ['one', 'two'], index: 0 };
    key('KeyZ');
    expect(game.dialog?.index).toBe(1);
    expect(shop.open).not.toHaveBeenCalled();
  });
});
