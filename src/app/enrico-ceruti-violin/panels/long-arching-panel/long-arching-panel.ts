import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { archSplineKnots, SPLINE_PEAK_SOURCE } from '../../../helpers/math/pathMath';
import { clamp } from '../../../helpers/math/simpleGeometry';
import {
  ArchCurve, ArchSpline, ArchSplinePoint, ArchingParams, CerutiColors, CerutiViewFlags,
  EnricoCerutiParams, FlutingParams, RenderToggleKey,
} from '../../ceruti-types';
import {
  clampSplinePointHeights, defaultArchingParams, maxRibTaperMm, splinePeakRow,
} from '../../ceruti-arching';
import { defaultFlutingParams, LongArchSolve, solveLongArch } from '../../ceruti-arch-geometry';
import { calculateOuterArcs } from '../../ceruti-calcs';
import {
  archHeightInfo,
} from '../../ceruti-helpers';
import { HighlightedSplinePoint } from '../../renders/render-constants';
import { renderBodySection } from '../../renders/body-section.render';
import { error } from '../../../shared/message-emitter';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { applyRowMove, RowMove, RowReorderDirective } from '../../../shared/row-reorder';

/** One row of a plate's spline table: a control point, or the peak among them. */
interface SplineRow {
  pt: ArchSplinePoint | null;
  /** The point's index in `points`, or {@link SPLINE_PEAK_SOURCE} for the peak. */
  index: number;
}

/**
 * Step two: the arch along the body.
 *
 * Where it ends is not entered. The arch runs *into* the channel's inner flank
 * and stops where it meets it tangentially, and both the takeoff depth and the
 * span come back out of that solve.
 */
