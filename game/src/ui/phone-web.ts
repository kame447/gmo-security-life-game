import type { WebPage, WebView } from '../phone/web/types';

export interface WebHandlers {
  search: (query: string) => void;
  open: (href: string) => void;
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The query is kept as typed; only the model trims and limits it. */
function searchForm(query: string, handlers: WebHandlers): HTMLFormElement {
  const form = make('form', 'phone-web-form'); form.setAttribute('role', 'search');
  const input = make('input', 'phone-web-input'); input.type = 'search'; input.autocomplete = 'off';
  input.setAttribute('aria-label', 'さがすことば'); input.placeholder = 'ことばを入れて さがす'; input.value = query;
  input.enterKeyHint = 'search';
  const submit = make('button', 'phone-web-submit', '検索'); submit.type = 'submit';
  const update = () => { submit.disabled = !input.value.trim(); };
  input.addEventListener('input', update);
  form.addEventListener('submit', event => { event.preventDefault(); if (!submit.disabled) handlers.search(input.value); });
  update(); form.append(input, submit);
  return form;
}

function resultRow(page: WebPage, handlers: WebHandlers): HTMLButtonElement {
  const button = make('button', 'phone-web-result'); button.type = 'button'; button.dataset.webResult = page.address;
  button.append(make('span', 'phone-web-result-title', page.title), make('span', 'phone-web-result-address', page.address),
    make('span', 'phone-web-result-summary', page.summary));
  button.addEventListener('click', () => handlers.open(page.address));
  return button;
}

/** All page and query text is assigned as text, including future event-provided pages. */
export function renderWeb(view: WebView, handlers: WebHandlers): HTMLElement {
  const root = make('section', `phone-web phone-web-${view.kind}`); root.dataset.webView = view.kind;
  if (view.kind === 'home') {
    root.append(make('h1', 'phone-web-logo', 'さがす'), searchForm('', handlers));
    return root;
  }
  if (view.kind === 'results') {
    root.append(searchForm(view.query, handlers));
    const status = make('p', 'phone-web-count', view.results.length ? `${view.results.length}件` : '見つかりませんでした');
    status.setAttribute('role', 'status');
    const list = make('div', 'phone-web-results');
    for (const page of view.results) list.append(resultRow(page, handlers));
    list.firstElementChild?.setAttribute('data-focus-first', '');
    root.append(status, list);
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
