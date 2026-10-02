import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey, VoluteParams, VoluteStyle } from '../../ceruti-types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { defaultNeckParams, standardNutLength } from '../../ceruti-neck';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { arcPathData } from '../../../helpers/math/pathMath';
import { renderCircle, renderDashLine, renderPath, renderPolygon, renderSegment, renderSmallCrosshair } from '../../../helpers/renderFuncs';
import { Pt } from '../../../models/types';
import { STROKE_WEIGHT } from '../../renders/render-constants';
import { flushVolute, layoutVolute, naturalArcRadii, TO_FRONT, VoluteArc, VOLUTE_STYLES } from './volute';

@Component({
  selector: 'app-ceruti-scroll-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './scroll-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs', 'showModuleGuides', 'showVoluteEye'];

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

  get volute(): VoluteParams { return this.params.volute!; }
  get custom(): boolean { return !!VOLUTE_STYLES[this.volute.style].custom; }
  get archimedean(): boolean { return this.volute.style === 'archimedean'; }
  get seedDef() { return VOLUTE_STYLES[this.volute.style].seed; }
  arcColor(i: number): string { return arcColor(this.colors, i); }

  setStyle(style: VoluteStyle): void {
    this.volute.style = style;
    if (style === 'archimedean' && !(this.volute.pitch > 0)) this.volute.pitch = defaultPitch(this.volute.eyeRadius);
    if (VOLUTE_STYLES[style].seed) this.volute.seed = naturalSeed(style, this.volute.eyeRadius);
    this.onChange();
  }

  // the arc fields four to a row, a turn of the spiral each
  get arcRows(): number[][] {
    const rows: number[][] = [];
    this.volute.arcRadii.forEach((_, i) => i % 4 === 0 ? rows.push([i]) : rows.at(-1)!.push(i));
    return rows;
  }

  // an arc field's name: how many turns out from the eye its arc ends
  arcEnd(i: number): string { return turnsLabel((i + 1) / 4); }

  // the radii have to open outward, so one set past those after it carries them up to it
  setArcRadius(i: number, radius: number): void {
    const radii = this.volute.arcRadii;
    radii[i] = radius;
    if (Number.isFinite(radius)) for (let j = i + 1; j < radii.length && radii[j] < radius; j++) radii[j] = radius;
    this.onChange();
    this.onArcFocus(i);
  }

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
    // the four point's fields start from the even growth once, and are the user's after
    if (VOLUTE_STYLES[p.volute.style].custom && !p.volute.arcRadii.length) p.volute.arcRadii = naturalArcRadii(p.volute.eyeRadius, TO_FRONT);
    flushEye(p.volute);
    return [renderScroll(p, this.colors, this.flags, this.highlightedArc)];
  }
}

// a spiral arc's colour as a module arc and in the four point's fields, innermost first: each turn a bout's colour, its arcs stepping
// through that colour's off shades so neighbours in a turn read apart, the bouts coming round
// again past three turns
export function arcColor(colors: CerutiColors, i: number): string {
  const turns = [
    [colors.upperBout, colors.upperBoutOff, colors.upperBoutOff2],
    [colors.centerBout, colors.centerBoutOff, colors.centerBoutOff2],
    [colors.lowerBout, colors.lowerBoutOff, colors.lowerBoutOff2],
  ];
  return turns[Math.floor(i / 4) % 3][[0, 1, 2, 1][i % 4]];
}

// a count of turns in quarters, as the luthier says it
const turnsLabel = (turns: number) => {
  const [whole, quarter] = [Math.floor(turns), Math.round(turns * 4) % 4];
  return `${whole || ''}${['', '¼', '½', '¾'][quarter]}`;
};

// about the Salviati's own opening, its front as far out
const defaultPitch = (eyeRadius: number) => Math.round(1.9 * eyeRadius * 10) / 10;
// each style's seed means a different measure, so a style starts from its author's proportion to
// the eye, to the hundredth like the field
const naturalSeed = (style: VoluteStyle, eyeRadius: number) => Math.round(VOLUTE_STYLES[style].seed!.natural(eyeRadius) * 100) / 100;

// a Salviati as wide as the one that fitted the Betts scroll, on a 3.1 mm eye 96 mm up from the
// nut; everything defaults from there
export function defaultVoluteParams(p: EnricoCerutiParams): VoluteParams {
  const k = p.height / 355;
  const eyeRadius = Math.round(3.1 * k * 10) / 10;
  const v = { style: 'salviati' as const, eyeRadius, arcRadii: [], pitch: defaultPitch(eyeRadius), seed: naturalSeed('salviati', eyeRadius) };
  return { ...v, flushWithNeck: true, eyeX: Math.round((flushVolute(v) ?? 0) * 100) / 100, eyeY: Math.round(96 * k * 10) / 10 };
}

