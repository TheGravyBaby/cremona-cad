/**
 * HelloRecipe — a minimal example recipe intended to help new developers
 * understand the architecture of CremonaCad.
 *
 * Key concepts illustrated here:
 *  1. Extending RecipeComponentBase to get undo/redo, save/load, panel
 *     navigation, and the reference-image system for free.
 *  2. Storing all mutable design state in `this.d.params` so it round-trips
 *     through JSON save/load without any extra work.
 *  3. Emitting draw functions via `draftChange` — the canvas calls each
 *     function with (g, ui) where `g` is the main D3 SVG group and `ui` is
 *     an overlay group for labels/annotations.
 *  4. Using `setBounds` to tell the camera where to zoom on first render.
 */

import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Pt } from '../models/types';
import { renderCircle } from '../helpers/renderFuncs';

// ─── Params type ────────────────────────────────────────────────────────────
// Keep all recipe-specific values here so they survive save/load automatically.
interface HelloParams {
  bodyLength: number;  // total instrument body length in mm
  bodyWidth: number;   // widest point in mm
}

const DEFAULTS: HelloParams = {
  bodyLength: 356,
  bodyWidth: 210,
};

@Component({
  selector: 'app-hello-recipe',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './hello-recipe.html',
  styleUrls: ['../sidebar.css', './hello-recipe.css'],
})
export class HelloRecipe extends RecipeComponentBase {

  // ─── New-file reset ────────────────────────────────────────────────────
  // The parent app emits a monotonically-increasing tick when the user clicks
  // "New". Reset all params back to defaults when that happens.
  private _lastNewFileTick = 0;

  @Input() set newFile(v: number) {
    if (v <= 0 || v === this._lastNewFileTick) return;
    this._lastNewFileTick = v;
    this.d.params = { ...DEFAULTS };
    sessionStorage.removeItem('recipeData');
    this.render();
  }

  // ─── Panel definition ──────────────────────────────────────────────────
  // Panels are the collapsible sections in the sidebar. Each panel has an id
  // and a label shown to the user. Add more panels as the recipe grows.
  protected readonly panelOrder = [
    { id: 'dimensions', label: 'Dimensions' },
  ] as const;

  // ─── Lifecycle ─────────────────────────────────────────────────────────
  override ngAfterViewInit(): void {
    // Ensure params are initialised with defaults on first load.
    this.d.recipeName = 'hello';
    this.d.params = { ...DEFAULTS, ...(this.d.params ?? {}) };

    this.initializePanelFlow(this.panelOrder);
    this.initializeDebounce(() => this.render());

    super.ngAfterViewInit();
  }

  // ─── RecipeComponentBase abstract requirements ─────────────────────────
  // Controls whether each panel is unlocked/available to the user.
  protected override canOpenPanel(_panel: string): boolean {
    return true; // all panels always available in this simple recipe
  }

  // Maps panel ids → functions that run when that panel becomes active.
  protected override getActivationHandlers(): Record<string, () => void> {
    return {
      dimensions: () => this.render(),
    };
  }

  // ─── Convenience accessor ──────────────────────────────────────────────
  get p(): HelloParams {
    return this.d.params as HelloParams;
  }

  // ─── Called from the template whenever an input changes ───────────────
  onChange(): void {
    // `debounce` waits a short time before calling render, so rapid slider
    // drags don't flood the canvas with redraws.
    this.debounce(() => this.render());
  }

  // ─── Drawing ───────────────────────────────────────────────────────────
  private render(): void {
    const fns = [this.drawBody.bind(this)];
    this.draftChange.emit(fns);

    // Tell the camera to frame the instrument.
    const pad = 30;
    const hw = this.p.bodyWidth / 2 + pad;
    const hh = this.p.bodyLength / 2 + pad;
    this.setBounds.emit({
      pt1: new Pt(-hw, -hh),
      pt2: new Pt(hw, hh),
    });
  }

  /**
   * Draw function — receives the D3 SVG groups from the canvas.
   *
   * `g`  — the main drawing group (coordinates are in mm / world-space).
   * `ui` — an overlay group for text labels; also world-space but rendered
   *         on top of everything else without clipping.
   *
   * Tip: every render call completely replaces the previous output because
   * draft-canvas clears `g` and `ui` before calling these functions.
   */
  private drawBody(g: any, _ui: any): void {
    const hw = this.p.bodyWidth / 2;
    const hh = this.p.bodyLength / 2;

    // Draw a simple oval outline as a placeholder for the instrument body.
    // Replace this with arc-based geometry as your recipe develops!
    g.append('ellipse')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('rx', hw)
      .attr('ry', hh)
      .attr('fill', 'none')
      .attr('stroke', '#4D8660')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');

    // Draw a circle at the origin so the centre is clearly visible.
    renderCircle({ x: 0, y: 0, r: 3 }, '#4D8660')(g, _ui);

    // Label the width and height using the ui overlay.
    _ui.append('text')
      .attr('x', 0)
      .attr('y', -hh - 8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#aaa')
      .attr('font-size', 11)
      .attr('vector-effect', 'non-scaling-stroke')
      .text(`${this.p.bodyLength} mm`);

    _ui.append('text')
      .attr('x', hw + 8)
      .attr('y', 4)
      .attr('text-anchor', 'start')
      .attr('fill', '#aaa')
      .attr('font-size', 11)
      .attr('vector-effect', 'non-scaling-stroke')
      .text(`${this.p.bodyWidth} mm`);
  }
}
