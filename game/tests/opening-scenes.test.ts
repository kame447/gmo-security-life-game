/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { logoLayout } from '../src/opening/core';
import {
  A_TIME, dropStart, evadePose, EVADE_HALF, EVADE_INDEXES, EVADE_X, EVADE_Y, FALL_FIRST, fallStart, PIT, pitOpen, restPose, shakeX,
} from '../src/opening/motion-a';
import { B_TIME, FEET_Y, isRoadTile, PIT_B, ROAD_TOP, TILE_PX, walker, WALKER_HALF } from '../src/opening/motion-b';

const STEP = 1 / 30;
const times = (to: number): number[] => Array.from({ length: Math.ceil(to / STEP) + 1 }, (_, i) => i * STEP);

describe('opening 案A: 「回避！」は落ちない', () => {
  // 待機中にくり返す光の帯も含めて確かめる。
  const span = times(A_TIME.END + A_TIME.SHINE_EVERY * 2);
  const slots = logoLayout();
  it('地上に残るのは「回避！」の 3 文字（番号 0〜2）で、落ちるのは番号 3 以降の「人生の落とし穴」', () => {
    expect(EVADE_INDEXES).toEqual([0, 1, 2]);
    expect(EVADE_INDEXES.map((index) => slots[index].ch).join('')).toBe('回避！');
    expect(FALL_FIRST).toBe(3);
    expect(slots.slice(FALL_FIRST).map((slot) => slot.ch).join('')).toBe('人生の落とし穴');
  });
  it.each([240, 390, 480])('幅 %i で、「！」を含む 3 文字とも全時刻の高さが同じで下へ動かない', (viewW) => {
    for (const index of EVADE_INDEXES) {
      for (const t of span) expect(evadePose(index, t, viewW).y).toBe(EVADE_Y);
    }
  });
  it('「！」を含む 3 文字とも全時刻で落とし穴の範囲に入らない', () => {
    const pitTop = PIT.y - PIT.h / 2;
    for (const t of span) {
      for (const index of EVADE_INDEXES) expect(evadePose(index, t, 480).y + EVADE_HALF).toBeLessThan(pitTop);
    }
  });
  it('3 文字そろって横からすべり込み、以後は地上のその場に留まる（揺れは 1px 以内）', () => {
    for (const viewW of [240, 390, 480]) {
      for (const index of EVADE_INDEXES) expect(evadePose(index, 0, viewW).x + EVADE_HALF).toBeLessThan(-viewW / 2);
    }
    for (const t of span) {
      // 一まとまりなので、文字どうしの間隔はどの時刻でも変わらない。
      const [a, b, c] = EVADE_INDEXES.map((index) => evadePose(index, t, 480).x);
      expect([b - a, c - b]).toEqual([EVADE_X[1] - EVADE_X[0], EVADE_X[2] - EVADE_X[1]]);
      if (t >= A_TIME.SLIDE_TO) expect(Math.abs(a - EVADE_X[0])).toBeLessThanOrEqual(1);
    }
    for (const index of EVADE_INDEXES) expect(evadePose(index, A_TIME.END, 480)).toEqual({ x: EVADE_X[index], y: EVADE_Y });
    expect(EVADE_X[0] - EVADE_HALF).toBeGreaterThanOrEqual(-120);
    expect(EVADE_X[2] + EVADE_HALF).toBeLessThanOrEqual(120);
  });
  it('画面の揺れは横だけで、着地の瞬間と地割れの間に限る', () => {
    expect(shakeX(0.2, false)).toBe(0);
    expect(shakeX(A_TIME.END, false)).toBe(0);
    for (const t of span) expect(Math.abs(shakeX(t, true))).toBeLessThanOrEqual(2);
  });
  it('「人生の落とし穴」は穴の中で止まる', () => {
    for (let index = FALL_FIRST; index < slots.length; index++) {
      const rest = restPose(index);
      expect(((rest.x - PIT.x) / (PIT.w / 2)) ** 2 + ((rest.y - PIT.y) / (PIT.h / 2)) ** 2).toBeLessThan(0.5);
      expect(rest.y).toBeGreaterThan(EVADE_Y + EVADE_HALF);
    }
  });
  it('最後の文字が着地したらすぐ地面が割れ、穴は 0.35 秒以内に開ききる', () => {
    const landed = dropStart(slots.length - 1) + A_TIME.DROP_TIME;
    expect(A_TIME.CRACK_FROM).toBeGreaterThanOrEqual(landed);
    expect(A_TIME.CRACK_FROM - landed).toBeLessThanOrEqual(0.2);
    expect(A_TIME.PIT_FROM - A_TIME.CRACK_FROM).toBeLessThanOrEqual(0.35);
    expect(A_TIME.PIT_TO - A_TIME.PIT_FROM).toBeGreaterThanOrEqual(0.25);
    expect(A_TIME.PIT_TO - A_TIME.PIT_FROM).toBeLessThanOrEqual(0.35);
    expect(pitOpen(A_TIME.PIT_FROM)).toBe(0);
    expect(pitOpen(A_TIME.PIT_FROM + 0.15)).toBeGreaterThan(0.8);
    expect(pitOpen(A_TIME.PIT_FROM + 0.35)).toBe(1);
    expect(pitOpen(A_TIME.END)).toBe(1);
  });
  it('文字は穴が開き始めてから落ち、光の帯の前に底で止まる', () => {
    for (let index = FALL_FIRST; index < slots.length; index++) {
      const from = fallStart(slots[index].x);
      expect(from).toBeGreaterThan(A_TIME.PIT_FROM);
      expect(from + A_TIME.FALL_TIME).toBeLessThan(A_TIME.SHINE_FROM);
    }
    expect(A_TIME.SHINE_FROM + A_TIME.SHINE_TIME).toBeLessThan(A_TIME.END);
  });
});

