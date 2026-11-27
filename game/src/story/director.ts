/**
 * ストーリーの進行（docs/features/story.md）：序章（目覚め → スマホ → お使い → 自転車の購入）と、
 * 必須イベントを順に解放するステージ進行（中学生 → … → 老後）。DOM に依存せず、画面・ゲームとは StoryHost を通じてやり取りする。
 *
 * - ステージ全体の制限時間はない。必須イベントを経験すると次が解放され、すべて終えると節目が解放される。
 *   次のステージへは、プレイヤーが自室のベッドで進むと決めたときだけ移る。
 * - マップの通知（MapEventSink）は人生イベント・買い物より先に受け取り、序章の相手とベッドだけを横取りする。
 * - 会話・選択肢・画面が開いている間は、進行も時間も止める（tick の exploring が false）。
 * - 個別の行き先・ステージ・イベントの中身は config.ts / events.ts のデータに置く。
 * - 最後に、選んだ選択肢と所持金から評価（Issue #62、score.ts）を計算して振り返る。結果画面はまだないため会話欄に出す。
 */
import type { MapEvent, MapEventSink, PortalDef, SpawnPoint } from '../core/types';
import type { DialogState } from '../events/dialog';
import { shopCatalog } from '../data/shop-catalogs';
import type { LifeEventDirector, LifeEventOutcome } from '../events/director';
import {
  STORY_ADVANCE_EVENT, STORY_ADVANCE_GO, STORY_BED_KEY, STORY_BEDROOM, STORY_BIKE, STORY_ERRAND_ALLOWANCE_YEN, STORY_ERRANDS,
  STORY_HOME_EXIT_PORTAL, STORY_HOME_FACILITY, STORY_MOTHER_KEY, STORY_MOTHER_NAME, STORY_SELF_NAME, STORY_STAGES,
  type StoryCondition, type StoryErrand, type StoryNotice, type StoryStage, type StoryStep,
} from './config';
import { STORY_EVENTS } from './events';
import { evaluateLife, resultLines, type LifeEvaluation, type StoryChoiceDef } from './score';
import { bikeOwned, newStoryState, phoneGiven, type StorySave } from './state';

/** ストーリーが操作するゲーム側の窓口。 */
export interface StoryHost {
  say(speaker: string, lines: readonly string[]): boolean;
  warp(spawn: Readonly<SpawnPoint>): boolean;
  areaId(): string;
  setPhoneOwned(owned: boolean): void;
  changeMoney(deltaYen: number): boolean;
  addItem(itemId: string): boolean;
  /** 所持金（円）。 */
  money(): number;
  /** 持ち物にある品の数。 */
  itemCount(itemId: string): number;
  /** 短いお知らせ。 */
  notice(text: string): void;
  /** スマホの受信トレイに知らせを届ける。同じ id は二度届かない（受信トレイ側で弾く）。 */
  deliverMail(id: string, mail: StoryNotice): void;
}

/** ミニマップの目的地の印（施設 id）。 */
export interface MapGoals {
  readonly pending: readonly string[];
  readonly done: readonly string[];
}

export interface StoryStatus {
  /** 一行目：いまの段階・ステージ名。 */
  title: string;
  /** 二行目：次にすること。 */
  detail: string;
}

type Narration = { speaker: string; lines: readonly string[]; after?: () => void };

const WAKE_LINES = ['……ふぁあ。朝だ。', '今日から中学生。1階でお母さんが呼んでいる。', '（階段は部屋の右上。）'];

export class StoryDirector implements MapEventSink {
  private state: StorySave;
  private host?: StoryHost;
  private readonly queue: Narration[] = [];
  private pendingAfter?: () => void;
  private errandIntroduction?: { lines: readonly string[]; firstTaskLine: number; shown: number };
  /** A story event whose choices are still open. */
  private inProgress: string | null = null;
  /** Notices already handed to the inbox in this session (the inbox itself also drops duplicates after a reload). */
  private readonly delivered = new Set<string>();

