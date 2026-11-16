/**
 * 案B：本編と同じ見下ろしの町。主人公が丁字路で左右を見比べて左へ進むと、いつもの道に落とし穴が開く。
 * 引き返して右の道を選んだところで、タイトルが現れる。地面と小物と主人公は本編の描画をそのまま使う。
 */
import { DEFAULT_APPEARANCE } from '../core/appearance';
import type { ObjectDef } from '../core/types';
import { drawGroundTile } from '../render/ground';
import { objectSprite, playerSprite } from '../render/sprites';
import { T } from '../world/tiles';
import { easeBack, easeOut, hash, seg } from './core';
import { drawGlyph } from './glyphs';
import { B_TIME, isRoadTile, PIT_B, ROAD_TOP, TILE_PX, walker, WORLD_SCALE } from './motion-b';
import { drawCracks } from './scene-a';
import { fade, type Scene, type SceneEnv } from './scene';

/** 町の絵に含めるタイルの範囲（中心から前後 8 タイル。最大の画面 480×480 を覆う）。 */
const SPAN = 8, TILE = TILE_PX / WORLD_SCALE;
const WALK: readonly (0 | 1 | 2)[] = [0, 1, 0, 2];
/** タイトルが現れる順（回避！／人生の落とし穴）。 */
const CHUNKS: readonly (readonly [number, number, number])[] = [[0, 3, B_TIME.TITLE_TOP], [3, 10, B_TIME.TITLE_BOTTOM]];

const prop = (kind: string, x: number, y: number, w = 1, h = 1, style?: string): ObjectDef => ({ kind, x, y, w, h, solid: true, style });
/** 小物の配置（タイル単位）。タイトルとメニューが重なる中央は空けておく。 */
const PROPS: readonly ObjectDef[] = [
  prop('lamp', 1, 2.9), prop('postbox', -2.2, 2.2), prop('bench', 1.6, 3.3, 2, 1), prop('flowerbed', -4.4, 3.2, 2, 1),
  prop('tree', -3.4, 6), prop('tree', 2.6, 6.2, 1, 1, 'dark'), prop('tree', -6.4, 3.2, 1, 1, 'dark'), prop('tree', 5.6, 3.4),
  prop('vending', 4.2, 2.1), prop('flowerbed', -6.6, 5.8, 2, 1), prop('tree', 6.6, 6.4), prop('tree', -1.6, 7.2),
  prop('tree', -5.4, -1.9), prop('tree', -7.2, -2.4, 1, 1, 'dark'), prop('tree', 4.4, -1.9, 1, 1, 'cherry'), prop('tree', 6.4, -2.5),
  prop('tree', -3.2, -5.4, 1, 1, 'cherry'), prop('tree', 1.2, -6.2), prop('tree', 2.9, -5.3, 1, 1, 'dark'), prop('tree', -1.2, -7),
  prop('tree', -6, -5.3), prop('tree', 5.4, -5.8), prop('flowerbed', -0.8, -5.4, 2, 1), prop('bench', 3.4, -1, 2, 1),
];

let town: HTMLCanvasElement | undefined;
/** 地面と小物を 1 枚に焼く。動くもの（穴・主人公・文字）は含めない。 */
function bakeTown(): HTMLCanvasElement {
  if (town) return town;
  const el = document.createElement('canvas');
  el.width = el.height = SPAN * 2 * TILE;
  const c = el.getContext('2d')!;
  const tile = (tx: number, ty: number): number => (isRoadTile(tx, ty) ? T.ASPHALT : T.GRASS);
  for (let ty = -SPAN; ty < SPAN; ty++) {
    for (let tx = -SPAN; tx < SPAN; tx++) {
      drawGroundTile(c, tile(tx, ty), (tx + SPAN) * TILE, (ty + SPAN) * TILE, tx, ty, (dx, dy) => tile(tx + dx, ty + dy));
    }
  }
  // 道の縁。草との境目に明るい縁石を 1 本入れる。
  c.fillStyle = '#d9d1bd';
  for (let ty = -SPAN; ty < SPAN; ty++) {
    for (let tx = -SPAN; tx < SPAN; tx++) {
      if (!isRoadTile(tx, ty)) continue;
      const x = (tx + SPAN) * TILE, y = (ty + SPAN) * TILE;
      if (!isRoadTile(tx, ty - 1)) c.fillRect(x, y, TILE, 1);
      if (!isRoadTile(tx, ty + 1)) c.fillRect(x, y + TILE - 1, TILE, 1);
      if (!isRoadTile(tx - 1, ty)) c.fillRect(x, y, 1, TILE);
      if (!isRoadTile(tx + 1, ty)) c.fillRect(x + TILE - 1, y, 1, TILE);
    }
  }
  for (const o of [...PROPS].sort((a, b) => a.y + a.h - (b.y + b.h))) {
    const s = objectSprite(o);
    c.drawImage(s.canvas, Math.round((o.x + SPAN) * TILE + s.ox), Math.round((o.y + SPAN) * TILE + s.oy));
  }
  town = el;
  return el;
}

