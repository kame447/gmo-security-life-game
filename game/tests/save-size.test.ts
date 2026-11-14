import { describe, expect, it } from 'vitest';
import { LifeState } from '../src/events/life-state';
import { chatSaveBytes, parseChatSave } from '../src/phone/chat/codec';
import { CHAT_LIMITS } from '../src/phone/chat/limits';
import type { ChatSave } from '../src/phone/chat/types';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

/** Saturate the existing codec, rather than assuming its cap is a reachable size. */
function largeChat(text: string): ChatSave {
  return parseChatSave({
    v: 1,
    contacts: Array.from({ length: CHAT_LIMITS.contacts }, (_, i) => ({ id: `person-${i}`, name: `連絡先${i}`, icon: 'person' })),
    threads: Array.from({ length: CHAT_LIMITS.threads }, (_, i) => ({
      id: `thread-${i}`, contactId: `person-${i}`, nextSequence: 1, replyCursor: 0,
      messages: Array.from({ length: CHAT_LIMITS.messagesPerThread }, (_, n) => ({
        id: `message-${n}`, from: `person-${i}`, text, atMs: n, read: false,
      })),
      pending: Array.from({ length: CHAT_LIMITS.pendingPerThread }, (_, n) => ({
        id: `reply-${n}`, from: `person-${i}`, text, remainingMs: CHAT_LIMITS.replyDelayMs,
      })),
    })),
  });
}

describe('main save size measurements (UTF-8 JSON)', () => {
  it.each(['あ', '😀'])('measures a codec-saturated chat with %s text', character => {
    const game = new Game(buildWorld(), { phoneClock: () => 0, phoneEpochClock: () => 0 });
    const baseline = game.serialize();
    const chat = largeChat(character.repeat(CHAT_LIMITS.textCodePoints));
    const life = new LifeState();
    life.apply([{ kind: 'stat', stat: 'friendship', add: 2 }, { kind: 'flag', flag: 'asked-family' }]);
    life.record('sample.tablet-ad', 'ask-family');
    const data = { ...baseline, phone: { ...baseline.phone!, chat }, life: life.toJSON() };
    const restored = new Game(game.world, { save: data, phoneClock: () => 0, phoneEpochClock: () => 0 }).serialize();
    expect(restored.phone?.chat).toEqual(chat);
    expect(chatSaveBytes(chat)).toBeLessThanOrEqual(CHAT_LIMITS.saveBytes);
    // Reproduces the existing API proposal's mismatch; it does not set a local limit.
    expect(bytes(data)).toBeGreaterThan(128 * 1024);
    console.info(JSON.stringify({ character, baseline: bytes(baseline), chat: bytes(chat), phone: bytes(data.phone),
      life: bytes(data.life), total: bytes(data),
      messages: chat.threads.reduce((sum, thread) => sum + thread.messages.length, 0),
      pending: chat.threads.reduce((sum, thread) => sum + thread.pending.length, 0) }));
  });
});
