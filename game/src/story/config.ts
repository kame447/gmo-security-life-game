/**
 * ストーリーの流れのデータ（docs/features/story.md）。
 * 金額・行き先・ステージの区切りはすべて試作の仮値で、確定した仕様ではない。
 * 進行処理（director.ts）には個別の行き先やステージの分岐を書かず、ここのデータだけを読む。
 */
import type { SpawnPoint } from '../core/types';

/** 新しく始めたとき・ステージが始まるときの位置：2階の自室、ベッドの横。 */
export const STORY_BEDROOM: Readonly<SpawnPoint> = { areaId: 'home-family-2f', x: 3, y: 2, facing: 'down' };

/** 序章で、母親と話す前は通れない出入口（玄関）。 */
export const STORY_HOME_EXIT_PORTAL = 'home-exit';
/** お使いを終えたあと・節目でミニマップに示す自宅の施設。 */
export const STORY_HOME_FACILITY = 'home-family';
/** 節目を迎えたあと、次のステージへ進むきっかけ（自室のベッド）。 */
export const STORY_BED_KEY = 'home.bed';
/** 次のステージへ進むかを尋ねるイベント（events.ts）。 */
export const STORY_ADVANCE_EVENT = 'story.advance';
export const STORY_ADVANCE_GO = 'go';

/** 母親（1階）の eventKey。スマホを渡す・お使いを頼む・自転車の購入を始める相手。 */
export const STORY_MOTHER_KEY = 'home.mother';
export const STORY_MOTHER_NAME = '母';
export const STORY_SELF_NAME = '自分';

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
  { id: 'school', place: '中学校の先生', eventKey: 'school.teacher', facilityId: 'school', speaker: '先生',
    lines: ['お母さんからのプリントね。届けてくれてありがとう。', '新しい学校生活、楽しみだね。'] },
  { id: 'konbini', place: 'コンビニでノートを買う', eventKey: 'shopping.konbini.clerk', facilityId: 'shop-konbini', speaker: '店員',
    buy: { itemId: 'notebook', catalogId: 'konbini', done: ['ノートを買えた。これでコンビニの用事は終わり。'] },
    lines: ['いらっしゃいませ。おつかい？ えらいね。', 'お金が足りない？ じゃあノートはおまけしておくね。次から気をつけてね。'] },
  { id: 'park', place: '公園の友達', eventKey: 'park.friend', facilityId: 'park', speaker: '友達',
    lines: ['おっ、来た来た！ 明日の集合時間？', 'わかった、9時に駅前ね！ 伝えてくれてありがとう。'] },
  { id: 'station', place: '駅の駅員さん', eventKey: 'station.staff', facilityId: 'station', speaker: '駅員',
    lines: ['時刻表を取りに来たのかな？ はい、どうぞ。', '電車を使えば、隣町にも行けるよ。'] },
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

/** 出来事の起きる場所。 */
export interface StoryPlace {
  /** 案内に出す名前。 */
  name: string;
  /** ここに入ると始まるエリア。 */
  areaIds: readonly string[];
  /** ミニマップに印を出す施設（町の施設 id）。 */
  facilityId?: string;
  /**
   * 専用のマップがまだなく、既存の場所で代用している（仮置き）。
   * 置き換えの作業は docs/features/story.md の「仮置きの場所」に一覧する。
   */
  provisional?: string;
}

/** ストーリーで使う場所。仮置きのものは、専用のマップができたら areaIds を差し替える。 */
export const STORY_PLACES = {
  home: { name: '自宅', areaIds: ['home-family-interior', 'home-family-2f'], facilityId: 'home-family' },
  juniorHigh: { name: '中学校の教室', areaIds: ['school-classroom-interior'], facilityId: 'school' },
  highSchool: { name: '隣町の高校', areaIds: ['town-neighbor'], facilityId: 'station', provisional: '高校の校舎がないため、隣町に着いたら始める' },
  university: { name: '隣町の大学', areaIds: ['town-neighbor'], facilityId: 'station', provisional: '大学がないため、隣町に着いたら始める' },
  office: { name: '隣町の会社', areaIds: ['town-neighbor'], facilityId: 'station', provisional: '会社がないため、隣町に着いたら始める' },
  konbini: { name: 'コンビニ', areaIds: ['shop-konbini-interior'], facilityId: 'shop-konbini' },
  cafe: { name: '喫茶店', areaIds: ['shop-cafe-interior'], facilityId: 'shop-cafe' },
  pharmacy: { name: '薬局', areaIds: ['shop-pharmacy-interior'], facilityId: 'shop-pharmacy', provisional: '病院がないため、くすりやで代用する' },
} as const satisfies Record<string, StoryPlace>;

