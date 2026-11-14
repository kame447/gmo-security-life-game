import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../src/core/appearance';
import { INVENTORY_PROTOTYPE } from '../src/data/inventory-config';
import { LifeState } from '../src/events/life-state';
import { Game } from '../src/session/game';
import { parseSave } from '../src/state/save';
import { PHONE_BUDGET_PROTOTYPE } from '../src/phone/budget-config';
import { buildWorld } from '../src/world';

const world = buildWorld();
const life = new LifeState();
life.apply([{ kind: 'stat', stat: 'friendship', add: 3 }, { kind: 'flag', flag: 'met-family' }]);
life.record('sample.tablet-ad', 'ask-family');
life.record('sample.park-play', null);

function seed() {
  return { ...new Game(world).serialize(), appearance: { ...DEFAULT_APPEARANCE, hairColor: 'black' as const },
    assets: { moneyYen: 2480, items: [{ itemId: 'pencil', quantity: 3 }],
      layout: { v: 1,
        bag: Array.from({ length: INVENTORY_PROTOTYPE.columns * INVENTORY_PROTOTYPE.bagRows }, (_, i) => i === 0 ? 'pencil' : null),
        hotbar: Array<null>(INVENTORY_PROTOTYPE.hotbarSlots).fill(null), selectedHotbar: 0 } },
    phone: { v: 1, owned: false, dataBudget: { v: 1, remainingMb: 123.75, capacityMb: 5000 },
      chat: { v: 1, contacts: [{ id: 'family', name: '家族', icon: 'person' }], threads: [{ id: 'family', contactId: 'family',
        messages: [{ id: 'event-1', from: 'family', text: 'またね', atMs: 5, read: false }],
        pending: [{ id: 'reply-2', from: 'family', text: 'おかえり', remainingMs: 450 }], nextSequence: 1, replyCursor: 2 }] } },
    life: life.toJSON(), future: { v: 2, nested: [{ value: false }, null] } };
}

describe('v1 save preservation at the shared codec', () => {
  it('retains event history, layout and bounded JSON extensions alongside current fields', () => {
    const saved = seed();
    const restored = parseSave(JSON.parse(JSON.stringify(saved)), world);
    expect(restored).toEqual(saved);
    expect(JSON.parse(JSON.stringify(restored))).toEqual(saved);
    expect(parseSave(restored, world)).toEqual(saved);
  });

  it('pads short legacy slot arrays while preserving every other saved field and the input bytes', () => {
    const expected = seed();
    const legacy = { ...expected, assets: { ...expected.assets,
      layout: { ...expected.assets.layout, bag: ['pencil', null], hotbar: [null] } } };
    const original = JSON.stringify(legacy);
    expect(parseSave(legacy, world)).toEqual(expected);
    expect(JSON.stringify(legacy)).toBe(original);
  });

  it('repairs only damaged known fields and never mutates the original', () => {
    const saved = seed();
    const damaged = { ...saved, areaId: 'missing', x: -1, assets: { ...saved.assets, moneyYen: -4 },
      phone: { ...saved.phone, dataBudget: { v: 1, remainingMb: -1, capacityMb: 5000 } } };
    const before = structuredClone(damaged);
    expect(parseSave(damaged, world)).toEqual({ ...saved, ...new Game(world).player,
      assets: { ...saved.assets, moneyYen: 0 },
      phone: { ...saved.phone, dataBudget: { v: 1, remainingMb: 5000, capacityMb: 5000 } } });
    expect(damaged).toEqual(before);
  });

  it('keeps unknown life versions opaque and rejects future versions of owned codecs', () => {
    const saved = { ...seed(), life: { v: 7, progression: ['unknown-event'] } };
    expect(parseSave(saved, world)).toEqual(saved);
    expect(parseSave({ ...saved, phone: { v: 3, ownership: 'borrowed' } }, world)).toBeNull();
    expect(parseSave({ ...saved, phone: { ...saved.phone, chat: { v: 2 } } }, world)).toBeNull();
  });

  it('returns detached extension data', () => {
    const saved = seed();
    const parsed = parseSave(saved, world) as unknown as ReturnType<typeof seed>;
    expect(parsed).toEqual(saved);
    parsed.life.history[0].eventId = 'mutated';
    parsed.assets.layout.bag[0] = null;
    expect(saved.life.history[0].eventId).toBe('sample.tablet-ad');
    expect(saved.assets.layout.bag[0]).toBe('pencil');
  });

  it.each([undefined, NaN, Infinity, new Map([['progress', 1]]), new Set([1]), new Date(), () => 1])
  ('rejects extensions JSON would omit or change: %s', future => {
    expect(parseSave({ ...seed(), future }, world)).toBeNull();
  });

  it('rejects cycles, sparse arrays and accessors without invoking them', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(parseSave({ ...seed(), future: cycle }, world)).toBeNull();
    expect(parseSave({ ...seed(), future: Array(2) }, world)).toBeNull();
    let reads = 0;
    const future = Object.defineProperty({}, 'value', { enumerable: true, get() { reads++; return 1; } });
    expect(parseSave({ ...seed(), future }, world)).toBeNull();
    expect(reads).toBe(0);
    const symbol = { [Symbol('private')]: 1 };
    expect(parseSave({ ...seed(), future: symbol }, world)).toBeNull();
  });

  it('enforces a caller-supplied UTF-8 boundary without discarding unknown data to fit', () => {
    const saved = { ...seed(), future: '日本語😀' };
    const size = new TextEncoder().encode(JSON.stringify(saved)).length;
    expect(parseSave(saved, world, true, PHONE_BUDGET_PROTOTYPE, { maxBytes: size })).toEqual(saved);
    expect(parseSave(saved, world, true, PHONE_BUDGET_PROTOTYPE, { maxBytes: size - 1 })).toBeNull();
    expect(parseSave(saved, world, true, PHONE_BUDGET_PROTOTYPE, { maxBytes: NaN })).toBeNull();
  });

  it('rejects excessive nesting and safely keeps JSON keys named __proto__', () => {
    let nested: unknown = null;
    for (let i = 0; i < 70; i++) nested = { value: nested };
    expect(parseSave({ ...seed(), future: nested }, world)).toBeNull();
    const saved = { ...seed(), future: JSON.parse('{"__proto__":{"polluted":true}}') };
    expect(parseSave(saved, world)).toEqual(saved);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });

  it('does not revive invalid known clock metadata while retaining unknown budget members', () => {
    const saved = seed();
    const raw = { ...saved, phone: { ...saved.phone, dataBudget: { ...saved.phone.dataBudget,
      savedAtEpochMs: -1, activeAtSave: 'invalid', futurePolicy: { v: 2 } } } };
    expect(parseSave(raw, world)).toEqual({ ...saved, phone: { ...saved.phone,
      dataBudget: { ...saved.phone.dataBudget, futurePolicy: { v: 2 } } } });
    const { life: _life, future: _future, ...legacy } = saved;
    const parsed = parseSave(legacy, world)!;
    expect(Object.hasOwn(parsed, 'life')).toBe(false);
    expect(Object.hasOwn(parsed, 'future')).toBe(false);
  });
});
