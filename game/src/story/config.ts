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
/** お使いを終えたあとミニマップで示す自宅の施設。 */
export const STORY_HOME_FACILITY = 'home-family';

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
  /** ミニマップに印を出す施設（world/town.ts の FACILITIES の id）。 */
  facilityId: string;
  speaker: string;
  lines: readonly string[];
  /** 用事で受け取る品（data/items.ts の id）。所持できないときは受け取らずに達成とする。 */
  item?: string;
  /**
   * 店員から始める買い物の画面（docs/features/shopping.md）で買う品。持ち物に入ったら達成とする。
   * 所持金が足りないときは、lines の会話で品をもらって達成とし、行き止まりにしない。
   */
  buy?: { itemId: string; catalogId: string; done: readonly string[] };
}

/** お使いの始めに母親から預かるお金（円、仮値）。買う用事の代金にあてる。 */
export const STORY_ERRAND_ALLOWANCE_YEN = 200;

/** お使いの行き先（仮）。順番は自由。 */
export const STORY_ERRANDS: readonly StoryErrand[] = [
  { id: 'school', place: 'がっこうの せんせい', eventKey: 'school.teacher', facilityId: 'school', speaker: 'せんせい',
    lines: ['あら、おかあさんからの プリントね。とどけてくれて ありがとう。', 'あたらしい がっこうせいかつ、たのしみだね。'] },
  { id: 'konbini', place: 'コンビニで ノートを かう', eventKey: 'shopping.konbini.clerk', facilityId: 'shop-konbini', speaker: 'てんいんさん',
    buy: { itemId: 'notebook', catalogId: 'konbini', done: ['ノートを かえた！ これで コンビニの おつかいは おわり。'] },
    lines: ['いらっしゃいませ。おつかい？ えらいね。', 'おかねが たりない？ じゃあ ノートは おまけしておくね。こんどから きをつけてね。'] },
  { id: 'park', place: 'こうえんの ともだち', eventKey: 'park.friend', facilityId: 'park', speaker: 'ともだち',
    lines: ['おっ、きたきた！ あしたの あつまる じかん？', 'わかった、9じに えきまえね！ つたえてくれて ありがと。'] },
  { id: 'station', place: 'えきまえの えきいんさん', eventKey: 'station.staff', facilityId: 'station', speaker: 'えきいんさん',
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

/** その場にいない相手からの知らせ。atAreas の外で始まるときは、スマホに届いたメールとして見せる。 */
export interface StoryMail {
  /** 差出人（会話欄の名前に「メール：」を付けて出す）。 */
  from: string;
  /** 相手が実際にいる場所。ここで始まったときはメールにせず、その場の会話にする。 */
  atAreas: readonly string[];
}

/** その場所でしか起きない出来事。時刻になってもそこにいなければ、メールで呼ばれ、着いたときに始まる。 */
export interface StoryVenue {
  areas: readonly string[];
  /** 案内に出す場所の名前。 */
  place: string;
  /** 呼び出しのメールの差出人と本文。 */
  from: string;
  call: string;
}

export interface StoryForcedEvent {
  /** events.ts の人生イベントの id。 */
  eventId: string;
  trigger: ForcedTrigger;
  mail?: StoryMail;
  venue?: StoryVenue;
}

/** 学校の中（先生・同級生がいる場所）。 */
const AT_SCHOOL = ['school-classroom-interior'] as const;
const fromSchool = (from: string): StoryMail => ({ from, atAreas: AT_SCHOOL });
/** 入学式・試験・進路の相談など、学校で行う行事。 */
const atSchool = (from: string, call: string): StoryVenue => ({ areas: AT_SCHOOL, place: 'がっこうの きょうしつ', from, call });

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
      { eventId: 'story.jh.entrance', trigger: { kind: 'time', atSeconds: 0 }, venue: atSchool('ちゅうがっこう', 'にゅうがくしきを おこないます。がっこうの きょうしつに きてください。') },
      { eventId: 'story.jh.club', trigger: { kind: 'area', areaId: 'school-classroom-interior', place: 'がっこうの きょうしつ' } },
      { eventId: 'story.jh.exam', trigger: { kind: 'time', atSeconds: 120 }, venue: atSchool('たんにんの せんせい', 'きまつテストの おしらせが あります。がっこうの きょうしつに きてください。') },
    ],
    milestone: ['……そして、そつぎょうしきの ひ。', 'ちゅうがくを そつぎょうした！ はるからは こうこうせいだ。'],
  },
  {
    id: 'high-school', name: 'こうこう', limitSeconds: 180, warnSeconds: 30,
    intro: ['こうこうせいの まいにちが はじまった。'],
    forced: [
      { eventId: 'story.hs.entrance', trigger: { kind: 'time', atSeconds: 0 }, venue: atSchool('こうこう', 'にゅうがくしきを おこないます。がっこうの きょうしつに きてください。') },
      { eventId: 'story.hs.festival', trigger: { kind: 'time', atSeconds: 60 }, mail: fromSchool('クラスの いいんちょう') },
      { eventId: 'story.hs.career', trigger: { kind: 'time', atSeconds: 130 }, venue: atSchool('たんにんの せんせい', 'しんろの そうだんを します。がっこうの きょうしつに きてください。') },
    ],
    milestone: ['……そして、そつぎょうしきの ひ。', 'こうこうを そつぎょうした！', 'このさきの ステージは じゅんびちゅう。しばらく まちを じゆうに あるいてね。'],
  },
];
