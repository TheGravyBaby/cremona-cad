import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  angleFromCenter, arcReach, dist, normalizeRadians, placeCircleOnPointAtAngle, pointOnCircle, TURN,
} from '../../../../helpers/math/simpleGeometry';
import {
  renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderDashLine, renderPolygon, renderSegment, renderSolveFailures, renderPath,
} from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { Arc, Circle, Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  RenderLayer,
  ScrollParams,
  ViolinFamilyPanel,
  ViolinFamilyParams,
  ViolinFamilyToggleKey,
  ViolinFamilyViewFlags,
  VoluteStyle,
} from '../../violin-family-types';
import {
  ScrollFailure,
  ScrollKey,
  ScrollSolve,
} from '../../violin-family-solves';
import { defineSideScrollPath, solveScroll } from '../scroll-panel/scroll-panel';
import { duckTailRoundTop } from '../scroll-widths-panel/scroll-widths-panel';
import { neckTaper } from '../neck-panel/neck-panel';
import { showFieldHelp } from '../../../../docs/field-help';

export type VoluteHighlightKey = number | 'S0' | 'S1';

@Component({
  selector: 'app-vf-volute-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './volute-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class VolutePanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleArcs', 'showModuleGuides', 'showVoluteConstruction'];
  protected readonly pal = ThemeService.getPalette('stones');
  protected readonly styles = Object.entries(VOLUTE_STYLE_LABELS).map(([id, label]) => ({ id, label }));
  protected readonly arcEnd = (i: number) => turnsLabel((i + 1) / 4);
  protected readonly help = showFieldHelp;
  
  // after Stradivari's Betts on a 350 mm body, scaled by body length. The whole scroll is seeded
  // here, its widths too, so the later scroll panels only reveal. F0 shares S3's centre, as on the
  // Betts, so its radius and the flat are read off the solved back; the eye is placed flush with
  // the neck, and the hips on the duck tail's round. The four point's radii are Kelly's, which land
  // its centres on his
  static seed(p: ViolinFamilyParams): void {
    if (p.scroll || !p.neck) return;
    let k = p.body.height / 350;
    let mm = (v: number) => Math.round(v * k);
    let eyeRadius = Math.round(3.5 * k * 4) / 4;
    let scroll: ScrollParams = {
      style: 'salviati',
      eye: { x: 0, y: mm(83), r: eyeRadius },
      fitToNeck: true,
      // about the Salviati's own opening, its front as far out
      pitch: Math.round(1.9 * eyeRadius * 10) / 10,
      seedLength: eyeRadius,
      arcRadii: kellyArcs(eyeRadius, eyeRadius).reverse().map(a => Math.round(a.r * 100) / 100),
      S0R: mm(21), S0Sweep: 80,
      S1R: mm(28), S1Sweep: 85,
      S2R: mm(35), S2Sweep: 50,
      backStraight: mm(25),
      S3R: mm(35),
      hang: 0,
      napeR: mm(10),
      napeAngle: 0,
      flat: 0,
      F0R: mm(60), F0Sweep: 45,
      frontStraight: mm(18),
      F1R: mm(9),
      // placeholders about a Stradivari head, to be set from the scroll being copied: hips a little
      // proud of the nut, the first turn wide enough that the pegbox runs in under it out of sight,
      // and the duck tail's round the neck's width
      widths: { hip: mm(25), throat: mm(20), duckTail: mm(26), foot: mm(26), poll: mm(24), crown: mm(13), turn1Bottom: mm(26), turn2Top: mm(30), turn2Bottom: mm(34), eye: mm(41) },
      hipHeight: 0,
      duckTailStraight: 0,
      wall: mm(5),
    };
    p.scroll = scroll;
    let s = solveScroll(p)!;
    scroll.eye.x = s.eye!.x;
    scroll.F0R = Math.round(-s.S3!.x);
    scroll.flat = Math.round(s.S3!.y - p.neck.nutHeight);
    scroll.hipHeight = duckTailRoundTop(p, s) - p.neck.nutHeight;
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the template's eye readout and report() read it
  s!: ScrollSolve;
  highlighted: { key: VoluteHighlightKey; color: string } | null = null;

  // the four point's fields four to a row, a turn of the spiral each
  get arcRows(): number[][] {
    let rows: number[][] = [];
    this.params.scroll!.arcRadii.forEach((_, i) => i % 4 === 0 ? rows.push([i]) : rows.at(-1)!.push(i));
    return rows;
  }

  arcInk(i: number): string {
    return i % 2 ? this.pal.ink(2).faint(1) : this.pal.ink(2).faint(-3);
  }

  ngOnInit(): void {
    this.draw();
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  // turning the fit off leaves the eye where the fit put it, so editing goes on from there
  fitChanged(): void {
    let v = this.params.scroll!;
    if (!v.fitToNeck && this.s.eye) v.eye.x = this.s.eye.x;
    this.edited();
  }

  report(): void {
    reportFailures(this.s.failures, 'Volute');
  }

  focus(key: VoluteHighlightKey, color: string): void {
    this.highlighted = { key, color };
    this.draw();
  }

  blur(): void {
    this.highlighted = null;
    this.draw();
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let s = solveScroll(p)!;
      this.s = { ...s, failures: s.failures.filter(f => f.unsolved.some(k => k === 'spiral' || k === 'S0' || k === 'S1')) };
      let key = this.highlighted?.key ?? null;
      let arc = key === null ? null : typeof key === 'number' ? s.spiral?.[s.spiral.length - 1 - key] ?? null : s[key];
      // the rest of the scroll for context, under the volute's own arcs, once it all solves
      this.drawn.emit([
        renderScrollNeck(p, s, this.pal, this.flags.showModuleGuides),
        ...(s.failures.length ? [] : [renderPath(defineSideScrollPath(p, s), this.pal.neutral, STROKE_WEIGHT.trace)]),
        renderVolute(p, s, this.pal, this.flags, true, arc ? { arc, color: this.highlighted!.color } : null),
        renderSolveFailures(this.s.failures, this.pal.alert),
      ]);
    });
  }
}

// a count of turns in quarters, as the luthier says it
const turnsLabel = (turns: number) => {
  let whole = Math.floor(turns);
  let quarter = Math.round(turns * 4) % 4;
  return `${whole || ''}${['', '¼', '½', '¾'][quarter]}`;
};

// a scroll arc runs counterclockwise from start to end, so one past a half turn is the long way round
export const longArc = (arc: Arc) => normalizeRadians(arc.end - arc.start) > TURN.half;

// every arc draws in its own colour; module arcs add its centre and the two radii that bound it
export const scrollArc = (arc: Arc, color: string, fancy: boolean) =>
  fancy ? renderArcFromArcFancy(arc, color, longArc(arc)) : renderArcFromArc(arc, color, STROKE_WEIGHT.trace, longArc(arc));

// how far each view carries the neck on below the scroll
export const scrollNeckStub = (p: ViolinFamilyParams) => 2 * p.neck!.upperThickness;

// how far the nut stands off the neck: the string setup's, and until it has one, or while its field
// is cleared, the thickness it would seed
export const nutThickness = (p: ViolinFamilyParams) => {
  let t = p.stringSetup?.nutThickness;
  return Number.isFinite(t) ? t! : Math.round(7.5 * p.body.height / 355 * 2) / 2;
};

// the nut on its seat and the neck's end below the scroll, for context: the neck's front up to the
// nut and its back up to where the nape meets it. Module guides run the neck's front up to the
// crown's top, then back to S1's furthest reach
export const renderScrollNeck = (p: ViolinFamilyParams, s: ScrollSolve, pal: PanelPalette, showGuides: boolean) => (g: any, ui: any): void => {
  let { upperThickness: thickness, nutHeight } = p.neck!;
  let stub = scrollNeckStub(p);
  let t = nutThickness(p);
  renderPolygon([new Pt(0, 0), new Pt(0, nutHeight), new Pt(t, nutHeight), new Pt(t, 0)], pal.ink(0), STROKE_WEIGHT.section)(g, ui);
  renderSegment(new Pt(0, -stub), new Pt(0, 0), pal.neutral.faint(5), STROKE_WEIGHT.section)(g, ui);
  // the neck's back, leaning with the taper, runs on up to where the nape meets it, or to the nut's
  // level while it's unsolved
  let backTop = s.nape ? pointOnCircle(s.nape, s.nape.start) : new Pt(-thickness, 0);
  let backFoot = new Pt(-thickness - neckTaper(p) * stub, -stub);
  if (backTop.y > -stub) renderSegment(backFoot, backTop, pal.neutral.faint(5), STROKE_WEIGHT.section)(g, ui);

  if (!showGuides || !s.S0 || !s.S1) return;
  let crownTop = Math.max(...[s.S0, s.S1].flatMap(a => arcReach(a, TURN.quarter)).map(pt => pt.y));
  let S1Back = Math.min(...arcReach(s.S1, TURN.half).map(pt => pt.x));
  if (!Number.isFinite(crownTop) || !Number.isFinite(S1Back)) return;
  renderDashLine(new Pt(0, 0), new Pt(0, crownTop), pal.ink(1).faint(4), STROKE_WEIGHT.guide)(g, ui);
  renderDashLine(new Pt(0, crownTop), new Pt(S1Back, crownTop), pal.ink(1).faint(4), STROKE_WEIGHT.guide)(g, ui);
};

// the eye, the spiral and the crown (S0, S1). The construction toggle adds the figure the spiral's
// centres are found on
export const renderVolute = (
  p: ViolinFamilyParams,
  s: ScrollSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs' | 'showVoluteConstruction'>,
  currentModule: boolean,
  highlighted: { arc: Arc; color: string } | null,
) => (g: any, ui: any): void => {
  let fancy = currentModule && flags.showModuleArcs;
  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color, undefined, undefined, longArc(highlighted.arc))(g, ui);
  if (!s.spiral || !s.eye) return;
  let eye = s.eye;
  renderCircle(eye, pal.ink(2))(g, ui);
  if (currentModule && flags.showVoluteConstruction) {
    for (let line of voluteConstruction(p, s)) {
      let placed = line.map(pt => new Pt(eye.x + pt.x, eye.y + pt.y));
      for (let i = 1; i < placed.length; i++) renderSegment(placed[i - 1], placed[i], pal.ink(2).faint(3), STROKE_WEIGHT.guide, true)(g, ui);
    }
  }
  // innermost first, two tones alternating arc by arc, the same as the four point's fields
  let inward = [...s.spiral].reverse();
  for (let i = 0; i < inward.length; i++) scrollArc(inward[i], i % 2 ? pal.ink(2).faint(1) : pal.ink(2).faint(-3), fancy)(g, ui);
  if (s.S0) scrollArc(s.S0, pal.ink(1).faint(3), fancy)(g, ui);
  if (s.S1) scrollArc(s.S1, pal.ink(1), fancy)(g, ui);
};

