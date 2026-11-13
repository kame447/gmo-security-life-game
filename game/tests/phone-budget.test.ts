import { describe, expect, it } from 'vitest';
import { PhoneDataBudget, isHomeLocation, parsePhoneDataSave, type PhoneUsageContext } from '../src/phone/budget';
import { PHONE_BUDGET_PROTOTYPE, type PhoneBudgetConfig } from '../src/phone/budget-config';
import { parsePhoneSave } from '../src/phone/model';
import { buildWorld } from '../src/world';

const config = (patch: Partial<PhoneBudgetConfig> = {}): PhoneBudgetConfig => ({ ...PHONE_BUDGET_PROTOTYPE,
  capacityMb: 100, consumptionMbPerSecond: 1, ...patch });
const outside: PhoneUsageContext = { owned: true, open: true, areaId: 'town-main', areaKind: 'outdoor', paused: false, visible: true };
const home: PhoneUsageContext = { ...outside, areaId: 'home-family-interior', areaKind: 'indoor', facilityId: 'home-family' };

describe('phone data budget timing and context boundaries', () => {
  it('references existing home area/facility IDs without changing world data', () => {
    const world = buildWorld(), before = structuredClone(world);
    for (const id of PHONE_BUDGET_PROTOTYPE.homeAreaIds) expect(world.areas.get(id)?.def.kind).toBe('indoor');
    for (const id of PHONE_BUDGET_PROTOTYPE.homeFacilityIds) expect(world.facilities.has(id)).toBe(true);
    expect(world).toEqual(before);
  });
  it('classifies configured home interiors without granting other stores or the outdoor doorstep free usage', () => {
    expect(isHomeLocation(home)).toBe(true);
    expect(isHomeLocation({ ...outside, facilityId: 'home-family' })).toBe(false);
    expect(isHomeLocation({ ...home, areaId: 'other-home-room' })).toBe(true);
    expect(isHomeLocation({ ...home, areaId: 'shop-konbini-interior', facilityId: 'shop-konbini' })).toBe(false);
    expect(isHomeLocation({ ...home, areaId: 'another-room', facilityId: undefined })).toBe(false);
  });
  it('settles outside usage before home entry and starts charging only after leaving home', () => {
    const budget = new PhoneDataBudget(config());
    budget.update(0, home); budget.update(10_000, home);
    expect(budget.remainingMb).toBe(100);
    budget.update(10_000, outside); budget.update(12_000, home);
    expect(budget.remainingMb).toBe(98);
    budget.update(20_000, outside); budget.update(21_000, outside);
    expect(budget.remainingMb).toBe(97);
  });
  it('charges the preceding open interval once when closing, revoking ownership or switching panels', () => {
    const budget = new PhoneDataBudget(config());
    budget.update(0, { ...outside, open: false }); budget.update(1000, outside);
    budget.update(2000, { ...outside, open: false }); // dialog / another panel
    budget.update(9000, outside); budget.update(10_000, { ...outside, owned: false });
    budget.update(20_000, { ...outside, owned: false });
    expect(budget.remainingMb).toBe(98);
    budget.update(20_000, outside); budget.update(20_000, { ...outside, open: false });
    expect(budget.remainingMb).toBe(98);
  });
  it.each([1, 15, 30, 60, 144])('produces the same balance at %s updates per second', fps => {
    const budget = new PhoneDataBudget(config({ consumptionMbPerSecond: 0.7 }));
    budget.update(0, outside);
    for (let n = 1; n <= fps * 10; n++) budget.update(n * 1000 / fps, outside);
    expect(budget.remainingMb).toBe(93);
  });
  it('ignores paused and hidden intervals by default, including transitions without intervening frames', () => {
    const budget = new PhoneDataBudget(config());
    budget.update(0, outside); budget.update(1000, { ...outside, paused: true });
    budget.update(11_000, outside); budget.update(12_000, { ...outside, visible: false });
    budget.update(22_000, outside); budget.update(23_000, outside);
    expect(budget.remainingMb).toBe(97);
  });
  it('can count paused and hidden intervals when those provisional settings are enabled', () => {
    const budget = new PhoneDataBudget(config({ pausedUsage: 'consume', hiddenUsage: 'consume' }));
    budget.update(0, { ...outside, paused: true, visible: false });
    budget.update(5000, outside);
    expect(budget.remainingMb).toBe(95);
  });
  it('rejects invalid/backwards timestamps and does not charge duplicate event samples', () => {
    const budget = new PhoneDataBudget(config());
    budget.update(1000, outside); budget.update(2000, outside);
    for (const time of [NaN, Infinity, -1, 0, 1500]) budget.update(time, home);
    budget.update(2000, outside); budget.update(3000, outside);
    expect(budget.remainingMb).toBe(98);
  });
  it('skips a discontinuity under the default policy and can instead consume the complete gap', () => {
    for (const largeGapUsage of ['ignore', 'consume'] as const) {
      const budget = new PhoneDataBudget(config({ largeGapUsage }));
      budget.update(0, outside); budget.update(1000, outside); budget.update(100_000, outside);
      expect(budget.remainingMb).toBe(largeGapUsage === 'ignore' ? 99 : 0);
      budget.update(101_000, outside);
      expect(budget.remainingMb).toBe(largeGapUsage === 'ignore' ? 98 : 0);
    }
  });
  it('clamps to zero and exposes the configured exhaustion effect without closing the phone', () => {
    for (const exhaustion of ['none', 'block-network'] as const) {
      const budget = new PhoneDataBudget(config({ exhaustion, largeGapUsage: 'consume' }));
      budget.update(0, outside); budget.update(1_000_000, outside);
      expect(budget.remainingMb).toBe(0);
      expect(budget.networkAllowed).toBe(exhaustion === 'none');
      expect(outside.open).toBe(true);
    }
  });
  it('settles before explicit recovery and makes home-entry recovery a separate optional policy', () => {
    const budget = new PhoneDataBudget(config());
    budget.update(0, outside); budget.replenish(5000, outside, 2);
    expect(budget.remainingMb).toBe(97);
    budget.update(6000, outside); expect(budget.remainingMb).toBe(96);
    budget.update(7000, home); expect(budget.remainingMb).toBe(95);
    budget.replenish(8000, home); expect(budget.remainingMb).toBe(100);
    const automatic = new PhoneDataBudget(config({ recovery: 'on-home-entry' }), { v: 1, remainingMb: 0 });
    automatic.update(0, home); expect(automatic.remainingMb).toBe(0); // Loading at home is not an arrival event.
    automatic.update(1, outside); automatic.update(2, home); expect(automatic.remainingMb).toBe(100);
  });
});

