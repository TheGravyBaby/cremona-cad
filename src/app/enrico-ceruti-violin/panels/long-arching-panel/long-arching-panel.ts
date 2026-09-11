import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Pt } from '../../../models/types';
import { renderLine, renderPath } from '../../../helpers/renderFuncs';
import { archSplineKnots, buildCatenaryPath, buildCycloidPath, buildSplinePath, SPLINE_PEAK_SOURCE } from '../../../helpers/math/pathMath';
import { clamp } from '../../../helpers/math/simpleGeometry';
import {
  ArchCurve, ArchSpline, ArchSplinePoint, ArchingParams, CerutiColors, CerutiViewFlags,
  EnricoCerutiParams, FlutingParams, RenderToggleKey,
} from '../../ceruti-types';
import {
  clampSplinePointHeights, defaultArchingParams, maxRibTaperMm, ribHeightAt, RibTaper, solveRibTaper,
  splinePeakRow,
} from '../../ceruti-arching';
import {
  defaultFlutingParams, channelCapPath, LongArchSolve, solveLongArch,
} from '../../ceruti-arch-geometry';
import { calculateOuterArcs } from '../../ceruti-calcs';
import {
  archHeightInfo, curveTypeInfo, transitionInfo, plateThicknessInfo, ribHeightInfo,
  splinePointInfo, trochoidFactorInfo,
} from '../../ceruti-helpers';
import { HighlightedSplinePoint } from '../../renders/render-constants';
import { renderArchGuide, renderSplineHighlight } from '../../renders/long-arch.render';
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

  protected readonly ribHeightInfo = ribHeightInfo;
  protected readonly archHeightInfo = archHeightInfo;
  protected readonly plateThicknessInfo = plateThicknessInfo;
  protected readonly trochoidFactorInfo = trochoidFactorInfo;
  protected readonly curveTypeInfo = curveTypeInfo;
  protected readonly splinePointInfo = splinePointInfo;
  protected readonly transitionInfo = transitionInfo;
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

  // ===== Arch editing =====

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

  // ===== Render =====

  public buildRun(): RenderLayer[] {
    this.params.arching ??= defaultArchingParams(this.params.height);
    this.enforceRibTaper();
    calculateOuterArcs(this.params);
    for (const plate of ['top', 'bottom'] as const) {
      this.solved[plate] = solveLongArch(this.params, this.archFor(plate), this.gouge(plate));
    }
    return [this.section()];
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

  /**
   * The instrument's side profile: the rib between the two plates, the top growing up off it and
   * the back down. Both plates share one view — they are two faces of one
   * instrument here, not two objects to compare side by side the way the plan
   * views in the channel panel are.
   */
  private section(): RenderLayer {
    const p = this.params;
    const taper = solveRibTaper(p);
    // no longer a rectangle: the edge the top plate glues to runs at an angle to the back's.
    const rib: RibLine = {
      yLow: p.overhang,
      yHigh: p.height - p.overhang,
      zLow: ribHeightAt(p, p.overhang, taper),
      zHigh: ribHeightAt(p, p.height - p.overhang, taper),
    };
    return (g: any, ui: any): void => {
      renderPath(
        `M 0 ${rib.yLow} L ${rib.zLow} ${rib.yLow} L ${rib.zHigh} ${rib.yHigh} L 0 ${rib.yHigh} Z`,
        this.colors.mouldTrace, 1,
      )(g, ui);
      // The corner positions, to locate the C-bout against the profile.
      for (const corner of [p.bouts.UCr, p.bouts.LCr]) {
        if (corner) {
          renderLine(
            new Pt(0, corner.y), new Pt(ribHeightAt(p, corner.y, taper), corner.y), this.colors.mouldTrace,
          )(g, ui);
        }
      }
      // top plate drawn in its own carved frame, placed onto the tilted rib line by one transform,
      // rather than teaching the arch/channel/guides each about an angle they have no other use for.
      const tilted = this.tiltedLayers(g, ui, taper, rib);
      this.platePart(tilted.g, tilted.ui, 'top', taper);
      this.platePart(g, ui, 'bottom', taper);
    };
  }

  // rigid rotation, not a shear, so the plate reads as carved rather than leaned; pivots on the
  // plate's midpoint so it overhangs the garland equally at both ends. UI layer is Y-flipped
  // against geometry, so its transform mirrors the sign.
  private tiltedLayers(g: any, ui: any, taper: RibTaper, rib: RibLine): { g: any; ui: any } {
    const run = rib.yHigh - rib.yLow;
    if (run <= 0) return { g, ui };
    const angle = Math.atan2(rib.zLow - rib.zHigh, run) * 180 / Math.PI;
    const pivotX = taper.zLower;
    const pivotY = this.params.height / 2;
    const dx = (rib.zLow + rib.zHigh) / 2 - pivotX;
    const dy = (rib.yLow + rib.yHigh) / 2 - pivotY;
    return {
      g: g.append('g').attr('transform', `translate(${dx},${dy}) rotate(${angle},${pivotX},${pivotY})`),
      ui: ui.append('g').attr('transform', `translate(${dx},${-dy}) rotate(${-angle},${pivotX},${-pivotY})`),
    };
  }

  /**
   * One plate: its inner face, the flat land at each cap, the channel, and the
   * arch. No slab outline — over everything but the last few millimetres the
   * plate's outer surface *is* the arch, so a rectangle drawn at plate level
   * would contradict the very curve the panel exists to show.
   */
  private platePart(g: any, ui: any, plate: 'top' | 'bottom', taper: RibTaper): void {
    const p = this.params;
    const a = this.arching;
    const isTop = plate === 'top';
    const sign: 1 | -1 = isTop ? 1 : -1;
    const thickness = isTop ? a.top.thickness : a.bottom.thickness;
    // flat for both — the top plate's tilt is carried by the group it's drawn into, not here.
    const innerZ = isTop ? taper.zLower : 0;
    const outerZ = innerZ + sign * thickness;
    const color = isTop ? this.colors.archTop : this.colors.archBack;
    const gouge = this.gouge(plate);
    const solved = this.solved[plate];
    const landEdge = p.outerFlutingDepth ?? 0;

    renderLine(new Pt(innerZ, 0), new Pt(innerZ, p.height), this.colors.innerTrace)(g, ui);
    for (const [yEnd, yLand] of [[0, landEdge], [p.height, p.height - landEdge]] as const) {
      renderLine(new Pt(innerZ, yEnd), new Pt(outerZ, yEnd), this.colors.innerTrace)(g, ui);
      renderLine(new Pt(outerZ, yEnd), new Pt(outerZ, yLand), this.colors.innerTrace)(g, ui);
    }

    // The channel at both caps — identical at each end and at every station,
    // because it is the tool rather than a curve fitted to the arch. Drawn only
    // as far as the arch's contact, where the arch takes over as the surface.
    const sEnd = solved?.takeoff.contactS;
    renderPath(channelCapPath(p, gouge, outerZ, sign, true, sEnd), this.colors.fluting, 1.5)(g, ui);
    renderPath(channelCapPath(p, gouge, outerZ, sign, false, sEnd), this.colors.fluting, 1.5)(g, ui);

    if (!solved) return;
    const { span, yStart, lowered, takeoff } = solved;
    const xBase = outerZ - sign * takeoff.takeoffDepth;

    renderSplineHighlight(lowered, span, yStart, xBase, sign, this.splineHighlightFor(plate))(g, ui);
    renderPath(buildArchPathFor(lowered, span, yStart, xBase, sign), color, 1.5)(g, ui);

    if (this.flags.showModuleGuides) {
      renderArchGuide(this.archFor(plate), span, yStart, outerZ, sign, color)(g, ui);
    }
  }
}

/** The garland's top edge in the side view — the line the top plate glues to. */
interface RibLine {
  yLow: number;
  yHigh: number;
  zLow: number;
  zHigh: number;
}

/** The arch path for whichever curve type the plate carries — mirrors ceruti-arching's private builder. */
function buildArchPathFor(arch: ArchCurve, span: number, yStart: number, xBase: number, sign: 1 | -1): string {
  switch (arch.type) {
    case 'catenary': return buildCatenaryPath(arch.archHeight, span, yStart, xBase, sign);
    case 'cycloid':  return buildCycloidPath(arch.archHeight, span, yStart, xBase, sign, arch.d);
    case 'spline':   return buildSplinePath(arch.archHeight, span, yStart, xBase, sign, arch.points, arch.peak);
  }
}
