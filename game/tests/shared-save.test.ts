import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSave, writeSave } from '../src/app/save-store';
import { DEFAULT_APPEARANCE } from '../src/core/appearance';
import { PHONE_BUDGET_PROTOTYPE } from '../src/phone/budget-config';
import { Game } from '../src/session/game';
import { parseSave } from '../src/state/save';
import { buildWorld } from '../src/world';

const world = buildWorld();
const seed = () => ({ ...new Game(world).serialize(),
  appearance: { ...DEFAULT_APPEARANCE, hairColor: 'black' as const },
  assets: { moneyYen: 2480, items: [{ itemId: 'small-snack', quantity: 2 }] },
  phone: { v: 1 as const, owned: false, dataBudget: { v: 1 as const, remainingMb: 123, capacityMb: 5000 } },
});
afterEach(() => vi.unstubAllGlobals());

describe('shared v1 save preservation without a phone UI', () => {
  it.each([false, true])('keeps phone owned=%s, budget, assets, appearance and position through the real storage path', owned => {
    const saved = seed(); saved.phone.owned = owned;
    let stored = JSON.stringify(saved);
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    const game = new Game(world, { save: loadSave(world) });
    writeSave(game.serialize());
    expect(JSON.parse(stored)).toEqual(saved);
    // Neither a reset nor mutation of a returned save may lose the retained DTO.
    const exported = game.serialize();
    exported.phone!.owned = !owned;
    exported.phone!.dataBudget.remainingMb = 0;
    game.reset();
    writeSave(game.serialize());
    expect(JSON.parse(stored)).toEqual(saved);
  });

  it.each([{ x: -9999 }, { areaId: 'missing-area' }, { facing: 'north' }])('repairs only the position for %s', patch => {
    const saved = seed();
    const restored = new Game(world, { save: { ...saved, ...patch } });
    expect(restored.player).toEqual(new Game(world).player);
    expect(restored.serialize()).toEqual(saved);
  });

  it('repairs a damaged budget without changing ownership, assets or appearance', () => {
    const saved = seed();
    const raw = { ...saved, phone: { ...saved.phone, dataBudget: { v: 1, remainingMb: -1, capacityMb: 5000 } } };
    const result = new Game(world, { save: raw }).serialize();
    expect(result.phone).toEqual({ v: 1, owned: false, dataBudget: { v: 1, remainingMb: 5000, capacityMb: 5000 } });
    expect(result.assets).toEqual(saved.assets);
    expect(result.appearance).toEqual(saved.appearance);
    const damagedAssets = new Game(world, { save: { ...saved, assets: { moneyYen: -1, items: [] } } }).serialize();
    expect(damagedAssets.phone).toEqual(saved.phone);
    expect(damagedAssets.assets).toEqual({ moneyYen: 0, items: [] });
  });

  it('accepts legacy missing-phone and owned-only saves, including configured initial ownership', () => {
    const { phone: _phone, ...legacy } = seed();
    expect(new Game(world, { save: legacy, initialPhoneOwned: false }).serialize().phone)
      .toEqual({ v: 1, owned: false, dataBudget: { v: 1, remainingMb: 5000, capacityMb: 5000 } });
    const ownedOnly = new Game(world, { save: { ...legacy, phone: { v: 1, owned: false } } }).serialize();
    expect(ownedOnly.phone?.owned).toBe(false);
    expect(ownedOnly.assets).toEqual(legacy.assets);
    expect(parseSave({ ...legacy, v: 2 }, world)).toBeNull();
    expect(parseSave({ ...legacy, variantId: 'unsupported' }, world)).toBeNull();
  });

  it('preserves fractional budgets and optional epoch metadata using the same configured capacity', () => {
    const config = { ...PHONE_BUDGET_PROTOTYPE, capacityMb: 1234 };
    const saved = { ...seed(), phone: { v: 1, owned: false,
      dataBudget: { v: 1, remainingMb: 123.75, capacityMb: 1234, savedAtEpochMs: 1000, activeAtSave: true } } };
    const game = new Game(world, { save: saved, phoneDataConfig: config });
    expect(game.serialize()).toEqual(saved);
    expect(new Game(world, { save: game.serialize(), phoneDataConfig: config }).serialize()).toEqual(saved);
  });

  it('uses the same custom settings in loadSave before Game can normalize a large budget', () => {
    const config = { ...PHONE_BUDGET_PROTOTYPE, capacityMb: 9000 };
    const saved = { ...seed(), phone: { v: 1, owned: false,
      dataBudget: { v: 1, remainingMb: 7500, capacityMb: 9000 } } };
    let stored = JSON.stringify(saved);
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    const options = { initialPhoneOwned: false, phoneDataConfig: config };
    const game = new Game(world, { ...options, save: loadSave(world, options) });
    writeSave(game.serialize());
    expect(JSON.parse(stored)).toEqual(saved);
    const { phone: _phone, ...legacy } = saved;
    stored = JSON.stringify(legacy);
    const restored = new Game(world, { ...options, save: loadSave(world, options) });
    expect(restored.serialize().phone).toEqual({ v: 1, owned: false,
      dataBudget: { v: 1, remainingMb: 9000, capacityMb: 9000 } });
  });
});
