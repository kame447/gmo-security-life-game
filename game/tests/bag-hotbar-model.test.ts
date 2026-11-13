import { describe, expect, it } from 'vitest';
import { PlayerAssets } from '../src/state/assets';
import { HotbarModel } from '../src/ui/bag-hotbar/model';
const make = () => {
  const assets = new PlayerAssets({ moneyYen: 1000, items: [{ itemId: 'notebook', quantity: 2 }, { itemId: 'pencil', quantity: 12 }] });
  return { assets, model: new HotbarModel(assets) };
};
describe('inventory cursor and move interaction', () => {
  it('moves a whole stack with two activations instead of registering a shortcut', () => {
    const { assets, model } = make(); model.activate({ section: 'bag', index: 0 });
    expect(model.carrying).toEqual({ section: 'bag', index: 0 });
    expect(model.view.bag[0]?.itemId).toBe('notebook');
    model.activate({ section: 'hotbar', index: 2 });
    expect(model.carrying).toBeNull(); expect(model.view.bag[0]).toBeNull();
    expect(model.view.hotbar[2]).toEqual({ itemId: 'notebook', quantity: 2 });
    expect(assets.inventoryLayout.selectedHotbar).toBe(2);
  });
  it('cancels a pending move without changing any asset and rejects a stale emptied source', () => {
    const { assets, model } = make(); const before = assets.snapshot();
    model.startMove({ section: 'bag', index: 0 }); model.cancelMove();
    expect(assets.snapshot()).toEqual(before);
    model.startMove({ section: 'bag', index: 0 }); assets.removeItem('notebook', 2);
    expect(model.finishMove({ section: 'hotbar', index: 0 })).toEqual({ ok: false, reason: 'empty-slot' });
    expect(model.view.hotbar[0]).toBeNull(); expect(assets.quantity('notebook')).toBe(0);
  });
  it('navigates from the backpack to the same selected hotbar slot shown by assets', () => {
    const { assets, model } = make(); model.focus({ section: 'bag', index: 12 }); model.moveSelection(0, 1);
    expect(model.selection).toEqual({ section: 'hotbar', index: 2 });
    expect(assets.inventoryLayout.selectedHotbar).toBe(2);
    model.moveSelection(-1, 0); expect(assets.inventoryLayout.selectedHotbar).toBe(1);
    expect(model.selectHotbar(9)).toBe(false);
  });
});
