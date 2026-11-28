/**
 * 幼少期の仮サンプル（イベント基盤の動作確認用）。採用・年代・数値は未決定。
 * SEC-001〜015 の採用を決めるものではない。docs/events/ の候補とも別扱い。
 *
 * stat 'friendship'（交友）は仮の名前で、値の範囲や使い道は未決定。
 */
import type { LifeEventDef } from '../life-events';

export const CHILDHOOD_SAMPLE_EVENTS: readonly LifeEventDef[] = [
  {
    id: 'sample.park-play',
    title: '公園で何をして遊ぶ？',
    category: 'daily',
    trigger: { eventKey: 'park.friend' },
    intro: ['あ、来た来た！ 一緒に遊ぼう！'],
    prompt: '何をして遊ぶ？',
    choices: [
      {
        id: 'tag', label: '鬼ごっこ',
        result: ['待て待て〜！ たくさん走って、くたくたになった。', '友達ともっと仲良くなれた気がする。'],
        effects: [{ kind: 'stat', stat: 'friendship', add: 1 }],
      },
      {
        id: 'sandbox', label: '砂場でお城作り',
        result: ['二人で大きなお城を作った。', '「明日も続きをしようね！」'],
        effects: [{ kind: 'stat', stat: 'friendship', add: 1 }],
      },
      {
        id: 'go-home', label: '今日は帰る',
        result: ['「そっか、また今度ね！」', '友達は少し残念そうだった。'],
      },
    ],
  },
  {
    id: 'sample.tablet-ad',
    title: 'タブレットの「おめでとう！」',
    category: 'security',
    trigger: { eventKey: 'home.tablet' },
    intro: [
      'タブレットで動画を見ていたら、画面が切り替わった。',
      '「おめでとう！ あなたが100万人目！ ここをタップしてプレゼントをもらおう！」',
    ],
    prompt: 'どうする？',
    choices: [
      {
        id: 'ask-parent', label: 'お母さんに聞く',
        result: ['「これは人をだまそうとする広告かもしれないね。」', '「教えてくれてありがとう。」'],
        effects: [{ kind: 'flag', flag: 'asked-adult-about-ad' }],
      },
      {
        id: 'tap', label: 'タップしてみる',
        result: ['「名前と住所を入れてね」と出てきた。', 'なんだか怖くなって、画面を閉じた。'],
        effects: [{ kind: 'flag', flag: 'tapped-suspicious-ad' }],
      },
      {
        id: 'close', label: '閉じて動画を見る',
        result: ['広告を閉じて、動画の続きを見た。'],
      },
    ],
  },
  // 過去の選択で台詞が変わる例（選択肢なしの追いかけ会話）。
  {
    id: 'sample.tablet-ad-followup-tapped',
    title: 'お母さんとの話（タップした）',
    category: 'security',
    trigger: { eventKey: 'home.mother' },
    when: [{ kind: 'chose', eventId: 'sample.tablet-ad', choiceId: 'tap' }],
    intro: [
      'さっきタブレットで何かあった？',
      '「名前や住所を入れて」と出たら、入れる前に教えてね。',
      '教えてくれたら、一緒に確かめるからね。',
    ],
  },
  {
    id: 'sample.tablet-ad-followup-asked',
    title: 'お母さんとの話（聞いた）',
    category: 'security',
    trigger: { eventKey: 'home.mother' },
    when: [{ kind: 'chose', eventId: 'sample.tablet-ad', choiceId: 'ask-parent' }],
    intro: ['さっきは聞いてくれて助かったよ。', '変だなと思ったら、またいつでも聞いてね。'],
  },
];
