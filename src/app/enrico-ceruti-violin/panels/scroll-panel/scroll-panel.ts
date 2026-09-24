import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, NeckParams, RenderToggleKey, VoluteParams } from '../../ceruti-types';
import { defaultNeckParams, standardNutLength } from '../../ceruti-neck';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { arcPathData } from '../../../helpers/math/pathMath';
import { normalizeDegrees } from '../../../helpers/math/simpleGeometry';
import { renderCircle, renderPath, renderPolygon, renderSegment } from '../../../helpers/renderFuncs';
import { Pt } from '../../../models/types';
import { STROKE_WEIGHT } from '../../renders/render-constants';
import { layoutVolute, VOLUTE_STYLES } from './volute';

@Component({
  selector: 'app-ceruti-scroll-panel',
  imports: [DecimalPipe, FormsModule],
  templateUrl: './scroll-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = [];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  protected readonly styles = Object.entries(VOLUTE_STYLES).map(([id, { label }]) => ({ id, label }));

  get neck(): NeckParams { return this.params.neck!; }
  get volute(): VoluteParams { return this.params.volute!; }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    p.volute ??= defaultVoluteParams(p);
    if (p.volute.rotationDeg === undefined) p.volute.rotationDeg = 0;
    // a field cleared mid-typing is left alone
    if (Number.isFinite(p.volute.rotationDeg)) p.volute.rotationDeg = normalizeDegrees(p.volute.rotationDeg);
    return [renderScroll(p, this.colors)];
  }
}

export function defaultVoluteParams(p: EnricoCerutiParams): VoluteParams {
  const k = p.height / 355;
  return { eyeRadius: Math.round(3.5 * k * 2) / 2, style: 'serlio', rotationDeg: 0 };
}

// the scroll in its own frame: the nut at the origin, length up +y, depth toward -x (the back's
// side, as in the neck panel), so the box sits square to the axes with the neck's tilt taken out.
// The nut and the neck's end are drawn for context only — the neck open at the bottom, stopping
// a little way down.
export function renderScroll(p: EnricoCerutiParams, colors: CerutiColors) {
  const { scrollLength, scrollDepth, thickness, nutThickness } = p.neck!;
  const { eyeRadius, style, rotationDeg } = p.volute!;
  const nutLength = standardNutLength(p.height);
  const neckStub = 0.25 * scrollLength;

  const box = [new Pt(0, 0), new Pt(0, scrollLength), new Pt(-scrollDepth, scrollLength), new Pt(-scrollDepth, 0)];
  const nut = [new Pt(0, 0), new Pt(0, nutLength), new Pt(nutThickness, nutLength), new Pt(nutThickness, 0)];
  const neck = [new Pt(0, -neckStub), new Pt(0, 0), new Pt(-thickness, 0), new Pt(-thickness, -neckStub)];

  const volute = layoutVolute(style, eyeRadius, rotationDeg * Math.PI / 180, scrollLength, scrollDepth);

  return (g: any, ui: any): void => {
    renderPolygon(nut, colors.fingerboard, STROKE_WEIGHT.section)(g, ui);
    neck.slice(1).forEach((pt, i) => renderSegment(neck[i], pt, colors.neckOff, STROKE_WEIGHT.section)(g, ui));
    renderPolygon(box, colors.neck, STROKE_WEIGHT.section)(g, ui);

    if (!volute) return;
    const { eye, spiral, join } = volute;
    renderCircle({ x: eye.x, y: eye.y, r: eyeRadius }, colors.neckOff)(g, ui);
    for (const { center, r, from, to } of spiral) {
      renderPath(arcPathData(center, r, from, to), colors.outerTrace, STROKE_WEIGHT.trace)(g, ui);
    }
    // lighter: the join belongs to the scroll's body, not the spiral
    if (join) renderPath(arcPathData(join.center, join.r, join.from, join.to), colors.outerTrace, STROKE_WEIGHT.trace, 0.55)(g, ui);
  };
}
