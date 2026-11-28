import type { WebPage } from '../phone/web/types';
import { STORY_BIKE } from '../story/config';

/** Names, specifications and prices are game-only review proposals. */
export const BICYCLE_WEB_OFFERS = [
  { choiceId: 'site-a', address: 'https://hayate-cycle.example/bicycle', seller: 'はやてサイクル', priceYen: STORY_BIKE.fairPriceYen },
  { choiceId: 'site-b', address: 'https://machikado-bike.example/bicycle', seller: 'まちかどバイク', priceYen: 24_800 },
  { choiceId: STORY_BIKE.fakeChoiceId, address: 'https://super-cycle-sale.example/bicycle', seller: 'CYCLE SELECT', priceYen: STORY_BIKE.fakePriceYen },
] as const;

export interface BicycleStorefront {
  theme: 'hayate' | 'machikado' | 'select';
  brand: string;
  brandCaption: string;
  campaign: string;
  collection: string;
  productName: string;
  catchline: string;
  description: string;
  colors: readonly { name: string; value: string }[];
  benefits: readonly [string, string, string];
  deliverySummary: string;
  specs: readonly (readonly [string, string])[];
  company: readonly (readonly [string, string])[];
  delivery: readonly (readonly [string, string])[];
}

export const BICYCLE_STOREFRONTS: readonly BicycleStorefront[] = [
  {
    theme: 'hayate', brand: 'HAYATE', brandCaption: 'CYCLE & EVERYDAY',
    campaign: '組立・点検を済ませて、ご自宅まで。', collection: 'DAILY CITY / 26 INCH',
    productName: 'デイパス 26', catchline: '毎日の道が、少し楽しみになる。',
    description: '教科書を入れたバッグも、帰り道の買い物も。大きめの前かごと、またぎやすいフレームを備えた街乗りの一台。',
    colors: [{ name: 'フォレストグリーン', value: '#386a60' }, { name: 'アイボリー', value: '#d9cdb6' }, { name: 'チャコール', value: '#4b5359' }],
    benefits: ['組立・点検済み', '送料込み', '店舗で修理相談'],
    deliverySummary: 'ご注文から3〜5日で、ご自宅へお届け。',
    specs: [['タイヤサイズ', '26インチ'], ['目安の身長', '145cm〜'], ['変速', '外装6段'], ['ライト', 'ダイナモライト'], ['重量', '約18.0kg'], ['付属品', '前かご・リング錠・泥よけ']],
    company: [['販売事業者', 'はやてサイクル株式会社'], ['運営責任者', '販売担当 田中'], ['所在地', '本町 駅前通り1丁目（ゲーム内）'], ['お問い合わせ', '駅前店舗の窓口 / support@hayate-cycle.example'], ['受付時間', '10:00〜18:00 水曜定休'], ['販売価格', '商品ページの税込価格に表示']],
    delivery: [['お支払い', '代金引換。商品のお届け時にお支払いください。'], ['送料・手数料', '商品価格に含まれます。追加費用はありません。'], ['発送の目安', '点検を済ませて3〜5日でお届けします。'], ['お届けの状態', '組立・ブレーキ調整を完了した状態です。'], ['返品・交換', '初期不良は到着後7日以内に店舗へご連絡ください。'], ['修理の相談', '購入後も駅前店舗で点検・修理を受け付けます。']],
  },
  {
    theme: 'machikado', brand: 'まちかど', brandCaption: 'BICYCLE STORE',
    campaign: '近くのお店で受け取り、そのまま走り出そう。', collection: 'EVERYDAY COMFORT',
    productName: 'ノート 26 オートライト', catchline: '暮らしのそばに、ちょうどいい一台。',
    description: '夕方の帰り道には自動点灯のライト。お店でサドルの高さを合わせてからお渡しする、通学にも使いやすいモデルです。',
    colors: [{ name: 'サンドベージュ', value: '#bc9b76' }, { name: 'セージ', value: '#96aaa0' }, { name: 'ディープブルー', value: '#334e6d' }],
    benefits: ['店舗受け取り', '自動点灯ライト', '初回点検付き'],
    deliverySummary: '3〜7日で店舗へ。受取時に高さを調整します。',
    specs: [['タイヤサイズ', '26インチ'], ['目安の身長', '145cm〜'], ['変速', '外装6段'], ['ライト', 'LEDオートライト'], ['重量', '約18.5kg'], ['付属品', '前かご・リング錠・泥よけ']],
    company: [['販売事業者', 'まちかどバイク'], ['運営責任者', '店舗担当 山本'], ['所在地', '本町 中央通り2丁目（ゲーム内）'], ['お問い合わせ', '店頭窓口 / hello@machikado-bike.example'], ['受付時間', '10:00〜19:00 木曜定休'], ['店舗受取', '中央通り店にてお渡しします。']],
    delivery: [['お支払い', '商品受取時に店頭でお支払いください。'], ['送料・手数料', '店舗での受け取りは無料です。'], ['受取の目安', '3〜7日でご用意。入荷後にご案内します。'], ['お渡し時の点検', '整備担当者がブレーキとサドルの高さを調整します。'], ['返品・交換', '初期不良は受取後7日以内に購入店舗へご相談ください。'], ['アフターサービス', '購入から1か月後の初回点検を含みます。']],
  },
  {
    theme: 'select', brand: 'CYCLE SELECT', brandCaption: 'FIND YOUR EVERYDAY',
    campaign: 'SEASON OFFER — 対象モデルの特別価格', collection: 'CITY COLLECTION / CS-26',
    productName: 'アーバンデイ 26', catchline: '次の毎日へ、軽やかに。',
    description: 'すっきりしたシルエットに、毎日使える装備を。通学にも週末のお出かけにも合わせやすいシティモデル。',
    colors: [{ name: 'インクネイビー', value: '#30455e' }, { name: 'パールホワイト', value: '#e2ded2' }, { name: 'クラウドグレー', value: '#9da5ad' }],
    benefits: ['26インチ', '6段変速', '配送対応'],
    deliverySummary: 'お支払い確認後、順次発送いたします。',
    specs: [['タイヤサイズ', '26インチ'], ['目安の身長', '145cm〜'], ['変速', '外装6段'], ['ライト', 'LEDライト'], ['重量', '約17.8kg'], ['付属品', '前かご・リング錠・泥よけ']],
    company: [['販売事業者', 'セレクトコマース'], ['運営責任者', 'オンライン販売センター'], ['所在地', '倉庫移転中につき掲載を調整しています。'], ['お問い合わせ', 'support@super-cycle-sale.example'], ['電話窓口', '現在メールのみで受け付けています。'], ['振込先の名義', '個人名義の口座をご注文後にメールでご案内します。']],
    delivery: [['お支払い', '銀行振込。注文後のメールに記載する口座へお支払いください。'], ['送料・手数料', '送料込み。振込手数料はお客様のご負担となります。'], ['発送の目安', '入金確認後に順次発送。配送日の指定はできません。'], ['お届けの状態', '組立済みでお届けする予定です。'], ['返品・交換', '特別価格のため、理由を問わず返品・返金を承っておりません。'], ['お問い合わせ', 'メールにて順次回答します。返信日数は指定できません。']],
  },
];

