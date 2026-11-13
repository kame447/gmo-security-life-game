import { describe, expect, it } from 'vitest';
import { BagModel, bagCategory, bagIcon } from '../src/ui/bag-model';
import { getItemDefinition } from '../src/data/items';

const assets = { moneyYen: 700, items: [
  { itemId: 'notebook', quantity: 3 }, { itemId: 'pencil', quantity: 2 }, { itemId: 'bottled-water', quantity: 1 },
] };
describe('bag selection without asset changes', () => {
  it('filters real categories and keeps a selected item when it remains visible', () => {
    const model = new BagModel();
    model.setAssets(assets);
    expect(model.selectedId).toBe('notebook');
    expect(model.entries().length).toBe(3);
    model.select('pencil');
    model.selectCategory('stationery');
    expect(model.selectedId).toBe('pencil');
    expect(model.entries().map(entry => entry.item.id)).toEqual(['notebook', 'pencil']);
    model.selectCategory('drink');
    expect(model.selectedId).toBe('bottled-water');
    expect(model.selected?.quantity).toBe(1);
  });
  it('clears stale details for an empty pocket and chooses a valid item on return', () => {
    const model = new BagModel();
    model.setAssets(assets);
    model.selectCategory('other');
    expect(model.entries()).toEqual([]);
    expect(model.selectedId).toBeNull();
    expect(model.selected).toBeUndefined();
    model.selectCategory('all');
    expect(model.selectedId).toBe('notebook');
    model.setAssets({ moneyYen: 0, items: [] });
    expect(model.selectedId).toBeNull();
  });
  it('moves within visible slots, bounds selection and ignores unknown selections', () => {
    const model = new BagModel();
    model.setAssets(assets);
    model.move(1); expect(model.selectedId).toBe('pencil');
    model.move(4); expect(model.selectedId).toBe('bottled-water');
    model.move(-4); expect(model.selectedId).toBe('notebook');
    model.select('missing'); expect(model.selectedId).toBe('notebook');
    model.selectCategory('other');
    model.move(1); expect(model.selectedId).toBeNull();
  });
  it('refreshes quantities and removes a stale selection without changing caller assets', () => {
    const before = structuredClone(assets), model = new BagModel();
    model.setAssets(assets);
    model.select('pencil');
    model.setAssets({ moneyYen: 700, items: [{ itemId: 'notebook', quantity: 9 }] });
    expect(model.selectedId).toBe('notebook');
    expect(model.selected?.quantity).toBe(9);
    expect(assets).toEqual(before);
  });
  it('gives new item categories a readable pocket and a code-drawn fallback icon', () => {
    const sample = { ...getItemDefinition('notebook')!, id: 'future', category: 'future' };
    expect(bagCategory(sample)).toBe('other');
    expect(bagIcon(sample)).toBe('pouch');
    expect(bagIcon({ ...sample, category: 'snack' })).toBe('snack');
    expect(bagIcon(getItemDefinition('pencil')!)).toBe('pencil');
    expect(bagIcon(getItemDefinition('bottled-water')!)).toBe('water');
  });
});
