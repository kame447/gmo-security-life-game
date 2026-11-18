import { MAIL_PROTOTYPE } from '../../data/mail-prototype';
import { cleanChatText, isChatId, isChatTime } from '../chat/codec';
import { MAIL_LIMITS } from './limits';
import type { MailContent, MailMessage, MailSave, PendingMail } from './types';

const record = (raw: unknown): Record<string, unknown> | undefined =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
const list = (raw: unknown): unknown[] => Array.isArray(raw) ? raw : [];

/** Keep text literal (including '<' and '>'); DOM consumers must use textContent. Line breaks survive in the body. */
export function cleanMailBody(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let left = MAIL_LIMITS.bodyCodePoints;
  const lines: string[] = [];
  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    if (left <= 0) break;
    const clean = cleanChatText(line, left);
    lines.push(clean);
    left -= [...clean].length;
  }
  return lines.join('\n').trim();
}

export function mailSaveBytes(save: MailSave): number {
  return new TextEncoder().encode(JSON.stringify(save)).length;
}

function defaultRaw(content: MailContent): MailSave {
  return { v: 1, messages: content.initialMessages, pending: content.scheduled.map(mail => ({
    id: mail.id, from: mail.from, subject: mail.subject, body: mail.body, remainingMs: mail.delayMs,
  })) };
}

function text(value: Record<string, unknown>): { from: string; subject: string; body: string } | undefined {
  const from = cleanChatText(value.from, MAIL_LIMITS.fromCodePoints).trim();
  const subject = cleanChatText(value.subject, MAIL_LIMITS.subjectCodePoints).trim();
  const body = cleanMailBody(value.body);
  return from && body ? { from, subject, body } : undefined;
}

/** Clock-free repair. Missing or broken saves start from the content's initial and scheduled mail. */
export function parseMailSave(raw: unknown, content: MailContent = MAIL_PROTOTYPE): MailSave {
  let source = record(raw);
  if (source?.v !== 1 || !Array.isArray(source.messages) || !Array.isArray(source.pending)) {
    source = defaultRaw(content) as unknown as Record<string, unknown>;
  }
  const ids = new Set<string>();
  const messages: MailMessage[] = [];
  for (const candidate of list(source.messages).slice(-MAIL_LIMITS.messages)) {
    const value = record(candidate);
    const parts = value && text(value);
    if (!value || !parts || !isChatId(value.id) || ids.has(value.id) || !isChatTime(value.atMs)) continue;
    messages.push({ id: value.id, ...parts, atMs: value.atMs, read: value.read === true });
    ids.add(value.id);
  }
  const pending: PendingMail[] = [];
  for (const candidate of list(source.pending).slice(0, MAIL_LIMITS.pending)) {
    const value = record(candidate);
    const parts = value && text(value);
    if (!value || !parts || !isChatId(value.id) || ids.has(value.id) ||
        typeof value.remainingMs !== 'number' || !Number.isFinite(value.remainingMs)) continue;
    pending.push({ id: value.id, ...parts, remainingMs: Math.min(MAIL_LIMITS.delayMs, Math.max(0, value.remainingMs)) });
    ids.add(value.id);
  }
  // Pending mail is small and fixed in number; drop the oldest received mail first to fit the byte budget.
  const result: MailSave = { v: 1, messages, pending };
  while (result.messages.length && mailSaveBytes(result) > MAIL_LIMITS.saveBytes) result.messages.shift();
  return result;
}
