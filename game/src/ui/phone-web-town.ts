import type { WebPage } from '../phone/web/types';
import { webElement as el, webFacts as facts, webLink as link } from './phone-web-elements';

function bookArt(): HTMLElement {
  const art = el('div', 'town-library-art'); art.setAttribute('aria-hidden', 'true');
  const sun = el('span', 'town-library-sun'), books = el('div', 'town-library-books');
  for (const [name, label] of [['a', 'STORIES'], ['b', 'HELLO'], ['c', 'BOOKS']]) books.append(el('span', `town-library-book town-library-book-${name}`, label));
  art.append(sun, books, el('span', 'town-library-leaf town-library-leaf-a'), el('span', 'town-library-leaf town-library-leaf-b'));
  return art;
}
function nav(root: HTMLElement, entries: readonly (readonly [string, string])[], address: string, open: (href: string) => void): void {
  const navigation = el('nav', 'town-site-nav'); navigation.setAttribute('aria-label', 'サイト内のページ');
  for (const [label, href] of entries) {
    const item = link(label, href, open, href === address ? 'is-current' : '');
    if (href === address) item.setAttribute('aria-current', 'page');
    navigation.append(item);
  }
  root.append(navigation);
}
function library(page: WebPage, open: (href: string) => void): HTMLElement {
  const root = el('article', 'phone-web-page town-site town-library'); root.dataset.townSite = 'library';
  const header = el('header', 'town-site-header');
  const brand = link('まちの図書館', 'https://town-library.example/', open, 'town-site-brand');
  brand.append(el('small', '', 'TOWN LIBRARY')); header.append(brand, el('span', 'town-library-open', '9:00—17:00'));
  root.append(header);
  nav(root, [['ホーム', 'https://town-library.example/'], ['催しもの', 'https://town-library.example/events'], ['ご利用案内', 'https://town-library.example/visit']], page.address, open);
  const path = new URL(page.address).pathname;
  const hero = el('section', 'town-library-hero');
  hero.append(el('p', 'site-eyebrow', path === '/events' ? 'STORY TIME' : path === '/visit' ? 'VISIT & INFORMATION' : 'A BOOK, A NEW WORLD'),
    el('h1', 'phone-web-title', path === '/events' ? 'おはなし会' : path === '/visit' ? '開館時間・館内案内' : '本を開くと、\n町が少し広くなる。'),
    el('p', 'town-library-tagline', path === '/events' ? page.paragraphs[0] : '一冊との出会いを、暮らしのそばに。'));
  hero.append(bookArt()); root.append(hero);
  const body = el('div', 'town-site-content');
  if (path === '/events') {
    body.append(el('p', 'town-library-category', '子ども・大人 / 読み聞かせ'), el('h2', '', '土曜日の朝、絵本をひらこう。'),
      el('p', '', page.paragraphs[1]), facts([['日時', '毎週土曜日 10:00から'], ['会場', '図書館2階 おはなしの部屋'], ['参加費', '無料'], ['申し込み', '不要。開始時刻に会場へお越しください。'], ['対象', 'どなたでも。親子での参加も歓迎します。']]));
    const notice = el('aside', 'town-library-note');
    notice.append(el('h2', '', '初めての方へ'), el('p', '', '途中からでもご参加いただけます。小さなお子さんの声も、物語を楽しむ時間の一部です。気軽にいらしてください。'));
    body.append(notice);
  } else if (path === '/visit') {
    body.append(el('h2', '', 'ご利用案内'), facts([['開館', '9:00〜17:00'], ['休館日', '毎週月曜日'], ['1階', '貸出カウンター・一般図書・閲覧席'], ['2階', '児童書・おはなしの部屋']]));
    body.append(el('p', '', page.paragraphs[2]));
  } else {
    body.append(el('p', '', page.paragraphs[2]));
    const notice = el('section', 'town-library-note');
    notice.append(el('p', 'site-eyebrow', 'EVENTS'), el('h2', '', '土曜日のおはなし会'), el('p', '', '絵本を囲んで、物語の世界へ。午前10時から、2階のおはなしの部屋で。'),
      link('催しものの詳細を見る →', 'https://town-library.example/events', open));
    body.append(notice, el('h2', '', '開館カレンダー'), facts([['開館時間', '9:00〜17:00'], ['お休み', '毎週月曜日']]));
  }
  for (const item of page.links) body.append(link(`${item.label} →`, item.href, open));
  root.append(body, el('footer', 'town-site-footer', 'まちの図書館 / 本と、人と、町をつなぐ。'));
  return root;
}
function streetArt(): HTMLElement {
  const art = el('div', 'town-street-art'); art.setAttribute('aria-hidden', 'true');
  for (const [name, label] of [['produce', '青果'], ['bread', 'BAKERY'], ['books', 'BOOKS']]) {
    const shop = el('div', `town-street-shop town-street-shop-${name}`);
    shop.append(el('span', 'town-street-sign', label), el('span', 'town-street-awning'), el('span', 'town-street-window'), el('span', 'town-street-door'));
    art.append(shop);
  }
  return art;
}
function street(page: WebPage, open: (href: string) => void): HTMLElement {
  const root = el('article', 'phone-web-page town-site town-street'); root.dataset.townSite = 'street';
  const header = el('header', 'town-site-header');
  const brand = link('えきまえ商店街', 'https://ekimae-street.example/', open, 'town-site-brand'); brand.append(el('small', '', 'EKIMAE STREET')); header.append(brand); root.append(header);
  nav(root, [['商店街', 'https://ekimae-street.example/'], ['今週末', 'https://ekimae-street.example/weekend'], ['お店案内', 'https://ekimae-street.example/map']], page.address, open);
  const path = new URL(page.address).pathname, hero = el('section', 'town-street-hero');
  hero.append(el('p', 'site-eyebrow', path === '/weekend' ? 'WEEKEND LETTER' : 'MEET OUR NEIGHBORS'),
    el('h1', 'phone-web-title', path === '/' ? 'いつもの道に、\n今日の寄り道。' : page.title), streetArt()); root.append(hero);
  const body = el('div', 'town-site-content');
  if (path === '/map') {
    body.append(el('h2', '', '駅南口から、まっすぐ。'), el('p', '', page.paragraphs[0]));
    const shops = el('div', 'town-street-directory');
    for (const [name, desc] of [['八百屋', '季節の青果と、今日のおすすめ。'], ['パン屋', '朝の食卓にも、おやつの時間にも。'], ['本屋', '文庫、雑誌、新しい一冊との出会い。'], ['カフェ', '買い物の合間に、ほっとひと休み。']]) {
      const item = el('section', 'town-street-directory-item'); item.append(el('h3', '', name), el('p', '', desc)); shops.append(item);
    }
    body.append(shops);
  } else {
    body.append(el('h2', '', path === '/weekend' ? '季節の花を、店先に。' : '小さなお店の、大きな楽しみ。'));
    for (const paragraph of page.paragraphs.slice(1)) body.append(el('p', '', paragraph));
    const detail = el('div', 'town-street-news');
    detail.append(el('span', 'site-eyebrow', 'WEEKEND'), el('h2', '', '花のある、週末の通り。'), facts([['開催', '土曜日・日曜日'], ['場所', '商店街の店先'], ['参加', '予約不要・観覧無料']])); body.append(detail);
  }
  for (const item of page.links) body.append(link(`${item.label} →`, item.href, open));
  root.append(body, el('footer', 'town-site-footer', 'えきまえ商店街 / また、いつもの場所で。'));
  return root;
}
function weather(page: WebPage): HTMLElement {
  const root = el('article', 'phone-web-page town-site town-weather'); root.dataset.townSite = 'weather';
  const header = el('header', 'town-site-header'); header.append(el('h1', 'phone-web-title', 'まちのてんき'), el('small', '', 'TOWN WEATHER')); root.append(header);
  const hero = el('section', 'town-weather-today'), art = el('div', 'town-weather-art'); art.setAttribute('aria-hidden', 'true');
  art.append(el('span', 'town-weather-sun'), el('span', 'town-weather-cloud'));
  hero.append(el('p', 'site-eyebrow', 'TODAY / 本町'), art, el('h2', '', '晴れのち曇り'), el('p', '', 'お昼は、外でひと休み。')); root.append(hero);
  const body = el('section', 'town-site-content'); body.append(el('h2', '', '明日のお天気'), el('p', '', page.paragraphs[1]),
    el('div', 'town-weather-tip', '持ち物のヒント：折り畳み傘'), el('p', 'site-small-print', 'ゲームの町の天気案内です。実際の天気予報ではありません。')); root.append(body);
  return root;
}

export function renderTownWebsite(page: WebPage, open: (href: string) => void): HTMLElement | null {
  const host = new URL(page.address).hostname;
  if (host === 'town-library.example') return library(page, open);
  if (host === 'ekimae-street.example') return street(page, open);
  if (host === 'town-weather.example') return weather(page);
  return null;
}
