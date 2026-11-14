/** The real loop publishes its rAF timestamp before updates, including frames with paused input. */
export interface CrossingParticipant { crossingTick(timeSeconds: number, dt: number): void }
const participants = new Set<WeakRef<CrossingParticipant>>();
let current: number | null = null;

export function watchCrossingClock(participant: CrossingParticipant): void {
  participants.add(new WeakRef(participant));
}
export function crossingTime(): number | null { return current; }

export function advanceCrossingClock(timeSeconds: number): void {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return;
  const dt = current === null ? 0 : Math.max(0, timeSeconds - current);
  current = timeSeconds;
  for (const ref of participants) {
    const participant = ref.deref();
    if (participant) participant.crossingTick(timeSeconds, dt); else participants.delete(ref);
  }
}

/** Test/tool teardown. Static map tools without a running loop retain their static collision contract. */
export function clearCrossingClock(): void { current = null; participants.clear(); }
