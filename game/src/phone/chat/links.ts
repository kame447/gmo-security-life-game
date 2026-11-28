import { WEB_PROTOTYPE } from '../../data/web-prototype';
import { CHAT_SELF, type ChatMessage } from './types';

export interface ChatWebLink { label: string; href: string }

/** Only a received, literal URL for a page bundled with the game becomes a button. */
export function chatWebLinks(message: Pick<ChatMessage, 'from' | 'text'>): ChatWebLink[] {
  if (message.from === CHAT_SELF) return [];
  const addresses = new Set(message.text.match(/https:\/\/[^\s<>「」『』（）]+/g) ?? []);
  return WEB_PROTOTYPE.pages.filter(page => addresses.has(page.address))
    .map(page => ({ label: page.site ?? page.title, href: page.address }));
}
