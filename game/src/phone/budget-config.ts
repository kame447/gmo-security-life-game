/** Provisional review values and policies. None is a final balance/progression decision. */
export interface PhoneBudgetConfig {
  capacityMb: number;
  consumptionMbPerSecond: number;
  homeAreaIds: readonly string[];
  homeFacilityIds: readonly string[];
  pausedUsage: 'ignore' | 'consume';
  hiddenUsage: 'ignore' | 'consume';
  offlineUsage: 'ignore' | 'consume-if-active';
  recovery: 'manual' | 'on-home-entry';
  exhaustion: 'none' | 'block-network';
  /** A discontinuity policy, not a per-frame dt cap. */
  largeGapMs: number;
  largeGapUsage: 'ignore' | 'consume';
}

export const PHONE_BUDGET_PROTOTYPE: Readonly<PhoneBudgetConfig> = Object.freeze({
  capacityMb: 5000,
  consumptionMbPerSecond: 0.1,
  homeAreaIds: Object.freeze(['home-family-interior']),
  homeFacilityIds: Object.freeze(['home-family']),
  pausedUsage: 'ignore',
  hiddenUsage: 'ignore',
  offlineUsage: 'ignore',
  recovery: 'manual',
  exhaustion: 'none',
  largeGapMs: 60_000,
  largeGapUsage: 'consume',
});
