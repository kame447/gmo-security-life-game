import { cleanChatText, isChatId, isChatTime } from '../chat/codec';
import { cleanMailBody, parseMailSave } from './codec';
import { MAIL_LIMITS } from './limits';
import type { IncomingMail, MailContent, MailMessage, MailResult, MailSave } from './types';

/** Pure local inbox: no network, global clock, timers or UI selection. */
export class MailModel {
  private state: MailSave;
  /** Pending delays as of the last arrival; saves stay identical between arrivals. */
  private checkpoint: MailSave['pending'];
  private readonly content: MailContent;
  private readonly listeners = new Set<() => void>();
  private readonly arrivals = new Set<(mail: MailMessage) => void>();

  constructor(content: MailContent, saved?: unknown) {
    this.content = structuredClone(content);
    this.state = parseMailSave(saved, this.content);
    this.checkpoint = structuredClone(this.state.pending);
  }
  /** Newest first. */
  list(): MailMessage[] { return structuredClone(this.state.messages).reverse(); }
  get(id: string): MailMessage | null { return structuredClone(this.state.messages.find(mail => mail.id === id) ?? null); }
  get unreadCount(): number { return this.state.messages.filter(mail => !mail.read).length; }
  save(): MailSave { return parseMailSave({ ...this.state, pending: this.checkpoint }, this.content); }
  /** Emitted after delivery and reads, not on every countdown decrement. */
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  /** Emitted once per newly received mail, after onChange. */
  onArrive(listener: (mail: MailMessage) => void): () => void { this.arrivals.add(listener); return () => this.arrivals.delete(listener); }
  private bounded(): void { this.state = parseMailSave(this.state, this.content); }
  private received(mails: MailMessage[]): void {
    this.bounded();
    this.checkpoint = structuredClone(this.state.pending);
    for (const listener of this.listeners) listener();
    for (const mail of mails) for (const listener of this.arrivals) listener(structuredClone(mail));
  }

  /** Event entry point. IDs deduplicate retained and pending mail. */
  deliver(incoming: IncomingMail): MailResult {
    if (!incoming || !isChatId(incoming.id) || !isChatTime(incoming.atMs)) return { ok: false, reason: 'invalid-mail' };
    const from = cleanChatText(incoming.from, MAIL_LIMITS.fromCodePoints).trim();
    const subject = cleanChatText(incoming.subject, MAIL_LIMITS.subjectCodePoints).trim();
    const body = cleanMailBody(incoming.body);
    if (!from || !body) return { ok: false, reason: 'empty-text' };
    if (this.state.messages.some(mail => mail.id === incoming.id) || this.state.pending.some(mail => mail.id === incoming.id)) {
      return { ok: false, reason: 'duplicate-id' };
    }
    const mail: MailMessage = { id: incoming.id, from, subject, body, atMs: incoming.atMs, read: false };
    this.state.messages.push(mail);
    this.received([mail]);
    return { ok: true, mail: structuredClone(mail) };
  }

  /** Deliver scheduled mail after active play time; call with 0 while paused or hidden. */
  advance(elapsedPlayingMs: number, atMs: number): number {
    if (!Number.isFinite(elapsedPlayingMs) || elapsedPlayingMs < 0 || !isChatTime(atMs)) return 0;
    const delivered: MailMessage[] = [];
    const pending = this.state.pending;
    this.state.pending = [];
    for (const mail of pending) {
      mail.remainingMs = Math.max(0, mail.remainingMs - elapsedPlayingMs);
      if (mail.remainingMs > 0) { this.state.pending.push(mail); continue; }
      const message: MailMessage = { id: mail.id, from: mail.from, subject: mail.subject, body: mail.body, atMs, read: false };
      this.state.messages.push(message);
      delivered.push(message);
    }
    if (delivered.length) this.received(delivered);
    return delivered.length;
  }

  markRead(id: string): boolean {
    const mail = this.state.messages.find(item => item.id === id);
    if (!mail || mail.read) return false;
    mail.read = true;
    for (const listener of this.listeners) listener();
    return true;
  }
}
