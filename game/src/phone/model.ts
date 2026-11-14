import type { PhoneApp, PhoneContent, PhoneNotification, PhoneScreen } from './content';
import { PHONE_BUDGET_PROTOTYPE, type PhoneBudgetConfig } from './budget-config';
import { PhoneDataBudget, type PhoneUsageContext } from './budget';
import { parsePhoneSave, type PhoneSave } from './save';
import { CHAT_PROTOTYPE } from '../data/chat-prototype';
import { ChatModel } from './chat/model';
import { CHAT_LIMITS } from './chat/limits';
import type { ChatMessage, ChatResult, ChatThreadSummary, IncomingMessage } from './chat/types';

export { parsePhoneSave } from './save';
export type { PhoneSave } from './save';

type PhoneEnvironment = Omit<PhoneUsageContext, 'owned' | 'open'>;
export type PhoneChatResult = ChatResult | { ok: false; reason: 'network-unavailable' | 'not-open' };
export class PhoneModel {
  private owned: boolean;
  private opened = false;
  private app: PhoneApp | null = null;
  private history: string[] = [];
  private readonly listeners = new Set<() => void>();
  private data: PhoneContent;
  private readonly usage: PhoneDataBudget;
  private readonly chatModel: ChatModel;
  private chatThread: string | null = null;
  private chatLastTick: number | null = null;
  private chatWasActive = false;
  private chatChangedInProgress = false;
  private includeChatInSave: boolean;
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
    this.chatModel = new ChatModel(CHAT_PROTOTYPE, saved.chat);
    this.includeChatInSave = saved.chat !== undefined;
    this.chatModel.onChange(() => this.onChatChange());
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
  get chatThreads(): readonly ChatThreadSummary[] { return this.chatModel.listThreads(); }
  get currentChatThread(): string | null { return this.chatThread; }
  get chatUnreadCount(): number { return this.chatThreads.reduce((sum, thread) => sum + thread.unreadCount, 0); }
  get chatTextLimit(): number { return CHAT_LIMITS.textCodePoints; }
  chatMessages(threadId: string): readonly ChatMessage[] { return this.chatModel.messages(threadId); }
  save(): PhoneSave {
    this.syncUsage();
    const epoch = this.usage.config.offlineUsage === 'consume-if-active' ? this.epochClock() : undefined;
    return { v: 1, owned: this.owned, dataBudget: this.usage.save(epoch),
      ...(this.includeChatInSave ? { chat: this.chatModel.save() } : {}) };
  }
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private changed(): void { for (const listener of this.listeners) listener(); }
  private onChatChange(): void {
    this.includeChatInSave = true;
    if (this.chatChangedInProgress) return;
    this.chatChangedInProgress = true;
    try {
      if (this.opened && this.app?.id === 'messages' && this.chatThread) this.chatModel.markRead(this.chatThread);
    } finally { this.chatChangedInProgress = false; }
    this.changed();
  }
  private syncUsage(): void {
    const now = this.clock();
    this.usage.update(now, { ...this.environment, owned: this.owned, open: this.opened });
    if (!Number.isFinite(now) || now < 0 || (this.chatLastTick !== null && now < this.chatLastTick)) return;
    const elapsed = this.chatLastTick !== null && this.chatWasActive ? now - this.chatLastTick : 0;
    // Set the anchor before callbacks: a save listener can re-enter syncUsage().
    this.chatLastTick = now;
    this.chatWasActive = this.environment.visible && !this.environment.paused;
    if (elapsed > 0) this.chatModel.advance(elapsed, this.epochClock());
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
        this.app = null; this.history = []; this.chatThread = null;
      } else this.app = next;
    }
    this.changed();
  }

  /** Future progression can award or revoke ownership without changing the UI. */
  setOwned(owned: boolean): void {
    if (typeof owned !== 'boolean' || this.owned === owned) return;
    this.owned = owned;
    if (!owned) { this.opened = false; this.app = null; this.history = []; this.chatThread = null; }
    this.syncUsage();
    this.changed();
  }
  open(): boolean {
    if (!this.owned || this.opened) return false;
    this.opened = true;
    this.syncUsage();
    this.app = null;
    this.history = [];
    this.chatThread = null;
    this.changed();
    return true;
  }
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.syncUsage();
    this.app = null;
    this.history = [];
    this.chatThread = null;
    this.changed();
  }
  home(): void {
    if (!this.opened || !this.app) return;
    this.app = null; this.history = []; this.chatThread = null; this.changed();
  }
  launch(appId: string): boolean {
    const app = this.data.apps.find(item => item.id === appId);
    this.syncUsage();
    if (!this.opened || !app || (app.requiresNetwork && !this.networkAllowed) ||
        !app.screens.some(screen => screen.id === app.startScreenId)) return false;
    this.app = app;
    this.history = [app.startScreenId];
    this.chatThread = null;
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
    this.chatThread = null;
    this.history = notice.screenId === app.startScreenId ? [app.startScreenId] : [app.startScreenId, notice.screenId];
    this.changed();
    return true;
  }
  back(): void {
    if (!this.opened) return;
    if (!this.app) { this.close(); return; }
    if (this.app.id === 'messages' && this.chatThread) { this.chatThread = null; this.changed(); return; }
    if (this.history.length > 1) this.history.pop();
    else { this.app = null; this.history = []; }
    this.changed();
  }

  openChatThread(id: string): boolean {
    if (!this.opened || this.app?.id !== 'messages' || !this.chatThreads.some(thread => thread.id === id)) return false;
    this.chatThread = id;
    if (this.chatModel.markRead(id) === 0) this.changed();
    return true;
  }

  sendChat(text: string): PhoneChatResult {
    if (!this.opened || this.app?.id !== 'messages' || !this.chatThread) return { ok: false, reason: 'not-open' };
    this.syncUsage();
    if (!this.networkAllowed) return { ok: false, reason: 'network-unavailable' };
    return this.chatModel.sendMessage(this.chatThread, text, this.epochClock());
  }

  /** Future in-game events can deliver local data without exposing mutable state. */
  deliverChatMessage(threadId: string, message: IncomingMessage): ChatResult {
    return this.chatModel.deliverMessage(threadId, message);
  }
}
