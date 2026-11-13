import type { PhoneApp, PhoneScreen } from '../phone/content';
import type { PhoneModel } from '../phone/model';
import { CHAT_SELF } from '../phone/chat/types';
import { renderChatConversation, renderChatList, type ChatThreadView } from './phone-chat';
import './smartphone.css';
import './phone-chat.css';

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const svgNS = 'http://www.w3.org/2000/svg';
const iconPaths: Record<PhoneApp['icon'], string> = {
  message: 'M6 7h20v14H15l-6 4v-4H6z M10 12h12 M10 16h8',
  web: 'M16 4a12 12 0 1 0 0 24 12 12 0 0 0 0-24z M20 11l-2.5 6.5L11 21l3.5-6.5z',
  life: 'M5 15 16 6l11 9 M8 14v12h16V14 M13 26v-7h6v7',
  friends: 'M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 25c0-5 3-7 8-7s8 2 8 7 M22 9a4 4 0 0 1 0 8 M22 19c4 0 6 2 6 6',
  data: 'M8 23V10 M5 13l3-3 3 3 M24 9v13 M21 19l3 3 3-3 M15 6h3 M15 26h3',
};

function appIcon(icon: PhoneApp['icon']): SVGSVGElement {
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', iconPaths[icon]); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
  svg.append(path); return svg;
}

export interface PhoneUsageView { remainingMb: number; capacityMb: number }

/** Review-only presentation over the phone state. It creates no network connections. */
export class Smartphone {
  readonly button = make('button', 'panel smartphone-launcher', 'スマホ');
  private readonly overlay = make('div', 'smartphone-overlay');
  private readonly device = make('section', 'smartphone');
  private readonly body = make('div', 'smartphone-body');
  private readonly time = make('span', 'smartphone-time');
  private readonly balance = make('span', 'smartphone-balance');
  private readonly back = make('button', 'smartphone-nav-button', '‹');
  private readonly home = make('button', 'smartphone-home-button');
  private readonly closeButton = make('button', 'smartphone-nav-button', '×');
  private readonly chatDrafts = new Map<string, string>();
  private scrollChatToEnd = false;
  private visible = false;

