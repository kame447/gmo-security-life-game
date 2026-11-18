import { describe, expect, it } from 'vitest';
import { APPEARANCE_OPTIONS } from '../src/core/appearance';
import { ADULT_BODIES, ADULT_HEADS, CAT, NPC_H, NPC_IDS, npcParts } from '../src/render/npc-sprite';
import { palette, type Grid } from '../src/render/player-sprite';
import { buildWorld } from '../src/world';

const views = ['front', 'back', 'side'] as const;

function tokens(grid: Grid): Set<string> {
  return new Set(grid.join('').replace(/\./g, ''));
}

describe('NPC sprite grids', () => {
  it('has adult heads 12 wide and 12 tall for every view', () => {
    for (const [id, set] of Object.entries(ADULT_HEADS)) for (const view of views) {
      expect(set[view], `${id}/${view}`).toHaveLength(12);
      for (const row of set[view]) expect(row, `${id}/${view}`).toHaveLength(12);
    }
  });

  it('has adult bodies 18 wide and 9 tall, filling the sprite with the 12 head rows and 5 leg rows', () => {
    for (const [id, set] of Object.entries(ADULT_BODIES)) for (const view of views) {
      expect(set[view], `${id}/${view}`).toHaveLength(9);
      for (const row of set[view]) expect(row, `${id}/${view}`).toHaveLength(18);
    }
    expect(12 + 9 + 5).toBe(NPC_H);
  });

  it('keeps every cat row the same width within a view', () => {
    for (const view of views) expect(new Set(CAT[view].map(row => row.length)).size, view).toBe(1);
  });

  it('defines a colour for every token each NPC uses', () => {
    for (const id of NPC_IDS) {
      const { colors, grids } = npcParts(id);
      for (const value of Object.values(colors)) expect(value, id).toMatch(/^#[0-9a-f]{6}$/);
      for (const grid of grids) for (const token of tokens(grid)) expect(colors[token], `${id} token ${token}`).toBeDefined();
    }
  });

  it('draws every NPC placed in the real world with its own design', () => {
    const world = buildWorld();
    const used = [...world.areas.values()].flatMap(area => area.interactions)
      .filter(item => item.kind === 'npc').map(item => item.sprite ?? 'friend');
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const id of used) expect(NPC_IDS, id).toContain(id);
  });

  it('never uses the hair or outfit colours the player can choose, so no NPC looks like the player', () => {
    const playerHair = new Set<string>(), playerOutfit = new Set<string>();
    for (const hairColor of APPEARANCE_OPTIONS.hairColor) for (const outfitColor of APPEARANCE_OPTIONS.outfitColor) {
      const colors = palette({ silhouette: 'type-a', hairStyle: 'short', hairColor: hairColor.id, outfit: 'jacket', outfitColor: outfitColor.id });
      playerHair.add(colors.h); playerOutfit.add(colors.c);
    }
    for (const id of NPC_IDS.filter(id => id !== 'cat')) {
      const { colors } = npcParts(id);
      expect(playerHair.has(colors.h), `${id} hair`).toBe(false);
      expect(playerOutfit.has(colors.c), `${id} outfit`).toBe(false);
    }
  });
});
