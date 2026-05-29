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
    if (this.showGrid) this.drawGrid(gRoot, cv);
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

    // Loop 1: Y ticks — downward from origin
    for (let y = 0; y <= -cv.topBound; y += this.gridStepY) {
      if (!this.showGridY) continue;
      if (y === 0) continue;
      drawYTick(y, `${y}`);
    }

    // Loop 2: Y ticks — upward from origin
    for (let y = -this.gridStepY; y >= -cv.bottomBound; y -= this.gridStepY) {
      if (!this.showGridY) continue;
      if (y === 0) continue;
      drawYTick(y, `${y}`);
    }

    // Loop 3: X ticks — rightward from origin
    for (let x = -this.gridStepX; x <= cv.rightBound; x += this.gridStepX) {
      if (!this.showGridX) continue;
      if (x === 0) continue;
      drawXTick(x, `${x}`);
    }

    // Loop 4: X ticks — leftward from origin
    for (let x = -this.gridStepX; x >= cv.leftBound; x -= this.gridStepX) {
      if (!this.showGridX) continue;
      if (x === 0) continue;
      drawXTick(x, `${x}`);
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

  private drawGrid(gRoot: RootGroup, cv: CanvasViewport, gridColor: string = '#85858543'): void {

    for (let y = 0; y <= -cv.topBound; y += this.gridStepY) {
      if (!this.showGridY) continue;
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
    for (let y = -this.gridStepY; y >= -cv.bottomBound; y -= this.gridStepY) {
      if (!this.showGridY) continue;
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

    for (let x = -this.gridStepX; x <= cv.rightBound; x += this.gridStepX) {
      if (!this.showGridX) continue;
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
    for (let x = -this.gridStepX; x >= cv.leftBound; x -= this.gridStepX) {
      if (!this.showGridX) continue;
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