  constructor(private readonly model: PhoneModel, stage: HTMLElement,
    private readonly onClose: () => void, private readonly readUsage: () => PhoneUsageView) {
    const menu = stage.querySelector<HTMLElement>('#menu');
    if (!menu) throw new Error('Missing game menu');
    this.button.type = 'button'; this.button.id = 'btn-phone';
    menu.insertBefore(this.button, menu.querySelector('#btn-touch'));
    this.overlay.id = 'phone-overlay'; this.overlay.hidden = true;
    this.device.id = 'phone-device'; this.device.tabIndex = -1;
    this.device.setAttribute('role', 'dialog'); this.device.setAttribute('aria-modal', 'true');
    this.device.setAttribute('aria-label', 'スマートフォン');

    const screen = make('div', 'smartphone-screen');
    const status = make('div', 'smartphone-status');
    const statusRight = make('div', 'smartphone-status-right');
    const signal = make('span', 'smartphone-signal'); signal.setAttribute('aria-label', '電波');
    for (let i = 0; i < 4; i++) signal.append(make('i'));
    const battery = make('span', 'smartphone-battery'); battery.setAttribute('aria-label', '電池');
    statusRight.append(this.balance, signal, battery); status.append(this.time, statusRight);
    const camera = make('div', 'smartphone-camera'); camera.setAttribute('aria-hidden', 'true');
    this.body.id = 'phone-body';
    const nav = make('nav', 'smartphone-nav'); nav.setAttribute('aria-label', 'スマートフォンの操作');
    this.back.type = this.home.type = this.closeButton.type = 'button';
    this.back.id = 'phone-back'; this.home.id = 'phone-home'; this.closeButton.id = 'phone-close';
    this.back.setAttribute('aria-label', '戻る'); this.home.setAttribute('aria-label', 'ホーム'); this.closeButton.setAttribute('aria-label', '閉じる');
    this.home.append(make('span', 'smartphone-home-bar'));
    this.back.addEventListener('click', () => this.model.back());
    this.home.addEventListener('click', () => this.model.home());
    this.closeButton.addEventListener('click', () => this.model.close());
    nav.append(this.back, this.home, this.closeButton);
    screen.append(status, camera, this.body, nav); this.device.append(screen); this.overlay.append(this.device); stage.append(this.overlay);
    this.device.addEventListener('focusin', event => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      for (const selected of this.device.querySelectorAll('button.is-selected')) selected.classList.remove('is-selected');
      target.classList.add('is-selected');
    });
    this.model.onChange(() => this.sync());
  }

  get isOpen(): boolean { return this.model.isOpen; }
  get isAvailable(): boolean { return this.model.isOwned; }
  open(): void { this.model.open(); }
  close(): void { this.model.close(); }

  /** Refresh just the changing numbers so focus and navigation are not rebuilt every frame. */
  update(): void {
    if (!this.visible) return;
    const now = new Date(); this.time.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const usage = this.readUsage();
    const format = (mb: number) => mb >= 1000 ? `${(mb / 1000).toFixed(2)} GB` : `${Math.max(0, mb).toFixed(0)} MB`;
    this.balance.textContent = format(usage.remainingMb);
    this.balance.setAttribute('aria-label', `通信残量 ${format(usage.remainingMb)}`);
    const label = this.body.querySelector<HTMLElement>('[data-usage-label]');
    if (label) label.textContent = `${format(usage.remainingMb)} / ${format(usage.capacityMb)}`;
    const meter = this.body.querySelector<HTMLElement>('[data-usage-meter]');
    if (meter) meter.style.width = `${Math.max(0, Math.min(100, usage.remainingMb / usage.capacityMb * 100))}%`;
    const input = this.body.querySelector<HTMLInputElement>('.phone-chat-input');
    const send = this.body.querySelector<HTMLButtonElement>('.phone-chat-send');
    if (input && send) send.disabled = !this.model.networkAllowed || !input.value.trim();
  }

  handleKey(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.classList.contains('phone-chat-input') && this.device.contains(target)) {
      if (event.code === 'Escape') { event.preventDefault(); return; }
      if (event.key === 'Enter') {
        if (!event.isComposing && !event.repeat) { event.preventDefault(); target.form?.requestSubmit(); }
        return;
      }
      if (event.code !== 'Tab') return;
    }
    if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) this.model.close(); return; }
    if (event.code === 'Backspace') { event.preventDefault(); if (!event.repeat) this.model.back(); return; }
    if (event.code === 'KeyH') { event.preventDefault(); if (!event.repeat) this.model.home(); return; }
    if (event.code === 'KeyZ') {
      event.preventDefault();
      if (!event.repeat && document.activeElement instanceof HTMLButtonElement && this.device.contains(document.activeElement)) document.activeElement.click();
      return;
    }
    const buttons = [...this.device.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
    if (event.code === 'Tab') {
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault(); this.moveFocus(event.code, buttons);
    }
  }

  private moveFocus(code: string, buttons: HTMLElement[]): void {
    const current = document.activeElement as HTMLElement;
    if (!buttons.includes(current)) { buttons[0]?.focus(); return; }
    const from = current.getBoundingClientRect(), cx = from.left + from.width / 2, cy = from.top + from.height / 2;
    const candidates = buttons.filter(button => button !== current).map(button => {
      const rect = button.getBoundingClientRect(), dx = rect.left + rect.width / 2 - cx, dy = rect.top + rect.height / 2 - cy;
      const forward = code === 'ArrowRight' ? dx : code === 'ArrowLeft' ? -dx : code === 'ArrowDown' ? dy : -dy;
      const across = code === 'ArrowRight' || code === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
      return { button, forward, score: forward + across * 2 };
    }).filter(item => item.forward > 4).sort((a, b) => a.score - b.score);
    candidates[0]?.button.focus();
  }

  private sync(): void {
    if (!this.model.isOpen) {
      if (this.visible) { this.visible = false; this.overlay.hidden = true; this.onClose(); }
      return;
    }
    this.visible = true; this.overlay.hidden = false;
    const oldThread = this.body.querySelector<HTMLElement>('[data-chat-conversation]')?.dataset.chatConversation;
    const oldInput = this.body.querySelector<HTMLInputElement>('.phone-chat-input');
    const oldSend = this.body.querySelector<HTMLButtonElement>('.phone-chat-send');
    const keepInput = document.activeElement === oldInput || document.activeElement === oldSend;
    const selection = oldInput && document.activeElement === oldInput ? [oldInput.selectionStart, oldInput.selectionEnd] : null;
    const oldScroll = this.body.querySelector<HTMLElement>('.phone-chat-messages');
    const scrollTop = oldScroll?.scrollTop ?? 0;
    const nearBottom = !oldScroll || oldScroll.scrollHeight - oldScroll.clientHeight - oldScroll.scrollTop < 24;
    this.render(); this.update();
    const nextThread = this.body.querySelector<HTMLElement>('[data-chat-conversation]')?.dataset.chatConversation;
    const nextScroll = this.body.querySelector<HTMLElement>('.phone-chat-messages');
    if (nextScroll) nextScroll.scrollTop = this.scrollChatToEnd || oldThread !== nextThread || nearBottom ? nextScroll.scrollHeight : scrollTop;
    this.scrollChatToEnd = false;
    const nextInput = this.body.querySelector<HTMLInputElement>('.phone-chat-input');
    if (nextInput && oldThread === nextThread && keepInput) {
      nextInput.focus({ preventScroll: true });
      if (selection && selection[0] !== null && selection[1] !== null) nextInput.setSelectionRange(selection[0], selection[1]);
    } else if (nextInput) this.back.focus({ preventScroll: true });
    else (this.body.querySelector<HTMLButtonElement>('button') ?? this.home).focus({ preventScroll: true });
  }

  private render(): void {
    const app = this.model.currentApp, screen = this.model.currentScreen;
    this.device.classList.toggle('showing-app', !!app);
    this.back.disabled = !app; this.home.disabled = !app;
    this.body.classList.remove('chat-thread-open');
    this.body.replaceChildren(); this.body.scrollTop = 0;
    if (!app || !screen) { this.renderHome(); return; }
    if (app.id === 'messages') { this.renderChat(); return; }
    this.renderApp(app, screen);
  }

  private renderHome(): void {
    const grid = make('div', 'smartphone-app-grid');
    for (const app of this.model.content.apps) {
      const button = make('button', 'smartphone-app'); button.type = 'button'; button.dataset.app = app.id;
      const tile = make('span', `smartphone-app-icon icon-${app.tone}`); tile.append(appIcon(app.icon));
      const count = app.id === 'messages' ? this.model.chatUnreadCount : this.model.notifications.filter(notice => notice.appId === app.id).length;
      if (count) { const badge = make('span', 'smartphone-badge', String(count)); badge.setAttribute('aria-label', `通知 ${count}件`); tile.append(badge); }
      button.setAttribute('aria-label', app.caption === 'じゅんび中' ? `${app.label}（準備中）` : app.label);
      button.append(tile, make('span', 'smartphone-app-label', app.label));
      button.addEventListener('click', () => {
        if (!this.model.launch(app.id) && app.requiresNetwork && !this.model.networkAllowed) {
          let notice = this.body.querySelector<HTMLElement>('.smartphone-error');
          if (!notice) { notice = make('p', 'smartphone-error'); notice.setAttribute('role', 'status'); this.body.append(notice); }
          notice.textContent = '通信残量がありません';
        }
      }); grid.append(button);
    }
    this.body.append(grid);
  }

  private chatTime(atMs: number): string {
    const date = new Date(atMs);
    if (!Number.isFinite(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private renderChat(): void {
    const threads: ChatThreadView[] = this.model.chatThreads.map(thread => ({ id: thread.id, name: thread.contact.name,
      preview: thread.lastMessage?.text ?? '', time: thread.lastMessage ? this.chatTime(thread.lastMessage.atMs) : '',
      unread: thread.unreadCount }));
    const selected = threads.find(thread => thread.id === this.model.currentChatThread);
    if (!selected) { this.body.append(renderChatList(threads, id => { this.model.openChatThread(id); })); return; }
    const messages = this.model.chatMessages(selected.id).map(message => ({ id: message.id, text: message.text,
      time: this.chatTime(message.atMs), outgoing: message.from === CHAT_SELF }));
    const chat = renderChatConversation(selected, messages, {
      draft: this.chatDrafts.get(selected.id) ?? '', maxLength: this.model.chatTextLimit,
      canSend: () => this.model.networkAllowed,
      onDraft: text => { this.chatDrafts.set(selected.id, text); },
      onSend: text => {
        this.chatDrafts.delete(selected.id); this.scrollChatToEnd = true;
        const result = this.model.sendChat(text);
        if (result.ok) return;
        this.chatDrafts.set(selected.id, text); this.scrollChatToEnd = false;
        let error = this.body.querySelector<HTMLElement>('.phone-chat-error');
        if (!error) { error = make('p', 'phone-chat-error'); error.setAttribute('role', 'status'); this.body.append(error); }
        error.textContent = result.reason === 'network-unavailable' ? '通信残量がありません' : '送信できませんでした';
      },
    });
    this.body.classList.add('chat-thread-open'); this.body.append(chat.view);
  }

  private renderApp(app: PhoneApp, screen: PhoneScreen): void {
    const view = make('div', 'smartphone-view');
    const heading = make('h1', 'smartphone-view-title', screen.title); view.append(heading);
    if (screen.layout === 'usage') {
      const card = make('div', 'smartphone-usage');
      card.append(make('span', 'smartphone-usage-title', '通信残量'));
      const label = make('strong', 'smartphone-usage-label'); label.dataset.usageLabel = 'true'; card.append(label);
      const track = make('div', 'smartphone-usage-track'), fill = make('span', 'smartphone-usage-fill');
      fill.dataset.usageMeter = 'true'; track.append(fill); card.append(track); view.append(card);
    } else if (screen.layout === 'placeholder') {
      view.append(make('div', 'smartphone-placeholder', '準備中'));
    } else {
      if (screen.layout === 'web' || screen.layout === 'page') view.append(make('div', 'smartphone-address', 'ゲーム内'));
      for (const text of screen.paragraphs) view.append(make('p', screen.layout === 'message' ? 'smartphone-bubble' : 'smartphone-copy', text));
      for (const link of screen.links) {
        const button = make('button', 'smartphone-entry'); button.type = 'button'; button.dataset.screen = link.screenId;
        const tile = make('span', `smartphone-entry-icon icon-${app.tone}`); tile.append(appIcon(app.icon));
        const label = make('span', 'smartphone-entry-label'); label.append(make('strong', '', link.label));
        if (link.summary) label.append(make('small', '', link.summary));
        button.append(tile, label, make('span', 'smartphone-chevron', '›'));
        button.addEventListener('click', () => {
          if (!this.model.navigate(link.screenId) && app.requiresNetwork && !this.model.networkAllowed) {
            let notice = view.querySelector<HTMLElement>('.smartphone-network-error');
            if (!notice) { notice = make('p', 'smartphone-network-error'); notice.setAttribute('role', 'status'); view.append(notice); }
            notice.textContent = '通信残量がありません';
          }
        }); view.append(button);
      }
    }
    this.body.append(view);
  }
}
