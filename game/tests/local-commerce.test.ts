import { describe, expect, it, vi } from 'vitest';
import { bicycleCommerce, bicycleReviewState } from '../src/app/bicycle-commerce';
import { BICYCLE_WEB_OFFERS } from '../src/data/bicycle-web';
import { getItemDefinition } from '../src/data/items';
import { SHOP_CATALOGS } from '../src/data/shop-catalogs';
import { STORE_CONTACTS } from '../src/data/stores';
import { LifeEventDirector } from '../src/events/director';
import { PHONE_BUDGET_PROTOTYPE } from '../src/phone/budget-config';
import { PHONE_CONTENT } from '../src/phone/content';
import { PhoneModel } from '../src/phone/model';
import { clerkVisit } from '../src/shop/clerk-visit';
import { purchase } from '../src/shop/purchase';
import { PlayerAssets } from '../src/state/assets';
import { STORY_BIKE } from '../src/story/config';
import { StoryDirector } from '../src/story/director';
import { STORY_EVENTS } from '../src/story/events';
import { parseStorySave } from '../src/story/state';
import { buildWorld } from '../src/world';

function setup(ready = true) {
  const assets = new PlayerAssets({ moneyYen: 40, items: [] });
  const life = new LifeEventDirector(STORY_EVENTS);
  const state = bicycleReviewState();
  if (!ready) delete state.bikeOrderReady;
  const story = StoryDirector.resume(state, life);
  const mail = vi.fn(), candidates = vi.fn();
  story.attach({ useWebShopping: true, deliverBicycleCandidates: candidates, say: () => false, warp: () => true, areaId: () => 'home-family-interior',
    setPhoneOwned: () => {}, changeMoney: amount => assets.changeMoney(amount).ok,
    addItem: id => assets.addItem(id, 1).ok, money: () => assets.moneyYen, itemCount: id => assets.quantity(id),
    notice: () => {}, deliverMail: mail });
  const ordered = vi.fn();
  const commerce = bicycleCommerce(story, ordered);
  const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true, clock: () => 0, epochClock: () => 1 });
  phone.setWebCommerce(commerce);
  return { assets, life, story, commerce, ordered, mail, candidates, phone };
}

describe('all seven stores', () => {
  it('connects every real indoor clerk to valid products, with atomic payment and saved inventory', () => {
    const world = buildWorld();
    expect(new Set(SHOP_CATALOGS.map(c => c.id)).size).toBe(SHOP_CATALOGS.length);
    for (const store of STORE_CONTACTS) {
      const area = world.areas.get(store.interiorAreaId)!;
      const clerk = area.interactions.find(item => item.eventKey === store.clerkEventKey);
      const visit = clerkVisit(area.def, clerk);
      expect(visit?.catalog.id, store.storeId).toBe(store.catalogId);
      expect(visit!.catalog.offers.length).toBeGreaterThan(0);
      for (const offer of visit!.catalog.offers) {
        expect(getItemDefinition(offer.itemId), store.storeId).toBeDefined();
        const assets = new PlayerAssets({ moneyYen: offer.priceYen + 100, items: [] });
        expect(purchase(assets, offer)).toMatchObject({ ok: true, paidYen: offer.priceYen, balanceYen: 100 });
        const restored = new PlayerAssets(JSON.parse(JSON.stringify(assets.snapshot())));
        expect(restored.quantity(offer.itemId)).toBe(1);
        expect(restored.moneyYen).toBe(100);
      }
    }
  });
});

