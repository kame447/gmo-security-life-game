/** In-game web DTOs. Pages are game data on reserved hostnames; nothing is fetched from the network. */
export interface WebLink {
  /** Text shown on the page. It may differ from where the link really goes. */
  label: string;
  /** Real destination. Opens the in-game page with this address, or a "not found" page. */
  href: string;
}
export interface WebPage {
  /** Shown in the address bar. Restricted to reserved hostnames (.example/.test/.invalid). */
  address: string;
  title: string;
  /** One line under the title in search results. */
  summary: string;
  /** Extra words a search should find this page by. Not shown. */
  keywords: string[];
  paragraphs: string[];
  links: WebLink[];
}
export interface WebContent { pages: WebPage[] }

/** What the web app shows. A page that is not in the game data still has its address, so the player can see it. */
export type WebView =
  | { kind: 'home' }
  | { kind: 'results'; query: string; results: WebPage[] }
  | { kind: 'page'; address: string; page: WebPage | null };
