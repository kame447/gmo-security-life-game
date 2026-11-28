import type { StoryChoiceDef, StoryEventDef } from './score';

export interface OptionalStoryEvent {
  readonly stageIds: readonly string[];
  readonly areaId: string;
  readonly eventKey: string;
  readonly event: StoryEventDef;
}

const choice = (id: string, label: string, result: string, memory: string, score: StoryChoiceDef['score']): StoryChoiceDef =>
  ({ id, label, result: [result], memory, score });

function optional(stageIds: readonly string[], areaId: string, eventKey: string, id: string, title: string,
  speaker: string, intro: string, prompt: string, choices: StoryChoiceDef[]): OptionalStoryEvent {
  return { stageIds, areaId, eventKey, event: {
    id, title, category: 'daily', speaker, trigger: { eventKey: id }, intro: [intro], prompt,
    choices: [...choices, { id: 'skip', label: '今回は見送る', result: ['今は自分の予定を優先することにした。また普段の会話をしに来よう。'] }],
  } };
}

/** 内容・得点は承認前の試作。話しかけたときだけ発生し、必須イベントと節目の条件には使わない。 */
export const OPTIONAL_STORY_EVENTS: readonly OptionalStoryEvent[] = [
  optional(['junior-high'], 'school-classroom-interior', 'school.teacher', 'story.optional.jh.study', '放課後の質問', '先生',
    '授業で気になったところはあった？ 放課後なら、少し一緒に考えられるよ。', 'どう勉強してみる？', [
      choice('ask', '分からなかったところを先生に聞く', '自分の言葉で質問すると、どこで迷っていたか分かった。', '中学の放課後、先生に質問する習慣ができた。', { growth: 1 }),
      choice('review', 'まずノートを見返し、疑問をまとめる', '疑問を一つずつ書き出すと、次に調べたいことが見えてきた。', '中学で、ノートに疑問を整理する方法を覚えた。', { growth: 1 }),
    ]),
  optional(['junior-high'], 'school-classroom-interior', 'school.classmate', 'story.optional.jh.lunch', '友達との昼休み', 'クラスの友達',
    '昼休み、一緒に過ごさない？ 最近はまっていることを聞かせてよ。', '何を話そう？', [
      choice('listen', '友達の好きなことを聞く', '知らなかった趣味の話で盛り上がった。明日も話す約束をした。', '中学の昼休みに、友達の好きなことを知った。', { ties: 1 }),
      choice('share', '自分の好きなことを紹介する', '少し緊張したけれど、同じものが好きだと分かってうれしくなった。', '中学で自分の趣味を話し、気の合う友達ができた。', { ties: 1 }),
    ]),
  optional(['high-school'], 'high-school-interior', 'school.high.teacher', 'story.optional.hs.study', '試験前の学習計画', '高校の先生',
    '試験までに、少しずつ準備を進めよう。自分に合うやり方を考えてみて。', 'どう準備する？', [
      choice('plan', '苦手な単元を小分けにして復習する', '無理のない計画にすると、昨日できなかった問題も解けるようになった。', '高校で、苦手なことを小さく分けて取り組んだ。', { growth: 1 }),
      choice('group', '友達と問題を出し合う', '人に説明すると、自分の理解が曖昧だったところにも気づけた。', '高校の試験前、友達と教え合って勉強した。', { growth: 1, ties: 1 }),
    ]),
  optional(['high-school'], 'high-school-interior', 'school.high.friend', 'story.optional.hs.lunch', '高校の昼休み', '高校のクラスメイト',
    '授業ばかりだと疲れるね。少しだけ、のんびり話そう。', 'どんな時間にする？', [
      choice('hobby', '最近読んだ本や好きな音楽を話す', 'お互いのおすすめをメモした。帰り道の楽しみが一つ増えた。', '高校の友達と、おすすめの本や音楽を教え合った。', { ties: 1 }),
      choice('future', '将来やってみたいことを話す', 'まだ決まっていないことも、話してみると少し整理できた。', '高校の昼休み、友達と将来のことを話した。', { ties: 1, growth: 1 }),
    ]),
  optional(['high-school'], 'high-school-interior', 'school.high.club', 'story.optional.hs.activity', '放課後の活動', '部活の友達',
    '今日は短い発表会を開くんだ。できそうな形で手伝ってくれる？', '何を担当する？', [
      choice('present', '好きなことを短く発表する', '伝える順番を考えて準備した。みんなの質問で、新しい見方にも気づいた。', '高校の放課後、好きなことをみんなの前で発表した。', { growth: 1 }),
      choice('support', '準備や片づけを仲間と進める', '役割を分けると、準備が早く終わった。裏方の仕事にも達成感があった。', '高校で、仲間と協力して発表会を支えた。', { ties: 1 }),
    ]),
  optional(['university'], 'university-interior', 'school.university.teacher', 'story.optional.univ.question', '講義のあとの疑問', 'ゼミの先生',
    '講義で気になったことを、自分の問いにしてみよう。正解が一つとは限らないよ。', 'どこから調べる？', [
      choice('compare', '複数の資料を比べてみる', '同じ話題でも、資料によって見方が違うと分かった。出典も記録した。', '大学で、複数の資料を比べながら自分の問いを深めた。', { growth: 1 }),
      choice('discuss', '先生や友達に自分の考えを話す', '別の立場の意見を聞くと、見落としていた点が見えてきた。', '大学で、先生や仲間との対話から考えを広げた。', { growth: 1, ties: 1 }),
    ]),
  optional(['university'], 'university-interior', 'school.university.friend', 'story.optional.univ.project', 'ゼミの共同発表', 'ゼミの友達',
    '共同発表の役割を相談しているところだよ。得意なことを持ち寄ろう。', 'どの役割を引き受ける？', [
      choice('research', '資料を調べ、根拠を整理する', '出典を付けたメモが、発表を組み立てる土台になった。', '大学の共同発表で、資料と根拠を整理する役割を担った。', { growth: 1 }),
      choice('coordinate', 'メンバーの意見を聞いて構成をまとめる', '一人ずつ話す時間をつくると、全員の得意なことを生かせた。', '大学の共同発表で、仲間の意見をまとめた。', { ties: 1, growth: 1 }),
    ]),
  optional(['university'], 'university-interior', 'school.university.circle', 'story.optional.univ.circle', 'サークルの空き時間', 'サークルの友達',
    '今日は授業の合間に、次の活動の準備をしているよ。無理のない範囲で参加してね。', '何をして過ごす？', [
      choice('welcome', '初めて来た人と話す', '活動のことを紹介しながら話すと、新しい友達ができた。', '大学のサークルで、新しい仲間を迎えた。', { ties: 1 }),
      choice('prepare', 'みんなの使う道具を整える', '片づけながら使い方も覚えた。次の活動が少し楽しみになった。', '大学のサークルで、活動の準備を仲間と進めた。', { growth: 1 }),
    ]),
  optional(['junior-high', 'high-school', 'university'], 'shop-bookstore-interior', 'optional.bookstore.friend', 'story.optional.bookshare', '本屋でおすすめ交換', '本を探す友達',
    '気に入った本ってある？ 買わなくても、おすすめを話すだけで楽しいよ。', 'どんな話をする？', [
      choice('recommend', '好きな一冊の魅力を伝える', 'どこが好きかを言葉にすると、自分でも新しい魅力に気づいた。', '本屋で友達に、好きな本の魅力を伝えた。', { ties: 1 }),
      choice('explore', '普段読まない分野の話を聞く', '新しい分野に興味がわいた。次に調べたいことをメモした。', '本屋での会話から、知らなかった分野に興味を持った。', { growth: 1 }),
    ]),
  optional(['work'], 'office-interior', 'office.colleague', 'story.optional.work.break', '同僚との休憩', '同僚',
    '少し休憩しよう。最近、仕事で気になっていることはある？', '何を話そう？', [
      choice('ask', '困っていることを相談する', '早めに相談すると、別の進め方を一緒に考えてもらえた。', '仕事で困ったとき、同僚に相談することを覚えた。', { ties: 1, growth: 1 }),
      choice('listen', '同僚の近況を聞く', '何気ない会話で、お互いに声をかけやすくなった。', '同僚との休憩時間に、気軽に話せる関係を築いた。', { ties: 1 }),
    ]),
  optional(['work'], 'office-interior', 'office.mentor', 'story.optional.work.learning', '先輩と仕事を振り返る', '先輩',
    '忙しい日でも、一度立ち止まる時間をつくろう。今日うまくいったことは何かな？', '何を振り返る？', [
      choice('small', 'うまくいった手順をメモする', '次も使えるように短くまとめると、自分なりの工夫が見えてきた。', '仕事の工夫をメモし、次に生かせるようにした。', { growth: 1 }),
      choice('thanks', '助けてくれた人にお礼を伝える', '具体的にお礼を伝えると、次も協力しようと言ってもらえた。', '仕事を支えてくれた人へ、感謝を伝えた。', { ties: 1 }),
    ]),
  optional(['later'], 'shop-cafe-interior', 'optional.cafe.friend', 'story.optional.later.cafe', '喫茶店で近況を話す', '喫茶店の友達',
    '久しぶり。最近はどんなふうに過ごしている？ ゆっくり話そうよ。', 'どんな話をする？', [
      choice('memories', '昔の思い出を話す', '同じ出来事でも、覚えていることが少し違って面白かった。', '長く付き合った友達と、喫茶店で思い出を語り合った。', { ties: 1 }),
      choice('plans', 'これからやってみたいことを話す', '小さな楽しみを一緒に考えた。また会う約束もできた。', '友達と、これからの暮らしの楽しみを考えた。', { ties: 1, growth: 1 }),
    ]),
];

export function availableOptionalEvent(stageId: string, areaId: string, eventKey: string, choices: Readonly<Record<string, string>>): OptionalStoryEvent | undefined {
  return OPTIONAL_STORY_EVENTS.find(item => item.stageIds.includes(stageId) && item.areaId === areaId && item.eventKey === eventKey &&
    !Object.hasOwn(choices, item.event.id));
}

export const isOptionalEvent = (id: string): boolean => OPTIONAL_STORY_EVENTS.some(item => item.event.id === id);
