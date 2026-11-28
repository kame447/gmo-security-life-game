import { matchRanges } from '../phone/web/model';
import type { WebPage, WebView } from '../phone/web/types';

export interface WebHandlers {
  search: (query: string) => void;
  /** Searches and opens the top result straight away. */
  lucky: (query: string) => void;
  open: (href: string) => void;
}

/** In-game search engine name, a nod to "ググる". */
export const SEARCH_ENGINE_NAME = 'Guguru';

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG = 'http://www.w3.org/2000/svg';
function icon(className: string, path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('phone-web-icon', className);
  const line = document.createElementNS(SVG, 'path'); line.setAttribute('d', path); svg.append(line);
  return svg;
}
const SEARCH_ICON = 'M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.44 1.06-1.06-4.44-4.43A6.5 6.5 0 0 0 10.5 4zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z';
const CLEAR_ICON = 'M6.4 5.3 5.3 6.4 10.9 12l-5.6 5.6 1.1 1.1 5.6-5.6 5.6 5.6 1.1-1.1-5.6-5.6 5.6-5.6-1.1-1.1-5.6 5.6z';

/** Each letter gets its own color class, like the real thing's multicolor logo. */
function logo(className: string): HTMLElement {
  const node = make('h1', `phone-web-logo ${className}`); node.setAttribute('aria-label', SEARCH_ENGINE_NAME);
  [...SEARCH_ENGINE_NAME].forEach((letter, index) => {
    const span = make('span', `phone-web-logo-${index % 6}`, letter); span.setAttribute('aria-hidden', 'true'); node.append(span);
  });
  return node;
}

/**
 * The query is kept as typed; only the model trims and limits it.
 * Home has the two buttons under the box; results put a search button inside the box instead.
 */
function searchForm(query: string, handlers: WebHandlers, home: boolean): HTMLFormElement {
  const form = make('form', 'phone-web-form'); form.setAttribute('role', 'search');
  const box = make('div', 'phone-web-box');
  const input = make('input', 'phone-web-input'); input.type = 'search'; input.autocomplete = 'off';
  input.setAttribute('aria-label', `${SEARCH_ENGINE_NAME}で検索`); input.placeholder = home ? '検索ワードを入力' : ''; input.value = query;
  input.enterKeyHint = 'search';
  const clear = make('button', 'phone-web-clear'); clear.type = 'button'; clear.setAttribute('aria-label', '入力を消す');
  clear.append(icon('phone-web-clear-icon', CLEAR_ICON));
  const submit = make('button', 'phone-web-submit', home ? `${SEARCH_ENGINE_NAME} 検索` : undefined); submit.type = 'submit';
  const buttons: HTMLButtonElement[] = [submit];
  if (home) {
    box.append(icon('phone-web-box-icon', SEARCH_ICON), input, clear);
    const lucky = make('button', 'phone-web-lucky', '運だめし'); lucky.type = 'button';
    lucky.addEventListener('click', () => { if (!lucky.disabled) handlers.lucky(input.value); });
    buttons.push(lucky);
    const row = make('div', 'phone-web-buttons'); row.append(submit, lucky);
    form.append(box, row);
  } else {
    submit.setAttribute('aria-label', '検索'); submit.append(icon('phone-web-submit-icon', SEARCH_ICON));
    box.append(input, clear, submit); form.append(box);
  }
  const update = () => {
    const empty = !input.value.trim();
    for (const button of buttons) button.disabled = empty;
    // Disabled, not hidden, so keyboard focus skips it while the box is empty.
    clear.disabled = !input.value;
  };
  input.addEventListener('input', update);
  clear.addEventListener('click', () => { input.value = ''; update(); input.focus(); });
  form.addEventListener('submit', event => { event.preventDefault(); if (!submit.disabled) handlers.search(input.value); });
  update();
  return form;
}

/** "https://host › a › b", the way search results show where a page lives. */
function breadcrumb(address: string): string {
  const url = new URL(address);
  return [`${url.protocol}//${url.host}`, ...url.pathname.split('/').filter(Boolean)].join(' › ');
}

