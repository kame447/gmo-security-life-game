/// <reference types="vite/client" />
import source from '../../data/editor-prototype.json?raw';
import { FrameRecorder, exposeDebug } from '../app/debug.ts';
import { startLoop } from '../app/loop.ts';
import { buildEditorWorld } from '../editor/index.ts';
import { ACTION_KEYS, Controls, DIRECTION_KEYS, RUN_KEYS } from '../input/controls.ts';
import { Renderer } from '../render/renderer.ts';
import { Game } from '../session/game.ts';

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing preview element: ${selector}`);
  return element;
};
const game = new Game(buildEditorWorld(JSON.parse(source)));
const canvas = $<HTMLCanvasElement>('#view');
const stage = $<HTMLElement>('#stage');
const renderer = new Renderer(canvas);
const controls = new Controls();
const frames = new FrameRecorder();
exposeDebug(game, renderer, frames);
const dialog = $<HTMLElement>('#dialog');

function resize(): void { renderer.resize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1); }
window.addEventListener('resize', resize);
resize();
window.addEventListener('keydown', event => {
  const direction = DIRECTION_KEYS[event.code];
  if (direction) { event.preventDefault(); controls.press(event.code, direction); }
  else if (RUN_KEYS.has(event.code)) controls.pressRun(event.code);
  else if (ACTION_KEYS.has(event.code) && !event.repeat && document.activeElement === canvas) { event.preventDefault(); game.action(); }
});
window.addEventListener('keyup', event => controls.release(event.code));
window.addEventListener('blur', () => controls.clear());
$('#reset').addEventListener('click', () => { controls.clear(); game.reset(); canvas.focus(); });
const loop = startLoop({
  beforeFrame: () => {},
  input: () => controls.state(),
  update: (dt, input) => game.update(dt, input),
  draw: now => renderer.draw(game, now / 1000),
  measuring: () => false,
  afterFrame: () => {
    dialog.hidden = !game.dialog;
    if (game.dialog) {
      $('#speaker').textContent = game.dialog.speaker;
      $('#dialog-text').textContent = game.dialog.lines[game.dialog.index] ?? '';
    }
  },
});
document.addEventListener('visibilitychange', () => { controls.clear(); loop.resetClock(); });
canvas.focus();