export const VOLUTE_STYLE_LABELS: Record<VoluteStyle, string> = {
  fourPoint: 'Four Point (custom)',
  archimedean: 'Archimedes (c. 225 BC)',
  serlio: 'Serlio (1537)',
  salviati: 'Salviati (1552)',
  goldmann: 'Goldmann (1696)',
  kelly: 'Kelly (2011)',
};

// quarter-turn arcs from the eye out to the front: two full turns
export const TO_FRONT = 8;

// the style's spiral in the eye's frame, outermost arc first, or [] when its fields can't draw it.
// Each winds counterclockwise from the eye's front and ends two turns out heading straight up
export function spiralArcs(v: Pick<ScrollParams, 'style' | 'eye' | 'pitch' | 'seedLength' | 'arcRadii'>): Arc[] {
  switch (v.style) {
    case 'fourPoint': return fourPointArcs(v.eye.r, v.arcRadii);
    case 'archimedean': return archimedeanArcs(v.eye.r, v.pitch);
    // the older authors started at the top of the eye; their figures are turned a quarter here
    case 'serlio': return serlioArcs(v.eye.r);
    case 'salviati': return salviatiArcs(v.eye.r);
    case 'goldmann': return goldmannArcs(v.eye.r);
    case 'kelly': return kellyArcs(v.eye.r, v.seedLength);
  }
}

