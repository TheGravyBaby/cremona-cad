import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Circle, Pt, Rectangle } from '../../../models/types';
import { renderCircle, renderCrosshair, renderLine, renderMeasure, renderPath, renderPointHalo, renderRect } from '../../../helpers/renderFuncs';
import {
  ArchCatenary, ArchCycloid, ArchCurve,
  ArchSpline, ArchSplinePoint,
  ArchingParams, CerutiColors, CerutiViewFlags, EnricoCerutiParams,
} from '../../ceruti-types';
import { calculateLongArch, clampSplinePointHeights, defaultArchingParams } from '../../ceruti-arching';
import { clamp } from '../../../helpers/draftMath';
import { archSplineKnots, SPLINE_PEAK_SOURCE } from '../../../helpers/svgPathMath';
import { HighlightedSplinePoint } from '../../renders/render-constants';
import { calculateOuterArcs } from '../../ceruti-calcs';
import { buildPlateSurfaceModel, calculateLongArchSectionFluting } from '../../ceruti-surface';
import {
  archHeightInfo, crossArchEdgeDepthInfo, curveTypeInfo, plateThicknessInfo, ribHeightInfo,
  splinePointInfo, trochoidFactorInfo,
} from '../../ceruti-helpers';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

@Component({
  selector: 'app-ceruti-long-arching-panel',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './long-arching-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class LongArchingPanel extends CerutiPanelBase implements OnInit {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly ribHeightInfo      = ribHeightInfo;
  protected readonly archHeightInfo     = archHeightInfo;
  protected readonly plateThicknessInfo = plateThicknessInfo;
  protected readonly trochoidFactorInfo = trochoidFactorInfo;
  protected readonly curveTypeInfo      = curveTypeInfo;
  protected readonly splinePointInfo    = splinePointInfo;
  protected readonly archEdgeDepthInfo  = crossArchEdgeDepthInfo;
  protected readonly peakSource         = SPLINE_PEAK_SOURCE;

  private highlightedPlate: 'top' | 'bottom' | null = null;
  private highlightedSource = SPLINE_PEAK_SOURCE;

  /** The focused control point when it belongs to `plate`, else null (that plate draws no halo). */
  private splineHighlightFor(plate: 'top' | 'bottom'): HighlightedSplinePoint | null {
    return this.highlightedPlate === plate
      ? { source: this.highlightedSource, color: plate === 'top' ? this.colors.archTop : this.colors.archBack }
      : null;
  }

  /** `source` is the point's index in the plate's `points`, or {@link SPLINE_PEAK_SOURCE} for the peak row. */
  onSplinePointFocus(plate: 'top' | 'bottom', source: number): void {
    this.highlightedPlate = plate;
    this.highlightedSource = source;
    this.emitImmediate(false);
  }

  onSplinePointBlur(): void {
    this.highlightedPlate = null;
    this.emitImmediate(false);
  }

  ngOnInit(): void {
    // No format migration here on purpose: ceruti-violin's onRecipeAdopted has already run
    // normalizeArchingParams on every load path, so `params.arching` is current by the time this
    // panel can mount. Migrating here as well was the old arrangement, and it left every other
    // consumer of a spline arch (surface, 3D preview, exports) reading legacy coordinates
    // whenever the user never opened this panel.
    this.emitImmediate();
  }

  get arching(): ArchingParams    { return this.params.arching!; }
  get topArch(): ArchCurve        { return this.arching.top.arch; }
  get bottomArch(): ArchCurve     { return this.arching.bottom.arch; }

  get topCatenary(): ArchCatenary | null {
    return this.topArch.type === 'catenary' ? this.topArch : null;
  }
  get topCycloid(): ArchCycloid | null {
    return this.topArch.type === 'cycloid' ? this.topArch : null;
  }
  get topSpline(): ArchSpline | null {
    return this.topArch.type === 'spline' ? this.topArch : null;
  }

  get bottomCatenary(): ArchCatenary | null {
    return this.bottomArch.type === 'catenary' ? this.bottomArch : null;
  }
  get bottomCycloid(): ArchCycloid | null {
    return this.bottomArch.type === 'cycloid' ? this.bottomArch : null;
  }
  get bottomSpline(): ArchSpline | null {
    return this.bottomArch.type === 'spline' ? this.bottomArch : null;
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
        plateParams.arch = {
          type: 'spline',
          archHeight: h,
          peak: 0.5,
          // A mirrored point at 30% and the peak's own height gives the flat
          // shoulder common on Cremonese arches; a second at 15%, 4/5 height,
          // shapes the rise into that shoulder rather than leaving it a straight ramp.
          points: [
            { t: 0.15, z: +(h * 0.8).toFixed(1), mirror: true },
            { t: 0.3, z: h, mirror: true },
          ],
        };
        break;
    }
    this.onChange();
  }

  /**
   * Sets a plate's arch height. The peak sits at exactly this height, so on a
   * spline it is also the ceiling on every control point — lowering it brings
   * any point above it down too (see {@link clampSplinePointHeights}).
   */
  setArchHeight(plate: 'top' | 'bottom', mm: number): void {
    const arch = (plate === 'top' ? this.arching.top : this.arching.bottom).arch;
    arch.archHeight = Math.max(mm || 0, 0);
    if (arch.type === 'spline') clampSplinePointHeights(arch.points, arch.archHeight);
    this.onChange();
  }

  /** Sets one control point's height, held at or below the peak. */
  setSplinePointHeight(plate: 'top' | 'bottom', pt: ArchSplinePoint, mm: number): void {
    const arch = plate === 'top' ? this.topSpline : this.bottomSpline;
    if (!arch) return;
    pt.z = clamp(mm || 0, 0, arch.archHeight);
    this.onChange();
  }

  /** The peak's position as a whole percent, for the panel's number input. */
  splinePeakPct(arch: ArchSpline): number {
    return Math.round((arch.peak ?? 0.5) * 100);
  }

  setSplinePeakPct(arch: ArchSpline, pct: number): void {
    // Held clear of the plate ends: the peak is what pins the arch height, and
    // it has to stay an interior knot to do that.
    arch.peak = Math.min(Math.max(pct / 100, 0.05), 0.95);
    this.onChange();
  }

  addSplinePoint(plate: 'top' | 'bottom'): void {
    const arch = (plate === 'top' ? this.arching.top : this.arching.bottom).arch as ArchSpline;
    // Fill the widest gap in the curve as it currently stands — mirrored twins
    // and the peak included, since those are the knots actually on screen.
    const boundaries: { t: number; z: number }[] = [
      { t: 0, z: 0 },
      ...archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5),
      { t: 1, z: 0 },
    ];
    let maxGap = 0;
    let gapIdx = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const gap = boundaries[i + 1].t - boundaries[i].t;
      if (gap > maxGap) { maxGap = gap; gapIdx = i; }
    }
    const t = +((boundaries[gapIdx].t + boundaries[gapIdx + 1].t) / 2).toFixed(3);
    const z = +((boundaries[gapIdx].z + boundaries[gapIdx + 1].z) / 2).toFixed(1);
    // Symmetric by default; a point already on the mid-length has nothing to mirror to.
    arch.points.push({ t, z, mirror: Math.abs(t - 0.5) > 0.01 });
    arch.points.sort((a, b) => a.t - b.t);
    this.onChange();
  }

  removeSplinePoint(plate: 'top' | 'bottom', index: number): void {
    const arch = (plate === 'top' ? this.arching.top : this.arching.bottom).arch as ArchSpline;
    arch.points.splice(index, 1);
    this.onChange();
  }

  toggleSplineMirror(pt: ArchSplinePoint): void {
    pt.mirror = !pt.mirror;
    this.onChange();
  }

  onChange(): void {
    this.emitDebounced();
  }

  protected buildRun(): RenderLayer[] {
    if (!this.params.arching) {
      this.params.arching = defaultArchingParams(this.params.height);
    }
    // The surface models chord the outer/inset/fluting paths, whose corner arcs must be current.
    calculateOuterArcs(this.params);
    const { span, yStart, topPath, backPath } = calculateLongArch(this.params);
    const topModel = buildPlateSurfaceModel(this.params, 'top');
    const backModel = buildPlateSurfaceModel(this.params, 'bottom');
    const topFluting = topModel ? calculateLongArchSectionFluting(this.params, topModel) : null;
    const backFluting = backModel ? calculateLongArchSectionFluting(this.params, backModel) : null;
    return [
      renderLongArchBoxes(
        this.params,
        this.params.arching,
        this.colors,
        this.flags.showModuleGuides,
        topPath,
        backPath,
        span,
        yStart,
        topFluting,
        backFluting,
        this.splineHighlightFor('top'),
        this.splineHighlightFor('bottom'),
      ),
    ];
  }
}

