/**
 * ストーリーの進行（docs/features/story.md）：序章（目覚め → スマホ → お使い → 自転車の購入）と、
 * 制限時間・強制イベントによるステージ進行。DOM に依存せず、画面・ゲームとは StoryHost を通じてやり取りする。
 *
 * - マップの通知（MapEventSink）は人生イベント・買い物より先に受け取り、序章の相手だけを横取りする。
 * - 会話・選択肢・画面が開いている間は、時間も進行も止める（tick の exploring が false）。
 * - 個別の行き先・ステージ・イベントの中身は config.ts / events.ts のデータに置く。
 */
import type { MapEvent, MapEventSink, PortalDef, SpawnPoint } from '../core/types';
import type { LifeEventDirector, LifeEventOutcome } from '../events/director';
import {
  STORY_BEDROOM, STORY_BIKE, STORY_ERRANDS, STORY_HOME_EXIT_PORTAL, STORY_MOTHER_KEY, STORY_MOTHER_NAME,
  STORY_SELF_NAME, STORY_STAGES, type StoryForcedEvent, type StoryStage,
} from './config';
import { bikeOwned, newStoryState, phoneGiven, type StorySave } from './state';

/** ストーリーが操作するゲーム側の窓口。 */
export interface StoryHost {
  say(speaker: string, lines: readonly string[]): boolean;
  warp(spawn: Readonly<SpawnPoint>): boolean;
  areaId(): string;
  setPhoneOwned(owned: boolean): void;
  changeMoney(deltaYen: number): boolean;
  addItem(itemId: string): boolean;
  /** 短いお知らせ（残り時間の警告など）。 */
  notice(text: string): void;
}

export interface StoryStatus {
  /** 一行目：いまの段階・ステージ名。 */
  title: string;
  /** 二行目：次にすること。 */
  detail: string;
  /** 本編中だけ。残り時間（秒）。 */
  remainingSeconds?: number;
  /** 残りわずか。 */
  warn: boolean;
}

type Narration = { speaker: string; lines: readonly string[]; after?: () => void };

const WAKE_LINES = ['……ふぁあ。あさだ。', 'きょうから ちゅうがくせい。1かいで おかあさんが よんでいる。', '（かいだんは へやの みぎうえ。）'];

export class StoryDirector implements MapEventSink {
  private state: StorySave;
  private host?: StoryHost;
  private readonly queue: Narration[] = [];
  /** Runs once the narration currently on screen has been read. */
  private pendingAfter?: () => void;
  /** A forced event whose choices are still open. */
  private inProgress: string | null = null;
  /** Area-triggered forced events whose area was entered. */
  private readonly armed = new Set<string>();
  private warned = false;
  private milestoneQueued = false;

  private constructor(state: StorySave, private readonly lifeEvents: LifeEventDirector, fresh: boolean) {
    this.state = state;
    if (fresh) this.queue.push({ speaker: STORY_SELF_NAME, lines: WAKE_LINES });
    // A reload between buying the bicycle and the first stage resumes at the stage.
    if (state.phase === 'return-home' && state.bikeChoice) this.queue.push(this.bikeArrival());
    if (state.phase === 'stage') this.warned = this.remaining <= this.stage.warnSeconds;
  }

  /** 「はじめから」：2階の自室で目覚めるところから始める。 */
  static newGame(lifeEvents: LifeEventDirector): StoryDirector {
    return new StoryDirector(newStoryState(), lifeEvents, true);
  }

  /** 「つづきから」：保存した進み具合から再開する。 */
  static resume(saved: StorySave, lifeEvents: LifeEventDirector): StoryDirector {
    return new StoryDirector(structuredClone(saved), lifeEvents, false);
  }

  attach(host: StoryHost): void {
    this.host = host;
    host.setPhoneOwned(phoneGiven(this.state));
  }

  get phase(): StorySave['phase'] { return this.state.phase; }
  get stage(): StoryStage { return STORY_STAGES[this.state.stageIndex]; }
  get stageElapsed(): number { return this.state.stageElapsed; }
  get remaining(): number { return Math.max(0, this.stage.limitSeconds - this.state.stageElapsed); }
  /** 新しく始めたとき・「さいしょから」の位置。 */
  get startPoint(): Readonly<SpawnPoint> { return STORY_BEDROOM; }
  get canRide(): boolean { return bikeOwned(this.state); }
  get errandsDone(): readonly string[] { return this.state.errandsDone; }
  get forcedDone(): readonly string[] { return this.state.forcedDone; }

  canUsePortal(portal: Readonly<PortalDef>): boolean {
    return !(this.state.phase === 'meet-mother' && portal.id === STORY_HOME_EXIT_PORTAL);
  }

  save(): StorySave { return structuredClone(this.state); }

