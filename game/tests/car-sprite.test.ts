import { describe, expect, it } from 'vitest';
import { CAR_BODY, CAR_COLORS, CAR_H, CAR_W, CAR_WHEEL, carPalette } from '../src/render/car-sprite';

describe('car sprite grid', () => {
  it('fits the 2×1 tile footprint with the wheels on the bottom row', () => {
    for (const row of CAR_BODY) expect(row).toHaveLength(CAR_W);
    expect(CAR_BODY.length).toBeLessThanOrEqual(CAR_H);
    expect(11 + CAR_WHEEL.length).toBe(CAR_H);
  });

  it('defines every token for every colour and wraps unknown styles', () => {
    const tokens = new Set([...CAR_BODY, ...CAR_WHEEL].join('').replace(/\./g, ''));
    for (let style = -1; style <= CAR_COLORS.length; style++) {
      const colors = carPalette(style);
      for (const token of tokens) expect(colors[token], `style ${style} token ${token}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(carPalette(CAR_COLORS.length)).toEqual(carPalette(0));
  });
});
