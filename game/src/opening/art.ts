/// <reference types="vite/client" />
/**
 * オープニング用の画像。assets/images/branding/title/ の PNG を読み込み、無い画像はコードで描いた仮の絵で代用する。
 * 仮の絵は画像と同じ寸法にして、演出側が出どころを区別せずに描けるようにする。
 */
import { hash } from './core';

export type ArtId =
  | 'a-street' | 'a-pit'
  | 'c-pitwall' | 'c-sky' | 'c-town' | 'dust';
export type Picture = HTMLCanvasElement | HTMLImageElement;
export interface Art { get(id: ArtId): Picture; source(id: ArtId): 'image' | 'code' }

const urls = import.meta.glob('../../../assets/images/branding/title/opening-*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

type C2D = CanvasRenderingContext2D;
function canvas(w: number, h: number, paint: (c: C2D, w: number, h: number) => void): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = w; el.height = h;
  const c = el.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  paint(c, w, h);
  return el;
}
const R = (c: C2D, color: string, x: number, y: number, w: number, h: number): void => {
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
/** 輪郭がなめらかにならない楕円。 */
function ellipse(c: C2D, color: string, cx: number, cy: number, rx: number, ry: number): void {
  c.fillStyle = color;
  for (let y = -Math.ceil(ry); y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    if (half > 0) c.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1);
  }
}
function cloud(c: C2D, x: number, y: number, s: number): void {
  ellipse(c, '#e3eef7', x, y + 2, 16 * s, 5 * s);
  ellipse(c, '#ffffff', x - 6 * s, y, 9 * s, 5 * s);
  ellipse(c, '#ffffff', x + 5 * s, y - 2 * s, 11 * s, 6 * s);
}
function sky(c: C2D, w: number, h: number, seed: number): void {
  const bands = ['#6fb7ea', '#82c3ee', '#98cff1', '#b0dcf4', '#c9e8f7', '#e0f2f9'];
  bands.forEach((color, i) => R(c, color, 0, (h * i) / bands.length, w, h / bands.length + 1));
  for (let i = 0; i < 6; i++) cloud(c, 40 + hash(seed + i) * (w - 80), 24 + hash(seed + i * 7) * h * 0.45, 1 + (i % 2));
}
function house(c: C2D, x: number, base: number, w: number, h: number, i: number): void {
  const walls = ['#f2e2c4', '#e8d3b0', '#dfe6ea', '#f0d9c8'], roofs = ['#b5574b', '#4f6d8c', '#6f8f5a', '#8a5a44'];
  R(c, walls[i % 4], x, base - h, w, h);
  R(c, roofs[i % 4], x - 3, base - h - 8, w + 6, 9);
  R(c, '#2a2140', x - 3, base - h + 1, w + 6, 1);
  R(c, '#7fb6d9', x + 5, base - h + 8, 8, 8);
  if (w > 40) R(c, '#7fb6d9', x + w - 14, base - h + 8, 8, 8);
  R(c, '#7a5a40', x + w / 2 - 4, base - 14, 8, 14);
}

