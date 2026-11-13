/**
 * 案A：見下ろしの町の道。タイトルが降ってきて着地し、足元に落とし穴が開いてタイトルが落ちる。
 * 「回避」の 2 文字だけが羽で飛び出し、画面の外へ飛んでいく。
 */
import { drawCover } from './art';
import { bounce, easeBack, easeIn, easeInOut, easeOut, hash, lerp, seg } from './core';
import { drawGlyph, drawLogo } from './glyphs';
import { fade, type Scene, type SceneEnv } from './scene';

const DROP_FROM = 0.5, DROP_STEP = 0.09, DROP_TIME = 0.7;
const CRACK_FROM = 3.0, PIT_FROM = 3.6, PIT_TO = 4.3, FALL_FROM = 4.1, FALL_TIME = 0.8;
const POP_AT = 4.9, FLY_TO = 7.5, END = 8.3;
const PIT_SCALE = 1.3;
/** 「回避」が穴の中で止まる深さ（0＝地上、1＝底）。 */
const HOLD_DEPTH = 0.55;

function quad(a: number, b: number, c: number, t: number): number {
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

/** 「回避」2 文字の中心の軌道。穴から浮上 → その場で旋回 → 右上へ飛び去る。 */
function flight(env: SceneEnv, t: number): { x: number; y: number; scale: number } {
  const cx = env.w / 2, cy = env.h / 2;
  const f = seg(t, POP_AT, FLY_TO);
  const bob = Math.sin(t * 9) * 3;
  if (f < 0.28) {
    const p = easeBack(f / 0.28);
    return { x: lerp(cx - 14, cx - 24, f / 0.28), y: lerp(cy + 12, cy - 46, p) + bob * (f / 0.28), scale: lerp(HOLD_DEPTH, 1, Math.min(1, p)) };
  }
  if (f < 0.55) {
    const p = easeInOut((f - 0.28) / 0.27);
    return { x: quad(cx - 24, cx - 70, cx - 10, p), y: quad(cy - 46, cy - 30, cy - 66, p) + bob, scale: 1 };
  }
  const p = easeIn((f - 0.55) / 0.45);
  return {
    x: quad(cx - 10, cx + 40, cx + env.w / 2 + 110, p),
    y: quad(cy - 66, cy - 96, cy - env.h / 2 - 70, p) + bob * (1 - p),
    scale: lerp(1, 0.8, p),
  };
}

function cracks(env: SceneEnv, t: number, cx: number, cy: number): void {
  const grow = seg(t, CRACK_FROM, PIT_FROM + 0.3);
  if (grow <= 0 || t > PIT_TO) return;
  env.c.fillStyle = '#1a1620';
  for (let ray = 0; ray < 9; ray++) {
    const angle = (ray / 9) * Math.PI * 2 + hash(ray) * 0.5, length = (40 + hash(ray + 30) * 50) * grow;
    let x = cx, y = cy;
    for (let d = 0; d < length; d += 3) {
      const bend = angle + (hash(ray * 17 + Math.floor(d / 9)) - 0.5) * 1.2;
      x += Math.cos(bend) * 3; y += Math.sin(bend) * 2.1;
      env.c.fillRect(Math.round(x), Math.round(y), d < length * 0.5 ? 2 : 1, d < length * 0.5 ? 2 : 1);
    }
  }
}

function draw(env: SceneEnv, time: number): void {
  const { c, w, h, art, logo } = env;
  const t = Math.max(0, time), cx = w / 2, cy = h / 2;
  const homeY = cy - 6, pitX = cx, pitY = cy + 6;

  // 地割れの間だけ画面を揺らす。
  const rumble = seg(t, CRACK_FROM, PIT_FROM) * (1 - seg(t, PIT_TO, PIT_TO + 0.3));
  let shake = rumble * 2;
  for (let i = 0; i < logo.glyphs.length; i++) {
    const landed = t - (DROP_FROM + i * DROP_STEP + DROP_TIME * 0.36);
    if (landed >= 0 && landed < 0.12) shake = Math.max(shake, 1);
  }
  c.save();
  if (shake > 0) c.translate(Math.round((hash(Math.floor(t * 40)) - 0.5) * 2 * shake), Math.round((hash(Math.floor(t * 40) + 9) - 0.5) * 2 * shake));

  drawCover(c, art.get('a-street'), w, h);
  cracks(env, t, pitX, pitY);

  const open = easeOut(seg(t, PIT_FROM, PIT_TO)) * PIT_SCALE;
  if (open > 0) {
    const pit = art.get('a-pit'), pw = Math.round(pit.width * open), ph = Math.round(pit.height * open);
    c.drawImage(pit, Math.round(pitX - pw / 2), Math.round(pitY - ph / 2), pw, ph);
  }

  const dust = art.get('dust');
  logo.glyphs.forEach((g, i) => {
    const start = DROP_FROM + i * DROP_STEP, drop = seg(t, start, start + DROP_TIME);
    if (drop <= 0) return;
    const homeX = cx + g.slot.x, baseY = homeY + g.slot.y;
    const flies = i < 2;
    // 中心に近い文字から落ちる。
    const delay = (Math.abs(g.slot.x) / 110) * 0.3 + (g.slot.line ? 0 : 0.08);
    // 「回避」は飛び出す時刻にちょうど途中の深さで止まるように落とす。
    const fall = flies ? seg(t, FALL_FROM, POP_AT) : seg(t, FALL_FROM + delay, FALL_FROM + delay + FALL_TIME);
    if (fall <= 0) {
      const jitter = rumble > 0 ? Math.round((hash(i * 13 + Math.floor(t * 30)) - 0.5) * 2 * rumble) : 0;
      drawGlyph(c, g, { x: homeX + jitter, y: lerp(-g.slot.size - h * 0.1, baseY, bounce(drop)) });
      const puff = seg(t, start + DROP_TIME * 0.36, start + DROP_TIME * 0.36 + 0.32);
      if (i % 2 === 0 && puff > 0 && puff < 1) {
        c.drawImage(dust, Math.min(3, Math.floor(puff * 4)) * 24, 0, 24, 24, Math.round(homeX - 12), Math.round(baseY + g.slot.size / 2 - 16), 24, 24);
      }
      return;
    }
    if (flies && t >= POP_AT) return;
    // 落ちる直前に小さく跳ねてから、穴の中心へ吸い込まれる。
    const hop = fall < 0.18 ? -Math.sin((fall / 0.18) * Math.PI) * 5 : 0;
    const d = easeIn(seg(fall, 0.18, 1)) * (flies ? HOLD_DEPTH : 1);
    drawGlyph(c, g, {
      x: lerp(homeX, pitX + g.slot.x * 0.22, d), y: lerp(baseY, pitY + 10 + g.slot.y * 0.2, d) + hop,
      scale: lerp(1, 0.12, d), rot: (hash(i + 5) - 0.5) * 2.6 * d, dark: d * 0.9, alpha: 1 - seg(d, 0.86, 1),
    });
  });

  // 「回避」だけが羽で飛び出す。
  if (t >= POP_AT && t < FLY_TO) {
    const now = flight(env, t), wings = art.get('a-wings'), frame = Math.floor(t * 9) % 2;
    for (let k = 5; k >= 1; k--) {
      const past = flight(env, Math.max(POP_AT, t - k * 0.07));
      c.fillStyle = `rgba(255,255,255,${0.5 - k * 0.08})`;
      c.fillRect(Math.round(past.x - 30 + hash(k) * 60), Math.round(past.y + 14 + hash(k + 4) * 10), 2, 2);
    }
    const ww = Math.round(192 * now.scale), wh = Math.round(96 * now.scale);
    c.drawImage(wings, frame * 64, 0, 64, 32, Math.round(now.x - ww / 2), Math.round(now.y - wh / 2 - 10 * now.scale), ww, wh);
    const tilt = Math.sin(t * 9) * 0.06, dark = (1 - seg(t, POP_AT, POP_AT + 0.4)) * 0.4;
    drawGlyph(c, logo.glyphs[0], { x: now.x - 24 * now.scale, y: now.y, scale: now.scale, rot: tilt, dark });
    drawGlyph(c, logo.glyphs[1], { x: now.x + 24 * now.scale, y: now.y, scale: now.scale, rot: tilt, dark });
  }
  c.restore();

  // 飛び去ったあと、タイトル画面として小さなロゴを上に出す。
  const settle = seg(t, FLY_TO - 0.2, END);
  if (settle > 0) drawLogo(c, env.small, cx, Math.round(cy - 88 - (1 - easeOut(settle)) * 6), settle);
  fade(env, 1 - seg(t, 0, 0.5));
}

export const sceneA: Scene = { duration: END, draw };
