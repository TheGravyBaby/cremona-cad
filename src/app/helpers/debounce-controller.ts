export class DebounceController {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private skipDebounce = false;
  // Set only by a real arrow-key step, and — unlike skipDebounce — survives clearImmediate().
  // A step should stay instant even in a panel that opted its other edits back into the delay
  // (emitCoalesced), because a fixed keyboard nudge costs nothing like a held key or a fast typist.
  private stepBypass = false;
  private destroyed = false;

  constructor(private readonly postRun?: () => void) {}

  markImmediateFromKey(event: KeyboardEvent): void {
    const isStep = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    this.skipDebounce = isStep;
    if (isStep) this.stepBypass = true;
  }

  markImmediateFromMouse(event: MouseEvent): void {
    const target = event.target as HTMLInputElement | null;
    this.skipDebounce = !!target && 
    (
      target.tagName === 'INPUT' 
      || target.type === 'number' 
      || target.type === 'button' 
      || target.tagName === 'SELECT' 
      || target.tagName === 'SECTION'
    );
  }

  /** Force the very next call to run() to execute synchronously, bypassing the debounce delay. */
  markImmediate(): void {
    this.skipDebounce = true;
  }

  /**
   * Withdraw a pending bypass, so the next run() debounces after all.
   *
   * The bypass is set speculatively by the host listeners above — an arrow key
   * or a mousedown on a number input means "the user is nudging a value and
   * wants to see it move". That is the right default for work measured in
   * milliseconds, but a caller that knows its own run costs a second can say so,
   * and a held arrow key then coalesces into one recompute instead of one per
   * repeat.
   */
  clearImmediate(): void {
    this.skipDebounce = false;
  }

  run(fn: () => void, delay = 1000): void {
    if (this.destroyed) return;

    if (this.skipDebounce || this.stepBypass) {
      this.skipDebounce = false;
      this.stepBypass = false;
      fn();
      this.postRun?.();
      return;
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.destroyed) return;
      fn();
      this.postRun?.();
    }, delay);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}