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
  visible: boolean;
  showAxes: boolean;
  showGridX: boolean;
  showGridY: boolean;
  gridStepX: number;
  gridStepY: number;
};

export class AxisGridController {
  private static readonly MIN_GRID_STEP_MM = 0.1;

  // spacing floors in screen px, coarsening a step that would otherwise emit one line per pixel
  // and lock up the tab at a far zoom-out.
  private static readonly MIN_GRID_SPACING_PX = 4;
  private static readonly MIN_TICK_SPACING_PX = 50;
  private static readonly MAX_LINES_PER_AXIS = 1000;

  // off as a whole but with every row on, so the first click of the master eye shows something
  private preferences: AxisGridPreferences = {
    visible: false,
    showAxes: true,
    showGridX: true,
    showGridY: true,
    gridStepX: 50,
    gridStepY: 50,
  };

  constructor(
    private readonly storageKey: string,
    private readonly onVisualChange: () => void = () => { },
  ) { }

  get visible(): boolean {
    return this.preferences.visible;
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
      this.preferences = this.merged(JSON.parse(raw) as Partial<AxisGridPreferences>);
    } catch {
      // ignore malformed/blocked sessionStorage
    }
  }

  updatePreferences(next: Partial<AxisGridPreferences>): void {
    this.preferences = this.merged(next);
    this.persistPreferences();
    this.onVisualChange();
  }

  draw(gRoot: RootGroup, gUI: RootGroup, cv: CanvasViewport, pxPerMm: number): void {
    if (!this.visible) return;
    this.drawGrid(gRoot, cv, pxPerMm);
    if (this.showAxes) {
      this.drawAxes(gRoot, cv);
      this.drawAxisLabels(gUI, cv, pxPerMm);
      this.drawAxisTicks(gUI, cv, pxPerMm);
    }
  }

  private merged(next: Partial<AxisGridPreferences>): AxisGridPreferences {
    const p = this.preferences;
    const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
    return {
      visible: bool(next.visible, p.visible),
      showAxes: bool(next.showAxes, p.showAxes),
      showGridX: bool(next.showGridX, p.showGridX),
      showGridY: bool(next.showGridY, p.showGridY),
      gridStepX: this.sanitizeStep(next.gridStepX, p.gridStepX),
      gridStepY: this.sanitizeStep(next.gridStepY, p.gridStepY),
    };
  }

  private sanitizeStep(value: number | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(AxisGridController.MIN_GRID_STEP_MM, Math.abs(parsed));
  }

  private persistPreferences(): void {
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(this.preferences));
    } catch {
      // ignore storage errors
    }
  }

  // coarsens the configured step by the smallest 1/2/5x10^k multiple that keeps lines >= minPx
  // apart, so every drawn line still lands on the user's own grid, just at a coarser subdivision.
  private effectiveStep(stepMm: number, pxPerMm: number, minPx: number): number {
    const spacingPx = stepMm * pxPerMm;
    if (!Number.isFinite(spacingPx) || spacingPx <= 0) return stepMm;
    if (spacingPx >= minPx) return stepMm;

    const needed = minPx / spacingPx;
    const decade = Math.pow(10, Math.floor(Math.log10(needed)));
    const multiple = [1, 2, 5, 10].find(m => m * decade >= needed) ?? 10;
    return stepMm * multiple * decade;
  }

  // every multiple of `step` inside [lo, hi], anchored on the origin but walked across the
  // visible span only — a full 0-to-edge loop used to emit every off-screen line for a view
  // panned metres away from the origin.
  private stepValues(lo: number, hi: number, step: number): number[] {
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(step > 0)) return [];

    const eps = step * 1e-6;
    const first = Math.ceil((lo - eps) / step);
    const last = Math.floor((hi + eps) / step);

    const values: number[] = [];
    // belt-and-suspenders: a caller that skips the spacing floors still gets a sparse grid, not a locked tab
    for (let i = first; i <= last && values.length < AxisGridController.MAX_LINES_PER_AXIS; i++) {
      values.push(i * step);
    }
    return values;
  }

  // multiplying out from the origin lands on float dust for a fractional step
  // (3 * 0.2 = 0.6000000000000001)
  private formatTickLabel(mm: number): string {
    return `${Math.round(mm * 1e6) / 1e6}`;
  }

  private drawAxisTicks(gUI: RootGroup, cv: CanvasViewport, pxPerMm: number): void {
    const inset = 7 / pxPerMm;
    const fontSize = 13 / pxPerMm;

    // gUI is viewport coords (y+ down), so a world y goes in negated
    const tickLabel = (x: number, y: number, anchor: string, baseline: string, mm: number) => {
      gUI.append('text')
        .attr('x', x).attr('y', y)
        .attr('text-anchor', anchor).attr('dominant-baseline', baseline)
        .attr('font-size', fontSize)
        .style('fill', 'var(--ui-canvas-tick)')
        .text(this.formatTickLabel(mm)).style('user-select', 'none');
    };

    // coarsened up from the grid's own step, not the configured one, so every label still sits
    // on a drawn grid line.
    const stepX = this.effectiveStep(
      this.effectiveStep(this.gridStepX, pxPerMm, AxisGridController.MIN_GRID_SPACING_PX),
      pxPerMm, AxisGridController.MIN_TICK_SPACING_PX);
    const stepY = this.effectiveStep(
      this.effectiveStep(this.gridStepY, pxPerMm, AxisGridController.MIN_GRID_SPACING_PX),
      pxPerMm, AxisGridController.MIN_TICK_SPACING_PX);

    for (const y of this.stepValues(-cv.bottomBound, -cv.topBound, stepY)) {
      if (y === 0) continue;
      const labelY = -y - 3 / pxPerMm;
      tickLabel(cv.leftBound + inset, labelY, 'start', 'middle', y);
      tickLabel(cv.rightBound - inset, labelY, 'end', 'middle', y);
    }

    for (const x of this.stepValues(cv.leftBound, cv.rightBound, stepX)) {
      if (x === 0) continue;
      const labelX = x + 4 / pxPerMm;
      tickLabel(labelX, cv.topBound + inset, 'middle', 'hanging', x);
      tickLabel(labelX, cv.bottomBound - inset, 'middle', 'ideographic', x);
    }
  }

  private drawAxes(gRoot: RootGroup, cv: CanvasViewport): void {
    const axisLine = (x1: number, y1: number, x2: number, y2: number) => {
      gRoot.append('line')
        .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
        .attr('stroke-width', 2)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('stroke', 'var(--ui-canvas-axis)');
    };
    axisLine(0, -cv.topBound, 0, -cv.bottomBound);
    axisLine(cv.leftBound, 0, cv.rightBound, 0);
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

    if (cv.rightBound > 0) {
      gUI
        .append('text')
        .attr('x', cv.rightBound)
        .attr('y', xLabelY)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'ideographic')
        .attr('font-size', fontSizePx)
        .style('fill', 'var(--ui-canvas-axis-label)')
        .text(`${Math.round(cv.rightBound)} mm`)
        .style('user-select', 'none');
    }

    if (cv.leftBound < 0) {
      gUI
        .append('text')
        .attr('x', cv.leftBound)
        .attr('y', xLabelY)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'ideographic')
        .attr('font-size', fontSizePx)
        .style('fill', 'var(--ui-canvas-axis-label)')
        .text(`${Math.round(cv.leftBound)} mm`)
        .style('user-select', 'none');
    }

    if (cv.topBound < 0) {
      gUI
        .append('text')
        .attr('x', yLabelX)
        .attr('y', cv.topBound + 20 / pxPerMm)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'auto')
        .attr('font-size', fontSizePx)
        .style('fill', 'var(--ui-canvas-axis-label)')
        .text(`${Math.round(-cv.topBound)} mm`)
        .style('user-select', 'none');
    }

    if (cv.bottomBound > 0) {
      gUI
        .append('text')
        .attr('x', yLabelX)
        .attr('y', cv.bottomBound - 20 / pxPerMm)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'hanging')
        .attr('font-size', fontSizePx)
        .style('fill', 'var(--ui-canvas-axis-label)')
        .text(`${Math.round(-cv.bottomBound)} mm`)
        .style('user-select', 'none');
    }
  }

  private drawGrid(gRoot: RootGroup, cv: CanvasViewport, pxPerMm: number): void {
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
          .attr('stroke-width', 2)
          .attr('vector-effect', 'non-scaling-stroke')
          .style('stroke', 'var(--ui-canvas-grid)');
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
          .attr('stroke-width', 2)
          .attr('vector-effect', 'non-scaling-stroke')
          .style('stroke', 'var(--ui-canvas-grid)');
      }
    }
  }
}
