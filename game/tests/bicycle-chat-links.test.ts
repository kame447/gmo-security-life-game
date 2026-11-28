import { describe, expect, it } from 'vitest';
import { BICYCLE_CHAT_CONTACT, BICYCLE_CHAT_THREAD, deliverBicycleCandidates } from '../src/app/bicycle-messages';
import { BICYCLE_WEB_OFFERS } from '../src/data/bicycle-web';
import { CHAT_PROTOTYPE } from '../src/data/chat-prototype';
import { ChatModel } from '../src/phone/chat/model';
import { chatWebLinks } from '../src/phone/chat/links';
import { CHAT_LIMITS } from '../src/phone/chat/limits';
import { PHONE_CONTENT } from '../src/phone/content';
import { PhoneModel } from '../src/phone/model';

const phone = (saved?: unknown) => new PhoneModel(PHONE_CONTENT, { initialOwned: true, saved, clock: () => 0, epochClock: () => 1000 });

describe('mother sends three bicycle candidates', () => {
  it('adds one named conversation and three real URL messages without replacing earlier history', () => {
    const model = phone();
    const before = model.chatMessages('friend');
    deliverBicycleCandidates(model, 1000);
    expect(model.chatThreads.find(item => item.id === BICYCLE_CHAT_THREAD)?.contact.name).toBe('お母さん');
    const messages = model.chatMessages(BICYCLE_CHAT_THREAD);
    expect(messages).toHaveLength(4);
    expect(messages.flatMap(chatWebLinks).map(link => link.href)).toEqual(BICYCLE_WEB_OFFERS.map(offer => offer.address));
    expect(messages.every(message => message.from === BICYCLE_CHAT_CONTACT)).toBe(true);
    expect(model.chatMessages('friend')).toEqual(before);
    expect(model.mails.some(mail => mail.id === 'story.bike-shopping')).toBe(false);
  });

  it('retains all candidate links and read state after save/reload without duplicate delivery', () => {
    const first = phone(); deliverBicycleCandidates(first, 1000);
    first.open(); first.launch('messages'); first.openChatThread(BICYCLE_CHAT_THREAD);
    const saved = first.save();
    const next = phone(JSON.parse(JSON.stringify(saved))); deliverBicycleCandidates(next, 2000);
    expect(next.save()).toEqual(saved);
    expect(next.chatMessages(BICYCLE_CHAT_THREAD).flatMap(chatWebLinks)).toHaveLength(3);
  });

  it('returns through shop subpages to the same mother conversation', () => {
    const model = phone(); deliverBicycleCandidates(model);
    model.open(); model.launch('messages'); model.openChatThread(BICYCLE_CHAT_THREAD);
    const message = model.chatMessages(BICYCLE_CHAT_THREAD)[1], offer = BICYCLE_WEB_OFFERS[0];
    expect(model.openChatLink(message.id, offer.address)).toBe(true);
    expect(model.webView).toMatchObject({ kind: 'page', address: offer.address });
    model.webOpen(new URL('/company', offer.address).href);
    model.back(); expect(model.webView).toMatchObject({ kind: 'page', address: offer.address });
    model.back(); expect(model.currentApp?.id).toBe('messages');
    expect(model.currentChatThread).toBe(BICYCLE_CHAT_THREAD);
    expect(model.chatMessages(BICYCLE_CHAT_THREAD)).toHaveLength(4);
  });

  it('refuses another message URL, forged IDs, own text and external destinations', () => {
    const model = phone(); deliverBicycleCandidates(model);
    model.open(); model.launch('messages'); model.openChatThread(BICYCLE_CHAT_THREAD);
    const first = model.chatMessages(BICYCLE_CHAT_THREAD)[1];
    expect(model.openChatLink(first.id, BICYCLE_WEB_OFFERS[1].address)).toBe(false);
    expect(model.openChatLink('missing', BICYCLE_WEB_OFFERS[0].address)).toBe(false);
    expect(model.openChatLink(first.id, 'https://example.com/')).toBe(false);
    const own = model.sendChat(BICYCLE_WEB_OFFERS[0].address);
    expect(own.ok).toBe(true);
    if (own.ok) expect(model.openChatLink(own.message.id, BICYCLE_WEB_OFFERS[0].address)).toBe(false);
    expect(chatWebLinks({ from: 'contact', text: `https://evil.example/?redirect=${BICYCLE_WEB_OFFERS[0].address}` })).toEqual([]);
    model.close(); expect(model.openChatLink(first.id, BICYCLE_WEB_OFFERS[0].address)).toBe(false);
  });

  it('does not retain a chat return target when a new Web visit starts', () => {
    const model = phone(); deliverBicycleCandidates(model);
    model.open(); model.launch('messages'); model.openChatThread(BICYCLE_CHAT_THREAD);
    model.openChatLink('story-bike-candidate-1', BICYCLE_WEB_OFFERS[0].address);
    model.home(); model.launch('web'); model.webOpen(BICYCLE_WEB_OFFERS[1].address); model.back();
    expect(model.currentApp?.id).toBe('web'); expect(model.webView.kind).toBe('home');
  });

  it('does not replace existing contacts or silently evict history when the catalog is full', () => {
    const chat = new ChatModel(CHAT_PROTOTYPE), before = chat.save();
    expect(chat.ensureThread('friend', { id: 'someone-else', name: '別人', icon: 'person' })).toBe(false);
    expect(chat.save()).toEqual(before);
    for (let index = chat.listThreads().length; index < CHAT_LIMITS.threads; index++) {
      expect(chat.ensureThread(`extra-${index}`, { id: `contact-${index}`, name: '連絡先', icon: 'person' })).toBe(true);
    }
    const full = chat.save();
    expect(chat.ensureThread('mother', { id: 'story-mother', name: 'お母さん', icon: 'family' })).toBe(false);
    expect(chat.save()).toEqual(full);
  });
});