/**
 * Halo behind the spline control point whose textbox has focus. Drawn whether
 * or not the module guides are showing — it answers "which point am I
 * editing?", which is most useful precisely when the crosshairs are off.
 * A mirrored point halos both of its knots, since they share a source.
 */
function renderSplineHighlight(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  highlighted: HighlightedSplinePoint | null,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'spline' || !highlighted) return;
    for (const knot of archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5)) {
      if (knot.source !== highlighted.source) continue;
      renderPointHalo(new Pt(xBase + sign * knot.z, yStart + knot.t * span), highlighted.color)(g, ui);
    }
  };
}

function renderSplineGuide(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'spline') return;
    // Mark the knots the curve was actually built from — peak and mirrored
    // twins included — so a collapsed or mirrored point is visible as such.
    for (const knot of archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5)) {
      const pt = { x: xBase + sign * knot.z, y: yStart + knot.t * span };
      renderCrosshair(pt, color, 2, 1.5, 1)(g, ui);
    }
  };
}

/**
 * One height measure per spline knot (peak and every control point, mirrored
 * twins included) instead of the single centre measure the other curve types
 * get — a spline's height varies knot to knot, so one label at mid-span would
 * only ever describe the peak.
 */
function renderSplineMeasures(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'spline') return;
    for (const knot of archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5)) {
      const y = yStart + knot.t * span;
      renderMeasure(
        new Pt(xBase, y),
        new Pt(xBase + sign * knot.z, y),
        knot.z.toFixed(1),
        color, 3, 7,
      )(g, ui);
    }
  };
}

