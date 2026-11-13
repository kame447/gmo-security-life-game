import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSave, writeSave } from '../src/app/save-store';
import { PHONE_CONTENT, type PhoneContent } from '../src/phone/content';
import { PhoneModel, parsePhoneSave } from '../src/phone/model';
import { Game } from '../src/session/game';
import { parseSave } from '../src/state/save';
import { buildWorld } from '../src/world';

describe('phone foundation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('opens the home screen, navigates an app, returns and closes', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    expect(phone.open()).toBe(true);
    expect(phone.currentApp).toBeNull();
    expect(phone.launch('messages')).toBe(true);
    expect(phone.currentScreen?.id).toBe('inbox');
    expect(phone.navigate('example')).toBe(true);
    expect(phone.currentScreen?.id).toBe('example');
    phone.back();
    expect(phone.currentScreen?.id).toBe('inbox');
    phone.back();
    expect(phone.currentApp).toBeNull();
    phone.back();
    expect(phone.isOpen).toBe(false);
  });

  it('opens valid notifications and rejects missing apps, screens and unlinked navigation', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    expect(phone.launch('web')).toBe(false);
    phone.open();
    expect(phone.launch('missing')).toBe(false);
    expect(phone.openNotification('missing')).toBe(false);
    expect(phone.openNotification('sample')).toBe(true);
    expect(phone.currentScreen?.id).toBe('example');
    expect(phone.navigate('inbox')).toBe(false);
    phone.back();
    expect(phone.currentScreen?.id).toBe('inbox');
    expect(phone.navigate('missing')).toBe(false);
    expect(phone.launch('web')).toBe(true);
    expect(phone.navigate('example')).toBe(true);
  });

  it('accepts an additional app without changing the model and ignores broken references', () => {
    const content: PhoneContent = {
      apps: [...PHONE_CONTENT.apps,
        { id: 'new', label: 'New', icon: 'N', startScreenId: 'start', screens: [
          { id: 'start', title: 'Start', paragraphs: [], links: [{ label: 'bad', screenId: 'missing' }] },
        ] },
        { id: 'broken', label: 'Broken', icon: 'B', startScreenId: 'missing', screens: [] }],
      notifications: [{ id: 'bad', text: 'bad', appId: 'new', screenId: 'missing' }],
    };
    const phone = new PhoneModel(content, { initialOwned: true });
    phone.open();
    expect(phone.launch('broken')).toBe(false);
    expect(phone.openNotification('bad')).toBe(false);
    expect(phone.launch('new')).toBe(true);
    expect(phone.navigate('missing')).toBe(false);
    expect(phone.currentScreen?.id).toBe('start');
  });

  it('allows progression to grant or revoke ownership, including while open', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: false });
    expect(phone.open()).toBe(false);
    phone.setOwned(true);
    expect(phone.open()).toBe(true);
    phone.launch('messages');
    phone.setOwned(false);
    expect(phone.isOpen).toBe(false);
    expect(phone.currentScreen).toBeNull();
    expect(phone.open()).toBe(false);
    phone.setOwned(true);
    expect(phone.open()).toBe(true);
    expect(phone.currentApp).toBeNull();
  });

  it('restores only ownership, repairs invalid and old data using the configurable default', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    phone.setOwned(false);
    const saved = JSON.parse(JSON.stringify(phone.save()));
    const restored = new PhoneModel(PHONE_CONTENT, { initialOwned: true, saved });
    expect(restored.isOwned).toBe(false);
    expect(restored.isOpen).toBe(false);
    for (const raw of [undefined, null, {}, [], { v: 2, owned: false }, { v: 1, owned: 'false' }]) {
      expect(parsePhoneSave(raw, true)).toEqual({ v: 1, owned: true });
      expect(parsePhoneSave(raw, false)).toEqual({ v: 1, owned: false });
    }
    const openPhone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    openPhone.open(); openPhone.launch('web'); openPhone.navigate('example');
    const afterReload = new PhoneModel(PHONE_CONTENT, { initialOwned: false, saved: openPhone.save() });
    expect(afterReload.isOwned).toBe(true);
    expect(afterReload.isOpen).toBe(false);
    expect(afterReload.currentApp).toBeNull();
  });

  it('restores phone ownership with map and appearance; old or damaged phone data does not discard them', () => {
    const world = buildWorld();
    const game = new Game(world);
    game.phone.setOwned(false);
    const save = JSON.parse(JSON.stringify(game.serialize()));
    const restored = new Game(world, { save });
    expect(restored.player).toEqual(game.player);
    expect(restored.appearance).toEqual(game.appearance);
    expect(restored.phone.isOwned).toBe(false);
    for (const phone of [undefined, null, { v: 1, owned: 'no' }, { v: 2, owned: false }]) {
      const loaded = new Game(world, { save: { ...save, phone } });
      expect(loaded.player).toEqual(game.player);
      expect(loaded.appearance).toEqual(game.appearance);
      expect(loaded.phone.isOwned).toBe(true);
      expect(parseSave({ ...save, phone }, world)).not.toBeNull();
    }
    const oldSave = { ...save }; delete oldSave.phone;
    expect(new Game(world, { save: oldSave, initialPhoneOwned: false }).phone.isOwned).toBe(false);
  });

  it('uses the configured default through storage loading and tolerates unavailable storage', () => {
    const world = buildWorld();
    const oldSave = { ...new Game(world).serialize(), phone: undefined };
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(oldSave) });
    const loaded = loadSave(world, false);
    expect(new Game(world, { save: loaded, initialPhoneOwned: false }).phone.isOwned).toBe(false);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(loadSave(world)).toBeUndefined();
    expect(() => writeSave(new Game(world).serialize())).not.toThrow();
  });
});
