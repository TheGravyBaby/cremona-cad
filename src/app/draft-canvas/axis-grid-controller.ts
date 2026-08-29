import * as d3 from 'd3';

export type CanvasViewport = {
  leftBound: number;
  rightBound: number;
  topBound: number;
  bottomBound: number;
  mmW: number;
  mmH: number;
};

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export type AxisGridPreferences = {
  showGrid: boolean;
  showAxes: boolean;
  showGridX: boolean;
  showGridY: boolean;
  gridStepX: number;
  gridStepY: number;
};

type PersistedAxisGridPreferences = Partial<AxisGridPreferences> & {
  showAxes?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
};

export class AxisGridController {
  private static readonly MIN_GRID_STEP_MM = 0.1;

  // Spacing floors in screen px. The loops below emit one element per grid step across the whole
  // viewport, so a step that lands under these — a 0.1mm grid at any usable zoom, or an ordinary
  // one at the far end of the zoom-out range — meant thousands of elements per redraw and a
  // locked-up tab. Bounded by pixels rather than by a line count: lines = viewportPx / spacingPx,
  // so the viewport itself caps the total.
  private static readonly MIN_GRID_SPACING_PX = 4;
  private static readonly MIN_TICK_SPACING_PX = 50;
  private static readonly MAX_LINES_PER_AXIS = 1000;

  private preferences: AxisGridPreferences = {
    showGrid: false,
    showAxes: false,
    showGridX: false,
    showGridY: false,
    gridStepX: 50,
    gridStepY: 50,
  };

  constructor(
    private readonly storageKey: string,
    private readonly onVisualChange: () => void = () => { },
  ) { }

  get showGrid(): boolean {
    return true //this.preferences.showGrid;
  }

  get showAxes(): boolean {
    return this.preferences.showAxes;
  }

  get showGridX(): boolean {
    return this.preferences.showGridX;
  }

  get showGridY(): boolean {
    return this.preferences.showGridY;
  }

  get gridStepX(): number {
    return this.preferences.gridStepX;
  }

  get gridStepY(): number {
    return this.preferences.gridStepY;
  }

