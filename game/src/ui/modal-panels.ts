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