// Four point: a quarter turn per radius, each centre stepping back from the last joint by the
// growth so the arcs stay tangent. The radii are the user's, since old scrolls rarely open evenly
function fourPointArcs(eyeRadius: number, arcRadii: number[]): Arc[] {
  let radii = arcRadii.slice(0, TO_FRONT);
  if (radii.length < TO_FRONT || !(radii[0] > 0) || !radii.every((r, i) => r >= (radii[i - 1] ?? 0))) return [];
  let arcs: Arc[] = [];
  // straight behind the eye's front, so the first arc runs on tangent to the eye
  let center = new Pt(eyeRadius - radii[0], 0);
  for (let i = 0; i < TO_FRONT; i++) {
    if (i > 0) {
      let grow = radii[i] - radii[i - 1];
      center = new Pt(center.x - grow * Math.cos(TURN.quarter * i), center.y - grow * Math.sin(TURN.quarter * i));
    }
    let from = normalizeRadians(TURN.quarter * i);
    arcs.push(new Arc(center.x, center.y, radii[i], from, from + TURN.quarter));
  }
  return arcs.reverse();
}

// Archimedes (c. 225 BC): the radius grows by `pitch` each turn from the eye's edge. Set out as
// arcs through points an eighth of a turn apart, each tangent to the last
function archimedeanArcs(eyeRadius: number, pitch: number): Arc[] {
  if (!(pitch > 0)) return [];
  let eighths = 2 * TO_FRONT;
  let angle = (k: number) => k * TURN.eighth;
  let radius = (k: number) => eyeRadius + pitch * k / 8;
  let points = Array.from({ length: eighths + 1 }, (_, k) => pointOnCircle({ x: 0, y: 0, r: radius(k) }, angle(k)));
  let growth = pitch / TURN.full;
  let heading = (k: number) => {
    let r = radius(k);
    let t = angle(k);
    return Math.atan2(growth * Math.sin(t) + r * Math.cos(t), growth * Math.cos(t) - r * Math.sin(t));
  };
  let chord = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  let miss = (k: number) => normalizeRadians(heading(k) - chord + TURN.half) - TURN.half;

  // aimed to miss the curve's heading equally at both ends, or the arcs alternate flat and round
  let tangent = pointOnCircle({ x: 0, y: 0, r: 1 }, chord + (miss(0) - miss(1)) / 2);
  let arcs: Arc[] = [];
  for (let k = 0; k < eighths; k++) {
    let a = points[k];
    let b = points[k + 1];
    let len = Math.hypot(tangent.x, tangent.y);
    let normal = new Pt(-tangent.y / len, tangent.x / len);
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let r = (dx * dx + dy * dy) / (2 * (dx * normal.x + dy * normal.y));
    let center = new Pt(a.x + r * normal.x, a.y + r * normal.y);
    let from = angleFromCenter(center, a);
    let to = from + normalizeRadians(angleFromCenter(center, b) - from);
    arcs.push(new Arc(center.x, center.y, r, from, to));
    tangent = new Pt(center.y - b.y, b.x - center.x);
  }

  // the last arc reaches the front a little off vertical; roll it to end heading straight up
  let outer = arcs.pop()!;
  arcs.push(new Arc(outer.x, outer.y, outer.r, outer.start, Math.round(outer.end / TURN.full) * TURN.full));
  return arcs.reverse();
}

