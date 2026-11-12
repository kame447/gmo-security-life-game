import { pxToTile, type Facing } from './core/coords';
import { APPEARANCE_FIELDS, APPEARANCE_OPTIONS, type AppearanceField, type PlayerAppearance } from './core/appearance';
import { Game, parseSave, type InputState } from './engine/game';
import { Renderer } from './render/renderer';
import { playerSprite } from './render/sprites';
import { buildWorld, districtAt } from './world';

const SAVE_KEY = 'slg-map-save-v1';
const world = buildWorld();
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? parseSave(JSON.parse(raw), world) ?? undefined : undefined;
  } catch { return undefined; }
}
const game = new Game(world, { save: readSave() });
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const renderer = new Renderer(canvas);
const hud = document.querySelector<HTMLElement>('#hud')!;
const hint = document.querySelector<HTMLElement>('#hint')!;
const toast = document.querySelector<HTMLElement>('#toast')!;
const dialog = document.querySelector<HTMLElement>('#dialog')!;
const speaker = dialog.querySelector<HTMLElement>('.who')!;
const line = dialog.querySelector<HTMLElement>('.text')!;
const touch = document.querySelector<HTMLElement>('#touch')!;
const touchToggle = document.querySelector<HTMLButtonElement>('#btn-touch')!;
const avatarPanel = document.querySelector<HTMLElement>('#avatar-panel')!;
const avatarButton = document.querySelector<HTMLButtonElement>('#btn-avatar')!;
const avatarPreview = document.querySelector<HTMLCanvasElement>('#avatar-preview')!;
const previewContext = avatarPreview.getContext('2d')!;
let avatarBefore: PlayerAppearance | null = null;
let avatarRow = 0;
const fieldLabels: Record<AppearanceField, string> = {
  silhouette: 'かたち', hairStyle: 'かみがた', hairColor: 'かみのいろ', outfit: 'ふく', outfitColor: 'ふくのいろ',
};
const avatarRows = APPEARANCE_FIELDS.map((field, index) => {
  const row = document.createElement('div');
  row.className = 'avatar-row';
  row.dataset.field = field;
  const label = document.createElement('span');
  label.textContent = fieldLabels[field];
  const value = document.createElement('span');
  value.className = 'avatar-value';
  value.setAttribute('aria-live', 'polite');
  const stepButton = (step: number) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.step = String(step);
    button.textContent = step < 0 ? '◀' : '▶';
    button.setAttribute('aria-label', `${fieldLabels[field]}：${step < 0 ? 'まえ' : 'つぎ'}`);
    button.addEventListener('click', () => { avatarRow = index; changeAppearance(step); });
    return button;
  };
  row.append(label, stepButton(-1), value, stepButton(1));
  document.querySelector('#avatar-rows')!.append(row);
  return { row, value, field };
});

function updateAvatarRows() {
  for (const { row, value, field } of avatarRows) {
    row.classList.toggle('selected', APPEARANCE_FIELDS[avatarRow] === field);
    value.textContent = APPEARANCE_OPTIONS[field].find(option => option.id === game.appearance[field])!.name;
  }
}
function changeAppearance(step: number) {
  if (!avatarBefore) return;
  const field = APPEARANCE_FIELDS[avatarRow], options = APPEARANCE_OPTIONS[field];
  const current = options.findIndex(option => option.id === game.appearance[field]);
  game.setAppearance({ ...game.appearance, [field]: options[(current + step + options.length) % options.length].id });
  updateAvatarRows();
}
function closeAvatar(commit: boolean) {
  if (!avatarBefore) return;
  if (!commit) game.setAppearance(avatarBefore);
  avatarBefore = null;
  avatarPanel.hidden = true;
  document.querySelector('#stage')!.classList.remove('avatar-open');
  clearInput();
  if (commit) save();
  canvas.focus({ preventScroll: true });
}
avatarButton.addEventListener('click', () => {
  if (game.dialog || avatarBefore) return;
  clearInput();
  avatarBefore = { ...game.appearance };
  avatarRow = 0;
  avatarPanel.hidden = false;
  document.querySelector('#stage')!.classList.add('avatar-open');
  updateAvatarRows();
  avatarPanel.focus({ preventScroll: true });
});
document.querySelector('#avatar-ok')!.addEventListener('click', () => closeAvatar(true));
document.querySelector('#avatar-cancel')!.addEventListener('click', () => closeAvatar(false));

