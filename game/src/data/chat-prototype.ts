import type { ChatContent } from '../phone/chat/types';

/** Review-only people, lines and display times. No adopted NPC/event storyline. */
export const CHAT_PROTOTYPE: ChatContent = {
  contacts: [
    { id: 'review-friend', name: '友だち', icon: 'friend' },
    { id: 'review-family', name: '家族', icon: 'family' },
    { id: 'review-neighbor', name: '知り合い', icon: 'neighbor' },
  ],
  threads: [
    { id: 'friend', contactId: 'review-friend', initialMessages: [
      { id: 'friend-1', from: 'review-friend', text: 'こんにちは。今、何してる？', atMs: 0, read: false },
    ], replies: [
      { text: 'そうなんだ。また話そう！', delayMs: 500 },
      { text: 'うん、ありがとう。', delayMs: 500 },
      { text: 'またね！', delayMs: 500 },
    ] },
    { id: 'family', contactId: 'review-family', initialMessages: [
      { id: 'family-1', from: 'review-family', text: '気をつけて行ってきてね。', atMs: 60_000, read: false },
    ], replies: [
      { text: 'いってらっしゃい。', delayMs: 500 },
      { text: 'わかったよ。', delayMs: 500 },
    ] },
    { id: 'neighbor', contactId: 'review-neighbor', initialMessages: [
      { id: 'neighbor-1', from: 'review-neighbor', text: '今日はいい天気だね。', atMs: 120_000, read: true },
    ], replies: [
      { text: 'そうだね。よい一日を。', delayMs: 500 },
      { text: 'また話そうね。', delayMs: 500 },
    ] },
  ],
};
