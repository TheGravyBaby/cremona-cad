import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, NeckParams, RenderToggleKey, VoluteParams, VoluteStyle } from '../../ceruti-types';
import { defaultNeckParams, standardNutLength } from '../../ceruti-neck';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { arcPathData } from '../../../helpers/math/pathMath';
import { angleWithinSweep } from '../../../helpers/math/simpleGeometry';
import { renderCircle, renderPath, renderPolygon, renderSegment } from '../../../helpers/renderFuncs';
import { Pt } from '../../../models/types';
import { STROKE_WEIGHT } from '../../renders/render-constants';

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

  get neck(): NeckParams { return this.params.neck!; }
  get volute(): VoluteParams { return this.params.volute!; }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    p.volute ??= defaultVoluteParams(p);
    return [renderScroll(p, this.colors)];
  }
}

export function defaultVoluteParams(p: EnricoCerutiParams): VoluteParams {
  const k = p.height / 355;
  return { eyeRadius: Math.round(3.5 * k * 2) / 2, style: 'serlio' };
}

// One arc of the spiral, drawn counterclockwise from `from` to `to`, in the eye's own frame:
// origin at the eye's centre, the line of centres along +x.
type VoluteArc = { center: Pt; r: number; from: number; to: number };

// Serlio (1537), outermost arc first, in eye diameters: where each centre sits on the axis, its
// radius, and which side of the axis it bulges to. The line of centres is the eye's own
// diameter cut in sixths, and each radius is the last less the distance between the two centres.
// The sixth arc, radius 4, is left to the transition curve.
const SERLIO_ARCS: readonly { center: number; radius: number; side: 'up' | 'down' }[] = [
  { center: -3 / 6, radius: 3, side: 'up' },
  { center: 2 / 6, radius: 13 / 6, side: 'down' },
  { center: -2 / 6, radius: 3 / 2, side: 'up' },
  { center: 1 / 6, radius: 1, side: 'down' },
  { center: -1 / 6, radius: 2 / 3, side: 'up' },
];

// a style's outermost arc runs from the axis on the right up to its top, where the transition
// curve takes over
const OUTERMOST_ARC_SWEEP = Math.PI / 2;

function serlioArcs(eyeRadius: number): VoluteArc[] {
  const d = 2 * eyeRadius;
  return SERLIO_ARCS.map(({ center, radius, side }, i) => {
    const from = side === 'up' ? 0 : Math.PI;
    const sweep = i === 0 ? OUTERMOST_ARC_SWEEP : Math.PI;
    return { center: new Pt(center * d, 0), r: radius * d, from, to: from + sweep };
  });
}

const VOLUTE_STYLES: Record<VoluteStyle, (eyeRadius: number) => VoluteArc[]> = {
  serlio: serlioArcs,
};

// where the spiral reaches furthest up and furthest right of its eye
function extremes(arcs: VoluteArc[]): { top: number; right: number } {
  let top = -Infinity;
  let right = -Infinity;
  for (const { center, r, from, to } of arcs) {
    const angles = [from, to, 0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]
      .filter(a => angleWithinSweep(a, from, to));
    for (const a of angles) {
      top = Math.max(top, center.y + r * Math.sin(a));
      right = Math.max(right, center.x + r * Math.cos(a));
    }
  }
  return { top, right };
}

// the scroll in its own frame: the nut at the origin, length up +y, depth toward -x (the back's
// side, as in the neck panel), so the box sits square to the axes with the neck's tilt taken out.
// The nut and the neck's end are drawn for context only — the neck open at the bottom, stopping
// a little way down.
export function renderScroll(p: EnricoCerutiParams, colors: CerutiColors) {
  const { scrollLength, scrollDepth, thickness, nutThickness } = p.neck!;
  const { eyeRadius, style } = p.volute!;
  const nutLength = standardNutLength(p.height);
  const neckStub = 0.25 * scrollLength;

  const box = [new Pt(0, 0), new Pt(0, scrollLength), new Pt(-scrollDepth, scrollLength), new Pt(-scrollDepth, 0)];
  const nut = [new Pt(0, 0), new Pt(0, nutLength), new Pt(nutThickness, nutLength), new Pt(nutThickness, 0)];
  const neck = [new Pt(0, -neckStub), new Pt(0, 0), new Pt(-thickness, 0), new Pt(-thickness, -neckStub)];

  // the eye is placed so the spiral's top touches the box's top and its right side the box's front
  const arcs = eyeRadius > 0 ? VOLUTE_STYLES[style](eyeRadius) : [];
  const { top, right } = extremes(arcs);
  const eye = new Pt(-right, scrollLength - top);

  return (g: any, ui: any): void => {
    renderPolygon(nut, colors.fingerboard, STROKE_WEIGHT.section)(g, ui);
    neck.slice(1).forEach((pt, i) => renderSegment(neck[i], pt, colors.neckOff, STROKE_WEIGHT.section)(g, ui));
    renderPolygon(box, colors.neck, STROKE_WEIGHT.section)(g, ui);

    if (!arcs.length) return;
    renderCircle({ x: eye.x, y: eye.y, r: eyeRadius }, colors.neckOff)(g, ui);
    for (const { center, r, from, to } of arcs) {
      renderPath(arcPathData(new Pt(eye.x + center.x, eye.y + center.y), r, from, to), colors.outerTrace, STROKE_WEIGHT.trace)(g, ui);
    }

    // leaves the outermost arc at its top and is tangent to the box top there, so its centre sits
    // straight below, and it reaches the box's back edge a quarter turn on
    const outer = arcs[0];
    const transitionR = eye.x + outer.center.x + scrollDepth;
    if (transitionR > 0) {
      const top = new Pt(eye.x + outer.center.x, eye.y + outer.center.y + outer.r);
      renderPath(arcPathData(new Pt(top.x, top.y - transitionR), transitionR, Math.PI / 2, Math.PI), colors.outerTrace, STROKE_WEIGHT.trace, 0.55)(g, ui);
    }
  };
}
