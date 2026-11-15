import { CHAT_PROTOTYPE } from '../../data/chat-prototype';
import { CHAT_LIMITS } from './limits';
import { CHAT_SELF, type ChatContent, type ChatMessage, type ChatSave, type ChatThreadSave,
  type Contact, type PendingReply } from './types';

const record = (raw: unknown): Record<string, unknown> | undefined =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
const list = (raw: unknown): unknown[] => Array.isArray(raw) ? raw : [];
export const isChatId = (raw: unknown): raw is string =>
  typeof raw === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/.test(raw);
export const isChatTime = (raw: unknown): raw is number =>
  typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0;

/** Keep text literal (including '<' and '>'); DOM consumers must use textContent. */
export function cleanChatText(raw: unknown, limit: number = CHAT_LIMITS.textCodePoints): string {
  if (typeof raw !== 'string') return '';
  const characters: string[] = [];
  for (const character of raw) {
    if (/[\u0000-\u001f\u007f-\u009f]/.test(character)) continue;
    characters.push(character);
    if (characters.length >= limit) break;
  }
  return characters.join('');
}

export function chatSaveBytes(save: ChatSave): number {
  return new TextEncoder().encode(JSON.stringify(save)).length;
}

function defaultRaw(content: ChatContent): ChatSave {
  return { v: 1, contacts: content.contacts, threads: content.threads.map(thread => ({
    id: thread.id, contactId: thread.contactId, messages: thread.initialMessages,
    pending: [], nextSequence: 1, replyCursor: 0,
  })) };
}

/** Clock-free, catalog-independent repair. Unknown future contact IDs remain valid. */
export function parseChatSave(raw: unknown, content: ChatContent = CHAT_PROTOTYPE): ChatSave {
  let source = record(raw);
  if (source?.v !== 1 || !Array.isArray(source.contacts) || !Array.isArray(source.threads)) {
    source = defaultRaw(content) as unknown as Record<string, unknown>;
  }
  const contacts: Contact[] = [];
  const contactIds = new Set<string>();
  for (const candidate of list(source.contacts).slice(0, CHAT_LIMITS.contacts)) {
    const value = record(candidate);
    if (!value || !isChatId(value.id) || value.id === CHAT_SELF || contactIds.has(value.id)) continue;
    const name = cleanChatText(value.name, CHAT_LIMITS.nameCodePoints).trim();
    if (!name) continue;
    contacts.push({ id: value.id, name, icon: isChatId(value.icon) ? value.icon : 'person' });
    contactIds.add(value.id);
  }
  const threads: ChatThreadSave[] = [];
  const threadIds = new Set<string>();
  for (const candidate of list(source.threads).slice(0, CHAT_LIMITS.threads)) {
    const value = record(candidate);
    if (!value || !isChatId(value.id) || threadIds.has(value.id) ||
        typeof value.contactId !== 'string' || !contactIds.has(value.contactId)) continue;
    const messages: ChatMessage[] = [];
    const pending: PendingReply[] = [];
    const ids = new Set<string>();
    const contactId = value.contactId;
    for (const candidate of list(value.messages).slice(-CHAT_LIMITS.messagesPerThread)) {
      const message = record(candidate);
      if (!message || !isChatId(message.id) || ids.has(message.id) || !isChatTime(message.atMs) ||
          (message.from !== CHAT_SELF && message.from !== contactId)) continue;
      const text = cleanChatText(message.text);
      if (!text.trim()) continue;
      messages.push({ id: message.id, from: message.from, text, atMs: message.atMs,
        read: message.from === CHAT_SELF || message.read === true });
      ids.add(message.id);
    }
    for (const candidate of list(value.pending).slice(0, CHAT_LIMITS.pendingPerThread)) {
      const reply = record(candidate);
      if (!reply || !isChatId(reply.id) || ids.has(reply.id) || reply.from !== contactId ||
          typeof reply.remainingMs !== 'number' || !Number.isFinite(reply.remainingMs)) continue;
      const text = cleanChatText(reply.text);
      if (!text.trim()) continue;
      pending.push({ id: reply.id, from: contactId, text,
        remainingMs: Math.min(CHAT_LIMITS.replyDelayMs, Math.max(0, reply.remainingMs)) });
      ids.add(reply.id);
    }
    let nextSequence = isChatTime(value.nextSequence) && value.nextSequence > 0 ? value.nextSequence : 1;
    for (const id of ids) {
      const match = /^local-(\d+)$/.exec(id);
      if (match && isChatTime(Number(match[1]))) {
        nextSequence = Math.max(nextSequence, Math.min(Number.MAX_SAFE_INTEGER, Number(match[1]) + 1));
      }
    }
    threads.push({ id: value.id, contactId, messages, pending, nextSequence,
      replyCursor: isChatTime(value.replyCursor) ? value.replyCursor : 0 });
    threadIds.add(value.id);
  }

  // Include metadata and pending work in the byte budget. Prefer one recent message
  // per thread before taking older messages so a large thread cannot erase the rest.
  const result: ChatSave = { v: 1, contacts, threads: threads.map(thread => ({ ...thread, messages: [], pending: [] })) };
  let bytes = chatSaveBytes(result);
  function add<T extends ChatMessage | PendingReply>(target: T[], value: T, newestFirst = false): void {
    const cost = new TextEncoder().encode(JSON.stringify(value)).length + (target.length ? 1 : 0);
    if (bytes + cost > CHAT_LIMITS.saveBytes) return;
    if (newestFirst) target.unshift(value); else target.push(value);
    bytes += cost;
  }
  for (let depth = 0; depth < CHAT_LIMITS.pendingPerThread; depth++) {
    threads.forEach((thread, i) => { const item = thread.pending[depth]; if (item) add(result.threads[i].pending, item); });
  }
  for (let depth = 0; depth < CHAT_LIMITS.messagesPerThread; depth++) {
    threads.forEach((thread, i) => {
      const item = thread.messages.at(-depth - 1);
      if (item) add(result.threads[i].messages, item, true);
    });
  }
  return result;
}
