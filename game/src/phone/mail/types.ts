/** Local mail DTOs. No network or accounts; addresses and links are fictitious and display timestamps come from the caller. */
export interface MailLink {
  /** Text shown in the body. It may differ from the real destination, as in phishing mail. */
  label: string;
  /** Real destination. Never opened; the UI only reveals it. Restricted to reserved hostnames (.example/.test/.invalid). */
  href: string;
}
export interface MailText {
  /** Sender display name supplied by game data. */
  from: string;
  /** Actual sender address, kept apart from the display name. Empty for saves from before addresses existed. */
  fromAddress: string;
  /** Recipient as shown in the header. Empty means the player. */
  to: string;
  subject: string;
  /** Plain text. Line breaks separate paragraphs. */
  body: string;
  links: MailLink[];
}
export interface MailMessage extends MailText {
  id: string;
  atMs: number;
  read: boolean;
}
export interface PendingMail extends MailText {
  id: string;
  /** Remaining active play time. Never an epoch deadline or offline timer. */
  remainingMs: number;
}
export interface MailSave { v: 1; messages: MailMessage[]; pending: PendingMail[] }
/** Content and events may omit the address, recipient and links. */
export type MailTextInput = Pick<MailText, 'from' | 'subject' | 'body'> & Partial<Pick<MailText, 'fromAddress' | 'to' | 'links'>>;
export type ScheduledMail = MailTextInput & { id: string; delayMs: number };
export interface MailContent { initialMessages: (MailTextInput & { id: string; atMs: number; read: boolean })[]; scheduled: ScheduledMail[] }
export type IncomingMail = MailTextInput & { id: string; atMs: number };
export type MailFailure = 'invalid-mail' | 'empty-text' | 'duplicate-id';
export type MailResult = { ok: true; mail: MailMessage } | { ok: false; reason: MailFailure };