  status(): StoryStatus {
    const s = this.state;
    switch (s.phase) {
      case 'meet-mother': return { title: 'じょしょう', detail: '1かいの おかあさんに はなしかけよう', warn: false };
      case 'errands': {
        const left = STORY_ERRANDS.filter(e => !s.errandsDone.includes(e.id));
        return { title: `おつかい ${s.errandsDone.length}/${STORY_ERRANDS.length}`, detail: `つぎ：${left.map(e => e.place).join('・')}`, warn: false };
      }
      case 'return-home': return { title: 'おつかい おわり', detail: 'いえに かえって おかあさんに はなしかけよう', warn: false };
      case 'stage': case 'stage-ending': {
        const next = this.stage.forced.find(f => f.trigger.kind === 'area' && !s.forcedDone.includes(f.eventId));
        const remaining = this.remaining;
        return { title: this.stage.name, remainingSeconds: remaining, warn: remaining <= this.stage.warnSeconds,
          detail: s.phase === 'stage-ending' ? 'じかんぎれ' : next?.trigger.kind === 'area' ? `つぎの できごと：${next.trigger.place}` : 'まちを じゆうに すごそう' };
      }
      case 'finished': return { title: 'つづきは じゅんびちゅう', detail: 'まちを じゆうに あるこう', warn: false };
    }
  }

  onMapEvent(e: MapEvent): { speaker?: string; lines: string[] } | void {
    const s = this.state;
    if (e.type === 'portal-blocked' && e.portalId === STORY_HOME_EXIT_PORTAL && s.phase === 'meet-mother') {
      return { speaker: STORY_MOTHER_NAME, lines: ['ちょっと まって！ でかける まえに、こっちに きて。'] };
    }
    if (e.type === 'area-enter') {
      for (const f of this.stage.forced) if (f.trigger.kind === 'area' && f.trigger.areaId === e.areaId) this.armed.add(f.eventId);
      return;
    }
    if (e.type !== 'interact') return;
    if (e.eventKey === STORY_MOTHER_KEY) return this.talkToMother(e.areaId);
    if (s.phase !== 'errands') return;
    const errand = STORY_ERRANDS.find(item => item.eventKey === e.eventKey && !s.errandsDone.includes(item.id));
    if (!errand) return;
    s.errandsDone.push(errand.id);
    if (errand.item) this.host?.addItem(errand.item);
    const lines = [...errand.lines];
    if (s.errandsDone.length === STORY_ERRANDS.length) {
      s.phase = 'return-home';
      this.queue.push({ speaker: STORY_SELF_NAME, lines: ['これで おつかいは ぜんぶ おわり！ いえに かえって、おかあさんに ほうこくしよう。'] });
    }
    return { speaker: errand.speaker, lines };
  }

  private talkToMother(areaId: string): { speaker?: string; lines: string[] } | void {
    const s = this.state;
    if (s.phase === 'meet-mother') {
      s.phase = 'errands';
      this.host?.setPhoneOwned(true);
      return { speaker: STORY_MOTHER_NAME, lines: [
        'おはよう。きょうから ちゅうがくせいだね。',
        'はい、これ。にゅうがくの おいわいに スマホを よういしたよ。（スマホを もらった！ P キーで ひらける）',
        'さっそくだけど、おつかいを たのめる？ まちを ひとまわり すれば、どこに なにが あるか わかるよ。',
        ...STORY_ERRANDS.map(e => `・${e.place}`),
        'じゅんばんは じゆう。ぜんぶ おわったら かえってきてね。',
      ] };
    }
    if (s.phase === 'errands') {
      const left = STORY_ERRANDS.filter(e => !s.errandsDone.includes(e.id)).map(e => e.place);
      return { speaker: STORY_MOTHER_NAME, lines: [`あとは ${left.join('、')} だよ。いってらっしゃい！`] };
    }
    if (s.phase === 'return-home' && !s.bikeChoice) {
      const begun = this.lifeEvents.begin(STORY_BIKE.eventId, { areaId });
      if (begun) return { speaker: begun.speaker, lines: begun.lines };
    }
  }

  /** 人生イベントの選択が確定したとき（LifeEventPanel の onResolved から呼ぶ）。 */
  onLifeOutcome(outcome: LifeEventOutcome): void {
    const s = this.state;
    if (outcome.event.id === STORY_BIKE.eventId && s.phase === 'return-home' && !s.bikeChoice) {
      s.bikeChoice = outcome.choice.id;
      const fake = outcome.choice.id === STORY_BIKE.fakeChoiceId;
      // Budget in, price out. On the fake site the rest of the budget goes to the real shop, so nothing is left.
      this.host?.changeMoney(fake ? 0 : STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen);
      if (fake) this.queue.push({ speaker: STORY_MOTHER_NAME, lines: [
        'えっ、じてんしゃが とどかない？ その サイト、みせて。',
        '……かいしゃの じゅうしょも でんわばんごうも のっていないね。ねだんも ふしぜんに やすい。',
        'これは にせの つうはんサイトかも しれない。はらった おかねは とりもどせないことが おおいの。',
        'かう まえに、かいしゃじょうほう・れんらくさき・くちコミを たしかめようね。こまったら すぐ おとなに そうだんして。',
        'じてんしゃは、のこりの おかねで いっしょに まちの じてんしゃやさんで かおう。',
      ] });
      this.queue.push(this.bikeArrival());
      return;
    }
    if (outcome.event.id === this.inProgress) this.finishForced(outcome.event.id);
  }

