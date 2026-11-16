/** 行き先選択と乗車確認の状態。移動そのものは呼び出し側が別途検証する。 */
export interface StationChoice {
  readonly id: string;
  readonly name: string;
}

export type TravelMenuState =
  | { readonly step: 'closed' }
  | { readonly step: 'destinations'; readonly origin: StationChoice; readonly destinations: readonly StationChoice[] }
  | { readonly step: 'confirm'; readonly origin: StationChoice; readonly destinations: readonly StationChoice[]; readonly destination: StationChoice };

export interface ConfirmedJourney {
  readonly originId: string;
  readonly destinationId: string;
}

const copy = (choice: StationChoice): StationChoice => ({ id: choice.id, name: choice.name });

export class TravelMenu {
  private current: TravelMenuState = { step: 'closed' };

  /** Callers cannot mutate the pending choice through the returned value. */
  get state(): TravelMenuState {
    const state = this.current;
    if (state.step === 'closed') return { step: 'closed' };
    const base = { origin: copy(state.origin), destinations: state.destinations.map(copy) };
    return state.step === 'destinations' ? { step: 'destinations', ...base }
      : { step: 'confirm', ...base, destination: copy(state.destination) };
  }

  open(origin: StationChoice, destinations: readonly StationChoice[]): boolean {
    if (this.current.step !== 'closed' || !origin.id || !origin.name || destinations.length === 0) return false;
    const seen = new Set([origin.id]);
    for (const destination of destinations) {
      if (!destination.id || !destination.name || seen.has(destination.id)) return false;
      seen.add(destination.id);
    }
    this.current = { step: 'destinations', origin: copy(origin), destinations: destinations.map(copy) };
    return true;
  }

  select(id: string): boolean {
    const state = this.current;
    if (state.step !== 'destinations') return false;
    const destination = state.destinations.find(choice => choice.id === id);
    if (!destination) return false;
    this.current = { ...state, step: 'confirm', destination };
    return true;
  }

  /** Confirmation returns a request only; it never changes player state. */
  confirm(): ConfirmedJourney | null {
    const state = this.current;
    if (state.step !== 'confirm') return null;
    this.current = { step: 'closed' };
    return { originId: state.origin.id, destinationId: state.destination.id };
  }

  back(): boolean {
    const state = this.current;
    if (state.step === 'closed') return false;
    this.current = state.step === 'confirm'
      ? { step: 'destinations', origin: state.origin, destinations: state.destinations }
      : { step: 'closed' };
    return true;
  }

  cancel(): void { this.current = { step: 'closed' }; }
}
