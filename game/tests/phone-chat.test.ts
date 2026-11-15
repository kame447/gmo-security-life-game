import { describe, expect, it, vi } from 'vitest';
import { CHAT_PROTOTYPE } from '../src/data/chat-prototype';
import { ChatModel } from '../src/phone/chat/model';
import { CHAT_LIMITS } from '../src/phone/chat/limits';
import { CHAT_SELF, type ChatContent } from '../src/phone/chat/types';

const make = () => new ChatModel(CHAT_PROTOTYPE);
const incoming = (id = 'event-1', text = 'またね') => ({ id, from: 'review-friend', text, atMs: 1000 });

describe('local conversation model', () => {
  it('lists three provisional contacts, latest lines, timestamps and unread counts', () => {
    const list = make().listThreads();
    expect(list.map(thread => thread.contact.name)).toEqual(['友だち', '家族', '知り合い']);
    expect(list.map(thread => thread.unreadCount)).toEqual([1, 1, 0]);
    expect(list[0].lastMessage).toMatchObject({ from: 'review-friend', atMs: 0 });
  });

  it('shows a send synchronously and delivers its fixed reply only after active play time', () => {
    const chat = make();
    const changed = vi.fn(); chat.onChange(changed);
    expect(chat.sendMessage('friend', '散歩してるよ', 1000)).toMatchObject({ ok: true, message: { from: CHAT_SELF, read: true } });
    expect(chat.messages('friend')).toHaveLength(2);
    expect(chat.messages('friend').at(-1)?.text).toBe('散歩してるよ');
    expect(chat.advance(0, 1000)).toBe(0);
    expect(chat.advance(499, 1499)).toBe(0);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(chat.advance(1, 1500)).toBe(1);
    expect(chat.messages('friend').at(-1)).toMatchObject({ from: 'review-friend', text: 'そうなんだ。また話そう！', atMs: 1500, read: false });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('resumes remaining reply delay and script cursor after saving, without offline time', () => {
    const first = make(); first.sendMessage('friend', 'こんにちは', 1000); first.advance(200, 1200);
    const restored = new ChatModel(CHAT_PROTOTYPE, JSON.parse(JSON.stringify(first.save())));
    expect(restored.advance(0, 9_000_000)).toBe(0);
    expect(restored.advance(299, 9_000_299)).toBe(0);
    expect(restored.advance(1, 9_000_300)).toBe(1);
    restored.sendMessage('friend', 'ありがとう', 9_000_400);
    restored.advance(500, 9_000_900);
    expect(restored.messages('friend').at(-1)?.text).toBe('うん、ありがとう。');
  });

  it('has the same fixed replies and remaining delay across different delta partitions', () => {
    const whole = make(); const split = make();
    whole.sendMessage('family', 'いってきます', 0); split.sendMessage('family', 'いってきます', 0);
    whole.advance(500, 500);
    for (let i = 1; i <= 10; i++) split.advance(50, i * 50);
    expect(split.save()).toEqual(whole.save());
  });

  it('accepts future event messages, deduplicates IDs, updates unread and marks only incoming messages read', () => {
    const chat = make();
    chat.markRead('friend'); chat.sendMessage('friend', 'はい', 500);
    expect(chat.deliverMessage('friend', incoming())).toMatchObject({ ok: true });
    expect(chat.listThreads()[0].unreadCount).toBe(1);
    expect(chat.deliverMessage('friend', incoming())).toEqual({ ok: false, reason: 'duplicate-id' });
    expect(chat.deliverMessage('friend', { ...incoming(), id: 'local-2' })).toEqual({ ok: false, reason: 'duplicate-id' });
    expect(chat.markRead('friend')).toBe(1);
    expect(chat.markRead('friend')).toBe(0);
    expect(chat.messages('friend').every(message => message.read)).toBe(true);
    expect(chat.listThreads()[0].lastMessage?.text).toBe('またね');
  });

  it('rejects invalid/unknown sends and senders atomically', () => {
    const chat = make(); const before = chat.save();
    expect(chat.sendMessage('missing', 'a', 1)).toEqual({ ok: false, reason: 'unknown-thread' });
    expect(chat.sendMessage('friend', '\n\0  ', 1)).toEqual({ ok: false, reason: 'empty-text' });
    expect(chat.sendMessage('friend', 'a', NaN)).toEqual({ ok: false, reason: 'invalid-message' });
    expect(chat.deliverMessage('friend', { ...incoming(), from: CHAT_SELF })).toEqual({ ok: false, reason: 'invalid-message' });
    expect(chat.deliverMessage('friend', { ...incoming(), id: '<img>' })).toEqual({ ok: false, reason: 'invalid-message' });
    expect(chat.advance(-1, 1)).toBe(0); expect(chat.advance(Infinity, 1)).toBe(0);
    expect(chat.advance(10, -1)).toBe(0);
    expect(chat.save()).toEqual(before);
  });

  it('keeps HTML literal, strips controls and truncates by Unicode code points', () => {
    const chat = make();
    const literal = '<img src=x onerror=alert(1)>';
    chat.sendMessage('friend', `\0${literal}\n\u0085`, 1);
    expect(chat.messages('friend').at(-1)?.text).toBe(literal);
    chat.sendMessage('friend', '😀'.repeat(400), 2);
    const text = chat.messages('friend').at(-1)!.text;
    expect(Array.from(text)).toHaveLength(CHAT_LIMITS.textCodePoints);
    expect(text).not.toContain('\ufffd');
  });

  it('returns detached snapshots, summaries and operation results', () => {
    const chat = make(); const before = chat.save();
    const saved = chat.save(); saved.contacts[0].name = 'changed'; saved.threads[0].messages.length = 0;
    chat.listThreads()[0].contact.name = 'changed'; chat.messages('friend')[0].text = 'changed';
    expect(chat.save()).toEqual(before);
    const result = chat.sendMessage('friend', 'hello', 1);
    if (result.ok) result.message.text = 'changed';
    expect(chat.messages('friend').at(-1)?.text).toBe('hello');
  });

  it('bounds message history while retaining the newest messages and monotonic local IDs', () => {
    const content = structuredClone(CHAT_PROTOTYPE); content.threads[0].replies = [];
    const chat = new ChatModel(content);
    for (let i = 0; i < 100; i++) chat.sendMessage('friend', `line ${i}`, i);
    expect(chat.messages('friend')).toHaveLength(CHAT_LIMITS.messagesPerThread);
    expect(chat.messages('friend').at(-1)).toMatchObject({ id: 'local-100', text: 'line 99' });
    const restored = new ChatModel(content, chat.save());
    expect(restored.sendMessage('friend', 'next', 101)).toMatchObject({ message: { id: 'local-101' } });
  });

  it('does not partially send if the pending queue or generated ID range is exhausted', () => {
    const content: ChatContent = structuredClone(CHAT_PROTOTYPE);
    content.threads[0].replies = Array.from({ length: 10 }, () => ({ text: '返信', delayMs: 500 }));
    const chat = new ChatModel(content);
    for (let i = 0; i < CHAT_LIMITS.pendingPerThread; i++) expect(chat.sendMessage('friend', 'a', i).ok).toBe(true);
    const before = chat.save();
    expect(chat.sendMessage('friend', 'a', 10)).toEqual({ ok: false, reason: 'queue-full' });
    expect(chat.save()).toEqual(before);
    const saved = make().save(); saved.threads[0].nextSequence = Number.MAX_SAFE_INTEGER;
    const full = new ChatModel(CHAT_PROTOTYPE, saved);
    expect(full.sendMessage('friend', 'a', 10)).toEqual({ ok: false, reason: 'id-exhausted' });
  });

  it('unsubscribes listeners and does not invent replies after the fixed script ends', () => {
    const chat = make(); const listener = vi.fn(); const stop = chat.onChange(listener);
    chat.markRead('friend'); stop(); chat.markRead('family');
    expect(listener).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) { chat.sendMessage('neighbor', 'a', i * 1000); chat.advance(500, i * 1000 + 500); }
    expect(chat.messages('neighbor').filter(message => message.from === 'review-neighbor')).toHaveLength(3);
  });
});
