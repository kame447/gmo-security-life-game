/** 起動：各部品を組み立てて接続するだけ。個別の処理は app/・ui/・input/ 以下に置く。 */
import { exposeDebug, FrameRecorder } from './app/debug';
import { startLoop } from './app/loop';
import { clerkEvents } from './app/clerk-events';
import { loadSave, writeSave } from './app/save-store';
import { Controls } from './input/controls';
import { Renderer } from './render/renderer';
import { Game } from './session/game';
import { AvatarPanel } from './ui/avatar-panel';
import { UiController } from './ui/controller';
import { $ } from './ui/dom';
import { Hud } from './ui/hud';
import { ShopCandidates } from './ui/shop-candidates';
import { shopLayout } from './shop/layout';
import type { MapEventSink } from './core/types';
import { prepareShopReview } from './app/shop-review';
import { buildWorld } from './world';

const world = buildWorld();
const review = new URLSearchParams(location.search).get('review') === '1';
let shopEvents: MapEventSink | undefined;
const game = new Game(world, { save: review ? undefined : loadSave(world), sink: { onMapEvent: event => shopEvents?.onMapEvent(event) } });
if (review) prepareShopReview(game);
const canvas = $<HTMLCanvasElement>('#view');
const renderer = new Renderer(canvas);
const controls = new Controls();
const frames = new FrameRecorder();

function save() {
  if (review) return;
  const data = game.serialize();
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
const ui = new UiController(game, controls, canvas);
ui.registerPanel({ id: 'avatar', panel: avatar, open: () => avatar.open(), button: $<HTMLButtonElement>('#btn-avatar') });
const shop = new ShopCandidates(game.assets, () => { controls.clear(); ui.focusMap(); }, save, shopLayout(location.search));
ui.registerPanel({ id: 'shop', panel: shop });
shopEvents = clerkEvents(game, ui, context => shop.open(context));
const hud = new Hud(game, () => ui.primaryAction());
ui.bind({ onReset: () => { game.reset(); save(); } });
exposeDebug(game, renderer, frames);
if (review) game.action();

game.on(event => {
  if (event.type === 'edge' && world.variant.edgeMessage) hud.showToast(world.variant.edgeMessage);
  if (event.type === 'area-enter') save();
});
window.addEventListener('pagehide', () => { controls.clear(); save(); });
setInterval(save, 3000);

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
  update: (dt, input) => game.update(dt, input),
  draw: now => renderer.draw(game, now / 1000),
  measuring: () => frames.recording,
  afterFrame: (now, frame, input) => {
    frames.record(now, frame, input, game, renderer);
    avatar.drawPreview(now);
    hud.update(now);
    ui.update();
  },
});
document.addEventListener('visibilitychange', () => { controls.clear(); loop.resetClock(); });
ui.focusMap();
