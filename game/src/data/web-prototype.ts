import type { WebContent } from '../phone/web/types';
import { BICYCLE_WEB_PAGES } from './bicycle-web';

/** Game-only pages on reserved domains; schedules and local businesses remain review proposals. */
export const WEB_PROTOTYPE: WebContent = {
  pages: [
    ...BICYCLE_WEB_PAGES,
    { address: 'https://town-library.example/', title: 'まちの図書館', site: 'まちの図書館', summary: '開館時間と、今月のおはなし会のおしらせ。',
      keywords: ['としょかん', '本', 'ほん', 'library'],
      paragraphs: ['本を開くと、町が少し広くなる。', '開館時間は午前9時から午後5時まで。月曜日は休館です。', '絵本から小説、暮らしの本まで。ふらりと立ち寄って、自分のペースでお過ごしください。'],
      links: [{ label: 'おはなし会のくわしい案内', href: 'https://town-library.example/events' }, { label: '開館時間・館内案内', href: 'https://town-library.example/visit' }] },
    { address: 'https://town-library.example/events', title: 'おはなし会のくわしい案内', site: 'まちの図書館', summary: '土曜日の午前に、絵本の読み聞かせをします。',
      keywords: ['えほん', 'よみきかせ', 'イベント'],
      paragraphs: ['土曜日は、物語に会いに。', '毎週土曜日の午前10時から、2階のおはなしの部屋で絵本の読み聞かせを開きます。', '参加は無料。予約や申し込みは不要です。子どもも大人も、開始時刻に会場へお越しください。'],
      links: [{ label: '図書館のトップへ', href: 'https://town-library.example/' }, { label: '会場・館内案内', href: 'https://town-library.example/visit' }] },
    { address: 'https://town-library.example/visit', title: '開館時間・館内案内', site: 'まちの図書館', summary: '開館時間、休館日、閲覧室とおはなしの部屋のご案内。',
      keywords: ['開館', '休館', '館内', '場所'],
      paragraphs: ['開館時間は9:00〜17:00。月曜日はお休みです。', '1階には貸出カウンターと一般図書、2階には児童書とおはなしの部屋があります。', '閲覧席は自由にご利用いただけます。会場で困ったことがあれば、図書館スタッフへお声がけください。'],
      links: [{ label: '図書館のトップへ', href: 'https://town-library.example/' }, { label: 'おはなし会の案内', href: 'https://town-library.example/events' }] },
    { address: 'https://ekimae-street.example/', title: 'えきまえ商店街', site: 'えきまえ商店街', summary: '駅前の商店街のお店と、週末のおしらせ。',
      keywords: ['しょうてんがい', 'おみせ', 'かいもの', 'パン', '八百屋'],
      paragraphs: ['いつもの道に、今日の寄り道。', '駅の南口からまっすぐ続く通り。パン屋、八百屋、本屋など、暮らしに身近なお店が並びます。'],
      links: [{ label: '週末の花かざり', href: 'https://ekimae-street.example/weekend' }, { label: 'お店の地図', href: 'https://ekimae-street.example/map' }] },
    { address: 'https://ekimae-street.example/weekend', title: '週末の花かざり', site: 'えきまえ商店街', summary: '週末は、商店街の通りに花をかざります。',
      keywords: ['はな', 'しゅうまつ'],
      paragraphs: ['週末の通りに、季節の彩り。', '土曜日と日曜日は、店先に季節の花を飾ります。お買い物やお散歩のついでに、どうぞお立ち寄りください。', '雨の日は軒先へ移して展示します。お花には手を触れず、ゆっくりお楽しみください。'],
      links: [{ label: '商店街のトップへ', href: 'https://ekimae-street.example/' }, { label: 'お店の地図', href: 'https://ekimae-street.example/map' }] },
    { address: 'https://ekimae-street.example/map', title: 'お店の地図', site: 'えきまえ商店街', summary: '駅前から続く商店街のお店をご案内します。',
      keywords: ['地図', 'マップ', '店舗'],
      paragraphs: ['駅の南口を出て、商店街の通りへ。', '八百屋では季節の青果、パン屋では焼きたてのパン、本屋では雑誌や文庫本を扱っています。'],
      links: [{ label: '商店街のトップへ', href: 'https://ekimae-street.example/' }, { label: '週末の花かざり', href: 'https://ekimae-street.example/weekend' }] },
    { address: 'https://town-weather.example/', title: 'まちのてんき', site: 'まちのてんき', summary: '今日と明日の天気。',
      keywords: ['てんき', 'あめ', 'はれ', 'weather'],
      paragraphs: ['今日は、晴れのち曇り。', '明日は、ところにより雨。折り畳み傘があると安心です。'],
      links: [] },
  ],
};
