import { describe, expect, it, vi } from 'vitest';
import { SHOP_CATALOGS } from '../src/data/shop-catalogs';
import { ClerkFlow } from '../src/shop/clerk-flow';
import { PointerOrigin } from '../src/shop/pointer-origin';
import { PlayerAssets } from '../src/state/assets';

describe('shop pointer origin', () => {
  it('rejects the trailing click of a gesture that began before opening the panel', () => {
    const origin = new PointerOrigin<object>(), review = {};
    origin.begin(undefined); origin.reset();
    expect(origin.accept(review, 1)).toBe(false);
  });
  it('allows a fresh press on the same button once, with no timer', () => {
    const origin = new PointerOrigin<object>(), review = {};
    origin.begin(review); expect(origin.accept(review, 1)).toBe(true);
    expect(origin.accept(review, 1)).toBe(false);
    origin.begin(review); expect(origin.accept(review, 1)).toBe(true);
  });
  it('invalidates a previous button when the next press begins outside the panel', () => {
    const origin = new PointerOrigin<object>(), review = {};
    origin.begin(review); origin.begin(undefined);
    expect(origin.accept(review, 1)).toBe(false);
  });
  it('rejects a release/click on a different button and consumes its stale origin', () => {
    const origin = new PointerOrigin<object>(), back = {}, confirm = {};
    origin.begin(back);
    expect(origin.accept(confirm, 1)).toBe(false); expect(origin.accept(back, 1)).toBe(false);
  });
  it('clears a cancelled or closed gesture before the next opening', () => {
    const origin = new PointerOrigin<object>(), confirm = {};
    origin.begin(confirm); origin.reset();
    expect(origin.accept(confirm, 1)).toBe(false);
  });
  it('preserves keyboard/assistive activation without inheriting a pointer press', () => {
    const origin = new PointerOrigin<object>(), back = {}, confirm = {};
    expect(origin.accept(back, 0)).toBe(true);
    origin.begin(confirm); expect(origin.accept(back, 0)).toBe(true);
    expect(origin.accept(confirm, 1)).toBe(false);
  });
  it('keeps the actual transaction idle on opening, then requires separate review and payment gestures', () => {
    const assets = new PlayerAssets(), initial = assets.snapshot(), apply = vi.spyOn(assets, 'apply');
    const origin = new PointerOrigin<object>(), review = {}, confirm = {};
    origin.begin(undefined); // Actual A pointerdown is outside the panel, before openShop.
    const flow = ClerkFlow.openShop(SHOP_CATALOGS[0], { speaker: '店員', lines: ['いらっしゃい。'] }, assets);
    origin.reset();
    if (origin.accept(review, 1)) flow.reviewPurchase(); // Its retargeted trailing click.
    expect(flow.phase).toBe('catalog'); expect(assets.snapshot()).toEqual(initial);
    origin.begin(review); if (origin.accept(review, 1)) flow.reviewPurchase();
    expect(flow.phase).toBe('confirm'); expect(assets.snapshot()).toEqual(initial);
    if (origin.accept(confirm, 1)) flow.confirmPurchase();
    expect(assets.snapshot()).toEqual(initial);
    origin.begin(confirm); if (origin.accept(confirm, 1)) flow.confirmPurchase();
    expect(flow.phase).toBe('receipt'); expect(assets.moneyYen).toBe(880);
    expect(assets.quantity('bottled-water')).toBe(1); expect(apply).toHaveBeenCalledTimes(1);
    if (origin.accept(confirm, 1)) flow.confirmPurchase();
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it('keeps focused keyboard cancellation free of financial changes', () => {
    const assets = new PlayerAssets(), initial = assets.snapshot();
    const flow = ClerkFlow.openShop(SHOP_CATALOGS[0], { speaker: '店員', lines: [] }, assets);
    const origin = new PointerOrigin<object>(), back = {};
    flow.reviewPurchase(); if (origin.accept(back, 0)) flow.back();
    expect(flow.phase).toBe('catalog'); expect(assets.snapshot()).toEqual(initial);
  });
});
