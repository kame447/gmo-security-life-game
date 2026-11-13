import { describe, expect, it } from 'vitest';
import { HotbarModel, type BagItem } from '../src/ui/bag-hotbar/model';

const item = (id: string, group: BagItem['group'] = 'normal', quantity = 1): BagItem =>
  ({ id, name: id, description: '', group, quantity });

describe('review quick bar', () => {
  it('selects items within the current group and keeps important items distinct', () => {
    const model = new HotbarModel([item('a'), item('b'), item('key', 'important')]);
    expect(model.selectedItem?.id).toBe('a');
    model.moveSelection(1, 0);
    expect(model.selectedItem?.id).toBe('b');
    expect(model.selectItem('key')).toBe(false);
    model.setGroup('important');
    expect(model.selectedItem?.id).toBe('key');
    model.setGroup('normal');
    expect(model.selectedItem?.id).toBe('a');
  });

  it('assigns and removes references without changing the owned quantities', () => {
    const items = [item('a', 'normal', 3), item('b')];
    const model = new HotbarModel(items);
    expect(model.assignSelected(3)).toBe(true);
    expect(model.slots.map(slot => slot?.id)).toEqual([undefined, 'b', undefined, 'a', undefined]);
    expect(model.slots[3]?.quantity).toBe(3);
    model.clearSelectedSlot();
    expect(model.slots[3]).toBeNull();
    expect(items[0].quantity).toBe(3);
    expect(model.assignSelected(10)).toBe(false);
  });

  it('drops a stale slot after a quantity reaches zero and selects a remaining item', () => {
    const model = new HotbarModel([item('a'), item('b')]);
    model.sync([item('a', 'normal', 0), item('b', 'normal', 2)]);
    expect(model.slots[0]).toBeNull();
    expect(model.slots[1]?.quantity).toBe(2);
    expect(model.selectedItem?.id).toBe('b');
    model.sync([]);
    expect(model.selectedItem).toBeUndefined();
    expect(model.assignSelected(0)).toBe(false);
  });
});
