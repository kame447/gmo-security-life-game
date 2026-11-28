import { describe, expect, it } from 'vitest';
import { BICYCLE_STOREFRONTS, BICYCLE_WEB_OFFERS, BICYCLE_WEB_PAGES, bicycleStorefront } from '../src/data/bicycle-web';
import { WEB_PROTOTYPE } from '../src/data/web-prototype';
import { WebModel, searchPages } from '../src/phone/web/model';

describe('local storefront navigation and purchase information', () => {
  it('keeps the three existing product addresses and prices, with no purchase route on an information page', () => {
    expect(BICYCLE_WEB_OFFERS.map(offer => offer.priceYen)).toEqual([19800, 24800, 12800]);
    expect(BICYCLE_WEB_OFFERS.map(offer => offer.choiceId)).toEqual(['site-a', 'site-b', 'site-c']);
    for (const offer of BICYCLE_WEB_OFFERS) {
      expect(bicycleStorefront(offer.address)?.section).toBe('product');
      expect(bicycleStorefront(new URL('/company', offer.address).href)?.section).toBe('company');
      expect(bicycleStorefront(new URL('/delivery', offer.address).href)?.section).toBe('delivery');
      expect(bicycleStorefront(new URL('/unlisted', offer.address).href)).toBeNull();
      expect(bicycleStorefront(`${offer.address}?other=1`)).toBeNull();
    }
    expect(bicycleStorefront('https://hayate-cycle.example.attacker.test/bicycle')).toBeNull();
  });

  it('exposes readable seller, payment, delivery and returns information for every candidate', () => {
    expect(BICYCLE_STOREFRONTS).toHaveLength(3);
    expect(new Set(BICYCLE_STOREFRONTS.map(profile => profile.theme)).size).toBe(3);
    for (const profile of BICYCLE_STOREFRONTS) {
      expect(profile.company.map(row => row[0])).toContain('販売事業者');
      expect(profile.company.map(row => row[0])).toContain('所在地');
      expect(profile.company.map(row => row[0])).toContain('お問い合わせ');
      expect(profile.delivery.map(row => row[0])).toContain('お支払い');
      expect(profile.delivery.map(row => row[0])).toContain('返品・交換');
      expect(profile.specs.map(row => row[0])).toContain('目安の身長');
      expect(profile.colors.every(color => /^#[0-9a-f]{6}$/i.test(color.value))).toBe(true);
    }
    expect(BICYCLE_STOREFRONTS[2].company.flat().join(' ')).toContain('個人名義');
    expect(BICYCLE_STOREFRONTS[2].delivery.flat().join(' ')).toContain('返品・返金');
    const productText = BICYCLE_WEB_PAGES.filter(page => page.address.endsWith('/bicycle'))
      .flatMap(page => [page.title, page.summary, ...page.paragraphs]).join(' ');
    expect(productText).not.toMatch(/偽サイト|詐欺サイト|正解|安全なサイト|危険なサイト/);
  });

  it('keeps search focused on the three candidate products and every internal link reachable', () => {
    expect(searchPages(WEB_PROTOTYPE.pages, '自転車').map(page => page.address)).toEqual(BICYCLE_WEB_OFFERS.map(offer => offer.address));
    const pages = new Set(WEB_PROTOTYPE.pages.map(page => page.address));
    for (const page of WEB_PROTOTYPE.pages) for (const item of page.links) {
      expect(pages.has(item.href), `${page.address} -> ${item.href}`).toBe(true);
      expect(new URL(item.href).hostname).toMatch(/\.example$/);
    }
  });

  it('restores the exact product after inspecting seller and delivery pages', () => {
    for (const offer of BICYCLE_WEB_OFFERS) {
      const model = new WebModel(WEB_PROTOTYPE);
      model.open(offer.address);
      model.open(new URL('/company', offer.address).href);
      model.open(new URL('/delivery', offer.address).href);
      expect(model.view).toMatchObject({ kind: 'page', page: { address: new URL('/delivery', offer.address).href } });
      model.back(); model.back();
      expect(model.view).toMatchObject({ kind: 'page', page: { address: offer.address } });
    }
  });

  it('provides a complete route from a mailed event to venue information and back', () => {
    const model = new WebModel(WEB_PROTOTYPE);
    model.open('https://town-library.example/events');
    const event = model.view;
    expect(event.kind === 'page' && event.page?.paragraphs.join('')).toMatch(/参加は無料/);
    model.open('https://town-library.example/visit');
    expect(model.view).toMatchObject({ kind: 'page', page: { title: '開館時間・館内案内' } });
    model.back(); expect(model.view).toEqual(event);
  });
});