describe('opening 案B: 分かれ道で選び直す', () => {
  const span = times(B_TIME.END + 2);
  it('下の道から丁字路へ入り、横の道では高さが変わらない（跳ばない）', () => {
    expect(walker(0).y).toBeGreaterThan(FEET_Y);
    let last = walker(0).y;
    for (const t of span) {
      const { y } = walker(t);
      expect(y).toBeLessThanOrEqual(last);
      if (t >= B_TIME.ARRIVE) expect(y).toBe(FEET_Y);
      last = y;
    }
  });
  it('左右を見比べてから左へ進み、引き返して右の道で止まる', () => {
    const facings = [B_TIME.ARRIVE, B_TIME.LOOK_LEFT, B_TIME.LOOK_RIGHT, B_TIME.DECIDE].map((t) => walker(t + 0.01).facing);
    expect(facings).toEqual(['up', 'left', 'right', 'left']);
    expect(walker(B_TIME.STOP).x).toBeLessThan(0);
    const end = walker(B_TIME.END);
    expect(end.x).toBeGreaterThan(0);
    expect(end).toMatchObject({ y: FEET_Y, facing: 'down', walking: false });
  });
  it('全時刻で落とし穴に入らず、道の上にいる', () => {
    const pitRight = PIT_B.x + PIT_B.w / 2;
    for (const t of span) {
      const me = walker(t);
      expect(me.x - WALKER_HALF).toBeGreaterThan(pitRight);
      expect(isRoadTile(Math.floor(me.x / TILE_PX), Math.floor((me.y - 1 - ROAD_TOP) / TILE_PX))).toBe(true);
    }
  });
  it('落とし穴は横の道の中に開く', () => {
    expect(PIT_B.y - PIT_B.h / 2).toBeGreaterThanOrEqual(ROAD_TOP);
    expect(PIT_B.y + PIT_B.h / 2).toBeLessThanOrEqual(ROAD_TOP + TILE_PX * 2);
  });
});

describe('opening: 不採用になった演出を残さない', () => {
  const raw = import.meta.glob('../src/opening/*.ts', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
  const sources = Object.entries(raw).map(([file, text]): [string, string] => [file.split('/').pop()!, text]);
  it('演出のソースを読めている', () => {
    expect(sources.map(([name]) => name)).toEqual(expect.arrayContaining(['scene-a.ts', 'scene-b.ts', 'motion-a.ts', 'motion-b.ts', 'art.ts']));
  });
  it('どのソースにも羽の演出がない', () => {
    for (const [name, text] of sources) expect(text, name).not.toMatch(/wing|feather|flap|羽|翼/i);
  });
  it('案A・案B に跳ぶ演出がない', () => {
    for (const [name, text] of sources.filter(([file]) => /^(scene|motion)-[ab]\.ts$/.test(file))) {
      expect(text, name).not.toMatch(/jump|JUMP_HEIGHT|跳び越/i);
    }
  });
  it('羽と横スクロールの画像を置いていない', () => {
    const images = Object.keys(import.meta.glob('../../assets/images/branding/title/*.png', { query: '?url' }));
    expect(images.length).toBeGreaterThan(0);
    expect(images.filter((name) => /wings|opening-b-/.test(name))).toEqual([]);
  });
});
