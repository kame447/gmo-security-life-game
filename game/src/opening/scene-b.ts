/**
 * 案B：横から見た町並みの横スクロール。主人公が道の落とし穴を跳び越えるたびに、タイトルが一かたまりずつ組み上がる。
 */
import { drawCover, drawStrip } from './art';
import { DEFAULT_APPEARANCE } from '../core/appearance';
import { playerSprite } from '../render/sprites';
import { easeBack, hash, seg } from './core';
import { drawGlyph } from './glyphs';
import { fade, type Scene, type SceneEnv } from './scene';

const SPEED = 92, RAMP = 0.6, SLOW_FROM = 6.7, SLOW_TIME = 0.9, END = 8.1;
const JUMPS = [2.2, 3.9, 5.6] as const, AIR = 0.34, JUMP_HEIGHT = 36;
/** 跳ぶたびに現れる文字の範囲（回避！／人生の／落とし穴）。 */
const CHUNKS: readonly (readonly [number, number])[] = [[0, 3], [3, 6], [6, 10]];
const WALK: readonly (0 | 1 | 2)[] = [0, 1, 0, 2];

/** 時刻 t までに進んだ距離。加速 → 等速 → 減速して止まる。 */
export function scrolled(t: number): number {
  const run = (u: number): number => (u < RAMP ? (u * u) / (2 * RAMP) : u - RAMP / 2);
  if (t <= SLOW_FROM) return SPEED * run(Math.max(0, t));
  const u = Math.min(t - SLOW_FROM, SLOW_TIME);
  return SPEED * (run(SLOW_FROM) + u - (u * u) / (2 * SLOW_TIME));
}

function draw(env: SceneEnv, time: number): void {
  const { c, w, h, art, logo } = env;
  const t = Math.max(0, time), cx = w / 2, cy = h / 2;
  const groundY = Math.round(cy + 44), playerX = Math.round(cx - 54), s = scrolled(t);

  drawCover(c, art.get('b-sky'), w, h, 'bottom');
  const far = art.get('b-far'), near = art.get('b-near'), ground = art.get('b-ground');
  drawStrip(c, far, s * 0.18 + t * 1.5, groundY - far.height - 26, w);
  drawStrip(c, near, s * 0.5, groundY - near.height + 2, w);
  drawStrip(c, ground, s, groundY, w);
  // 地面のタイルより下は、タイルの下端の色を伸ばして埋める。
  const below = groundY + ground.height;
  if (below < h) {
    const start = -(((Math.round(s) % ground.width) + ground.width) % ground.width);
    for (let x = start; x < w; x += ground.width) c.drawImage(ground, 0, ground.height - 2, ground.width, 2, x, below, ground.width, h - below);
  }

  const pit = art.get('b-pit');
  for (const at of JUMPS) {
    const x = Math.round(scrolled(at) + playerX - s - pit.width / 2);
    if (x > -pit.width && x < w) c.drawImage(pit, x, groundY);
  }

  let lift = 0, warn = false;
  for (const at of JUMPS) {
    const p = seg(t, at - AIR, at + AIR);
    if (p > 0 && p < 1) lift = Math.sin(p * Math.PI) * JUMP_HEIGHT;
    if (t > at - AIR - 0.5 && t < at - AIR) warn = true;
  }
  const stopped = t >= SLOW_FROM + SLOW_TIME;
  const frame = lift > 0 ? 1 : stopped ? 0 : WALK[Math.floor(s / 9) % 4];
  const sprite = playerSprite(DEFAULT_APPEARANCE, stopped ? 'down' : 'right', frame);
  const feetY = groundY + 7, pw = sprite.canvas.width * 2, ph = sprite.canvas.height * 2;
  if (lift > 0) {
    c.fillStyle = 'rgba(13,10,14,0.25)';
    const sw = Math.round(22 - lift * 0.25);
    c.fillRect(playerX - sw / 2, feetY - 2, sw, 3);
  }
  c.drawImage(sprite.canvas, Math.round(playerX - pw / 2), Math.round(feetY - ph - lift), pw, ph);
  if (warn) {
    c.fillStyle = '#2a2140'; c.fillRect(playerX - 3, feetY - ph - 19, 6, 15);
    c.fillStyle = '#ffd84a'; c.fillRect(playerX - 2, feetY - ph - 18, 4, 8); c.fillRect(playerX - 2, feetY - ph - 8, 4, 3);
  }

  const logoY = Math.round(cy - 62);
  CHUNKS.forEach(([from, to], k) => {
    const landed = JUMPS[k] + AIR;
    for (let i = from; i < to; i++) {
      const g = logo.glyphs[i], p = seg(t, landed + (i - from) * 0.06, landed + (i - from) * 0.06 + 0.32);
      if (p <= 0) continue;
      const x = cx + g.slot.x, y = logoY + g.slot.y;
      drawGlyph(c, g, { x, y: y - (1 - p) * 10, scale: Math.max(0.05, easeBack(p)) });
      if (p < 1) {
        c.fillStyle = '#fff3a8';
        for (let n = 0; n < 4; n++) {
          const a = hash(i * 7 + n) * Math.PI * 2, d = 10 + p * 22;
          c.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 2, 2);
        }
      }
    }
  });
  fade(env, 1 - seg(t, 0, 0.5));
}

export const sceneB: Scene = { duration: END, draw };
