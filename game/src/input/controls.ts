import type { Facing } from '../core/coords';
import type { InputState } from '../map/explorer';

export const DIRECTION_KEYS: Readonly<Record<string, Facing>> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
export const ACTION_KEYS: ReadonlySet<string> = new Set(['KeyZ', 'Space', 'Enter']);
export const RUN_KEYS: ReadonlySet<string> = new Set(['ShiftLeft', 'ShiftRight']);

/** Held movement sources (keys and touch pointers). The most recent direction wins. */
export class Controls {
  private readonly held = new Map<string, Facing>();
  private readonly runs = new Set<string>();

  press(source: string, dir: Facing): void { this.held.set(source, dir); }
  pressRun(source: string): void { this.runs.add(source); }
  release(source: string): void { this.held.delete(source); this.runs.delete(source); }
  clear(): void { this.held.clear(); this.runs.clear(); }

  state(): InputState {
    return { dir: [...this.held.values()].at(-1) ?? null, run: this.runs.size > 0 };
  }
}
