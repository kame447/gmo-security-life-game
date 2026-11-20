import { cleanChatText } from '../chat/codec';
import { cleanMailHref } from '../mail/codec';
import type { WebContent, WebLink, WebPage, WebView } from './types';

/** Input safety limits for this prototype, not search rules. */
export const WEB_LIMITS = Object.freeze({ queryCodePoints: 40, results: 10, history: 20 });

/** NFKC, lower case and katakana to hiragana, so "トショカン", "としょかん" and "ﾄｼｮｶﾝ" match each other. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** Where each query word appears in text, as [start, end) offsets into the original text, merged and sorted. For bolding snippets. */
export function matchRanges(text: string, query: string): [number, number][] {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  // Normalize one character at a time, so each normalized index maps back to an original index.
  let normalized = ''; const origin: number[] = [];
  for (let index = 0; index < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(index)!), next = index + ch.length;
    for (const part of normalizeSearchText(ch)) { normalized += part; for (let k = 0; k < part.length; k++) origin.push(index); }
    index = next;
  }
  origin.push(text.length);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    for (let at = normalized.indexOf(term); at >= 0; at = normalized.indexOf(term, at + term.length)) {
      ranges.push([origin[at], origin[at + term.length]]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]); else merged.push([...range]);
  }
  return merged;
}

/** Every word must appear somewhere in the page. Title hits rank first, then keywords, then the rest; ties keep data order. */
export function searchPages(pages: readonly WebPage[], query: string): WebPage[] {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: { page: WebPage; score: number; index: number }[] = [];
  pages.forEach((page, index) => {
    const title = normalizeSearchText(page.title);
    const keywords = normalizeSearchText(page.keywords.join(' '));
    const rest = normalizeSearchText([page.summary, page.address, ...page.paragraphs].join(' '));
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 3;
      else if (keywords.includes(term)) score += 2;
      else if (rest.includes(term)) score += 1;
      else return;
    }
    scored.push({ page, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, WEB_LIMITS.results).map(item => item.page);
}

function cleanPages(content: WebContent): WebPage[] {
  const pages: WebPage[] = [], seen = new Set<string>();
  for (const page of content.pages) {
    const address = cleanMailHref(page.address);
    const title = cleanChatText(page.title, 60).trim();
    if (!address || !title || seen.has(address)) continue;
    const links: WebLink[] = page.links.flatMap(link => {
      const href = cleanMailHref(link.href), label = cleanChatText(link.label, 40).trim();
      return href && label ? [{ label, href }] : [];
    });
    const site = cleanChatText(page.site ?? '', 30).trim() || new URL(address).hostname;
    pages.push({ address, title, site, summary: cleanChatText(page.summary, 80).trim(), keywords: page.keywords.map(word => cleanChatText(word, 40)),
      paragraphs: page.paragraphs.map(text => cleanChatText(text, 400)), links });
    seen.add(address);
  }
  return pages;
}

/** Search and page history for one visit to the web app. Not saved; no network, clocks or UI. */
export class WebModel {
  private readonly pages: WebPage[];
  private stack: WebView[] = [{ kind: 'home' }];

  constructor(content: WebContent) { this.pages = cleanPages(structuredClone(content)); }
  get view(): WebView { return structuredClone(this.stack[this.stack.length - 1]); }
  get canGoBack(): boolean { return this.stack.length > 1; }

  search(query: string): boolean {
    const clean = cleanChatText(query, WEB_LIMITS.queryCodePoints).trim();
    if (!clean) return false;
    this.push({ kind: 'results', query: clean, results: searchPages(this.pages, clean) });
    return true;
  }

  /** Follows a result or link. An unknown but well-formed address opens a "not found" page; anything else is refused. */
  open(href: string): boolean {
    const address = cleanMailHref(href);
    if (!address) return false;
    this.push({ kind: 'page', address, page: this.pages.find(page => page.address === address) ?? null });
    return true;
  }

  back(): boolean {
    if (!this.canGoBack) return false;
    this.stack.pop();
    return true;
  }

  reset(): void { this.stack = [{ kind: 'home' }]; }

  private push(view: WebView): void {
    this.stack.push(view);
    // Keep home at the bottom so back always ends at the search box.
    if (this.stack.length > WEB_LIMITS.history) this.stack.splice(1, this.stack.length - WEB_LIMITS.history);
  }
}