  private constructor(state: StorySave, private readonly lifeEvents: LifeEventDirector, fresh: boolean) {
    this.state = state;
    if (fresh) this.queue.push({ speaker: STORY_SELF_NAME, lines: WAKE_LINES });
    // A reload between buying the bicycle and the first stage resumes at the stage.
    if (state.phase === 'return-home' && state.bikeChoice) this.queue.push(this.bikeArrival());
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
  /** 新しく始めたとき・「さいしょから」の位置。 */
  get startPoint(): Readonly<SpawnPoint> { return STORY_BEDROOM; }
  get canRide(): boolean { return bikeOwned(this.state); }
  get errandsDone(): readonly string[] { return this.state.errandsDone; }
  /** 最初の説明中だけ、すでに台詞に出た用事を返す。通常の再開時は全件を案内する。 */
  get errandsRevealed(): readonly string[] | undefined {
    const introduction = this.errandIntroduction;
    return introduction && STORY_ERRANDS.slice(0, introduction.shown).map(errand => errand.id);
  }

  /** 実際に表示する台詞に合わせて、お使いの案内を一件ずつ増やす。 */
  observeDialog(dialog: Readonly<DialogState> | null): void {
    const introduction = this.errandIntroduction;
    if (!introduction) return;
    if (!dialog || dialog.speaker !== STORY_MOTHER_NAME ||
        dialog.lines.length !== introduction.lines.length ||
        dialog.lines.some((line, index) => line !== introduction.lines[index])) {
      this.errandIntroduction = undefined;
      return;
    }
    introduction.shown = Math.max(introduction.shown,
      Math.min(STORY_ERRANDS.length, Math.max(0, dialog.index - introduction.firstTaskLine + 1)));
  }
  get stepsDone(): readonly string[] { return this.state.stepsDone; }
  get choices(): Readonly<Record<string, string>> { return this.state.choices; }

  /** 現在のステージで、次に起きる必須イベント（条件に合わないものは飛ばす）。すべて終えていれば undefined。 */
  get currentStep(): StoryStep | undefined {
    const s = this.state;
    if (s.phase !== 'stage') return undefined;
    return this.stage.steps.find(step => !s.stepsDone.includes(step.eventId) && this.applies(step));
  }

  private applies(step: StoryStep): boolean {
    return !step.when || meetsCondition(step.when, this.state.choices);
  }

  /** ミニマップに印を出す施設：お使いの残りと済んだ行き先、次の出来事の場所、節目の後は自宅。 */
  mapGoals(): MapGoals | undefined {
    const s = this.state;
    if (s.phase === 'errands') {
      return {
        pending: STORY_ERRANDS.filter(e => !s.errandsDone.includes(e.id)).map(e => e.facilityId),
        done: STORY_ERRANDS.filter(e => s.errandsDone.includes(e.id)).map(e => e.facilityId),
      };
    }
    if (s.phase === 'return-home') return { pending: [STORY_HOME_FACILITY], done: STORY_ERRANDS.map(e => e.facilityId) };
    if (s.phase === 'milestone') return { pending: [STORY_HOME_FACILITY], done: [] };
    const step = this.currentStep;
    if (step?.trigger.kind === 'place' && step.trigger.place.facilityId) return { pending: [step.trigger.place.facilityId], done: [] };
    return undefined;
  }

  canUsePortal(portal: Readonly<PortalDef>): boolean {
    return !(this.state.phase === 'meet-mother' && portal.id === STORY_HOME_EXIT_PORTAL);
  }

  save(): StorySave { return structuredClone(this.state); }

  status(): StoryStatus {
    const s = this.state;
    const stageTitle = `${this.stage.name}（${s.stageIndex + 1}/${STORY_STAGES.length}）`;
    switch (s.phase) {
      case 'meet-mother': return { title: '序章', detail: '1階のお母さんに話しかけよう' };
      case 'errands': {
        const left = STORY_ERRANDS.filter(e => !s.errandsDone.includes(e.id));
        return { title: `お使い ${s.errandsDone.length}/${STORY_ERRANDS.length}`, detail: `次：${left.map(e => e.place).join('・')}` };
      }
      case 'return-home': return { title: 'お使い完了', detail: '家に帰ってお母さんに話しかけよう' };
      case 'stage': {
        const step = this.currentStep;
        const detail = step?.trigger.kind === 'place' ? `次の出来事：${step.trigger.place.name}へ行こう` : '自由に過ごそう（そのうち連絡が来る）';
        return { title: stageTitle, detail };
      }
      case 'milestone': return { title: stageTitle, detail: '自室のベッドで休むと、次の時期へ進める' };
      case 'finished': return { title: 'おしまい', detail: '町を自由に歩ける' };
    }
  }

  onMapEvent(e: MapEvent): { speaker?: string; lines: string[] } | void {
    const s = this.state;
    if (e.type === 'portal-blocked' && e.portalId === STORY_HOME_EXIT_PORTAL && s.phase === 'meet-mother') {
      return { speaker: STORY_MOTHER_NAME, lines: ['ちょっと待って！ 出かける前に、こっちに来て。'] };
    }
    if (e.type !== 'interact') return;
    if (e.eventKey === STORY_BED_KEY && s.phase === 'milestone') {
      const begun = this.lifeEvents.begin(STORY_ADVANCE_EVENT, { areaId: e.areaId });
      if (begun) { this.inProgress = STORY_ADVANCE_EVENT; return { speaker: begun.speaker, lines: begun.lines }; }
      return;
    }
    if (e.eventKey === STORY_MOTHER_KEY) return this.talkToMother(e.areaId);
    if (s.phase !== 'errands') return;
    const errand = STORY_ERRANDS.find(item => item.eventKey === e.eventKey && !s.errandsDone.includes(item.id));
    if (!errand) return;
    // A purchase errand goes through the clerk's shop screen; it is done once the item is in the bag (see tick).
    // Without enough money the clerk hands it over in conversation, so the errand cannot get stuck.
    if (errand.buy && this.host && this.host.money() >= (errandPrice(errand) ?? Infinity)) return;
    const item = errand.buy?.itemId ?? errand.item;
    if (item) this.host?.addItem(item);
    this.completeErrand(errand);
    return { speaker: errand.speaker, lines: [...errand.lines] };
  }

  private completeErrand(errand: StoryErrand): void {
    const s = this.state;
    if (s.errandsDone.includes(errand.id)) return;
    s.errandsDone.push(errand.id);
    if (s.errandsDone.length === STORY_ERRANDS.length) {
      s.phase = 'return-home';
      this.queue.push({ speaker: STORY_SELF_NAME, lines: ['これでお使いは全部終わり！ 家に帰って、お母さんに報告しよう。'] });
    }
  }

  /** The purchase errand whose item has reached the bag (bought on the shop screen). */
  private boughtErrand(): StoryErrand | undefined {
    const s = this.state;
    if (s.phase !== 'errands') return undefined;
    return STORY_ERRANDS.find(e => e.buy && !s.errandsDone.includes(e.id) && this.host!.itemCount(e.buy.itemId) > 0);
  }

  private talkToMother(areaId: string): { speaker?: string; lines: string[] } | void {
    const s = this.state;
    if (s.phase === 'meet-mother') {
      s.phase = 'errands';
      this.host?.setPhoneOwned(true);
      this.host?.changeMoney(STORY_ERRAND_ALLOWANCE_YEN);
      const greeting = [
        'おはよう。今日から中学生だね。',
        'はい、これ。入学のお祝いにスマホを用意したよ。（スマホをもらった！ P キーで開ける）',
        'さっそくだけど、お使いを頼める？ 町をひと回りすれば、どこに何があるか分かるよ。',
      ];
      const lines = [
        ...greeting,
        ...STORY_ERRANDS.map(e => `・${e.place}`),
        `買い物のお金も渡しておくね。（${STORY_ERRAND_ALLOWANCE_YEN}円もらった）`,
        '順番は自由。全部終わったら帰ってきてね。',
      ];
      this.errandIntroduction = { lines, firstTaskLine: greeting.length, shown: 0 };
      return { speaker: STORY_MOTHER_NAME, lines };
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
    const id = outcome.event.id;
    if (id === STORY_BIKE.eventId && s.phase === 'return-home' && !s.bikeChoice) {
      s.bikeChoice = outcome.choice.id;
      s.choices[id] = outcome.choice.id;
      const fake = outcome.choice.id === STORY_BIKE.fakeChoiceId;
      // Budget in, price out. On the fake site the rest of the budget goes to the real shop, so nothing is left.
      this.host?.changeMoney(fake ? 0 : STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen);
      if (fake) this.queue.push({ speaker: STORY_MOTHER_NAME, lines: [
        'えっ、自転車が届かない？ そのサイト、見せて。',
        '……会社の住所も電話番号も載っていないね。値段も不自然に安い。',
        'これは偽の通販サイトかもしれない。払ったお金は取り戻せないことが多いの。',
        '買う前に、会社の情報・連絡先・口コミを確かめようね。困ったらすぐ大人に相談して。',
        '自転車は、残りのお金で一緒に町の自転車屋さんで買おう。',
      ] });
      this.queue.push(this.bikeArrival());
      return;
    }
    if (id === STORY_ADVANCE_EVENT) {
      if (this.inProgress === id) this.inProgress = null;
      if (s.phase === 'milestone' && outcome.choice.id === STORY_ADVANCE_GO) this.advance();
      return;
    }
    if (id !== this.inProgress) return;
    s.choices[id] = outcome.choice.id;
    const money = (outcome.choice as StoryChoiceDef).score?.moneyYen;
    if (money) this.addMoney(money);
    this.finishStep(id);
  }

  /** Money can be lost only down to zero. */
  private addMoney(deltaYen: number): void {
    const host = this.host;
    if (!host) return;
    const delta = Math.max(deltaYen, -host.money());
    if (delta) host.changeMoney(delta);
  }

  /** 人生の評価（Issue #62）。保存せず、選択の履歴と所持金から都度計算する。 */
  evaluate(): LifeEvaluation {
    return evaluateLife(this.state.choices, this.host?.money() ?? 0, STORY_EVENTS);
  }

  private bikeArrival(): Narration {
    return { speaker: STORY_SELF_NAME, lines: ['自転車を手に入れた！ 外で B キー（タッチ操作は「じてんしゃ」）で乗れるよ。'],
      after: () => this.startStage(0) };
  }

  private startStage(index: number): void {
    const s = this.state;
    s.phase = 'stage';
    s.stageIndex = index;
    s.stepsDone = [];
    s.stepElapsed = 0;
    if (index > 0) this.host?.warp(STORY_BEDROOM);
    if (this.stage.incomeYen) this.addMoney(this.stage.incomeYen);
    this.queue.push({ speaker: STORY_SELF_NAME, lines: this.stage.intro });
    this.host?.notice(`「${this.stage.name}」が始まった`);
  }

  /** The player chose to move on at the bed: milestone scene, then the next stage or the look-back at the end. */
  private advance(): void {
    const s = this.state;
    const next = s.stageIndex + 1;
    if (next < STORY_STAGES.length) {
      this.queue.push({ speaker: STORY_SELF_NAME, lines: this.stage.milestone, after: () => this.startStage(next) });
      return;
    }
    this.queue.push({ speaker: STORY_SELF_NAME, lines: this.stage.milestone });
    const pages = resultLines(this.evaluate());
    pages.forEach((lines, i) => this.queue.push({ speaker: '人生の振り返り', lines: i === pages.length - 1
      ? [...lines, 'おしまい。遊んでくれてありがとう！（このあとも町を自由に歩けます）'] : lines,
      after: i === pages.length - 1 ? () => { s.phase = 'finished'; } : undefined }));
  }

  private finishStep(eventId: string): void {
    const s = this.state;
    if (!s.stepsDone.includes(eventId)) s.stepsDone.push(eventId);
    s.stepElapsed = 0;
    if (this.inProgress === eventId) this.inProgress = null;
  }

  private beginStep(step: StoryStep): void {
    const host = this.host!;
    const begun = this.lifeEvents.begin(step.eventId, { areaId: host.areaId() });
    if (!begun) return;
    if (this.lifeEvents.pending?.event.id === step.eventId) this.inProgress = step.eventId;
    else this.finishStep(step.eventId);
    host.say(begun.speaker ?? '', begun.lines);
  }

  /**
   * 毎フレーム呼ぶ。exploring は「探索中（会話・選択肢・画面がどれも開いていない）」。
   * 探索中だけ、お知らせ・必須イベント・節目の演出を一つずつ始める。
   */
  tick(dt: number, exploring: boolean): void {
    const host = this.host;
    if (!host || !exploring) return;
    // An event cancelled before choosing (e.g. "さいしょから") will start again.
    if (this.inProgress && !this.lifeEvents.pending) this.inProgress = null;
    if (this.pendingAfter) { const after = this.pendingAfter; this.pendingAfter = undefined; after(); }
    if (this.inProgress) return;
    const next = this.queue.shift();
    if (next) {
      if (host.say(next.speaker, next.lines)) this.pendingAfter = next.after;
      else next.after?.();
      return;
    }
    const bought = this.boughtErrand();
    if (bought?.buy) {
      this.queue.push({ speaker: STORY_SELF_NAME, lines: bought.buy.done });
      this.completeErrand(bought);
      return;
    }
    const s = this.state;
    if (s.phase !== 'stage') return;
    const step = this.currentStep;
    if (!step) {
      s.phase = 'milestone';
      host.notice('節目を迎えた。ベッドで休むと次へ進める');
      this.queue.push({ speaker: STORY_SELF_NAME, lines: this.stage.unlocked });
      return;
    }
    if (step.notice && !this.delivered.has(step.eventId)) {
      this.delivered.add(step.eventId);
      host.deliverMail(`story.${step.eventId}`, step.notice);
    }
    if (step.trigger.kind === 'place') {
      if (step.trigger.place.areaIds.includes(host.areaId())) this.beginStep(step);
      return;
    }
    if (Number.isFinite(dt) && dt > 0) s.stepElapsed += dt;
    if (s.stepElapsed >= step.trigger.afterSeconds) this.beginStep(step);
  }
}

/** 分岐の条件を、これまでの選択（イベント id → 選択肢 id）で判定する。 */
export function meetsCondition(c: StoryCondition, choices: Readonly<Record<string, string>>): boolean {
  if ('all' in c) return c.all.every(item => meetsCondition(item, choices));
  if ('any' in c) return c.any.some(item => meetsCondition(item, choices));
  return c.choiceIds.includes(choices[c.eventId]);
}

/** 買う用事の品の値段（店の品ぞろえから引く）。品ぞろえに無ければ undefined。 */
export function errandPrice(errand: StoryErrand): number | undefined {
  if (!errand.buy) return undefined;
  const { itemId, catalogId } = errand.buy;
  return shopCatalog(catalogId)?.offers.find(offer => offer.itemId === itemId)?.priceYen;
}
