import { describe, expect, it } from 'vitest';
import type { C2D } from '../src/render/draw';
import { drawSignText, glyphDots, GLYPH_H, GLYPH_W, hasGlyphs, signTextWidth } from '../src/render/sign-font';

/** Every word drawn on a sign in render/sprites.ts (shops, the fallback and the station). */
const SIGN_WORDS = ['やおや', 'ほん', 'だがし', 'コンビニ', 'パン', 'カフェ', 'くすり', 'おみせ', 'えき'];

describe('sign font', () => {
  it('has every character used on the signs', () => {
    for (const word of SIGN_WORDS) expect(hasGlyphs(word), word).toBe(true);
    expect(hasGlyphs('ぬ')).toBe(false);
  });

  it('keeps the body inside the 10×10 cell and the marks just above its top right', () => {
    for (const ch of new Set(SIGN_WORDS.join(''))) {
      const { body, marks } = glyphDots(ch)!;
      expect(body.length, ch).toBeGreaterThan(0);
      for (const [x, y] of body) expect(x >= 0 && x < GLYPH_W && y >= 0 && y < GLYPH_H, `${ch} (${x},${y})`).toBe(true);
      for (const [x, y] of marks) expect(x >= 7 && x <= GLYPH_W && y >= -2 && y <= 0, `${ch} mark (${x},${y})`).toBe(true);
    }
  });

  it('adds dakuten and handakuten that do not touch the bold body', () => {
    for (const ch of ['だ', 'が', 'ビ', 'パ']) {
      const { body, marks } = glyphDots(ch)!;
      expect(marks.length, ch).toBe(4);
      // Bold body dots cover (x, y) and (x + 1, y); no mark may sit on or next to them.
      const bold = new Set(body.flatMap(([x, y]) => [`${x},${y}`, `${x + 1},${y}`]));
      for (const [x, y] of marks) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        expect(bold.has(`${x + dx},${y + dy}`), `${ch} mark (${x},${y})`).toBe(false);
      }
    }
    expect(glyphDots('た')!.marks).toEqual([]);
  });

  it('centres the text and fits the longest word on a 6-tile shop sign', () => {
    const drawn: [number, number][] = [];
    const c = { fillStyle: '', fillRect(x: number, y: number, w: number) { for (let i = 0; i < w; i++) drawn.push([x + i, y]); } };
    drawSignText(c as unknown as C2D, 'コンビニ', 48, 0, '#488e92');
    const xs = drawn.map(([x]) => x), width = signTextWidth('コンビニ');
    expect(width).toBeLessThanOrEqual(96 - 12 - 2);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(48 - width / 2);
    expect(Math.max(...xs)).toBeLessThan(48 + width / 2);
    expect(Math.min(...drawn.map(([, y]) => y))).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...drawn.map(([, y]) => y))).toBeLessThan(GLYPH_H);
  });

  it('draws the text darker than the sign colour', () => {
    const colors = new Set<string>();
    const c = { set fillStyle(v: string) { colors.add(v); }, fillRect() {} };
    drawSignText(c as unknown as C2D, 'パン', 0, 0, '#ad8047');
    expect([...colors]).toEqual(['#70532e']);
  });
});
