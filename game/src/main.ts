/** 起動：各部品を組み立てて接続するだけ。個別の処理は app/・ui/・input/ 以下に置く。 */
import { exposeDebug, FrameRecorder } from './app/debug';
import { startLoop } from './app/loop';
import { loadSave, writeSave } from './app/save-store';
import { applyBagReviewFixture } from './data/bag-review-fixture';
import { Controls } from './input/controls';
import { Renderer } from './render/renderer';
import { Game } from './session/game';
import { AvatarPanel } from './ui/avatar-panel';
import { HotbarPanel } from './ui/bag-hotbar/panel';
import { UiController } from './ui/controller';
import { $ } from './ui/dom';
import { Hud } from './ui/hud';
import { buildWorld } from './world';

const world = buildWorld();
const isBagReview = new URLSearchParams(window.location.search).get('review') === '1';
const game = new Game(world, { save: isBagReview ? undefined : loadSave(world) });
if (isBagReview && !applyBagReviewFixture(game.assets).ok) throw new Error('Bag review fixture is invalid');
const canvas = $<HTMLCanvasElement>('#view');
const renderer = new Renderer(canvas);
const controls = new Controls();
const frames = new FrameRecorder();

function save() {
  if (isBagReview) return;
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
const bag = new HotbarPanel(game, () => { controls.clear(); ui.focusMap(); }, () => { controls.clear(); ui.focusMap(); });
ui.registerPanel({ id: 'inventory', panel: bag, open: () => bag.open(), button: bag.button, shortcut: 'KeyI' });
const hud = new Hud(game, () => ui.primaryAction());
ui.bind({ onReset: () => { game.reset(); save(); } });
window.addEventListener('keydown', event => bag.handleHudKey(event, ui.mode === 'explore'));
exposeDebug(game, renderer, frames);

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
    bag.update(ui.mode === 'explore');
  },
});
document.addEventListener('visibilitychange', () => { controls.clear(); loop.resetClock(); });
ui.focusMap();
