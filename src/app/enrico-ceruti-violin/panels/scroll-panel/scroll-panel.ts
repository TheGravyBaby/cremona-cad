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
import { fitVolute, layoutVolute, naturalArcRadii, pointArcCount, pointTurns, setTurnRadius, VOLUTE_STYLES } from './volute';

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
  get points(): number | undefined { return VOLUTE_STYLES[this.volute.style].points; }
  arcColor(i: number): string { return arcColor(this.colors, i, this.points!); }
  get turns(): number[][] { return pointTurns(this.points!, this.volute.arcRadii.length); }

  // each arc field's name, as the part of its turn it ends at
  protected readonly parts: Record<number, { name: string; ends: string[] }> = {
    2: { name: 'Halves', ends: ['½', '1'] },
    3: { name: 'Thirds', ends: ['⅓', '⅔', '1'] },
    4: { name: 'Quarters', ends: ['¼', '½', '¾', '1'] },
  };

  // turns tuned arc by arc, their turn field locked to its last; a view choice, so not saved
  protected readonly openTurns = new Set<number>();

  // each point spiral has its own count of arcs, so moving to one with a different count starts
  // it from its natural growth
  onStyleChange(): void {
    const points = this.points;
    if (points && this.volute.arcRadii.length !== pointArcCount(points)) {
      this.volute.arcRadii = naturalArcRadii(this.volute.eyeRadius, points);
    }
    this.onChange();
  }

  setTurn(t: number, radius: number): void {
    setTurnRadius(this.volute.arcRadii, this.points!, t, radius);
    this.onChange();
    this.onTurnFocus(t);
  }

  onTurnFocus(t: number): void {
    this.onArcFocus(...this.turns[t]);
  }

  // the point spiral's arcs whose field has focus, innermost first: one arc, or a whole turn
  private highlightedArcs: number[] = [];

  onArcFocus(...arcs: number[]): void {
    this.highlightedArcs = arcs;
    this.emitImmediate(false);
  }

  onArcBlur(): void {
    this.highlightedArcs = [];
    this.emitImmediate(false);
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    p.volute ??= defaultVoluteParams(p);
    growNaturally(p.volute);
    fitEye(p);
    return [renderScroll(p, this.colors, this.flags.showModuleGuides, this.highlightedArcs)];
  }
}

// a point spiral arc's colour, innermost first: each turn a bout's colour, its arcs stepping
// through that colour's off shades so neighbours in a turn read apart
export function arcColor(colors: CerutiColors, i: number, points: number): string {
  const turns = [
    [colors.upperBout, colors.upperBoutOff, colors.upperBoutOff2],
    [colors.centerBout, colors.centerBoutOff, colors.centerBoutOff2],
    [colors.lowerBout, colors.lowerBoutOff, colors.lowerBoutOff2],
  ];
  return turns[Math.floor(i / points)][[0, 1, 2, 1][i % points]];
}

// a Salviati on a 1.7 mm eye is what fitted the Betts scroll; everything defaults from there
export function defaultVoluteParams(p: EnricoCerutiParams): VoluteParams {
  const { scrollLength, scrollDepth } = p.neck!;
  const eyeRadius = Math.round(1.7 * (p.height / 355) * 10) / 10;
  const v = { style: 'salviati' as const, eyeRadius, arcRadii: [] };
  // the height where the crown starts as the spiral's own next quarter; the field is the user's after this
  const eye = fitVolute(v, scrollLength) ?? new Pt(-scrollDepth, scrollLength);
  return {
    ...v, customTurns: false, fitToBox: true,
    eyeX: Math.round((scrollDepth + eye.x) * 100) / 100,
    eyeY: Math.round((eye.y - scrollLength) * 100) / 100,
  };
}

// writes a point spiral's natural radii into its fields every pass until custom turns are on, so
// turning them on starts the tuning from there
export function growNaturally(v: VoluteParams): void {
  const points = VOLUTE_STYLES[v.style].points;
  if (points && !v.customTurns) v.arcRadii = naturalArcRadii(v.eyeRadius, points);
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
export function renderScroll(p: EnricoCerutiParams, colors: CerutiColors, showGuides: boolean, highlightedArcs: number[] = []) {
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
    // a point spiral's arcs wear their fields' colours; the fixed historical ones need no telling apart
    const points = VOLUTE_STYLES[p.volute!.style].points;
    const inward = [...spiral].reverse();
    for (const i of points ? highlightedArcs : []) {
      const lit = inward[i];
      if (lit) renderPath(arcPathData(lit.center, lit.r, lit.from, lit.to), arcColor(colors, i, points!), 12, 0.33)(g, ui);
    }
    inward.forEach(({ center, r, from, to }, i) => {
      renderPath(arcPathData(center, r, from, to), points ? arcColor(colors, i, points) : colors.outerTrace, STROKE_WEIGHT.trace)(g, ui);
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
