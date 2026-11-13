import { describe, expect, it } from 'vitest';
import { PHONE_CONTENT, type PhoneContent } from '../src/phone/content';
import { PHONE_BUDGET_PROTOTYPE } from '../src/phone/budget-config';
import { PhoneModel, parsePhoneSave } from '../src/phone/model';

describe('smartphone state', () => {
  it('starts with configurable ownership and revocation closes an open phone', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: false });
    expect(phone.open()).toBe(false);
    phone.setOwned(true);
    expect(phone.open()).toBe(true);
    expect(phone.launch('messages')).toBe(true);
    phone.setOwned(false);
    expect(phone.isOpen).toBe(false);
    expect(phone.currentApp).toBeNull();
    expect(phone.open()).toBe(false);
    phone.setOwned(true); phone.open();
    expect(phone.currentApp).toBeNull();
  });

  it('navigates apps, messages and notifications using internal IDs only', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    expect(phone.launch('web')).toBe(false);
    phone.open();
    expect(phone.launch('messages')).toBe(true);
    expect(phone.currentScreen?.id).toBe('inbox');
    expect(phone.navigate('example')).toBe(true);
    expect(phone.currentScreen?.id).toBe('example');
    phone.back(); expect(phone.currentScreen?.id).toBe('inbox');
    phone.home(); expect(phone.currentApp).toBeNull();
    expect(phone.openNotification('sample')).toBe(true);
    expect(phone.currentScreen?.id).toBe('example');
    phone.back(); expect(phone.currentScreen?.id).toBe('inbox');
    phone.home();
    expect(phone.launch('web')).toBe(true);
    expect(phone.navigate('example')).toBe(true);
    expect(phone.navigate('missing')).toBe(false);
    phone.close(); expect(phone.isOpen).toBe(false);
  });

  it('repairs missing or damaged saves independently and never restores an open screen', () => {
    for (const raw of [undefined, null, {}, [], { v: 2, owned: false }, { v: 1, owned: 'false' }]) {
      expect(parsePhoneSave(raw, true)).toEqual({ v: 1, owned: true, dataBudget: { v: 1,
        remainingMb: PHONE_BUDGET_PROTOTYPE.capacityMb, capacityMb: PHONE_BUDGET_PROTOTYPE.capacityMb } });
      expect(parsePhoneSave(raw, false)).toEqual({ v: 1, owned: false, dataBudget: { v: 1,
        remainingMb: PHONE_BUDGET_PROTOTYPE.capacityMb, capacityMb: PHONE_BUDGET_PROTOTYPE.capacityMb } });
    }
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    phone.open(); phone.launch('web'); phone.navigate('example');
    const restored = new PhoneModel(PHONE_CONTENT, { initialOwned: false, saved: phone.save() });
    expect(restored.isOwned).toBe(true);
    expect(restored.isOpen).toBe(false);
    expect(restored.currentApp).toBeNull();
    phone.setOwned(false);
    expect(new PhoneModel(PHONE_CONTENT, { initialOwned: true, saved: phone.save() }).isOwned).toBe(false);
  });

  it('updates display data and notifications without exposing mutable state', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    const callerData = structuredClone(PHONE_CONTENT) as PhoneContent;
    let updates = 0; phone.onChange(() => updates++);
    phone.open(); phone.launch('messages');
    const withNoNotices = { ...callerData, notifications: [] };
    phone.setContent(withNoNotices);
    expect(phone.currentScreen?.id).toBe('inbox');
    expect(phone.notifications).toEqual([]);
    expect(updates).toBe(3);
    const exposed = phone.content as unknown as { apps: { label: string }[] };
    exposed.apps[0].label = 'changed outside';
    expect(phone.content.apps[0].label).not.toBe('changed outside');
    phone.setContent({ ...callerData, apps: callerData.apps.filter(app => app.id !== 'messages') });
    expect(phone.isOpen).toBe(true);
    expect(phone.currentApp).toBeNull();
  });

  it('rejects unknown or broken navigation without changing the current screen', () => {
    const content: PhoneContent = {
      apps: [...PHONE_CONTENT.apps, { id: 'broken', label: 'broken', icon: 'life', tone: 'peach', caption: '', startScreenId: 'missing', screens: [] }],
      notifications: [{ id: 'bad', title: 'bad', text: '', appId: 'web', screenId: 'missing' }],
    };
    const phone = new PhoneModel(content, { initialOwned: true });
    phone.open(); phone.launch('messages');
    expect(phone.launch('broken')).toBe(false);
    expect(phone.openNotification('bad')).toBe(false);
    expect(phone.navigate('missing')).toBe(false);
    expect(phone.currentApp?.id).toBe('messages');
    expect(phone.currentScreen?.id).toBe('inbox');
  });
});