// writes the flush Eye X into its field, to the hundredth, every pass flush is on, so turning it
// off leaves the eye where it was
export function flushEye(v: VoluteParams): void {
  const eyeX = v.flushWithNeck ? flushVolute(v) : null;
  if (eyeX !== null) v.eyeX = Math.round(eyeX * 100) / 100;
}

// the scroll in its own frame: the nut at the origin on the neck's front, up the neck +y, toward
// the back -x (as in the neck panel), the neck's tilt taken out. The nut and the neck's end are
// drawn for context only — the neck open at the bottom, stopping a little way down. The spiral
// always draws; module arcs draws it the way the other panels draw their arcs, each in its colour
// with its centre and the two radii that bound it, the way the compass swept it. Module guides
// carries the neck's front and back on up past the spiral, and the eye toggle the eye with the
// seed figure its centres are found on.
type ScrollFlags = Pick<CerutiViewFlags, 'showModuleArcs' | 'showModuleGuides' | 'showVoluteEye'>;
export function renderScroll(p: EnricoCerutiParams, colors: CerutiColors, flags: ScrollFlags, highlightedArc: number | null = null) {
  const { thickness, nutThickness } = p.neck!;
  const { eyeRadius, eyeX, eyeY } = p.volute!;
  const nutLength = standardNutLength(p.height);
  const neckStub = 2 * thickness;

  const nut = [new Pt(0, 0), new Pt(0, nutLength), new Pt(nutThickness, nutLength), new Pt(nutThickness, 0)];
  const neck = [new Pt(0, -neckStub), new Pt(0, 0), new Pt(-thickness, 0), new Pt(-thickness, -neckStub)];

  const eye = new Pt(eyeX, eyeY);
  const volute = layoutVolute(p.volute!, eye);
  const top = Math.max(nutLength, eye.y + eyeRadius, ...(volute?.spiral ?? []).map(a => a.center.y + a.r)) + thickness;

  return (g: any, ui: any): void => {
    renderPolygon(nut, colors.fingerboard, STROKE_WEIGHT.section)(g, ui);
    neck.slice(1).forEach((pt, i) => renderSegment(neck[i], pt, colors.neckOff, STROKE_WEIGHT.section)(g, ui));
    if (flags.showModuleGuides) {
      for (const x of [0, -thickness]) renderDashLine(new Pt(x, 0), new Pt(x, top), colors.neck, STROKE_WEIGHT.guide)(g, ui);
    }

    if (!volute) return;
    const { spiral, guides } = volute;
    const guide = colors.neckOff;
    if (flags.showVoluteEye) {
      renderCircle({ x: eye.x, y: eye.y, r: eyeRadius }, colors.neckOff)(g, ui);
      for (const line of guides) {
        line.slice(1).forEach((pt, i) => renderSegment(line[i], pt, guide, STROKE_WEIGHT.guide, true)(g, ui));
      }
    }
    const inward = [...spiral].reverse();
    const lit = VOLUTE_STYLES[p.volute!.style].custom && highlightedArc !== null ? inward[highlightedArc] : undefined;
    if (lit) renderPath(arcPathData(lit.center, lit.r, lit.from, lit.to), arcColor(colors, highlightedArc!), 12, 0.33)(g, ui);

    // module arcs: renderArcFromArcFancy's look, drawn here since a models/types Arc only takes the
    // minor arc and an arc of the spiral can sweep more than half a turn
    const fancy = (a: VoluteArc, color: string) => {
      renderPath(arcPathData(a.center, a.r, a.from, a.to), color, 2)(g, ui);
      for (const t of [a.from, a.to]) renderDashLine(a.center, new Pt(a.center.x + a.r * Math.cos(t), a.center.y + a.r * Math.sin(t)), color)(g, ui);
      renderSmallCrosshair(a.center, color)(g, ui);
    };
    if (flags.showModuleArcs) {
      inward.forEach((a, i) => fancy(a, arcColor(colors, i)));
      return;
    }
    for (const { center, r, from, to } of inward) {
      renderPath(arcPathData(center, r, from, to), colors.outerTrace, STROKE_WEIGHT.trace)(g, ui);
    }
  };
}
