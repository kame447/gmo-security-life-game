import { describe, expect, it } from 'vitest';
import { CHAT_PROTOTYPE } from '../src/data/chat-prototype';
import { chatSaveBytes, parseChatSave } from '../src/phone/chat/codec';
import { CHAT_LIMITS } from '../src/phone/chat/limits';
import { ChatModel } from '../src/phone/chat/model';
import type { ChatSave } from '../src/phone/chat/types';
import { parsePhoneSave } from '../src/phone/save';
import { parseSave } from '../src/state/save';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const chatSeed = () => new ChatModel(CHAT_PROTOTYPE).save();
const phoneSeed = () => ({ v: 1 as const, owned: false, dataBudget: { v: 1 as const, remainingMb: 123, capacityMb: 5000 }, chat: chatSeed() });

describe('bounded shared chat codec', () => {
  it('round-trips history, pending replies, metadata and read state independently of any UI', () => {
    const chat = new ChatModel(CHAT_PROTOTYPE); chat.markRead('friend'); chat.sendMessage('friend', 'またね', 1000); chat.advance(200, 1200);
    const saved = chat.save();
    expect(parseChatSave(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    const phone = { ...phoneSeed(), chat: saved };
    expect(parsePhoneSave(phone, true)).toEqual(phone);
  });

  it.each([undefined, null, [], { v: 99 }, { v: 1, contacts: 'broken', threads: [] }])('initializes missing/broken chat from default data (%j)', raw => {
    expect(parseChatSave(raw)).toEqual(chatSeed());
  });

  it('keeps old phone DTOs compatible and initializes default chat when the model receives no chat', () => {
    const { chat: _chat, ...legacy } = phoneSeed();
    expect(parsePhoneSave(legacy, true)).toEqual(legacy);
    expect(new ChatModel(CHAT_PROTOTYPE, parsePhoneSave(legacy, true).chat).listThreads()).toHaveLength(3);
  });

  it('repairs only chat while preserving ownership, budget, assets and appearance; position repairs independently', () => {
    const world = buildWorld();
    const saved = { ...new Game(world).serialize(), phone: phoneSeed(),
      assets: { moneyYen: 2480, items: [{ itemId: 'small-snack', quantity: 2 }] } };
    const parsed = parseSave({ ...saved, phone: { ...saved.phone, chat: 'broken' } }, world)!;
    expect(parsed).toEqual(saved);
    const moved = parseSave({ ...saved, x: -9999 }, world)!;
    expect(moved.phone).toEqual(saved.phone);
    expect(moved.assets).toEqual(saved.assets);
    expect(moved.appearance).toEqual(saved.appearance);
    expect(moved.x).toBe(new Game(world).player.x);
  });

  it('repairs malformed records without dropping other valid contacts, messages or pending work', () => {
    const saved = chatSeed();
    const friend = saved.threads[0];
    const raw = { ...saved, contacts: [...saved.contacts, saved.contacts[0], { id: 'self', name: 'bad' }],
      threads: [{ ...friend, nextSequence: 0, replyCursor: -1, messages: [
        ...friend.messages,
        { id: 'bad-sender', from: 'unknown', text: 'bad', atMs: 1 },
        { id: 'bad-time', from: friend.contactId, text: 'bad', atMs: Infinity },
        { id: 'local-20', from: friend.contactId, text: 'a\0b\n', atMs: 1, read: 'yes' },
        { id: 'local-20', from: friend.contactId, text: 'duplicate', atMs: 1 },
      ], pending: [{ id: 'reply-1', from: friend.contactId, text: 'reply', remainingMs: -1 },
        { id: 'local-20', from: friend.contactId, text: 'duplicate', remainingMs: 500 }] },
      ...saved.threads.slice(1), { id: 'orphan', contactId: 'unknown' }] };
    const parsed = parseChatSave(raw);
    expect(parsed.contacts).toEqual(saved.contacts);
    expect(parsed.threads).toHaveLength(3);
    expect(parsed.threads[0].messages).toHaveLength(2);
    expect(parsed.threads[0].messages[1]).toMatchObject({ text: 'ab', read: false });
    expect(parsed.threads[0]).toMatchObject({ nextSequence: 21, replyCursor: 0,
      pending: [{ id: 'reply-1', from: friend.contactId, text: 'reply', remainingMs: 0 }] });
    expect(parsed.threads.slice(1)).toEqual(saved.threads.slice(1));
  });

  it('preserves self-contained future NPC metadata without importing a UI or a current scenario catalog', () => {
    const future: ChatSave = { v: 1, contacts: [{ id: 'future-npc', name: '将来の相手', icon: 'person' }], threads: [{
      id: 'npc-event-thread', contactId: 'future-npc', messages: [{ id: 'event-1', from: 'future-npc', text: 'こんにちは', atMs: 10, read: false }],
      pending: [], nextSequence: 1, replyCursor: 0,
    }] };
    expect(parsePhoneSave({ ...phoneSeed(), chat: future }, true).chat).toEqual(future);
    const restored = new ChatModel(CHAT_PROTOTYPE, future);
    expect(restored.listThreads()[0].contact.name).toBe('将来の相手');
    expect(restored.deliverMessage('npc-event-thread', { id: 'event-2', from: 'future-npc', text: 'またね', atMs: 20 }).ok).toBe(true);
    expect(restored.advance(1000, 1000)).toBe(0);
  });

  it('caps per-thread history, contact counts and total UTF-8 save bytes, keeping each thread recent', () => {
    const raw: ChatSave = { v: 1, contacts: [], threads: [] };
    for (let i = 0; i < 30; i++) {
      const id = `contact-${i}`;
      raw.contacts.push({ id, name: '相手', icon: 'person' });
      raw.threads.push({ id: `thread-${i}`, contactId: id, nextSequence: 1, replyCursor: 0, pending: [],
        messages: Array.from({ length: 100 }, (_, j) => ({ id: `message-${j}`, from: id,
          text: '😀'.repeat(500), atMs: j, read: false })) });
    }
    const parsed = parseChatSave(raw);
    expect(parsed.contacts).toHaveLength(CHAT_LIMITS.contacts);
    expect(parsed.threads).toHaveLength(CHAT_LIMITS.threads);
    expect(chatSaveBytes(parsed)).toBeLessThanOrEqual(CHAT_LIMITS.saveBytes);
    expect(parsed.threads.every(thread => thread.messages.length > 0 && thread.messages.length <= CHAT_LIMITS.messagesPerThread)).toBe(true);
    expect(parsed.threads.every(thread => thread.messages.at(-1)?.id === 'message-99')).toBe(true);
    expect(parsed.threads.some(thread => thread.messages.length < CHAT_LIMITS.messagesPerThread)).toBe(true);
    expect(parseChatSave(parsed)).toEqual(parsed);
  });
});
