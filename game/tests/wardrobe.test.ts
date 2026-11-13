import { describe, expect, it } from 'vitest';
import { APPEARANCE_FIELDS, APPEARANCE_OPTIONS, DEFAULT_APPEARANCE, normalizeAppearance,
  type PlayerAppearance } from '../src/core/appearance';
import { CLOTHING_DEFINITIONS, getClothingDefinition } from '../src/data/clothing';
import { getItemDefinition } from '../src/data/items';
import { PlayerAssets, type AssetSnapshot } from '../src/state/assets';
import { canWearClothing, restoreClothing, wearClothing } from '../src/state/wardrobe';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const before: PlayerAppearance = { silhouette: 'type-b', hairStyle: 'tied', hairColor: 'gold', outfit: 'overalls', outfitColor: 'red' };
const owned = (): AssetSnapshot => new PlayerAssets({ moneyYen: 2480, items: [{ itemId: 'shirt', quantity: 1 }] }).snapshot();

describe('clothing-only data contract', () => {
  it('maps known inventory IDs to supported appearance choices, with no extra appearance fields', () => {
    expect(new Set(CLOTHING_DEFINITIONS.map(item => item.itemId)).size).toBe(CLOTHING_DEFINITIONS.length);
    for (const clothing of CLOTHING_DEFINITIONS) {
      expect(getItemDefinition(clothing.itemId)).toBeDefined();
      expect(Object.keys(clothing.appearance).sort()).toEqual(['outfit', 'outfitColor']);
      expect(normalizeAppearance(clothing.appearance)).toMatchObject(clothing.appearance);
    }
    expect(getClothingDefinition('notebook')).toBeUndefined();
    expect(getClothingDefinition('missing')).toBeUndefined();
  });

  it('checks the current asset snapshot and changes only outfit and outfitColor', () => {
    const assets = owned();
    Object.freeze(assets.items[0]); Object.freeze(assets.items); Object.freeze(assets);
    const appearance = Object.freeze({ ...before });
    expect(canWearClothing('shirt', assets)).toBe(true);
    const result = wearClothing(appearance, 'shirt', assets);
    expect(result).toEqual({ ok: true,
      appearance: { ...before, outfit: 'shirt', outfitColor: 'blue' },
      previous: { outfit: 'overalls', outfitColor: 'red' } });
    expect(appearance).toEqual(before);
    expect(assets).toEqual(owned());
  });

  it('refuses an unowned or non-clothing item without mutating the appearance or assets', () => {
    const assets = new PlayerAssets(); const snapshot = assets.snapshot();
    expect(canWearClothing('shirt', snapshot)).toBe(false);
    expect(wearClothing(before, 'shirt', snapshot)).toEqual({ ok: false, reason: 'not-owned' });
    assets.addItem('notebook', 1);
    expect(canWearClothing('notebook', assets.snapshot())).toBe(false);
    expect(wearClothing(before, 'notebook', assets.snapshot())).toEqual({ ok: false, reason: 'not-clothing' });
    expect(wearClothing(before, 'missing', assets.snapshot())).toEqual({ ok: false, reason: 'not-clothing' });
    expect(before).toEqual({ silhouette: 'type-b', hairStyle: 'tied', hairColor: 'gold', outfit: 'overalls', outfitColor: 'red' });
    expect(assets.quantity('shirt')).toBe(0);
    expect(assets.quantity('notebook')).toBe(1);
    expect(assets.moneyYen).toBe(snapshot.moneyYen);
  });

  it.each([0, -1, 0.5, NaN, Infinity])('does not treat a malformed quantity %s as ownership', quantity => {
    const assets = { moneyYen: 1000, items: [{ itemId: 'shirt', quantity }] };
    expect(canWearClothing('shirt', assets)).toBe(false);
    expect(wearClothing(before, 'shirt', assets)).toEqual({ ok: false, reason: 'not-owned' });
  });

  it('restores clothing exactly while keeping later changes to hair and body', () => {
    const result = wearClothing(before, 'shirt', owned());
    if (!result.ok) throw new Error('fixture must own shirt');
    expect(restoreClothing(result.appearance, result.previous)).toEqual(before);
    const later = { ...result.appearance, silhouette: 'type-a', hairStyle: 'bob', hairColor: 'black' };
    // Even a structurally compatible whole appearance must not restore other fields.
    const restored = restoreClothing(later, before);
    expect(restored).toEqual({ ...later, outfit: before.outfit, outfitColor: before.outfitColor });
    expect(restored).not.toBe(later);
    expect(result.appearance).toEqual({ ...before, outfit: 'shirt', outfitColor: 'blue' });
  });

  it('is compatible with normalization for every existing appearance combination', () => {
    let appearances = [{ ...DEFAULT_APPEARANCE }];
    for (const field of APPEARANCE_FIELDS) {
      appearances = appearances.flatMap(appearance => APPEARANCE_OPTIONS[field].map(option => ({ ...appearance, [field]: option.id })));
    }
    for (const appearance of appearances) {
      const result = wearClothing(appearance, 'shirt', owned());
      if (!result.ok) throw new Error('fixture must own shirt');
      expect(normalizeAppearance(result.appearance)).toEqual(result.appearance);
      expect(restoreClothing(result.appearance, result.previous)).toEqual(appearance);
      expect(result.appearance.silhouette).toBe(appearance.silhouette);
      expect(result.appearance.hairStyle).toBe(appearance.hairStyle);
      expect(result.appearance.hairColor).toBe(appearance.hairColor);
    }
  });

  it('keeps acquisition, appearance changes and cancellation separate', () => {
    const assets = new PlayerAssets({ moneyYen: 1000, items: [] });
    // Test transaction only: no product price, seller or acquisition scenario is chosen.
    expect(assets.apply({ moneyDeltaYen: -100, itemDeltas: [{ itemId: 'shirt', quantityDelta: 1 }] })).toEqual({ ok: true });
    const acquired = assets.snapshot();
    const result = wearClothing(before, 'shirt', acquired);
    if (!result.ok) throw new Error('transaction acquired shirt');
    expect(restoreClothing(result.appearance, result.previous)).toEqual(before);
    expect(assets.snapshot()).toEqual(acquired);
    expect(assets.moneyYen).toBe(900);
    assets.removeItem('shirt', 1);
    expect(wearClothing(before, 'shirt', assets.snapshot())).toEqual({ ok: false, reason: 'not-owned' });
    // Undo does not require ownership and does not select a policy for losing worn clothes.
    expect(restoreClothing(result.appearance, result.previous)).toEqual(before);
  });

  it('leaves an old unowned appearance intact and round-trips an explicitly applied clothing change', () => {
    const world = buildWorld();
    const seed = { ...new Game(world).serialize(), appearance: before, assets: { moneyYen: 2480, items: [] } };
    const oldGame = new Game(world, { save: seed });
    expect(oldGame.serialize()).toEqual(seed);
    oldGame.assets.addItem('shirt', 1);
    const result = wearClothing(oldGame.appearance, 'shirt', oldGame.assets.snapshot());
    if (!result.ok) throw new Error('fixture acquired shirt');
    // Demonstrate the existing Game boundary; production UI wiring is not changed.
    oldGame.setAppearance(result.appearance);
    const restored = new Game(world, { save: oldGame.serialize() });
    expect(restored.appearance).toEqual(result.appearance);
    expect(restored.assets.snapshot()).toEqual(oldGame.assets.snapshot());
    restored.setAppearance(restoreClothing(restored.appearance, result.previous));
    expect(restored.appearance).toEqual(before);
  });
});
