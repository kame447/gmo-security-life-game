/** 起動：各部品を組み立てて接続するだけ。個別の処理は app/・ui/・input/ 以下に置く。 */
import { exposeDebug, FrameRecorder } from './app/debug';
import { startLoop } from './app/loop';
import { loadSave, writeSave } from './app/save-store';
import { Controls } from './input/controls';
import { Renderer } from './render/renderer';
import { PHONE_INITIAL_OWNED } from './phone/config';
import { Game } from './session/game';
import { AvatarPanel } from './ui/avatar-panel';
import { UiController } from './ui/controller';
import { $ } from './ui/dom';
import { Hud } from './ui/hud';
import { PhonePanel } from './ui/phone-panel';
import { buildWorld } from './world';

const world = buildWorld();
const game = new Game(world, { save: loadSave(world, PHONE_INITIAL_OWNED), initialPhoneOwned: PHONE_INITIAL_OWNED });
const canvas = $<HTMLCanvasElement>('#view');
const renderer = new Renderer(canvas);
const controls = new Controls();
const frames = new FrameRecorder();

function save() {
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
const phone = new PhonePanel(game.phone, () => { controls.clear(); ui.focusMap(); });
const ui = new UiController(game, controls, avatar, phone, canvas);
const hud = new Hud(game, () => ui.primaryAction());
ui.bind({ onReset: () => { game.reset(); save(); } });
game.phone.onChange(save);
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
  },
});
document.addEventListener('visibilitychange', () => { controls.clear(); loop.resetClock(); });
ui.focusMap();
