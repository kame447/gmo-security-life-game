import { parsePhoneDataSave, type PhoneDataSave } from './budget';
import { PHONE_BUDGET_PROTOTYPE, type PhoneBudgetConfig } from './budget-config';

/** Shared DTO and codec; independent of phone content, navigation, UI and clocks. */
export interface PhoneSave { v: 1; owned: boolean; dataBudget: PhoneDataSave }

export function parsePhoneSave(raw: unknown, initialOwned: boolean,
  config: Readonly<PhoneBudgetConfig> = PHONE_BUDGET_PROTOTYPE): PhoneSave {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const value = raw as Partial<PhoneSave>;
    if (value.v === 1 && typeof value.owned === 'boolean') {
      return { v: 1, owned: value.owned, dataBudget: parsePhoneDataSave(value.dataBudget, config) };
    }
  }
  return { v: 1, owned: initialOwned, dataBudget: parsePhoneDataSave(undefined, config) };
}