  loadPreferences(): void {
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedAxisGridPreferences;

      this.preferences = {
        showGrid: typeof parsed.showGrid === 'boolean' ? parsed.showGrid : this.preferences.showGrid,
        showAxes: this.resolveAxisPreference(parsed.showAxes, parsed.showXAxis, this.preferences.showAxes),
        showGridX: typeof parsed.showGridX === 'boolean'
          ? parsed.showGridX
          : this.resolveAxisPreference(parsed.showXAxis, parsed.showAxes, this.preferences.showGridX),
        showGridY: typeof parsed.showGridY === 'boolean'
          ? parsed.showGridY
          : this.resolveAxisPreference(parsed.showYAxis, parsed.showAxes, this.preferences.showGridY),
        gridStepX: this.sanitizeStep(parsed.gridStepX, this.preferences.gridStepX),
        gridStepY: this.sanitizeStep(parsed.gridStepY, this.preferences.gridStepY),
      };
    } catch {
      // ignore malformed/blocked sessionStorage
    }
  }

  updatePreferences(next: Partial<AxisGridPreferences>): void {
    this.preferences = {
      showGrid: typeof next.showGrid === 'boolean' ? next.showGrid : this.preferences.showGrid,
      showAxes: typeof next.showAxes === 'boolean' ? next.showAxes : this.preferences.showAxes,
      showGridX: typeof next.showGridX === 'boolean' ? next.showGridX : this.preferences.showGridX,
      showGridY: typeof next.showGridY === 'boolean' ? next.showGridY : this.preferences.showGridY,
      gridStepX: next.gridStepX !== undefined ? this.sanitizeStep(next.gridStepX, this.preferences.gridStepX) : this.preferences.gridStepX,
      gridStepY: next.gridStepY !== undefined ? this.sanitizeStep(next.gridStepY, this.preferences.gridStepY) : this.preferences.gridStepY,
    };

    this.persistPreferences();
    this.onVisualChange();
  }

  draw(gRoot: RootGroup, gUI: RootGroup, cv: CanvasViewport, pxPerMm: number): void {
    if (this.showGrid) this.drawGrid(gRoot, cv, pxPerMm);
    if (this.showAxes) {
      this.drawAxes(gRoot, cv);
      this.drawAxisLabels(gUI, cv, pxPerMm);
      this.drawAxisTicks(gRoot, gUI, cv, pxPerMm);
    }
  }

  private resolveAxisPreference(value: boolean | undefined, legacyValue: boolean | undefined, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof legacyValue === 'boolean') return legacyValue;
    return fallback;
  }

  private sanitizeStep(value: number | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(AxisGridController.MIN_GRID_STEP_MM, Math.abs(parsed));
  }

  private persistPreferences(): void {
    try {
      const existingRaw = sessionStorage.getItem(this.storageKey);
      const existing = existingRaw ? JSON.parse(existingRaw) as Record<string, unknown> : {};

      sessionStorage.setItem(this.storageKey, JSON.stringify({
        ...existing,
        ...this.preferences,
      }));
    } catch {
      // ignore storage errors
    }
  }

  /**
   * The configured step, coarsened by the smallest 1/2/5x10^k multiple that keeps drawn lines at
   * least `minPx` apart. Only ever coarsens, so a comfortable step passes through untouched; a
   * multiple means every line drawn still sits on the user's own grid, just at a coarser
   * subdivision, rather than on some step they never asked for.
   */
  private effectiveStep(stepMm: number, pxPerMm: number, minPx: number): number {
    const spacingPx = stepMm * pxPerMm;
    if (!Number.isFinite(spacingPx) || spacingPx <= 0) return stepMm;
    if (spacingPx >= minPx) return stepMm;

    const needed = minPx / spacingPx;
    const decade = Math.pow(10, Math.floor(Math.log10(needed)));
    const multiple = [1, 2, 5, 10].find(m => m * decade >= needed) ?? 10;
    return stepMm * multiple * decade;
  }

  /**
   * Every multiple of `step` inside [lo, hi]. Still anchored on the origin, so lines land where
   * they always did — but walked across the visible span only. The loops used to start at 0 and
   * run out to the viewport edge, so a view panned a few metres from the origin emitted every
   * line in between, all of them off-screen. With this the count is span/step, which the spacing
   * floors above turn into a bound in viewport pixels.
   */
  private stepValues(lo: number, hi: number, step: number): number[] {
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(step > 0)) return [];

    const eps = step * 1e-6;
    const first = Math.ceil((lo - eps) / step);
    const last = Math.floor((hi + eps) / step);

    const values: number[] = [];
    // the spacing floors should keep this far under the cap; it's here so a future caller that
    // skips them degrades to a sparse grid rather than a locked tab
    for (let i = first; i <= last && values.length < AxisGridController.MAX_LINES_PER_AXIS; i++) {
      values.push(i * step);
    }
    return values;
  }

  /** Multiplying out from the origin still lands on float dust for a fractional step
   * (3 * 0.2 = 0.6000000000000001). Round it back out of the label. */
  private formatTickLabel(mm: number): string {
    return `${Math.round(mm * 1e6) / 1e6}`;
  }

  private drawAxisTicks(gRoot: RootGroup, gUI: RootGroup, cv: CanvasViewport, pxPerMm: number): void {
    const tickLen = 5 / pxPerMm;
    const fontSize = 13 / pxPerMm;
    const labelGap = 2 / pxPerMm;
    const tickColor = '#888';

    // Both Y edges: always draw on left and right bounds
    const yEdges: { x: number; dir: number }[] = [
      { x: cv.leftBound, dir: 1 },   // left edge, tick points right
      { x: cv.rightBound, dir: -1 }, // right edge, tick points left
    ];

    // Both X edges: always draw on top and bottom bounds
    // gUI y = viewport coords (y+ down); gRoot y = flipped (y+ up)
    const xEdges: { edgeY: number; rootEdgeY: number; baseline: string }[] = [
      { edgeY: cv.topBound, rootEdgeY: -cv.topBound, baseline: 'hanging' },       // top edge
      { edgeY: cv.bottomBound, rootEdgeY: -cv.bottomBound, baseline: 'ideographic' }, // bottom edge
    ];

    // Helper to draw a tick mark and label for a Y-axis row
    const drawYTick = (y: number, label: string) => {
      for (const { x, dir } of yEdges) {
        // gRoot.append('line')
        //   .attr('x1', x).attr('y1', y)
        //   .attr('x2', x + dir * tickLen).attr('y2', y)
        //   .attr('stroke', tickColor).attr('stroke-width', 1)
        //   .attr('vector-effect', 'non-scaling-stroke');
        gUI.append('text')
          .attr('x', x + dir * (tickLen + labelGap)).attr('y', -y - 3)
          .attr('text-anchor', dir > 0 ? 'start' : 'end').attr('dominant-baseline', 'middle')
          .attr('fill', tickColor).attr('font-size', fontSize)
          .attr('vector-effect', 'non-scaling-stroke')
          .text(label).style('user-select', 'none');
      }
    };

    // Helper to draw a tick mark and label for an X-axis column
    const drawXTick = (x: number, label: string) => {
      for (const { edgeY, rootEdgeY, baseline } of xEdges) {
        // Tick points inward: top edge tick goes down (rootEdgeY dir = -1 in gRoot), bottom edge goes up (+1)
        const tickDir = baseline === 'hanging' ? -1 : 1; // gRoot: top edge y increases downward from -cv.topBound
        // gRoot.append('line')
        //   .attr('x1', x).attr('y1', rootEdgeY)
        //   .attr('x2', x).attr('y2', rootEdgeY + tickDir * tickLen)
        //   .attr('stroke', tickColor).attr('stroke-width', 1)
        //   .attr('vector-effect', 'non-scaling-stroke');
        // Label offset: pull inside the viewport by labelGap
        const labelY = baseline === 'hanging'
          ? edgeY + (tickLen + labelGap)  // top edge: below the tick
          : edgeY - (tickLen + labelGap); // bottom edge: above the tick, with padding
        gUI.append('text')
          .attr('x', x + 4).attr('y', labelY)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', baseline)
          .attr('fill', tickColor).attr('font-size', fontSize)
          .attr('vector-effect', 'non-scaling-stroke')
          .text(label).style('user-select', 'none');
      }
    };

    // Labels need far more room than grid lines do, so they thin out sooner. Coarsened up from
    // the grid's own step rather than from the configured one, so every label still sits on a
    // drawn grid line — the 1/2/5 ladder doesn't nest (a 2x grid and a 5x label step wouldn't).
    const stepX = this.effectiveStep(
      this.effectiveStep(this.gridStepX, pxPerMm, AxisGridController.MIN_GRID_SPACING_PX),
      pxPerMm, AxisGridController.MIN_TICK_SPACING_PX);
    const stepY = this.effectiveStep(
      this.effectiveStep(this.gridStepY, pxPerMm, AxisGridController.MIN_GRID_SPACING_PX),
      pxPerMm, AxisGridController.MIN_TICK_SPACING_PX);

    // Y ticks, across the visible rows (gRoot y, so the viewport bounds come in negated)
    if (this.showGridY) {
      for (const y of this.stepValues(-cv.bottomBound, -cv.topBound, stepY)) {
        if (y === 0) continue;
        drawYTick(y, this.formatTickLabel(y));
      }
    }

    // X ticks, across the visible columns
    if (this.showGridX) {
      for (const x of this.stepValues(cv.leftBound, cv.rightBound, stepX)) {
        if (x === 0) continue;
        drawXTick(x, this.formatTickLabel(x));
      }
    }
  }

  private drawAxes(gRoot: RootGroup, cv: CanvasViewport): void {
    const lineColor = '#adadadff';

    if (this.showAxes) {
      gRoot
        .append('line')
        .attr('x1', 0)
        .attr('y1', -cv.topBound)
        .attr('x2', 0)
        .attr('y2', -cv.bottomBound)
        .attr('stroke', lineColor)
        .attr('stroke-width', 2)
        .attr('vector-effect', 'non-scaling-stroke');
    }

    if (this.showAxes) {
      gRoot
        .append('line')
        .attr('x1', cv.leftBound)
        .attr('y1', 0)
        .attr('x2', cv.rightBound)
        .attr('y2', 0)
        .attr('stroke', lineColor)
        .attr('stroke-width', 2)
        .attr('vector-effect', 'non-scaling-stroke');
    }
  }

  private drawAxisLabels(gUI: RootGroup, cv: CanvasViewport, pxPerMm: number): void {
    const fontSizePx = 20 / pxPerMm;
    const xBelow = (cv.bottomBound > 0 && cv.topBound > 0);
    const xAbove = (cv.bottomBound < 0 && cv.topBound < 0);
    const yLeft = (cv.leftBound < 0 && cv.rightBound < 0);
    const yRight = (cv.leftBound > 0 && cv.rightBound > 0);

    let renderXAxisAt: number | null = null;
    let renderYAxisAt: number | null = null;

    if (xBelow) renderXAxisAt = cv.topBound;
    else if (xAbove) renderXAxisAt = cv.bottomBound;

    if (yLeft) renderYAxisAt = cv.rightBound;
    else if (yRight) renderYAxisAt = cv.leftBound;

    let xLabelY = renderXAxisAt ?? (-1 / pxPerMm);
    let yLabelX = renderYAxisAt ?? (2 / pxPerMm);

    if (renderXAxisAt !== null && renderXAxisAt > 0) xLabelY += 20 / pxPerMm;
    if (renderYAxisAt !== null && renderYAxisAt < 0) yLabelX -= 80 / pxPerMm;

    if (this.showAxes && cv.rightBound > 0) {
      gUI
        .append('text')
        .attr('x', cv.rightBound)
        .attr('y', xLabelY)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'ideographic')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${Math.round(cv.rightBound)} mm`)
        .style('user-select', 'none');
    }

    if (this.showAxes && cv.leftBound < 0) {
      gUI
        .append('text')
        .attr('x', cv.leftBound)
        .attr('y', xLabelY)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'ideographic')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${Math.round(cv.leftBound)} mm`)
        .style('user-select', 'none');
    }

    if (this.showAxes && cv.topBound < 0) {
      gUI
        .append('text')
        .attr('x', yLabelX)
        .attr('y', cv.topBound + 20 / pxPerMm)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'auto')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${Math.round(-cv.topBound)} mm`)
        .style('user-select', 'none');
    }

    if (this.showAxes && cv.bottomBound > 0) {
      gUI
        .append('text')
        .attr('x', yLabelX)
        .attr('y', cv.bottomBound - 20 / pxPerMm)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'hanging')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${Math.round(-cv.bottomBound)} mm`)
        .style('user-select', 'none');
    }
  }

  private drawGrid(gRoot: RootGroup, cv: CanvasViewport, pxPerMm: number, gridColor: string = '#85858543'): void {
    const stepX = this.effectiveStep(this.gridStepX, pxPerMm, AxisGridController.MIN_GRID_SPACING_PX);
    const stepY = this.effectiveStep(this.gridStepY, pxPerMm, AxisGridController.MIN_GRID_SPACING_PX);

    if (this.showGridY) {
      for (const y of this.stepValues(-cv.bottomBound, -cv.topBound, stepY)) {
        if (y === 0 && this.showAxes) continue;
        gRoot
          .append('line')
          .attr('x1', cv.leftBound)
          .attr('y1', y)
          .attr('x2', cv.rightBound)
          .attr('y2', y)
          .attr('stroke', gridColor)
          .attr('stroke-width', 2)
          .attr('vector-effect', 'non-scaling-stroke')
      }
    }

    if (this.showGridX) {
      for (const x of this.stepValues(cv.leftBound, cv.rightBound, stepX)) {
        if (x === 0 && this.showAxes) continue;
        gRoot
          .append('line')
          .attr('x1', x)
          .attr('y1', -cv.topBound)
          .attr('x2', x)
          .attr('y2', -cv.bottomBound)
          .attr('stroke', gridColor)
          .attr('stroke-width', 2)
          .attr('vector-effect', 'non-scaling-stroke')
      }
    }
  }
}