// Serlio (1537): semicircles about centres a sixth of his eye's diameter apart, stepping out to
// either side in turn. Two turns end on his 13/6-diameter semicircle
function serlioArcs(eyeRadius: number): Arc[] {
  // a semicircle is two quarter arcs about the same centre
  let centers: Pt[] = [];
  for (let k of [-1, 1, -2, 2]) {
    let center = new Pt(k * eyeRadius / 3, 0);
    centers.push(center, center);
  }
  // growing by the step between centres keeps the arcs tangent
  let arcs: Arc[] = [];
  let r = 4 * eyeRadius / 3;
  for (let i = 0; i < centers.length; i++) {
    if (i > 0) r += dist(centers[i - 1], centers[i]);
    let from = normalizeRadians(TURN.quarter * i);
    arcs.push(new Arc(centers[i].x, centers[i].y, r, from, from + TURN.quarter));
  }
  return arcs.reverse();
}

// Salviati (1552): quarter arcs about the corners of three nested squares on the eye's diagonals;
// two turns use the inner two. Vignola, Palladio and Scamozzi reprint the same centres
function salviatiArcs(eyeRadius: number): Arc[] {
  let g = eyeRadius * Math.SQRT2 / 6;
  let n = TO_FRONT;
  let centers = Array.from({ length: n }, (_, i) => pointOnCircle({ x: 0, y: 0, r: (2 - Math.floor(i / 4)) * g }, TURN.eighth - i * TURN.quarter));

  // the innermost arc leaves the front of the eye, so it runs a little over a quarter
  let radii = new Array<number>(n);
  let last = centers[n - 1];
  radii[n - 1] = Math.hypot(eyeRadius - last.x, last.y);
  for (let i = n - 2; i >= 0; i--) radii[i] = radii[i + 1] + dist(centers[i], centers[i + 1]);

  // arc i meets the one inside it on the line between their centres, which at a ring change isn't
  // a quarter turn on, so the two arcs there run a little long and short
  let joints = centers.slice(0, n - 1).map((c, i) => angleFromCenter(c, centers[i + 1]));
  return centers.map((center, i) => {
    let from = i < n - 1 ? joints[i] : Math.atan2(-last.y, eyeRadius - last.x);
    // the outermost has no ring change to end on: a quarter on to the front
    let end = i > 0 ? from + normalizeRadians(joints[i - 1] - from) : Math.round((from + TURN.quarter) / TURN.full) * TURN.full;
    return new Arc(center.x, center.y, radii[i], from, end);
  });
}