export function bicycleStorefront(address: string): { offer: typeof BICYCLE_WEB_OFFERS[number]; profile: BicycleStorefront; section: 'product' | 'company' | 'delivery' } | null {
  const index = BICYCLE_WEB_OFFERS.findIndex(offer => [offer.address, new URL('/company', offer.address).href, new URL('/delivery', offer.address).href].includes(address));
  if (index < 0) return null;
  return { offer: BICYCLE_WEB_OFFERS[index], profile: BICYCLE_STOREFRONTS[index],
    section: new URL(address).pathname === '/company' ? 'company' : new URL(address).pathname === '/delivery' ? 'delivery' : 'product' };
}

export const BICYCLE_WEB_PAGES: WebPage[] = BICYCLE_WEB_OFFERS.flatMap((offer, index) => {
  const profile = BICYCLE_STOREFRONTS[index], companyAddress = new URL('/company', offer.address).href, deliveryAddress = new URL('/delivery', offer.address).href;
  return [
    { address: offer.address, title: `通学用自転車 ${offer.priceYen.toLocaleString('ja-JP')}円｜${offer.seller}`, site: offer.seller,
      summary: `${profile.productName}。${profile.deliverySummary}`, keywords: ['自転車', 'じてんしゃ', '通販', '通学', 'サイクル', 'bicycle'],
      paragraphs: [profile.catchline, profile.description],
      links: [{ label: '会社案内・特定商取引法に基づく表記', href: companyAddress }, { label: 'お届け・お支払い・返品', href: deliveryAddress }] },
    { address: companyAddress, title: `会社案内｜${offer.seller}`, site: offer.seller, summary: `${offer.seller}の販売者情報と連絡窓口。`,
      keywords: ['会社案内', '連絡先'], paragraphs: profile.company.map(([label, value]) => `${label}：${value}`),
      links: [{ label: '商品ページへ戻る', href: offer.address }, { label: 'お届け・お支払い・返品', href: deliveryAddress }] },
    { address: deliveryAddress, title: `ご利用ガイド｜${offer.seller}`, site: offer.seller, summary: 'お支払いから受け取りまでの流れと返品について。',
      keywords: ['配送', '送料', '返品', '支払い'], paragraphs: profile.delivery.map(([label, value]) => `${label}：${value}`),
      links: [{ label: '商品ページへ戻る', href: offer.address }, { label: '会社案内', href: companyAddress }] },
  ];
});