/** A colored circle with the site's first letter stands in for a favicon. */
function favicon(page: WebPage): HTMLElement {
  const host = new URL(page.address).hostname;
  let hash = 0; for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const node = make('span', `phone-web-favicon phone-web-favicon-${hash % 5}`, [...(page.site || host)][0] ?? '');
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** Query words in the snippet are bold, as text nodes only. */
function snippet(text: string, query: string): HTMLElement {
  const node = make('span', 'phone-web-result-summary');
  let at = 0;
  for (const [start, end] of matchRanges(text, query)) {
    if (start > at) node.append(text.slice(at, start));
    node.append(make('b', '', text.slice(start, end)));
    at = end;
  }
  if (at < text.length) node.append(text.slice(at));
  return node;
}

function resultRow(page: WebPage, query: string, handlers: WebHandlers): HTMLButtonElement {
  const button = make('button', 'phone-web-result'); button.type = 'button'; button.dataset.webResult = page.address;
  const source = make('span', 'phone-web-result-source'), names = make('span', 'phone-web-result-names');
  names.append(make('span', 'phone-web-result-site', page.site || new URL(page.address).hostname),
    make('span', 'phone-web-result-address', breadcrumb(page.address)));
  source.append(favicon(page), names);
  button.append(source, make('span', 'phone-web-result-title', page.title), snippet(page.summary, query));
  button.addEventListener('click', () => handlers.open(page.address));
  return button;
}

function noResults(): HTMLElement {
  const box = make('div', 'phone-web-empty');
  const tips = make('ul', 'phone-web-tips');
  for (const tip of ['キーワードに誤字・脱字がないか確かめてください。', '別のキーワードを試してください。', 'もっと短いキーワードを試してください。']) {
    tips.append(make('li', '', tip));
  }
  box.append(make('p', 'phone-web-tips-title', '検索のヒント:'), tips);
  return box;
}

/** All page and query text is assigned as text, including future event-provided pages. */
export function renderWeb(view: WebView, handlers: WebHandlers): HTMLElement {
  const root = make('section', `phone-web phone-web-${view.kind}`); root.dataset.webView = view.kind;
  if (view.kind === 'home') {
    root.append(logo('phone-web-logo-large'), searchForm('', handlers, true));
    return root;
  }
  if (view.kind === 'results') {
    const header = make('header', 'phone-web-header');
    const tabs = make('div', 'phone-web-tabs'); tabs.append(make('span', 'phone-web-tab is-current', 'すべて'));
    header.append(logo('phone-web-logo-small'), searchForm(view.query, handlers, false), tabs);
    const status = make('p', 'phone-web-count',
      view.results.length ? `${view.results.length} 件の結果` : `「${view.query}」に一致する情報は見つかりませんでした。`);
    status.setAttribute('role', 'status');
    const list = make('div', 'phone-web-results');
    for (const page of view.results) list.append(resultRow(page, view.query, handlers));
    list.firstElementChild?.setAttribute('data-focus-first', '');
    root.append(header, status, view.results.length ? list : noResults());
    return root;
  }
  const address = make('p', 'phone-web-address', view.address); address.setAttribute('aria-label', `アドレス ${view.address}`);
  root.append(address);
  const article = make('article', 'phone-web-page');
  if (!view.page) {
    article.append(make('h1', 'phone-web-title', 'ページが見つかりません'), make('p', '', 'このアドレスのページはありません。'));
  } else {
    article.append(make('h1', 'phone-web-title', view.page.title));
    for (const text of view.page.paragraphs) article.append(make('p', '', text));
    for (const link of view.page.links) {
      const button = make('button', 'phone-web-link', link.label); button.type = 'button'; button.dataset.webLink = link.href;
      button.addEventListener('click', () => handlers.open(link.href));
      article.append(button);
    }
    article.querySelector('.phone-web-link')?.setAttribute('data-focus-first', '');
  }
  root.append(article);
  return root;
}