@Component({
  selector: 'app-ceruti-long-arching-panel',
  imports: [FormsModule, DecimalPipe, NumberStepperDirective, RowReorderDirective],
  templateUrl: './long-arching-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class LongArchingPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;
  protected readonly peakSource = SPLINE_PEAK_SOURCE;

  private highlightedPlate: 'top' | 'bottom' | null = null;
  private highlightedSource = SPLINE_PEAK_SOURCE;

  /** Last solve per plate, kept so the template can report it without re-solving. */
  private solved: { top: LongArchSolve | null; bottom: LongArchSolve | null } = { top: null, bottom: null };

  /** The rib pair as last accepted, so a taper that overruns the body can be put back. */
  private acceptedRibHeights: { lower: number; upper: number } | null = null;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  get arching(): ArchingParams { return this.params.arching!; }
  get topArch(): ArchCurve { return this.arching.top.arch; }
  get bottomArch(): ArchCurve { return this.arching.bottom.arch; }
  get topSpline(): ArchSpline | null { return this.topArch.type === 'spline' ? this.topArch : null; }
  get bottomSpline(): ArchSpline | null { return this.bottomArch.type === 'spline' ? this.bottomArch : null; }

  archFor(plate: 'top' | 'bottom'): ArchCurve {
    return plate === 'top' ? this.topArch : this.bottomArch;
  }

  // the peak is a knot like the rest, listed wherever the maker put it rather than pinned to the
  // top; `index` doubles as the highlight/guide source, {@link SPLINE_PEAK_SOURCE} for the peak.
  splineRows(arch: ArchSpline): SplineRow[] {
    const rows: SplineRow[] = arch.points.map((pt, index) => ({ pt, index }));
    rows.splice(splinePeakRow(arch), 0, { pt: null, index: SPLINE_PEAK_SOURCE });
    return rows;
  }

  gouge(plate: 'top' | 'bottom'): FlutingParams {
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    return (plateParams.fluting ??= defaultFlutingParams(this.params));
  }

  /**
   * True when the arch and channel cannot meet at all — the one case the maker
   * must resolve, and the only thing the solve has to say that isn't already
   * visible in the section beside it.
   */
  unsolvable(plate: 'top' | 'bottom'): boolean {
    return this.solved[plate] === null && this.archFor(plate).archHeight > 0;
  }

  setCurveType(plate: 'top' | 'bottom', type: ArchCurve['type']): void {
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    if (plateParams.arch.type === type) return;
    const h = plateParams.arch.archHeight;
    switch (type) {
      case 'catenary':
        plateParams.arch = { type: 'catenary', archHeight: h };
        break;
      case 'cycloid':
        plateParams.arch = { type: 'cycloid', archHeight: h, d: 1 };
        break;
      case 'spline':
        // unmirrored: a long arch is rarely symmetric end to end (upper/lower bouts carry
        // different wood), so it's seeded free to shape apart rather than forcing a mirrored pair.
        plateParams.arch = {
          type: 'spline', archHeight: h, peak: 0.5, peakRow: 2,
          points: [
            { t: 0.875, z: +(h * 0.55).toFixed(1), mirror: false },
            { t: 0.75, z: +(h * 0.85).toFixed(1), mirror: false },
            { t: 0.25, z: +(h * 0.85).toFixed(1), mirror: false },
            { t: 0.125, z: +(h * 0.55).toFixed(1), mirror: false },
          ],
        };
        break;
    }
    this.onChange();
  }

  /** The peak sits at exactly this height, so on a spline it also caps every control point. */
  setArchHeight(plate: 'top' | 'bottom', mm: number): void {
    const arch = this.archFor(plate);
    arch.archHeight = Math.max(mm || 0, 0);
    if (arch.type === 'spline') clampSplinePointHeights(arch.points, arch.archHeight);
    this.onChange();
  }

  setSplinePointHeight(plate: 'top' | 'bottom', pt: ArchSplinePoint, mm: number): void {
    const arch = this.archFor(plate);
    if (arch.type !== 'spline') return;
    pt.z = clamp(mm || 0, 0, arch.archHeight);
    this.onChange();
  }

  splinePeakPct(arch: ArchSpline): number {
    return Math.round((arch.peak ?? 0.5) * 100);
  }

  setSplinePeakPct(arch: ArchSpline, pct: number): void {
    arch.peak = clamp(pct / 100, 0.05, 0.95);
    this.onChange();
  }

  setSplinePointPosPct(plate: 'top' | 'bottom', pt: ArchSplinePoint, pct: number): void {
    pt.t = clamp(pct || 0, 1, 99) / 100;
    this.onChange();
  }

  addSplinePoint(plate: 'top' | 'bottom'): void {
    const arch = this.archFor(plate);
    if (arch.type !== 'spline') return;
    // Fill the widest gap in the curve as it stands — mirrored twins and the
    // peak included, since those are the knots actually on screen.
    const boundaries: { t: number; z: number }[] = [
      { t: 0, z: 0 },
      ...archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5),
      { t: 1, z: 0 },
    ];
    let maxGap = 0, gapIdx = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const gap = boundaries[i + 1].t - boundaries[i].t;
      if (gap > maxGap) { maxGap = gap; gapIdx = i; }
    }
    const t = +((boundaries[gapIdx].t + boundaries[gapIdx + 1].t) / 2).toFixed(3);
    const z = +((boundaries[gapIdx].z + boundaries[gapIdx + 1].z) / 2).toFixed(1);

    // inserted between the rows it belongs among, rather than sorting the whole list, so a
    // hand-arranged order survives. table direction is read off its own ends, not assumed.
    const rows = this.splineRows(arch);
    const rowT = (row: SplineRow) => row.pt ? row.pt.t : arch.peak ?? 0.5;
    const descending = rows.length > 1 && rowT(rows[0]) > rowT(rows[rows.length - 1]);
    const at = rows.findIndex(row => descending ? rowT(row) < t : rowT(row) > t);
    const row = at < 0 ? rows.length : at;
    const peakRow = splinePeakRow(arch);
    // mirror explicitly false — an absent flag reads as a legacy half-span point to the loader.
    arch.points.splice(peakRow < row ? row - 1 : row, 0, { t, z, mirror: false });
    if (row <= peakRow) arch.peakRow = peakRow + 1;
    this.onChange();
  }

  removeSplinePoint(plate: 'top' | 'bottom', index: number): void {
    const arch = this.archFor(plate);
    if (arch.type !== 'spline') return;
    arch.points.splice(index, 1);
    // shift peakRow so the peak stays between the same points rather than sliding down one.
    const peakRow = splinePeakRow(arch);
    if (index < peakRow) arch.peakRow = peakRow - 1;
    this.onChange();
  }

  // row order carries nothing to the geometry — archSplineKnots sorts by position — this is
  // purely so the maker can read the table back in the order the arch runs in.
  moveSplineRow(plate: 'top' | 'bottom', move: RowMove): void {
    const arch = this.archFor(plate);
    if (arch.type !== 'spline') return;
    arch.peakRow = applyRowMove(arch.points, splinePeakRow(arch), move);
    this.onChange();
  }

  toggleSplineMirror(pt: ArchSplinePoint): void {
    pt.mirror = !pt.mirror;
    this.onChange();
  }

  onSplinePointFocus(plate: 'top' | 'bottom', source: number): void {
    this.highlightedPlate = plate;
    this.highlightedSource = source;
    this.emitImmediate(false);
  }

  onSplinePointBlur(): void {
    this.highlightedPlate = null;
    this.emitImmediate(false);
  }

  private splineHighlightFor(plate: 'top' | 'bottom'): HighlightedSplinePoint | null {
    return this.highlightedPlate === plate
      ? { source: this.highlightedSource, color: plate === 'top' ? this.colors.archTop : this.colors.archBack }
      : null;
  }

  public buildRun(): RenderLayer[] {
    this.params.arching ??= defaultArchingParams(this.params.height);
    this.enforceRibTaper();
    calculateOuterArcs(this.params);
    for (const plate of ['top', 'bottom'] as const) {
      this.solved[plate] = solveLongArch(this.params, this.archFor(plate), this.gouge(plate));
    }
    return [renderBodySection(this.params, this.colors, {
      solved: this.solved,
      gouge: { top: this.gouge('top'), bottom: this.gouge('bottom') },
      highlight: plate => this.splineHighlightFor(plate),
      showGuides: this.flags.showModuleGuides,
    })];
  }

  // rolls back past maxRibTaperMm rather than clamping: two fields feed the one constraint, and
  // clamping would have to guess which one just moved.
  private enforceRibTaper(): void {
    const a = this.arching;
    const taper = a.ribHeightLower - a.ribHeightUpper;
    if (!Number.isFinite(taper)) return; // field cleared mid-typing, not an over-taper

    const max = maxRibTaperMm(this.params);
    if (Math.abs(taper) <= max) {
      this.acceptedRibHeights = { lower: a.ribHeightLower, upper: a.ribHeightUpper };
      return;
    }
    // a recipe that arrived already over the bound has nothing to roll back to but its own height.
    const back = this.acceptedRibHeights ?? { lower: a.ribHeightLower, upper: a.ribHeightLower };
    a.ribHeightLower = back.lower;
    a.ribHeightUpper = back.upper;
    this.acceptedRibHeights = back;
    error(
      `The ribs can taper by at most ${max.toFixed(1)}mm over a body this long. ` +
      `Past that the rib line runs longer than the instrument itself, and there is no garland that shape.`,
      'Invalid Rib Taper',
    );
  }
}
