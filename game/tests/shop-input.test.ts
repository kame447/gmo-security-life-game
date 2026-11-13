import { describe, expect, it } from 'vitest';
import { SHOPS } from '../src/data/shops';
import { ShopFlow } from '../src/shop/flow';
import { handleShopKey } from '../src/shop/input';

describe('shop keyboard routing', () => {
  it('supports arrows/WASD, action keys and Escape without key-repeat purchases', () => {
    let calls = 0;
    const flow = new ShopFlow(SHOPS[0], { moneyYen: 200, quantity: () => 0, apply: () => { calls++; return { ok: true }; } });
    for (const code of ['ArrowDown', 'KeyD', 'ArrowUp', 'KeyA']) {
      expect(handleShopKey(flow, code, false)).toBe(true);
    }
    expect(flow.selectedIndex).toBe(0);
    expect(handleShopKey(flow, 'KeyZ', false)).toBe(true);
    expect(flow.phase).toBe('confirm');
    handleShopKey(flow, 'KeyZ', true);
    handleShopKey(flow, 'Enter', true);
    expect(calls).toBe(0);
    handleShopKey(flow, 'Space', false);
    for (let i = 0; i < 8; i++) handleShopKey(flow, 'Enter', false);
    expect(calls).toBe(1);
    handleShopKey(flow, 'Escape', false);
    expect(flow.phase).toBe('browse');
    handleShopKey(flow, 'Escape', false);
    expect(flow.phase).toBe('closed');
  });

  it('does not interpret other panel shortcuts as shop actions', () => {
    const flow = new ShopFlow(SHOPS[0], { moneyYen: 200, quantity: () => 0, apply: () => { throw Error('must not buy'); } });
    for (const code of ['KeyI', 'KeyP', 'ShiftLeft', 'Tab']) expect(handleShopKey(flow, code, false)).toBe(false);
    expect(flow.phase).toBe('browse');
  });
});
