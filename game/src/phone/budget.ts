/** Clock-explicit domain logic: no DOM, timers, storage, game mutation or external communication. */
import { PHONE_BUDGET_PROTOTYPE, type PhoneBudgetConfig } from './budget-config';

export interface PhoneUsageContext {
  owned: boolean;
  open: boolean;
  areaId: string;
  areaKind: 'indoor' | 'outdoor';
  /** A resolved interior facility, not a nearby outdoor building. */
  facilityId?: string;
  paused: boolean;
  visible: boolean;
}
export interface PhoneDataSave {
  v: 1;
  remainingMb: number;
  capacityMb: number;
  /** Optional wall-clock pair, used only by the explicitly enabled offline policy. */
  savedAtEpochMs?: number;
  activeAtSave?: boolean;
}

const timeValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const clamp = (value: number, capacity: number) => Math.max(0, Math.min(capacity, value));

function checkedConfig(input: Readonly<PhoneBudgetConfig>): Readonly<PhoneBudgetConfig> {
  if (!Number.isFinite(input.capacityMb) || input.capacityMb <= 0 || input.capacityMb > Number.MAX_SAFE_INTEGER ||
      !Number.isFinite(input.consumptionMbPerSecond) || input.consumptionMbPerSecond < 0 ||
      !Number.isFinite(input.largeGapMs) || input.largeGapMs <= 0 ||
      !Array.isArray(input.homeAreaIds) || !Array.isArray(input.homeFacilityIds) ||
      ![...input.homeAreaIds, ...input.homeFacilityIds].every(id => typeof id === 'string' && !!id) ||
      !['ignore', 'consume'].includes(input.pausedUsage) || !['ignore', 'consume'].includes(input.hiddenUsage) ||
      !['ignore', 'consume-if-active'].includes(input.offlineUsage) ||
      !['manual', 'on-home-entry'].includes(input.recovery) || !['none', 'block-network'].includes(input.exhaustion) ||
      !['ignore', 'consume'].includes(input.largeGapUsage)) throw new Error('Invalid phone data budget configuration');
  return Object.freeze({ ...input, homeAreaIds: Object.freeze([...input.homeAreaIds]), homeFacilityIds: Object.freeze([...input.homeFacilityIds]) });
}

export function isHomeLocation(context: Pick<PhoneUsageContext, 'areaId' | 'areaKind' | 'facilityId'>,
  config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE): boolean {
  return context.areaKind === 'indoor' && (config.homeAreaIds.includes(context.areaId) ||
    (!!context.facilityId && config.homeFacilityIds.includes(context.facilityId)));
}

/** Repairs this nested field only. The caller retains phone ownership and the rest of the save. */
export function parsePhoneDataSave(raw: unknown, config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE): PhoneDataSave {
  const settings = checkedConfig(config);
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Partial<PhoneDataSave> : {};
  const remainingMb = value.v === 1 && timeValue(value.remainingMb) ? clamp(value.remainingMb, settings.capacityMb) : settings.capacityMb;
  return { v: 1, remainingMb, capacityMb: settings.capacityMb,
    ...(value.v === 1 && timeValue(value.savedAtEpochMs) && typeof value.activeAtSave === 'boolean'
      ? { savedAtEpochMs: value.savedAtEpochMs, activeAtSave: value.activeAtSave } : {}) };
}

/**
 * update settles the interval under the PREVIOUS context, then installs the new context.
 * Call at open/close, ownership, area, pause and visibility boundaries, as well as on frames.
 * nowMs is a monotonic session clock. Epoch timestamps are accepted only by save/restore.
 */
export class PhoneDataBudget {
  readonly config: Readonly<PhoneBudgetConfig>;
  private remaining: number;
  private lastTime: number | null = null;
  private active = false;
  private home: boolean | null = null;
  private anchorTime = 0;
  private anchorBalance = 0;

  constructor(config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE, rawSave?: unknown, restoreEpochMs?: number) {
    this.config = checkedConfig(config);
    const saved = parsePhoneDataSave(rawSave, this.config);
    this.remaining = saved.remainingMb;
    if (this.config.offlineUsage === 'consume-if-active' && saved.activeAtSave === true &&
        timeValue(saved.savedAtEpochMs) && timeValue(restoreEpochMs) && restoreEpochMs >= saved.savedAtEpochMs) {
      this.remaining = clamp(this.remaining - (restoreEpochMs - saved.savedAtEpochMs) / 1000 * this.config.consumptionMbPerSecond, this.config.capacityMb);
    }
    // Open/context/monotonic-clock state is transient, even when the offline policy is enabled.
  }

  get remainingMb(): number { return this.remaining; }
  get capacityMb(): number { return this.config.capacityMb; }
  get networkAllowed(): boolean { return this.remaining > 0 || this.config.exhaustion === 'none'; }

  update(nowMs: number, context: Readonly<PhoneUsageContext>): void {
    if (!timeValue(nowMs) || (this.lastTime !== null && nowMs < this.lastTime)) return;
    const gap = this.lastTime === null ? 0 : nowMs - this.lastTime;
    const ignoredGap = gap > this.config.largeGapMs && this.config.largeGapUsage === 'ignore';
    if (this.active && !ignoredGap) {
      // Keep the same origin across frames: rounding does not accumulate with frame count.
      this.remaining = clamp(this.anchorBalance - (nowMs - this.anchorTime) / 1000 * this.config.consumptionMbPerSecond, this.capacityMb);
    }
    const home = isHomeLocation(context, this.config);
    const recovered = this.home === false && home && this.config.recovery === 'on-home-entry';
    if (recovered) this.remaining = this.capacityMb;
    const active = context.owned && context.open && !home &&
      (!context.paused || this.config.pausedUsage === 'consume') && (context.visible || this.config.hiddenUsage === 'consume');
    if (!this.active || !active || ignoredGap || recovered) {
      this.anchorTime = nowMs; this.anchorBalance = this.remaining;
    }
    this.active = active; this.home = home; this.lastTime = nowMs;
  }

  /** Explicit recovery event. Settle elapsed usage before adding; never creates a timer. */
  replenish(nowMs: number, context: Readonly<PhoneUsageContext>, amountMb?: number): void {
    if (amountMb !== undefined && (!Number.isFinite(amountMb) || amountMb < 0)) throw new Error('Expected a non-negative finite recovery amount');
    if (!timeValue(nowMs) || (this.lastTime !== null && nowMs < this.lastTime)) return;
    this.update(nowMs, context);
    this.remaining = amountMb === undefined ? this.capacityMb : clamp(this.remaining + amountMb, this.capacityMb);
    this.anchorTime = nowMs; this.anchorBalance = this.remaining;
  }

  /** Call update at the save boundary first; this method reads no clock and changes no balance. */
  save(epochMs?: number): PhoneDataSave {
    return { v: 1, remainingMb: this.remaining, capacityMb: this.capacityMb,
      ...(timeValue(epochMs) ? { savedAtEpochMs: epochMs, activeAtSave: this.active } : {}) };
  }
}
