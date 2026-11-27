/** 起動：各部品を組み立てて接続するだけ。個別の処理は app/・ui/・input/ 以下に置く。 */
import { exposeDebug, FrameRecorder } from './app/debug';
import { startLoop } from './app/loop';
import { bagReviewOptions } from './app/bag-review';
import { clerkEvents } from './app/clerk-events';
import { prepareShopReview } from './app/shop-review';
import type { MapEventSink } from './core/types';
import { loadSave, writeSave } from './app/save-store';
import { newGameRequested } from './app/start-mode';
import { installBgm } from './audio/bgm';
import { LifeEventDirector } from './events/director';
import { CHILDHOOD_SAMPLE_EVENTS } from './events/samples/childhood';
import { applyBagReviewFixture } from './data/bag-review-fixture';
import { Controls } from './input/controls';
import { Minimap } from './minimap/view';
import { Renderer } from './render/renderer';
import { PHONE_INITIAL_OWNED } from './phone/config';
import { PHONE_BUDGET_PROTOTYPE } from './phone/budget-config';
import { Game } from './session/game';
import { TRAIN_NETWORK } from './travel/network';
import { TrainTravelPanel } from './travel/panel';
import { AvatarPanel } from './ui/avatar-panel';
import { HotbarPanel } from './ui/bag-hotbar/panel';
import { UiController } from './ui/controller';
import { $ } from './ui/dom';
import { Hud } from './ui/hud';
import { LifeEventPanel } from './ui/life-event-panel';
import { Smartphone } from './ui/smartphone';
import { ShopPanel } from './ui/shop-panel';
import { StoryHud } from './ui/story-hud';
import { PlayfieldViewport } from './ui/playfield-viewport';
import { DialogLogPanel } from './ui/dialog-log-panel';
import { DialogLog } from './events/dialog-log';
import { StoryDirector } from './story/director';
import { storyMapGoals } from './story/map-goals';
import { STORY_EVENTS } from './story/events';
import { parseStorySave } from './story/state';
import { buildWorld } from './world';

const world = buildWorld();
let train: TrainTravelPanel | undefined;
// 人生イベントは試作段階。まだ永続保存には対応していない。
const lifeEvents = new LifeEventDirector([...CHILDHOOD_SAMPLE_EVENTS, ...STORY_EVENTS]);
const review = bagReviewOptions(window.location.search);
const shopReview = review.temporary && new URLSearchParams(window.location.search).get('shopReview') === '1';
let shopEvents: MapEventSink | undefined;
const phoneOptions = { initialPhoneOwned: PHONE_INITIAL_OWNED, phoneDataConfig: PHONE_BUDGET_PROTOTYPE };
const saved = review.temporary ? undefined : loadSave(world, phoneOptions);
// Story (docs/features/story.md): resumes from a story save. Otherwise the title screen's 「はじめから」 (which clears the save
// first) or `?story=1` starts a new one in place of a free-play save.
const storySaved = parseStorySave(saved?.story);
const startNewStory = !review.temporary && (newGameRequested() || new URLSearchParams(window.location.search).get('story') === '1');
const story = storySaved ? StoryDirector.resume(storySaved, lifeEvents)
  : startNewStory ? StoryDirector.newGame(lifeEvents) : undefined;
const game = new Game(world, { ...phoneOptions, save: story && !storySaved ? undefined : saved,
  ...(story ? { initialPhoneOwned: false, start: story.startPoint,
    portalGuard: portal => story.canUsePortal(portal), canRide: () => story.canRide } : {}), sink: {
  // clerk-event-routing.test.ts evaluates this expression with only shopEvents and lifeEvents bound.
  onMapEvent: event => (typeof story !== 'undefined' ? story?.onMapEvent(event) : undefined) ?? lifeEvents.onMapEvent(event) ?? shopEvents?.onMapEvent(event)
    ?? (typeof train !== 'undefined' && train.tryOpen(event) ? { lines: [] } : undefined),
} });
if (review.temporary) applyBagReviewFixture(game.assets);
if (shopReview) prepareShopReview(game);
game.phone.setVisible(!document.hidden);
const canvas = $<HTMLCanvasElement>('#view');
const renderer = new Renderer(canvas);
const controls = new Controls();
const frames = new FrameRecorder();

function save() {
  if (review.temporary) return;
  const data = game.serialize();
  if (story) data.story = story.save();
  // A draft is visible immediately, but autosave must preserve the last confirmed appearance.
  const confirmed = avatar.confirmedAppearance;
  if (confirmed) data.appearance = confirmed;
  writeSave(data);
}

const avatar = new AvatarPanel(game, commit => {
  controls.clear();
  if (commit) save();
  ui.focusMap();
});
const minimap: Minimap = new Minimap(game, (): boolean => ui.mode === 'explore',
  () => { controls.clear(); ui.update(); },
  () => { controls.clear(); ui.update(); ui.focusMap(); }, () => storyMapGoals(story));
