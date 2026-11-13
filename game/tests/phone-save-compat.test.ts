import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSave, writeSave } from '../src/app/save-store';
import { positionAt } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { parseSave } from '../src/state/save';
import { buildWorld } from '../src/world';

afterEach(() => vi.unstubAllGlobals());

describe('phone and assets in an existing v1 save', () => {
  it('preserves position, appearance, assets, ownership and data through normal load and save', () => {
    const world = buildWorld();
    const source = new Game(world, { phoneClock: () => 0, phoneEpochClock: () => 100000 });
    source.setAppearance({ ...source.appearance, hairColor: 'black' });
    const seed = { ...source.serialize(), assets: { moneyYen: 2480, items: [{ itemId: 'small-snack', quantity: 2 }] },
      phone: { v: 1 as const, owned: false, dataBudget: { v: 1 as const, remainingMb: 123, capacityMb: 5000 } } };
    let stored = JSON.stringify(seed);
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    const restored = new Game(world, { save: loadSave(world), phoneClock: () => 0, phoneEpochClock: () => 100000 });
    writeSave(restored.serialize());
    const saved = JSON.parse(stored);
    expect(saved.assets).toEqual(seed.assets);
    expect(saved.phone).toEqual(seed.phone);
    expect(restored.player).toEqual(source.player);
    expect(saved.appearance).toEqual(seed.appearance);
  });

  it('repairs only a damaged position and preserves independent fields', () => {
    const world = buildWorld(), source = new Game(world, { phoneClock: () => 0 });
    source.setAppearance({ ...source.appearance, hairColor: 'black' });
    const valid = { ...source.serialize(), assets: { moneyYen: 2480, items: [{ itemId: 'small-snack', quantity: 2 }] },
      phone: { v: 1 as const, owned: false, dataBudget: { v: 1 as const, remainingMb: 123, capacityMb: 5000 } } };
    for (const damage of [{ x: -9999 }, { areaId: 'unknown-area' }, { facing: 'invalid' }, { y: null }]) {
      const restored = new Game(world, { save: { ...valid, ...damage }, phoneClock: () => 0 });
      const saved = restored.serialize();
      expect(restored.player).toEqual(positionAt(world.start));
      expect(saved.assets).toEqual(valid.assets); expect(saved.phone).toEqual(valid.phone);
      expect(saved.appearance).toEqual(valid.appearance);
    }
    expect(parseSave({ ...valid, v: 2 }, world)).toBeNull();
    expect(parseSave({ ...valid, variantId: 'unknown' }, world)).toBeNull();
  });

  it('repairs a corrupt budget without resetting valid ownership, assets or location', () => {
    const world = buildWorld(), source = new Game(world, { phoneClock: () => 0 });
    const raw = { ...source.serialize(), assets: { moneyYen: 2480, items: [{ itemId: 'small-snack', quantity: 2 }] },
      phone: { v: 1, owned: false, dataBudget: { v: 1, remainingMb: 'bad', capacityMb: 5000 } } };
    const restored = new Game(world, { save: raw, phoneClock: () => 0 });
    expect(restored.player).toEqual(source.player);
    expect(restored.assets.snapshot()).toEqual(raw.assets);
    expect(restored.phone.isOwned).toBe(false);
    expect(restored.phone.remainingDataMb).toBe(restored.phone.dataCapacityMb);
  });
});
