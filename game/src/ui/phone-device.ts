import type { PhoneApp, PhoneScreen } from '../phone/content';
import { phoneIcon } from '../phone/icons';
import type { PhoneModel } from '../phone/model';
import './phone-device.css';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The device is a view over game-local data; its shell owns no story or network access. */
export class PhoneDevice {
  readonly button = el('button', 'panel phone-launcher');
  private readonly overlay = el('div', 'phone-overlay');
  private readonly device = el('section', 'phone-device');
  private readonly body = el('div', 'phone-body');
  private readonly backButton = el('button', 'phone-nav-button');
  private readonly homeButton = el('button', 'phone-nav-button phone-nav-home');
  private readonly closeButton = el('button', 'phone-nav-button');
  private visible = false;

  constructor(private readonly model: PhoneModel, private readonly stage: HTMLElement, private readonly onClose: () => void) {
    const menu = stage.querySelector<HTMLElement>('#menu');
    if (!menu) throw new Error('Missing game menu');
    this.button.id = 'btn-phone'; this.button.type = 'button';
    this.button.append(el('span', 'phone-launcher-icon', '▣'), document.createTextNode('スマホ'));
    menu.insertBefore(this.button, menu.querySelector('#btn-touch'));
    this.overlay.id = 'phone-overlay'; this.overlay.hidden = true;
    this.device.id = 'phone-device'; this.device.tabIndex = -1;
    this.device.setAttribute('role', 'dialog'); this.device.setAttribute('aria-modal', 'true');
    this.device.setAttribute('aria-label', 'ゲーム内スマートフォン');
    const hardware = el('div', 'phone-hardware');
    hardware.append(el('span', 'phone-camera'), el('span', 'phone-speaker'), el('span', 'phone-hardware-dot'));
    const screen = el('div', 'phone-screen');
    const status = el('div', 'phone-status');
    const statusTime = el('span', 'phone-status-time', '9:41');
    const statusIcons = el('span', 'phone-status-icons', '▮▮  ◆  ▰');
    statusIcons.setAttribute('aria-hidden', 'true');
    status.append(statusTime, statusIcons);
    this.body.id = 'phone-body';
    const nav = el('nav', 'phone-nav'); nav.setAttribute('aria-label', 'スマホの操作');
    this.setupNav(this.backButton, '‹', 'もどる', () => this.model.back());
    this.setupNav(this.homeButton, '◆', 'ホーム', () => this.model.home());
    this.setupNav(this.closeButton, '×', 'とじる', () => this.model.close());
    this.backButton.id = 'phone-back'; this.homeButton.id = 'phone-home'; this.closeButton.id = 'phone-close';
    nav.append(this.backButton, this.homeButton, this.closeButton);
    screen.append(status, this.body, nav); this.device.append(hardware, screen); this.overlay.append(this.device); stage.append(this.overlay);
    this.device.addEventListener('focusin', event => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      for (const button of this.device.querySelectorAll('button.is-selected')) button.classList.remove('is-selected');
      target.classList.add('is-selected');
    });
    this.model.onChange(() => this.sync());
  }

  get isOpen(): boolean { return this.model.isOpen; }
  get isAvailable(): boolean { return this.model.isOwned; }
  open(): void { this.model.open(); }
  close(): void { this.model.close(); }

  handleKey(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
      event.preventDefault(); if (!event.repeat) this.model.close(); return;
    }
    if (event.code === 'Backspace') {
      event.preventDefault(); if (!event.repeat) this.model.back(); return;
    }
    if (event.code === 'KeyH') {
      event.preventDefault(); if (!event.repeat) this.model.home(); return;
    }
    if (event.code === 'KeyZ') {
      event.preventDefault();
      if (!event.repeat && document.activeElement instanceof HTMLButtonElement && this.device.contains(document.activeElement)) document.activeElement.click();
      return;
    }
    const buttons = [...this.device.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (event.code === 'Tab') {
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault(); this.moveFocus(event.code, buttons);
    }
  }

  private setupNav(button: HTMLButtonElement, symbol: string, label: string, action: () => void): void {
    button.type = 'button'; button.setAttribute('aria-label', label);
    button.append(el('span', 'phone-nav-symbol', symbol), el('span', 'phone-nav-label', label));
    button.addEventListener('click', action);
  }

  private moveFocus(code: string, buttons: HTMLButtonElement[]): void {
    const current = document.activeElement as HTMLButtonElement;
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
      if (this.visible) { this.visible = false; this.overlay.hidden = true; this.stage.classList.remove('phone-open'); this.onClose(); }
      return;
    }
    this.visible = true; this.overlay.hidden = false; this.stage.classList.add('phone-open');
    this.render();
    const first = this.body.querySelector<HTMLButtonElement>('button[data-phone-item]');
    (first ?? this.homeButton).focus({ preventScroll: true });
  }

  private render(): void {
    const app = this.model.currentApp, screen = this.model.currentScreen;
    this.body.replaceChildren(); this.body.scrollTop = 0;
    this.backButton.disabled = !app; this.homeButton.disabled = !app;
    if (!app || !screen) this.renderHome();
    else this.renderApp(app, screen);
  }

  private renderHome(): void {
    const home = el('div', 'phone-home');
    const hero = el('div', 'phone-home-hero');
    const greeting = el('div', 'phone-greeting');
    greeting.append(el('span', 'phone-greeting-label', 'MY DAY'), el('strong', '', 'こんにちは'), el('span', '', 'きょうは なにを しよう？'));
    const scene = el('div', 'phone-pixel-scene'); scene.setAttribute('aria-hidden', 'true');
    scene.append(el('i', 'phone-sun'), el('i', 'phone-cloud cloud-one'), el('i', 'phone-cloud cloud-two'), el('i', 'phone-hill'), el('i', 'phone-house'));
    hero.append(greeting, scene);
    const section = el('div', 'phone-home-content');
    const heading = el('div', 'phone-section-title'); heading.append(el('span', '', 'アプリ'), el('small', '', 'えらんで ひらく'));
    const grid = el('div', 'phone-app-grid');
    for (const app of this.model.content.apps) {
      const button = el('button', 'phone-app'); button.type = 'button'; button.dataset.phoneItem = 'app'; button.dataset.app = app.id;
      const tile = el('span', `phone-app-icon tone-${app.tone}`); tile.append(phoneIcon(app.icon));
      button.append(tile, el('strong', 'phone-app-label', app.label), el('small', 'phone-app-caption', app.caption));
      button.addEventListener('click', () => this.model.launch(app.id)); grid.append(button);
    }
    const notices = this.model.notifications;
    const noticeHeading = el('div', 'phone-section-title phone-notice-heading');
    noticeHeading.append(el('span', '', 'おしらせ'), el('small', 'phone-count', String(notices.length)));
    section.append(heading, grid, noticeHeading);
    if (!notices.length) section.append(el('div', 'phone-empty', 'いまは おしらせが ありません'));
    for (const notice of notices) {
      const button = el('button', 'phone-notice'); button.type = 'button'; button.dataset.phoneItem = 'notification'; button.dataset.notification = notice.id;
      const icon = el('span', 'phone-notice-icon'); icon.append(phoneIcon('message'));
      const copy = el('span', 'phone-notice-copy'); copy.append(el('strong', '', notice.title), el('small', '', notice.text));
      button.append(icon, copy, el('span', 'phone-chevron', '›'));
      button.addEventListener('click', () => this.model.openNotification(notice.id)); section.append(button);
    }
    home.append(hero, section); this.body.append(home);
  }

  private renderApp(app: PhoneApp, screen: PhoneScreen): void {
    const view = el('div', `phone-view phone-view-${screen.layout}`);
    const header = el('div', 'phone-view-header');
    const icon = el('span', `phone-view-icon tone-${app.tone}`); icon.append(phoneIcon(app.icon));
    const title = el('div', 'phone-view-title'); title.append(el('small', '', screen.subtitle), el('h2', '', screen.title));
    header.append(icon, title); view.append(header);
    if (screen.layout === 'web' || screen.layout === 'page') {
      const address = el('div', 'phone-fake-address'); address.append(el('span', '', '◆'), el('span', '', 'ゲーム内のページ')); view.append(address);
    }
    const content = el('div', 'phone-view-content');
    if (screen.layout === 'web') {
      const banner = el('div', 'phone-web-banner');
      banner.append(el('span', 'phone-web-spark', '✦'), el('strong', '', 'みつける'), el('small', '', 'ちいさな たのしみ'));
      content.append(banner);
    }
    if (screen.layout === 'placeholder') {
      const mark = el('div', `phone-placeholder-icon tone-${app.tone}`); mark.append(phoneIcon(app.icon));
      content.append(mark, el('strong', 'phone-coming-soon', 'じゅんび中'));
    }
    const paragraphs = el('div', screen.layout === 'message' ? 'phone-message-bubble' : 'phone-copy');
    for (const text of screen.paragraphs) paragraphs.append(el('p', '', text));
    content.append(paragraphs);
    for (const link of screen.links) {
      const button = el('button', 'phone-entry'); button.type = 'button'; button.dataset.phoneItem = 'link'; button.dataset.screen = link.screenId;
      const mark = el('span', `phone-entry-icon tone-${app.tone}`); mark.append(phoneIcon(app.icon));
      const copy = el('span', 'phone-entry-copy');
      if (link.meta) copy.append(el('small', 'phone-entry-meta', link.meta));
      copy.append(el('strong', '', link.label)); if (link.summary) copy.append(el('small', '', link.summary));
      button.append(mark, copy, el('span', 'phone-chevron', '›'));
      button.addEventListener('click', () => this.model.navigate(link.screenId)); content.append(button);
    }
    view.append(content); this.body.append(view);
  }
}