const FALLBACK: Record<ArtId, () => HTMLCanvasElement> = {
  'a-street': () => canvas(480, 270, (c, w, h) => {
    R(c, '#7fae62', 0, 0, w, h);
    for (let i = 0; i < 260; i++) R(c, i % 2 ? '#8dbb6d' : '#73a258', hash(i) * w, hash(i + 500) * h, 2, 1);
    R(c, '#c9c2b4', 0, 62, w, 146); R(c, '#c9c2b4', 150, 0, 180, h);
    R(c, '#6c7078', 0, 72, w, 126); R(c, '#6c7078', 160, 0, 160, h);
    for (let i = 0; i < 300; i++) R(c, '#747983', hash(i + 40) * w, 72 + hash(i + 90) * 126, 2, 1);
    for (let x = 4; x < 150; x += 22) { R(c, '#ece8da', x, 134, 12, 2); R(c, '#ece8da', x + 326, 134, 12, 2); }
    for (let y = 4; y < 62; y += 22) { R(c, '#ece8da', 239, y, 2, 12); R(c, '#ece8da', 239, y + 206, 2, 12); }
    for (let i = 0; i < 9; i++) { R(c, '#ece8da', 166 + i * 17, 54, 9, 14); R(c, '#ece8da', 166 + i * 17, 202, 9, 14); }
    const lots: [number, number][] = [[18, 6], [86, 6], [344, 6], [412, 6], [18, 218], [86, 218], [344, 218], [412, 218]];
    lots.forEach(([x, y], i) => {
      const roofs = ['#b5574b', '#4f6d8c', '#8a5a44', '#6b7f8f'];
      R(c, '#2a2140', x - 1, y - 1, 52, 48); R(c, roofs[i % 4], x, y, 50, 46);
      R(c, 'rgba(255,255,255,0.18)', x, y, 50, 22); R(c, '#2a2140', x, y + 22, 50, 1);
    });
    [[140, 50], [334, 50], [140, 214], [334, 214]].forEach(([x, y]) => { ellipse(c, '#3f7a45', x, y, 9, 8); ellipse(c, '#5a9a58', x - 2, y - 2, 5, 4); });
  }),
  'a-pit': () => canvas(160, 112, (c) => {
    ellipse(c, '#3c3f47', 80, 56, 78, 54); ellipse(c, '#8a6a4a', 80, 57, 70, 47);
    ellipse(c, '#5e452f', 80, 60, 64, 42); ellipse(c, '#2b1f1a', 80, 63, 56, 36); ellipse(c, '#0d0a0e', 80, 67, 46, 28);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      R(c, '#3c3f47', 80 + Math.cos(a) * 74 - 3, 56 + Math.sin(a) * 51 - 2, 7, 5);
    }
  }),
  'c-pitwall': () => canvas(480, 480, (c, w, h) => {
    const rings = ['#1a1214', '#2b1f1a', '#3d2c22', '#4f3a2b', '#5e452f', '#6f5438', '#7e6242'];
    rings.forEach((color, i) => ellipse(c, color, w / 2, h / 2, 360 - i * 42, 360 - i * 42));
    for (let i = 0; i < 220; i++) {
      const a = hash(i) * Math.PI * 2, d = 84 + hash(i + 300) * 250;
      R(c, i % 3 ? '#8d7350' : '#33251e', w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 3 + (d > 180 ? 3 : 0), 2 + (d > 180 ? 2 : 0));
    }
    ellipse(c, '#3c3f47', w / 2, h / 2, 78, 78);
    c.globalCompositeOperation = 'destination-out';
    ellipse(c, '#000', w / 2, h / 2, 70, 70);
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      R(c, i % 2 ? '#5a9a58' : '#3c3f47', w / 2 + Math.cos(a) * 70 - 3, h / 2 + Math.sin(a) * 70 - 3, 6, 6);
    }
  }),
  'c-sky': () => canvas(480, 270, (c, w, h) => sky(c, w, h, 11)),
  'c-town': () => canvas(480, 270, (c, w, h) => {
    sky(c, w, h, 21);
    for (let x = 0; x < w; x += 4) R(c, '#8fb0a0', x, 150 - Math.sin((x / w) * Math.PI * 2.4) * 24, 4, 60);
    R(c, '#7fae62', 0, 176, w, h - 176);
    for (let i = 0; i < 9; i++) {
      const bw = 26 + hash(i) * 22, bh = 30 + hash(i + 5) * 46, x = 14 + i * 52;
      R(c, i % 2 ? '#93a8bb' : '#a9b9c6', x, 186 - bh, bw, bh);
      for (let wy = 190 - bh; wy < 180; wy += 8) for (let wx = x + 4; wx < x + bw - 5; wx += 8) R(c, '#dbe7ee', wx, wy, 4, 4);
    }
    R(c, '#6c7078', 0, 204, w, 8); for (let x = 0; x < w; x += 12) R(c, '#3c3f47', x, 204, 2, 8);
    for (let i = 0; i < 10; i++) house(c, 6 + i * 50, 262 - (i % 2) * 6, 36, 26 + (i % 3) * 6, i);
  }),
  dust: () => canvas(96, 24, (c) => {
    for (let f = 0; f < 4; f++) {
      const r = 4 + f * 2;
      ellipse(c, f < 3 ? '#d9cdb8' : 'rgba(217,205,184,0.6)', f * 24 + 12 - 4, 14, r * 0.7, r * 0.6);
      ellipse(c, f < 3 ? '#efe6d4' : 'rgba(239,230,212,0.6)', f * 24 + 12 + 3, 11, r * 0.6, r * 0.55);
    }
  }),
};

function loadImage(url: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

/** 画像を読み込む。読めなかったものは仮の絵にする（読み込み失敗で演出を止めない）。 */
export async function loadArt(): Promise<Art> {
  const pictures = new Map<ArtId, Picture>(), sources = new Map<ArtId, 'image' | 'code'>();
  await Promise.all((Object.keys(FALLBACK) as ArtId[]).map(async (id) => {
    const key = Object.keys(urls).find((path) => path.endsWith(`/opening-${id}.png`));
    const img = key ? await loadImage(urls[key]) : undefined;
    pictures.set(id, img ?? FALLBACK[id]());
    sources.set(id, img ? 'image' : 'code');
  }));
  return { get: (id) => pictures.get(id)!, source: (id) => sources.get(id)! };
}

/** 横につながる帯を、offset だけずらして画面幅ぶん並べる。 */
export function drawStrip(c: C2D, pic: Picture, offset: number, y: number, viewW: number): void {
  const w = pic.width, start = -(((Math.round(offset) % w) + w) % w);
  for (let x = start; x < viewW; x += w) c.drawImage(pic, x, Math.round(y));
}

/** 画面を覆うように中央へ置く。足りないときだけ整数倍に拡大する。 */
export function drawCover(c: C2D, pic: Picture, viewW: number, viewH: number, anchorY: 'center' | 'bottom' = 'center'): void {
  const k = Math.max(1, Math.ceil(Math.max(viewW / pic.width, viewH / pic.height)));
  const w = pic.width * k, h = pic.height * k;
  c.drawImage(pic, Math.round((viewW - w) / 2), anchorY === 'bottom' ? viewH - h : Math.round((viewH - h) / 2), w, h);
}
