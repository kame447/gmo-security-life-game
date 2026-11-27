/**
 * ストーリーで使う人生イベント（docs/features/story.md）。仕組みは events/ の人生イベント基盤を使う。
 * きっかけ（trigger.eventKey）は 'story.*' でマップ上の NPC には付いておらず、StoryDirector が begin() で始める。
 *
 * 自転車の購入は SEC-002（偽通販サイト）を題材にした序章の必須イベント。
 * 各ステージの必須イベントの中身・選択肢・stat の名前（study・fitness など）は試作で、採用は未決定。
 * セキュリティの題材は docs/events/security-events.md の候補（すべて採用未決定）と Issue #85 の叩き台から仮に置いた。
 */
import type { LifeEventDef } from '../events/life-events';
import { STORY_ADVANCE_EVENT, STORY_ADVANCE_GO, STORY_BIKE, STORY_MOTHER_NAME, STORY_SELF_NAME } from './config';

const yen = (value: number) => `${value.toLocaleString('ja-JP')}円`;
const event = (def: Omit<LifeEventDef, 'trigger'>): LifeEventDef => ({ ...def, trigger: { eventKey: def.id } });

export const STORY_EVENTS: readonly LifeEventDef[] = [
  event({
    id: STORY_BIKE.eventId,
    title: 'スマホで自転車を買う',
    category: 'security',
    speaker: STORY_MOTHER_NAME,
    intro: [
      'お使いありがとう！ これで町のことはだいたい分かったね。',
      `中学校への通学に自転車がいるでしょう。予算は${yen(STORY_BIKE.budgetYen)}。さっきのスマホの通販で、自分で選んで買ってごらん。`,
      'スマホで調べると、同じ自転車を売っているサイトが3つ見つかった。',
      `A：はやてサイクル　${yen(STORY_BIKE.fairPriceYen)}（会社の住所・電話番号あり）`,
      'B：まちかどバイク　24,800円（予算オーバー）',
      `C：スーパー激安セール　${yen(STORY_BIKE.fakePriceYen)}（今だけ50%オフ！ 連絡先はメールだけ）`,
    ],
    prompt: 'どのサイトで買う？',
    choices: [
      {
        id: 'site-a', label: `A：はやてサイクル（${yen(STORY_BIKE.fairPriceYen)}）`,
        result: ['会社の住所と電話番号を確かめてから注文した。', `おつりは${yen(STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen)}。`],
        effects: [{ kind: 'flag', flag: 'story.bike-checked-company' }],
      },
      {
        id: 'site-b', label: 'B：まちかどバイク（24,800円）',
        result: ['予算が足りなくて買えなかった。', 'A のサイトの会社情報を確かめて、A で注文した。'],
        effects: [{ kind: 'flag', flag: 'story.bike-checked-company' }],
      },
      {
        id: STORY_BIKE.fakeChoiceId, label: `C：スーパー激安セール（${yen(STORY_BIKE.fakePriceYen)}）`,
        result: ['安い！ すぐに注文して、代金を振り込んだ。', '……何日たっても、自転車は届かない。メールを送っても返事が来ない。'],
        effects: [{ kind: 'flag', flag: 'story.bike-fake-site' }],
      },
    ],
  }),
  event({
    id: STORY_ADVANCE_EVENT, title: '次の時期へ進む', category: 'daily', once: false, speaker: STORY_SELF_NAME,
    intro: ['ベッドに横になった。'],
    prompt: '次の時期へ進む？（戻ってこられません）',
    choices: [
      { id: STORY_ADVANCE_GO, label: '次へ進む', result: ['目を閉じた。'] },
      { id: 'stay', label: 'まだ町で過ごす', result: ['もう少しだけ、今の毎日を楽しもう。'] },
    ],
  }),

  // ── 中学生 ──
  event({
    id: 'story.jh.entrance', title: '中学校の入学式', category: 'daily', speaker: '校長先生',
    intro: ['新入生のみなさん、入学おめでとう。', '新しい友達と、たくさんのことを学んでください。'],
  }),
  event({
    id: 'story.jh.club', title: '部活を決める', category: 'daily', speaker: '担任の先生',
    intro: ['今日は部活の入部届を出す日だよ。'],
    prompt: 'どの部活に入る？',
    choices: [
      { id: 'sports', label: '運動部', result: ['毎日くたくたになるまで練習した。体が丈夫になった気がする。'], effects: [{ kind: 'stat', stat: 'fitness', add: 1 }] },
      { id: 'culture', label: '文化部', result: ['好きなことをとことん掘り下げる仲間ができた。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'none', label: '帰宅部', result: ['放課後は自分の時間。町を探検する時間が増えた。'] },
    ],
  }),
  event({
    id: 'story.jh.game-account', title: 'ゲームのアカウント', category: 'security', speaker: 'ゲーム内のチャット',
    intro: ['（スマホのゲームで遊んでいると、知らない人からメッセージが来た。）', '「レアアイテムをあげるよ！ 受け取りに必要だから、ログインIDとパスワードを教えて」'],
    prompt: 'どうする？',
    choices: [
      { id: 'tell', label: '教える', result: ['IDとパスワードを送った。', '次の日、ログインできなくなっていた。集めたアイテムも全部なくなっていた……。', 'パスワードは、家族以外の誰にも教えてはいけない。'], effects: [{ kind: 'flag', flag: 'story.game-account-stolen' }] },
      { id: 'refuse', label: '断って、運営に報告する', result: ['「パスワードは教えられません」と断り、運営に報告した。', '後で、同じ手口でアカウントを乗っ取られた人が大勢いたと知った。'] },
      { id: 'parent', label: '家族に相談する', result: ['お母さんに見せると、「それはアカウントを盗む手口だよ」と教えてくれた。', '一緒にその人をブロックして、運営に報告した。'] },
    ],
  }),
  event({
    id: 'story.jh.career', title: '志望校を決める', category: 'daily', speaker: '担任の先生',
    intro: ['そろそろ志望校を決めよう。この町には高校がないから、みんな隣町の高校へ電車で通うんだ。'],
    prompt: 'どんな高校を目指す？',
    choices: [
      { id: 'academic', label: '勉強に力を入れている高校', result: ['毎晩、机に向かう時間が増えた。'], effects: [{ kind: 'stat', stat: 'study', add: 1 }] },
      { id: 'technical', label: '情報や技術を学べる高校', result: ['パソコンやプログラミングに興味がわいてきた。'], effects: [{ kind: 'stat', stat: 'skill', add: 1 }] },
    ],
  }),
  event({
    id: 'story.jh.exam', title: '高校入試', category: 'daily', speaker: '試験監督',
    intro: ['（隣町の高校に着いた。いよいよ入試だ。）', 'それでは、始めてください。'],
    prompt: '試験の最中、分からない問題が出た。',
    choices: [
      { id: 'skip', label: '飛ばして、解ける問題から解く', result: ['解ける問題を先に片づけて、最後に戻って考えた。手ごたえはまずまずだ。'] },
      { id: 'stuck', label: 'その問題で粘る', result: ['時間を使いすぎて、最後まで解けなかった……。でも、やれるだけのことはやった。'] },
    ],
  }),

  // ── 高校生 ──
  event({
    id: 'story.hs.entrance', title: '高校の入学式', category: 'daily', speaker: '校長先生',
    intro: ['入学おめでとう。高校の3年間はあっという間です。', '自分が何をしたいのか、考えながら過ごしてください。'],
  }),
  event({
    id: 'story.hs.club-sports', title: '運動部の大会', category: 'daily', speaker: '部活の先輩',
    intro: ['中学から続けてるんだって？ 今度の大会、メンバーに入ってもらうよ。'],
    prompt: '大会の前の週、どう過ごす？',
    choices: [
      { id: 'practice', label: '朝練から参加する', result: ['大会では最後まで走りきった。チームは地区大会を勝ち抜いた！'], effects: [{ kind: 'stat', stat: 'fitness', add: 1 }] },
      { id: 'balance', label: '勉強と両立する', result: ['大会は惜しくも初戦敗退。でもテストの点は上がった。'], effects: [{ kind: 'stat', stat: 'study', add: 1 }] },
    ],
  }),
  event({
    id: 'story.hs.club-culture', title: '文化祭の展示', category: 'daily', speaker: '部活の仲間',
    intro: ['文化祭、うちの部も展示を出すよ。中学から一緒にやってきたし、何か作ろう！'],
    prompt: '何を展示する？',
    choices: [
      { id: 'game', label: 'みんなで作ったゲーム', result: ['行列ができるほどの人気だった！'], effects: [{ kind: 'stat', stat: 'skill', add: 1 }] },
      { id: 'paper', label: '町の歴史の研究', result: ['近所のおばあさんが、昔の写真を持って見に来てくれた。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
    ],
  }),
  event({
    id: 'story.hs.part-time', title: '初めてのアルバイト', category: 'daily', speaker: 'コンビニの店長',
    intro: ['放課後のアルバイト、よく来てくれたね。今日からよろしく。', 'さっそくだけど、レジが混んできた。'],
    prompt: 'どうする？',
    choices: [
      { id: 'ask', label: '分からないことは先輩に聞く', result: ['先輩に教わりながら、なんとかレジを回せた。初めての給料で家族にケーキを買った。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'alone', label: '一人でがんばる', result: ['おつりを間違えてしまった……。次からは確認しよう。それでも初めての給料はうれしかった。'] },
    ],
  }),
  event({
    id: 'story.hs.photo', title: '文化祭の写真', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（文化祭の日。クラスの集合写真を撮った。制服の名札や、校門の看板まではっきり写っている。）', 'SNSに載せたら、みんな喜ぶかな。'],
    prompt: 'どうする？',
    choices: [
      { id: 'public', label: 'そのまま全体に公開する', result: ['たくさん「いいね」がついた。', '数日後、知らない人から「○○高校の△△さんだよね？」とメッセージが来た。名札と学校名から調べられたらしい。'], effects: [{ kind: 'flag', flag: 'story.photo-public' }] },
      { id: 'friends', label: '名札を隠して、友達だけに公開する', result: ['写っている友達にも確認してから、友達だけに公開した。'] },
      { id: 'none', label: '投稿しない', result: ['写真は自分のスマホに大切にしまっておいた。'] },
    ],
  }),
  event({
    id: 'story.hs.career', title: '卒業後の進路', category: 'daily', speaker: '担任の先生',
    intro: ['そろそろ卒業後の進路を決める時期だね。'],
    prompt: '卒業したらどうする？',
    choices: [
      { id: 'university', label: '大学に進学する', result: ['受験勉強を始めることにした。'], effects: [{ kind: 'flag', flag: 'story.career-university' }] },
      { id: 'work', label: '就職する', result: ['早く働いて、自分の力で暮らしたい。'], effects: [{ kind: 'flag', flag: 'story.career-work' }] },
    ],
  }),

  // ── 進学・就職 ──
  event({
    id: 'story.young.university', title: '大学の新生活', category: 'daily', speaker: 'サークルの先輩',
    intro: ['新入生だよね？ うちのサークル、見学していかない？'],
    prompt: 'どうする？',
    choices: [
      { id: 'circle', label: 'サークルに入る', result: ['一生付き合える友達ができた。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'study', label: '勉強に集中する', result: ['授業の後は図書館にこもった。成績は上々だ。'], effects: [{ kind: 'stat', stat: 'study', add: 1 }] },
    ],
  }),
  event({
    id: 'story.young.first-job', title: '初出社', category: 'daily', speaker: '上司',
    intro: ['今日からよろしく。まずは仕事用のパソコンを渡すね。', 'パスワードは自分で決めて。'],
    prompt: 'どんなパスワードにする？',
    choices: [
      { id: 'strong', label: '長くて推測されにくいものにする', result: ['単語を組み合わせた長いパスワードにした。他のサービスとは使い回さない。'] },
      { id: 'birthday', label: '覚えやすい誕生日にする', result: ['誕生日にした。', '「それはSNSを見れば分かっちゃうよ」と先輩に注意され、作り直した。'] },
    ],
  }),
  event({
    id: 'story.young.phishing', title: 'カード会社からのメール', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（初めて作ったクレジットカードの会社から、「利用を停止しました」というメールが届いている。）', '24時間以内に、リンクからカード番号と暗証番号を入力しろって書いてある……。'],
    prompt: 'どうする？',
    choices: [
      { id: 'link', label: 'リンクを開いて入力する', result: ['あわてて入力した。', '翌月、身に覚えのない高額の請求が届いた。カードを止めて、作り直すことになった。', 'カード会社が暗証番号をメールで聞くことはない。'], effects: [{ kind: 'flag', flag: 'story.phishing-victim' }] },
      { id: 'official', label: 'カード会社の公式アプリで確かめる', result: ['公式アプリを開くと、カードは普通に使える状態だった。', 'メールの差出人のアドレスも、カード会社のものではなかった。'] },
      { id: 'ignore', label: '無視する', result: ['心当たりがないので放っておいた。何も起きなかった。'] },
    ],
  }),
  event({
    id: 'story.young.job-hunt', title: '就職活動', category: 'daily', speaker: 'キャリアセンターの職員',
    intro: ['そろそろ就職活動の時期だね。どんな会社を受けるか決めた？'],
    prompt: 'どこを目指す？',
    choices: [
      { id: 'it', label: 'IT企業', result: ['いくつも面接を受けて、隣町のIT企業に内定をもらった。'], effects: [{ kind: 'stat', stat: 'skill', add: 1 }] },
      { id: 'local', label: '地元の会社', result: ['生まれ育った町の役に立ちたい。地元の会社に内定をもらった。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
    ],
  }),
  event({
    id: 'story.young.work-trouble', title: '仕事の失敗', category: 'daily', speaker: '先輩',
    intro: ['取引先に送る書類の数字、間違ってたみたい。'],
    prompt: 'どうする？',
    choices: [
      { id: 'report', label: 'すぐ上司に報告する', result: ['すぐ報告したおかげで、大事にならずに済んだ。「よく言ってくれた」と言われた。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'hide', label: 'こっそり直す', result: ['こっそり直そうとしたが、取引先から問い合わせが来てしまった。報告は早いほうがいい。'] },
    ],
  }),

  // ── 社会人 ──
  event({
    id: 'story.adult.usb', title: '拾ったUSBメモリ', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（会社の駐車場に、USBメモリが落ちている。ラベルには「人事評価」と書いてある。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'plug', label: '自分のパソコンに挿して中を見る', result: ['挿したとたん、パソコンの動きがおかしくなった。', '社内のネットワークにウイルスが広がり、会社は丸一日仕事ができなかった。'], effects: [{ kind: 'flag', flag: 'story.usb-infected' }] },
      { id: 'report', label: '開かずに情報システムの担当に渡す', result: ['担当者が調べると、ウイルスが仕込まれていた。', '「わざと落として拾わせる手口だよ。開かなくて正解」と言われた。'] },
    ],
  }),
  event({
    id: 'story.adult.login-alert', title: '見知らぬログイン', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（通販サイトから「新しい端末からログインがありました」と通知が来た。心当たりはない。）', 'そういえば、このサイトのパスワードは昔から使い回している……。'],
    prompt: 'どうする？',
    choices: [
      { id: 'secure', label: 'パスワードを変えて、2段階認証を設定する', result: ['公式アプリからパスワードを変え、2段階認証を設定した。', '使い回していた他のサービスのパスワードも、それぞれ別のものに変えた。'] },
      { id: 'ignore', label: '面倒なので放っておく', result: ['数日後、登録していたカードで知らない買い物がされていた……。', '他のサイトから漏れたパスワードが使われたらしい。'], effects: [{ kind: 'flag', flag: 'story.account-taken' }] },
    ],
  }),
  event({
    id: 'story.adult.partner', title: '喫茶店での約束', category: 'daily', speaker: '大切な人',
    intro: ['（喫茶店で、長く付き合ってきた大切な人と向かい合っている。）', 'これからのこと、ちゃんと話したくて。'],
    prompt: 'どうする？',
    choices: [
      { id: 'marry', label: '結婚しよう', result: ['二人で新しい家族を作ることにした。'], effects: [{ kind: 'flag', flag: 'story.married' }] },
      { id: 'career', label: '今はお互いの仕事を大切にしたい', result: ['よく話し合って、それぞれの道を歩むことにした。'] },
    ],
  }),

  // ── 働き盛り ──
  event({
    id: 'story.middle.child-game', title: '子どものゲーム課金', category: 'security', speaker: '子ども',
    intro: ['（カードの明細に、ゲームの課金が3万円も載っていた。）', 'ごめんなさい……。ボタンを押したら、買えちゃったの。'],
    prompt: 'どうする？',
    choices: [
      { id: 'rules', label: '一緒にルールを決め、課金に許可がいる設定にする', result: ['使う時間と課金のルールを一緒に決めた。', 'スマホの設定で、課金には親の許可がいるようにした。'] },
      { id: 'scold', label: '叱ってゲームを取り上げる', result: ['ゲームを取り上げた。', 'でもしばらくして、子どもは友達の家でこっそり遊ぶようになった……。'] },
    ],
  }),
  event({
    id: 'story.middle.hobby', title: '趣味の仲間', category: 'daily', speaker: '常連さん',
    intro: ['（喫茶店の常連さんに声をかけられた。）', '週末に写真を撮りに行く集まりがあるんだけど、一緒にどう？'],
    prompt: 'どうする？',
    choices: [
      { id: 'join', label: '参加する', result: ['仕事以外の仲間ができ、週末が楽しみになった。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'decline', label: '一人の時間を大切にする', result: ['一人で本を読む週末も、悪くない。'] },
    ],
  }),
  event({
    id: 'story.middle.invoice', title: '振込先の変更', category: 'security', speaker: '部下',
    intro: ['取引先から「振込先の口座が変わったので、今日中にこちらへ」とメールが来ました。', '送ってきたアドレスも、いつもの担当者の名前です。'],
    prompt: 'どうする？',
    choices: [
      { id: 'call', label: '取引先に電話して確かめる', result: ['いつもの番号に電話すると、「口座は変えていません」と言われた。', 'メールアドレスは、一文字だけ違う偽物だった。'] },
      { id: 'pay', label: '急いでいるので、そのまま振り込む', result: ['振り込んだ。', '翌週、取引先から「代金がまだ届いていない」と連絡が来た。お金はだまし取られていた。'], effects: [{ kind: 'flag', flag: 'story.invoice-fraud' }] },
    ],
  }),
  event({
    id: 'story.middle.parents', title: '親のこと', category: 'daily', speaker: STORY_MOTHER_NAME,
    intro: ['最近、足が弱ってきてね。一人で買い物に行くのも大変になってきたよ。'],
    prompt: 'どうする？',
    choices: [
      { id: 'together', label: '一緒に暮らす', result: ['実家に戻って、一緒に暮らすことにした。にぎやかな毎日になった。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'service', label: '介護サービスを相談する', result: ['地域の窓口に相談して、ヘルパーさんに来てもらうことにした。週末は顔を見に行く。'] },
    ],
  }),

  // ── 老後 ──
  event({
    id: 'story.senior.reunion', title: '昔の友達', category: 'daily', speaker: '昔の友達',
    intro: ['（喫茶店で、中学のころの友達にばったり会った。）', '久しぶり！ 部活のころの話、覚えてる？'],
    prompt: 'どうする？',
    choices: [
      { id: 'talk', label: '昔話に花を咲かせる', result: ['気づけば日が暮れていた。来月また会う約束をした。'], effects: [{ kind: 'stat', stat: 'friendship', add: 1 }] },
      { id: 'phone', label: 'スマホで連絡先を交換する', result: ['連絡先を交換した。孫の写真を送り合う仲になった。'] },
    ],
  }),
  event({
    id: 'story.senior.refund-call', title: '還付金の電話', category: 'security', speaker: '市役所を名乗る人',
    intro: ['（家の電話が鳴った。）', 'こちら市役所です。医療費の払い戻しがあります。今日が期限なので、近くのATMに行ってください。操作をご案内します。'],
    prompt: 'どうする？',
    choices: [
      { id: 'family', label: 'いったん切って、家族に相談する', result: ['電話を切って家族に相談した。', '「ATMでお金が戻ることはないよ。それは詐欺」と教えてくれた。市役所に聞くと、そんな連絡はしていなかった。'] },
      { id: 'atm', label: '言われたとおりATMへ行く', result: ['言われるままにATMを操作した。', '……払い戻しを受けるはずが、自分の口座からお金を振り込んでいた。'], effects: [{ kind: 'flag', flag: 'story.refund-fraud' }] },
    ],
  }),
  event({
    id: 'story.senior.checkup', title: '健康相談', category: 'daily', speaker: '薬剤師',
    intro: ['最近、体の調子はどうですか？ 年に一度は健康診断を受けてくださいね。'],
    prompt: 'どうする？',
    choices: [
      { id: 'walk', label: '毎日散歩を始める', result: ['毎朝、川沿いを歩くのが日課になった。'], effects: [{ kind: 'stat', stat: 'fitness', add: 1 }] },
      { id: 'checkup', label: '健康診断の予約をする', result: ['診断の結果は良好だった。ひと安心。'] },
    ],
  }),
  event({
    id: 'story.senior.grandchild', title: '孫とスマホ', category: 'daily', speaker: '孫',
    intro: ['ねえ、スマホの使い方を教えて！ 初めて自分のスマホを買ってもらったんだ。'],
    prompt: '何を伝える？',
    choices: [
      { id: 'safety', label: '怪しいメールやサイトの見分け方', result: ['これまでの経験を話した。孫は真剣な顔で聞いていた。', '「困ったら、すぐ大人に相談するんだよ」'] },
      { id: 'fun', label: '写真の撮り方や楽しい使い方', result: ['一緒に家族の写真を撮った。孫は大喜びだった。'] },
    ],
  }),
];
