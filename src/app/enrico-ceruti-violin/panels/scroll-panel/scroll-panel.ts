import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, NeckParams, RenderToggleKey, VoluteParams } from '../../ceruti-types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { defaultNeckParams, standardNutLength } from '../../ceruti-neck';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { arcPathData } from '../../../helpers/math/pathMath';
import { renderCircle, renderCrosshair, renderPath, renderPolygon, renderSegment } from '../../../helpers/renderFuncs';
import { Pt } from '../../../models/types';
import { STROKE_WEIGHT } from '../../renders/render-constants';
import { defaultArcRadii, fitVolute, layoutVolute, VOLUTE_STYLES } from './volute';

@Component({
  selector: 'app-ceruti-scroll-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './scroll-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides'];

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

  protected readonly nearestFraction = nearestFraction;

  get neck(): NeckParams { return this.params.neck!; }
  get volute(): VoluteParams { return this.params.volute!; }
  arcColor(i: number): string { return arcColor(this.colors, i); }

  // the four point arc whose field has focus, innermost first
  private highlightedArc: number | null = null;

  onArcFocus(i: number): void {
    this.highlightedArc = i;
    this.emitImmediate(false);
  }

  onArcBlur(): void {
    this.highlightedArc = null;
    this.emitImmediate(false);
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    p.volute ??= defaultVoluteParams(p);
    fitEye(p);
    return [renderScroll(p, this.colors, this.flags.showModuleGuides, this.highlightedArc)];
  }
}

// a four point arc's colour, innermost first: each turn a bout's colour, its quarters stepping
// through that colour's off shades so neighbours in a turn read apart
export function arcColor(colors: CerutiColors, i: number): string {
  const turns = [
    [colors.upperBout, colors.upperBoutOff, colors.upperBoutOff2],
    [colors.centerBout, colors.centerBoutOff, colors.centerBoutOff2],
    [colors.lowerBout, colors.lowerBoutOff, colors.lowerBoutOff2],
  ];
  return turns[Math.floor(i / 4)][[0, 1, 2, 1][i % 4]];
}

// a Salviati on a 1.7 mm eye is what fitted the Betts scroll; everything defaults from there
export function defaultVoluteParams(p: EnricoCerutiParams): VoluteParams {
  const { scrollLength, scrollDepth } = p.neck!;
  const eyeRadius = Math.round(1.7 * (p.height / 355) * 10) / 10;
  const v = { style: 'salviati' as const, eyeRadius, arcRadii: defaultArcRadii(eyeRadius) };
  // the height where the crown starts as the spiral's own next quarter; the field is the user's after this
  const eye = fitVolute(v, scrollLength) ?? new Pt(-scrollDepth, scrollLength);
  return {
    ...v, fitToBox: true,
    eyeX: Math.round((scrollDepth + eye.x) * 100) / 100,
    eyeY: Math.round((eye.y - scrollLength) * 100) / 100,
  };
}

// writes the fitted Eye X into its field, to the hundredth, every pass the fit is on, so turning
// it off leaves the eye where it was
export function fitEye(p: EnricoCerutiParams): void {
  const v = p.volute!;
  const eye = v.fitToBox ? fitVolute(v, p.neck!.scrollLength) : null;
  if (eye) v.eyeX = Math.round((p.neck!.scrollDepth + eye.x) * 100) / 100;
}

// the scroll in its own frame: the nut at the origin, length up +y, depth toward -x (the back's
// side, as in the neck panel), so the box sits square to the axes with the neck's tilt taken out.
// The nut and the neck's end are drawn for context only — the neck open at the bottom, stopping
// a little way down. The guides are the style's construction: the figure its centres are found on,
// and each arc's centre with the two radii that bound it, the way the compass swept it, the crown
// and throat included.
export function renderScroll(p: EnricoCerutiParams, colors: CerutiColors, showGuides: boolean, highlightedArc: number | null = null) {
  const { scrollLength, scrollDepth, thickness, nutThickness } = p.neck!;
  const { eyeRadius, eyeX, eyeY } = p.volute!;
  const nutLength = standardNutLength(p.height);
  const neckStub = 0.25 * scrollLength;

  const box = [new Pt(0, 0), new Pt(0, scrollLength), new Pt(-scrollDepth, scrollLength), new Pt(-scrollDepth, 0)];
  const nut = [new Pt(0, 0), new Pt(0, nutLength), new Pt(nutThickness, nutLength), new Pt(nutThickness, 0)];
  const neck = [new Pt(0, -neckStub), new Pt(0, 0), new Pt(-thickness, 0), new Pt(-thickness, -neckStub)];

  const eye = new Pt(eyeX - scrollDepth, scrollLength + eyeY);
  const volute = layoutVolute(p.volute!, eye, scrollLength, scrollDepth);

  return (g: any, ui: any): void => {
    renderPolygon(nut, colors.fingerboard, STROKE_WEIGHT.section)(g, ui);
    neck.slice(1).forEach((pt, i) => renderSegment(neck[i], pt, colors.neckOff, STROKE_WEIGHT.section)(g, ui));
    renderPolygon(box, colors.neck, STROKE_WEIGHT.section)(g, ui);

    if (!volute) return;
    const { spiral, crown, throat, guides } = volute;
    renderCircle({ x: eye.x, y: eye.y, r: eyeRadius }, colors.neckOff)(g, ui);
    // the four point's arcs wear their fields' colours; the fixed historical ones need no telling apart
    const custom = p.volute!.style === 'fourPoint';
    const inward = [...spiral].reverse();
    const lit = custom && highlightedArc !== null ? inward[highlightedArc] : undefined;
    if (lit) renderPath(arcPathData(lit.center, lit.r, lit.from, lit.to), arcColor(colors, highlightedArc!), 12, 0.33)(g, ui);
    inward.forEach(({ center, r, from, to }, i) => {
      renderPath(arcPathData(center, r, from, to), custom ? arcColor(colors, i) : colors.outerTrace, STROKE_WEIGHT.trace)(g, ui);
    });
    // lighter: the crown and throat belong to the scroll's body, not the spiral
    const body = [crown, throat].filter(a => a !== null);
    for (const { center, r, from, to } of body) {
      renderPath(arcPathData(center, r, from, to), colors.outerTrace, STROKE_WEIGHT.trace, 0.55)(g, ui);
    }

    if (!showGuides) return;
    const guide = colors.neckOff;
    for (const line of guides) {
      line.slice(1).forEach((pt, i) => renderSegment(line[i], pt, guide, STROKE_WEIGHT.guide, true)(g, ui));
    }
    for (const { center, r, from, to } of [...spiral, ...body]) {
      // small enough that Goldmann's innermost four, a third of the eye's radius apart, stay distinct
      renderCrosshair(center, guide, eyeRadius / 12, 1, 0.8)(g, ui);
      for (const a of [from, to]) {
        renderSegment(center, new Pt(center.x + r * Math.cos(a), center.y + r * Math.sin(a)), guide, STROKE_WEIGHT.guide, true)(g, ui);
      }
    }
  };
}
