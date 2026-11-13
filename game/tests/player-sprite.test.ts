import { describe, expect, it } from 'vitest';
import { APPEARANCE_OPTIONS } from '../src/core/appearance';
import { BODIES, HEADS, PLAYER_H, palette, slim, type Grid } from '../src/render/player-sprite';

const views = ['front', 'back', 'side'] as const;

function tokens(grid: Grid): Set<string> {
  return new Set(grid.join('').replace(/\./g, ''));
}

describe('player sprite grids', () => {
  it('has a head for every view and hair style, 16 wide and 13 tall', () => {
    for (const view of views) for (const { id } of APPEARANCE_OPTIONS.hairStyle) {
      const grid = HEADS[view][id];
      expect(grid, `${view}/${id}`).toHaveLength(13);
      for (const row of grid) expect(row, `${view}/${id}`).toHaveLength(16);
    }
  });

  it('has a body for every view and outfit, 18 wide and 9 tall, filling the sprite with the 4 leg rows', () => {
    for (const view of views) for (const { id } of APPEARANCE_OPTIONS.outfit) {
      const grid = BODIES[view][id];
      expect(grid, `${view}/${id}`).toHaveLength(9);
      for (const row of grid) expect(row, `${view}/${id}`).toHaveLength(18);
    }
    expect(13 + 9 + 4).toBe(PLAYER_H);
  });

  it('uses only tokens defined by the palette for every colour choice', () => {
    for (const hairColor of APPEARANCE_OPTIONS.hairColor) for (const outfitColor of APPEARANCE_OPTIONS.outfitColor) {
      const colors = palette({ silhouette: 'type-a', hairStyle: 'short', hairColor: hairColor.id, outfit: 'jacket', outfitColor: outfitColor.id });
      for (const value of Object.values(colors)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
      for (const set of [HEADS, BODIES]) for (const view of views) for (const grid of Object.values(set[view])) {
        for (const token of tokens(grid)) expect(colors[token], `token ${token}`).toBeDefined();
      }
    }
  });

  it('narrows type-b bodies by two pixels while keeping the row width', () => {
    const body = BODIES.front.jacket;
    const narrow = slim(body);
    expect(narrow.every(row => row.length === 18)).toBe(true);
    const width = (rows: Grid) => Math.max(...rows.map(row => row.replace(/^\.+|\.+$/g, '').length));
    expect(width(narrow)).toBe(width(body) - 2);
  });
});