describe('nested phone budget save and resume', () => {
  it.each([undefined, null, [], {}, { v: 2, remainingMb: 1 }, { v: 1, remainingMb: -1 },
    { v: 1, remainingMb: NaN }, { v: 1, remainingMb: Infinity }, { v: 1, remainingMb: '2' }])('repairs only the damaged/legacy budget field: %j', raw => {
    const envelope = { v: 1, owned: false, dataBudget: raw };
    expect(parsePhoneSave(envelope, true).owned).toBe(false);
    expect(parsePhoneDataSave(envelope.dataBudget, config())).toEqual({ v: 1, remainingMb: 100, capacityMb: 100 });
  });
  it('preserves zero, clamps to the current configured capacity and detaches snapshots', () => {
    expect(parsePhoneDataSave({ v: 1, remainingMb: 0, capacityMb: 500 }, config()).remainingMb).toBe(0);
    expect(parsePhoneDataSave({ v: 1, remainingMb: 200, capacityMb: 500 }, config()).remainingMb).toBe(100);
    const budget = new PhoneDataBudget(config());
    const snapshot = budget.save(); snapshot.remainingMb = 0;
    expect(budget.remainingMb).toBe(100);
  });
  it('restores the saved amount with a new session clock and does not charge time with the game closed by default', () => {
    const original = new PhoneDataBudget(config());
    original.update(10_000, outside); original.update(15_000, outside);
    const saved = JSON.parse(JSON.stringify(original.save(1_000_000)));
    const restored = new PhoneDataBudget(config(), saved, 99_000_000);
    expect(restored.remainingMb).toBe(95);
    restored.update(0, { ...outside, open: false }); restored.update(20_000, outside);
    expect(restored.remainingMb).toBe(95);
    restored.update(21_000, outside); expect(restored.remainingMb).toBe(94);
  });
  it('counts offline time only when explicitly enabled and a valid active wall-clock pair was saved', () => {
    const settings = config({ offlineUsage: 'consume-if-active' });
    const original = new PhoneDataBudget(settings);
    original.update(0, outside);
    const saved = original.save(1_000_000);
    expect(new PhoneDataBudget(settings, saved, 1_002_000).remainingMb).toBe(98);
    expect(new PhoneDataBudget(settings, saved, 999_000).remainingMb).toBe(100);
    expect(new PhoneDataBudget(settings, original.save(), 1_002_000).remainingMb).toBe(100);
    original.update(1000, { ...outside, paused: true });
    expect(new PhoneDataBudget(settings, original.save(1_001_000), 1_010_000).remainingMb).toBe(99);
  });
  it('keeps config inputs detached and refuses invalid rates or recovery without changing the balance', () => {
    const settings = config({ homeAreaIds: ['home-family-interior'] });
    const budget = new PhoneDataBudget(settings);
    (settings.homeAreaIds as string[])[0] = 'town-main';
    budget.update(0, outside); budget.update(1000, outside);
    expect(budget.remainingMb).toBe(99);
    for (const consumptionMbPerSecond of [-1, NaN, Infinity]) expect(() => new PhoneDataBudget(config({ consumptionMbPerSecond }))).toThrow();
    for (const amount of [-1, NaN, Infinity]) expect(() => budget.replenish(2000, outside, amount)).toThrow();
    expect(budget.remainingMb).toBe(99);
  });
});
