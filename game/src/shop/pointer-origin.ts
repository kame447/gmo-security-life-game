/** A click may finish the gesture that opened the panel. No time-based debounce is needed. */
export class PointerOrigin<T extends object> {
  private start?: T;

  /** Called for every pointerdown, with undefined when it began outside an enabled panel button. */
  begin(target: T | undefined): void { this.start = target; }
  reset(): void { this.start = undefined; }

  accept(target: T, detail: number): boolean {
    const started = this.start;
    this.reset();
    // Keyboard and assistive activation produce detail=0 without a pointerdown.
    return detail === 0 || started === target;
  }
}