function draw(env: SceneEnv, time: number): void {
  const { c, w, h, art, logo } = env;
  const t = Math.max(0, time), cx = w / 2, cy = h / 2;
  const { CRACK_FROM, PIT_FROM, PIT_TO } = B_TIME;

  c.save();
  // 穴が開く間だけ小さく揺らす。
  const quake = seg(t, CRACK_FROM + 0.1, PIT_FROM) * (1 - seg(t, PIT_TO - 0.15, PIT_TO + 0.15));
  if (quake > 0) c.translate(Math.round((hash(Math.floor(t * 40)) - 0.5) * 3 * quake), 0);

  const size = SPAN * 2 * TILE_PX;
  c.drawImage(bakeTown(), Math.round(cx - size / 2), Math.round(cy + ROAD_TOP - size / 2), size, size);

  const pitX = cx + PIT_B.x, pitY = cy + PIT_B.y;
  drawCracks(c, t > PIT_TO ? 0 : seg(t, CRACK_FROM, PIT_FROM + 0.2), pitX, pitY, 0.4);
  const open = easeOut(seg(t, PIT_FROM, PIT_TO));
  if (open > 0) {
    const pw = Math.round(PIT_B.w * open), ph = Math.round(PIT_B.h * open);
    c.drawImage(art.get('a-pit'), Math.round(pitX - pw / 2), Math.round(pitY - ph / 2), pw, ph);
    const puff = seg(t, PIT_FROM, PIT_FROM + 0.4);
    if (puff < 1) {
      const dust = art.get('dust'), frame = Math.min(3, Math.floor(puff * 4)) * 24;
      c.drawImage(dust, frame, 0, 24, 24, Math.round(pitX + 18), Math.round(pitY - 30), 24, 24);
      c.drawImage(dust, frame, 0, 24, 24, Math.round(pitX - 42), Math.round(pitY + 2), 24, 24);
    }
  }

  const me = walker(t);
  const sprite = playerSprite(DEFAULT_APPEARANCE, me.facing, me.walking ? WALK[Math.floor(me.dist / 10) % 4] : 0);
  const pw = sprite.canvas.width * WORLD_SCALE, ph = sprite.canvas.height * WORLD_SCALE;
  const px = Math.round(cx + me.x), feet = Math.round(cy + me.y);
  c.drawImage(sprite.canvas, Math.round(px - pw / 2), feet - ph, pw, ph);
  if (t >= PIT_FROM && t < PIT_FROM + 0.8) {
    c.fillStyle = '#2a2140'; c.fillRect(px - 3, feet - ph - 19, 6, 15);
    c.fillStyle = '#ffd84a'; c.fillRect(px - 2, feet - ph - 18, 4, 8); c.fillRect(px - 2, feet - ph - 8, 4, 3);
  }
  c.restore();

  const logoY = Math.round(cy - 62);
  for (const [from, to, at] of CHUNKS) {
    for (let i = from; i < to; i++) {
      const g = logo.glyphs[i], p = seg(t, at + (i - from) * 0.06, at + (i - from) * 0.06 + 0.32);
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
  }
  fade(env, 1 - seg(t, 0, 0.5));
}

export const sceneB: Scene = { duration: B_TIME.END, draw };
