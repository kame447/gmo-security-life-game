import { describe, expect, it } from 'vitest';
import { feetAtTile } from '../src/core/coords';
import { PHONE_BUDGET_PROTOTYPE, type PhoneBudgetConfig } from '../src/phone/budget-config';
import { PHONE_CONTENT } from '../src/phone/content';
import { PhoneModel, parsePhoneSave } from '../src/phone/model';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const config: PhoneBudgetConfig = { ...PHONE_BUDGET_PROTOTYPE, capacityMb: 10, consumptionMbPerSecond: 1, largeGapUsage: 'consume' };
const outdoors = { areaId: 'town-main', areaKind: 'outdoor' as const, paused: false, visible: true };

describe('phone data integration', () => {
  it('settles open, close, ownership, location and visibility at their boundaries', () => {
    let now = 0;
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true, environment: outdoors, clock: () => now, budgetConfig: config });
    now = 1000; phone.tick(); expect(phone.remainingDataMb).toBe(10);
    phone.open(); now = 6000; phone.tick(); expect(phone.remainingDataMb).toBe(5);
    now = 7500; phone.tick({ areaId: 'home-family-interior', areaKind: 'indoor', facilityId: 'home-family' });
    expect(phone.remainingDataMb).toBe(3.5);
    now = 17500; phone.tick(); expect(phone.remainingDataMb).toBe(3.5);
    phone.tick({ areaId: 'school-classroom-interior', areaKind: 'indoor', facilityId: 'school' });
    now = 18500; phone.setVisible(false); expect(phone.remainingDataMb).toBe(2.5);
    now = 28500; phone.setVisible(true); expect(phone.remainingDataMb).toBe(2.5);
    now = 29000; phone.setPaused(true); expect(phone.remainingDataMb).toBe(2);
    now = 39000; phone.setPaused(false); expect(phone.remainingDataMb).toBe(2);
    now = 40000; phone.setOwned(false); expect(phone.remainingDataMb).toBe(1);
    now = 50000; phone.tick(); expect(phone.remainingDataMb).toBe(1);
    expect(phone.isOpen).toBe(false); expect(phone.open()).toBe(false);
  });

  it('saves and reloads the data balance and ownership without restoring an open screen', () => {
    let now = 0, epoch = 100000;
    const world = buildWorld();
    const game = new Game(world, { phoneClock: () => now, phoneEpochClock: () => epoch, phoneDataConfig: config });
    game.phone.open(); now = 2500; epoch += 2500;
    const save = JSON.parse(JSON.stringify(game.serialize()));
    expect(save.phone.dataBudget.remainingMb).toBe(7.5);
    const restored = new Game(world, { save, phoneClock: () => now, phoneEpochClock: () => epoch, phoneDataConfig: config });
    expect(restored.player).toEqual(game.player); expect(restored.appearance).toEqual(game.appearance);
    expect(restored.phone.isOpen).toBe(false); expect(restored.phone.isOwned).toBe(true);
    now = 12000; epoch += 9500; restored.updatePhoneLocation(); expect(restored.phone.remainingDataMb).toBe(7.5);
    restored.phone.open(); now = 13000; restored.updatePhoneLocation(); expect(restored.phone.remainingDataMb).toBe(6.5);
    restored.phone.setOwned(false);
    const withoutPhone = new Game(world, { save: restored.serialize(), phoneClock: () => now, phoneEpochClock: () => epoch, phoneDataConfig: config });
    expect(withoutPhone.phone.isOwned).toBe(false); expect(withoutPhone.phone.remainingDataMb).toBe(6.5);
  });

  it('uses the real home area but treats another indoor facility as outside', () => {
    let now = 0;
    const world = buildWorld(), game = new Game(world, { phoneClock: () => now, phoneDataConfig: config });
    const town = world.areas.get('town-main')!;
    const home = town.def.portals.find(portal => portal.facilityId === 'home-family')!.to;
    const school = town.def.portals.find(portal => portal.facilityId === 'school')!.to;
    game.phone.open(); now = 1000;
    game.player = { areaId: home.areaId, ...feetAtTile(home.x, home.y), facing: home.facing };
    expect(game.phone.remainingDataMb).toBe(9);
    now = 6000; game.updatePhoneLocation(); expect(game.phone.remainingDataMb).toBe(9);
    game.player = { areaId: school.areaId, ...feetAtTile(school.x, school.y), facing: school.facing };
    now = 7000; game.updatePhoneLocation(); expect(game.phone.remainingDataMb).toBe(8);
  });

  it('repairs the nested budget independently and clamps an exhausted balance', () => {
    for (const dataBudget of [undefined, null, {}, { v: 1, remainingMb: -1 }, { v: 1, remainingMb: '5' }]) {
      expect(parsePhoneSave({ v: 1, owned: false, dataBudget }, true, config))
        .toEqual({ v: 1, owned: false, dataBudget: { v: 1, remainingMb: 10, capacityMb: 10 } });
    }
    let now = 0;
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true, environment: outdoors, clock: () => now,
      epochClock: () => 100000, budgetConfig: { ...config, exhaustion: 'block-network' } });
    phone.open(); now = 12000; phone.tick();
    expect(phone.remainingDataMb).toBe(0); expect(phone.networkAllowed).toBe(false);
    expect(phone.launch('web')).toBe(false);
    expect(phone.launch('messages')).toBe(true);
    const restored = new PhoneModel(PHONE_CONTENT, { initialOwned: false, saved: phone.save(), clock: () => now, budgetConfig: config });
    expect(restored.remainingDataMb).toBe(0); expect(restored.isOwned).toBe(true);
    expect(restored.networkAllowed).toBe(true); // The default exhaustion policy has no restriction.
  });

  it('delivers replies only in active play and marks messages read only in the open thread', () => {
    let now = 0, epoch = 1_000_000;
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true, environment: outdoors,
      clock: () => now, epochClock: () => epoch, budgetConfig: config });
    // The real app's change listener serializes synchronously and can re-enter the clock boundary.
    phone.onChange(() => { phone.save(); });
    phone.open(); phone.launch('messages');
    expect(phone.chatUnreadCount).toBe(2);
    expect(phone.openChatThread('friend')).toBe(true);
    expect(phone.chatUnreadCount).toBe(1);
    expect(phone.sendChat('<img src=x onerror=alert(1)>')).toMatchObject({ ok: true });
    expect(phone.chatMessages('friend').at(-1)?.text).toBe('<img src=x onerror=alert(1)>');
    now += 300; epoch += 300; phone.tick();
    expect(phone.save().chat?.threads.find(thread => thread.id === 'friend')?.pending[0].remainingMs).toBe(200);
    phone.setVisible(false); now += 10_000; epoch += 10_000; phone.tick();
    expect(phone.chatMessages('friend')).toHaveLength(2);
    phone.setVisible(true); phone.setPaused(true);
    now += 20_000; epoch += 20_000; phone.tick();
    expect(phone.chatMessages('friend')).toHaveLength(2);
    phone.setPaused(false); now += 199; epoch += 199; phone.tick();
    expect(phone.chatMessages('friend')).toHaveLength(2);
    now += 1; epoch += 1; phone.tick();
    expect(phone.chatMessages('friend').at(-1)).toMatchObject({ from: 'review-friend', read: true, atMs: epoch });
    expect(phone.chatUnreadCount).toBe(1);
    expect(phone.sendChat('またね')).toMatchObject({ ok: true });
    phone.back(); now += 500; epoch += 500; phone.tick();
    expect(phone.chatThreads.find(thread => thread.id === 'friend')?.unreadCount).toBe(1);
    expect(phone.openChatThread('friend')).toBe(true);
    expect(phone.chatThreads.find(thread => thread.id === 'friend')?.unreadCount).toBe(0);
    const restored = new PhoneModel(PHONE_CONTENT, { initialOwned: false, saved: phone.save(),
      clock: () => now, epochClock: () => epoch, budgetConfig: config });
    expect(restored.isOpen).toBe(false);
    expect(restored.currentChatThread).toBeNull();
    expect(restored.chatMessages('friend')).toEqual(phone.chatMessages('friend'));
  });

  it('uses the real Game save path for chat while preserving the older fields', () => {
    let now = 0;
    const world = buildWorld(), game = new Game(world, { phoneClock: () => now, phoneEpochClock: () => 1000 });
    const before = game.serialize();
    game.phone.open(); game.phone.launch('messages'); game.phone.openChatThread('friend');
    expect(game.phone.sendChat('保存の確認')).toMatchObject({ ok: true });
    now = 500; game.updatePhoneLocation();
    const saved = JSON.parse(JSON.stringify(game.serialize()));
    expect(saved.assets).toEqual(before.assets);
    expect(saved.appearance).toEqual(before.appearance);
    expect(saved.phone.chat.threads.find((thread: { id: string }) => thread.id === 'friend').messages)
      .toEqual(expect.arrayContaining([expect.objectContaining({ text: '保存の確認' })]));
    const restored = new Game(world, { save: saved, phoneClock: () => now, phoneEpochClock: () => 1500 });
    expect(restored.phone.chatMessages('friend')).toEqual(game.phone.chatMessages('friend'));
    expect(restored.player).toEqual(game.player);
  });

  it('does not send when the configured exhausted-network policy blocks communication', () => {
    let now = 0;
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true, environment: outdoors, clock: () => now,
      budgetConfig: { ...config, exhaustion: 'block-network' } });
    phone.open(); phone.launch('messages'); phone.openChatThread('friend');
    const before = phone.chatMessages('friend');
    now = 11_000; phone.tick();
    expect(phone.networkAllowed).toBe(false);
    expect(phone.sendChat('送れない')).toEqual({ ok: false, reason: 'network-unavailable' });
    expect(phone.chatMessages('friend')).toEqual(before);
  });
});