  private bikeArrival(): Narration {
    return { speaker: STORY_SELF_NAME, lines: ['じてんしゃを てにいれた！ そとで B キー（タッチそうさは「じてんしゃ」）で のれるよ。'],
      after: () => this.startStage(0) };
  }

  private startStage(index: number): void {
    const s = this.state;
    s.phase = 'stage';
    s.stageIndex = index;
    s.stageElapsed = 0;
    s.forcedDone = [];
    this.armed.clear();
    this.warned = false;
    this.milestoneQueued = false;
    if (index > 0) this.host?.warp(STORY_BEDROOM);
    this.queue.push({ speaker: STORY_SELF_NAME, lines: this.stage.intro });
    this.host?.notice(`${this.stage.name} の ステージ が はじまった`);
  }

  private finishForced(eventId: string): void {
    if (!this.state.forcedDone.includes(eventId)) this.state.forcedDone.push(eventId);
    if (this.inProgress === eventId) this.inProgress = null;
  }

  /** The forced events that should start now, in definition order. */
  private dueForced(): StoryForcedEvent | undefined {
    const s = this.state;
    return this.stage.forced.find(f => !s.forcedDone.includes(f.eventId) && (s.phase === 'stage-ending' ||
      (f.trigger.kind === 'time' ? s.stageElapsed >= f.trigger.atSeconds : this.armed.has(f.eventId))));
  }

  /**
   * 毎フレーム呼ぶ。exploring は「探索中（会話・選択肢・画面がどれも開いていない）」。
   * 探索中だけ時間を進め、お知らせ・強制イベント・節目の演出を一つずつ始める。
   */
  tick(dt: number, exploring: boolean): void {
    const host = this.host;
    if (!host || !exploring) return;
    // A forced event cancelled before choosing (e.g. "さいしょから") will start again.
    if (this.inProgress && !this.lifeEvents.pending) this.inProgress = null;
    if (this.pendingAfter) { const after = this.pendingAfter; this.pendingAfter = undefined; after(); }
    if (this.inProgress) return;
    const next = this.queue.shift();
    if (next) {
      if (host.say(next.speaker, next.lines)) this.pendingAfter = next.after;
      else next.after?.();
      return;
    }
    const s = this.state;
    if (s.phase !== 'stage' && s.phase !== 'stage-ending') return;
    const forced = this.dueForced();
    if (forced) { this.beginForced(forced); return; }
    if (s.phase === 'stage-ending') {
      if (this.milestoneQueued) return;
      this.milestoneQueued = true;
      const nextIndex = s.stageIndex + 1;
      this.queue.push({ speaker: STORY_SELF_NAME, lines: this.stage.milestone, after: () => {
        if (nextIndex < STORY_STAGES.length) this.startStage(nextIndex);
        else s.phase = 'finished';
      } });
      return;
    }
    if (Number.isFinite(dt) && dt > 0) s.stageElapsed = Math.min(this.stage.limitSeconds, s.stageElapsed + dt);
    if (!this.warned && this.remaining <= this.stage.warnSeconds) {
      this.warned = true;
      host.notice(`${this.stage.name} の のこり じかんが すくない！`);
    }
    if (this.remaining <= 0) {
      s.phase = 'stage-ending';
      host.notice('じかんぎれ！');
    }
  }

  private beginForced(forced: StoryForcedEvent): void {
    const areaId = this.host!.areaId();
    // Someone who is not here cannot be heard: their news arrives on the phone instead.
    const mail = forced.mail && !forced.mail.atAreas.includes(areaId) ? forced.mail : undefined;
    const begun = this.lifeEvents.begin(forced.eventId, { areaId, speaker: mail && mailSpeaker(mail.from) });
    if (!begun) return;
    if (this.lifeEvents.pending?.event.id === forced.eventId) this.inProgress = forced.eventId;
    else this.finishForced(forced.eventId);
    if (mail) this.host!.notice(`${mail.from} から メールが とどいた`);
    this.host!.say(begun.speaker ?? '', mail ? [MAIL_ARRIVED, ...begun.lines] : begun.lines);
  }
}

const MAIL_ARRIVED = '（スマホに メールが とどいた。）';

/** メールで届いた知らせの、会話欄に出す名前。 */
export function mailSpeaker(from: string): string { return `メール：${from}`; }