describe('bicycle orders in the phone', () => {
  it('requires reporting back to the mother, and preserves the unlocked order after reload', () => {
    const t = setup(false);
    expect(t.commerce.purchase(BICYCLE_WEB_OFFERS[0].address).ok).toBe(false);
    t.story.onMapEvent({ type: 'interact', areaId: 'home-family-interior', interactionId: 'mother', eventKey: 'home.mother' });
    expect(t.story.canOrderBicycle).toBe(true);
    expect(t.life.pending).toBeNull();
    expect(t.candidates).toHaveBeenCalledTimes(1);
    expect(t.mail).not.toHaveBeenCalled();
    const saved = parseStorySave(JSON.parse(JSON.stringify(t.story.save())))!;
    expect(StoryDirector.resume(saved, t.life).canOrderBicycle).toBe(true);
    expect(t.assets.moneyYen).toBe(40);
  });

  it('rejects the expensive site without changing assets or completing the story', () => {
    const t = setup();
    expect(t.commerce.quote(BICYCLE_WEB_OFFERS[1].address)).toMatchObject({ available: false, priceYen: 24800, budgetYen: 20000 });
    expect(t.commerce.purchase(BICYCLE_WEB_OFFERS[1].address).ok).toBe(false);
    expect(t.story.canOrderBicycle).toBe(true);
    expect(t.assets.moneyYen).toBe(40);
    expect(t.ordered).not.toHaveBeenCalled();
  });

  it('confirms one actual page order, saves the choice, and refuses a duplicate or different page', () => {
    const t = setup(), offer = BICYCLE_WEB_OFFERS[0];
    t.phone.open(); t.phone.launch('web'); t.phone.webOpen(offer.address);
    expect(t.phone.webPurchase(BICYCLE_WEB_OFFERS[2].address).ok).toBe(false);
    expect(t.phone.webPurchase(offer.address).ok).toBe(true);
    expect(t.phone.webPurchase(offer.address).ok).toBe(false);
    expect(t.assets.moneyYen).toBe(40 + STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen);
    expect(t.story.save().choices[STORY_BIKE.eventId]).toBe('site-a');
    expect(t.ordered).toHaveBeenCalledTimes(1);
    expect(t.story.canRide).toBe(false);
    for (let n = 0; n < 10; n++) t.story.tick(0, true);
    expect(t.story.canRide).toBe(true);
  });

  it('records the fake site and still reaches the bicycle arrival and safe follow-up', () => {
    const t = setup();
    expect(t.commerce.purchase(BICYCLE_WEB_OFFERS[2].address).ok).toBe(true);
    expect(t.assets.moneyYen).toBe(40);
    expect(t.story.evaluate().security).toBeDefined();
    expect(t.story.save().choices[STORY_BIKE.eventId]).toBe('site-c');
    for (let n = 0; n < 10; n++) t.story.tick(0, true);
    expect(t.story.canRide).toBe(true);
  });

  it('refuses checkout when network allowance runs out after opening the product', () => {
    let time = 0;
    const t = setup();
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true, clock: () => time, epochClock: () => 1,
      environment: { areaId: 'town-main', areaKind: 'outdoor', paused: false, visible: true },
      budgetConfig: { ...PHONE_BUDGET_PROTOTYPE, capacityMb: 1, consumptionMbPerSecond: 1,
        largeGapUsage: 'consume', exhaustion: 'block-network' } });
    phone.setWebCommerce(t.commerce);
    phone.open(); phone.launch('web'); phone.webOpen(BICYCLE_WEB_OFFERS[0].address);
    time = 2000;
    expect(phone.webPurchase(BICYCLE_WEB_OFFERS[0].address)).toEqual({ ok: false, message: '通信残量がありません。' });
    expect(t.story.canOrderBicycle).toBe(true);
    expect(t.assets.moneyYen).toBe(40);
  });
});

describe('mail links to the in-game web', () => {
  it('opens only a link in the current mail and returns through page history to that same mail', () => {
    const t = setup(), address = BICYCLE_WEB_OFFERS[0].address;
    t.phone.deliverMail({ id: 'web-link', from: '母', subject: '自転車', body: 'お店の情報を確かめてね。', atMs: 1,
      links: [{ label: 'お店を見る', href: address }] });
    t.phone.open(); t.phone.launch('mail'); t.phone.openMail('web-link');
    const saved = t.phone.save();
    expect(t.phone.openMailLink(BICYCLE_WEB_OFFERS[2].address)).toBe(false);
    expect(t.phone.openMailLink(address)).toBe(true);
    expect(t.phone.currentApp?.id).toBe('web');
    t.phone.webOpen('https://hayate-cycle.example/company');
    t.phone.back();
    expect(t.phone.webView).toMatchObject({ kind: 'page', address });
    t.phone.back();
    expect(t.phone.currentMail?.id).toBe('web-link');
    expect(t.phone.save()).toEqual(saved);
    t.phone.back();
    expect(t.phone.currentApp?.id).toBe('mail');
    expect(t.phone.currentMail).toBeNull();
  });

  it('does not carry a previous mail return target into a later fresh web session', () => {
    const t = setup();
    t.phone.deliverMail({ id: 'web-link', from: '母', subject: '店', body: 'リンク', atMs: 1,
      links: [{ label: 'お店', href: BICYCLE_WEB_OFFERS[0].address }] });
    t.phone.open(); t.phone.launch('mail'); t.phone.openMail('web-link'); t.phone.openMailLink(BICYCLE_WEB_OFFERS[0].address);
    t.phone.home(); t.phone.launch('web'); t.phone.webOpen(BICYCLE_WEB_OFFERS[0].address); t.phone.back();
    expect(t.phone.currentApp?.id).toBe('web');
    expect(t.phone.webView.kind).toBe('home');
  });
});
