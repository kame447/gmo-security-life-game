/** オープニング候補の共通部品（DOM 非依存）。時間の区間、補間、画面の論理サイズ、ロゴの文字配置、メニューの状態。 */

export const TITLE = '回避！人生の落とし穴';
export const TITLE_TOP = '回避！';
export const TITLE_BOTTOM = '人生の落とし穴';

export type VariantId = 'a' | 'b' | 'c';
export const VARIANT_IDS: readonly VariantId[] = ['a', 'b', 'c'];
export function parseVariant(raw: string | null | undefined): VariantId {
  return raw === 'b' || raw === 'c' ? raw : 'a';
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 時刻 t が区間 [from, to] のどこにあるかを 0〜1 で返す。 */
export function seg(t: number, from: number, to: number): number {
  return to <= from ? (t >= to ? 1 : 0) : clamp01((t - from) / (to - from));
}
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
export const easeIn = (t: number): number => t ** 3;
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** 行き過ぎてから戻る。 */
export function easeBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
/** 落下して弾む（0→1、着地は 1）。 */
export function bounce(t: number): number {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
/** 再現できる擬似乱数（0〜1）。演出の揺れを毎回同じにする。 */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export interface ViewSize { w: number; h: number; scale: number }
export const SAFE_W = 240, SAFE_H = 270, MAX_W = 480, MAX_H = 480;
/**
 * 表示領域から論理サイズを決める。中央の 240×270 は必ず収まる。横長では高さ 270 のまま幅を 480 まで、
 * 縦長では幅を保って高さを 480 まで広げる。拡大率は刻み（高精細な画面は 0.25、それ以外は 0.5）に切り下げ、
 * ドットの大きさのばらつきを抑える。
 */
export function viewSize(cssW: number, cssH: number, pixelRatio = 1): ViewSize {
  const fit = Math.min(cssW / SAFE_W, cssH / SAFE_H), steps = pixelRatio >= 2 ? 4 : 2;
  const scale = fit >= 1 ? Math.floor(fit * steps) / steps : Math.max(fit, 0.01);
  const maxH = cssW >= cssH ? SAFE_H : MAX_H;
  const w = Math.max(SAFE_W, Math.min(MAX_W, Math.floor(cssW / scale)));
  const h = Math.max(SAFE_H, Math.min(maxH, Math.floor(cssH / scale)));
  return { w, h, scale };
}

export interface LetterSlot { ch: string; line: 0 | 1; x: number; y: number; size: number }
export const TOP_SIZE = 44, BOTTOM_SIZE = 26;
/** 2 行のロゴの文字位置（各文字の中心。ロゴ全体の中心が原点）。安全幅 240 に収まる。 */
export function logoLayout(): LetterSlot[] {
  const out: LetterSlot[] = [];
  const row = (text: string, line: 0 | 1, size: number, y: number, pitch: number): void => {
    const chars = [...text];
    const x0 = -((chars.length - 1) * pitch) / 2;
    chars.forEach((ch, i) => out.push({ ch, line, x: x0 + i * pitch, y, size }));
  };
  row(TITLE_TOP, 0, TOP_SIZE, -20, TOP_SIZE + 4);
  row(TITLE_BOTTOM, 1, BOTTOM_SIZE, 22, BOTTOM_SIZE + 2);
  return out;
}

export type MenuItemId = 'new' | 'continue';
export interface MenuState { items: readonly { id: MenuItemId; label: string; enabled: boolean }[]; index: number }
export function createMenu(hasSave: boolean): MenuState {
  return {
    items: [
      { id: 'new', label: 'はじめから', enabled: true },
      { id: 'continue', label: 'つづきから', enabled: hasSave },
    ],
    // 保存があれば「つづきから」を初期選択にする。
    index: hasSave ? 1 : 0,
  };
}
/** 選べない項目を飛ばして移動する。端では止まる。 */
export function moveMenu(m: MenuState, delta: -1 | 1): MenuState {
  for (let i = m.index + delta; i >= 0 && i < m.items.length; i += delta) {
    if (m.items[i].enabled) return { ...m, index: i };
  }
  return m;
}
export function selectedItem(m: MenuState): MenuItemId | undefined {
  const item = m.items[m.index];
  return item?.enabled ? item.id : undefined;
}

export type Phase = 'playing' | 'menu';
/** キー入力の意味。本編と同じく Z / Space / Enter が決定、Esc が戻る、矢印 / WASD が移動。 */
export type OpeningAction = 'confirm' | 'cancel' | 'up' | 'down';
export function keyAction(code: string): OpeningAction | undefined {
  switch (code) {
    case 'KeyZ': case 'Space': case 'Enter': return 'confirm';
    case 'Escape': return 'cancel';
    case 'ArrowUp': case 'KeyW': return 'up';
    case 'ArrowDown': case 'KeyS': return 'down';
    default: return undefined;
  }
}
