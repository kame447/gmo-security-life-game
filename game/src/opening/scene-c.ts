/**
 * 案C：落とし穴の底から見上げる。丸い穴の口へ向かって上昇し、町の空へ抜けたところでタイトルが現れる。
 */
import { drawCover, drawStrip } from './art';
import { easeInOut, easeOut, hash, lerp, seg } from './core';
import { drawGlyph } from './glyphs';
import { fade, type Scene, type SceneEnv } from './scene';

const RISE_FROM = 2.6, RISE_TO = 4.8, TILT_TO = 6.5, STAMP_FROM = 6.3, END = 8.3;
const MAX_ZOOM = 9;
/** 空の画像の地色。画像の外側を同じ色で埋める。 */
const SKY = '#3b9dff';

function draw(env: SceneEnv, time: number): void {
  const { c, w, h, art, logo } = env;
  const t = Math.max(0, time), cx = w / 2, cy = h / 2;

  if (t < RISE_TO + 0.1) {
    // 穴の底：口から見える空と、周りの土の壁。
    const sky = art.get('c-sky'), wall = art.get('c-pitwall');
    c.fillStyle = SKY; c.fillRect(0, 0, w, h);
    // 雲が口の中を横切るように、空の上側を口の高さへ合わせる。
    drawStrip(c, sky, sky.width / 2 - cx + 130 + t * 14, Math.round(cy - 62), w);
    const rise = easeInOut(seg(t, RISE_FROM, RISE_TO));
    // 揺れても壁の外が見えないよう、少し拡大した状態から始める。
    const zoom = 1.08 * Math.exp(Math.log(MAX_ZOOM) * rise);
    const swayX = Math.sin(t * 1.3) * 3 * (1 - rise), swayY = Math.cos(t * 1.1) * 2 * (1 - rise);
    const size = wall.width * zoom;
    c.drawImage(wall, Math.round(cx - size / 2 + swayX), Math.round(cy - size / 2 + swayY), Math.round(size), Math.round(size));
    // 口からこぼれて落ちてくる土くれ。
    for (let i = 0; i < 7; i++) {
      const p = (t * (0.35 + hash(i) * 0.25) + hash(i + 10)) % 1, angle = hash(i + 20) * Math.PI * 2;
      const d = (30 + p * p * 220) * zoom, px = 1 + Math.floor(p * 4);
      c.fillStyle = i % 2 ? '#8d7350' : '#5e452f';
      c.fillRect(Math.round(cx + swayX + Math.cos(angle) * d), Math.round(cy + swayY + Math.sin(angle) * d), px, px);
    }
    // 底の暗さ。上昇するにつれて明るくなる。
    fade(env, 0.3 * (1 - rise));
  } else {
    // 地上：視線が下がり、町の全景がせり上がる。
    const tilt = easeOut(seg(t, RISE_TO, TILT_TO));
    c.fillStyle = SKY; c.fillRect(0, 0, w, h);
    drawStrip(c, art.get('c-sky'), t * 9, Math.round(-h * 0.3 * tilt), w);
    c.save();
    c.translate(0, Math.round((1 - tilt) * h * 0.75));
    drawCover(c, art.get('c-town'), w, h, 'bottom');
    c.restore();

    const logoY = Math.round(cy - 68);
    logo.glyphs.forEach((g, i) => {
      const x = cx + g.slot.x, y = logoY + g.slot.y;
      if (g.slot.line === 0) {
        // 「回避！」は大きく現れて、はんこのように押される。
        const p = seg(t, STAMP_FROM + i * 0.16, STAMP_FROM + i * 0.16 + 0.26);
        if (p > 0) drawGlyph(c, g, { x, y, scale: lerp(2.4, 1, easeOut(p)), alpha: Math.min(1, p * 2.5) });
      } else {
        const p = seg(t, STAMP_FROM + 0.75 + (i - 3) * 0.06, STAMP_FROM + 0.75 + (i - 3) * 0.06 + 0.3);
        if (p > 0) drawGlyph(c, g, { x, y: y + Math.round((1 - easeOut(p)) * 12), alpha: p });
      }
    });
  }

  // 穴を抜ける瞬間のまぶしさ。
  const glare = seg(t, RISE_TO - 0.5, RISE_TO) * (1 - seg(t, RISE_TO, RISE_TO + 0.6));
  if (glare > 0) { c.fillStyle = `rgba(255,255,255,${glare * 0.85})`; c.fillRect(0, 0, w, h); }
  fade(env, 1 - seg(t, 0, 0.8));
}

export const sceneC: Scene = { duration: END, draw };
