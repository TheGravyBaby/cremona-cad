import * as d3 from 'd3';

type CanvasViewport = {
  leftBound: number;
  rightBound: number;
  topBound: number;
  bottomBound: number;
  mmW: number;
  mmH: number;
};

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

type PersistedAxisGridPreferences = Partial<AxisGridPreferences> & {
  showAxes?: boolean;
};

export type AxisGridPreferences = {
  showGrid: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  gridStepX: number;
  gridStepY: number;
};

export class AxisGridController {
  private static readonly MIN_GRID_STEP_MM = 0.1;

  private preferences: AxisGridPreferences = {
    showGrid: false,
    showXAxis: false,
    showYAxis: false,
    gridStepX: 50,
    gridStepY: 50,
  };

  constructor(
    private readonly storageKey: string,
    private readonly onVisualChange: () => void = () => { },
  ) { }

  get showGrid(): boolean {
    return this.preferences.showGrid;
  }

  get showXAxis(): boolean {
    return this.preferences.showXAxis;
  }

  get showYAxis(): boolean {
    return this.preferences.showYAxis;
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
        showXAxis: this.resolveAxisPreference(parsed.showXAxis, parsed.showAxes, this.preferences.showXAxis),
        showYAxis: this.resolveAxisPreference(parsed.showYAxis, parsed.showAxes, this.preferences.showYAxis),
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
      showXAxis: typeof next.showXAxis === 'boolean' ? next.showXAxis : this.preferences.showXAxis,
      showYAxis: typeof next.showYAxis === 'boolean' ? next.showYAxis : this.preferences.showYAxis,
      gridStepX: next.gridStepX !== undefined ? this.sanitizeStep(next.gridStepX, this.preferences.gridStepX) : this.preferences.gridStepX,
      gridStepY: next.gridStepY !== undefined ? this.sanitizeStep(next.gridStepY, this.preferences.gridStepY) : this.preferences.gridStepY,
    };

    this.persistPreferences();
    this.onVisualChange();
  }

  draw(gRoot: RootGroup, gUI: RootGroup, cv: CanvasViewport, pxPerMm: number): void {
    if (this.showGrid) this.drawGrid(gRoot, cv);
    if (this.showXAxis || this.showYAxis) {
      this.drawAxes(gRoot, cv);
      this.drawAxisLabels(gUI, cv, pxPerMm);
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
      sessionStorage.setItem(this.storageKey, JSON.stringify(this.preferences));
    } catch {
      // ignore storage errors
    }
  }

  private drawAxes(gRoot: RootGroup, cv: CanvasViewport): void {
    const lineColor = '#adadadff';

    if (this.showYAxis) {
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

    if (this.showXAxis) {
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

    if (this.showXAxis && cv.rightBound > 0) {
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

    if (this.showXAxis && cv.leftBound < 0) {
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

    if (this.showYAxis && cv.topBound < 0) {
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

    if (this.showYAxis && cv.bottomBound > 0) {
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
    const horizontalExtent = Math.max(0, -cv.topBound);
    const verticalExtent = Math.max(0, -cv.bottomBound);
    const rightExtent = Math.max(0, cv.rightBound);
    const leftExtent = Math.max(0, -cv.leftBound);
    const epsilonX = this.gridStepX / 1000;
    const epsilonY = this.gridStepY / 1000;

    for (let i = 0; ; i += 1) {
      const y = i * this.gridStepY;
      if (y > horizontalExtent + epsilonY) break;
      if (y === 0 && this.showXAxis) continue;

      gRoot
        .append('line')
        .attr('x1', cv.leftBound)
        .attr('y1', y)
        .attr('x2', cv.rightBound)
        .attr('y2', y)
        .attr('stroke', gridColor)
        .attr('stroke-width', 2)
        .attr('vector-effect', 'non-scaling-stroke');
    }

    for (let i = 1; ; i += 1) {
      const y = -i * this.gridStepY;
      if (-y > verticalExtent + epsilonY) break;
      if (y === 0 && this.showXAxis) continue;

      gRoot
        .append('line')
        .attr('x1', cv.leftBound)
        .attr('y1', y)
        .attr('x2', cv.rightBound)
        .attr('y2', y)
        .attr('stroke', gridColor)
        .attr('stroke-width', 2)
        .attr('vector-effect', 'non-scaling-stroke');
    }

    for (let i = 0; ; i += 1) {
      const x = i * this.gridStepX;
      if (x > rightExtent + epsilonX) break;
      if (x === 0 && this.showYAxis) continue;

      gRoot
        .append('line')
        .attr('x1', x)
        .attr('y1', -cv.topBound)
        .attr('x2', x)
        .attr('y2', -cv.bottomBound)
        .attr('stroke', gridColor)
        .attr('stroke-width', 2)
        .attr('vector-effect', 'non-scaling-stroke');
    }

    for (let i = 1; ; i += 1) {
      const x = -i * this.gridStepX;
      if (-x > leftExtent + epsilonX) break;
      if (x === 0 && this.showYAxis) continue;

      gRoot
        .append('line')
        .attr('x1', x)
        .attr('y1', -cv.topBound)
        .attr('x2', x)
        .attr('y2', -cv.bottomBound)
        .attr('stroke', gridColor)
        .attr('stroke-width', 2)
        .attr('vector-effect', 'non-scaling-stroke');
    }
  }
}