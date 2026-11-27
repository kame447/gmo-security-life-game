import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_PROTOTYPE } from '../src/data/chat-prototype';
import { ChatModel } from '../src/phone/chat/model';
import { CHAT_SELF } from '../src/phone/chat/types';
import { renderChatMessages } from '../src/ui/phone-chat';
import { shopDom } from './fixtures/shop-review-dom';

function transcript() {
  const { document } = shopDom();
  Object.assign(document, { createDocumentFragment: () => document.createElement('fragment') });
  const scroll = document.createElement('div');
  return {
    scroll,
    render(chat: ChatModel): void {
      renderChatMessages(scroll as unknown as HTMLElement, chat.messages('friend').map(message => ({
        id: message.id, text: message.text, time: String(message.atMs), outgoing: message.from === CHAT_SELF,
      })));
    },
    receipts: () => scroll.querySelectorAll('.phone-chat-message')
      .filter(row => row.querySelector('.phone-chat-read-receipt'))
      .map(row => row.dataset.chatMessage),
  };
}

function send(chat: ChatModel, text: string, atMs: number): string {
  const sent = chat.sendMessage('friend', text, atMs);
  expect(sent.ok).toBe(true);
  if (!sent.ok) throw new Error(sent.reason);
  return sent.message.id;
}

afterEach(() => vi.unstubAllGlobals());

describe('outgoing chat read receipts', () => {
  it('waits for a reply and does not change the player’s incoming unread state', () => {
    const chat = new ChatModel(CHAT_PROTOTYPE);
    const view = transcript();
    const sent = send(chat, '散歩してるよ', 1000);
    expect(chat.messages('friend').at(-1)?.read).toBe(true);
    view.render(chat);
    expect(view.receipts()).toEqual([]);
    chat.advance(499, 1499);
    view.render(chat);
    expect(view.receipts()).toEqual([]);

    chat.advance(1, 1500);
    const beforeRender = chat.save();
    view.render(chat);
    expect(view.receipts()).toEqual([sent]);
    expect(view.scroll.querySelector('.phone-chat-read-receipt')?.textContent).toBe('既読');
    expect(chat.listThreads()[0].unreadCount).toBe(2);
    expect(chat.save()).toEqual(beforeRender);
    expect(view.scroll.querySelectorAll('.is-incoming').every(row => !row.querySelector('.phone-chat-read-receipt'))).toBe(true);
    chat.markRead('friend');
    view.render(chat);
    expect(view.receipts()).toEqual([sent]);
  });

  it('covers earlier consecutive sends but leaves newer sends without a reply unmarked', () => {
    const content = structuredClone(CHAT_PROTOTYPE);
    content.threads[0].replies = [{ text: 'わかったよ', delayMs: 500 }];
    const chat = new ChatModel(content);
    const view = transcript();
    const first = send(chat, '先に行くね', 2000);
    const second = send(chat, '駅で待ってる', 1000);
    view.render(chat);
    expect(view.receipts()).toEqual([]);
    chat.advance(500, 500);
    view.render(chat);
    expect(view.receipts()).toEqual([first, second]);

    send(chat, '着いたよ', 400);
    chat.advance(60_000, 60_400);
    view.render(chat);
    expect(view.receipts()).toEqual([first, second]);
    expect(chat.messages('friend').at(-1)?.text).toBe('着いたよ');
  });

  it('rebuilds receipts from saved history and waits for the remaining reply delay after reload', () => {
    const chat = new ChatModel(CHAT_PROTOTYPE);
    const first = send(chat, 'こんにちは', 1000);
    chat.advance(500, 1500);
    const second = send(chat, 'ありがとう', 1600);
    chat.advance(200, 1800);
    const saved = JSON.parse(JSON.stringify(chat.save()));
    const restored = new ChatModel(CHAT_PROTOTYPE, saved);
    const view = transcript();
    view.render(restored);
    expect(view.receipts()).toEqual([first]);
    expect(restored.save()).toEqual(saved);
    restored.advance(0, 9_000_000);
    view.render(restored);
    expect(view.receipts()).toEqual([first]);
    restored.advance(300, 9_000_300);
    view.render(restored);
    expect(view.receipts()).toEqual([first, second]);
  });

  it('keeps message text and timestamps literal while adding only outgoing receipts', () => {
    const chat = new ChatModel(CHAT_PROTOTYPE);
    const payload = '<img src=x onerror=alert(1)>';
    const sent = send(chat, payload, 1234);
    chat.deliverMessage('friend', { id: 'event-reply', from: 'review-friend', text: payload, atMs: 2345 });
    const view = transcript();
    view.render(chat);
    expect(view.receipts()).toEqual([sent]);
    const row = view.scroll.querySelectorAll('.phone-chat-message').find(item => item.dataset.chatMessage === sent)!;
    expect(row.querySelector('.phone-chat-bubble')?.textContent).toBe(payload);
    expect(row.querySelector('.phone-chat-message-time')?.textContent).toBe('1234');
    expect(view.scroll.querySelectorAll('img')).toEqual([]);
    expect(view.scroll.querySelectorAll('.is-incoming').every(item => !item.querySelector('.phone-chat-read-receipt'))).toBe(true);
  });
});
