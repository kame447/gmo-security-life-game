/**
 * ストーリーで使う人生イベント（docs/features/story.md）。仕組みは events/ の人生イベント基盤を使う。
 * きっかけ（trigger.eventKey）は 'story.*' でマップ上の NPC には付いておらず、StoryDirector が begin() で始める。
 *
 * 自転車の購入は SEC-002（偽通販サイト）を題材にした序章の必須イベント（利用者の指示による提案・合意待ち）。
 * 中学・高校の強制イベントの内容と、stat の名前（study・club など）は仮で、採用は未決定。
 */
import type { LifeEventDef } from '../events/life-events';
import { STORY_BIKE, STORY_MOTHER_NAME } from './config';

const yen = (value: number) => `${value.toLocaleString('ja-JP')}えん`;

export const STORY_EVENTS: readonly LifeEventDef[] = [
  {
    id: STORY_BIKE.eventId,
    title: 'スマホで じてんしゃを かう',
    category: 'security',
    trigger: { eventKey: 'story.bike-purchase' },
    speaker: STORY_MOTHER_NAME,
    intro: [
      'おつかい ありがとう！ これで まちの ことは だいたい わかったね。',
      `ちゅうがくの つうがくに じてんしゃが いるでしょう。よさんは ${yen(STORY_BIKE.budgetYen)}。さっきの スマホの つうはんで、じぶんで えらんで かってごらん。`,
      'スマホで しらべると、おなじ じてんしゃを うっている サイトが 3つ みつかった。',
      `A：はやて サイクル　${yen(STORY_BIKE.fairPriceYen)}（かいしゃの じゅうしょ・でんわばんごう あり）`,
      'B：まちかど バイク　24,800えん（よさんオーバー）',
      `C：スーパー激安セール　${yen(STORY_BIKE.fakePriceYen)}（いまだけ 50%オフ！ れんらくさきは メールだけ）`,
    ],
    prompt: 'どの サイトで かう？',
    choices: [
      {
        id: 'site-a', label: `A：はやて サイクル（${yen(STORY_BIKE.fairPriceYen)}）`,
        result: ['かいしゃの じゅうしょと でんわばんごうを たしかめてから、ちゅうもんした。', `おつりは ${yen(STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen)}。`],
        effects: [{ kind: 'flag', flag: 'story.bike-checked-company' }],
      },
      {
        id: 'site-b', label: 'B：まちかど バイク（24,800えん）',
        result: ['よさんが たりなくて かえなかった。', 'A の サイトの かいしゃじょうほうを たしかめて、A で ちゅうもんした。'],
        effects: [{ kind: 'flag', flag: 'story.bike-checked-company' }],
      },
      {
        id: STORY_BIKE.fakeChoiceId, label: `C：スーパー激安セール（${yen(STORY_BIKE.fakePriceYen)}）`,
        result: ['やすい！ すぐに ちゅうもんして、だいきんを ふりこんだ。', '……なんにち たっても、じてんしゃは とどかない。メールを おくっても へんじが こない。'],
        effects: [{ kind: 'flag', flag: 'story.bike-fake-site' }],
      },
    ],
  },
  // 中学（仮）
  {
    id: 'story.jh.entrance', title: 'ちゅうがくの にゅうがくしき', category: 'daily',
    trigger: { eventKey: 'story.jh.entrance' }, speaker: 'こうちょうせんせい',
    intro: ['しんにゅうせいの みなさん、にゅうがく おめでとう。', 'あたらしい ともだちと、たくさんの ことを まなんでください。'],
  },
  {
    id: 'story.jh.club', title: 'ぶかつを きめる', category: 'daily',
    trigger: { eventKey: 'story.jh.club' }, speaker: 'たんにんの せんせい',
    intro: ['きょうは ぶかつの にゅうぶとどけを だす ひだよ。'],
    prompt: 'どの ぶかつに はいる？',
    choices: [
      { id: 'sports', label: 'うんどうぶ', result: ['まいにち くたくたに なるまで れんしゅうした。からだが じょうぶに なった きがする。'], effects: [{ kind: 'stat', stat: 'fitness', add: 1 }] },
      { id: 'culture', label: 'ぶんかぶ', result: ['すきな ことを とことん ほりさげる なかまが できた。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'none', label: 'きたくぶ', result: ['ほうかごは じぶんの じかん。まちを たんけんする じかんが ふえた。'] },
    ],
  },
  {
    id: 'story.jh.exam', title: 'きまつテスト', category: 'daily',
    trigger: { eventKey: 'story.jh.exam' }, speaker: 'たんにんの せんせい',
    intro: ['らいしゅうは きまつテストです。しっかり じゅんびしてね。'],
    prompt: 'テストまでの 1しゅうかん、どうする？',
    choices: [
      { id: 'study', label: 'まいにち こつこつ べんきょう', result: ['テストは まずまずの できだった。こつこつ やると ちがうね。'], effects: [{ kind: 'stat', stat: 'study', add: 1 }] },
      { id: 'cram', label: 'まえの ひに いちやづけ', result: ['ねむくて あたまが まわらなかった……。'] },
    ],
  },
  // 高校（仮）
  {
    id: 'story.hs.entrance', title: 'こうこうの にゅうがくしき', category: 'daily',
    trigger: { eventKey: 'story.hs.entrance' }, speaker: 'こうちょうせんせい',
    intro: ['にゅうがく おめでとう。こうこうの 3ねんかんは あっというまです。', 'じぶんが なにを したいのか、かんがえながら すごしてください。'],
  },
  {
    id: 'story.hs.festival', title: 'ぶんかさいの だしもの', category: 'daily',
    trigger: { eventKey: 'story.hs.festival' }, speaker: 'クラスの いいんちょう',
    intro: ['ぶんかさいの だしもの、なにが いいと おもう？'],
    prompt: 'なにを ていあんする？',
    choices: [
      { id: 'cafe', label: 'きっさてん', result: ['クラスの みんなで エプロンを そろえて、きっさてんは だいせいきょう！'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'play', label: 'げき', result: ['セリフを おぼえるのは たいへんだったけど、さいごは おおきな はくしゅを もらった。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'quiet', label: 'みんなに まかせる', result: ['まかせた だしものも たのしかった。でも、すこし ものたりない きもちも のこった。'] },
    ],
  },
  {
    id: 'story.hs.career', title: 'しんろの そうだん', category: 'daily',
    trigger: { eventKey: 'story.hs.career' }, speaker: 'たんにんの せんせい',
    intro: ['そろそろ そつぎょうごの しんろを きめる じきだね。'],
    prompt: 'そつぎょうしたら どうする？',
    choices: [
      { id: 'university', label: 'だいがくに しんがく', result: ['じゅけんべんきょうを はじめることに した。'], effects: [{ kind: 'flag', flag: 'story.career-university' }] },
      { id: 'work', label: 'しゅうしょく', result: ['はやく はたらいて、じぶんの ちからで くらしたい。'], effects: [{ kind: 'flag', flag: 'story.career-work' }] },
    ],
  },
];
