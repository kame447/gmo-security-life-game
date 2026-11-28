import { BICYCLE_WEB_OFFERS } from '../data/bicycle-web';
import type { WebCommercePort } from '../phone/web/commerce';
import { STORY_BIKE } from '../story/config';
import type { StoryDirector } from '../story/director';
import { newStoryState, type StorySave } from '../story/state';

export function bicycleCommerce(story: StoryDirector | undefined, onOrdered: (label: string) => void): WebCommercePort {
  return {
    quote(address) {
      const offer = BICYCLE_WEB_OFFERS.find(item => item.address === address);
      if (!offer) return null;
      const ready = story?.canOrderBicycle ?? false;
      const withinBudget = offer.priceYen <= STORY_BIKE.budgetYen;
      return { product: '通学用シティサイクル', seller: offer.seller, priceYen: offer.priceYen,
        budgetYen: STORY_BIKE.budgetYen, available: ready && withinBudget,
        message: story?.save().bikeChoice ? '自転車は注文済みです。スマホを閉じて続きを進めよう。'
          : !ready ? 'お使いを終えたら、家のお母さんに相談しよう。'
            : !withinBudget ? 'お母さんからの予算を超えています。ほかのお店も確かめよう。'
              : 'お母さんからの購入予算で注文します。' };
    },
    purchase(address) {
      const offer = BICYCLE_WEB_OFFERS.find(item => item.address === address);
      if (!offer || offer.priceYen > STORY_BIKE.budgetYen || !story?.purchaseBicycle(offer.choiceId)) {
        return { ok: false, message: '注文できませんでした。購入条件を確かめてください。' };
      }
      onOrdered(`${offer.seller}で自転車を注文（${offer.priceYen.toLocaleString('ja-JP')}円）`);
      return { ok: true, message: '注文を受け付けました。スマホを閉じて続きを進めよう。' };
    },
  };
}

/** review=1 の一時セッション用。通常セーブを読み書きしない。 */
export function bicycleReviewState(): StorySave {
  return { ...newStoryState(), phase: 'return-home', bikeOrderReady: true,
    errandsDone: ['school', 'konbini', 'park', 'station'] };
}
