import { cleanChatText, isChatId, isChatTime, parseChatSave } from './codec';
import { CHAT_LIMITS } from './limits';
import { CHAT_SELF, type ChatApi, type ChatContent, type ChatMessage, type ChatResult,
  type ChatSave, type ChatThreadSave, type ChatThreadSummary, type IncomingMessage } from './types';

/** Pure local model: no network, global clock, timers, UI selection or input draft. */
export class ChatModel implements ChatApi {
  private state: ChatSave;
  private readonly content: ChatContent;
  private readonly listeners = new Set<() => void>();

  constructor(content: ChatContent, saved?: unknown) {
    this.content = structuredClone(content);
    this.state = parseChatSave(saved, this.content);
  }
  listThreads(): ChatThreadSummary[] {
    return this.state.threads.map(thread => ({
      id: thread.id,
      contact: structuredClone(this.state.contacts.find(contact => contact.id === thread.contactId)!),
      lastMessage: structuredClone(thread.messages.at(-1) ?? null),
      unreadCount: thread.messages.filter(message => message.from !== CHAT_SELF && !message.read).length,
    }));
  }
  messages(threadId: string): ChatMessage[] { return structuredClone(this.thread(threadId)?.messages ?? []); }
  // Fractional countdowns can grow the JSON number representation between visible
  // changes, so enforce the byte budget at export as well as message mutations.
  save(): ChatSave { return parseChatSave(this.state, this.content); }
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private changed(): void { for (const listener of this.listeners) listener(); }
  private thread(id: string): ChatThreadSave | undefined { return this.state.threads.find(thread => thread.id === id); }
  private bounded(): void { this.state = parseChatSave(this.state, this.content); }

  sendMessage(threadId: string, text: string, atMs: number): ChatResult {
    const thread = this.thread(threadId);
    if (!thread) return { ok: false, reason: 'unknown-thread' };
    if (!isChatTime(atMs)) return { ok: false, reason: 'invalid-message' };
    const cleaned = cleanChatText(text);
    if (!cleaned.trim()) return { ok: false, reason: 'empty-text' };
    const reply = this.content.threads.find(item => item.id === threadId && item.contactId === thread.contactId)?.replies[thread.replyCursor];
    const replyText = reply && cleanChatText(reply.text);
    const willReply = !!replyText?.trim();
    if (willReply && thread.pending.length >= CHAT_LIMITS.pendingPerThread) return { ok: false, reason: 'queue-full' };
    const needed = willReply ? 2 : 1;
    if (thread.nextSequence > Number.MAX_SAFE_INTEGER - needed) return { ok: false, reason: 'id-exhausted' };
    const message: ChatMessage = { id: `local-${thread.nextSequence++}`, from: CHAT_SELF, text: cleaned, atMs, read: true };
    thread.messages.push(message);
    if (willReply) {
      thread.pending.push({ id: `local-${thread.nextSequence++}`, from: thread.contactId, text: replyText!,
        remainingMs: typeof reply!.delayMs === 'number' && Number.isFinite(reply!.delayMs)
          ? Math.min(CHAT_LIMITS.replyDelayMs, Math.max(0, reply!.delayMs)) : 0 });
      thread.replyCursor++;
    }
    this.bounded();
    this.changed();
    return { ok: true, message: structuredClone(message) };
  }

  deliverMessage(threadId: string, incoming: IncomingMessage): ChatResult {
    const thread = this.thread(threadId);
    if (!thread) return { ok: false, reason: 'unknown-thread' };
    if (!incoming || !isChatId(incoming.id) || incoming.from !== thread.contactId || !isChatTime(incoming.atMs)) {
      return { ok: false, reason: 'invalid-message' };
    }
    const text = cleanChatText(incoming.text);
    if (!text.trim()) return { ok: false, reason: 'empty-text' };
    if (thread.messages.some(message => message.id === incoming.id) || thread.pending.some(reply => reply.id === incoming.id)) {
      return { ok: false, reason: 'duplicate-id' };
    }
    const message: ChatMessage = { id: incoming.id, from: incoming.from, text, atMs: incoming.atMs, read: false };
    thread.messages.push(message);
    this.bounded();
    this.changed();
    return { ok: true, message: structuredClone(message) };
  }

  advance(elapsedPlayingMs: number, atMs: number): number {
    if (!Number.isFinite(elapsedPlayingMs) || elapsedPlayingMs < 0 || !isChatTime(atMs)) return 0;
    let delivered = 0;
    for (const thread of this.state.threads) {
      const pending = thread.pending;
      thread.pending = [];
      for (const reply of pending) {
        reply.remainingMs = Math.max(0, reply.remainingMs - elapsedPlayingMs);
        if (reply.remainingMs > 0) thread.pending.push(reply);
        else {
          thread.messages.push({ id: reply.id, from: reply.from, text: reply.text, atMs, read: false });
          delivered++;
        }
      }
    }
    if (delivered) { this.bounded(); this.changed(); }
    return delivered;
  }

  markRead(threadId: string): number {
    const thread = this.thread(threadId);
    if (!thread) return 0;
    let count = 0;
    for (const message of thread.messages) {
      if (message.from !== CHAT_SELF && !message.read) { message.read = true; count++; }
    }
    if (count) this.changed();
    return count;
  }
}
