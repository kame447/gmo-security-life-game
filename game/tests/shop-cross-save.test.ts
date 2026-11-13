import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSave, writeSave } from '../src/app/save-store';
import { prepareShopReview } from '../src/app/shop-review';
import { ClerkFlow } from '../src/shop/clerk-flow';
import { SHOP_CATALOGS } from '../src/data/shop-catalogs';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const phone = { v: 1, owned: false, dataBudget: { v: 1, remainingMb: 123, capacityMb: 5000 } };
afterEach(() => vi.unstubAllGlobals());

/** A self-contained future NPC thread: the shop never needs its phone UI or content catalogue. */
function chatFixture() {
  return { v: 1 as const, contacts: [{ id: 'save-contact', name: '保存回帰用の相手', icon: 'person' }], threads: [{
    id: 'save-thread', contactId: 'save-contact', nextSequence: 3, replyCursor: 1,
    messages: [
      { id: 'incoming-1', from: 'save-contact', text: '<img src=x onerror=alert(1)>', atMs: 1000, read: false },
      { id: 'local-1', from: 'self', text: '買い物のあとも残す', atMs: 1100, read: true },
    ],
    pending: [{ id: 'local-2', from: 'save-contact', text: '返信待ち', remainingMs: 250 }],
  }] };
}

function storedSession(damagedPosition = false, chat?: ReturnType<typeof chatFixture>) {
  const world = buildWorld(), initial = new Game(world);
  prepareShopReview(initial);
  initial.setAppearance({ ...initial.appearance, hairColor: 'black', outfitColor: 'red' });
  const valid = initial.serialize();
  const savedPhone = { ...phone, ...(chat ? { chat } : {}) };
  let stored = JSON.stringify({ ...valid, ...(damagedPosition ? { x: -100 } : {}), phone: savedPhone });
  vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
  const read = () => new Game(world, { save: loadSave(world) });
  return { world, valid, phone: savedPhone, read, stored: () => JSON.parse(stored) };
}

describe('normal shop saves preserve the shared phone field', () => {
  it('keeps ownership, data budget, appearance and position through purchase and reload', () => {
    const fixture = storedSession(), game = fixture.read(), position = { ...game.player };
    const flow = new ClerkFlow(SHOP_CATALOGS[0], { speaker: 'テスト用', lines: [] }, game.assets);
    flow.chooseBuy(); flow.reviewPurchase(); flow.setBuyQuantity(2);
    expect(flow.confirmPurchase()?.ok).toBe(true);
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(phone);
    expect(fixture.stored().assets).toEqual(game.assets.snapshot());
    const restored = fixture.read();
    expect(restored.player).toEqual(position);
    expect(restored.appearance).toEqual(fixture.valid.appearance);
    expect(restored.assets.moneyYen).toBe(2240);
    expect(restored.assets.quantity('bottled-water')).toBe(5);
    writeSave(restored.serialize());
    expect(fixture.stored().phone).toEqual(phone);
  });

  it('keeps every shared field when cancellation is followed by ordinary saving', () => {
    const fixture = storedSession(), game = fixture.read(), before = game.assets.snapshot();
    const flow = new ClerkFlow(SHOP_CATALOGS[0], { speaker: 'テスト用', lines: [] }, game.assets);
    flow.chooseBuy(); flow.reviewPurchase(); flow.back(); flow.close();
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(phone);
    expect(fixture.stored().assets).toEqual(before);
    expect(fixture.stored().appearance).toEqual(fixture.valid.appearance);
  });

  it('repairs a damaged position while preserving valid assets, appearance and phone', () => {
    const fixture = storedSession(true), game = fixture.read();
    expect(game.player).toEqual(new Game(fixture.world).player);
    expect(game.assets.snapshot()).toEqual(fixture.valid.assets);
    expect(game.appearance).toEqual(fixture.valid.appearance);
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(phone);
  });
});

describe('shop transactions preserve conversation threads through the real storage path', () => {
  it('keeps messages, unread flags, pending delays and reply progress after purchase and repeated reload/save', () => {
    const chat = chatFixture(), fixture = storedSession(false, chat), game = fixture.read();
    const before = { ...game.player };
    const flow = new ClerkFlow(SHOP_CATALOGS[0], { speaker: 'テスト用', lines: [] }, game.assets);
    flow.chooseBuy(); flow.reviewPurchase(); flow.setBuyQuantity(2);
    expect(flow.confirmPurchase()).toMatchObject({ ok: true, paidYen: 240, boughtQuantity: 2 });
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(fixture.phone);
    expect(fixture.stored().phone.chat).toEqual(chat);
    expect(fixture.stored().assets).toEqual(game.assets.snapshot());
    expect(game.assets.moneyYen).toBe(2240);
    expect(game.assets.quantity('bottled-water')).toBe(5);
    const restored = fixture.read();
    expect(restored.player).toEqual(before);
    expect(restored.appearance).toEqual(fixture.valid.appearance);
    writeSave(restored.serialize());
    expect(fixture.stored().phone).toEqual(fixture.phone);
    expect(fixture.stored().assets).toEqual(game.assets.snapshot());
  });

  it('keeps chat after cancellation and ordinary saving, detached from mutations to exported DTOs', () => {
    const chat = chatFixture(), fixture = storedSession(false, chat), game = fixture.read();
    const before = game.assets.snapshot();
    const flow = new ClerkFlow(SHOP_CATALOGS[0], { speaker: 'テスト用', lines: [] }, game.assets);
    flow.chooseBuy(); flow.reviewPurchase(); flow.back(); flow.close();
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(fixture.phone);
    const exported = game.serialize();
    exported.phone!.chat!.contacts[0].name = 'exported copy';
    exported.phone!.chat!.threads[0].messages.length = 0;
    exported.phone!.chat!.threads[0].pending[0].remainingMs = 0;
    writeSave(game.serialize());
    expect(fixture.stored().phone.chat).toEqual(chat);
    expect(fixture.stored().assets).toEqual(before);
    expect(fixture.read().player).toEqual(game.player);
  });

  it.each(['insufficient-funds', 'quantity-limit'] as const)('preserves chat and atomic assets when purchase fails: %s', reason => {
    const fixture = storedSession(false, chatFixture()), game = fixture.read();
    if (reason === 'insufficient-funds') expect(game.assets.changeMoney(-game.assets.moneyYen)).toEqual({ ok: true });
    else expect(game.assets.addItem('bottled-water', 20 - game.assets.quantity('bottled-water'))).toEqual({ ok: true });
    const before = game.assets.snapshot();
    const flow = new ClerkFlow(SHOP_CATALOGS[0], { speaker: 'テスト用', lines: [] }, game.assets);
    flow.chooseBuy(); flow.reviewPurchase();
    expect(flow.confirmPurchase()).toEqual({ ok: false, reason });
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(fixture.phone);
    expect(fixture.stored().assets).toEqual(before);
    expect(fixture.read().assets.snapshot()).toEqual(before);
  });

  it('repairs only a damaged position while retaining chat, ownership, budget, assets and appearance', () => {
    const fixture = storedSession(true, chatFixture()), game = fixture.read();
    expect(game.player).toEqual(new Game(fixture.world).player);
    expect(game.assets.snapshot()).toEqual(fixture.valid.assets);
    expect(game.appearance).toEqual(fixture.valid.appearance);
    writeSave(game.serialize());
    expect(fixture.stored().phone).toEqual(fixture.phone);
    expect(fixture.read().serialize()).toEqual(game.serialize());
  });
});