// Goldmann (1696): Salviati's squares hung below the eye's horizontal diameter instead, so every
// arc is an exact quarter. Two turns go round the inner two squares
function goldmannArcs(eyeRadius: number): Arc[] {
  // round each square from its upper left corner
  let centers: Pt[] = [];
  for (let k of [1, 2]) {
    let w = k * eyeRadius / 3;
    let h = k * eyeRadius / 6;
    centers.push(new Pt(-h, 0), new Pt(-h, -w), new Pt(h, -w), new Pt(h, 0));
  }
  let arcs: Arc[] = [];
  let r = 7 * eyeRadius / 6;
  for (let i = 0; i < centers.length; i++) {
    if (i > 0) r += dist(centers[i - 1], centers[i]);
    let from = normalizeRadians(TURN.quarter * i);
    arcs.push(new Arc(centers[i].x, centers[i].y, r, from, from + TURN.quarter));
  }
  return arcs.reverse();
}

// Kelly (2011): from the left end of the seed's middle line, then round the outer corners of its
// middle two squares and then its own. He varies the seed's length by scroll, so it's a field
function kellyArcs(eyeRadius: number, seedLength: number): Arc[] {
  if (!(seedLength > 0)) return [];
  let s = seedLength / 4;
  let centers = [new Pt(-s / 2, 0)];
  for (let t of [1, 2]) {
    centers.push(new Pt(-s / 2, -t * s), new Pt(s / 2, -t * s), new Pt(s / 2, t * s), new Pt(-s / 2, t * s));
  }
  let arcs: Arc[] = [];
  let r = eyeRadius + s / 2;
  for (let i = 0; i < TO_FRONT; i++) {
    if (i > 0) r += dist(centers[i - 1], centers[i]);
    let from = normalizeRadians(TURN.quarter * i);
    arcs.push(new Arc(centers[i].x, centers[i].y, r, from, from + TURN.quarter));
  }
  return arcs.reverse();
}

// the figure each style finds its centres on, as polylines in the eye's frame
export function voluteConstruction(p: ViolinFamilyParams, s: ScrollSolve): Pt[][] {
  let v = p.scroll!;
  let eye = s.eye!;
  let r = v.eye.r;
  let square = (left: number, right: number, bottom: number, top: number) =>
    [new Pt(left, bottom), new Pt(right, bottom), new Pt(right, top), new Pt(left, top), new Pt(left, bottom)];

  switch (v.style) {
    // the walk of centres
    case 'fourPoint':
      return [[...s.spiral!].reverse().map(a => new Pt(a.x - eye.x, a.y - eye.y))];

    // a ray out to the last point on each of the eight lines
    case 'archimedean':
      return Array.from({ length: 8 }, (_, ray) => {
        let eighths = ray ? 8 + ray : 2 * TO_FRONT;
        return [new Pt(0, 0), pointOnCircle({ x: 0, y: 0, r: r + v.pitch * eighths / 8 }, ray * TURN.eighth)];
      });

    // the line of centres
    case 'serlio':
      return [[new Pt(-r, 0), new Pt(r, 0)]];

    // the eye's inscribed square, and his outer square on its edge midpoints with its diagonals
    case 'salviati': {
      let h = r / 2;
      return [
        [0, 1, 2, 3, 4].map(i => pointOnCircle({ x: 0, y: 0, r }, i * TURN.quarter)),
        square(-h, h, -h, h),
        [new Pt(-h, -h), new Pt(h, h)],
        [new Pt(-h, h), new Pt(h, -h)],
      ];
    }

    // the eye's horizontal diameter and his three squares hanging from it
    case 'goldmann':
      return [
        [new Pt(-r, 0), new Pt(r, 0)],
        ...[1, 2, 3].map(k => square(-k * r / 6, k * r / 6, -k * r / 3, 0)),
      ];

    // the seed, its middle lines, and the eye's two axes out to the spiral's furthest reach
    case 'kelly': {
      let q = v.seedLength / 4;
      let reach = Math.max(r, ...s.spiral!.map(a => dist(eye, a) + a.r));
      return [
        square(-q / 2, q / 2, -2 * q, 2 * q),
        ...[-1, 0, 1].map(k => [new Pt(-q / 2, k * q), new Pt(q / 2, k * q)]),
        [new Pt(0, -reach), new Pt(0, reach)],
        [new Pt(-reach, 0), new Pt(reach, 0)],
      ];
    }
  }
}

