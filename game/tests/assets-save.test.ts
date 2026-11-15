import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSave, writeSave } from '../src/app/save-store';
import { DEFAULT_APPEARANCE } from '../src/core/appearance';
import { PROTOTYPE_STARTING_MONEY_YEN } from '../src/data/player-defaults';
import { Game } from '../src/session/game';
import { parseSave } from '../src/state/save';
import { buildWorld } from '../src/world';

const world = buildWorld();
afterEach(() => vi.unstubAllGlobals());

describe('assets in v1 saves', () => {
  it('restores money, item stacks, position and appearance from JSON without sharing state', () => {
    const game = new Game(world);
    game.update(0.1, { dir: 'right', run: false });
    game.setAppearance({ ...DEFAULT_APPEARANCE, hairColor: 'black' });
    game.assets.changeMoney(-100);
    game.assets.addItem('notebook', 2);
    game.assets.addItem('pencil', 3);
    const saved = JSON.parse(JSON.stringify(game.serialize()));
    const restored = new Game(world, { save: saved });
    expect(restored.serialize()).toEqual(saved);
    expect(restored.player).toEqual(game.player);
    expect(restored.appearance).toEqual(game.appearance);
    saved.assets.items[0].quantity = 90;
    expect(restored.assets.quantity('notebook')).toBe(2);
    restored.reset();
    expect(restored.assets.snapshot()).toEqual(game.assets.snapshot());
    expect(restored.appearance).toEqual(game.appearance);
  });

  it('accepts v1 saves with neither assets nor appearance and with appearance alone', () => {
    const { assets: _assets, appearance: _appearance, ...oldest } = new Game(world).serialize();
    for (const raw of [oldest, { ...oldest, appearance: { ...DEFAULT_APPEARANCE, hairColor: 'black' } }]) {
      const restored = new Game(world, { save: raw });
      expect(restored.player).toEqual(new Game(world).player);
      expect(restored.appearance).toEqual('appearance' in raw ? raw.appearance : DEFAULT_APPEARANCE);
      expect(restored.assets.snapshot()).toEqual({ moneyYen: PROTOTYPE_STARTING_MONEY_YEN, items: [] });
    }
  });

  it('preserves position and appearance when asset fields are damaged', () => {
    const game = new Game(world);
    game.setAppearance({ ...DEFAULT_APPEARANCE, hairColor: 'black' });
    const raw = { ...game.serialize(), assets: { moneyYen: -100, items: [
      { itemId: 'notebook', quantity: 2 }, { itemId: 'notebook', quantity: 1 }, { itemId: 'missing', quantity: 1 },
    ] } };
    const restored = new Game(world, { save: raw });
    expect(restored.player).toEqual(game.player);
    expect(restored.appearance).toEqual(game.appearance);
    expect(restored.assets.snapshot()).toEqual({ moneyYen: 0, items: [{ itemId: 'notebook', quantity: 3 }] });
  });

  it('preserves assets and appearance when the position is invalid', () => {
    const game = new Game(world);
    game.assets.changeMoney(-200);
    game.assets.addItem('notebook', 3);
    game.setAppearance({ ...DEFAULT_APPEARANCE, hairColor: 'black' });
    for (const patch of [{ x: -1 }, { facing: 'north' }, { areaId: 'missing' }, { y: null }, { x: Infinity }]) {
      const restored = new Game(world, { save: { ...game.serialize(), ...patch } });
      expect(restored.player).toEqual(new Game(world).player);
      expect(restored.appearance).toEqual(game.appearance);
      expect(restored.assets.snapshot()).toEqual(game.assets.snapshot());
    }
    expect(parseSave({ ...game.serialize(), v: 2 }, world)).toBeNull();
  });

  it('uses the existing localStorage key and tolerates malformed JSON or unavailable storage', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const game = new Game(world);
    game.assets.addItem('notebook', 2);
    game.assets.changeMoney(-300);
    writeSave(game.serialize());
    expect([...values.keys()]).toEqual(['slg-map-save-v1']);
    expect(new Game(world, { save: loadSave(world) }).serialize()).toEqual(game.serialize());
    values.set('slg-map-save-v1', '{broken');
    expect(loadSave(world)).toBeUndefined();
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage full'); },
    });
    expect(loadSave(world)).toBeUndefined();
    expect(() => writeSave(game.serialize())).not.toThrow();
    expect(() => game.update(0.1, { dir: 'right', run: false })).not.toThrow();
  });
});
