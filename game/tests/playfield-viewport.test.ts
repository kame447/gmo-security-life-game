import { describe, expect, it } from 'vitest';
import { playfieldSize } from '../src/ui/playfield-viewport';

describe('indoor playfield', () => {
  it('keeps the full width and leaves eight pixels before the hotbar', () => {
    expect(playfieldSize(1280, 800, true, 668)).toEqual({ width: 1280, height: 660 });
    expect(playfieldSize(390, 844, true, 560)).toEqual({ width: 390, height: 552 });
    expect(playfieldSize(844, 390, true, 320)).toEqual({ width: 844, height: 312 });
  });

  it('restores the entire viewport outdoors without changing its width', () => {
    expect(playfieldSize(390, 844, false, 560)).toEqual({ width: 390, height: 844 });
  });

  it('rounds inward and keeps a valid canvas on very small viewports', () => {
    expect(playfieldSize(320, 568, true, 300.8)).toEqual({ width: 320, height: 292 });
    expect(playfieldSize(320, 40, true, -12)).toEqual({ width: 320, height: 1 });
    expect(playfieldSize(320, 568, true, 600)).toEqual({ width: 320, height: 568 });
  });
});
