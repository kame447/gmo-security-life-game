import type { PhoneModel } from '../phone/model';
import { $ } from './dom';

/** A view of the phone model; all text is inserted as text, and links stay inside the game. */
export class PhonePanel {
  private readonly panel = $<HTMLElement>('#phone-panel');
  private readonly stage = $<HTMLElement>('#stage');
  private readonly title = $<HTMLElement>('#phone-title');
  private readonly body = $<HTMLElement>('#phone-body');
  private readonly backButton = $<HTMLButtonElement>('#phone-back');
  private visible = false;

  constructor(private readonly model: PhoneModel, private readonly onClose: () => void) {
    this.backButton.addEventListener('click', () => this.model.back());
    $('#phone-close').addEventListener('click', () => this.model.close());
    this.model.onChange(() => this.sync());
  }
  get isOpen(): boolean { return this.model.isOpen; }
  get isAvailable(): boolean { return this.model.isOwned; }
  open(): void { this.model.open(); }

  handleKey(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
      event.preventDefault();
      if (!event.repeat) this.model.close();
    } else if (event.code === 'Tab') {
      event.preventDefault();
      const buttons = [...this.panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!buttons.length) return;
      const active = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = active < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
        : (active + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }
  }

  private sync(): void {
    if (!this.model.isOpen) {
      if (this.visible) {
        this.visible = false;
        this.panel.hidden = true;
        this.stage.classList.remove('phone-open');
        this.onClose();
      }
      return;
    }
    this.visible = true;
    this.panel.hidden = false;
    this.stage.classList.add('phone-open');
    this.render();
    this.panel.focus({ preventScroll: true });
  }

  private render(): void {
    const app = this.model.currentApp, screen = this.model.currentScreen;
    this.title.textContent = screen?.title ?? 'ホーム';
    this.backButton.disabled = !app;
    this.body.replaceChildren();
    if (!app || !screen) {
      const apps = document.createElement('div');
      apps.className = 'phone-apps';
      for (const item of this.model.content.apps) {
        const button = this.button(`${item.icon}  ${item.label}`, () => this.model.launch(item.id));
        button.dataset.app = item.id;
        apps.append(button);
      }
      this.body.append(apps);
      if (this.model.notifications.length) {
        const heading = document.createElement('h2');
        heading.textContent = 'おしらせ';
        this.body.append(heading);
        for (const notice of this.model.notifications) {
          const button = this.button(notice.text, () => this.model.openNotification(notice.id));
          button.classList.add('phone-link');
          button.dataset.notification = notice.id;
          this.body.append(button);
        }
      }
      return;
    }
    for (const text of screen.paragraphs) {
      const p = document.createElement('p');
      p.textContent = text;
      this.body.append(p);
    }
    for (const link of screen.links) {
      const button = this.button(link.label, () => this.model.navigate(link.screenId));
      button.classList.add('phone-link');
      button.dataset.screen = link.screenId;
      this.body.append(button);
    }
  }
  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
}
