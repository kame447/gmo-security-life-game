/** タイトル文字を 1 文字ずつドット絵調のスプライトにする。フォントを 2 値化し、縁取りと影を付ける。 */
import { logoLayout, type LetterSlot } from './core';

const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif';
const EDGE = '#2a2140';
const TOP_COLORS = ['#fff3a8', '#ffd84a', '#f29a2e'] as const;
const BOTTOM_COLORS = ['#ffffff', '#fff4dc', '#d8c8a8'] as const;

export interface Glyph { canvas: HTMLCanvasElement; slot: LetterSlot }
export interface Logo { glyphs: Glyph[]; scale: number }

function hex(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeGlyph(ch: string, size: number, colors: readonly [string, string, string]): HTMLCanvasElement {
  const pad = 4, dim = size + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = dim; canvas.height = dim + 2;
  const c = canvas.getContext('2d', { willReadFrequently: true })!;
  c.font = `900 ${size}px ${FONT}`;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
  c.fillText(ch, dim / 2, dim / 2 + 1);
  const src = c.getImageData(0, 0, dim, dim + 2), w = src.width, h = src.height;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = src.data[i * 4 + 3] >= 112 ? 1 : 0;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : on[y * w + x]);
  const edge = hex(EDGE), cols = colors.map(hex);
  const reach = size >= 30 ? 2 : 1;
  const out = c.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rgb: [number, number, number] | undefined;
      if (at(x, y)) {
        // 上端は明るく、下 3 分の 1 は濃くして立体感を出す。
        const rel = (y - pad) / size;
        rgb = !at(x, y - 1) ? cols[0] : rel > 0.64 ? cols[2] : cols[1];
      } else {
        let near = false;
        for (let dy = -reach; dy <= reach + 2 && !near; dy++) {
          for (let dx = -reach; dx <= reach && !near; dx++) {
            // 下方向だけ 2px 余分に見て、縁取りと落ち影を一体にする。
            if (at(x + dx, y - dy)) near = dy <= reach || dx === 0 || Math.abs(dx) < reach;
          }
        }
        if (near) rgb = edge;
      }
      if (rgb) {
        const o = (y * w + x) * 4;
        out.data[o] = rgb[0]; out.data[o + 1] = rgb[1]; out.data[o + 2] = rgb[2]; out.data[o + 3] = 255;
      }
    }
  }
  c.putImageData(out, 0, 0);
  return canvas;
}

/** scale 倍の大きさでロゴ一式を作る（縮小表示用は別に作り、文字のつぶれを避ける）。 */
export function makeLogo(scale = 1): Logo {
  const glyphs = logoLayout().map((slot) => {
    const size = Math.round(slot.size * scale);
    return {
      canvas: makeGlyph(slot.ch, size, slot.line === 0 ? TOP_COLORS : BOTTOM_COLORS),
      slot: { ...slot, x: Math.round(slot.x * scale), y: Math.round(slot.y * scale), size },
    };
  });
  return { glyphs, scale };
}

export interface LetterPose { x: number; y: number; scale?: number; rot?: number; alpha?: number; dark?: number }

/** 文字の中心を (x, y) に置いて描く。dark は 0〜1 で黒へ近づける（穴に沈む表現）。 */
export function drawGlyph(c: CanvasRenderingContext2D, g: Glyph, p: LetterPose): void {
  const alpha = p.alpha ?? 1, scale = p.scale ?? 1;
  if (alpha <= 0 || scale <= 0) return;
  const { canvas } = g;
  c.save();
  c.globalAlpha = alpha;
  if (p.dark) c.filter = `brightness(${Math.max(0, 1 - p.dark)})`;
  c.translate(Math.round(p.x), Math.round(p.y));
  if (p.rot) c.rotate(p.rot);
  if (scale !== 1) c.scale(scale, scale);
  c.drawImage(canvas, -Math.round(canvas.width / 2), -Math.round(canvas.height / 2));
  c.restore();
}

/** ロゴ全体をそのままの配置で描く。 */
export function drawLogo(c: CanvasRenderingContext2D, logo: Logo, cx: number, cy: number, alpha = 1): void {
  for (const g of logo.glyphs) drawGlyph(c, g, { x: cx + g.slot.x, y: cy + g.slot.y, alpha });
}
