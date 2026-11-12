import { describe, expect, it } from 'vitest';
import { APPEARANCE_FIELDS, APPEARANCE_OPTIONS, DEFAULT_APPEARANCE, appearanceKey, normalizeAppearance } from '../src/core/appearance';

describe('appearance data contract', () => {
  it('offers valid, unique choices and a supported default for every field', () => {
    expect(APPEARANCE_FIELDS).toEqual(['silhouette', 'hairStyle', 'hairColor', 'outfit', 'outfitColor']);
    for (const field of APPEARANCE_FIELDS) {
      const options = APPEARANCE_OPTIONS[field];
      expect(new Set(options.map(o => o.id)).size).toBe(options.length);
      expect(options.some(o => o.id === DEFAULT_APPEARANCE[field])).toBe(true);
      for (const option of options) {
        expect(option.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
        expect(option.name.length).toBeGreaterThan(0);
        expect(normalizeAppearance({ [field]: option.id })[field]).toBe(option.id);
      }
    }
  });

  it('uses independent defaults for missing and invalid input', () => {
    for (const raw of [null, undefined, false, 1, '', [], {}]) {
      expect(normalizeAppearance(raw)).toEqual(DEFAULT_APPEARANCE);
    }
    const result = normalizeAppearance(null);
    result.hairColor = 'black';
    expect(normalizeAppearance(null).hairColor).toBe(DEFAULT_APPEARANCE.hairColor);
  });

  it('keeps each valid field while replacing unknown or wrongly typed fields', () => {
    expect(normalizeAppearance({ silhouette: 'type-b', hairStyle: 'missing', hairColor: 'black',
      outfit: null, outfitColor: 42, extra: 'ignored' })).toEqual({
      ...DEFAULT_APPEARANCE, silhouette: 'type-b', hairColor: 'black',
    });
  });

  it('uses stable keys independent of property order and different keys for every combination', () => {
    const reordered = Object.fromEntries(Object.entries(DEFAULT_APPEARANCE).reverse());
    expect(appearanceKey(reordered as typeof DEFAULT_APPEARANCE)).toBe(appearanceKey(DEFAULT_APPEARANCE));
    let combinations = [{ ...DEFAULT_APPEARANCE }];
    for (const field of APPEARANCE_FIELDS) {
      combinations = combinations.flatMap(a => APPEARANCE_OPTIONS[field].map(o => ({ ...a, [field]: o.id })));
    }
    expect(new Set(combinations.map(appearanceKey)).size).toBe(combinations.length);
  });
});
