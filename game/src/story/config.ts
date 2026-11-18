/**
 * ストーリーの流れのデータ（docs/features/story.md）。
 * 時間・金額・行き先・ステージの区切りはすべて試作の仮値で、確定した仕様ではない。
 * 進行処理（director.ts）には個別の行き先やステージの分岐を書かず、ここのデータだけを読む。
 */
import type { SpawnPoint } from '../core/types';

/** 新しく始めたとき・ステージが始まるときの位置：2階の自室、ベッドの横。 */
export const STORY_BEDROOM: Readonly<SpawnPoint> = { areaId: 'home-family-2f', x: 3, y: 2, facing: 'down' };

/** 序章で、母親と話す前は通れない出入口（玄関）。 */
export const STORY_HOME_EXIT_PORTAL = 'home-exit';

/** 母親（1階）の eventKey。スマホを渡す・お使いを頼む・自転車の購入を始める相手。 */
export const STORY_MOTHER_KEY = 'home.mother';
export const STORY_MOTHER_NAME = 'おかあさん';
export const STORY_SELF_NAME = 'じぶん';

export interface StoryErrand {
  id: string;
  /** 案内に出す行き先の名前。 */
  place: string;
  /** 話しかける相手（既存の NPC の eventKey）。 */
  eventKey: string;
  speaker: string;
  lines: readonly string[];
  /** 用事で受け取る品（data/items.ts の id）。所持できないときは受け取らずに達成とする。 */
  item?: string;
}

/** お使いの行き先（仮）。順番は自由。 */
export const STORY_ERRANDS: readonly StoryErrand[] = [
  { id: 'school', place: 'がっこうの せんせい', eventKey: 'school.teacher', speaker: 'せんせい',
    lines: ['あら、おかあさんからの プリントね。とどけてくれて ありがとう。', 'あたらしい がっこうせいかつ、たのしみだね。'] },
  { id: 'konbini', place: 'コンビニの てんいんさん', eventKey: 'shopping.konbini.clerk', speaker: 'てんいんさん', item: 'bread',
    lines: ['いらっしゃいませ。おかあさんが よやくしていた パンですね。', 'はい、どうぞ。いつも ありがとうございます。'] },
  { id: 'park', place: 'こうえんの ともだち', eventKey: 'park.friend', speaker: 'ともだち',
    lines: ['おっ、きたきた！ あしたの あつまる じかん？', 'わかった、9じに えきまえね！ つたえてくれて ありがと。'] },
  { id: 'station', place: 'えきまえの えきいんさん', eventKey: 'station.staff', speaker: 'えきいんさん',
    lines: ['じこくひょうを とりにきたのかな？ はい、どうぞ。', 'でんしゃを つかえば、となりまちにも いけるよ。'] },
];

/** 自転車の購入（SEC-002 を題材にした序章の必須イベント）。金額は仮値（円）。 */
export const STORY_BIKE = {
  eventId: 'story.bike-purchase',
  /** 母親から預かる予算。 */
  budgetYen: 20_000,
  /** 正規のサイトの値段（所持金ぎりぎり）。 */
  fairPriceYen: 19_800,
  /** 偽サイトのセール価格（支払っても届かない）。 */
  fakePriceYen: 12_800,
  /** 偽サイトを選んだ選択肢の id。 */
  fakeChoiceId: 'site-c',
} as const;

export type ForcedTrigger =
  /** ステージの経過時間（秒）がこの値になったとき、その場で始まる。 */
  | { kind: 'time'; atSeconds: number }
  /** このエリアに入ったとき始まる。 */
  | { kind: 'area'; areaId: string; place: string };

export interface StoryForcedEvent {
  /** events.ts の人生イベントの id。 */
  eventId: string;
  trigger: ForcedTrigger;
}

export interface StoryStage {
  id: string;
  /** 画面に出すステージ名。 */
  name: string;
  /** 制限時間（秒、探索中だけ進む）。仮値。 */
  limitSeconds: number;
  /** 残りがこの秒数以下になったら知らせる。 */
  warnSeconds: number;
  /** ステージの始まりに出す台詞。 */
  intro: readonly string[];
  forced: readonly StoryForcedEvent[];
  /** 時間切れ後、強制イベントを消化したあとの節目の台詞（卒業など）。 */
  milestone: readonly string[];
}

/** ステージの一覧（仮）。高校以降の区切りは未決定のため、中学・高校の2つだけを置く。 */
export const STORY_STAGES: readonly StoryStage[] = [
  {
    id: 'junior-high', name: 'ちゅうがく', limitSeconds: 180, warnSeconds: 30,
    intro: ['ちゅうがくせいの まいにちが はじまった。', 'じかんが たつと、つぎの ステージへ すすむよ。まちを まわって、いろいろな できごとを けいけんしよう。'],
    forced: [
      { eventId: 'story.jh.entrance', trigger: { kind: 'time', atSeconds: 0 } },
      { eventId: 'story.jh.club', trigger: { kind: 'area', areaId: 'school-classroom-interior', place: 'がっこうの きょうしつ' } },
      { eventId: 'story.jh.exam', trigger: { kind: 'time', atSeconds: 120 } },
    ],
    milestone: ['……そして、そつぎょうしきの ひ。', 'ちゅうがくを そつぎょうした！ はるからは こうこうせいだ。'],
  },
  {
    id: 'high-school', name: 'こうこう', limitSeconds: 180, warnSeconds: 30,
    intro: ['こうこうせいの まいにちが はじまった。'],
    forced: [
      { eventId: 'story.hs.entrance', trigger: { kind: 'time', atSeconds: 0 } },
      { eventId: 'story.hs.festival', trigger: { kind: 'time', atSeconds: 60 } },
      { eventId: 'story.hs.career', trigger: { kind: 'time', atSeconds: 130 } },
    ],
    milestone: ['……そして、そつぎょうしきの ひ。', 'こうこうを そつぎょうした！', 'このさきの ステージは じゅんびちゅう。しばらく まちを じゆうに あるいてね。'],
  },
];
