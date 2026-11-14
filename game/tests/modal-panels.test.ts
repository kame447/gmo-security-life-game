import { describe, expect, it, vi } from 'vitest';
import { ModalPanels, type ModalPanel } from '../src/ui/modal-panels';

function fakePanel() {
  let opened = false;
  const handleKey = vi.fn();
  const panel: ModalPanel = { get isOpen() { return opened; }, handleKey };
  return { panel, handleKey, open: () => { opened = true; }, close: () => { opened = false; } };
}

describe('modal panel registry', () => {
  it('permits only one panel from exploration and routes keys to the active panel', () => {
    let dialog = false;
    const clear = vi.fn();
    const panels = new ModalPanels(() => dialog, clear);
    const avatar = fakePanel(), inventory = fakePanel();
    panels.register({ id: 'avatar', panel: avatar.panel, open: avatar.open });
    panels.register({ id: 'inventory', panel: inventory.panel, open: inventory.open, shortcut: 'KeyI' });
    expect(panels.mode).toBe('explore');
    dialog = true;
    expect(panels.mode).toBe('dialog');
    expect(panels.open('inventory')).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    dialog = false;
    expect(panels.open('inventory')).toBe(true);
    expect(clear).toHaveBeenCalledOnce();
    expect(panels.mode).toBe('inventory');
    expect(panels.open('avatar')).toBe(false);
    const event = { code: 'ArrowDown' } as KeyboardEvent;
    expect(panels.dispatchKey(event)).toBe(true);
    expect(inventory.handleKey).toHaveBeenCalledWith(event);
    expect(avatar.handleKey).not.toHaveBeenCalled();
    inventory.close();
    expect(panels.mode).toBe('explore');
    expect(panels.dispatchKey(event)).toBe(false);
    expect(panels.open('avatar')).toBe(true);
  });

  it('accepts contextual opening and respects panel availability', () => {
    let available = false;
    const panels = new ModalPanels(() => false, vi.fn());
    const shop = fakePanel(), phone = fakePanel();
    panels.register({ id: 'shop', panel: shop.panel });
    panels.register({ id: 'phone', panel: phone.panel, open: phone.open, canOpen: () => available });
    expect(panels.open('shop')).toBe(false);
    const context = { areaId: 'room', eventKey: 'clerk' };
    const openShop = vi.fn((value: typeof context) => { expect(value).toEqual(context); shop.open(); });
    expect(panels.open('shop', () => openShop(context))).toBe(true);
    expect(openShop).toHaveBeenCalledOnce();
    shop.close();
    expect(panels.canOpen('phone')).toBe(false);
    expect(panels.open('phone')).toBe(false);
    available = true;
    expect(panels.open('phone')).toBe(true);
  });

  it('blocks reentrant opens and rejects ambiguous registrations', () => {
    const panels = new ModalPanels(() => false, vi.fn());
    const inventory = fakePanel(), phone = fakePanel();
    panels.register({ id: 'phone', panel: phone.panel, open: phone.open, shortcut: 'KeyP' });
    panels.register({ id: 'inventory', panel: inventory.panel, open: () => {
      expect(panels.open('phone')).toBe(false);
      inventory.open();
    }, shortcut: 'KeyI' });
    expect(panels.open('inventory')).toBe(true);
    expect(phone.panel.isOpen).toBe(false);
    expect(() => panels.register({ id: 'inventory', panel: fakePanel().panel })).toThrow('Duplicate panel');
    expect(() => panels.register({ id: 'shop', panel: phone.panel })).toThrow('already registered');
    expect(() => panels.register({ id: 'shop', panel: fakePanel().panel, open: () => {}, shortcut: 'KeyP' })).toThrow('Duplicate shortcut');
    expect(() => panels.register({ id: 'shop', panel: fakePanel().panel, shortcut: 'KeyS' })).toThrow('default opener');
  });
});