export interface FrameSample {
  t: number; interval: number; updateMs: number; drawMs: number; dt: number;
  px: number; py: number; camX: number; camY: number; areaId: string; fading: boolean;
  chunksBakedThisFrame: number; spritesDrawn: number; moving: boolean;
  dir: Facing | null; run: boolean;
  steps: number; droppedMs: number;
}
let recording = false;
let frameSamples: FrameSample[] = [];
const frames = {
  start() { frameSamples = []; recording = true; },
  stop(): FrameSample[] { recording = false; const samples = frameSamples; frameSamples = []; return samples; },
};
declare global {
  interface Window { __slg: { game: Game; renderer: Renderer; frames: typeof frames } }
}
window.__slg = { game, renderer, frames };

const directions: Record<string, Facing> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const held = new Map<string, Facing>();
const shifts = new Set<string>();
function clearInput() { held.clear(); shifts.clear(); }
function input(): InputState {
  if (avatarBefore) return { dir: null, run: false };
  return { dir: [...held.values()].at(-1) ?? null, run: shifts.size > 0 };
}
const actions = new Set(['KeyZ', 'Space', 'Enter']);
window.addEventListener('keydown', (event) => {
  if (avatarBefore) {
    const code = event.code;
    if (['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'KeyZ', 'Space', 'Enter', 'Escape', 'Tab'].includes(code)) {
      event.preventDefault();
      if (code === 'ArrowUp' || code === 'KeyW') avatarRow = (avatarRow + APPEARANCE_FIELDS.length - 1) % APPEARANCE_FIELDS.length;
      else if (code === 'ArrowDown' || code === 'KeyS') avatarRow = (avatarRow + 1) % APPEARANCE_FIELDS.length;
      else if (code === 'ArrowLeft' || code === 'KeyA') changeAppearance(-1);
      else if (code === 'ArrowRight' || code === 'KeyD') changeAppearance(1);
      else if (code === 'Escape') closeAvatar(false);
      else if (code === 'Tab') {
        const buttons = [...avatarPanel.querySelectorAll<HTMLButtonElement>('button')];
        const active = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(active + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      } else if (!event.repeat) closeAvatar(true);
      updateAvatarRows();
    }
    return;
  }
  // Let buttons retain their ordinary Enter/Space behavior.
  if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select')) return;
  if (directions[event.code]) {
    event.preventDefault();
    if (!event.repeat) held.set(event.code, directions[event.code]);
  } else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    shifts.add(event.code);
  } else if (actions.has(event.code)) {
    event.preventDefault();
    if (!event.repeat) game.action();
  }
});
window.addEventListener('keyup', (event) => { held.delete(event.code); shifts.delete(event.code); });
window.addEventListener('blur', clearInput);
document.addEventListener('focusin', (event) => {
  if (event.target !== canvas) clearInput();
});
document.addEventListener('visibilitychange', () => { clearInput(); previous = 0; accumulator = 0; });
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));

function save() {
  try {
    const data = game.serialize();
    // A draft is visible immediately, but autosave must preserve the last confirmed appearance.
    if (avatarBefore) data.appearance = { ...avatarBefore };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }
  catch { /* Exploration remains available when storage is disabled or full. */ }
}
window.addEventListener('pagehide', () => { clearInput(); save(); });
setInterval(save, 3000);

let toastUntil = 0;
game.on((event) => {
  if (event.type === 'edge') {
    toast.textContent = 'きょうは このあたりを たんけんしよう。';
    toast.hidden = false;
    toastUntil = performance.now() + 2400;
  }
  if (event.type === 'area-enter') save();
});
document.querySelector<HTMLButtonElement>('#btn-reset')!.addEventListener('click', () => {
  clearInput();
  game.reset();
  save();
  canvas.focus({ preventScroll: true });
});
dialog.setAttribute('role', 'button');
dialog.setAttribute('aria-label', 'はなしをすすめる');
dialog.addEventListener('click', () => { if (!avatarBefore) game.action(); });
hud.setAttribute('aria-live', 'polite');
toast.setAttribute('role', 'status');

