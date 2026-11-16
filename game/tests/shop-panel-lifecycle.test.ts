import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHOP_CATALOGS } from '../src/data/shop-catalogs';
import { STORE_CONTACTS } from '../src/data/stores';
import { PlayerAssets } from '../src/state/assets';
import { ShopPanel } from '../src/ui/shop-panel';
import { shopDom } from './fixtures/shop-review-dom';

function setup() {
  const dom = shopDom();
  const scene = { stats: { zoom: 3, camX: -301 / 3, camY: -160 / 3 }, area: { width: 14, height: 10 }, playerX: 208 };
  const getScene = vi.fn(() => scene);
  // Reflect.construct permits exercising the proposed fourth argument against the original three-argument version.
  const panel = Reflect.construct(ShopPanel, [new PlayerAssets({ moneyYen: 5000, items: [] }), vi.fn(), vi.fn(), getScene]) as ShopPanel;
  const context = { store: STORE_CONTACTS[0], catalog: SHOP_CATALOGS[0], greeting: { speaker: '店員', lines: ['こんにちは。'] } };
  return { ...dom, panel, context, scene, getScene };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('shop placement without a debug hook', () => {
  it('uses injected live scene geometry, independent of absent or contradictory debug data', () => {
    const s = setup(); s.panel.open(s.context);
    const stage = s.document.querySelector('.shop-stage')!;
    expect([stage.style.left, stage.style.top, stage.style.width, stage.style.height]).toEqual(['301px', '160px', '672px', '480px']);
    expect(s.document.querySelector('#shop-panel')!.style.values['--shop-unit']).toBe('3px');
    s.window.__slg = { renderer: { stats: { zoom: 1, camX: 0, camY: 0 } }, game: { area: { width: 80, height: 80 }, player: { x: 0 } } };
    s.scene.stats.camX = -200 / 3; s.frame();
    expect(stage.style.left).toBe('200px'); expect(stage.style.width).toBe('672px');
    expect(s.getScene.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
describe('shop animation lifetime', () => {
  it('cancels its outstanding callback on close, including frame id zero', () => {
    const s = setup(); s.panel.open(s.context); expect([...s.raf.keys()]).toEqual([0]);
    s.panel.close(); expect(s.raf.size).toBe(0); expect(s.frame()).toBe(0);
  });
  it('has only one chain after closing and reopening before the next frame', () => {
    const s = setup(); s.panel.open(s.context); s.panel.close(); s.panel.open(s.context);
    expect(s.raf.size).toBe(1); expect(s.frame()).toBe(1); expect(s.raf.size).toBe(1);
    expect(s.frame()).toBe(1); s.panel.close(); expect(s.raf.size).toBe(0);
  });
  it('does not start another chain when open is called on an already open shop', () => {
    const s = setup(); s.panel.open(s.context); s.panel.open(s.context);
    expect(s.raf.size).toBe(1); expect(s.frame()).toBe(1);
  });
});
