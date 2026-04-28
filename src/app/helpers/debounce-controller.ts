export class DebounceController {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private skipDebounce = false;
  private destroyed = false;

  constructor(private readonly postRun?: () => void) {}

  markImmediateFromKey(event: KeyboardEvent): void {
    this.skipDebounce = event.key === 'ArrowUp' || event.key === 'ArrowDown';
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

  run(fn: () => void, delay = 1000): void {
    if (this.destroyed) return;

    if (this.skipDebounce) {
      this.skipDebounce = false;
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