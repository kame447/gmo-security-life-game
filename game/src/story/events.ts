/**
 * ストーリーで使う人生イベント（docs/features/story.md）。仕組みは events/ の人生イベント基盤を使う。
 * きっかけ（trigger.eventKey）は 'story.*' でマップ上の NPC には付いておらず、StoryDirector が begin() で始める。
 *
 * 選択肢の score は評価（Issue #62、score.ts）と所持金の増減に、memory は最後の振り返りに使う。
 * セキュリティの出来事は SEC-001〜015（docs/events/security-events.md）をすべて使う。導入文に見抜くための手がかりを入れ、
 * 選択は後の出来事（config.ts の when）として返る。表示順から評価が読めないよう、順番は出来事ごとに固定する。
 * 中身・金額は試作。
 */
import { STORY_ADVANCE_EVENT, STORY_ADVANCE_GO, STORY_BIKE, STORY_MOTHER_NAME, STORY_SELF_NAME } from './config';
import type { StoryEventDef } from './score';
import { OPTIONAL_STORY_EVENTS } from './optional';

const yen = (value: number) => `${value.toLocaleString('ja-JP')}円`;
function event(def: Omit<StoryEventDef, 'trigger'>): StoryEventDef {
  const choices = def.choices;
  if (def.category !== 'security' || !choices || choices.length < 2 || def.id === STORY_BIKE.eventId) {
    return { ...def, trigger: { eventKey: def.id } };
  }
  // 再表示で順番は変えず、どの位置にも異なる評価の行動が出るようにする。
  const offset = [...def.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % choices.length;
  return { ...def, choices: [...choices.slice(offset), ...choices.slice(0, offset)], trigger: { eventKey: def.id } };
}

export const STORY_EVENTS: readonly StoryEventDef[] = [
  ...OPTIONAL_STORY_EVENTS.map(item => item.event),
  // ── 序章 ──
  event({
    id: STORY_BIKE.eventId, title: 'スマホで自転車を買う', category: 'security', speaker: STORY_MOTHER_NAME, // SEC-002
    intro: [
      'お使いありがとう！ これで町のことはだいたい分かったね。',
      `通学に使う自転車の候補を、メッセージで3つ送ったよ。予算は${yen(STORY_BIKE.budgetYen)}。どれが合いそうか、ページを見て考えてね。`,
      '商品の大きさや装備、受け取り方、購入後の問い合わせ先を見比べた。',
      `はやてサイクル：デイパス26は${yen(STORY_BIKE.fairPriceYen)}。送料込みで代金引換、駅前の店舗で点検も受けられる。`,
      'まちかどバイク：ノート26は24,800円。オートライト付きで、店舗受け取りと初回点検が含まれる。',
      `CYCLE SELECT：アーバンデイ26は${yen(STORY_BIKE.fakePriceYen)}。銀行振込で、注文後のメールに個人名義の口座が案内される。所在地は掲載調整中、返品・返金は受け付けないと書かれている。`,
    ],
    prompt: 'どのサイトで買う？',
    choices: [
      { id: 'site-a', label: `A：はやてサイクル（${yen(STORY_BIKE.fairPriceYen)}）`,
        result: ['会社の住所と電話番号を確かめてから注文した。', `おつりは${yen(STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen)}。`],
        score: { judgment: 'safe' }, memory: '初めての通販で、店の情報を確かめてから自転車を買った。' },
      { id: 'site-b', label: 'B：まちかどバイク（24,800円）',
        result: ['予算が足りなくて買えなかった。', 'A のサイトの会社情報を確かめて、A で注文した。'],
        score: { judgment: 'safe' }, memory: '初めての通販で、店の情報を確かめてから自転車を買った。' },
      { id: STORY_BIKE.fakeChoiceId, label: `C：CYCLE SELECT（${yen(STORY_BIKE.fakePriceYen)}）`,
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
      '友達と同じゲームで遊ぶことになった。登録が終われば、今夜の対戦に間に合いそうだ。',
      '登録欄には「パスワード：8文字以上」。自転車の通販で使った誕生日の8桁は、今も覚えている。',
      '端末には新しいパスワードを作って保存する機能もある。友達から「部屋を作って待ってるよ」と届いた。',
    ],
    prompt: 'パスワードはどうする？',
    choices: [
      { id: 'reuse', label: '覚えている8桁で登録して、友達と合流する', result: ['通販と同じ8桁で登録し、対戦にはすぐ合流できた。', '一つのサービスから漏れた文字列が、別のサービスでも使える状態になった。'],
        score: { judgment: 'risky' }, memory: '中学で、誕生日のパスワードをいくつものサービスで使い回した。' },
      { id: 'unique', label: '端末が提案する文字列を保存してから登録する', result: ['提案された長い文字列を保存し、このゲームだけに使うことにした。', '登録に少し時間を使ったが、別のサービスの情報だけではログインされにくくなった。'],
        score: { judgment: 'safe', growth: 1 }, memory: '中学から、サービスごとに別の長いパスワードを使った。' },
    ],
  }),
  event({
    id: 'story.jh.app-permission', title: '友達に勧められたアプリ', category: 'security', speaker: STORY_SELF_NAME, // SEC-011
    intro: [
      '友達が遊んでいるパズルに「クラスのランキング」機能がある。参加コードも送られてきた。',
      '初回起動の案内には「友達招待のため連絡先とSMS」「地域ランキングのため常時の位置情報」とある。',
      '説明の下には「設定して始める」と「あとで設定」。まず一人で遊ぶこともできそうだ。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'allow', label: '招待と地域ランキングをまとめて設定する', result: ['招待が楽になると思い、まとめて許可して始めた。', 'パズルには不要だった連絡先やSMSの操作まで、アプリに渡していた。'],
        score: { judgment: 'risky' }, memory: 'パズルのアプリに、連絡先や位置情報まで全部許可した。' },
      { id: 'deny', label: '一人用で始め、追加機能の説明を見直す', result: ['追加機能の許可を保留して、一人用で始めた。', '提供元と利用目的を調べると説明が一致しない点があり、使うのをやめた。必要な機能ごとに判断することにした。'],
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
      'スマホの設定に更新の案内が届いた。「修正内容：端末の保護機能」「所要時間：約30分」とある。',
      '20時から友達とゲームの約束がある。画面には今すぐ更新するほか、夜間に実行する設定も出ている。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'later', label: '更新する日時は決めず、今は案内を閉じる', result: ['今夜は通知を閉じた。翌日も予定を優先し、更新する日は決めないまま過ぎていった。', '問題が直るのは更新を済ませた後。先送りするときにも、実行する日時を決めておく必要があった。'],
        score: { judgment: 'risky' }, memory: 'スマホのアップデートを「後で」のまま放っておいた。' },
      { id: 'now', label: '夜間の更新を予約して、ゲームに参加する', result: ['充電しながら夜間に更新する設定にした。朝には終わっていた。', '予定を全部諦めなくても、更新する時間を決めて端末を保てた。'],
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
    id: 'story.hs.contact-spam', title: '自分の番号から届いたSMS', category: 'security', speaker: '中学からの友達', // SEC-011 の結果
    intro: [
      '友達から「当選のSMS、送ってくれた？ あなたの番号になってるよ」と連絡が来た。',
      '自分の送信履歴にも同じ文面が残っている。中学で入れたパズルには、SMSと連絡先の許可が付いたままだ。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'ignore', label: '送った覚えはないと返し、端末の様子を見る', result: ['送っていないと返事をしたが、アプリはその後も別の友達にSMSを送り続けた。', '最初の友達への説明だけでは送信を止められず、リンクを開いた人も出てしまった。'],
        score: { response: false, damage: true, ties: -1 }, memory: '自分では送っていないと返事したが、アプリからのSMS送信を止められなかった。' },
      { id: 'fix', label: '友達へ連絡を回し、SMSの許可を確認する', result: ['アプリを消して、他のアプリの許可も見直した。', '友達には「リンクは開かないで」と知らせて謝った。'],
        score: { response: true, damage: true, growth: 1 }, memory: '抜き取られた連絡先のせいで迷惑SMSが届き、すぐアプリを消して友達に知らせた。' },
    ],
  }),
  event({
    id: 'story.hs.phone-hijack', title: 'おかしくなったスマホ', category: 'security', speaker: STORY_SELF_NAME, // SEC-009 の結果
    intro: [
      'スマホが熱くなり、電池がすぐ減る。見覚えのないアプリも一つ増えていた。',
      'ニュースに、今のOSの古い版に関する修正のお知らせが出ている。設定を見ると更新を保留したままだった。',
      '明日の待ち合わせにも使うので、連絡先や写真を失わずに使える状態へ戻したい。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'keep', label: '使っていないアプリを閉じ、電池の様子を見る', result: ['使っていないアプリを閉じて使い続けたが、SNSに広告が投稿されるようになった。', '電池の対処だけでは、見覚えのないアプリや更新の問題を解決できていなかった。'],
        score: { response: false, damage: true, ties: -1 }, memory: 'アップデートを怠ったスマホを乗っ取られ、そのまま使い続けた。' },
      { id: 'reset', label: '家族と連絡手段を用意してから、端末を復旧する', result: ['家族に相談して、データを移してから初期化し、最新にした。', 'これからは通知が来たらすぐ更新することにした。'],
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
      'クラスでSNSのアカウントを交換することになった。友達が見つけやすいプロフィールにしたい。',
      '入力候補には誕生日、ペットの名前、出身中学。初期設定は「全体公開」で、あとから公開範囲を選べる。',
      'ログインを忘れたときの質問は「ペットの名前」。友達には、さっき自分のアカウントのQRコードを渡した。',
    ],
    prompt: 'どこまで公開する？',
    choices: [
      { id: 'all', label: '誕生日やペット名を入れ、全体に公開する', result: ['誕生日や愛犬の名前を入れ、全体公開のままにした。', '友達には見つけてもらいやすい一方、ログインの再設定に使う情報も誰でも読める状態になった。'],
        score: { judgment: 'risky' }, memory: 'SNSに誕生日やペットの名前まで全部公開した。' },
      { id: 'minimal', label: '交換した相手に向けて、ニックネームを載せる', result: ['ニックネームを入れ、公開相手を交換した友達に絞った。', '知り合いとはQRコードでつながれたので、再設定に使う情報まで公開する必要はなかった。'],
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
      '修学旅行で「撮ってもいい？」と聞かれ、友達に撮ってもらった写真がSNSに載っていた。',
      '公開範囲は「全体」。宿の看板と自分の寝顔が写っている。友達は「楽しい旅行の記録だよ」と喜んでいる。',
      '撮影には同意したけれど、この写真を公開してよいかはまだ話していない。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: '写真は公開されたまま、旅行の会話を続ける', result: ['公開の相談はせず、写真は誰でも見られる状態で残った。', '自分が載せていなくても、ほかの人に保存されたり検索で見つけられたりする可能性は残った。'],
        score: { judgment: 'risky' }, memory: '友達に無断で載せられた写真を、そのままにした。' },
      { id: 'ask', label: 'この写真の公開範囲を、今メッセージで相談する', result: ['寝顔と宿が写る写真は外してほしいと伝えると、友達は削除してくれた。', '撮るときと載せるときで、改めて確かめる約束ができた。'],
        score: { judgment: 'safe', ties: 1 }, memory: '無断で載せられた写真は、友達に頼んで消してもらった。' },
    ],
  }),
  event({
    id: 'story.hs.leak-notice', title: 'パスワード流出のお知らせ', category: 'security', speaker: STORY_SELF_NAME, // SEC-001
    intro: [
      'ゲームステーションから、利用者情報の流出に関するお知らせが届いた。',
      '差出人は普段のお知らせと同じ。メールにログイン用リンクはなく、アプリの「お知らせ」にも同じ文面が載っている。',
      '今はまだゲームを遊べる。通販とこのゲーム、別のSNSにも同じ8桁を使っていたことを思い出した。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'ignore', label: 'パスワードは変えず、追加のお知らせを待つ', result: ['まだログインできるので、追加のお知らせを待つことにした。', '利用できることと、他人が同じ情報で入れないことは別だった。使い回している先も残ったままだ。'],
        score: { judgment: 'risky' }, memory: 'パスワード流出のお知らせを読んでも、パスワードを変えなかった。' },
      { id: 'change', label: '関連するアカウントを洗い出し、パスワードを変える', result: ['メール内の操作ではなく、アプリから変更した。同じ8桁を使ったサービスもそれぞれ別の文字列に変えた。', '流出元だけを直しても、同じ文字列を使った他のアカウントにはリスクが残ると分かった。'],
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
      '文化祭の写真がよく撮れた。来られなかった友達にも雰囲気を伝えたい。',
      '写真には制服の名札と校門の看板が写っている。投稿の初期設定は「全体公開」で、友達への限定投稿も選べる。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'public', label: '会場の雰囲気が伝わる写真を、全体に投稿する', result: ['写真にはたくさん反応が付いた。', '数日後、知らない人から学校と名前を添えたメッセージが来た。背景や名札から分かることまで考えていなかった。'],
        score: { judgment: 'risky', damage: true }, memory: '名札が写った写真を全体公開にしてしまい、知らない人に学校と名前を知られた。' },
      { id: 'friends', label: '人物と名札を整えて、つながっている相手に投稿する', result: ['名札を隠し、写っている人に確認して友達向けに投稿した。', '思い出を共有しながら、名前や学校が誰に伝わるかも決められた。'],
        score: { judgment: 'safe', ties: 1 }, memory: '写真は公開範囲を友達だけにし、名札を隠して載せた。' },
    ],
  }),
  event({
    id: 'story.hs.photo-followup', title: '知らない人からのメッセージ', category: 'security', speaker: '知らない人',
    intro: [
      '写真を見た人から「土曜に駅前で会えない？ 写真の場所は知っているよ」と、また連絡が来た。',
      'プロフィールには同じ学校の卒業生とあるが、知っている友達はいない。返事をするか迷う。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'ignore', label: '返信や相談はせず、追加の連絡が来るか様子を見る', result: ['放っておいたら、通学の電車で見られている気がするようになった。', '怖くて、しばらく友達と出かけられなくなった。'],
        score: { response: false, ties: -1 }, memory: '知らない人からの誘いを誰にも言えず、しばらく出かけるのが怖くなった。' },
      { id: 'consult', label: 'メッセージを残して、先生や家族に見せる', result: ['先生と家族に相談した。投稿を消して相手をブロックし、SNSに報告した。', 'それきり連絡は来なくなった。'],
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
      { id: 'abandon', label: '前のアカウントは残し、連絡用を作り直す', result: ['新しいアカウントで友達との連絡を再開した。', '前のアカウントが止まったわけではなかった。なりすましの依頼を本物と思った友達が2人、送金してしまった。'],
        score: { response: false, damage: true, ties: -2 }, memory: 'ペットの名前を公開していたせいでSNSを乗っ取られ、放っておいて友達がだまされた。' },
      { id: 'recover', label: '今のアカウントの復旧を申し込み、別の手段で連絡する', result: ['運営に本人確認をしてアカウントを取り戻し、友達に「あれは自分じゃない」と知らせた。', '秘密の質問はやめ、2段階認証にした。プロフィールも最低限にした。'],
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
      '情報室の共用パソコンで、メールとSNSを使ってレポートを印刷した。授業まであと1分。',
      'ブラウザの右上には自分の名前が出ている。「次回から入力を省略」にチェックが入った状態で、後ろには次に使う学生が待っている。',
      '使っているメールとSNSには、それぞれのメニューにログアウトがある。印刷は終わり、ブラウザも閉じられる状態だ。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: 'ブラウザを閉じて、次の学生へ席を譲る', result: ['ブラウザを閉じて席を譲り、印刷物を持って教室へ向かった。', 'この端末ではログイン状態を保存していたため、次に同じサイトを開くと自分のアカウントが表示された。'],
        score: { judgment: 'risky' }, memory: '大学の共用パソコンでブラウザを閉じて席を譲ったが、保存されたログイン状態は残っていた。' },
      { id: 'logout', label: 'メールとSNSをログアウトして、席を譲る', result: ['メールとSNSをそれぞれログアウトし、ブラウザも閉じた。少し遅れて教室へ向かった。', '画面を閉じることと、サービス側でログインを終えることは別だった。'],
        score: { judgment: 'safe' }, memory: '大学の共用パソコンでは、メールとSNSをログアウトしてから席を譲った。' },
    ],
  }),
  event({
    id: 'story.univ.shared-pc-aftermath', title: '勝手な投稿', category: 'security', speaker: 'サークルの友達',
    intro: ['ねえ、SNSに変なこと書いてたけど大丈夫？ ゼミの先生の悪口になってたよ。', '（情報室のパソコンで、ログインしたままだった……。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: '投稿は残し、知り合いへ自分の投稿ではないと説明する', result: ['周りの友達には事情を話したが、投稿自体は残したままだった。', '説明を聞いていない人や先生にも広がり、誤解を解くのに苦労した。'],
        score: { response: false, damage: true, ties: -1 }, memory: '共用パソコンでログインしたまま離れ、勝手に投稿された。放っておいて誤解された。' },
      { id: 'fix', label: '公開中の投稿とログイン中の端末を確認する', result: ['投稿を消して、設定から全部の端末をログアウトさせた。', '先生にも事情を話して謝った。'],
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
      'アルバイト代を確認したい。今月のスマホの通信量は残りわずかで、喫茶店のWi-Fi一覧を開いた。',
      '自動で選ばれた接続先は「FREE_CAFE_WIFI」。テーブルのカードには「Kissa-Guest」と書かれている。',
      '接続後の案内から銀行の画面が開いた。アドレス欄は「http://bank.example」、IDとパスワードの欄がある。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'login', label: '開いた残高照会画面を使い、通信量を節約する', result: ['表示された画面へ入力すると、残高が出てきた。', '表示が銀行らしくても、店の接続先や普段の入口とは一致していなかった。'],
        score: { judgment: 'risky' }, memory: '鍵のない無料Wi-Fiで、http の銀行サイトにログインした。' },
      { id: 'mobile', label: '接続を切り、いつも使う銀行アプリを開き直す', result: ['Wi-Fiを切り、自分の回線でいつもの銀行アプリを開いた。', '店員に聞くと自動でつながったWi-Fiは店のものではなかった。接続名と入口を確かめて、入力を避けられた。'],
        score: { judgment: 'safe', growth: 1 }, memory: '店のものではない無料Wi-Fiを見抜き、銀行は自分の回線で使った。' },
    ],
  }),
  event({
    id: 'story.univ.captcha', title: 'チケットサイトの確認', category: 'security', speaker: STORY_SELF_NAME, // SEC-005
    intro: [
      'ライブの先行受付を調べていると、検索結果に空席案内が出ていた。バンドの公式ページには、別の販売窓口も掲載されている。',
      '空席案内のページで「アクセスが集中しているため、購入前に確認を行います」と表示された。',
      '手順には「Windowsキー＋R を押す」「コピー済みの内容を貼り付けて実行」とある。チケットの枚数はまだ選んでいない。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'follow', label: '受付を続けるため、表示された確認手順を進める', result: ['手順を進めると、黒い画面が一瞬開いて閉じた。', 'ブラウザ内の確認をしたつもりが、内容を知らない命令をパソコンで実行してしまっていた。'],
        score: { judgment: 'risky', damage: true }, memory: '偽のロボット確認に従ってキー操作をし、パソコンにウイルスを入れてしまった。' },
      { id: 'close', label: '別の販売窓口を探して、空席を確認し直す', result: ['バンドの公式ページから販売窓口をたどると、ブラウザの中だけで購入へ進めた。', '機器で命令を実行させる手順は、単に画像や文字を確認する操作とは違っていた。'],
        score: { judgment: 'safe', growth: 1 }, memory: 'キー操作をさせる偽のロボット確認を見抜き、公式サイトで買った。' },
    ],
  }),
  event({
    id: 'story.univ.pc-infected', title: '開けなくなったファイル', category: 'security', speaker: STORY_SELF_NAME,
    intro: [
      'パソコンのレポートが開けなくなった。「復元には5万円。支払い期限まで24時間」と表示されている。',
      '提出期限は近い。大学の保存領域に昨日の原稿があり、情報窓口の相談受付もまだ開いている。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'pay', label: '今のファイルを戻すため、表示された支払いを進める', result: ['払ったが、ファイルは戻らなかった。'],
        score: { response: false, moneyYen: -50_000 }, memory: 'ウイルスに「払えば戻す」と言われて払ったが、何も戻らなかった。' },
      { id: 'ask', label: '昨日の原稿の有無を確かめ、情報窓口へ相談する', result: ['窓口で初期化してもらい、大学の保存領域から卒論のデータを戻せた。', 'パソコンに保存していたパスワードは全部変えた。'],
        score: { response: true, growth: 1 }, memory: 'ウイルスに感染したパソコンは、大学の窓口に相談して立て直した。' },
    ],
  }),
  event({
    id: 'story.univ.phishing', title: 'カード会社からのメール', category: 'security', speaker: STORY_SELF_NAME, // SEC-008
    intro: [
      'カードの利用確認メールが届いた。明日の買い物までに手続きを済ませたい。受信トレイで本文とリンクを確認できる。',
      '表示名はいつものカード会社。差出人は support@card-security-check.example、普段のお知らせは card.example から届いている。',
      'メールの確認フォームには「カード番号」「暗証番号」の入力欄があり、送信すると利用確認が完了すると書かれている。',
      'ボタンの表示文字には普段の会社の名前がある。スマホには、普段使っているカードアプリもある。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'link', label: 'メールの確認フォームを記入して送信する', result: ['メールの案内にあったカード番号と暗証番号を、確認フォームに記入して送信した。', '手続きの後は画面が進まなかった。差出人や本当のリンク先が普段と違うことを、入力前に確認できていなかった。'],
        score: { judgment: 'risky', damage: true, moneyYen: -50_000 }, memory: 'カード会社を装ったメールの確認フォームへ情報を送信し、カードを不正利用された。' },
      { id: 'ignore', label: '次に使うときまで、確認を保留する', result: ['次に使うときに確かめることにして、今は確認を保留した。'], score: { judgment: 'normal' } },
      { id: 'official', label: 'カードアプリから利用状況を照会する', result: ['カードアプリには利用制限のお知らせがなく、普段どおり使える状態だった。', 'メールに書かれた表示名だけで判断せず、自分が以前から使っている入口で確かめられた。'],
        score: { judgment: 'safe' }, memory: 'カードの利用確認メールが届き、普段使うアプリから状況を照会して見破った。' },
    ],
  }),
  event({
    id: 'story.univ.card-fraud', title: '身に覚えのない請求', category: 'security', speaker: STORY_SELF_NAME,
    intro: [
      'カードの明細に、覚えのない5万円の買い物がある。利用日は、メールからカード情報を入れた日の翌日だった。',
      '請求の内容を確かめたい。カード裏面には問い合わせ先があり、利用履歴の画面にも相談の案内が出ている。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'leave', label: '窓口への連絡は待ち、次の明細と照合する', result: ['次の明細を待つことにして、カードの窓口にはまだ連絡しなかった。', 'カードを使える状態が続き、翌月も5万円の買い物が見つかった。'],
        score: { response: false, moneyYen: -50_000 }, memory: 'カードの明細の確認を優先して窓口への連絡を待ち、不正利用が続いてしまった。' },
      { id: 'call', label: 'カードの窓口に、利用停止と明細の調査を相談する', result: ['カード会社に利用停止と調査を依頼し、警察にも相談した。', 'このケースでは調査の後、3万円が戻ってきた。'],
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
      { id: 'leave', label: '面接先には、自分が載せた写真ではないと説明する', result: ['自分が載せた写真ではないと面接先に説明したが、公開中の写真は残したままだった。', 'その会社の採用には至らなかった。写真はほかの人にも検索で見つかる状態が続いた。'],
        score: { response: false, damage: true, growth: -1 }, memory: '無断で載せられた写真を放っておき、就職の面接で指摘された。' },
      { id: 'delete', label: '掲載した友達と連絡を取り、公開中の写真を整理する', result: ['久しぶりに友達に連絡して消してもらった。検索結果の削除も申し込んだ。', '「あのときはごめん」と言われ、また仲良くなった。'],
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
      '入社した会社の人事担当と同じ名前で、SNSに給与口座の変更案内が届いた。',
      '「A銀行からB銀行へ変更してください」とあり、「回収するもの」にはA銀行の通帳とキャッシュカード、「送り先」には回収窓口の住所が載っている。',
      '社内ポータルには同じ案内が見当たらない。相手は、今日中に発送できれば給与の処理に間に合うと言う。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'send', label: '案内された回収先へ、今日中に発送する', result: ['案内の回収対象に書かれた通帳とキャッシュカードを、指定先へ発送した。'],
        score: { judgment: 'risky', damage: true }, memory: 'SNSで届いた給与口座の変更案内を受け、指定の回収先に通帳とキャッシュカードを発送した。' },
      { id: 'check', label: '社内の連絡先から、回収手順を問い合わせる', result: ['社内の連絡先から人事に回収手順を問い合わせると、変更も回収も案内していないと言われた。', '差出人の名前が一致していても、口座を使える物を相手に渡す理由にはならなかった。'],
        score: { judgment: 'safe' }, memory: 'SNSの口座回収案内を社内の連絡先に問い合わせ、実際の手続きと違うことを確かめた。' },
    ],
  }),
  event({
    id: 'story.work.account-frozen', title: '口座の取引を確かめる', category: 'security', speaker: '警察',
    intro: [
      '銀行から、自分名義の口座が一時的に利用できなくなったと通知があった。',
      '銀行と警察の相談窓口で確かめると、覚えのない送金に口座が使われているという。以前、通帳とカードを送った口座だった。',
      '担当者から、いつ誰に何を渡したのか、分かる範囲を教えてほしいと聞かれた。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'deny', label: '送付の経緯は話さず、取引をしていないと伝える', result: ['自分は取引していないとだけ伝え、通帳とカードを送った経緯は話さなかった。', '口座が他の人へ渡った時期を確認できず、調査とやり取りが長引いた。'],
        score: { response: false, ties: -1 }, memory: '自分が取引していないことだけを伝え、口座を渡した経緯の確認に時間がかかった。' },
      { id: 'explain', label: '送付までのやり取りをまとめ、担当窓口へ渡す', result: ['通帳とカードを送った経緯を、メッセージの記録と一緒に提出した。', 'この場では取引の確認が必要になり、新しい口座の手続きもいったん保留になった。窓口と連絡を取りながら確認を進めた。'],
        score: { response: true }, memory: '口座を渡した経緯とメッセージの記録を窓口に提出し、取引の確認を進めた。' },
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
      { id: 'hide', label: '報告は調べた後にし、先にパスワードを変える', result: ['自分のパスワードだけを変え、調べ終えるまで報告を待った。', '別の接続や情報流出の確認が遅れ、調査で使い回しも分かった。対応の遅れにより減給になった（-300,000円）。'],
        score: { response: false, damage: true, ties: -2, moneyYen: -300_000 }, memory: 'アカウントの不正利用を自分で調べてから報告しようとして、対応が遅れ減給になった。' },
      { id: 'report', label: '担当部署と状況を共有しながら、認証情報を変える', result: ['すぐ報告して調査に協力した。全部のサービスのパスワードを別々にし、2段階認証にした。', '被害は最小限で済んだが、始末書を書いた。'],
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
      { id: 'leave', label: '取引の停止は待ち、家計の記録を先に照合する', result: ['取引を止める前に家計の記録を調べることにした。', '照合している間も口座は利用できる状態で、さらに20万円が送られていた。合計の被害は40万円になった。'],
        score: { response: false, damage: true, moneyYen: -400_000 }, memory: '大学で無料Wi-Fiから銀行にログインした結果、不正送金され、対応が遅れた。' },
      { id: 'report', label: '取引の停止を依頼し、記録の確認も並行して進める', result: ['口座を止める手続きと状況確認を依頼し、警察にも届け出た。', 'このケースではその後の確認により10万円が戻り、差し引きの被害は10万円となった。'],
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
      '会議室の片づけをしていたら、USBメモリが見つかった。ラベルには取引先の名前と「会議資料」とある。',
      '今日の会議で使った物かもしれない。参加者は既に帰り、持ち主を確かめる必要がある。',
      '情報システム部では拾得物を預かれるが、すぐには中身を確認できないと言われた。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'plug', label: 'USBをPCにつなぎ、持ち主の情報を探す', result: ['持ち主を探すために接続した直後、端末の動きがおかしくなった。', 'USBにはプログラムが仕込まれていて、社内ネットワークの対応が必要になった。善意の確認でも、接続前には中身を判断できなかった。'],
        score: { judgment: 'risky', damage: true }, memory: '会議資料と書かれたUSBメモリの持ち主を探そうと接続して、会社にウイルスを広げてしまった。' },
      { id: 'report', label: '見つけた場所を記録して、担当部署に預ける', result: ['見つけた場所と時間を伝えて預けた。調査でプログラムが仕込まれていたと分かった。', 'ラベルは持ち主の証明にならない。持ち主探しと中身の確認を、担当部署に任せて進められた。'],
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
      '取引先から請求書が届いた。「口座が変わりました。締め日の本日中にお願いします」とある。',
      '担当者の名前と請求額は前の取引と同じ。今回の差出人は tanaka@torihlki.example、連絡先台帳には tanaka@torihiki.example と記載されている。',
      'メールには新しい電話番号も添えられている。台帳には、これまで使っていた代表番号も残っている。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'pay', label: '請求額を前回の記録と照合し、指定口座へ送る', result: ['請求額が合っていたので、新しい口座へ送った。', '翌週、取引先から未払いの連絡が来た。金額が正しくても、送り手や振込先が本物とは限らなかった。'],
        score: { judgment: 'risky', damage: true }, memory: '振込先の変更メールを信じて、会社のお金をだまし取られた。' },
      { id: 'call', label: '台帳の代表番号から、口座変更について問い合わせる', result: ['台帳の番号から確認すると、口座は変更されていなかった。', '差出人の綴りが一文字違っていた。今回届いた連絡だけに頼らず、別の経路で確認できた。'],
        score: { judgment: 'safe', ties: 1 }, memory: '振込先の変更メールは、アドレスの違いに気づき電話で確かめて防いだ。' },
    ],
  }),
  event({
    id: 'story.work.invoice-aftermath', title: 'だまし取られたお金', category: 'security', speaker: '上司',
    intro: ['振込の件、どうなっているんだ？'],
    prompt: 'どうする？',
    choices: [
      { id: 'hide', label: '取引先との記録を整理し、説明がまとまってから報告する', result: ['経緯をまとめてから話そうとするうちに、相手の口座からお金が引き出されていた。', '事実が全部そろう前でも対応を始める必要があった。報告の遅れを問われ、降格になった（-500,000円）。'],
        score: { response: false, ties: -2, moneyYen: -500_000 }, memory: '経緯をまとめてから報告しようとして連絡が遅れ、相手の口座を止める機会を逃した。' },
      { id: 'report', label: '分かっていることを先に共有し、送金先を調べる', result: ['すぐに銀行と警察へ連絡し、口座を止めてもらえた。一部のお金は戻った。', '処分は減給で済んだ（-100,000円）。'],
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
      { id: 'avoid', label: '研修は受講し、対策づくりへの参加は見送る', result: ['必要な研修は受講して、担当業務に戻った。', '具体的な再発防止案をまとめる役割は、参加した同期が担当することになった。'],
        score: { response: false }, memory: 'USBメモリの件の研修は受講し、再発防止案を作る活動への参加は見送った。' },
      { id: 'learn', label: '作業時間を調整し、再発防止案をまとめる', result: ['失敗から学んで対策をまとめ、社内で発表した。', '「あの経験を生かしてくれた」と見直してもらえた。'],
        score: { response: true, growth: 2 }, memory: 'USBメモリの失敗を生かし、会社の対策づくりに加わった。' },
    ],
  }),
  event({
    id: 'story.later.child-game', title: '子どものゲーム課金', category: 'security', speaker: '子ども', // SEC-015
    intro: [
      'カード明細にゲームの購入が3万円分載っていた。子どもは「最初は無料だったけど、途中から追加購入になった」と話す。',
      'スマホには親のカードが登録されたままで、購入のたびに確認する設定はない。何を買ったかは利用履歴に残っている。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'scold', label: 'スマホを預かり、しばらくゲームを休ませる', result: ['ゲームを取り上げた。', 'でもしばらくして、子どもは友達の家でこっそり遊ぶようになった……。'],
        score: { judgment: 'normal', ties: -1, moneyYen: -30_000 }, memory: '子どもの課金を叱って取り上げたが、話し合えなかった。' },
      { id: 'rules', label: '履歴を一緒に見て、購入の確認方法を決める', result: ['使う時間と課金のルールを一緒に決めた。', 'スマホの設定で、課金には親の許可がいるようにした。運営に相談すると、一部を返してもらえた。'],
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
      { id: 'pay', label: '支払設定は残し、次は購入前に連絡してもらう', result: ['代金を精算し、次は買う前に連絡してもらうことにした。', '端末の支払設定は変えていなかったため、翌月も操作の途中で購入できてしまった。'],
        score: { judgment: 'normal', moneyYen: -60_000 }, memory: '甥の課金を払って済ませ、設定を見直さなかった。' },
      { id: 'settings', label: '使い方を話し合い、端末に残した支払設定を外す', result: ['カードの登録を外し、課金に許可がいる設定にした。', '甥とも使い方のルールを話し合った。'],
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
    id: 'story.later.home-loan-denied', title: '住まいの計画を見直す', category: 'security', speaker: '銀行の担当者', // SEC-013 の結果
    intro: [
      '購入したい家が見つかり、住宅ローンの相談をした。',
      '以前に第三者へ渡った口座の取引について追加資料を確認しているが、この物件の購入期限までには終わらない見込みだという。',
      '今回は希望していた契約を進められず、住まいの計画を考え直すことになった。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'give-up', label: '今の住まいを続け、住宅の購入は見送る', result: ['この物件の購入は見送り、今の住まいで暮らし続けることにした。'], memory: '取引の記録の確認が購入期限に間に合わず、その時の住宅購入を見送った。' },
      { id: 'save', label: '購入時期を延ばし、貯金で買える物件を探す', result: ['購入時期を延ばし、貯金と物件探しを続けた。', '数年後、予算に合う小さな中古の家を現金で購入した（-1,500,000円）。'], score: { ties: 1, moneyYen: -1_500_000 }, memory: '住宅購入の計画を見直し、貯金を続けて予算に合う中古の家を買った。' },
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
      '市の担当者と名乗る人から、医療費の払い戻しについて電話があった。氏名と住所は合っている。',
      '「申請期限は今日です。ATMの振込画面から手続きできます。電話を切らずに向かってください」と案内される。',
      '家には以前届いた市の医療費通知もある。その紙には窓口の電話番号が記載されている。',
    ],
    prompt: 'どうする？',
    choices: [
      { id: 'atm', label: 'ATMで、電話の案内どおり振込操作を進める', result: ['言われるままにATMを操作した。', '……払い戻しを受けるはずが、自分の口座から30万円を振り込んでいた。'],
        score: { judgment: 'risky', damage: true, moneyYen: -300_000 }, memory: '「お金が戻る」という電話を信じて、ATMで30万円を振り込んでしまった。' },
      { id: 'family', label: '手元の通知書を出し、記載の窓口へかけ直す', result: ['電話を切り、家族と通知書を確かめて窓口にかけ直した。', 'そのような案内は出していなかった。相手が個人情報を知っていても、指定した操作まで信用できるわけではなかった。'],
        score: { judgment: 'safe', ties: 1 }, memory: '「お金が戻る」という電話は、いったん切って確かめ、詐欺だと分かった。' },
    ],
  }),
  event({
    id: 'story.later.refund-aftermath', title: '振り込んでしまったお金', category: 'security', speaker: STORY_SELF_NAME,
    intro: ['（あの電話は詐欺だったと、テレビのニュースで気づいた。）'],
    prompt: 'どうする？',
    choices: [
      { id: 'silent', label: '窓口には連絡せず、手元の記録だけ確かめる', result: ['手元の記録は確かめたが、銀行や警察への連絡はしなかった。', '口座を止める依頼には進めないまま、後日また同じような電話がかかってきた。'],
        score: { response: false, ties: -1 }, memory: '払い戻しの電話の記録を自分で確かめるにとどまり、銀行や警察への連絡はしなかった。' },
      { id: 'police', label: '振込の記録を手元に、銀行と警察へ連絡する', result: ['すぐ連絡したので、相手の口座が止められた。', '後日、10万円が戻ってきた。'],
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
