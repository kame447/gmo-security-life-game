/** Local mail DTOs. No network, accounts or real addresses; display timestamps come from the caller. */
export interface MailMessage {
  id: string;
  /** Sender display name supplied by game data, never a real address. */
  from: string;
  subject: string;
  /** Plain text. Line breaks separate paragraphs. */
  body: string;
  atMs: number;
  read: boolean;
}
export interface PendingMail {
  id: string;
  from: string;
  subject: string;
  body: string;
  /** Remaining active play time. Never an epoch deadline or offline timer. */
  remainingMs: number;
}
export interface MailSave { v: 1; messages: MailMessage[]; pending: PendingMail[] }
export interface ScheduledMail { id: string; from: string; subject: string; body: string; delayMs: number }
export interface MailContent { initialMessages: MailMessage[]; scheduled: ScheduledMail[] }
export interface IncomingMail { id: string; from: string; subject: string; body: string; atMs: number }
export type MailFailure = 'invalid-mail' | 'empty-text' | 'duplicate-id';
export type MailResult = { ok: true; mail: MailMessage } | { ok: false; reason: MailFailure };
