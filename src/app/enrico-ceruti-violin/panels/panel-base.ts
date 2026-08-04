import { Component, EventEmitter, Output } from '@angular/core';
import { PanelRenderRequest } from '../ceruti-types';

export type RenderLayer = (g: any, ui: any) => void;

/**
 * Shared panel-to-parent emit plumbing. Each panel implements `buildRun()`
 * (its calc + render composition) and calls `emitImmediate`/`emitDebounced`;
 * this owns the `PanelRenderRequest` construction every panel used to repeat.
 *
 * `buildRun()` is not called eagerly here — it's wrapped in a closure
 * (`run: () => this.buildRun()`) so the parent decides *when* it actually
 * executes. That's what `immediate` controls, below.
 */
@Component({
  selector: 'app-ceruti-panel-base',
  templateUrl: './panel-base.html',
})
export abstract class CerutiPanelBase {
  @Output() panelUpdate = new EventEmitter<PanelRenderRequest>();

  /**
   * Builds this panel's render layer stack for its current state.
   *
   * Public rather than protected so a test can call it directly — a panel's
   * whole contract is "run the calc, return these layers", and asserting on that
   * needs no canvas.
   */
  public abstract buildRun(): RenderLayer[];

  /**
   * Use for anything the user is watching happen live: hover/focus previews,
   * a panel's first draw on activation, drag ticks. The parent runs
   * `buildRun()` synchronously, skipping the ~1800ms debounce — a highlight
   * halo (or an initial draw) that lagged behind the input would just look
   * broken, not "smoothed."
   */
  protected emitImmediate(refreshEnabledPanels = false, persistSession?: boolean): void {
    this.emit(true, refreshEnabledPanels, persistSession);
  }

  /**
   * Public entry point for the view-toggle bar (see render-toggles.ts), which lives outside
   * this panel and mutates `flags` directly rather than through an `@Input` change — a toggle
   * click is exactly the kind of thing the user is watching happen live, so it redraws through
   * `emitImmediate` rather than `onChange()`'s debounced path.
   */
  public requestViewRerender(): void {
    this.emitImmediate(true);
  }

  /**
   * Use for typed/dragged numeric edits: the parent debounces these (and
   * pushes undo history) so a fast typist doesn't recompute geometry and
   * flood the undo stack on every keystroke.
   */
  protected emitDebounced(refreshEnabledPanels = false, persistSession?: boolean): void {
    this.emit(false, refreshEnabledPanels, persistSession);
  }

  /**
   * Like `emitDebounced`, but declines the immediate-bypass the parent hands out
   * for arrow keys and spinner clicks. For panels whose `buildRun()` is
   * expensive enough that running it once per key repeat would put the panel
   * further behind the input with every press — see `PanelRenderRequest.coalesce`.
   */
  protected emitCoalesced(refreshEnabledPanels = false, persistSession?: boolean): void {
    this.emit(false, refreshEnabledPanels, persistSession, true);
  }

  private emit(immediate: boolean, refreshEnabledPanels: boolean, persistSession?: boolean, coalesce = false): void {
    this.panelUpdate.emit({
      immediate,
      coalesce,
      refreshEnabledPanels,
      persistSession,
      run: () => this.buildRun(),
    });
  }
}
