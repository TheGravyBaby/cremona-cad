import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Pt, Rectangle } from '../../../models/types';
import { renderLine, renderPath, renderRect } from '../../../helpers/renderFuncs';
import { archSplineKnots, buildCatenaryPath, buildCycloidPath, buildSplinePath, SPLINE_PEAK_SOURCE } from '../../../helpers/svgPathMath';
import { clamp } from '../../../helpers/draftMath';
import {
  ArchCurve, ArchSpline, ArchSplinePoint, ArchingParams, CerutiColors, CerutiViewFlags,
  EnricoCerutiParams, FlutingParams,
} from '../../ceruti-types';
import { clampSplinePointHeights, defaultArchingParams } from '../../ceruti-arching';
import {
  defaultFlutingParams, channelCapPath, LongArchSolve, solveLongArch,
} from '../../ceruti-gouged';
import { calculateOuterArcs } from '../../ceruti-calcs';
import {
  archHeightInfo, curveTypeInfo, transitionInfo, plateThicknessInfo, ribHeightInfo,
  splinePointInfo, trochoidFactorInfo,
} from '../../ceruti-helpers';
import { HighlightedSplinePoint } from '../../renders/render-constants';
import { renderArchGuide, renderSplineHighlight } from '../../renders/long-arch.render';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

/**
 * Step two: the arch along the body.
 *
 * Where it ends is not entered. The arch runs *into* the channel's inner flank
 * and stops where it meets it tangentially, and both the takeoff depth and the
 * span come back out of that solve.
 */
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
        plateParams.arch = {
          type: 'spline', archHeight: h, peak: 0.5,
          points: [
            { t: 0.15, z: +(h * 0.8).toFixed(1), mirror: true },
            { t: 0.3, z: h, mirror: true },
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
    arch.points.push({ t, z, mirror: Math.abs(t - 0.5) > 0.01 });
    arch.points.sort((a, b) => a.t - b.t);
    this.onChange();
  }

  removeSplinePoint(plate: 'top' | 'bottom', index: number): void {
    const arch = this.archFor(plate);
    if (arch.type !== 'spline') return;
    arch.points.splice(index, 1);
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

  protected buildRun(): RenderLayer[] {
    this.params.arching ??= defaultArchingParams(this.params.height);
    calculateOuterArcs(this.params);
    for (const plate of ['top', 'bottom'] as const) {
      this.solved[plate] = solveLongArch(this.params, this.archFor(plate), this.gouge(plate));
    }
    return [this.section()];
  }

  /**
   * The instrument's side profile: the rib between the two plates, the top growing up off it and
   * the back down. Both plates share one view — they are two faces of one
   * instrument here, not two objects to compare side by side the way the plan
   * views in the channel panel are.
   */
  private section(): RenderLayer {
    const p = this.params;
    const a = this.arching;
    return (g: any, ui: any): void => {
      renderRect(
        new Rectangle({ x: 0, y: p.overhang }, { x: a.ribHeight, y: p.height - p.overhang }),
        this.colors.mouldTrace,
      )(g, ui);
      // The corner positions, to locate the C-bout against the profile.
      for (const corner of [p.bouts.UCr, p.bouts.LCr]) {
        if (corner) renderLine(new Pt(0, corner.y), new Pt(a.ribHeight, corner.y), this.colors.mouldTrace)(g, ui);
      }
      this.platePart(g, ui, 'top');
      this.platePart(g, ui, 'bottom');
    };
  }

  /**
   * One plate: its inner face, the flat land at each cap, the channel, and the
   * arch. No slab outline — over everything but the last few millimetres the
   * plate's outer surface *is* the arch, so a rectangle drawn at plate level
   * would contradict the very curve the panel exists to show.
   */
  private platePart(g: any, ui: any, plate: 'top' | 'bottom'): void {
    const p = this.params;
    const a = this.arching;
    const isTop = plate === 'top';
    const sign: 1 | -1 = isTop ? 1 : -1;
    const thickness = isTop ? a.top.thickness : a.bottom.thickness;
    // Inner face of the plate: the rib's top for the top plate, the mould line
    // for the back. The outer face is one thickness beyond it.
    const innerZ = isTop ? a.ribHeight : 0;
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
      renderArchGuide(lowered, span, yStart, xBase, sign, color)(g, ui);
    }
  }
}

/** The arch path for whichever curve type the plate carries — mirrors ceruti-arching's private builder. */
function buildArchPathFor(arch: ArchCurve, span: number, yStart: number, xBase: number, sign: 1 | -1): string {
  switch (arch.type) {
    case 'catenary': return buildCatenaryPath(arch.archHeight, span, yStart, xBase, sign);
    case 'cycloid':  return buildCycloidPath(arch.archHeight, span, yStart, xBase, sign, arch.d);
    case 'spline':   return buildSplinePath(arch.archHeight, span, yStart, xBase, sign, arch.points, arch.peak);
  }
}
