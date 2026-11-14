/** 起動：各部品を組み立てて接続するだけ。個別の処理は app/・ui/・input/ 以下に置く。 */
import { exposeDebug, FrameRecorder } from './app/debug';
import { startLoop } from './app/loop';
import { loadSave, writeSave } from './app/save-store';
import { LifeEventDirector } from './events/director';
import { CHILDHOOD_SAMPLE_EVENTS } from './events/samples/childhood';
import { Controls } from './input/controls';
import { Minimap } from './minimap/view';
import { Renderer } from './render/renderer';
import { Game } from './session/game';
import { AvatarPanel } from './ui/avatar-panel';
import { UiController } from './ui/controller';
import { $ } from './ui/dom';
import { Hud } from './ui/hud';
import { LifeEventPanel } from './ui/life-event-panel';
import { buildWorld } from './world';

const world = buildWorld();
// 人生イベント：話しかけたときに選択肢つきの出来事を起こす（現在は仮サンプルのみ・保存は未対応）。
const lifeEvents = new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS);
const game = new Game(world, { save: loadSave(world), sink: lifeEvents });
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
const minimap: Minimap = new Minimap(game, (): boolean => ui.mode === 'explore', () => controls.clear(), () => { controls.clear(); ui.focusMap(); });
const ui: UiController = new UiController(game, controls, avatar, canvas, minimap);
const hud = new Hud(game, () => ui.primaryAction());
const lifeEventPanel = new LifeEventPanel(game, lifeEvents, () => controls.clear());
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
  update: (dt, input) => { if (!minimap.isOpen) game.update(dt, input); },
  draw: now => renderer.draw(game, now / 1000),
  measuring: () => frames.recording,
  afterFrame: (now, frame, input) => {
    frames.record(now, frame, input, game, renderer);
    avatar.drawPreview(now);
    lifeEventPanel.update();
    hud.update(now);
    minimap.update();
  },
});
document.addEventListener('visibilitychange', () => { controls.clear(); loop.resetClock(); });
ui.focusMap();
