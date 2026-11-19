import type { WebContent } from '../phone/web/types';

/** Review-only pages on reserved hostnames. No adopted facility, event or security scenario. */
export const WEB_PROTOTYPE: WebContent = {
  pages: [
    { address: 'https://town-library.example/', title: 'まちの図書館', summary: '開館時間と、今月のおはなし会のおしらせ。',
      keywords: ['としょかん', '本', 'ほん', 'library'],
      paragraphs: ['開館時間は、午前9時から午後5時までです。', '月曜日はお休みです。'],
      links: [{ label: 'おはなし会のくわしい案内', href: 'https://town-library.example/events' }] },
    { address: 'https://town-library.example/events', title: 'おはなし会のくわしい案内', summary: '土曜日の午前に、絵本の読み聞かせをします。',
      keywords: ['えほん', 'よみきかせ', 'イベント'],
      paragraphs: ['土曜日の午前10時から、2階のおはなしの部屋でひらきます。', 'だれでも参加できます。申し込みはいりません。'],
      links: [{ label: '図書館のトップへ', href: 'https://town-library.example/' }] },
    { address: 'https://ekimae-street.example/', title: 'えきまえ商店街', summary: '駅前の商店街のお店と、週末のおしらせ。',
      keywords: ['しょうてんがい', 'おみせ', 'かいもの', 'パン', '八百屋'],
      paragraphs: ['駅の南口から、まっすぐの通りです。', 'パンや、やおや、ほんやなど、いろいろなお店があります。'],
      links: [
        { label: '週末の花かざり', href: 'https://ekimae-street.example/weekend' },
        { label: 'お店の地図', href: 'https://ekimae-street.example/map' },
      ] },
    { address: 'https://ekimae-street.example/weekend', title: '週末の花かざり', summary: '週末は、商店街の通りに花をかざります。',
      keywords: ['はな', 'しゅうまつ'],
      paragraphs: ['土曜日と日曜日は、通りに花をかざります。', 'お散歩のついでに見に来てください。'],
      links: [{ label: '商店街のトップへ', href: 'https://ekimae-street.example/' }] },
    { address: 'https://town-weather.example/', title: 'まちのてんき', summary: '今日と明日の天気。',
      keywords: ['てんき', 'あめ', 'はれ', 'weather'],
      paragraphs: ['今日は、はれのち くもり。', '明日は、ところにより あめ。かさがあると安心です。'],
      links: [] },
  ],
};
