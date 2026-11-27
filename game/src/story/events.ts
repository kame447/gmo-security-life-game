/**
 * ストーリーで使う人生イベント（docs/features/story.md）。仕組みは events/ の人生イベント基盤を使う。
 * きっかけ（trigger.eventKey）は 'story.*' でマップ上の NPC には付いておらず、StoryDirector が begin() で始める。
 *
 * 選択肢の score は評価（Issue #62、score.ts）と所持金の増減に、memory は最後の振り返りに使う。
 * セキュリティの出来事は SEC-001〜015（docs/events/security-events.md）をすべて使う。導入文に見抜くための手がかりを入れ、
 * 間違えた選択は後の出来事（config.ts の when）として返る。テストで分岐を通せるよう、危ない選択肢を先頭に置く。
 * 中身・金額は試作。
 */
import { STORY_ADVANCE_EVENT, STORY_ADVANCE_GO, STORY_BIKE, STORY_MOTHER_NAME, STORY_SELF_NAME } from './config';
import type { StoryEventDef } from './score';

const yen = (value: number) => `${value.toLocaleString('ja-JP')}円`;
const event = (def: Omit<StoryEventDef, 'trigger'>): StoryEventDef => ({ ...def, trigger: { eventKey: def.id } });

export const STORY_EVENTS: readonly StoryEventDef[] = [
  // ── 序章 ──
  event({
    id: STORY_BIKE.eventId, title: 'スマホで自転車を買う', category: 'security', speaker: STORY_MOTHER_NAME, // SEC-002
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
      { id: 'site-a', label: `A：はやてサイクル（${yen(STORY_BIKE.fairPriceYen)}）`,
        result: ['会社の住所と電話番号を確かめてから注文した。', `おつりは${yen(STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen)}。`],
        score: { judgment: 'safe' }, memory: '初めての通販で、店の情報を確かめてから自転車を買った。' },
      { id: 'site-b', label: 'B：まちかどバイク（24,800円）',
        result: ['予算が足りなくて買えなかった。', 'A のサイトの会社情報を確かめて、A で注文した。'],
        score: { judgment: 'safe' }, memory: '初めての通販で、店の情報を確かめてから自転車を買った。' },
      { id: STORY_BIKE.fakeChoiceId, label: `C：スーパー激安セール（${yen(STORY_BIKE.fakePriceYen)}）`,
        result: ['安い！ すぐに注文して、代金を振り込んだ。', '……何日たっても、自転車は届かない。メールを送っても返事が来ない。'],
        score: { judgment: 'risky', damage: true, response: true }, memory: '初めての通販で偽サイトにだまされた。すぐ母に相談して、見分け方を教わった。' },
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
    id: 'story.jh.first-account', title: '初めてのアカウント', category: 'security', speaker: STORY_SELF_NAME, // SEC-001・014 の始まり
    intro: [
      '（友達がやっているゲーム「ゲームステーション」に登録することにした。）',
      '登録画面：「パスワード（8文字以上）」「※他のサービスと同じパスワードは使わないでください」',
      'いつも使っているのは、自分の誕生日の「20130415」。自転車を買った通販サイトも、これにした。',
    ],
    prompt: 'パスワードはどうする？',
    choices: [
      { id: 'reuse', label: 'いつもの誕生日のパスワードにする', result: ['覚えやすいので、いつものパスワードにした。'],
        score: { judgment: 'risky' }, memory: '中学で、誕生日のパスワードをいくつものサービスで使い回した。' },
      { id: 'unique', label: '長くて、ここだけのパスワードにする', result: ['好きな言葉を3つつなげた長いパスワードを作り、ここでしか使わないことにした。'],
        score: { judgment: 'safe', growth: 1 }, memory: '中学から、サービスごとに別の長いパスワードを使った。' },
    ],
  }),
  event({
    id: 'story.jh.app-permission', title: '友達に勧められたアプリ', category: 'security', speaker: STORY_SELF_NAME, // SEC-011
    intro: [
      '（友達に勧められた無料のパズルゲームを入れると、こんな画面が出た。）',
      '「このアプリに次の許可を与えますか？ ・連絡先 ・位置情報（常に） ・SMSの送信」',
      'パズルを解くだけのゲームなのに……？ 提供元は聞いたことのない名前だ。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'allow', label: '全部許可する', result: ['早く遊びたくて、全部「許可」を押した。'],
        score: { judgment: 'risky' }, memory: 'パズルのアプリに、連絡先や位置情報まで全部許可した。' },
      { id: 'deny', label: 'いらない許可は断り、提供元と口コミを調べる', result: ['許可は全部断った。調べると「連絡先を抜き取る」という口コミがあったので、アプリを消した。'],
        score: { judgment: 'safe', growth: 1 }, memory: 'パズルのアプリが連絡先を求めるのを怪しみ、許可しなかった。' },
    ],
  }),
  event({
    id: 'story.jh.gift', title: '友達の誕生日', category: 'daily', speaker: STORY_SELF_NAME,
    intro: ['（来週は仲のいい友達の誕生日。本屋でプレゼントを探している。）'],
    prompt: '何を贈る？',
    choices: [
      { id: 'book', label: '好きな作家の新刊（1,500円）', result: ['「ずっと欲しかったやつ！」と大喜びしてくれた。'], score: { ties: 1, moneyYen: -1_500 }, memory: '友達の誕生日に、好きな作家の新刊を贈った。' },
      { id: 'card', label: '手作りのカード', result: ['照れくさそうに、でも大事そうにカードをしまっていた。'], score: { ties: 1 } },
    ],
  }),
  event({
    id: 'story.jh.os-update', title: 'スマホのアップデート', category: 'security', speaker: STORY_SELF_NAME, // SEC-009
    intro: [
      '（スマホの「設定」に通知が出た。）',
      '「ソフトウェア・アップデート：重要なセキュリティの修正が含まれています。更新には約30分かかります」',
      '今夜はゲームのイベントがあるのに……。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'later', label: '「後で」を押す（この先もずっと）', result: ['「後で」を押した。次の日も、その次の日も……。'],
        score: { judgment: 'risky' }, memory: 'スマホのアップデートを「後で」のまま放っておいた。' },
      { id: 'now', label: '寝る前に充電しながら更新する', result: ['寝る前に充電しながら更新した。朝には終わっていた。'],
        score: { judgment: 'safe' }, memory: 'スマホのアップデートは、通知が来たらすぐ済ませた。' },
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
    id: 'story.hs.contact-spam', title: '友達に届いた怪しいSMS', category: 'security', speaker: '中学からの友達', // SEC-011 の結果
    intro: [
      'ねえ、お前の番号から「当選しました！ こちらで受け取り手続きを」ってSMSが来たんだけど。',
      '（中学のときに全部許可したパズルのアプリが、連絡先を抜き取ってSMSを送っていたらしい……。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'ignore', label: '自分は送っていないので放っておく', result: ['放っておいたら、SMSのリンクを開いた友達のスマホまでおかしくなった。', '「お前のせいだ」と言われ、気まずくなった。'],
        score: { response: false, damage: true, ties: -1 }, memory: '連絡先を抜き取られて友達に迷惑SMSが届いたのに、放っておいた。' },
      { id: 'fix', label: 'アプリを消して許可を見直し、友達みんなに知らせる', result: ['アプリを消して、他のアプリの許可も見直した。', '友達には「リンクは開かないで」と知らせて謝った。'],
        score: { response: true, damage: true, growth: 1 }, memory: '抜き取られた連絡先のせいで迷惑SMSが届き、すぐアプリを消して友達に知らせた。' },
    ],
  }),
  event({
    id: 'story.hs.phone-hijack', title: 'おかしくなったスマホ', category: 'security', speaker: STORY_SELF_NAME, // SEC-009 の結果
    intro: [
      '（最近スマホが熱く、電池がすぐ減る。見覚えのないアプリまで入っている。）',
      '（ニュースでは「古いバージョンのまま使っているスマホが、修正済みの弱点を突かれている」と言っていた。中学のときから、アップデートは「後で」のままだ……。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'keep', label: '使えるのでそのまま使う', result: ['そのまま使っていたら、SNSに勝手に広告が投稿されていた。', '写真も知らない所へ送られていたらしい。'],
        score: { response: false, damage: true, ties: -1 }, memory: 'アップデートを怠ったスマホを乗っ取られ、そのまま使い続けた。' },
      { id: 'reset', label: '家族に相談し、初期化して最新にする', result: ['家族に相談して、データを移してから初期化し、最新にした。', 'これからは通知が来たらすぐ更新することにした。'],
        score: { response: true, damage: true }, memory: 'アップデートを怠ってスマホを乗っ取られ、家族と初期化して立て直した。' },
    ],
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
    id: 'story.hs.club-culture', title: '部活の展示', category: 'daily', speaker: '部活の仲間',
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
    id: 'story.hs.sns-profile', title: 'SNSのプロフィール', category: 'security', speaker: STORY_SELF_NAME, // SEC-010
    intro: [
      '（クラスのみんながやっているSNSに登録した。プロフィールの入力欄がたくさんある。）',
      '「誕生日」「ペットの名前」「出身中学」「最寄り駅」',
      '（あれ？ 登録のときに決めた「パスワードを忘れたときの秘密の質問」は「ペットの名前は？」だった。）',
    ],
    prompt: 'どこまで公開する？',
    choices: [
      { id: 'all', label: '全部埋めて、誰でも見られるようにする', result: ['全部埋めて公開した。愛犬「モモ」の写真もたくさん載せた。'],
        score: { judgment: 'risky' }, memory: 'SNSに誕生日やペットの名前まで全部公開した。' },
      { id: 'minimal', label: 'ニックネームだけにして、友達だけに公開する', result: ['ニックネームだけにして、公開は友達だけにした。'],
        score: { judgment: 'safe' }, memory: 'SNSのプロフィールは最低限にして、友達だけに公開した。' },
    ],
  }),
  event({
    id: 'story.hs.trip', title: '修学旅行', category: 'daily', speaker: '班のリーダー',
    intro: ['（修学旅行の朝。駅に班のみんなが集まった。）', '自由行動、どこを回るか決めようよ。'],
    prompt: 'どうする？',
    choices: [
      { id: 'plan', label: '自分で計画を立てる', result: ['時刻表を調べて回る順番を決めた。みんなに「助かった！」と言われた。'], score: { growth: 1, ties: 1 }, memory: '修学旅行で班の計画を立て、みんなを案内した。' },
      { id: 'follow', label: 'みんなに合わせる', result: ['行き先はみんなにお任せ。おいしいものをたくさん食べた。'], score: { ties: 1 } },
    ],
  }),
  event({
    id: 'story.hs.trip-photo', title: '勝手に載せられた写真', category: 'security', speaker: STORY_SELF_NAME, // SEC-003
    intro: [
      '（修学旅行で、友達に「写真撮っていい？」と聞かれてOKした。）',
      '（ところが、その写真がSNSに全体公開で載っている。宿の名前と、自分の寝顔がはっきり写っている。）',
      '（「撮っていい」とは言ったけど、ネットに載せていいとは言っていない……。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: '気まずいので何も言わない', result: ['何も言わずにおいた。写真はそのまま残った。'],
        score: { judgment: 'risky' }, memory: '友達に無断で載せられた写真を、そのままにした。' },
      { id: 'ask', label: '友達に消してもらい、次は載せる前に聞いてと頼む', result: ['「ごめん、気づかなかった」とすぐ消してくれた。', 'それからは、載せる前にお互い確認するようになった。'],
        score: { judgment: 'safe', ties: 1 }, memory: '無断で載せられた写真は、友達に頼んで消してもらった。' },
    ],
  }),
  event({
    id: 'story.hs.leak-notice', title: 'パスワード流出のお知らせ', category: 'security', speaker: STORY_SELF_NAME, // SEC-001
    intro: [
      '（中学から使っている「ゲームステーション」からメールが届いた。受信トレイで確かめられる。）',
      '差出人は no-reply@gamestation.example。いつもお知らせが届く公式のアドレスで、リンクはなく「公式アプリから変更を」と書いてある。',
      '「同じパスワードを他のサービスで使っている場合は、そちらも変更してください」',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'ignore', label: '面倒なので、そのうち変える', result: ['「そのうち」と思って、そのままにした。'],
        score: { judgment: 'risky' }, memory: 'パスワード流出のお知らせを読んでも、パスワードを変えなかった。' },
      { id: 'change', label: '公式アプリから変え、同じパスワードのサービスも全部変える', result: ['公式アプリからパスワードを変えた。同じパスワードを使っていたサービスも、全部別のものにした。'],
        score: { judgment: 'safe', growth: 1 }, memory: 'パスワード流出のお知らせが来て、すぐ全部のパスワードを変えた。' },
    ],
  }),
  event({
    id: 'story.hs.festival', title: '文化祭', category: 'daily', speaker: 'クラスの委員長',
    intro: ['文化祭の出し物、何がいいと思う？'],
    prompt: '何を提案する？',
    choices: [
      { id: 'cafe', label: '喫茶店', result: ['クラスのみんなでエプロンをそろえて、喫茶店は大盛況！'], score: { ties: 1 }, memory: '文化祭で、クラスの喫茶店を大盛況にした。' },
      { id: 'play', label: '劇', result: ['セリフを覚えるのは大変だったけど、最後は大きな拍手をもらった。'], score: { ties: 1, growth: 1 } },
    ],
  }),
  event({
    id: 'story.hs.photo', title: '文化祭の写真', category: 'security', speaker: STORY_SELF_NAME, // SEC-012
    intro: [
      '（文化祭のクラス写真をSNSに載せようとしている。制服の名札と校門の看板がはっきり写っている。）',
      '投稿画面の下に「公開範囲：全体（誰でも見られます）」と出ている。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'public', label: 'そのまま投稿する', result: ['たくさん「いいね」がついた。', '数日後、知らない人から「○○高校の△△さんだよね？」とメッセージが来た。'],
        score: { judgment: 'risky', damage: true }, memory: '名札が写った写真を全体公開にしてしまい、知らない人に学校と名前を知られた。' },
      { id: 'friends', label: '公開範囲を友達だけにし、名札を隠す', result: ['公開範囲を「友達だけ」に変え、名札も隠してから投稿した。'],
        score: { judgment: 'safe', ties: 1 }, memory: '写真は公開範囲を友達だけにし、名札を隠して載せた。' },
    ],
  }),
  event({
    id: 'story.hs.photo-followup', title: '知らない人からのメッセージ', category: 'security', speaker: '知らない人',
    intro: ['（また、あの人からメッセージが来た。）', '「今度の土曜、駅前で会えない？ 写真の場所、知ってるよ」'],
    prompt: 'どうする？',
    choices: [
      { id: 'ignore', label: '誰にも言わずに放っておく', result: ['放っておいたら、通学の電車で見られている気がするようになった。', '怖くて、しばらく友達と出かけられなくなった。'],
        score: { response: false, ties: -1 }, memory: '知らない人からの誘いを誰にも言えず、しばらく出かけるのが怖くなった。' },
      { id: 'consult', label: '先生と家族に相談し、投稿を消す', result: ['先生と家族に相談した。投稿を消して相手をブロックし、SNSに報告した。', 'それきり連絡は来なくなった。'],
        score: { response: true, ties: 1 }, memory: '知らない人からの誘いは、先生と家族に相談して止められた。' },
    ],
  }),
  event({
    id: 'story.hs.study', title: '受験勉強', category: 'daily', speaker: STORY_SELF_NAME,
    intro: ['（大学受験まであと半年。本屋の参考書コーナーにいる。）'],
    prompt: 'どう勉強する？',
    choices: [
      { id: 'book', label: '参考書を買って一人で進める（2,000円）', result: ['毎日少しずつ進めた。分からないところは先生に聞いた。'], score: { growth: 2, moneyYen: -2_000 } },
      { id: 'group', label: '友達と勉強会を開く', result: ['教え合ううちに、自分の分かっていないところに気づけた。'], score: { growth: 1, ties: 1 }, memory: '受験勉強は友達と教え合って乗り切った。' },
    ],
  }),
  event({
    id: 'story.hs.career', title: '大学で学ぶこと', category: 'daily', speaker: '担任の先生',
    intro: ['大学で何を学びたいか、決まった？'],
    prompt: 'どの学部を目指す？',
    choices: [
      { id: 'info', label: '情報学部', result: ['パソコンやネットの仕組みを学びたい。'], score: { growth: 1 }, memory: '大学では情報を学んだ。' },
      { id: 'econ', label: '経済学部', result: ['お金や社会の仕組みを学びたい。'], score: { growth: 1 }, memory: '大学では経済を学んだ。' },
      { id: 'edu', label: '教育学部', result: ['人に教える仕事に興味がある。'], score: { ties: 1 }, memory: '大学では教育を学んだ。' },
    ],
  }),

  // ── 大学生 ──
  event({
    id: 'story.univ.entrance', title: '大学の新生活', category: 'daily', speaker: 'サークルの先輩',
    intro: ['新入生だよね？ うちのサークル、見学していかない？'],
    prompt: 'どうする？',
    choices: [
      { id: 'circle', label: 'サークルに入る', result: ['一生付き合える友達ができた。'], score: { ties: 2 }, memory: '大学のサークルで、一生の友達ができた。' },
      { id: 'study', label: '勉強に集中する', result: ['授業の後は図書館にこもった。成績は上々だ。'], score: { growth: 2 } },
    ],
  }),
  event({
    id: 'story.univ.secret-question', title: '奪われたSNS', category: 'security', speaker: STORY_SELF_NAME, // SEC-010 の結果
    intro: [
      '（SNSにログインできない。「パスワードは秘密の質問で再設定されました」という通知が残っている。）',
      '（秘密の質問は「ペットの名前は？」。高校のころ、プロフィールに愛犬「モモ」の名前を公開していた……。）',
      '（自分のアカウントから、友達に「お金を貸して」というメッセージが送られている。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'abandon', label: '新しいアカウントを作って、前のは放っておく', result: ['新しいアカウントを作った。', '前のアカウントは、なりすましに使われ続け、友達が2人だまされてしまった。'],
        score: { response: false, damage: true, ties: -2 }, memory: 'ペットの名前を公開していたせいでSNSを乗っ取られ、放っておいて友達がだまされた。' },
      { id: 'recover', label: '運営に本人確認を頼み、友達に知らせ、公開情報を見直す', result: ['運営に本人確認をしてアカウントを取り戻し、友達に「あれは自分じゃない」と知らせた。', '秘密の質問はやめ、2段階認証にした。プロフィールも最低限にした。'],
        score: { response: true, damage: true, growth: 1 }, memory: '公開していたペットの名前からSNSを乗っ取られたが、取り戻して友達に知らせた。' },
    ],
  }),
  event({
    id: 'story.univ.living', title: '一人暮らし', category: 'daily', speaker: STORY_MOTHER_NAME,
    intro: ['大学、隣町でしょう。一人暮らしする？ それとも家から通う？'],
    prompt: 'どうする？',
    choices: [
      { id: 'alone', label: '一人暮らしをする（引っ越し代 150,000円）', result: ['隣町で一人暮らしを始めた。料理も洗濯も自分でやるのは大変だ。'], score: { growth: 2, moneyYen: -150_000 }, memory: '大学で一人暮らしを始め、自分で暮らす大変さを知った。' },
      { id: 'home', label: '家から電車で通う', result: ['家から通うことにした。電車の中は勉強の時間だ。'], score: { ties: 1 } },
    ],
  }),
  event({
    id: 'story.univ.shared-pc', title: '情報室のパソコン', category: 'security', speaker: STORY_SELF_NAME, // SEC-006
    intro: [
      '（大学の情報室の共用パソコンで、SNSとメールにログインしてレポートを印刷した。授業まであと1分。）',
      '（画面の右上には自分の名前が出たまま。ログインのとき「ログイン状態を保存する」にもチェックが入っていた。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: '急いでいるので、そのまま席を立つ', result: ['そのまま走って教室へ向かった。'],
        score: { judgment: 'risky' }, memory: '大学の共用パソコンで、ログインしたまま席を立った。' },
      { id: 'logout', label: '遅れてもログアウトし、ブラウザを閉じる', result: ['ログアウトしてブラウザを閉じてから教室へ。少し遅れたけど、ひと安心。'],
        score: { judgment: 'safe' }, memory: '共用パソコンでは、急いでいても必ずログアウトした。' },
    ],
  }),
  event({
    id: 'story.univ.shared-pc-aftermath', title: '勝手な投稿', category: 'security', speaker: 'サークルの友達',
    intro: ['ねえ、SNSに変なこと書いてたけど大丈夫？ ゼミの先生の悪口になってたよ。', '（情報室のパソコンで、ログインしたままだった……。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: '自分じゃないので放っておく', result: ['放っておいたら、先生の耳にも入ってしまった。誤解を解くのに苦労した。'],
        score: { response: false, damage: true, ties: -1 }, memory: '共用パソコンでログインしたまま離れ、勝手に投稿された。放っておいて誤解された。' },
      { id: 'fix', label: '投稿を消し、全端末からログアウトし、先生に事情を話す', result: ['投稿を消して、設定から全部の端末をログアウトさせた。', '先生にも事情を話して謝った。'],
        score: { response: true, damage: true }, memory: '共用パソコンから勝手に投稿されたが、すぐ消して全端末をログアウトさせた。' },
    ],
  }),
  event({
    id: 'story.univ.part-time', title: '喫茶店のアルバイト', category: 'daily', speaker: '喫茶店のマスター',
    intro: ['今日からよろしくね。シフトはどれくらい入れる？'],
    prompt: 'どうする？',
    choices: [
      { id: 'many', label: '週5日入る', result: ['よく働いた。貯金が増えた（+200,000円）。でも授業中に眠くなる日もあった。'], score: { moneyYen: 200_000 } },
      { id: 'few', label: '週2日にして、勉強や友達との時間も大切にする', result: ['常連さんと顔見知りになった（+80,000円）。'], score: { moneyYen: 80_000, ties: 1 }, memory: '喫茶店のアルバイトで、常連さんと仲良くなった。' },
    ],
  }),
  event({
    id: 'story.univ.free-wifi', title: '喫茶店の無料Wi-Fi', category: 'security', speaker: STORY_SELF_NAME, // SEC-004
    intro: [
      '（バイト代が入ったか、銀行のサイトで確かめたい。スマホの通信量は残りわずか。）',
      '（Wi-Fiの一覧に、鍵のマークがない「FREE_CAFE_WIFI」がある。店の掲示に書いてある名前は「Kissa-Guest」だ。）',
      '（つないで銀行のログイン画面を開くと、アドレスが「http://」で始まり、鍵のマークが出ていない。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'login', label: 'そのままIDとパスワードを入れる', result: ['ログインして残高を確かめた。ちゃんと入っていた。'],
        score: { judgment: 'risky' }, memory: '鍵のない無料Wi-Fiで、http の銀行サイトにログインした。' },
      { id: 'mobile', label: 'Wi-Fiを切り、自分の回線で銀行の公式アプリから見る', result: ['Wi-Fiを切って、自分の回線で公式アプリを開いた。', '後で聞くと「FREE_CAFE_WIFI」は店のものではなかった。'],
        score: { judgment: 'safe', growth: 1 }, memory: '店のものではない無料Wi-Fiを見抜き、銀行は自分の回線で使った。' },
    ],
  }),
  event({
    id: 'story.univ.captcha', title: 'チケットサイトの確認', category: 'security', speaker: STORY_SELF_NAME, // SEC-005
    intro: [
      '（好きなバンドのライブ。検索の一番上に出た「チケット最安値」というサイトを開いた。公式サイトとはアドレスが違う。）',
      '「私はロボットではありません」の確認が出た。でも、いつもの画像を選ぶ問題ではない。',
      '「確認のため、Windowsキー＋R を押し、Ctrl＋V で貼り付けて Enter を押してください」',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'follow', label: '書いてあるとおりに操作する', result: ['言われたとおりに操作した。画面が一瞬黒くなって、元に戻った。'],
        score: { judgment: 'risky', damage: true }, memory: '偽のロボット確認に従ってキー操作をし、パソコンにウイルスを入れてしまった。' },
      { id: 'close', label: '閉じて、公式サイトから買う', result: ['本物の確認がキー操作を求めることはない。ページを閉じて、公式サイトからチケットを買った。'],
        score: { judgment: 'safe', growth: 1 }, memory: 'キー操作をさせる偽のロボット確認を見抜き、公式サイトで買った。' },
    ],
  }),
  event({
    id: 'story.univ.pc-infected', title: '開けなくなったファイル', category: 'security', speaker: STORY_SELF_NAME,
    intro: [
      '（パソコンのファイルが全部開けない。画面に「元に戻したければ5万円を払え」と出ている。）',
      '（あのチケットサイトでキー操作をしたときに、悪いプログラムを動かしてしまったらしい……。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'pay', label: '言われたとおり5万円を払う', result: ['払ったが、ファイルは戻らなかった。'],
        score: { response: false, moneyYen: -50_000 }, memory: 'ウイルスに「払えば戻す」と言われて払ったが、何も戻らなかった。' },
      { id: 'ask', label: '大学の情報窓口に相談し、パスワードを変える', result: ['窓口で初期化してもらい、大学の保存領域から卒論のデータを戻せた。', 'パソコンに保存していたパスワードは全部変えた。'],
        score: { response: true, growth: 1 }, memory: 'ウイルスに感染したパソコンは、大学の窓口に相談して立て直した。' },
    ],
  }),
  event({
    id: 'story.univ.phishing', title: 'カード会社からのメール', category: 'security', speaker: STORY_SELF_NAME, // SEC-008
    intro: [
      '（初めて作ったクレジットカードの会社から「利用を停止しました」というメールが届いた。受信トレイで確かめられる。）',
      '差出人は support@card-security-check.example。いつものカード会社は card.example だ。',
      'リンクの文字は「https://www.card.example/login」なのに、実際の行き先は別のアドレスになっている。カード番号と暗証番号を入れろ、とある。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'link', label: 'リンクを開いて入力する', result: ['あわてて入力した。', '……入力したあとの画面は真っ白になった。'],
        score: { judgment: 'risky', damage: true, moneyYen: -50_000 }, memory: 'カード会社を装ったメールのリンクにカード番号を入力し、5万円を使われた。' },
      { id: 'ignore', label: '無視する', result: ['心当たりがないので放っておいた。'], score: { judgment: 'normal' } },
      { id: 'official', label: 'カード会社の公式アプリで確かめる', result: ['公式アプリを開くと、カードは普通に使える状態だった。メールは偽物だった。'],
        score: { judgment: 'safe' }, memory: 'カード会社を装ったメールは、差出人とリンク先を確かめて見破った。' },
    ],
  }),
  event({
    id: 'story.univ.card-fraud', title: '身に覚えのない請求', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（カードの明細に、身に覚えのない買い物が5万円分も載っている。）', 'あのメールのせいだ……。'],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: '恥ずかしいので誰にも言わない', result: ['誰にも言わずにいたら、翌月もさらに5万円使われていた。'],
        score: { response: false, moneyYen: -50_000 }, memory: '不正利用を誰にも言わずにいて、被害が広がった。' },
      { id: 'call', label: 'すぐカード会社に電話し、警察にも相談する', result: ['カードを止めてもらい、警察にも相談した。', '不正利用と認められ、3万円が戻ってきた。'],
        score: { response: true, moneyYen: 30_000 }, memory: '不正利用に気づいてすぐカード会社に連絡し、一部を取り戻した。' },
    ],
  }),
  event({
    id: 'story.univ.footprint', title: '面接で言われたこと', category: 'security', speaker: '面接官', // SEC-003 の結果
    intro: [
      'SNSで、あなたの高校時代の写真を見かけましたよ。修学旅行ですか？ 寝顔まで載っていましたね。',
      '（あのとき、友達に消してもらわなかった写真だ。名前で検索すると、今でも出てくる……。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: '笑ってごまかし、そのままにする', result: ['その会社には落ちてしまった。写真は今も検索で出てくる。'],
        score: { response: false, damage: true, growth: -1 }, memory: '無断で載せられた写真を放っておき、就職の面接で指摘された。' },
      { id: 'delete', label: '友達に連絡して消してもらい、検索結果の削除も申し込む', result: ['久しぶりに友達に連絡して消してもらった。検索結果の削除も申し込んだ。', '「あのときはごめん」と言われ、また仲良くなった。'],
        score: { response: true, damage: true, ties: 1 }, memory: '面接で指摘された昔の写真を、友達に頼んで消してもらった。' },
    ],
  }),
  event({
    id: 'story.univ.job-hunt', title: '就職活動', category: 'daily', speaker: 'キャリアセンターの職員',
    intro: ['そろそろ就職活動の時期だね。どんな会社を受けるか決めた？'],
    prompt: 'どこを目指す？',
    choices: [
      { id: 'it', label: 'IT企業', result: ['いくつも面接を受けて、隣町のIT企業に内定をもらった。'], score: { growth: 1 }, memory: '隣町のIT企業に就職した。' },
      { id: 'local', label: '地元の会社', result: ['生まれ育った町の役に立ちたい。地元の会社に内定をもらった。'], score: { ties: 1 }, memory: '地元の会社に就職した。' },
    ],
  }),
  event({
    id: 'story.univ.thesis', title: '卒業論文', category: 'daily', speaker: 'ゼミの先生',
    intro: ['卒業論文のテーマ、決まった？ 本屋で資料を探しておいで。'],
    prompt: 'どう取り組む？',
    choices: [
      { id: 'deep', label: '一つのテーマをとことん調べる', result: ['夜遅くまで資料を読み込んだ。先生に「いい論文だ」と言われた。'], score: { growth: 2 }, memory: '卒業論文を、とことん調べて書き上げた。' },
      { id: 'team', label: 'ゼミの仲間と意見を出し合う', result: ['仲間と議論しながら仕上げた。打ち上げは朝まで続いた。'], score: { growth: 1, ties: 1 } },
    ],
  }),

  // ── 社会人 ──
  event({
    id: 'story.work.first-day', title: '入社式', category: 'daily', speaker: '上司',
    intro: ['入社おめでとう。最初の1か月は研修だよ。分からないことは何でも聞いてね。'],
    prompt: 'どう過ごす？',
    choices: [
      { id: 'ask', label: '先輩に積極的に質問する', result: ['先輩たちとすぐに打ち解けた。'], score: { ties: 1, growth: 1 } },
      { id: 'self', label: 'まず自分で調べる', result: ['マニュアルを読み込んで、研修のテストで一番を取った。'], score: { growth: 1 } },
    ],
  }),
  event({
    id: 'story.work.account-sale', title: '給与口座の手続き', category: 'security', speaker: '人事部を名乗る人', // SEC-013
    intro: [
      '（SNSのメッセージに、人事部を名乗る人から連絡が来た。会社のメールではない。）',
      '「給与振込用にA銀行で口座を作ってもらいましたが、A銀行だと手数料がかかるので、B銀行で作り直してください。」',
      '「A銀行の通帳とキャッシュカードは不要になるので、こちらで処分します。下の住所へ郵送してください。」',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'send', label: '言われたとおり通帳とカードを郵送する', result: ['人事部の言うことだし、と郵送した。'],
        score: { judgment: 'risky', damage: true }, memory: '人事部を名乗る人に、通帳とキャッシュカードを送ってしまった。' },
      { id: 'check', label: '会社の人事部に電話して確かめる', result: ['会社の代表番号から人事部に確かめると、「そんな連絡はしていません。口座を渡すのは犯罪になります」と言われた。'],
        score: { judgment: 'safe' }, memory: '口座を渡させる偽の人事部の連絡を、会社に確かめて見破った。' },
    ],
  }),
  event({
    id: 'story.work.account-frozen', title: '警察からの電話', category: 'security', speaker: '警察',
    intro: ['あなた名義のA銀行の口座が、詐欺のお金の受け取りに使われています。', '（あのとき送った通帳とカードだ……。口座は凍結された。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'deny', label: '知らないと言い張る', result: ['話がこじれて、何度も呼び出された。会社にも知られてしまった。'],
        score: { response: false, ties: -1 }, memory: '渡した口座が詐欺に使われ、知らないと言い張って話がこじれた。' },
      { id: 'explain', label: 'だまされた経緯を正直に話し、銀行にも届け出る', result: ['だまされた経緯を正直に話し、メッセージの記録を見せた。', '銀行にも届け出た。それでも、しばらく新しい口座は作れないと言われた。'],
        score: { response: true }, memory: '渡した口座が詐欺に使われ、正直に経緯を話して届け出た。' },
    ],
  }),
  event({
    id: 'story.work.welcome', title: '歓迎会', category: 'daily', speaker: '同期',
    intro: ['（喫茶店を貸し切って、新人の歓迎会が開かれた。）', '一言あいさつ、よろしく！'],
    prompt: 'どうする？',
    choices: [
      { id: 'speech', label: '趣味の話で場を盛り上げる', result: ['意外な趣味が受けて、先輩と話が弾んだ。'], score: { ties: 2 }, memory: '歓迎会で、職場の人たちと打ち解けた。' },
      { id: 'short', label: '短くまとめる', result: ['落ち着いたあいさつで、まじめな新人だと思われた。'], score: { ties: 1 } },
    ],
  }),
  event({
    id: 'story.work.account-takeover', title: '会社のアカウントへの不正ログイン', category: 'security', speaker: '情報システム部', // SEC-014
    intro: [
      'あなたの社内アカウントに、海外から不正ログインがありました。顧客の名簿が持ち出されています。',
      '（社内アカウントのパスワードも、中学から使い回してきた誕生日のパスワードにしていた。',
      '高校のとき「パスワードが流出した」とお知らせが来たのに、変えなかった……。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'hide', label: '自分のパスワードだけこっそり変える', result: ['こっそり変えたが、調査で使い回しが分かった。', '報告しなかったことも問題になり、減給になった（-300,000円）。'],
        score: { response: false, damage: true, ties: -2, moneyYen: -300_000 }, memory: '使い回したパスワードのせいで会社の名簿が漏れ、報告せずに隠して減給になった。' },
      { id: 'report', label: 'すぐ報告し、全部のパスワードを変えて2段階認証にする', result: ['すぐ報告して調査に協力した。全部のサービスのパスワードを別々にし、2段階認証にした。', '被害は最小限で済んだが、始末書を書いた。'],
        score: { response: true, damage: true }, memory: '使い回したパスワードのせいで会社の名簿が漏れ、すぐ報告して被害を抑えた。' },
    ],
  }),
  event({
    id: 'story.work.bank-fraud', title: '口座からの不正送金', category: 'security', speaker: '銀行', // SEC-004 の結果
    intro: [
      'お客さまの口座から、ネットバンキングで20万円が送金されています。お心当たりはありますか？',
      '（大学のころ、喫茶店の鍵のないWi-Fiで、http の銀行サイトにログインしたことがある。あれから同じパスワードのままだ……。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: '忙しいので後で考える', result: ['後回しにしているうちに、さらに送金されていた（-200,000円）。'],
        score: { response: false, damage: true, moneyYen: -400_000 }, memory: '大学で無料Wi-Fiから銀行にログインした結果、不正送金され、対応が遅れた。' },
      { id: 'report', label: 'すぐ銀行と警察に連絡し、パスワードを変える', result: ['すぐ口座を止めてもらい、警察に届け出た。補償で10万円が戻った（-100,000円）。'],
        score: { response: true, damage: true, moneyYen: -100_000 }, memory: '大学で無料Wi-Fiから銀行にログインした結果、不正送金されたが、すぐ連絡して一部が戻った。' },
    ],
  }),
  event({
    id: 'story.work.mistake', title: '仕事の失敗', category: 'daily', speaker: '先輩',
    intro: ['取引先に送る書類の数字、間違ってたみたい。'],
    prompt: 'どうする？',
    choices: [
      { id: 'report', label: 'すぐ上司に報告する', result: ['すぐ報告したおかげで、大事にならずに済んだ。「よく言ってくれた」と言われた。'], score: { ties: 1, growth: 1 } },
      { id: 'hide', label: 'こっそり直す', result: ['こっそり直そうとしたが、取引先から問い合わせが来てしまった。報告は早いほうがいい。'] },
    ],
  }),
  event({
    id: 'story.work.usb', title: '拾ったUSBメモリ', category: 'security', speaker: STORY_SELF_NAME, // SEC-007
    intro: [
      '（会社の駐車場に、USBメモリが落ちている。ラベルには「○○商事（ライバル会社） 新製品計画」と書いてある。）',
      '（誰が落としたのか分からない。ライバル会社の資料が、なぜうちの駐車場に……？）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'plug', label: '自分のパソコンに挿して中を見る', result: ['挿したとたん、パソコンの動きがおかしくなった。', '社内のネットワークにウイルスが広がり、会社は丸一日仕事ができなかった。'],
        score: { judgment: 'risky', damage: true }, memory: 'ライバル会社の名前が書かれたUSBメモリを挿して、会社にウイルスを広げてしまった。' },
      { id: 'report', label: '開かずに情報システム部に渡す', result: ['調べると、ウイルスが仕込まれていた。', '「わざと気になる名前を書いて拾わせる手口だよ。開かなくて正解」と言われた。'],
        score: { judgment: 'safe' }, memory: '拾ったUSBメモリは開かずに届け、会社を守った。' },
    ],
  }),
  event({
    id: 'story.work.partner', title: '喫茶店での約束', category: 'daily', speaker: '大切な人',
    intro: ['（喫茶店で、長く付き合ってきた大切な人と向かい合っている。）', 'これからのこと、ちゃんと話したくて。'],
    prompt: 'どうする？',
    choices: [
      { id: 'marry', label: '結婚しよう', result: ['二人で新しい家族を作ることにした。'], score: { ties: 2, moneyYen: -300_000 }, memory: '大切な人と家族になった。' },
      { id: 'career', label: '今はお互いの仕事を大切にしたい', result: ['よく話し合って、それぞれの道を歩むことにした。'], score: { growth: 1 }, memory: '仕事と自分の時間を大切に生きることにした。' },
    ],
  }),
  event({
    id: 'story.work.invoice', title: '振込先の変更', category: 'security', speaker: '後輩',
    intro: [
      '取引先から「振込先の口座が変わったので、今日中にこちらへ」とメールが来ました。',
      '差出人の名前はいつもの担当者ですが、アドレスが tanaka@torihiki.example ではなく tanaka@torihlki.example です。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'pay', label: '急いでいるので、そのまま振り込む', result: ['振り込んだ。', '翌週、取引先から「代金がまだ届いていない」と連絡が来た。お金はだまし取られていた。'],
        score: { judgment: 'risky', damage: true }, memory: '振込先の変更メールを信じて、会社のお金をだまし取られた。' },
      { id: 'call', label: 'いつもの電話番号で取引先に確かめる', result: ['電話すると「口座は変えていません」。アドレスは「i」が「l」になった偽物だった。'],
        score: { judgment: 'safe', ties: 1 }, memory: '振込先の変更メールは、アドレスの違いに気づき電話で確かめて防いだ。' },
    ],
  }),
  event({
    id: 'story.work.invoice-aftermath', title: 'だまし取られたお金', category: 'security', speaker: '上司',
    intro: ['振込の件、どうなっているんだ？'],
    prompt: 'どうする？',
    choices: [
      { id: 'hide', label: '自分のせいではないと黙っている', result: ['黙っているうちに、お金はすべて引き出されていた。', '後で分かり、信用を失って降格になった（-500,000円）。'],
        score: { response: false, ties: -2, moneyYen: -500_000 }, memory: 'だまし取られた件を黙っていて、信用を失った。' },
      { id: 'report', label: '正直に報告し、銀行と警察にすぐ連絡する', result: ['すぐに銀行と警察へ連絡し、口座を止めてもらえた。一部のお金は戻った。', '処分は減給で済んだ（-100,000円）。'],
        score: { response: true, moneyYen: -100_000 }, memory: 'だまし取られた件は正直に報告し、すぐ銀行と警察に連絡した。' },
    ],
  }),
  event({
    id: 'story.work.job-offer', title: '転職の誘い', category: 'daily', speaker: '大学の先輩',
    intro: ['（大学の先輩から連絡が来た。）', 'うちの会社に来ない？ 給料も上がるし、新しいことに挑戦できるよ。'],
    prompt: 'どうする？',
    choices: [
      { id: 'move', label: '転職する', result: ['思い切って転職した。新しい仕事は大変だけど、やりがいがある（+300,000円）。'], score: { growth: 2, moneyYen: 300_000 }, memory: '思い切って転職し、新しい仕事に挑戦した。' },
      { id: 'stay', label: '今の会社で続ける', result: ['今の仲間と続けることにした。後輩に頼られるようになった。'], score: { ties: 2 }, memory: '同じ会社で働き続け、後輩に頼られた。' },
    ],
  }),

  // ── 中年・老後 ──
  event({
    id: 'story.later.promotion', title: '昇進', category: 'daily', speaker: '上司',
    intro: ['いつも慎重に仕事をしてくれて助かってるよ。USBメモリの件も見事だった。', '来月から課長を任せたい。'],
    prompt: 'どうする？',
    choices: [
      { id: 'mentor', label: '引き受けて、部下を育てる', result: ['部下の相談に乗る毎日。給料も上がった（+500,000円）。'], score: { ties: 1, growth: 1, moneyYen: 500_000 }, memory: '仕事ぶりが認められて課長になり、部下を育てた。' },
      { id: 'expert', label: '現場で専門を極めたい', result: ['現場に残り、社内で一番の専門家と呼ばれるようになった（+300,000円）。'], score: { growth: 2, moneyYen: 300_000 }, memory: '現場に残り、専門家として頼られた。' },
    ],
  }),
  event({
    id: 'story.later.training', title: 'セキュリティ研修', category: 'security', speaker: '情報システム部', // SEC-007 の結果
    intro: ['USBメモリの件のあと、全社でセキュリティ研修をすることになった。', 'あなたには、二度と起きないための対策づくりにも加わってほしい。'],
    prompt: 'どうする？',
    choices: [
      { id: 'avoid', label: '気まずいので研修は最低限にする', result: ['研修は聞き流した。', '昇進の話は、同期に回っていった。'],
        score: { response: false }, memory: 'USBメモリの失敗と向き合えず、昇進を逃した。' },
      { id: 'learn', label: '研修で学び、対策づくりに加わる', result: ['失敗から学んで対策をまとめ、社内で発表した。', '「あの経験を生かしてくれた」と見直してもらえた。'],
        score: { response: true, growth: 2 }, memory: 'USBメモリの失敗を生かし、会社の対策づくりに加わった。' },
    ],
  }),
  event({
    id: 'story.later.child-game', title: '子どものゲーム課金', category: 'security', speaker: '子ども', // SEC-015
    intro: [
      '（カードの明細に、ゲームの課金が3万円も載っていた。）',
      'ごめんなさい……。「無料ガチャ」って書いてあったのに、続けて押したらお金がかかってたの。',
      '（子どものスマホは自分のカードとつながったまま、課金に許可がいる設定にもしていなかった。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'scold', label: '叱ってゲームを取り上げる', result: ['ゲームを取り上げた。', 'でもしばらくして、子どもは友達の家でこっそり遊ぶようになった……。'],
        score: { judgment: 'normal', ties: -1, moneyYen: -30_000 }, memory: '子どもの課金を叱って取り上げたが、話し合えなかった。' },
      { id: 'rules', label: '一緒にルールを決め、課金に許可がいる設定にする', result: ['使う時間と課金のルールを一緒に決めた。', 'スマホの設定で、課金には親の許可がいるようにした。運営に相談すると、一部を返してもらえた。'],
        score: { judgment: 'safe', ties: 1, moneyYen: -15_000 }, memory: '子どもの課金は、一緒にルールを決めて設定で防いだ。' },
    ],
  }),
  event({
    id: 'story.later.nephew-game', title: '甥のゲーム課金', category: 'security', speaker: '姉', // SEC-015
    intro: [
      'うちの子が、あなたにもらったお古のスマホで3万円も課金しちゃったの……。',
      '（渡したスマホには、自分のカードが登録されたままだった。課金に許可がいる設定にもしていない。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'pay', label: '仕方ないので払って済ませる', result: ['払って済ませた。でも、甥は次の月もまた課金してしまった。'],
        score: { judgment: 'normal', moneyYen: -60_000 }, memory: '甥の課金を払って済ませ、設定を見直さなかった。' },
      { id: 'settings', label: 'カードを外し、課金に許可がいる設定にして、甥とルールを話す', result: ['カードの登録を外し、課金に許可がいる設定にした。', '甥とも使い方のルールを話し合った。'],
        score: { judgment: 'safe', ties: 1, moneyYen: -30_000 }, memory: '甥の課金をきっかけに、カードを外して設定を見直した。' },
    ],
  }),
  event({
    id: 'story.later.home', title: '家を建てる', category: 'daily', speaker: STORY_SELF_NAME,
    intro: ['（長く暮らせる家が欲しくなった。銀行で住宅ローンの相談をした。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'build', label: 'ローンを組んで家を建てる', result: ['ローンの審査に通り、家を建てた（頭金 -1,000,000円）。家族が集まる場所ができた。'], score: { ties: 2, moneyYen: -1_000_000 }, memory: '住宅ローンを組んで家を建てた。' },
      { id: 'rent', label: '今の家に住み続ける', result: ['住み慣れた家で暮らし続けることにした。貯金は老後のために取っておく。'], score: { growth: 1 } },
    ],
  }),
  event({
    id: 'story.later.home-loan-denied', title: '通らないローン', category: 'security', speaker: '銀行の担当者', // SEC-013 の結果
    intro: [
      '申し訳ありません。過去に口座を不正に使われた記録があり、住宅ローンはお受けできません。',
      '（社会人になったばかりのころ、通帳とキャッシュカードを送ってしまった、あの口座だ……。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'give-up', label: '家はあきらめる', result: ['家を建てるのはあきらめた。'], memory: '昔、口座を渡してしまったせいで、住宅ローンを組めなかった。' },
      { id: 'save', label: '貯金して、少しずつ買えるものを探す', result: ['何年もかけて貯金し、小さな中古の家を現金で買った（-1,500,000円）。'], score: { ties: 1, moneyYen: -1_500_000 }, memory: '昔、口座を渡したせいでローンが組めず、貯金して中古の家を買った。' },
    ],
  }),
  event({
    id: 'story.later.parents', title: '親のこと', category: 'daily', speaker: STORY_MOTHER_NAME,
    intro: ['最近、足が弱ってきてね。一人で買い物に行くのも大変になってきたよ。'],
    prompt: 'どうする？',
    choices: [
      { id: 'together', label: '一緒に暮らす', result: ['一緒に暮らすことにした。にぎやかな毎日になった。'], score: { ties: 2, moneyYen: -100_000 }, memory: '年老いた母と一緒に暮らした。' },
      { id: 'service', label: '介護サービスを相談する', result: ['地域の窓口に相談して、ヘルパーさんに来てもらうことにした。週末は顔を見に行く。'], score: { ties: 1, moneyYen: -300_000 }, memory: '介護サービスを使いながら、週末は母に会いに行った。' },
    ],
  }),
  event({
    id: 'story.later.retire', title: '定年', category: 'daily', speaker: '社長',
    intro: ['長い間、本当にお疲れさまでした。よければ、もう少し若い人たちを助けてもらえませんか？'],
    prompt: 'どうする？',
    choices: [
      { id: 'stay', label: '嘱託として残り、後輩を育てる', result: ['週3日だけ会社に通い、後輩の相談に乗ることにした（+500,000円）。'], score: { ties: 1, moneyYen: 500_000 }, memory: '定年のあとも、後輩を育てる仕事を続けた。' },
      { id: 'retire', label: '退職して、趣味の時間を楽しむ', result: ['退職金を受け取り、のんびりした毎日が始まった（+1,000,000円）。'], score: { growth: 1, moneyYen: 1_000_000 }, memory: '定年で退職し、趣味の時間を楽しんだ。' },
    ],
  }),
  event({
    id: 'story.later.refund-call', title: '還付金の電話', category: 'security', speaker: '市役所を名乗る人',
    intro: [
      '（家の電話が鳴った。）',
      'こちら市役所です。医療費の払い戻しがあります。今日が期限なので、近くのATMに行ってください。携帯電話で操作をご案内します。',
      '（市役所の窓口ではなく、ATMで？ それに、今日が期限だと急がせてくる……。）',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'atm', label: '言われたとおりATMへ行く', result: ['言われるままにATMを操作した。', '……払い戻しを受けるはずが、自分の口座から30万円を振り込んでいた。'],
        score: { judgment: 'risky', damage: true, moneyYen: -300_000 }, memory: '「お金が戻る」という電話を信じて、ATMで30万円を振り込んでしまった。' },
      { id: 'family', label: 'いったん切って、家族と市役所の代表番号に確かめる', result: ['電話を切って家族に相談した。市役所の代表番号に聞くと、そんな連絡はしていなかった。'],
        score: { judgment: 'safe', ties: 1 }, memory: '「お金が戻る」という電話は、いったん切って確かめ、詐欺だと分かった。' },
    ],
  }),
  event({
    id: 'story.later.refund-aftermath', title: '振り込んでしまったお金', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（あの電話は詐欺だったと、テレビのニュースで気づいた。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'silent', label: '家族に知られたくないので黙っている', result: ['黙っていると、また別の「市役所」から電話がかかってきた……。'],
        score: { response: false, ties: -1 }, memory: '詐欺にあったことを誰にも言えなかった。' },
      { id: 'police', label: 'すぐ警察と銀行に連絡する', result: ['すぐ連絡したので、相手の口座が止められた。', '後日、10万円が戻ってきた。'],
        score: { response: true, moneyYen: 100_000 }, memory: '詐欺に気づいてすぐ警察と銀行に連絡し、一部を取り戻した。' },
    ],
  }),
  event({
    id: 'story.later.reunion', title: '昔の友達', category: 'daily', speaker: '昔の友達',
    intro: ['（喫茶店で、中学のころの友達にばったり会った。）', '久しぶり！ 部活のころの話、覚えてる？'],
    prompt: 'どうする？',
    choices: [
      { id: 'talk', label: '昔話に花を咲かせる', result: ['気づけば日が暮れていた。来月また会う約束をした。'], score: { ties: 1 } },
      { id: 'phone', label: 'スマホで連絡先を交換する', result: ['連絡先を交換した。孫の写真を送り合う仲になった。'], score: { ties: 1 } },
    ],
  }),
  event({
    id: 'story.later.grandchild', title: '孫とスマホ', category: 'daily', speaker: '孫',
    intro: ['ねえ、スマホの使い方を教えて！ 初めて自分のスマホを買ってもらったんだ。'],
    prompt: '何を伝える？',
    choices: [
      { id: 'safety', label: '怪しいメールやサイトの見分け方', result: ['これまでの経験を話した。孫は真剣な顔で聞いていた。', '「困ったら、すぐ大人に相談するんだよ」'], score: { ties: 1, growth: 1 }, memory: '孫に、自分の経験から怪しいメールやサイトの見分け方を教えた。' },
      { id: 'fun', label: '写真の撮り方や楽しい使い方', result: ['一緒に家族の写真を撮った。孫は大喜びだった。'], score: { ties: 1 }, memory: '孫と一緒に家族の写真を撮った。' },
    ],
  }),
];