/** 受信トレイに届ける知らせ（docs/features/phone.md のメール）。アドレスは架空の .example に限る。 */
export interface StoryNotice {
  from: string;
  fromAddress: string;
  subject: string;
  body: string;
  links?: readonly { label: string; href: string }[];
}

export type StoryStepTrigger =
  /** その場所に入ったとき（入っていればすぐ）始まる。 */
  | { kind: 'place'; place: StoryPlace }
  /** 解放されてから、探索中の時間がこの秒数たったとき、その場で始まる（電話・チャットなど）。 */
  | { kind: 'anywhere'; afterSeconds: number };

/** ステージの必須イベント。前の必須イベントを経験すると解放される（定義順）。 */
export interface StoryStep {
  /** events.ts の人生イベントの id。 */
  eventId: string;
  trigger: StoryStepTrigger;
  /** 解放されたとき受信トレイに届く知らせ。 */
  notice?: StoryNotice;
  /** これまでの選択がこのどれかのときだけ起きる（そうでなければ飛ばす）。 */
  when?: { eventId: string; choiceIds: readonly string[] };
}

export interface StoryStage {
  id: string;
  /** 画面に出すステージ名。 */
  name: string;
  /** ステージの始まりに出す台詞。 */
  intro: readonly string[];
  /** ステージの始まりに入る収入（円、仮値）。仕事・年金など。 */
  incomeYen?: number;
  steps: readonly StoryStep[];
  /** 必須イベントをすべて経験したときの台詞（節目の解放）。 */
  unlocked: readonly string[];
  /** ベッドで次へ進むと決めたときの台詞（卒業など）。 */
  milestone: readonly string[];
}

const school = (from: string, subject: string, body: string): StoryNotice =>
  ({ from, fromAddress: 'info@school.example', subject, body });
const office = (from: string, subject: string, body: string): StoryNotice =>
  ({ from, fromAddress: 'soumu@company.example', subject, body });

const UNLOCKED = ['この時期にやるべきことは、ひととおり終わった。', 'まだ町で過ごしてもいいし、自室のベッドで休めば次の時期へ進める。'];

/**
 * ステージの一覧（仮）。区切りは Issue #85 の案（中学 → 高校 → 進学・就職 → 社会人 → 働き盛り → 老後）に沿う。
 * 必須イベントの中身・件数は試作で、採用は未決定。
 */
