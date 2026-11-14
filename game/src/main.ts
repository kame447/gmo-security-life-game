/** 起動：各部品を組み立てて接続するだけ。個別の処理は app/・ui/・input/ 以下に置く。 */
import { exposeDebug, FrameRecorder } from './app/debug';
import { startLoop } from './app/loop';
import { bagReviewOptions } from './app/bag-review';
import { clerkEvents } from './app/clerk-events';
import { prepareShopReview } from './app/shop-review';
import type { MapEventSink } from './core/types';
import { LocalSaveSession } from './app/local-save-session';
import { LifeEventDirector } from './events/director';
import { CHILDHOOD_SAMPLE_EVENTS } from './events/samples/childhood';
import { applyBagReviewFixture } from './data/bag-review-fixture';
import { Controls } from './input/controls';
import { Minimap } from './minimap/view';
import { Renderer } from './render/renderer';
import { PHONE_INITIAL_OWNED } from './phone/config';
import { PHONE_BUDGET_PROTOTYPE } from './phone/budget-config';
import { Game } from './session/game';
import { AvatarPanel } from './ui/avatar-panel';
import { HotbarPanel } from './ui/bag-hotbar/panel';
import { UiController } from './ui/controller';
import { $ } from './ui/dom';
import { Hud } from './ui/hud';
import { LifeEventPanel } from './ui/life-event-panel';
import { LocalSavePanel } from './ui/local-save-panel';
import { Smartphone } from './ui/smartphone';
import { ShopPanel } from './ui/shop-panel';
import { buildWorld } from './world';

const world = buildWorld();
const review = bagReviewOptions(window.location.search);
const shopReview = review.temporary && new URLSearchParams(window.location.search).get('shopReview') === '1';
let shopEvents: MapEventSink | undefined;
const phoneOptions = { initialPhoneOwned: PHONE_INITIAL_OWNED, phoneDataConfig: PHONE_BUDGET_PROTOTYPE };
const localSave = new LocalSaveSession(world, { readOptions: phoneOptions, disabled: review.temporary });
const game: Game = new Game(world, { ...phoneOptions, save: localSave.initialSave, sink: {
  onMapEvent: event => shopEvents?.onMapEvent(event) ?? lifeEvents.onMapEvent(event),
} });
const lifeEvents = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS, game.life.state);
if (shopReview) prepareShopReview(game);
else if (review.temporary) applyBagReviewFixture(game.assets);
game.phone.setVisible(!document.hidden);
const canvas = $<HTMLCanvasElement>('#view');
const renderer = new Renderer(canvas);
const controls = new Controls();
const frames = new FrameRecorder();

function saveSnapshot() {
  const data = game.serialize();
  // A draft is visible immediately, but autosave must preserve the last confirmed appearance.
  const confirmed = avatar.confirmedAppearance;
  if (confirmed) data.appearance = confirmed;
  return data;
}
function save() { if (!review.temporary) localSave.save(saveSnapshot); }

const avatar = new AvatarPanel(game, commit => {
  controls.clear();
  if (commit) save();
  ui.focusMap();
});
const minimap: Minimap = new Minimap(game, (): boolean => ui.mode === 'explore',
  () => { controls.clear(); ui.update(); },
  () => { controls.clear(); ui.update(); ui.focusMap(); });
const ui: UiController = new UiController(game, controls, canvas, minimap);
ui.registerPanel({ id: 'avatar', panel: avatar, open: () => avatar.open(), button: $<HTMLButtonElement>('#btn-avatar') });
const closeBag = () => { controls.clear(); ui.update(); ui.focusMap(); };
const bag = new HotbarPanel(game, closeBag, () => { controls.clear(); ui.focusMap(); }, save);
ui.registerPanel({ id: 'inventory', panel: bag, open: () => bag.open(), button: bag.button, shortcut: 'KeyI' });
const phone = new Smartphone(game.phone, $<HTMLElement>('#stage'), () => { controls.clear(); ui.focusMap(); },
  () => ({ remainingMb: game.phone.remainingDataMb, capacityMb: game.phone.dataCapacityMb }));
ui.registerPanel({ id: 'phone', panel: phone, open: () => phone.open(), button: phone.button,
  shortcut: 'KeyP', canOpen: () => phone.isAvailable });
if (!review.temporary) {
  const savePanel = new LocalSavePanel(localSave, $<HTMLElement>('#stage'), {
    snapshot: saveSnapshot,
    newGame: () => new Game(world, phoneOptions).serialize(),
    reload: () => window.location.reload(),
    onClose: () => { controls.clear(); ui.update(); ui.focusMap(); },
  });
  ui.registerPanel({ id: 'save', panel: savePanel, open: () => savePanel.open(), button: savePanel.button });
  $<HTMLButtonElement>('#btn-reset').textContent = 'スタート地点へ';
}
game.phone.onChange(() => { save(); ui.update(); });
const shop = new ShopPanel(game.assets, () => { controls.clear(); ui.focusMap(); }, save);
ui.registerPanel({ id: 'shop', panel: shop });
shopEvents = clerkEvents(game, ui, context => shop.open(context));
const hud = new Hud(game, () => ui.primaryAction());
const lifeEventPanel = new LifeEventPanel(game, lifeEvents, () => controls.clear());
ui.bind({ onReset: () => { game.reset(); save(); } });
if (bag instanceof HotbarPanel) {
  window.addEventListener('keydown', event => bag.handleHudKey(event, ui.mode === 'explore'));
}
exposeDebug(game, renderer, frames);
if (shopReview) game.action();

game.on(event => {
  if (event.type === 'edge' && world.variant.edgeMessage) hud.showToast(world.variant.edgeMessage);
  if (event.type === 'area-enter') save();
});
window.addEventListener('pagehide', () => { controls.clear(); save(); });
if (!review.temporary) setInterval(save, 3000);

let dpr = 0;
function resize() {
  dpr = window.devicePixelRatio || 1;
  renderer.resize(window.innerWidth, window.innerHeight, dpr);
}
window.addEventListener('resize', resize);
resize();

const loop = startLoop({
  beforeFrame: () => { if (dpr !== window.devicePixelRatio) resize(); },
  input: () => ui.movementInput(),
  update: (dt, input) => { if (!minimap.isOpen) game.update(dt, input); },
  draw: now => renderer.draw(game, now / 1000),
  measuring: () => frames.recording,
  afterFrame: (now, frame, input) => {
    game.updatePhoneLocation();
    phone.update();
    frames.record(now, frame, input, game, renderer);
    avatar.drawPreview(now);
    lifeEventPanel.update();
    hud.update(now);
    ui.update();
    if (bag instanceof HotbarPanel) bag.update(ui.mode === 'explore');
    minimap.update();
  },
});
document.addEventListener('visibilitychange', () => {
  game.phone.setVisible(!document.hidden);
  controls.clear(); loop.resetClock(); save();
});
ui.focusMap();
