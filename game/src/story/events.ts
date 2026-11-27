/**
 * ストーリーで使う人生イベント（docs/features/story.md）。仕組みは events/ の人生イベント基盤を使う。
 * きっかけ（trigger.eventKey）は 'story.*' でマップ上の NPC には付いておらず、StoryDirector が begin() で始める。
 *
 * 選択肢の score は評価（Issue #62、score.ts）と所持金の増減に、memory は最後の振り返りに使う。
 * セキュリティの選択で被害が出ると、後で対処の出来事が起き、その後の仕事・家族・お金にも響く（config.ts の when）。
 * 中身・数値は試作。セキュリティの題材は docs/events/security-events.md の候補（採用未決定）と Issue #85 の叩き台から仮に置いた。
 */
import { STORY_ADVANCE_EVENT, STORY_ADVANCE_GO, STORY_BIKE, STORY_MOTHER_NAME, STORY_SELF_NAME } from './config';
import type { StoryEventDef } from './score';

const yen = (value: number) => `${value.toLocaleString('ja-JP')}円`;
const event = (def: Omit<StoryEventDef, 'trigger'>): StoryEventDef => ({ ...def, trigger: { eventKey: def.id } });

export const STORY_EVENTS: readonly StoryEventDef[] = [
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
        score: { judgment: 'safe' }, memory: '初めての通販で、店の情報を確かめてから自転車を買った。',
      },
      {
        id: 'site-b', label: 'B：まちかどバイク（24,800円）',
        result: ['予算が足りなくて買えなかった。', 'A のサイトの会社情報を確かめて、A で注文した。'],
        effects: [{ kind: 'flag', flag: 'story.bike-checked-company' }],
        score: { judgment: 'safe' }, memory: '初めての通販で、店の情報を確かめてから自転車を買った。',
      },
      {
        id: STORY_BIKE.fakeChoiceId, label: `C：スーパー激安セール（${yen(STORY_BIKE.fakePriceYen)}）`,
        result: ['安い！ すぐに注文して、代金を振り込んだ。', '……何日たっても、自転車は届かない。メールを送っても返事が来ない。'],
        effects: [{ kind: 'flag', flag: 'story.bike-fake-site' }],
        score: { judgment: 'risky', damage: true, response: true }, memory: '初めての通販で偽サイトにだまされた。すぐ母に相談して、見分け方を教わった。',
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
      { id: 'sports', label: '運動部', result: ['毎日くたくたになるまで練習した。体が丈夫になった気がする。'], score: { growth: 1, ties: 1 }, memory: '中学では運動部で汗を流した。' },
      { id: 'culture', label: '文化部', result: ['好きなことをとことん掘り下げる仲間ができた。'], score: { ties: 2 }, memory: '中学では文化部で、好きなことを仲間と深めた。' },
      { id: 'none', label: '帰宅部', result: ['放課後は自分の時間。町を探検する時間が増えた。'], score: { growth: 1 }, memory: '中学では放課後に町を歩き回った。' },
    ],
  }),
  event({
    id: 'story.jh.game-account', title: 'ゲームのアカウント', category: 'security', speaker: 'ゲーム内のチャット',
    intro: ['（スマホのゲームで遊んでいると、知らない人からメッセージが来た。）', '「レアアイテムをあげるよ！ 受け取りに必要だから、ログインIDとパスワードを教えて」'],
    prompt: 'どうする？',
    choices: [
      { id: 'tell', label: '教える', result: ['IDとパスワードを送った。', '次の日、ログインできなくなっていた。集めたアイテムも全部なくなっていた……。'],
        score: { judgment: 'risky', damage: true }, memory: 'ゲームで知らない人にパスワードを教え、アカウントを乗っ取られた。' },
      { id: 'refuse', label: '断って、運営に報告する', result: ['「パスワードは教えられません」と断り、運営に報告した。', '後で、同じ手口でアカウントを乗っ取られた人が大勢いたと知った。'],
        score: { judgment: 'safe' }, memory: 'ゲームでパスワードを聞かれても、教えずに運営へ報告した。' },
      { id: 'parent', label: '家族に相談する', result: ['お母さんに見せると、「それはアカウントを盗む手口だよ」と教えてくれた。', '一緒にその人をブロックして、運営に報告した。'],
        score: { judgment: 'safe', ties: 1 }, memory: 'ゲームでパスワードを聞かれ、家族に相談して手口だと気づいた。' },
    ],
  }),
  event({
    id: 'story.jh.account-recovery', title: '乗っ取られたアカウント', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（乗っ取られたアカウントから、友達に「お金を貸して」というメッセージが送られているらしい……。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'support', label: '運営に問い合わせ、友達にも知らせる', result: ['運営に問い合わせてアカウントを取り戻した。友達には「あれは自分じゃない」と伝えた。', 'パスワードは他と使い回さない、長いものに変えた。'],
        score: { response: true, growth: 1 }, memory: '乗っ取られたアカウントは、運営に問い合わせて取り戻した。' },
      { id: 'giveup', label: 'あきらめて放っておく', result: ['放っておいたら、何人かの友達がお金を振り込んでしまった。', '気まずくなって、その友達とは話さなくなった。'],
        score: { response: false, ties: -1 }, memory: '乗っ取られたアカウントを放っておき、友達がだまされてしまった。' },
    ],
  }),
  event({
    id: 'story.jh.career', title: '志望校を決める', category: 'daily', speaker: '担任の先生',
    intro: ['そろそろ志望校を決めよう。この町には高校がないから、みんな隣町の高校へ電車で通うんだ。'],
    prompt: 'どんな高校を目指す？',
    choices: [
      { id: 'academic', label: '勉強に力を入れている高校', result: ['毎晩、机に向かう時間が増えた。'], score: { growth: 1 } },
      { id: 'technical', label: '情報や技術を学べる高校', result: ['パソコンやプログラミングに興味がわいてきた。'], score: { growth: 1 } },
    ],
  }),
  event({
    id: 'story.jh.exam', title: '高校入試', category: 'daily', speaker: '試験監督',
    intro: ['（隣町の高校に着いた。いよいよ入試だ。）', 'それでは、始めてください。'],
    prompt: '試験の最中、分からない問題が出た。',
    choices: [
      { id: 'skip', label: '飛ばして、解ける問題から解く', result: ['解ける問題を先に片づけて、最後に戻って考えた。手ごたえはまずまずだ。'], score: { growth: 1 } },
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
      { id: 'practice', label: '朝練から参加する', result: ['大会では最後まで走りきった。チームは地区大会を勝ち抜いた！'], score: { growth: 1, ties: 1 }, memory: '高校の大会で、仲間と地区大会を勝ち抜いた。' },
      { id: 'balance', label: '勉強と両立する', result: ['大会は惜しくも初戦敗退。でもテストの点は上がった。'], score: { growth: 1 } },
    ],
  }),
  event({
    id: 'story.hs.club-culture', title: '文化祭の展示', category: 'daily', speaker: '部活の仲間',
    intro: ['文化祭、うちの部も展示を出すよ。中学から一緒にやってきたし、何か作ろう！'],
    prompt: '何を展示する？',
    choices: [
      { id: 'game', label: 'みんなで作ったゲーム', result: ['行列ができるほどの人気だった！'], score: { growth: 1, ties: 1 }, memory: '文化祭で、仲間と作ったゲームに行列ができた。' },
      { id: 'paper', label: '町の歴史の研究', result: ['近所のおばあさんが、昔の写真を持って見に来てくれた。'], score: { ties: 1 } },
    ],
  }),
  event({
    id: 'story.hs.part-time', title: '初めてのアルバイト', category: 'daily', speaker: 'コンビニの店長',
    intro: ['放課後のアルバイト、よく来てくれたね。今日からよろしく。', 'さっそくだけど、レジが混んできた。'],
    prompt: 'どうする？',
    choices: [
      { id: 'ask', label: '分からないことは先輩に聞く', result: ['先輩に教わりながら、なんとかレジを回せた。', '初めての給料（30,000円）で家族にケーキを買った。'], score: { ties: 1, moneyYen: 30_000 }, memory: '初めてのアルバイト代で、家族にケーキを買った。' },
      { id: 'alone', label: '一人でがんばる', result: ['おつりを間違えてしまった……。次からは確認しよう。', 'それでも初めての給料（30,000円）はうれしかった。'], score: { moneyYen: 30_000 } },
    ],
  }),
  event({
    id: 'story.hs.photo', title: '文化祭の写真', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（文化祭の日。クラスの集合写真を撮った。制服の名札や、校門の看板まではっきり写っている。）', 'SNSに載せたら、みんな喜ぶかな。'],
    prompt: 'どうする？',
    choices: [
      { id: 'public', label: 'そのまま全体に公開する', result: ['たくさん「いいね」がついた。', '数日後、知らない人から「○○高校の△△さんだよね？」とメッセージが来た。名札と学校名から調べられたらしい。'],
        score: { judgment: 'risky', damage: true }, memory: '名札が写った写真を全体に公開し、知らない人に学校と名前を知られた。' },
      { id: 'friends', label: '名札を隠して、友達だけに公開する', result: ['写っている友達にも確認してから、友達だけに公開した。'],
        score: { judgment: 'safe', ties: 1 }, memory: '写真は名札を隠し、写った友達に確認してから友達だけに公開した。' },
      { id: 'none', label: '投稿しない', result: ['写真は自分のスマホに大切にしまっておいた。'], score: { judgment: 'normal' } },
    ],
  }),
  event({
    id: 'story.hs.photo-followup', title: '知らない人からのメッセージ', category: 'security', speaker: '知らない人',
    intro: ['（また、あの人からメッセージが来た。）', '「今度の土曜、駅前で会えない？ 写真の場所、知ってるよ」'],
    prompt: 'どうする？',
    choices: [
      { id: 'consult', label: '先生と家族に相談し、投稿を消す', result: ['先生と家族に相談した。投稿を消して、相手をブロックし、SNSに報告した。', '学校も見回りを増やしてくれて、それきり連絡は来なくなった。'],
        score: { response: true, ties: 1 }, memory: '知らない人からの誘いは、先生と家族に相談して止められた。' },
      { id: 'ignore', label: '誰にも言わずに放っておく', result: ['放っておいたら、通学の電車で見られている気がするようになった。', '怖くて、しばらく友達と出かけられなくなった。'],
        score: { response: false, ties: -1 }, memory: '知らない人からの誘いを誰にも言えず、しばらく出かけるのが怖くなった。' },
    ],
  }),
  event({
    id: 'story.hs.career', title: '卒業後の進路', category: 'daily', speaker: '担任の先生',
    intro: ['そろそろ卒業後の進路を決める時期だね。'],
    prompt: '卒業したらどうする？',
    choices: [
      { id: 'university', label: '大学に進学する', result: ['受験勉強を始めることにした。'], score: { growth: 1 }, memory: '高校を出て、大学へ進んだ。' },
      { id: 'work', label: '就職する', result: ['早く働いて、自分の力で暮らしたい。'], score: { moneyYen: 200_000 }, memory: '高校を出て、すぐに働き始めた。' },
    ],
  }),

  // ── 進学・就職 ──
  event({
    id: 'story.young.university', title: '大学の新生活', category: 'daily', speaker: 'サークルの先輩',
    intro: ['新入生だよね？ うちのサークル、見学していかない？'],
    prompt: 'どうする？',
    choices: [
      { id: 'circle', label: 'サークルに入る', result: ['一生付き合える友達ができた。'], score: { ties: 2 }, memory: '大学のサークルで、一生の友達ができた。' },
      { id: 'study', label: '勉強に集中する', result: ['授業の後は図書館にこもった。成績は上々だ。'], score: { growth: 2 } },
    ],
  }),
  event({
    id: 'story.young.first-job', title: '初出社', category: 'security', speaker: '上司',
    intro: ['今日からよろしく。まずは仕事用のパソコンを渡すね。', 'パスワードは自分で決めて。'],
    prompt: 'どんなパスワードにする？',
    choices: [
      { id: 'strong', label: '長くて推測されにくいものにする', result: ['単語を組み合わせた長いパスワードにした。他のサービスとは使い回さない。'], score: { judgment: 'safe', growth: 1 } },
      { id: 'birthday', label: '覚えやすい誕生日にする', result: ['誕生日にした。', '「それはSNSを見れば分かっちゃうよ」と先輩に注意され、作り直した。'], score: { judgment: 'normal' } },
    ],
  }),
  event({
    id: 'story.young.phishing', title: 'カード会社からのメール', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（初めて作ったクレジットカードの会社から、「利用を停止しました」というメールが届いている。）', '24時間以内に、リンクからカード番号と暗証番号を入力しろって書いてある……。'],
    prompt: 'どうする？',
    choices: [
      { id: 'link', label: 'リンクを開いて入力する', result: ['あわてて入力した。', '……入力したあとの画面は真っ白になった。なんだか嫌な予感がする。'],
        score: { judgment: 'risky', damage: true, moneyYen: -50_000 }, memory: 'カード会社を装ったメールのリンクにカード番号を入力し、5万円を使われた。' },
      { id: 'official', label: 'カード会社の公式アプリで確かめる', result: ['公式アプリを開くと、カードは普通に使える状態だった。', 'メールの差出人のアドレスも、カード会社のものではなかった。'],
        score: { judgment: 'safe' }, memory: 'カード会社を装ったメールは、公式アプリで確かめて見破った。' },
      { id: 'ignore', label: '無視する', result: ['心当たりがないので放っておいた。何も起きなかった。'], score: { judgment: 'normal' } },
    ],
  }),
  event({
    id: 'story.young.card-fraud', title: '身に覚えのない請求', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（カードの明細に、身に覚えのない買い物が5万円分も載っている。）', 'あのメールのせいだ……。'],
    prompt: 'どうする？',
    choices: [
      { id: 'call', label: 'すぐカード会社に電話し、警察にも相談する', result: ['カードを止めてもらい、警察にも相談した。', '不正利用と認められ、3万円が戻ってきた。'],
        score: { response: true, moneyYen: 30_000 }, memory: '不正利用に気づいてすぐカード会社に連絡し、一部を取り戻した。' },
      { id: 'leave', label: '恥ずかしいので誰にも言わない', result: ['誰にも言わずにいたら、翌月もさらに5万円使われていた。'],
        score: { response: false, moneyYen: -50_000 }, memory: '不正利用を誰にも言わずにいて、被害が広がった。' },
    ],
  }),
  event({
    id: 'story.young.job-hunt', title: '就職活動', category: 'daily', speaker: 'キャリアセンターの職員',
    intro: ['そろそろ就職活動の時期だね。どんな会社を受けるか決めた？'],
    prompt: 'どこを目指す？',
    choices: [
      { id: 'it', label: 'IT企業', result: ['いくつも面接を受けて、隣町のIT企業に内定をもらった。'], score: { growth: 1 }, memory: '隣町のIT企業に就職した。' },
      { id: 'local', label: '地元の会社', result: ['生まれ育った町の役に立ちたい。地元の会社に内定をもらった。'], score: { ties: 1 }, memory: '地元の会社に就職した。' },
    ],
  }),
  event({
    id: 'story.young.work-trouble', title: '仕事の失敗', category: 'daily', speaker: '先輩',
    intro: ['取引先に送る書類の数字、間違ってたみたい。'],
    prompt: 'どうする？',
    choices: [
      { id: 'report', label: 'すぐ上司に報告する', result: ['すぐ報告したおかげで、大事にならずに済んだ。「よく言ってくれた」と言われた。'], score: { ties: 1, growth: 1 } },
      { id: 'hide', label: 'こっそり直す', result: ['こっそり直そうとしたが、取引先から問い合わせが来てしまった。報告は早いほうがいい。'] },
    ],
  }),

  // ── 社会人 ──
  event({
    id: 'story.adult.usb', title: '拾ったUSBメモリ', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（会社の駐車場に、USBメモリが落ちている。ラベルには「人事評価」と書いてある。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'plug', label: '自分のパソコンに挿して中を見る', result: ['挿したとたん、パソコンの動きがおかしくなった。', '社内のネットワークにウイルスが広がり、会社は丸一日仕事ができなかった。'],
        score: { judgment: 'risky', damage: true }, memory: '拾ったUSBメモリを挿して、会社にウイルスを広げてしまった。' },
      { id: 'report', label: '開かずに情報システムの担当に渡す', result: ['担当者が調べると、ウイルスが仕込まれていた。', '「わざと落として拾わせる手口だよ。開かなくて正解」と言われた。'],
        score: { judgment: 'safe' }, memory: '拾ったUSBメモリは開かずに担当へ届け、会社を守った。' },
    ],
  }),
  event({
    id: 'story.adult.login-alert', title: '見知らぬログイン', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（通販サイトから「新しい端末からログインがありました」と通知が来た。心当たりはない。）', 'そういえば、このサイトのパスワードは昔から使い回している……。'],
    prompt: 'どうする？',
    choices: [
      { id: 'secure', label: 'パスワードを変えて、2段階認証を設定する', result: ['公式アプリからパスワードを変え、2段階認証を設定した。', '使い回していた他のサービスのパスワードも、それぞれ別のものに変えた。'],
        score: { judgment: 'safe', growth: 1 }, memory: '見知らぬログインの通知で、パスワードを変えて2段階認証を設定した。' },
      { id: 'ignore', label: '面倒なので放っておく', result: ['……数日後、登録していたカードで知らない買い物（3万円）がされていた。'],
        score: { judgment: 'risky', damage: true, moneyYen: -30_000 }, memory: '見知らぬログインを放っておき、アカウントを乗っ取られた。' },
    ],
  }),
  event({
    id: 'story.adult.account-fraud', title: '乗っ取られた通販アカウント', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（使い回していたパスワードが、他のサイトから漏れていたらしい。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'contact', label: '通販会社とカード会社に連絡し、パスワードを全部変える', result: ['連絡して不正な注文を取り消してもらい、2万円が戻った。', 'パスワードはサービスごとに別のものにした。'],
        score: { response: true, moneyYen: 20_000, growth: 1 }, memory: '乗っ取られた通販アカウントは、すぐ連絡して被害を取り戻した。' },
      { id: 'leave', label: 'カードだけ止めて、あとは放っておく', result: ['同じパスワードの別のサービスも次々に乗っ取られた……。'],
        score: { response: false, moneyYen: -30_000 }, memory: 'パスワードを使い回したまま放っておき、被害が広がった。' },
    ],
  }),
  event({
    id: 'story.adult.partner', title: '喫茶店での約束', category: 'daily', speaker: '大切な人',
    intro: ['（喫茶店で、長く付き合ってきた大切な人と向かい合っている。）', 'これからのこと、ちゃんと話したくて。'],
    prompt: 'どうする？',
    choices: [
      { id: 'marry', label: '結婚しよう', result: ['二人で新しい家族を作ることにした。'], score: { ties: 2, moneyYen: -300_000 }, memory: '大切な人と家族になった。' },
      { id: 'career', label: '今はお互いの仕事を大切にしたい', result: ['よく話し合って、それぞれの道を歩むことにした。'], score: { growth: 1 }, memory: '仕事と自分の時間を大切に生きることにした。' },
    ],
  }),

  // ── 働き盛り ──
  event({
    id: 'story.middle.promotion', title: '昇進', category: 'daily', speaker: '上司',
    intro: ['いつも慎重に仕事をしてくれて助かってるよ。USBメモリの件も見事だった。', '来月から課長を任せたい。'],
    prompt: 'どうする？',
    choices: [
      { id: 'mentor', label: '引き受けて、部下を育てる', result: ['部下の相談に乗る毎日。給料も上がった（+500,000円）。'], score: { ties: 1, growth: 1, moneyYen: 500_000 }, memory: '仕事ぶりが認められて課長になり、部下を育てた。' },
      { id: 'expert', label: '現場で専門を極めたい', result: ['現場に残り、社内で一番の専門家と呼ばれるようになった（+300,000円）。'], score: { growth: 2, moneyYen: 300_000 }, memory: '現場に残り、専門家として頼られた。' },
    ],
  }),
  event({
    id: 'story.middle.training', title: 'セキュリティ研修', category: 'security', speaker: '情報システムの担当',
    intro: ['USBメモリの件のあと、全社でセキュリティ研修をすることになった。', 'あなたには、二度と起きないための対策づくりにも加わってほしい。'],
    prompt: 'どうする？',
    choices: [
      { id: 'learn', label: '研修で学び、対策づくりに加わる', result: ['失敗から学んで対策をまとめ、社内で発表した。', '「あの経験を生かしてくれた」と見直してもらえた。'],
        score: { response: true, growth: 2 }, memory: 'USBメモリの失敗を生かし、会社の対策づくりに加わった。' },
      { id: 'avoid', label: '気まずいので研修は最低限にする', result: ['研修は聞き流した。', '昇進の話は、同期に回っていった。'],
        score: { response: false }, memory: 'USBメモリの失敗と向き合えず、昇進を逃した。' },
    ],
  }),
  event({
    id: 'story.middle.child-game', title: '子どものゲーム課金', category: 'security', speaker: '子ども',
    intro: ['（カードの明細に、ゲームの課金が3万円も載っていた。）', 'ごめんなさい……。ボタンを押したら、買えちゃったの。'],
    prompt: 'どうする？',
    choices: [
      { id: 'rules', label: '一緒にルールを決め、課金に許可がいる設定にする', result: ['使う時間と課金のルールを一緒に決めた。', 'スマホの設定で、課金には親の許可がいるようにした。'],
        score: { judgment: 'safe', ties: 1, moneyYen: -30_000 }, memory: '子どもの課金は、一緒にルールを決めて設定で防いだ。' },
      { id: 'scold', label: '叱ってゲームを取り上げる', result: ['ゲームを取り上げた。', 'でもしばらくして、子どもは友達の家でこっそり遊ぶようになった……。'],
        score: { judgment: 'normal', ties: -1, moneyYen: -30_000 }, memory: '子どもの課金を叱って取り上げたが、話し合えなかった。' },
    ],
  }),
  event({
    id: 'story.middle.hobby', title: '趣味の仲間', category: 'daily', speaker: '常連さん',
    intro: ['（喫茶店の常連さんに声をかけられた。）', '週末に写真を撮りに行く集まりがあるんだけど、一緒にどう？'],
    prompt: 'どうする？',
    choices: [
      { id: 'join', label: '参加する', result: ['仕事以外の仲間ができ、週末が楽しみになった。'], score: { ties: 2 }, memory: '週末は写真仲間と出かけるのが楽しみになった。' },
      { id: 'decline', label: '一人の時間を大切にする', result: ['一人で本を読む週末も、悪くない。'], score: { growth: 1 } },
    ],
  }),
  event({
    id: 'story.middle.invoice', title: '振込先の変更', category: 'security', speaker: '部下',
    intro: ['取引先から「振込先の口座が変わったので、今日中にこちらへ」とメールが来ました。', '送ってきたアドレスも、いつもの担当者の名前です。'],
    prompt: 'どうする？',
    choices: [
      { id: 'call', label: '取引先に電話して確かめる', result: ['いつもの番号に電話すると、「口座は変えていません」と言われた。', 'メールアドレスは、一文字だけ違う偽物だった。'],
        score: { judgment: 'safe', ties: 1 }, memory: '振込先の変更メールは、電話で確かめて詐欺を防いだ。' },
      { id: 'pay', label: '急いでいるので、そのまま振り込む', result: ['振り込んだ。', '翌週、取引先から「代金がまだ届いていない」と連絡が来た。お金はだまし取られていた。'],
        score: { judgment: 'risky', damage: true }, memory: '振込先の変更メールを信じて、会社のお金をだまし取られた。' },
    ],
  }),
  event({
    id: 'story.middle.invoice-aftermath', title: 'だまし取られたお金', category: 'security', speaker: '上司',
    intro: ['振込の件、どうなっているんだ？'],
    prompt: 'どうする？',
    choices: [
      { id: 'report', label: '正直に報告し、銀行と警察にすぐ連絡する', result: ['すぐに銀行と警察へ連絡し、口座を止めてもらえた。一部のお金は戻った。', '処分は減給で済んだ（-100,000円）。'],
        score: { response: true, moneyYen: -100_000 }, memory: 'だまし取られた件は正直に報告し、すぐ銀行と警察に連絡した。' },
      { id: 'hide', label: '自分のせいではないと黙っている', result: ['黙っているうちに、お金はすべて引き出されていた。', '後で分かり、信用を失って降格になった（-500,000円）。'],
        score: { response: false, ties: -2, moneyYen: -500_000 }, memory: 'だまし取られた件を黙っていて、信用を失った。' },
    ],
  }),
  event({
    id: 'story.middle.parents', title: '親のこと', category: 'daily', speaker: STORY_MOTHER_NAME,
    intro: ['最近、足が弱ってきてね。一人で買い物に行くのも大変になってきたよ。'],
    prompt: 'どうする？',
    choices: [
      { id: 'together', label: '一緒に暮らす', result: ['実家に戻って、一緒に暮らすことにした。にぎやかな毎日になった。'], score: { ties: 2, moneyYen: -100_000 }, memory: '年老いた母と一緒に暮らした。' },
      { id: 'service', label: '介護サービスを相談する', result: ['地域の窓口に相談して、ヘルパーさんに来てもらうことにした。週末は顔を見に行く。'], score: { ties: 1, moneyYen: -300_000 }, memory: '介護サービスを使いながら、週末は母に会いに行った。' },
    ],
  }),

  // ── 老後 ──
  event({
    id: 'story.senior.reunion', title: '昔の友達', category: 'daily', speaker: '昔の友達',
    intro: ['（喫茶店で、中学のころの友達にばったり会った。）', '久しぶり！ 部活のころの話、覚えてる？'],
    prompt: 'どうする？',
    choices: [
      { id: 'talk', label: '昔話に花を咲かせる', result: ['気づけば日が暮れていた。来月また会う約束をした。'], score: { ties: 1 } },
      { id: 'phone', label: 'スマホで連絡先を交換する', result: ['連絡先を交換した。孫の写真を送り合う仲になった。'], score: { ties: 1 } },
    ],
  }),
  event({
    id: 'story.senior.refund-call', title: '還付金の電話', category: 'security', speaker: '市役所を名乗る人',
    intro: ['（家の電話が鳴った。）', 'こちら市役所です。医療費の払い戻しがあります。今日が期限なので、近くのATMに行ってください。操作をご案内します。'],
    prompt: 'どうする？',
    choices: [
      { id: 'family', label: 'いったん切って、家族に相談する', result: ['電話を切って家族に相談した。', '「ATMでお金が戻ることはないよ。それは詐欺」と教えてくれた。市役所に聞くと、そんな連絡はしていなかった。'],
        score: { judgment: 'safe', ties: 1 }, memory: '「お金が戻る」という電話は、家族に相談して詐欺だと分かった。' },
      { id: 'atm', label: '言われたとおりATMへ行く', result: ['言われるままにATMを操作した。', '……払い戻しを受けるはずが、自分の口座から30万円を振り込んでいた。'],
        score: { judgment: 'risky', damage: true, moneyYen: -300_000 }, memory: '「お金が戻る」という電話を信じて、ATMで30万円を振り込んでしまった。' },
    ],
  }),
  event({
    id: 'story.senior.refund-aftermath', title: '振り込んでしまったお金', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（あの電話は詐欺だったと、テレビのニュースで気づいた。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'police', label: 'すぐ警察と銀行に連絡する', result: ['すぐ連絡したので、相手の口座が止められた。', '後日、10万円が戻ってきた。'],
        score: { response: true, moneyYen: 100_000 }, memory: '詐欺に気づいてすぐ警察と銀行に連絡し、一部を取り戻した。' },
      { id: 'silent', label: '家族に知られたくないので黙っている', result: ['黙っていると、また別の「市役所」から電話がかかってきた……。'],
        score: { response: false, ties: -1 }, memory: '詐欺にあったことを誰にも言えなかった。' },
    ],
  }),
  event({
    id: 'story.senior.checkup', title: '健康相談', category: 'daily', speaker: '薬剤師',
    intro: ['最近、体の調子はどうですか？ 年に一度は健康診断を受けてくださいね。'],
    prompt: 'どうする？',
    choices: [
      { id: 'walk', label: '毎日散歩を始める', result: ['毎朝、川沿いを歩くのが日課になった。'], score: { growth: 1 } },
      { id: 'checkup', label: '健康診断の予約をする', result: ['診断の結果は良好だった。ひと安心。'], score: { growth: 1 } },
    ],
  }),
  event({
    id: 'story.senior.grandchild', title: '孫とスマホ', category: 'daily', speaker: '孫',
    intro: ['ねえ、スマホの使い方を教えて！ 初めて自分のスマホを買ってもらったんだ。'],
    prompt: '何を伝える？',
    choices: [
      { id: 'safety', label: '怪しいメールやサイトの見分け方', result: ['これまでの経験を話した。孫は真剣な顔で聞いていた。', '「困ったら、すぐ大人に相談するんだよ」'], score: { ties: 1, growth: 1 }, memory: '孫に、自分の経験から怪しいメールやサイトの見分け方を教えた。' },
      { id: 'fun', label: '写真の撮り方や楽しい使い方', result: ['一緒に家族の写真を撮った。孫は大喜びだった。'], score: { ties: 1 }, memory: '孫と一緒に家族の写真を撮った。' },
    ],
  }),
];
