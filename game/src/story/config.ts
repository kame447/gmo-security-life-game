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

/** ストーリーで使う場所。高校・大学・会社は、隣町の専用屋内に入ってから出来事が始まる（Issue #86）。 */
export const STORY_PLACES = {
  home: { name: '自宅', areaIds: ['home-family-interior', 'home-family-2f'], facilityId: 'home-family' },
  juniorHigh: { name: '中学校の教室', areaIds: ['school-classroom-interior'], facilityId: 'school' },
  highSchool: { name: '隣町の高校', areaIds: ['high-school-interior'], facilityId: 'high-school' },
  university: { name: '隣町の大学', areaIds: ['university-interior'], facilityId: 'university' },
  office: { name: '隣町の会社', areaIds: ['office-interior'], facilityId: 'office' },
  station: { name: '駅', areaIds: ['station-main-interior'], facilityId: 'station' },
  bookstore: { name: '本屋', areaIds: ['shop-bookstore-interior'], facilityId: 'shop-bookstore' },
  konbini: { name: 'コンビニ', areaIds: ['shop-konbini-interior'], facilityId: 'shop-konbini' },
  cafe: { name: '喫茶店', areaIds: ['shop-cafe-interior'], facilityId: 'shop-cafe' },
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
  /** 解放されてから、探索中の時間がこの秒数たったとき、その場で始まる（電話・チャット・通知など）。 */
  | { kind: 'anywhere'; afterSeconds: number };

/** 分岐の条件：これまでの選択（イベント id の選択肢がこのどれか）。all・any で組み合わせられる。 */
export type StoryCondition =
  | { eventId: string; choiceIds: readonly string[] }
  | { all: readonly StoryCondition[] }
  | { any: readonly StoryCondition[] };

/** ステージの必須イベント。前の必須イベントを経験すると解放される（定義順）。 */
export interface StoryStep {
  /** events.ts の人生イベントの id。 */
  eventId: string;
  trigger: StoryStepTrigger;
  /** 解放されたとき受信トレイに届く知らせ。 */
  notice?: StoryNotice;
  /** この条件を満たすときだけ起きる（満たさなければ飛ばす）。前の選択の結果を後で返すのに使う。 */
  when?: StoryCondition;
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
const place = (p: StoryPlace): StoryStepTrigger => ({ kind: 'place', place: p });
const after = (seconds: number): StoryStepTrigger => ({ kind: 'anywhere', afterSeconds: seconds });
const chose = (eventId: string, ...choiceIds: string[]): StoryCondition => ({ eventId, choiceIds });

const UNLOCKED = ['この時期にやるべきことは、ひととおり終わった。', 'まだ町で過ごしてもいいし、自室のベッドで休めば次の時期へ進める。'];

/**
 * ステージの一覧（試作）。区切りはガントチャート（docs/Gantt_chart.png）の「中学 → 高校 → 大学 → 社会人 → 中年・老後」に合わせ、
 * 高校・大学・社会人を重点として出来事を多く置く。
 * セキュリティの出来事は SEC-001〜015（docs/events/security-events.md）をすべて使い、間違えた選択の結果が後の出来事として返る。
 */
export const STORY_STAGES: readonly StoryStage[] = [
  {
    id: 'junior-high', name: '中学生',
    intro: ['中学生の毎日が始まった。', '画面の上の案内に、次に起きることが出る。合間は自由に町で過ごしていい。', '先生や友達に話しかけると、勉強や昼休みの出来事を楽しめる。参加しなくても次の時期へ進めるよ。'],
    steps: [
      { eventId: 'story.jh.entrance', trigger: place(STORY_PLACES.juniorHigh),
        notice: school('中学校', '入学式のお知らせ', '新入生のみなさん、入学おめでとうございます。\n入学式を行いますので、中学校の教室に来てください。') },
      { eventId: 'story.jh.club', trigger: place(STORY_PLACES.juniorHigh) },
      { eventId: 'story.jh.first-account', trigger: after(15) },          // SEC-001・014 の始まり
      { eventId: 'story.jh.app-permission', trigger: after(20) },         // SEC-011
      { eventId: 'story.jh.gift', trigger: place(STORY_PLACES.bookstore) },
      { eventId: 'story.jh.os-update', trigger: after(20) },              // SEC-009
      { eventId: 'story.jh.career', trigger: place(STORY_PLACES.juniorHigh),
        notice: school('担任の先生', '進路相談のお知らせ', '3年生になりました。高校の志望校を決める時期です。\n放課後、教室で進路相談をします。') },
      { eventId: 'story.jh.exam', trigger: place(STORY_PLACES.highSchool),
        notice: school('担任の先生', '入試の日程', '高校入試の当日です。\n電車で隣町の高校へ向かってください。受験票を忘れずに。') },
    ],
    unlocked: ['合格発表の日。自分の番号があった！', ...UNLOCKED],
    milestone: ['……そして卒業式の日。', '中学校を卒業した。春からは高校生だ。'],
  },
  {
    id: 'high-school', name: '高校生',
    intro: ['高校生活が始まった。これからは電車で隣町まで通う。'],
    steps: [
      { eventId: 'story.hs.entrance', trigger: place(STORY_PLACES.highSchool),
        notice: school('高校', '入学式のお知らせ', '入学おめでとうございます。\n入学式を行います。隣町の高校に来てください。') },
      { eventId: 'story.hs.contact-spam', when: chose('story.jh.app-permission', 'allow'), trigger: after(10) },
      { eventId: 'story.hs.phone-hijack', when: chose('story.jh.os-update', 'later'), trigger: after(15) },
      { eventId: 'story.hs.club-sports', when: chose('story.jh.club', 'sports'), trigger: place(STORY_PLACES.highSchool) },
      { eventId: 'story.hs.club-culture', when: chose('story.jh.club', 'culture'), trigger: place(STORY_PLACES.highSchool) },
      { eventId: 'story.hs.part-time', when: chose('story.jh.club', 'none'), trigger: place(STORY_PLACES.konbini) },
      { eventId: 'story.hs.sns-profile', trigger: after(20) },            // SEC-010
      { eventId: 'story.hs.trip', trigger: place(STORY_PLACES.station),
        notice: school('担任の先生', '修学旅行のお知らせ', '修学旅行に出発します。\n当日の朝、町の駅に集合してください。') },
      { eventId: 'story.hs.trip-photo', trigger: after(15) },             // SEC-003
      { eventId: 'story.hs.leak-notice', trigger: after(20),              // SEC-001
        notice: { from: 'ゲームステーション運営', fromAddress: 'no-reply@gamestation.example', subject: '【重要】不正アクセスによるパスワード流出のお知らせ',
          body: '当社のサーバーが不正アクセスを受け、一部のお客様のメールアドレスとパスワードが流出した可能性があります。\nこのメールにリンクはありません。公式アプリの「設定」からパスワードを変更してください。\n同じパスワードを他のサービスで使っている場合は、そちらも変更してください。\n詳しくは公式サイトのお知らせをご覧ください。' } },
      { eventId: 'story.hs.festival', trigger: place(STORY_PLACES.highSchool) },
      { eventId: 'story.hs.photo', trigger: after(15) },                  // SEC-012
      { eventId: 'story.hs.photo-followup', when: chose('story.hs.photo', 'public'), trigger: after(15) },
      { eventId: 'story.hs.study', trigger: place(STORY_PLACES.bookstore) },
      { eventId: 'story.hs.career', trigger: place(STORY_PLACES.highSchool),
        notice: school('担任の先生', '進路希望調査', '大学で何を学ぶか決める時期です。\n放課後、教室で面談をします。') },
    ],
    unlocked: ['大学の合格通知が届いた！', ...UNLOCKED],
    milestone: ['……そして卒業式の日。', '高校を卒業した。春からは大学生だ。'],
  },
  {
    id: 'university', name: '大学生',
    intro: ['大学生活が始まった。自分で決めることが、ぐっと増えた。'],
    steps: [
      { eventId: 'story.univ.entrance', trigger: place(STORY_PLACES.university),
        notice: school('大学', '入学ガイダンスのお知らせ', '入学おめでとうございます。\n隣町の大学でガイダンスを行います。') },
      { eventId: 'story.univ.secret-question', when: chose('story.hs.sns-profile', 'all'), trigger: after(15) },
      { eventId: 'story.univ.living', trigger: place(STORY_PLACES.home) },
      { eventId: 'story.univ.shared-pc', trigger: place(STORY_PLACES.university) },   // SEC-006
      { eventId: 'story.univ.shared-pc-aftermath', when: chose('story.univ.shared-pc', 'leave'), trigger: after(15) },
      { eventId: 'story.univ.part-time', trigger: place(STORY_PLACES.cafe) },
      { eventId: 'story.univ.free-wifi', trigger: after(10) },             // SEC-004
      { eventId: 'story.univ.captcha', trigger: after(20) },               // SEC-005
      { eventId: 'story.univ.pc-infected', when: chose('story.univ.captcha', 'follow'), trigger: after(15) },
      { eventId: 'story.univ.phishing', trigger: after(20),                // SEC-008
        notice: { from: 'カード会社 サポート', fromAddress: 'support@card-security-check.example', subject: '【重要】カードの利用を停止しました',
          body: '不正利用の可能性があるため、カードの利用を一時停止しました。\n24時間以内に下のリンクからカード番号と暗証番号を入力し、本人確認をしてください。',
          links: [{ label: 'https://www.card.example/login', href: 'https://card-security-check.example/login' }] } },
      { eventId: 'story.univ.card-fraud', when: chose('story.univ.phishing', 'link'), trigger: after(15),
        notice: { from: 'カード会社', fromAddress: 'info@card.example', subject: 'ご利用明細のお知らせ', body: '今月のご利用明細ができました。\nカード会社の公式アプリから確認してください。' } },
      { eventId: 'story.univ.footprint', when: chose('story.hs.trip-photo', 'leave'), trigger: place(STORY_PLACES.university) },
      { eventId: 'story.univ.job-hunt', trigger: place(STORY_PLACES.university) },
      { eventId: 'story.univ.thesis', trigger: place(STORY_PLACES.bookstore) },
    ],
    unlocked: ['卒業論文を出し終えた。', ...UNLOCKED],
    milestone: ['……そして卒業式の日。', '大学を卒業した。春からは社会人だ。'],
  },
  {
    id: 'work', name: '社会人', incomeYen: 300_000,
    intro: ['社会人としての生活が始まった。（入社の準備金として 300,000円 を受け取った）'],
    steps: [
      { eventId: 'story.work.first-day', trigger: place(STORY_PLACES.office),
        notice: office('総務部', '初出社のご案内', '入社おめでとうございます。\n初日は隣町の本社に来てください。') },
      { eventId: 'story.work.account-sale', trigger: after(15) },          // SEC-013
      { eventId: 'story.work.account-frozen', when: chose('story.work.account-sale', 'send'), trigger: after(15) },
      { eventId: 'story.work.welcome', trigger: place(STORY_PLACES.cafe) },
      { eventId: 'story.work.account-takeover', trigger: after(15),        // SEC-014（中学の使い回し × 高校の流出通知を放置）
        when: { all: [chose('story.jh.first-account', 'reuse'), chose('story.hs.leak-notice', 'ignore')] } },
      { eventId: 'story.work.bank-fraud', when: chose('story.univ.free-wifi', 'login'), trigger: after(15) },
      { eventId: 'story.work.mistake', trigger: place(STORY_PLACES.office) },
      { eventId: 'story.work.usb', trigger: place(STORY_PLACES.office) },  // SEC-007
      { eventId: 'story.work.partner', trigger: place(STORY_PLACES.cafe) },
      { eventId: 'story.work.invoice', trigger: place(STORY_PLACES.office),
        notice: office('後輩', '振込先の件で相談です', '取引先から「振込先の口座が変わった」とメールが来ました。\n今日中に振り込んでほしいそうです。会社で相談させてください。') },
      { eventId: 'story.work.invoice-aftermath', when: chose('story.work.invoice', 'pay'), trigger: place(STORY_PLACES.office) },
      { eventId: 'story.work.job-offer', trigger: after(20) },
    ],
    unlocked: UNLOCKED,
    milestone: ['……時は流れた。'],
  },
  {
    id: 'later', name: '中年・老後', incomeYen: 2_000_000,
    intro: ['仕事でも家でも、任されることが増えた。（これまでの給料から、貯金が 2,000,000円 増えた）'],
    steps: [
      { eventId: 'story.later.promotion', when: chose('story.work.usb', 'report'), trigger: place(STORY_PLACES.office) },
      { eventId: 'story.later.training', when: chose('story.work.usb', 'plug'), trigger: place(STORY_PLACES.office) },
      { eventId: 'story.later.child-game', when: chose('story.work.partner', 'marry'), trigger: place(STORY_PLACES.home) },   // SEC-015
      { eventId: 'story.later.nephew-game', when: chose('story.work.partner', 'career'), trigger: place(STORY_PLACES.home) }, // SEC-015
      { eventId: 'story.later.home', when: chose('story.work.account-sale', 'check'), trigger: place(STORY_PLACES.home) },
      { eventId: 'story.later.home-loan-denied', when: chose('story.work.account-sale', 'send'), trigger: place(STORY_PLACES.home) },
      { eventId: 'story.later.parents', trigger: place(STORY_PLACES.home) },
      { eventId: 'story.later.retire', trigger: place(STORY_PLACES.office) },
      { eventId: 'story.later.refund-call', trigger: after(20) },
      { eventId: 'story.later.refund-aftermath', when: chose('story.later.refund-call', 'atm'), trigger: after(15) },
      { eventId: 'story.later.reunion', trigger: place(STORY_PLACES.cafe) },
      { eventId: 'story.later.grandchild', trigger: place(STORY_PLACES.home) },
    ],
    unlocked: ['やりたかったことは、ひととおりできた。', '自室のベッドで休むと、これまでの人生を振り返る。'],
    milestone: ['……長い人生だった。'],
  },
];