const ui: UiController = new UiController(game, controls, canvas, minimap, () => train);
ui.registerPanel({ id: 'avatar', panel: avatar, open: () => avatar.open(), button: $<HTMLButtonElement>('#btn-avatar') });
const closeBag = () => { controls.clear(); ui.update(); ui.focusMap(); };
const bag = new HotbarPanel(game, closeBag, () => { controls.clear(); ui.focusMap(); }, save);
ui.registerPanel({ id: 'inventory', panel: bag, open: () => bag.open(), button: bag.button, shortcut: 'KeyI' });
const phone = new Smartphone(game.phone, $<HTMLElement>('#stage'), () => { controls.clear(); ui.focusMap(); },
  () => ({ remainingMb: game.phone.remainingDataMb, capacityMb: game.phone.dataCapacityMb }));
ui.registerPanel({ id: 'phone', panel: phone, open: () => phone.open(), button: phone.button,
  shortcut: 'KeyP', canOpen: () => phone.isAvailable });
game.phone.onChange(() => { save(); ui.update(); });
train = new TrainTravelPanel(game, TRAIN_NETWORK, $<HTMLElement>('#stage'), {
  canOpen: () => ui.mode === 'explore',
  onOpen: () => { controls.clear(); ui.update(); },
  onClose: () => { controls.clear(); save(); ui.update(); ui.focusMap(); },
  arrive: destination => game.arriveByTrain(destination),
});
const shop = new ShopPanel(game.assets, () => { controls.clear(); ui.focusMap(); }, save,
  () => ({ stats: renderer.stats, area: game.area, playerX: game.player.x }));
ui.registerPanel({ id: 'shop', panel: shop });
shopEvents = clerkEvents(game, ui, context => shop.open(context));
const hud = new Hud(game, () => ui.primaryAction());
installBgm(muted => hud.showToast(muted ? 'おんがく：オフ（M）' : 'おんがく：オン（M）'));
const dialogLog = new DialogLog();
const dialogLogPanel = new DialogLogPanel(dialogLog, $<HTMLElement>('#stage'), () => { controls.clear(); ui.update(); ui.focusMap(); });
ui.registerPanel({ id: 'log', panel: dialogLogPanel, open: () => dialogLogPanel.open(), button: dialogLogPanel.button, shortcut: 'KeyL' });
const lifeEventPanel = new LifeEventPanel(game, lifeEvents, outcome => {
  dialogLog.choice(outcome.choice.label);
  controls.clear(); story?.onLifeOutcome(outcome); save();
});
story?.attach({
  say: (speaker, lines) => game.say(speaker, lines),
  warp: spawn => game.warp(spawn),
  areaId: () => game.player.areaId,
  setPhoneOwned: owned => game.phone.setOwned(owned),
  changeMoney: delta => game.assets.changeMoney(delta).ok,
  addItem: id => game.assets.addItem(id, 1).ok,
  money: () => game.assets.moneyYen,
  itemCount: id => game.assets.quantity(id),
  notice: text => hud.showToast(text),
  deliverMail: (id, mail) => { game.phone.deliverMail({ ...mail, links: mail.links?.map(link => ({ ...link })), id, atMs: Date.now() }); },
});
const storyHud = story && new StoryHud(story, !storySaved);
ui.bind({ onReset: () => { game.reset(); save(); } });
window.addEventListener('keydown', event => bag.handleHudKey(event, ui.mode === 'explore'));
exposeDebug(game, renderer, frames);
// Verification hook for scripts/e2e-story.mjs (read-only use; does not change the game).
if (story) (window as unknown as { __slgStory?: StoryDirector }).__slgStory = story;
if (shopReview) game.action();

game.on(event => {
  if (event.type === 'edge' && world.variant.edgeMessage) hud.showToast(world.variant.edgeMessage);
  if (event.type === 'area-enter') save();
});
// Mail can arrive while exploring; an open inbox already shows it.
game.phone.onMailArrive(() => {
  if (game.phone.isOwned && !(game.phone.isOpen && game.phone.currentApp?.id === 'mail')) hud.showToast('メールが とどきました（P）');
});
window.addEventListener('pagehide', () => { controls.clear(); save(); });
if (!review.temporary) setInterval(save, 3000);

const playfield = new PlayfieldViewport($<HTMLElement>('#stage'), $<HTMLElement>('.bag-quick-hud'),
  (width, height, density) => renderer.resize(width, height, density));
playfield.update(game.area.def.kind === 'indoor');

const loop = startLoop({
  beforeFrame: () => playfield.update(game.area.def.kind === 'indoor'),
  input: () => ui.movementInput(),
  update: (dt, input) => {
    if (!minimap.isOpen) game.update(dt, input);
    story?.tick(dt, ui.mode === 'explore' && !game.dialog && !lifeEventPanel.isOpen && !lifeEvents.pending && !document.hidden);
  },
  draw: now => renderer.draw(game, now / 1000),
  measuring: () => frames.recording,
  afterFrame: (now, frame, input) => {
    game.updatePhoneLocation();
    phone.update();
    frames.record(now, frame, input, game, renderer);
    avatar.drawPreview(now);
    lifeEventPanel.update();
    dialogLog.observe(game.dialog);
    storyHud?.update();
    hud.update(now);
    ui.update();
    bag.update(ui.mode === 'explore');
    minimap.update();
  },
});
document.addEventListener('visibilitychange', () => {
  game.phone.setVisible(!document.hidden);
  controls.clear(); loop.resetClock(); save();
});
ui.focusMap();