export const ALL_SCROLL_KEYS: ScrollKey[] = ['spiral', 'S0', 'S1', 'S2', 'S3', 'nape', 'backStraight', 'F0', 'F1', 'flat', 'frontStraight'];
export const BACK_KEYS: ScrollKey[] = ['S0', 'S1', 'S2', 'S3', 'nape', 'backStraight'];

// a part of the back or front that isn't a radius, or doesn't sweep on from where the last ended by
// up to a full turn; a run stops there, everything after it unsolved
export const badArc = (section: string, key: ScrollKey, r: number, unsolved: ScrollKey[]): ScrollFailure => ({
  message: !(r > 0)
    ? `${section}: ${key} needs a radius.`
    : `${section}: ${key} has to sweep on from where the last part ended, by up to a full turn.`,
  unsolved, circles: [], segments: [],
});

// the volute and the crown, which the Scroll panel's solve runs on from. The eye's x, while the fit
// is on, is solved to bring the spiral's front flush with the neck's front, held to a hundredth as
// the field shows it. Returns and never writes to the params
export function solveVolute(p: ViolinFamilyParams): ScrollSolve | null {
  if (!p.scroll || !p.neck) return null;
  let v = p.scroll;
  let s: ScrollSolve = { eye: null, spiral: null, S0: null, S1: null, S2: null, S3: null, nape: null, F0: null, F1: null, failures: [] };
  let fail = (message: string): ScrollFailure => ({ message, unsolved: ALL_SCROLL_KEYS, circles: [], segments: [] });

  solveSection(s.failures, 'Volute', ALL_SCROLL_KEYS, () => {
    if (!(v.eye.r > 0)) return fail('Volute: the eye needs a radius.');
    let arcs = spiralArcs(v);
    if (!arcs.length) return fail(
      v.style === 'fourPoint' ? 'Volute: the four point needs every radius set, each at least the one inside it.'
      : v.style === 'archimedean' ? 'Volute: the Archimedean needs a pitch.'
      : v.style === 'kelly' ? "Volute: Kelly's needs a seed length."
      : `Volute: ${VOLUTE_STYLE_LABELS[v.style]} can't be drawn from this eye.`);
    let x = v.eye.x;
    if (v.fitToNeck) {
      let front = Math.max(...arcs.flatMap(a => arcReach(a, 0)).map(pt => pt.x));
      x = Math.round(-front * 100) / 100;
    }
    if (!Number.isFinite(x) || !Number.isFinite(v.eye.y)) return fail('Volute: the eye needs a position.');
    s.eye = new Circle(x, v.eye.y, v.eye.r);
    s.spiral = arcs.map(a => new Arc(a.x + x, a.y + v.eye.y, a.r, a.start, a.end));
    return null;
  });
  if (!s.spiral) return s;

  // S0 and S1 run on tangent from the spiral's front, each through its own sweep
  solveSection(s.failures, 'Back', BACK_KEYS, () => {
    let outer = s.spiral![0];
    let joint = pointOnCircle(outer, outer.end);
    let S0End = v.S0Sweep * TURN.degree;
    if (!(v.S0R > 0) || !(S0End > 0) || S0End > TURN.full) return badArc('Back', 'S0', v.S0R, BACK_KEYS);
    let S0 = placeCircleOnPointAtAngle(v.S0R, joint, 0);
    s.S0 = new Arc(S0.x, S0.y, S0.r, 0, S0End);
    joint = pointOnCircle(s.S0, S0End);

    let S1Sweep = v.S1Sweep * TURN.degree;
    if (!(v.S1R > 0) || !(S1Sweep > 0) || S1Sweep > TURN.full) return badArc('Back', 'S1', v.S1R, BACK_KEYS.slice(1));
    let S1 = placeCircleOnPointAtAngle(v.S1R, joint, S0End);
    s.S1 = new Arc(S1.x, S1.y, S1.r, S0End, S0End + S1Sweep);
    return null;
  });
  return s;
}
