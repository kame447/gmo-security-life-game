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
    title: 'こうえんで なにして あそぶ？',
    category: 'daily',
    trigger: { eventKey: 'park.friend' },
    intro: ['あ、きたきた！ いっしょに あそぼう！'],
    prompt: 'なにして あそぶ？',
    choices: [
      {
        id: 'tag', label: 'おにごっこ',
        result: ['まてまて〜！ いっぱい はしって、くたくたに なった。', 'ともだちと もっと なかよく なれた きがする。'],
        effects: [{ kind: 'stat', stat: 'friendship', add: 1 }],
      },
      {
        id: 'sandbox', label: 'すなばで おしろづくり',
        result: ['ふたりで おおきな おしろを つくった。', '「あしたも つづきを しようね！」'],
        effects: [{ kind: 'stat', stat: 'friendship', add: 1 }],
      },
      {
        id: 'go-home', label: 'きょうは かえる',
        result: ['「そっか、また こんどね！」', 'ともだちは ちょっと ざんねんそうだった。'],
      },
    ],
  },
  {
    id: 'sample.tablet-ad',
    title: 'タブレットの「おめでとう！」',
    category: 'security',
    trigger: { eventKey: 'home.tablet' },
    intro: [
      'タブレットで どうがを みていたら、がめんが きりかわった。',
      '「おめでとう！ あなたが 100まんにんめ！ ここを タップして プレゼントを もらおう！」',
    ],
    prompt: 'どうする？',
    choices: [
      {
        id: 'ask-parent', label: 'おかあさんに きく',
        result: ['「これは ひとを だまそうとする こうこく かもしれないね。」', '「おしえてくれて ありがとう。」'],
        effects: [{ kind: 'flag', flag: 'asked-adult-about-ad' }],
      },
      {
        id: 'tap', label: 'タップしてみる',
        result: ['「なまえと じゅうしょを いれてね」と でてきた。', 'なんだか こわくなって、がめんを とじた。'],
        effects: [{ kind: 'flag', flag: 'tapped-suspicious-ad' }],
      },
      {
        id: 'close', label: 'とじて どうがを みる',
        result: ['こうこくを とじて、どうがの つづきを みた。'],
      },
    ],
  },
  // 過去の選択で台詞が変わる例（選択肢なしの追いかけ会話）。
  {
    id: 'sample.tablet-ad-followup-tapped',
    title: 'おかあさんとの はなし（タップした）',
    category: 'security',
    trigger: { eventKey: 'home.mother' },
    when: [{ kind: 'chose', eventId: 'sample.tablet-ad', choiceId: 'tap' }],
    intro: [
      'さっき タブレット、なにか あった？',
      '「なまえや じゅうしょを いれて」って でたら、いれる まえに おしえてね。',
      'おしえてくれたら、いっしょに たしかめるからね。',
    ],
  },
  {
    id: 'sample.tablet-ad-followup-asked',
    title: 'おかあさんとの はなし（きいた）',
    category: 'security',
    trigger: { eventKey: 'home.mother' },
    when: [{ kind: 'chose', eventId: 'sample.tablet-ad', choiceId: 'ask-parent' }],
    intro: ['さっきは きいてくれて たすかったよ。', 'へんだな と おもったら、また いつでも きいてね。'],
  },
];
