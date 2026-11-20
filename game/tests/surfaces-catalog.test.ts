import { describe, expect, it } from 'vitest';
import { SURFACES } from '../src/render/surfaces';

describe('optional surface catalog', () => {
  it('exposes the ten agreed visual IDs without requiring the DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(SURFACES.map(entry => entry.id)).toEqual([
      'floor-wood-light', 'floor-wood-dark', 'floor-tatami', 'floor-carpet-beige', 'floor-tile-check', 'floor-shop-white',
      'wall-plain-cream', 'wall-stripe-green', 'wall-wood-panel', 'wall-shop-white',
    ]);
    expect(SURFACES.filter(entry => entry.kind === 'floor')).toHaveLength(6);
    expect(SURFACES.filter(entry => entry.kind === 'wall')).toHaveLength(4);
    expect(new Set(SURFACES.map(entry => entry.id)).size).toBe(10);
    expect(Object.isFrozen(SURFACES)).toBe(true);
    expect(SURFACES.every(entry => Object.isFrozen(entry) && entry.name.length > 0)).toBe(true);
  });
});
