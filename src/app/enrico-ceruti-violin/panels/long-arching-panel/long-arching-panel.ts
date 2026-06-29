import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ArchCatenary, ArchCycloid, ArchCurve,
  ArchSpline, ArchSplinePoint,
  ArchingParams, CerutiColors, CerutiViewFlags, EnricoCerutiParams,
} from '../../ceruti-types';
import {
  archHeightInfo, curveTypeInfo, plateThicknessInfo, ribHeightInfo,
  splinePointInfo, trochoidFactorInfo,
} from '../../ceruti-helpers';
import { RenderToggles } from '../../render-toggles/render-toggles';

@Component({
  selector: 'app-ceruti-long-arching-panel',
  imports: [FormsModule, DecimalPipe, RenderToggles],
  templateUrl: './long-arching-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class LongArchingPanel {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  @Output() changed = new EventEmitter<void>();

  protected readonly ribHeightInfo      = ribHeightInfo;
  protected readonly archHeightInfo     = archHeightInfo;
  protected readonly plateThicknessInfo = plateThicknessInfo;
  protected readonly trochoidFactorInfo = trochoidFactorInfo;
  protected readonly curveTypeInfo      = curveTypeInfo;
  protected readonly splinePointInfo    = splinePointInfo;

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

  onChange(): void { this.changed.emit(); }
}
