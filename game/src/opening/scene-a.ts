/**
 * 案A：見下ろしの町の道。「回避！」が一まとまりで横からすべり込み、「人生の落とし穴」が降ってきて着地する。
 * 足元に落とし穴が一気に開いて「人生の落とし穴」だけが落ち、「回避！」は地上に残る。
 */
import { drawCover } from './art';
import { bounce, easeIn, hash, lerp, seg } from './core';
import { drawGlyph } from './glyphs';
import {
  A_TIME, BOTTOM_Y, dropStart, evadePose, EVADE_HALF, EVADE_INDEXES, EVADE_X, EVADE_Y, FALL_FIRST, fallStart, PIT, pitOpen,
  restPose, rumble, shakeX,
} from './motion-a';
import { fade, type Scene, type SceneEnv } from './scene';

const { SLIDE_TO, DROP_TIME, CRACK_FROM, PIT_TO, FALL_TIME, SHINE_FROM, SHINE_TIME, SHINE_EVERY, END } = A_TIME;
/** 着地してから土けむりが出るまでの割合（bounce の最初の接地）。 */
const LAND = 0.36;

/** 地割れ。grow は 0〜1、reach は長さの倍率。 */
export function drawCracks(c: CanvasRenderingContext2D, grow: number, cx: number, cy: number, reach = 1): void {
  if (grow <= 0) return;
  c.fillStyle = '#1a1620';
  for (let ray = 0; ray < 9; ray++) {
    const angle = (ray / 9) * Math.PI * 2 + hash(ray) * 0.5, length = (40 + hash(ray + 30) * 50) * grow * reach;
    let x = cx, y = cy;
    for (let d = 0; d < length; d += 3) {
      const bend = angle + (hash(ray * 17 + Math.floor(d / 9)) - 0.5) * 1.2;
      x += Math.cos(bend) * 3; y += Math.sin(bend) * 2.1;
      c.fillRect(Math.round(x), Math.round(y), d < length * 0.5 ? 2 : 1, d < length * 0.5 ? 2 : 1);
    }
  }
}

/** 「回避！」を横切る光の帯と、小さなきらめき。p は 0〜1。 */
function shine(env: SceneEnv, p: number, draw: () => void): void {
  const { c } = env, cx = env.w / 2, cy = env.h / 2;
  const top = Math.round(cy + EVADE_Y - EVADE_HALF);
  // 帯は「回」の左端の外から「！」の右端の外まで通す。
  const at = cx + lerp(EVADE_X[0] - EVADE_HALF - 12, EVADE_X[2] + EVADE_HALF * 2 + 4, p);
  c.save();
  c.beginPath();
  // 斜めの帯を 2px の段で作り、輪郭をなめらかにしない。
  for (let row = 0; row < EVADE_HALF * 2; row += 2) c.rect(Math.round(at - row * 0.5), top + row, 11, 2);
  c.clip();
  c.filter = 'brightness(1.8) saturate(0.5)';
  draw();
  c.restore();
  c.fillStyle = '#ffffff';
  const stars: readonly [number, number, number][] = [[EVADE_X[0] - 26, -22, 0.15], [EVADE_X[1] - 4, -30, 0.4], [EVADE_X[2] + 16, -18, 0.65]];
  for (const [x, y, when] of stars) {
    const q = seg(p, when, when + 0.3);
    if (q <= 0 || q >= 1) continue;
    const arm = q < 0.5 ? 2 : 1, sx = Math.round(cx + x), sy = Math.round(cy + EVADE_Y + y);
    c.fillRect(sx - arm, sy, arm * 2 + 1, 1); c.fillRect(sx, sy - arm, 1, arm * 2 + 1);
  }
}

