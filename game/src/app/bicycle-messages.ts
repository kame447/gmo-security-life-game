import { BICYCLE_WEB_OFFERS } from '../data/bicycle-web';
import type { PhoneModel } from '../phone/model';
import { STORY_BIKE } from '../story/config';

export const BICYCLE_CHAT_THREAD = 'mother';
export const BICYCLE_CHAT_CONTACT = 'story-mother';

export function deliverBicycleCandidates(phone: PhoneModel, atMs = Date.now()): void {
  if (!phone.ensureChatThread(BICYCLE_CHAT_THREAD, { id: BICYCLE_CHAT_CONTACT, name: 'お母さん', icon: 'family' })) return;
  const messages = [
    { id: 'story-bike-introduction', text: `通学用の自転車を探して、候補を3つ送っておくね。予算は${STORY_BIKE.budgetYen.toLocaleString('ja-JP')}円。私もまだ詳しく見ていないから、乗りやすさや受け取り方も比べてみて。` },
    ...BICYCLE_WEB_OFFERS.map((offer, index) => ({ id: `story-bike-candidate-${index + 1}`,
      text: `${index + 1}つ目は ${offer.seller}。 ${offer.address}` })),
  ];
  for (const message of messages) phone.deliverChatMessage(BICYCLE_CHAT_THREAD, { ...message, from: BICYCLE_CHAT_CONTACT, atMs });
}
