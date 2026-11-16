import { describe, expect, it } from 'vitest';
import {
  bounce, createMenu, easeBack, easeIn, easeInOut, easeOut, keyAction, logoLayout, moveMenu, parseVariant,
  SAFE_H, SAFE_W, seg, selectedItem, TITLE, TITLE_BOTTOM, TITLE_TOP, viewSize,
} from '../src/opening/core';

describe('opening: 時間と補間', () => {
  it('seg は区間の外で 0 と 1 に張り付く', () => {
    expect(seg(1, 2, 4)).toBe(0);
    expect(seg(3, 2, 4)).toBe(0.5);
    expect(seg(9, 2, 4)).toBe(1);
    expect(seg(2, 2, 2)).toBe(1);
  });
  it('補間は 0 で始まり 1 で終わる', () => {
    for (const f of [easeOut, easeIn, easeInOut, easeBack, bounce]) {
      expect(f(0)).toBeCloseTo(0, 5);
      expect(f(1)).toBeCloseTo(1, 5);
    }
  });
});

describe('opening: 画面の論理サイズ', () => {
  const cases: [string, number, number][] = [
    ['スマホ縦', 390, 844], ['スマホ横', 844, 390], ['小さいスマホ', 320, 568], ['タブレット', 768, 1024],
    ['PC', 1440, 900], ['フルHD', 1920, 1080], ['極小', 200, 200],
  ];
  it.each(cases)('%s で中央の安全領域が収まり、表示領域をはみ出さない', (_name, cssW, cssH) => {
    const v = viewSize(cssW, cssH);
    expect(v.w).toBeGreaterThanOrEqual(SAFE_W);
    expect(v.h).toBeGreaterThanOrEqual(SAFE_H);
    expect(v.w).toBeLessThanOrEqual(480);
    expect(v.h).toBeLessThanOrEqual(480);
    // 安全領域（中央 240×270）は必ず表示領域の内側に入る。
    expect(SAFE_W * v.scale).toBeLessThanOrEqual(cssW + 1e-6);
    expect(SAFE_H * v.scale).toBeLessThanOrEqual(cssH + 1e-6);
    if (v.scale >= 1) expect(Number.isInteger(v.scale * 2)).toBe(true);
    if (cssW >= cssH) expect(v.h).toBe(SAFE_H);
    // 高精細な画面では刻みを細かくし、同じかより大きく表示する。
    const fine = viewSize(cssW, cssH, 3);
    expect(fine.scale).toBeGreaterThanOrEqual(v.scale);
    if (fine.scale >= 1) expect(Number.isInteger(fine.scale * 4)).toBe(true);
  });
});

describe('opening: ロゴの文字配置', () => {
  it('タイトルの全文字を 2 行で並べ、安全幅に収める', () => {
    const slots = logoLayout();
    expect(slots.map((s) => s.ch).join('')).toBe(TITLE);
    expect(TITLE_TOP + TITLE_BOTTOM).toBe(TITLE);
    expect(slots.slice(0, 2).map((s) => s.ch).join('')).toBe('回避');
    for (const s of slots) {
      expect(Math.abs(s.x) + s.size / 2).toBeLessThanOrEqual(SAFE_W / 2);
    }
  });
});

describe('opening: メニュー', () => {
  it('保存がなければ「つづきから」を選べず、移動しても「はじめから」に留まる', () => {
    const m = createMenu(false);
    expect(selectedItem(m)).toBe('new');
    expect(m.items[1].enabled).toBe(false);
    expect(selectedItem(moveMenu(m, 1))).toBe('new');
    expect(selectedItem(moveMenu(m, -1))).toBe('new');
  });
  it('保存があれば「つづきから」が初期選択で、上下で行き来できる', () => {
    const m = createMenu(true);
    expect(selectedItem(m)).toBe('continue');
    const up = moveMenu(m, -1);
    expect(selectedItem(up)).toBe('new');
    expect(selectedItem(moveMenu(up, 1))).toBe('continue');
    expect(moveMenu(m, 1)).toBe(m);
  });
});

describe('opening: 入力と案の指定', () => {
  it('本編と同じキーを決定・戻る・移動に割り当てる', () => {
    for (const code of ['KeyZ', 'Space', 'Enter']) expect(keyAction(code)).toBe('confirm');
    expect(keyAction('Escape')).toBe('cancel');
    expect(keyAction('ArrowUp')).toBe('up');
    expect(keyAction('KeyS')).toBe('down');
    expect(keyAction('KeyQ')).toBeUndefined();
  });
  it('不明な案の指定は案Aにする', () => {
    expect(parseVariant('b')).toBe('b');
    expect(parseVariant('c')).toBe('c');
    expect(parseVariant('x')).toBe('a');
    expect(parseVariant(null)).toBe('a');
  });
});