function renderCycloidGuide(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'cycloid' || arch.d <= 0.01 || arch.archHeight <= 0) return;
    const h = arch.archHeight;
    const r = h / (2 * arch.d);
    const cx = xBase + sign * (h / 2);
    const cy = yStart + span / 2;
    renderCircle(new Circle(cx, cy, r), color)(g, ui);
    renderCircle(new Circle(xBase + sign * h, cy, 1), color)(g, ui);
  };
}

export const renderLongArchBoxes = (
  p: EnricoCerutiParams,
  a: ArchingParams,
  colors: CerutiColors,
  showGuides = false,
  topPath: string,
  backPath: string,
  span: number,
  yStart: number,
  topFluting: { startPath: string; endPath: string } | null = null,
  backFluting: { startPath: string; endPath: string } | null = null,
  topHighlight: HighlightedSplinePoint | null = null,
  backHighlight: HighlightedSplinePoint | null = null,
) => (g: any, ui: any): void => {
  const ribBox = new Rectangle(
    { x: 0, y: p.overhang },
    { x: a.ribHeight, y: p.height - p.overhang },
  );
  const topPlateBox = new Rectangle(
    { x: a.ribHeight, y: 0 },
    { x: a.ribHeight + a.top.thickness, y: p.height },
  );
  const backPlateBox = new Rectangle(
    { x: -a.bottom.thickness, y: 0 },
    { x: 0, y: p.height },
  );

  // Before the curves so a halo reads as sitting behind the arch it marks.
  renderSplineHighlight(a.top.arch, span, yStart, a.ribHeight + a.top.thickness - a.top.edgeDepth, 1, topHighlight)(g, ui);
  renderSplineHighlight(a.bottom.arch, span, yStart, -a.bottom.thickness + a.bottom.edgeDepth, -1, backHighlight)(g, ui);

  if (topPath) renderPath(topPath, colors.archTop, 1.5)(g, ui);
  if (backPath) renderPath(backPath, colors.archBack, 1.5)(g, ui);


  renderRect(ribBox, colors.mouldTrace)(g, ui);

  renderLine(new Pt(a.ribHeight, 0), new Pt(a.ribHeight, p.height), colors.innerTrace)(g, ui);
  renderLine(new Pt(a.ribHeight, p.height), new Pt(a.ribHeight + a.top.thickness, p.height), colors.innerTrace)(g, ui);
  renderLine(new Pt(a.ribHeight + a.top.thickness, p.height), new Pt(a.ribHeight + a.top.thickness, p.height - p.outerFlutingDepth || 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(a.ribHeight, 0), new Pt(a.ribHeight + a.top.thickness, 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(a.ribHeight + a.top.thickness, 0), new Pt(a.ribHeight + a.top.thickness, p.outerFlutingDepth || 0), colors.innerTrace)(g, ui);
  // Carved cap recurve replaces the flat channel segments when a channel band exists.
  if (topFluting) {
    renderPath(topFluting.startPath, colors.fluting, 1.5)(g, ui);
    renderPath(topFluting.endPath, colors.fluting, 1.5)(g, ui);
  } else {
    renderLine(new Pt(a.ribHeight + a.top.thickness, p.height - p.outerFlutingDepth || 0), new Pt(a.ribHeight + a.top.thickness, p.height - p.innerFlutingDepth || 0), colors.fluting)(g, ui);
    renderLine(new Pt(a.ribHeight + a.top.thickness, p.outerFlutingDepth || 0), new Pt(a.ribHeight + a.top.thickness, p.innerFlutingDepth || 0), colors.fluting)(g, ui);
  }

  renderLine(new Pt(0, 0), new Pt(0, p.height), colors.innerTrace)(g, ui);
  renderLine(new Pt(0, 0), new Pt(-a.bottom.thickness, 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(-a.bottom.thickness, 0), new Pt(-a.bottom.thickness, p.outerFlutingDepth || 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(0, p.height), new Pt(-a.bottom.thickness, p.height), colors.innerTrace)(g, ui);
  renderLine(new Pt(-a.bottom.thickness, p.height), new Pt(-a.bottom.thickness, p.height - p.outerFlutingDepth || 0), colors.innerTrace)(g, ui);
  if (backFluting) {
    renderPath(backFluting.startPath, colors.fluting, 1.5)(g, ui);
    renderPath(backFluting.endPath, colors.fluting, 1.5)(g, ui);
  } else {
    renderLine(new Pt(-a.bottom.thickness, p.outerFlutingDepth || 0), new Pt(-a.bottom.thickness, p.innerFlutingDepth || 0), colors.fluting)(g, ui);
    renderLine(new Pt(-a.bottom.thickness, p.height - p.outerFlutingDepth || 0), new Pt(-a.bottom.thickness, p.height - p.innerFlutingDepth || 0), colors.fluting)(g, ui);
  }

  renderLine({ x: 0, y: p.bouts.UCr.y }, { x: a.ribHeight, y: p.bouts.UCr.y }, colors.mouldTrace)(g, ui);
  renderLine({ x: 0, y: p.bouts.LCr.y }, { x: a.ribHeight, y: p.bouts.LCr.y }, colors.mouldTrace)(g, ui);

  if (showGuides) {
    renderCycloidGuide(a.top.arch, span, yStart, a.ribHeight + a.top.thickness, 1, colors.archTop)(g, ui);
    renderCycloidGuide(a.bottom.arch, span, yStart, -a.bottom.thickness, -1, colors.archBack)(g, ui);
    renderSplineGuide(a.top.arch, span, yStart, a.ribHeight + a.top.thickness - a.top.edgeDepth, 1, colors.archTop)(g, ui);
    renderSplineGuide(a.bottom.arch, span, yStart, -a.bottom.thickness + a.bottom.edgeDepth, -1, colors.archBack)(g, ui);

    const midY = yStart + span / 2;
    if (a.top.arch.type === 'spline') {
      renderSplineMeasures(a.top.arch, span, yStart, a.ribHeight + a.top.thickness - a.top.edgeDepth, 1, colors.archTop)(g, ui);
    } else {
      renderMeasure(
        new Pt(a.ribHeight + a.top.thickness, midY),
        new Pt(a.ribHeight + a.top.thickness + a.top.arch.archHeight, midY),
        `${a.top.arch.archHeight.toFixed(1)}`,
        colors.archTop, 3, 7,
      )(g, ui);
    }
    if (a.bottom.arch.type === 'spline') {
      renderSplineMeasures(a.bottom.arch, span, yStart, -a.bottom.thickness + a.bottom.edgeDepth, -1, colors.archBack)(g, ui);
    } else {
      renderMeasure(
        new Pt(-a.bottom.thickness, midY),
        new Pt(-a.bottom.thickness - a.bottom.arch.archHeight, midY),
        `${a.bottom.arch.archHeight.toFixed(1)}`,
        colors.archBack, 3, 7,
      )(g, ui);
    }
  }
};