function draw(env: SceneEnv, time: number): void {
  const { c, w, h, art, logo, small } = env;
  const t = Math.max(0, time), cx = w / 2, cy = h / 2;
  const pitX = cx + PIT.x, pitY = cy + PIT.y;

  let landing = false;
  for (let i = FALL_FIRST; i < logo.glyphs.length; i++) {
    const landed = t - (dropStart(i) + DROP_TIME * LAND);
    if (landed >= 0 && landed < 0.12) landing = true;
  }
  c.save();
  c.translate(shakeX(t, landing), 0);

  drawCover(c, art.get('a-street'), w, h);
  drawCracks(c, t > PIT_TO ? 0 : seg(t, CRACK_FROM, PIT_TO), pitX, pitY);

  const open = pitOpen(t);
  if (open > 0) {
    const pw = Math.round(PIT.w * open), ph = Math.round(PIT.h * open);
    c.drawImage(art.get('a-pit'), Math.round(pitX - pw / 2), Math.round(pitY - ph / 2), pw, ph);
  }

  const dust = art.get('dust');
  const puff = (p: number, x: number, y: number): void => {
    if (p > 0 && p < 1) c.drawImage(dust, Math.min(3, Math.floor(p * 4)) * 24, 0, 24, 24, Math.round(x - 12), Math.round(y - 16), 24, 24);
  };
  const shaking = rumble(t);

  // 「人生の落とし穴」：降ってきて着地し、穴が開くと落ちて底で止まる。
  for (let i = FALL_FIRST; i < logo.glyphs.length; i++) {
    const g = logo.glyphs[i], from = dropStart(i), drop = seg(t, from, from + DROP_TIME);
    if (drop <= 0) continue;
    const homeX = cx + g.slot.x, baseY = cy + BOTTOM_Y;
    const fallFrom = fallStart(g.slot.x), fall = seg(t, fallFrom, fallFrom + FALL_TIME);
    if (fall <= 0) {
      const jitter = shaking > 0 ? Math.round((hash(i * 13 + Math.floor(t * 30)) - 0.5) * 2 * shaking) : 0;
      drawGlyph(c, g, { x: homeX + jitter, y: lerp(-g.slot.size - h * 0.1, baseY, bounce(drop)) });
      if (i % 2 === 1) puff(seg(t, from + DROP_TIME * LAND, from + DROP_TIME * LAND + 0.32), homeX, baseY + g.slot.size / 2);
      continue;
    }
    const rest = restPose(i), tiny = small.glyphs[i];
    if (fall >= 1) {
      // 底では縮小用の文字に差し替えて、つぶれを避ける。
      drawGlyph(c, tiny, { x: cx + rest.x, y: cy + rest.y, dark: 0.4 });
      continue;
    }
    // 落ちる直前に小さく跳ねてから、穴の中へ吸い込まれる。
    const hop = fall < 0.18 ? -Math.sin((fall / 0.18) * Math.PI) * 5 : 0;
    const d = easeIn(seg(fall, 0.18, 1));
    drawGlyph(c, g, {
      x: lerp(homeX, cx + rest.x, d), y: lerp(baseY, cy + rest.y, d) + hop,
      scale: lerp(1, tiny.slot.size / g.slot.size, d), rot: (hash(i + 5) - 0.5) * 1.6 * Math.sin(d * Math.PI), dark: d * 0.4,
    });
  }

  // 「回避！」：3 文字そろって高さを変えずに横からすべり込み、最後まで地上に残る。
  const evade = (): void => {
    for (const i of EVADE_INDEXES) drawGlyph(c, logo.glyphs[i], evadePose(i, t, w));
  };
  c.translate(cx, cy);
  evade();
  c.translate(-cx, -cy);
  // すべり込みが止まったときの土けむり。後ろ（左）の足元に出す。
  puff(seg(t, SLIDE_TO - 0.1, SLIDE_TO + 0.25), cx + EVADE_X[0] - 26, cy + EVADE_Y + 22);
  c.restore();

  if (t >= SHINE_FROM) {
    const p = ((t - SHINE_FROM) % SHINE_EVERY) / SHINE_TIME;
    if (p < 1) shine(env, p, () => { c.translate(cx, cy); evade(); });
  }
  fade(env, 1 - seg(t, 0, 0.5));
}

export const sceneA: Scene = { duration: END, draw };