function setTouch(enabled: boolean) {
  clearInput();
  touch.classList.toggle('on', enabled);
  touch.setAttribute('aria-hidden', String(!enabled));
  touchToggle.setAttribute('aria-pressed', String(enabled));
}
setTouch(matchMedia('(pointer: coarse)').matches);
touchToggle.addEventListener('click', () => {
  setTouch(!touch.classList.contains('on'));
  canvas.focus({ preventScroll: true });
});
for (const button of touch.querySelectorAll<HTMLButtonElement>('button')) {
  const direction = button.dataset.dir as Facing | undefined;
  button.setAttribute('aria-label', direction ? { up: 'うえ', down: 'した', left: 'ひだり', right: 'みぎ' }[direction] : 'しらべる・はなす');
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    if (direction) held.set(`pointer-${event.pointerId}`, direction);
    else if (!avatarBefore) game.action();
  });
  const release = (event: PointerEvent) => held.delete(`pointer-${event.pointerId}`);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}

let dpr = 0;
function resize() {
  dpr = window.devicePixelRatio || 1;
  renderer.resize(window.innerWidth, window.innerHeight, dpr);
}
window.addEventListener('resize', resize);
resize();
let previous = 0;
// Prototype proposals: <=1.07px per running substep, at most 30 updates after a stall.
const FIXED_STEP = 1 / 120;
const MAX_ACCUMULATED = 0.25;
let accumulator = 0;
function frame(now: number) {
  if (dpr !== window.devicePixelRatio) resize();
  const interval = previous ? Math.max(0, now - previous) : 0;
  previous = now;
  const available = accumulator + interval / 1000;
  accumulator = Math.min(MAX_ACCUMULATED, available);
  const droppedMs = Math.max(0, available - accumulator) * 1000;
  const measure = recording;
  const frameInput = input();
  const updateStart = measure ? performance.now() : 0;
  let steps = 0;
  while (accumulator + 1e-9 >= FIXED_STEP) {
    game.update(FIXED_STEP, frameInput);
    accumulator = Math.max(0, accumulator - FIXED_STEP);
    steps++;
  }
  const dt = steps * FIXED_STEP;
  const drawStart = measure ? performance.now() : 0;
  renderer.draw(game, now / 1000);
  if (measure) {
    const drawEnd = performance.now(), stats = renderer.stats;
    frameSamples.push({ t: now, interval, updateMs: drawStart - updateStart, drawMs: drawEnd - drawStart, dt,
      px: game.player.x, py: game.player.y, camX: stats.camX, camY: stats.camY, areaId: game.player.areaId,
      fading: stats.fading, chunksBakedThisFrame: stats.chunksBakedThisFrame, spritesDrawn: stats.spritesDrawn, moving: game.moving,
      dir: frameInput.dir, run: frameInput.run, steps, droppedMs });
  }
  avatarButton.disabled = !!game.dialog;
  if (avatarBefore) {
    previewContext.imageSmoothingEnabled = false;
    previewContext.fillStyle = '#384650';
    previewContext.fillRect(0, 0, avatarPreview.width, avatarPreview.height);
    const walking = (Math.floor(now / 180) % 2 + 1) as 1 | 2;
    for (const [x, facing, step] of [[40, 'down', 0], [110, 'right', walking]] as const) {
      const sprite = playerSprite(game.appearance, facing, step);
      previewContext.drawImage(sprite.canvas, x + sprite.ox * 3, 72 + sprite.oy * 3, sprite.canvas.width * 3, sprite.canvas.height * 3);
    }
  }
  const district = districtAt(game.area, pxToTile(game.player.x), pxToTile(game.player.y - 4));
  hud.textContent = [game.area.def.name, district?.name].filter(Boolean).join(' / ');
  dialog.hidden = !game.dialog;
  if (game.dialog) {
    speaker.textContent = game.dialog.speaker;
    line.textContent = game.dialog.lines[game.dialog.index] ?? '';
  }
  const target = game.facingInteraction();
  hint.hidden = !!game.dialog;
  hint.textContent = target ? `${target.name}　Z / Space / Enter：しらべる・はなす` :
    'やじるし / WASD：あるく　Shift：はしる　Z / Space / Enter：しらべる';
  if (now >= toastUntil) toast.hidden = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
canvas.focus({ preventScroll: true });
