import type { PhoneApp, PhoneContent, PhoneNotification, PhoneScreen } from './content';

/** Only ownership is durable. Open panels, routes and sample notifications are transient. */
export interface PhoneSave { v: 1; owned: boolean }
export function parsePhoneSave(raw: unknown, initialOwned: boolean): PhoneSave {
  if (raw && typeof raw === 'object') {
    const value = raw as Partial<PhoneSave>;
    if (value.v === 1 && typeof value.owned === 'boolean') return { v: 1, owned: value.owned };
  }
  return { v: 1, owned: initialOwned };
}

export class PhoneModel {
  private owned: boolean;
  private opened = false;
  private app: PhoneApp | null = null;
  private history: string[] = [];
  private readonly listeners = new Set<() => void>();
  private data: PhoneContent;

  constructor(content: PhoneContent, opts: { initialOwned: boolean; saved?: unknown }) {
    this.data = structuredClone(content);
    this.owned = parsePhoneSave(opts.saved, opts.initialOwned).owned;
  }
  get content(): PhoneContent { return structuredClone(this.data); }
  get isOwned(): boolean { return this.owned; }
  get isOpen(): boolean { return this.opened; }
  get currentApp(): PhoneApp | null { return this.app && structuredClone(this.app); }
  get currentScreen(): PhoneScreen | null {
    const screen = this.app?.screens.find(item => item.id === this.history.at(-1));
    return screen ? structuredClone(screen) : null;
  }
  get notifications(): readonly PhoneNotification[] { return structuredClone(this.data.notifications); }
  save(): PhoneSave { return { v: 1, owned: this.owned }; }
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private changed(): void { for (const listener of this.listeners) listener(); }

  /** Future events can replace local display data without changing navigation or ownership. */
  setContent(content: PhoneContent): void {
    const activeId = this.app?.id;
    this.data = structuredClone(content);
    if (activeId) {
      const next = this.data.apps.find(item => item.id === activeId);
      if (!next || !this.history.every(id => next.screens.some(screen => screen.id === id))) {
        this.app = null; this.history = [];
      } else this.app = next;
    }
    this.changed();
  }

  /** Future progression can award or revoke ownership without changing the UI. */
  setOwned(owned: boolean): void {
    if (typeof owned !== 'boolean' || this.owned === owned) return;
    this.owned = owned;
    if (!owned) { this.opened = false; this.app = null; this.history = []; }
    this.changed();
  }
  open(): boolean {
    if (!this.owned || this.opened) return false;
    this.opened = true;
    this.app = null;
    this.history = [];
    this.changed();
    return true;
  }
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.app = null;
    this.history = [];
    this.changed();
  }
  home(): void {
    if (!this.opened || !this.app) return;
    this.app = null; this.history = []; this.changed();
  }
  launch(appId: string): boolean {
    const app = this.data.apps.find(item => item.id === appId);
    if (!this.opened || !app || !app.screens.some(screen => screen.id === app.startScreenId)) return false;
    this.app = app;
    this.history = [app.startScreenId];
    this.changed();
    return true;
  }
  navigate(screenId: string): boolean {
    const current = this.currentScreen;
    if (!this.opened || !this.app || !current?.links.some(link => link.screenId === screenId) ||
        !this.app.screens.some(screen => screen.id === screenId)) return false;
    this.history.push(screenId);
    this.changed();
    return true;
  }
  openNotification(id: string): boolean {
    const notice = this.notifications.find(item => item.id === id);
    const app = this.data.apps.find(item => item.id === notice?.appId);
    if (!this.opened || !notice || !app || !app.screens.some(screen => screen.id === app.startScreenId) ||
        !app.screens.some(screen => screen.id === notice.screenId)) return false;
    this.app = app;
    this.history = notice.screenId === app.startScreenId ? [app.startScreenId] : [app.startScreenId, notice.screenId];
    this.changed();
    return true;
  }
  back(): void {
    if (!this.opened) return;
    if (!this.app) { this.close(); return; }
    if (this.history.length > 1) this.history.pop();
    else { this.app = null; this.history = []; }
    this.changed();
  }
}
