/** 起動：各部品を組み立てて接続するだけ。個別の処理は app/・ui/・input/ 以下に置く。 */
import { exposeDebug, FrameRecorder } from './app/debug';
import { startLoop } from './app/loop';
import { loadSave, writeSave } from './app/save-store';
import { Controls } from './input/controls';
import { Renderer } from './render/renderer';
import { PHONE_INITIAL_OWNED } from './phone/config';
import { PHONE_BUDGET_PROTOTYPE } from './phone/budget-config';
import { Game } from './session/game';
import { AvatarPanel } from './ui/avatar-panel';
import { UiController } from './ui/controller';
import { $ } from './ui/dom';
import { Hud } from './ui/hud';
import { Smartphone } from './ui/smartphone';
import { buildWorld } from './world';

const world = buildWorld();
const reviewOnly = new URLSearchParams(window.location.search).get('review') === '1';
const phoneOptions = { initialPhoneOwned: PHONE_INITIAL_OWNED, phoneDataConfig: PHONE_BUDGET_PROTOTYPE };
const game = new Game(world, { ...phoneOptions, save: reviewOnly ? undefined : loadSave(world, phoneOptions) });
game.phone.setVisible(!document.hidden);
const canvas = $<HTMLCanvasElement>('#view');
const renderer = new Renderer(canvas);
const controls = new Controls();
const frames = new FrameRecorder();

function save() {
  if (reviewOnly) return;
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
const phone = new Smartphone(game.phone, $<HTMLElement>('#stage'), () => { controls.clear(); ui.focusMap(); },
  () => ({ remainingMb: game.phone.remainingDataMb, capacityMb: game.phone.dataCapacityMb }));
ui.registerPanel({ id: 'phone', panel: phone, open: () => phone.open(), button: phone.button,
  shortcut: 'KeyP', canOpen: () => phone.isAvailable });
game.phone.onChange(() => { save(); ui.update(); });
const hud = new Hud(game, () => ui.primaryAction());
ui.bind({ onReset: () => { game.reset(); save(); } });
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
    game.updatePhoneLocation();
    phone.update();
    frames.record(now, frame, input, game, renderer);
    avatar.drawPreview(now);
    hud.update(now);
    ui.update();
  },
});
document.addEventListener('visibilitychange', () => {
  game.phone.setVisible(!document.hidden);
  controls.clear(); loop.resetClock(); save();
});
ui.focusMap();
