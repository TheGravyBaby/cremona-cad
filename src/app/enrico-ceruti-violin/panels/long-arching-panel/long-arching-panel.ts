import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Circle, Pt, Rectangle } from '../../../models/types';
import { renderCircle, renderCrosshair, renderLine, renderMeasure, renderPath, renderRect } from '../../../helpers/renderFuncs';
import {
  ArchCatenary, ArchCycloid, ArchCurve,
  ArchSpline, ArchSplinePoint,
  ArchingParams, CerutiColors, CerutiViewFlags, EnricoCerutiParams,
} from '../../ceruti-types';
import { calculateLongArch, defaultArchingParams } from '../../ceruti-arching';
import {
  archHeightInfo, crossArchEdgeDepthInfo, curveTypeInfo, plateThicknessInfo, ribHeightInfo,
  splinePointInfo, trochoidFactorInfo,
} from '../../ceruti-helpers';
import { RenderToggles } from '../../render-toggles/render-toggles';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

@Component({
  selector: 'app-ceruti-long-arching-panel',
  imports: [FormsModule, DecimalPipe, RenderToggles],
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

  ngOnInit(): void {
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
          points: [{ t: 0.5, z: +(h * 0.45).toFixed(1) }],
        };
        break;
    }
    this.onChange();
  }

  addSplinePoint(plate: 'top' | 'bottom'): void {
    const arch = (plate === 'top' ? this.arching.top : this.arching.bottom).arch as ArchSpline;
    const sorted = [...arch.points].sort((a, b) => a.t - b.t);
    const boundaries: ArchSplinePoint[] = [
      { t: 0, z: 0 },
      ...sorted,
      { t: 1, z: arch.archHeight },
    ];
    let maxGap = 0;
    let gapIdx = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const gap = boundaries[i + 1].t - boundaries[i].t;
      if (gap > maxGap) { maxGap = gap; gapIdx = i; }
    }
    const t = +((boundaries[gapIdx].t + boundaries[gapIdx + 1].t) / 2).toFixed(3);
    const z = +((boundaries[gapIdx].z + boundaries[gapIdx + 1].z) / 2).toFixed(1);
    arch.points.push({ t, z });
    arch.points.sort((a, b) => a.t - b.t);
    this.onChange();
  }

  removeSplinePoint(plate: 'top' | 'bottom', index: number): void {
    const arch = (plate === 'top' ? this.arching.top : this.arching.bottom).arch as ArchSpline;
    arch.points.splice(index, 1);
    this.onChange();
  }

  onChange(): void {
    this.emitDebounced();
  }

  protected buildRun(): RenderLayer[] {
    if (!this.params.arching) {
      this.params.arching = defaultArchingParams(this.params.height);
    }
    const { span, yStart, topPath, backPath } = calculateLongArch(this.params);
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
      ),
    ];
  }
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
    for (const pt of arch.points) {
      const cx = xBase + sign * pt.z;
      const yHi = yStart + pt.t * span / 2;
      const yLo = yStart + span - pt.t * span / 2;
      renderCrosshair({ x: cx, y: yHi }, color, 2, 1.5, 1)(g, ui);
      renderCrosshair({ x: cx, y: yLo }, color, 2, 1.5, 1)(g, ui);
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

  if (topPath) renderPath(topPath, colors.archTop, 1.5)(g, ui);
  if (backPath) renderPath(backPath, colors.archBack, 1.5)(g, ui);


  renderRect(ribBox, colors.mouldTrace)(g, ui);

  renderLine(new Pt(a.ribHeight, 0), new Pt(a.ribHeight, p.height), colors.innerTrace)(g, ui);
  renderLine(new Pt(a.ribHeight, p.height), new Pt(a.ribHeight + a.top.thickness, p.height), colors.innerTrace)(g, ui);
  renderLine(new Pt(a.ribHeight + a.top.thickness, p.height), new Pt(a.ribHeight + a.top.thickness, p.height - p.outerFlutingDepth || 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(a.ribHeight + a.top.thickness, p.height - p.outerFlutingDepth || 0), new Pt(a.ribHeight + a.top.thickness, p.height - p.innerFlutingDepth || 0), colors.fluting)(g, ui);
  renderLine(new Pt(a.ribHeight, 0), new Pt(a.ribHeight + a.top.thickness, 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(a.ribHeight + a.top.thickness, 0), new Pt(a.ribHeight + a.top.thickness, p.outerFlutingDepth || 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(a.ribHeight + a.top.thickness, p.outerFlutingDepth || 0), new Pt(a.ribHeight + a.top.thickness, p.innerFlutingDepth || 0), colors.fluting)(g, ui);

  renderLine(new Pt(0, 0), new Pt(0, p.height), colors.innerTrace)(g, ui);
  renderLine(new Pt(0, 0), new Pt(-a.bottom.thickness, 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(-a.bottom.thickness, 0), new Pt(-a.bottom.thickness, p.outerFlutingDepth || 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(-a.bottom.thickness, p.outerFlutingDepth || 0), new Pt(-a.bottom.thickness, p.innerFlutingDepth || 0), colors.fluting)(g, ui);
  renderLine(new Pt(0, p.height), new Pt(-a.bottom.thickness, p.height), colors.innerTrace)(g, ui);
  renderLine(new Pt(-a.bottom.thickness, p.height), new Pt(-a.bottom.thickness, p.height - p.outerFlutingDepth || 0), colors.innerTrace)(g, ui);
  renderLine(new Pt(-a.bottom.thickness, p.height - p.outerFlutingDepth || 0), new Pt(-a.bottom.thickness, p.height - p.innerFlutingDepth || 0), colors.fluting)(g, ui);

  renderLine({ x: 0, y: p.bouts.UCr.y }, { x: a.ribHeight, y: p.bouts.UCr.y }, colors.mouldTrace)(g, ui);
  renderLine({ x: 0, y: p.bouts.LCr.y }, { x: a.ribHeight, y: p.bouts.LCr.y }, colors.mouldTrace)(g, ui);

  if (showGuides) {
    renderCycloidGuide(a.top.arch, span, yStart, a.ribHeight + a.top.thickness, 1, colors.archTop)(g, ui);
    renderCycloidGuide(a.bottom.arch, span, yStart, -a.bottom.thickness, -1, colors.archBack)(g, ui);
    renderSplineGuide(a.top.arch, span, yStart, a.ribHeight + a.top.thickness - a.top.edgeDepth, 1, colors.archTop)(g, ui);
    renderSplineGuide(a.bottom.arch, span, yStart, -a.bottom.thickness + a.bottom.edgeDepth, -1, colors.archBack)(g, ui);

    const midY = yStart + span / 2;
    renderMeasure(
      new Pt(a.ribHeight + a.top.thickness, midY),
      new Pt(a.ribHeight + a.top.thickness + a.top.arch.archHeight, midY),
      `${a.top.arch.archHeight.toFixed(1)}`,
      colors.archTop, 3, 7,
    )(g, ui);
    renderMeasure(
      new Pt(-a.bottom.thickness, midY),
      new Pt(-a.bottom.thickness - a.bottom.arch.archHeight, midY),
      `${a.bottom.arch.archHeight.toFixed(1)}`,
      colors.archBack, 3, 7,
    )(g, ui);
  }
};