export const STORY_STAGES: readonly StoryStage[] = [
  {
    id: 'junior-high', name: '中学生',
    intro: ['中学生の毎日が始まった。', '画面の上の案内に、次に起きることが出る。合間は自由に町で過ごしていい。'],
    steps: [
      { eventId: 'story.jh.entrance', trigger: { kind: 'place', place: STORY_PLACES.juniorHigh },
        notice: school('中学校', '入学式のお知らせ', '新入生のみなさん、入学おめでとうございます。\n入学式を行いますので、中学校の教室に来てください。') },
      { eventId: 'story.jh.club', trigger: { kind: 'place', place: STORY_PLACES.juniorHigh } },
      { eventId: 'story.jh.game-account', trigger: { kind: 'anywhere', afterSeconds: 30 } },
      { eventId: 'story.jh.account-recovery', when: { eventId: 'story.jh.game-account', choiceIds: ['tell'] }, trigger: { kind: 'anywhere', afterSeconds: 15 } },
      { eventId: 'story.jh.career', trigger: { kind: 'place', place: STORY_PLACES.juniorHigh },
        notice: school('担任の先生', '進路相談のお知らせ', '3年生になりました。高校の志望校を決める時期です。\n放課後、教室で進路相談をします。') },
      { eventId: 'story.jh.exam', trigger: { kind: 'place', place: STORY_PLACES.highSchool },
        notice: school('担任の先生', '入試の日程', '高校入試の当日です。\n電車で隣町の高校へ向かってください。受験票を忘れずに。') },
    ],
    unlocked: ['合格発表の日。自分の番号があった！', ...UNLOCKED],
    milestone: ['……そして卒業式の日。', '中学校を卒業した。春からは高校生だ。'],
  },
  {
    id: 'high-school', name: '高校生',
    intro: ['高校生活が始まった。これからは電車で隣町まで通う。'],
    steps: [
      { eventId: 'story.hs.entrance', trigger: { kind: 'place', place: STORY_PLACES.highSchool },
        notice: school('高校', '入学式のお知らせ', '入学おめでとうございます。\n入学式を行います。隣町の高校に来てください。') },
      { eventId: 'story.hs.club-sports', when: { eventId: 'story.jh.club', choiceIds: ['sports'] }, trigger: { kind: 'place', place: STORY_PLACES.highSchool } },
      { eventId: 'story.hs.club-culture', when: { eventId: 'story.jh.club', choiceIds: ['culture'] }, trigger: { kind: 'place', place: STORY_PLACES.highSchool } },
      { eventId: 'story.hs.part-time', when: { eventId: 'story.jh.club', choiceIds: ['none'] }, trigger: { kind: 'place', place: STORY_PLACES.konbini } },
      { eventId: 'story.hs.photo', trigger: { kind: 'anywhere', afterSeconds: 30 } },
      { eventId: 'story.hs.photo-followup', when: { eventId: 'story.hs.photo', choiceIds: ['public'] }, trigger: { kind: 'anywhere', afterSeconds: 15 } },
      { eventId: 'story.hs.career', trigger: { kind: 'place', place: STORY_PLACES.highSchool },
        notice: school('担任の先生', '進路希望調査', '卒業後の進路を決める時期です。\n放課後、教室で面談をします。') },
    ],
    unlocked: UNLOCKED,
    milestone: ['……そして卒業式の日。', '高校を卒業した。'],
  },
  {
    id: 'young', name: '進学・就職',
    intro: ['高校を出て、新しい生活が始まった。'],
    steps: [
      { eventId: 'story.young.university', when: { eventId: 'story.hs.career', choiceIds: ['university'] },
        trigger: { kind: 'place', place: STORY_PLACES.university },
        notice: school('大学', '入学ガイダンスのお知らせ', '入学おめでとうございます。\n隣町の大学でガイダンスを行います。') },
      { eventId: 'story.young.first-job', when: { eventId: 'story.hs.career', choiceIds: ['work'] },
        trigger: { kind: 'place', place: STORY_PLACES.office },
        notice: office('総務部', '初出社のご案内', '入社おめでとうございます。\n初日は隣町の本社に来てください。') },
      { eventId: 'story.young.phishing', trigger: { kind: 'anywhere', afterSeconds: 20 },
        notice: { from: 'カード会社 サポート', fromAddress: 'support@card-security-check.example', subject: '【重要】カードの利用を停止しました',
          body: '不正利用の可能性があるため、カードの利用を一時停止しました。\n24時間以内に下のリンクからカード番号と暗証番号を入力し、本人確認をしてください。',
          links: [{ label: '本人確認はこちら', href: 'https://card-security-check.example/login' }] } },
      { eventId: 'story.young.card-fraud', when: { eventId: 'story.young.phishing', choiceIds: ['link'] }, trigger: { kind: 'anywhere', afterSeconds: 15 },
        notice: { from: 'カード会社', fromAddress: 'info@card.example', subject: 'ご利用明細のお知らせ', body: '今月のご利用明細ができました。\nカード会社の公式アプリから確認してください。' } },
      { eventId: 'story.young.job-hunt', when: { eventId: 'story.hs.career', choiceIds: ['university'] },
        trigger: { kind: 'place', place: STORY_PLACES.university } },
      { eventId: 'story.young.work-trouble', when: { eventId: 'story.hs.career', choiceIds: ['work'] },
        trigger: { kind: 'place', place: STORY_PLACES.office } },
    ],
    unlocked: UNLOCKED,
    milestone: ['……数年がたった。', '仕事にも慣れ、一人前の社会人になった。'],
  },
  {
    id: 'adult', name: '社会人', incomeYen: 1_000_000,
    intro: ['社会人としての毎日が続いている。（これまでの給料から、貯金が 1,000,000円 増えた）'],
    steps: [
      { eventId: 'story.adult.usb', trigger: { kind: 'place', place: STORY_PLACES.office },
        notice: office('総務部', '朝礼のお知らせ', '明日の朝礼は本社で行います。遅れないように来てください。') },
      { eventId: 'story.adult.login-alert', trigger: { kind: 'anywhere', afterSeconds: 30 },
        notice: { from: 'まちマーケット', fromAddress: 'no-reply@machi-market.example', subject: '新しい端末からのログイン',
          body: 'あなたのアカウントに、新しい端末からログインがありました。\n心当たりがない場合は、アプリからパスワードを変更してください。' } },
      { eventId: 'story.adult.account-fraud', when: { eventId: 'story.adult.login-alert', choiceIds: ['ignore'] }, trigger: { kind: 'anywhere', afterSeconds: 15 } },
      { eventId: 'story.adult.partner', trigger: { kind: 'place', place: STORY_PLACES.cafe } },
    ],
    unlocked: UNLOCKED,
    milestone: ['……時は流れ、働き盛りの年代になった。'],
  },
  {
    id: 'middle', name: '働き盛り', incomeYen: 1_500_000,
    intro: ['仕事でも家でも、任されることが増えた。（これまでの給料から、貯金が 1,500,000円 増えた）'],
    steps: [
      { eventId: 'story.middle.promotion', when: { eventId: 'story.adult.usb', choiceIds: ['report'] }, trigger: { kind: 'place', place: STORY_PLACES.office } },
      { eventId: 'story.middle.training', when: { eventId: 'story.adult.usb', choiceIds: ['plug'] }, trigger: { kind: 'place', place: STORY_PLACES.office } },
      { eventId: 'story.middle.child-game', when: { eventId: 'story.adult.partner', choiceIds: ['marry'] },
        trigger: { kind: 'place', place: STORY_PLACES.home } },
      { eventId: 'story.middle.hobby', when: { eventId: 'story.adult.partner', choiceIds: ['career'] },
        trigger: { kind: 'place', place: STORY_PLACES.cafe } },
      { eventId: 'story.middle.invoice', trigger: { kind: 'place', place: STORY_PLACES.office },
        notice: office('部下', '振込先の件で相談です', '取引先から「振込先の口座が変わった」とメールが来ました。\n今日中に振り込んでほしいそうです。会社で相談させてください。') },
      { eventId: 'story.middle.invoice-aftermath', when: { eventId: 'story.middle.invoice', choiceIds: ['pay'] }, trigger: { kind: 'place', place: STORY_PLACES.office } },
      { eventId: 'story.middle.parents', trigger: { kind: 'place', place: STORY_PLACES.home } },
    ],
    unlocked: UNLOCKED,
    milestone: ['……そして定年の日。', '長く勤めた会社を退職した。'],
  },
  {
    id: 'senior', name: '老後', incomeYen: 500_000,
    intro: ['仕事を退き、ゆっくりした毎日が始まった。（退職金と年金で、貯金が 500,000円 増えた）'],
    steps: [
      { eventId: 'story.senior.reunion', trigger: { kind: 'place', place: STORY_PLACES.cafe } },
      { eventId: 'story.senior.refund-call', trigger: { kind: 'anywhere', afterSeconds: 30 } },
      { eventId: 'story.senior.refund-aftermath', when: { eventId: 'story.senior.refund-call', choiceIds: ['atm'] }, trigger: { kind: 'anywhere', afterSeconds: 15 } },
      { eventId: 'story.senior.checkup', trigger: { kind: 'place', place: STORY_PLACES.pharmacy } },
      { eventId: 'story.senior.grandchild', trigger: { kind: 'place', place: STORY_PLACES.home } },
    ],
    unlocked: ['やりたかったことは、ひととおりできた。', '自室のベッドで休むと、これまでの人生を振り返る。'],
    milestone: ['……長い人生だった。'],
  },
];
