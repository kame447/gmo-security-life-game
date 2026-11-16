import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerAssets } from '../src/state/assets';
import { HotbarModel } from '../src/ui/bag-hotbar/model';
import { HotbarPanel } from '../src/ui/bag-hotbar/panel';

class FakeElement {
  readonly dataset: Record<string, string> = {};
}
class FakeButton extends FakeElement {}

afterEach(() => vi.unstubAllGlobals());

describe('HotbarPanel keyboard repeat guard', () => {
  it('suppresses repeated Enter/Space keydown on focused buttons so holding does not toggle moves', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('HTMLButtonElement', FakeButton);
    const assets = new PlayerAssets({ moneyYen: 1000, items: [{ itemId: 'notebook', quantity: 2 }] });
    const model = new HotbarModel(assets);
    const panel = Object.create(HotbarPanel.prototype) as {
      opened: boolean;
      model: HotbarModel;
      change(action: () => unknown): void;
      handleKey(event: KeyboardEvent): void;
    };
    panel.opened = true;
    panel.model = model;
    panel.change = action => { action(); };

    const slotButton = new FakeButton();
    slotButton.dataset.section = 'bag';
    slotButton.dataset.index = '0';

    for (const code of ['Enter', 'Space']) {
      const initialPrevent = vi.fn();
      panel.handleKey({ code, repeat: false, target: slotButton, preventDefault: initialPrevent } as unknown as KeyboardEvent);
      expect(initialPrevent).not.toHaveBeenCalled();

      const repeatPrevent = vi.fn();
      panel.handleKey({ code, repeat: true, target: slotButton, preventDefault: repeatPrevent } as unknown as KeyboardEvent);
      expect(repeatPrevent).toHaveBeenCalledOnce();
    }

    const container = new FakeElement();
    const first = vi.fn();
    panel.handleKey({ code: 'Enter', repeat: false, target: container, preventDefault: first } as unknown as KeyboardEvent);
    expect(first).toHaveBeenCalledOnce();
    expect(model.carrying).toEqual({ section: 'bag', index: 0 });

    const repeated = vi.fn();
    panel.handleKey({ code: 'Enter', repeat: true, target: container, preventDefault: repeated } as unknown as KeyboardEvent);
    expect(repeated).toHaveBeenCalledOnce();
    expect(model.carrying).toEqual({ section: 'bag', index: 0 });
  });
});
