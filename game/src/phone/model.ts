import type { PhoneApp, PhoneContent, PhoneNotification, PhoneScreen } from './content';
import { PHONE_BUDGET_PROTOTYPE, type PhoneBudgetConfig } from './budget-config';
import { PhoneDataBudget, parsePhoneDataSave, type PhoneDataSave, type PhoneUsageContext } from './budget';

/** Open panels, routes and sample notifications remain transient. */
export interface PhoneSave { v: 1; owned: boolean; dataBudget: PhoneDataSave }
export function parsePhoneSave(raw: unknown, initialOwned: boolean,
  config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE): PhoneSave {
  if (raw && typeof raw === 'object') {
    const value = raw as Partial<PhoneSave>;
    if (value.v === 1 && typeof value.owned === 'boolean') {
      return { v: 1, owned: value.owned, dataBudget: parsePhoneDataSave(value.dataBudget, config) };
    }
  }
  return { v: 1, owned: initialOwned, dataBudget: parsePhoneDataSave(undefined, config) };
}

type PhoneEnvironment = Omit<PhoneUsageContext, 'owned' | 'open'>;
export class PhoneModel {
  private owned: boolean;
  private opened = false;
  private app: PhoneApp | null = null;
  private history: string[] = [];
  private readonly listeners = new Set<() => void>();
  private data: PhoneContent;
  private readonly usage: PhoneDataBudget;
  private readonly clock: () => number;
  private readonly epochClock: () => number;
  private environment: PhoneEnvironment;

  constructor(content: PhoneContent, opts: { initialOwned: boolean; saved?: unknown; environment?: PhoneEnvironment;
    clock?: () => number; epochClock?: () => number; budgetConfig?: Readonly<PhoneBudgetConfig> }) {
    this.data = structuredClone(content);
    const config = opts.budgetConfig ?? PHONE_BUDGET_PROTOTYPE;
    const saved = parsePhoneSave(opts.saved, opts.initialOwned, config);
    this.owned = saved.owned;
    this.environment = opts.environment ?? { areaId: '', areaKind: 'outdoor', paused: false, visible: true };
    this.clock = opts.clock ?? (() => performance.now());
    this.epochClock = opts.epochClock ?? (() => Date.now());
    this.usage = new PhoneDataBudget(config, saved.dataBudget, this.epochClock());
    this.syncUsage();
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
  get remainingDataMb(): number { return this.usage.remainingMb; }
  get dataCapacityMb(): number { return this.usage.capacityMb; }
  get networkAllowed(): boolean { return this.usage.networkAllowed; }
  save(): PhoneSave {
    this.syncUsage();
    const epoch = this.usage.config.offlineUsage === 'consume-if-active' ? this.epochClock() : undefined;
    return { v: 1, owned: this.owned, dataBudget: this.usage.save(epoch) };
  }
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private changed(): void { for (const listener of this.listeners) listener(); }
  private syncUsage(): void {
    this.usage.update(this.clock(), { ...this.environment, owned: this.owned, open: this.opened });
  }
  /** The clock, rather than frame count or capped simulation dt, determines usage. */
  tick(environment: Partial<PhoneEnvironment> = {}): void { this.environment = { ...this.environment, ...environment }; this.syncUsage(); }
  setVisible(visible: boolean): void { this.tick({ visible }); }
  setPaused(paused: boolean): void { this.tick({ paused }); }
  /** A future progression event may call this; no recharge event is chosen here. */
  replenishData(amountMb?: number): void {
    this.usage.replenish(this.clock(), { ...this.environment, owned: this.owned, open: this.opened }, amountMb);
    this.changed();
  }

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
    this.syncUsage();
    this.changed();
  }
  open(): boolean {
    if (!this.owned || this.opened) return false;
    this.opened = true;
    this.syncUsage();
    this.app = null;
    this.history = [];
    this.changed();
    return true;
  }
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.syncUsage();
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
    this.syncUsage();
    if (!this.opened || !app || (app.requiresNetwork && !this.networkAllowed) ||
        !app.screens.some(screen => screen.id === app.startScreenId)) return false;
    this.app = app;
    this.history = [app.startScreenId];
    this.changed();
    return true;
  }
  navigate(screenId: string): boolean {
    this.syncUsage();
    const current = this.currentScreen;
    if (!this.opened || !this.app || (this.app.requiresNetwork && !this.networkAllowed) ||
        !current?.links.some(link => link.screenId === screenId) ||
        !this.app.screens.some(screen => screen.id === screenId)) return false;
    this.history.push(screenId);
    this.changed();
    return true;
  }
  openNotification(id: string): boolean {
    const notice = this.notifications.find(item => item.id === id);
    const app = this.data.apps.find(item => item.id === notice?.appId);
    this.syncUsage();
    if (!this.opened || !notice || !app || (app.requiresNetwork && !this.networkAllowed) ||
        !app.screens.some(screen => screen.id === app.startScreenId) ||
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
