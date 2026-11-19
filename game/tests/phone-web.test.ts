import { describe, expect, it } from 'vitest';
import { WEB_PROTOTYPE } from '../src/data/web-prototype';
import { PHONE_BUDGET_PROTOTYPE } from '../src/phone/budget-config';
import { PHONE_CONTENT } from '../src/phone/content';
import { PhoneModel } from '../src/phone/model';
import { normalizeSearchText, searchPages, WEB_LIMITS, WebModel } from '../src/phone/web/model';
import type { WebPage } from '../src/phone/web/types';

const page = (address: string, title: string, extra: Partial<WebPage> = {}): WebPage =>
  ({ address, title, summary: '', keywords: [], paragraphs: [], links: [], ...extra });

describe('in-game web search', () => {
  it('matches across hiragana, katakana, full-width and case', () => {
    expect(normalizeSearchText('トショカン')).toBe('としょかん');
    expect(normalizeSearchText('ﾄｼｮｶﾝ ＬＩＢＲＡＲＹ')).toBe('としょかん library');
    const titles = (query: string) => searchPages(WEB_PROTOTYPE.pages, query).map(item => item.title);
    expect(titles('としょかん')).toContain('まちの図書館');
    expect(titles('トショカン')).toEqual(titles('としょかん'));
    expect(titles('Library')).toContain('まちの図書館');
  });

  it('requires every word, ranks title hits first and keeps data order on ties', () => {
    const pages = [
      page('https://a.example/', 'あめの日', { paragraphs: ['かさ'] }),
      page('https://b.example/', 'てんき', { keywords: ['あめ'] }),
      page('https://c.example/', 'あめとかさ'),
      page('https://d.example/', 'ほか', { paragraphs: ['あめ'] }),
    ];
    expect(searchPages(pages, 'あめ').map(item => item.address))
      .toEqual(['https://a.example/', 'https://c.example/', 'https://b.example/', 'https://d.example/']);
    expect(searchPages(pages, 'あめ かさ').map(item => item.address)).toEqual(['https://c.example/', 'https://a.example/']);
    expect(searchPages(pages, '   ')).toEqual([]);
    expect(searchPages(pages, 'ない')).toEqual([]);
  });

  it('caps the number of results', () => {
    const many = Array.from({ length: 30 }, (_, i) => page(`https://p${i}.example/`, `ページ${i}`));
    expect(searchPages(many, 'ページ')).toHaveLength(WEB_LIMITS.results);
  });

  it('only keeps pages and links on reserved fictitious names', () => {
    const model = new WebModel({ pages: [
      page('https://www.google.com/', '本物'),
      page('https://ok.example/', 'よい', { links: [{ label: '本物へ', href: 'https://real.com/' }, { label: '架空へ', href: 'https://ok.example/next' }] }),
    ] });
    expect(model.search('本物')).toBe(true);
    expect(model.view).toMatchObject({ kind: 'results', results: [] });
    expect(model.open('https://ok.example/')).toBe(true);
    expect(model.view).toMatchObject({ kind: 'page', page: { links: [{ label: '架空へ' }] } });
    expect(model.open('javascript:alert(1)')).toBe(false);
    expect(model.open('https://www.google.com/')).toBe(false);
  });

  it('walks home, results, page and a missing page, and back again to the search box', () => {
    const model = new WebModel(WEB_PROTOTYPE);
    expect(model.view).toEqual({ kind: 'home' });
    expect(model.search('  ')).toBe(false);
    expect(model.search('しょうてんがい')).toBe(true);
    const results = model.view;
    expect(results).toMatchObject({ kind: 'results', query: 'しょうてんがい' });
    expect(model.open('https://ekimae-street.example/')).toBe(true);
    expect(model.open('https://ekimae-street.example/map')).toBe(true);
    expect(model.view).toEqual({ kind: 'page', address: 'https://ekimae-street.example/map', page: null });
    expect(model.back()).toBe(true); expect(model.view).toMatchObject({ kind: 'page', page: { title: 'えきまえ商店街' } });
    expect(model.back()).toBe(true); expect(model.view).toEqual(results);
    expect(model.back()).toBe(true); expect(model.view).toEqual({ kind: 'home' });
    expect(model.back()).toBe(false);
  });

  it('keeps every provisional link on a reserved name, and all but the review "not found" link reachable', () => {
    const addresses = new Set(WEB_PROTOTYPE.pages.map(item => item.address));
    const links = WEB_PROTOTYPE.pages.flatMap(item => item.links.map(link => link.href));
    for (const href of [...addresses, ...links]) expect(new URL(href).hostname).toMatch(/\.example$/);
    expect(links.filter(href => !addresses.has(href))).toEqual(['https://ekimae-street.example/map']);
  });
});

describe('web in the phone', () => {
  it('searches and opens pages only inside the open web app, and resets when the app is left', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    expect(phone.webSearch('としょかん')).toBe(false);
    phone.open(); phone.launch('messages');
    expect(phone.webSearch('としょかん')).toBe(false);
    phone.home(); phone.launch('web');
    expect(phone.webSearch('としょかん')).toBe(true);
    expect(phone.webOpen('https://town-library.example/')).toBe(true);
    expect(phone.webView).toMatchObject({ kind: 'page', page: { title: 'まちの図書館' } });
    phone.back(); expect(phone.webView.kind).toBe('results');
    phone.back(); expect(phone.webView.kind).toBe('home');
    expect(phone.currentApp?.id).toBe('web');
    phone.webSearch('てんき'); phone.home(); phone.launch('web');
    expect(phone.webView).toEqual({ kind: 'home' });
    phone.back(); expect(phone.currentApp).toBeNull();
  });

  it('refuses search and links without data, like opening the web app', () => {
    let now = 0;
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true, clock: () => now, epochClock: () => 1,
      environment: { areaId: 'town-main', areaKind: 'outdoor', paused: false, visible: true },
      budgetConfig: { ...PHONE_BUDGET_PROTOTYPE, capacityMb: 10, consumptionMbPerSecond: 1, largeGapUsage: 'consume', exhaustion: 'block-network' } });
    phone.open(); phone.launch('web');
    expect(phone.webSearch('としょかん')).toBe(true);
    now = 60_000; phone.tick();
    expect(phone.networkAllowed).toBe(false);
    expect(phone.webSearch('てんき')).toBe(false);
    expect(phone.webOpen('https://town-library.example/')).toBe(false);
    expect(phone.webView).toMatchObject({ kind: 'results', query: 'としょかん' });
  });
});
