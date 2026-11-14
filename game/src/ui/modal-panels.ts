/** Shared input contract for the existing appearance panel and future modal panels. */
export type ModalPanelId = 'avatar' | 'inventory' | 'shop' | 'phone';
export type UiMode = 'explore' | 'dialog' | ModalPanelId;

export interface ModalPanel {
  readonly isOpen: boolean;
  handleKey(event: KeyboardEvent): void;
}

/** Panels own their DOM and visuals; button and shortcut are optional for contextual panels. */
export interface ModalPanelRegistration {
  id: ModalPanelId;
  panel: ModalPanel;
  /** Default opener for a button or shortcut; contextual callers can supply an override. */
  open?: () => void;
  button?: HTMLButtonElement;
  /** KeyboardEvent.code, for example KeyI or KeyP. */
  shortcut?: string;
  /** Additional availability, such as whether the player owns a phone. */
  canOpen?: () => boolean;
}

export interface ModalPanelHost {
  /** Duplicate IDs and shortcuts are rejected. */
  registerPanel(registration: ModalPanelRegistration): void;
  /** Returns true only if the panel opened; blocks while a dialog or another panel is open. */
  openPanel(id: ModalPanelId, openOverride?: () => void): boolean;
  /** Synchronize buttons and visibility after state changes; called once per frame by main. */
  update(): void;
}

/** DOM-independent registry; all openings pass through the same exclusivity guard. */
export class ModalPanels {
  private readonly panels = new Map<ModalPanelId, ModalPanelRegistration>();
  private opening = false;

  constructor(private readonly hasDialog: () => boolean, private readonly beforeOpen: () => void) {}

  get registrations(): readonly ModalPanelRegistration[] { return [...this.panels.values()]; }
  get active(): ModalPanelRegistration | undefined { return this.registrations.find(entry => entry.panel.isOpen); }
  get mode(): UiMode { return this.active?.id ?? (this.hasDialog() ? 'dialog' : 'explore'); }

  register(registration: ModalPanelRegistration): void {
    if (this.panels.has(registration.id)) throw new Error(`Duplicate panel: ${registration.id}`);
    if (this.registrations.some(entry => entry.panel === registration.panel)) throw new Error('Panel is already registered');
    if (registration.shortcut && this.byShortcut(registration.shortcut)) throw new Error(`Duplicate shortcut: ${registration.shortcut}`);
    if ((registration.button || registration.shortcut) && !registration.open) throw new Error('A button or shortcut needs a default opener');
    this.panels.set(registration.id, registration);
  }

  byShortcut(code: string): ModalPanelRegistration | undefined {
    return this.registrations.find(entry => entry.shortcut === code);
  }

  canOpen(id: ModalPanelId): boolean {
    const entry = this.panels.get(id);
    return !!entry && !this.opening && !this.active && !this.hasDialog() && (entry.canOpen?.() ?? true);
  }

  open(id: ModalPanelId, openOverride?: () => void): boolean {
    const entry = this.panels.get(id);
    if (!entry || !this.canOpen(id)) return false;
    const opener = openOverride ?? entry.open;
    if (!opener) return false;
    this.opening = true;
    try {
      this.beforeOpen();
      opener();
      return entry.panel.isOpen;
    } finally {
      this.opening = false;
    }
  }

  /** Returns whether a modal received the key, even when it closes during the callback. */
  dispatchKey(event: KeyboardEvent): boolean {
    const entry = this.active;
    if (!entry) return false;
    entry.panel.handleKey(event);
    return true;
  }
}
