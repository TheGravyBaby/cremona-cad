import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pointOnCircle, TURN } from '../../../../helpers/math/simpleGeometry';
import { archSplineKnots, catenaryZAt, splineZAt, SPLINE_PEAK_SOURCE } from '../../../../helpers/math/vibeMath';
import { buildCatenaryPath, buildSplinePath, occludePath } from '../../../../helpers/math/pathVibes';
import {
  renderGuideBaseline, renderGuideKnot, renderGuideMeasure, renderPath, renderPointHalo, renderSegment, renderSolveFailures,
} from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { showFieldHelp } from '../../../../docs/field-help';
import { Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  ArchTakeoff, GougeParams, LongArchCurve, LongArchingFailure, LongArchingSolve, LongArchParams, LongArchSolve, OuterContourSolve, Plate,
  RenderLayer, RibTaper, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags,
} from '../../violin-family-types';
import { gougeHalfWidth, gougeProfileSlope, gougeProfileZ, renderFluting, solveFluting } from '../fluting-panel/fluting-panel';
import { renderOuterContour, solveOuterContour } from '../outer-contour-panel/outer-contour-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';

// The arch along the body. The channel is cut first, at the gouge's own section; the arch is then
// run from its peak down into the channel's inner flank and stops where it meets it tangentially,
// so where it starts and ends is solved, not typed. The ribs are here too, since the side view
// stands the top plate on them: their taper is placement, not carving, and tilts the plate as one
// piece. Panel and renders, then the ribs, then the arch's landing and the arch.

@Component({
  selector: 'app-vf-long-arching-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './long-arching-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class LongArchingPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('iceAndFire');
  protected readonly help = showFieldHelp;
  protected readonly peakSource = SPLINE_PEAK_SOURCE;
  protected readonly plates: readonly Plate[] = ['top', 'back'];

  // ribs and arches sized by instrument family, with a ~0.6% rib taper; every curve type's fields
  // written at once, the spline's points hung off the seeded height, so a type switch only reveals
  static seed(p: ViolinFamilyParams): void {
    if (p.arching || !p.fluting) return;
    let h = p.body.height;
    let [ribLower, ribUpper, topH, backH, thickness] =
      h < 400 ? [32, 30, 15, 14, 3.5] :      // violin
      h < 500 ? [40, 38, 20, 18, 4] :        // viola
      h < 800 ? [120, 116, 27, 25, 6] :      // cello
      [185, 179, 55, 50, 9];                 // bass
    let plate = (height: number) => ({
      thickness,
      arch: { type: 'catenary' as const, height, peak: 50, points: seedPoints(height) },
      cross: { type: 'cycloid' as const, d: 40, pct: 90, peak: 50, points: [{ x: 83, z: 50, mirror: true }], stations: [] },
    });
    p.arching = { ribHeightLower: ribLower, ribHeightUpper: ribUpper, top: plate(topH), back: plate(backH) };
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the template's readouts and report() read it
  a!: LongArchingSolve;

  // the point whose field has focus, haloed on the arch; the peak is a point too
  highlighted: { plate: Plate; source: number } | null = null;

  ngOnInit(): void {
    this.draw();
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  report(): void {
    reportFailures(this.a.failures, 'Long arching');
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let o = solveOuterContour(p)!;
      let f = solveFluting(p)!;
      let a = this.a = solveLongArching(p)!;
      let sideX = sideViewOffsetX(p);
      let side = renderBodySideProfile(p, a, o, this.pal, true, { highlight: this.highlighted, showGuides: this.flags.showModuleGuides });
      this.drawn.emit([
        renderOuterContour(p, o, this.pal, this.flags, false, false),
        renderFluting(p, f, this.pal, false, false),
        renderFholes(p, this.pal),
        (g, ui) => side(g.append('g').attr('transform', `translate(${sideX},0)`), ui.append('g').attr('transform', `translate(${sideX},0)`)),
        renderSolveFailures(a.failures, this.pal.alert),
      ]);
    });
  }

  // a new point fills the widest gap in the curve as it stands, mirrored twins and the peak
  // included, since those are the knots on screen
  addPoint(plate: Plate): void {
    let arch = this.params.arching![plate].arch;
    let knots = [{ t: 0, z: 0 }, ...archSplineKnots(arch.height, longArchCurve(arch).points, arch.peak / 100), { t: 1, z: 0 }];
    let gap = 0, at = 0;
    for (let i = 0; i + 1 < knots.length; i++) {
      if (knots[i + 1].t - knots[i].t > gap) { gap = knots[i + 1].t - knots[i].t; at = i; }
    }
    arch.points.push({
      t: +(50 * (knots[at].t + knots[at + 1].t)).toFixed(1),
      z: +((knots[at].z + knots[at + 1].z) / 2).toFixed(1),
      mirror: false,
    });
    this.edited();
  }

  removePoint(plate: Plate, index: number): void {
    this.params.arching![plate].arch.points.splice(index, 1);
    this.edited();
  }

  focus(plate: Plate, source: number): void {
    this.highlighted = { plate, source };
    this.draw();
  }

  blur(): void {
    this.highlighted = null;
    this.draw();
  }
}

// a spline seeded free end to end rather than mirrored: the upper and lower bouts carry different
// wood, so a long arch is rarely symmetric
function seedPoints(height: number): LongArchParams['points'] {
  return [
    { t: 87.5, z: +(height * 0.55).toFixed(1), mirror: false },
    { t: 75, z: +(height * 0.85).toFixed(1), mirror: false },
    { t: 25, z: +(height * 0.85).toFixed(1), mirror: false },
    { t: 12.5, z: +(height * 0.55).toFixed(1), mirror: false },
  ];
}

// the top plate takes the warm ink, the back the cold, the channel the one between
export const TOP_ARCH_INK = 2;
export const BACK_ARCH_INK = 0;
export const CHANNEL_INK = 1;

// right of the plan, where every panel leaves room: the back's arch, which hangs below the back
// plane, clears the top plate's edge
export function sideViewOffsetX(p: ViolinFamilyParams): number {
  let a = p.arching!;
  return p.body.width / 2 + p.body.overhang + p.body.rib + 20 + a.back.thickness + a.back.arch.height;
}

// the body's side profile: the rib between the two plates, the top growing up off it and the back
// down. As the current module it is cut down the centreline, each plate's channel at both caps and
// its arch running out of them; otherwise it is seen from the side, the plate's edge standing its
// full length over the channel and the arch below it, crossed where each corner's flat ends. The
// top plate is drawn flat and tilted onto the rib line by one transform, so the arch, channel and
// guides know nothing of the taper. Ground, everything draws neutral: for a later panel where the
// body is what the neck stands on. Fluting cuts the plate down the centreline as the current module
// does, since the plate's edge standing over the channel would hide it, and keeps the channel in its
// own ink even on the ground
export const renderBodySideProfile = (
  p: ViolinFamilyParams,
  a: LongArchingSolve,
  o: OuterContourSolve,
  pal: PanelPalette,
  currentModule: boolean,
  opts: { highlight?: { plate: Plate; source: number } | null; showGuides?: boolean; ground?: boolean; fluting?: boolean },
) => (g: any, ui: any): void => {
  let taper = a.ribs;
  if (!taper) return;
  let c = o.corners;
  let flatEnds = [c.U31 ?? c.U3, c.C21 ?? c.C2, c.C11 ?? c.C1, c.L31 ?? c.L3].flatMap(arc => arc ? [pointOnCircle(arc, arc.end).y] : []);
  let rib = ribLine(p, taper);
  renderPath(`M 0 ${rib.yLow} L ${rib.zLow} ${rib.yLow} L ${rib.zHigh} ${rib.yHigh} L 0 ${rib.yHigh} Z`, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  for (let corner of [p.corners!.UCr, p.corners!.LCr]) {
    renderSegment(new Pt(0, corner.y), new Pt(ribHeightAt(p, corner.y, taper), corner.y), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  }
  // the ui layer is Y-flipped, so its transform mirrors
  let { dx, dy, angleDeg, pivotX, pivotY } = topPlatePlacement(p, taper);
  platePart(
    g.append('g').attr('transform', `translate(${dx},${dy}) rotate(${angleDeg},${pivotX},${pivotY})`),
    ui.append('g').attr('transform', `translate(${dx},${-dy}) rotate(${-angleDeg},${pivotX},${-pivotY})`),
    'top',
  );
  platePart(g, ui, 'back');

  // cut down the centreline there's no slab outline: over all but the last few millimetres the
  // plate's outer surface is the arch, and a rectangle at plate level would contradict the curve
  function platePart(g: any, ui: any, plate: Plate): void {
    let isTop = plate === 'top';
    let sign: 1 | -1 = isTop ? 1 : -1;
    let thickness = p.arching![plate].thickness;
    let innerZ = isTop ? taper!.zLower : 0;
    let outerZ = innerZ + sign * thickness;
    let color = opts.ground ? pal.neutral : pal.ink(isTop ? TOP_ARCH_INK : BACK_ARCH_INK);
    let channel = opts.ground && !opts.fluting ? pal.neutral : pal.ink(CHANNEL_INK);
    let gouge = p.fluting![plate];
    let edge = p.fluting!.flutingEdge;
    let solved = a[plate];

    renderSegment(new Pt(innerZ, 0), new Pt(innerZ, p.body.height), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    let slab = `M ${innerZ} 0 L ${outerZ} 0 L ${outerZ} ${p.body.height} L ${innerZ} ${p.body.height} Z`;
    let cut = currentModule || opts.fluting;
    if (cut) {
      for (let [yEnd, yLand] of [[0, edge], [p.body.height, p.body.height - edge]] as const) {
        renderSegment(new Pt(innerZ, yEnd), new Pt(outerZ, yEnd), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
        renderSegment(new Pt(outerZ, yEnd), new Pt(outerZ, yLand), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
      }
      // the channel is the tool, not a curve fitted to the arch, so it's the same at both caps
      renderPath(channelCapPath(p, gouge, outerZ, sign, true, solved?.takeoff.contactS), channel, STROKE_WEIGHT.section)(g, ui);
      renderPath(channelCapPath(p, gouge, outerZ, sign, false, solved?.farTakeoff.contactS), channel, STROKE_WEIGHT.section)(g, ui);
    } else {
      renderSegment(new Pt(innerZ, 0), new Pt(outerZ, 0), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
      renderSegment(new Pt(innerZ, p.body.height), new Pt(outerZ, p.body.height), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
      renderSegment(new Pt(outerZ, 0), new Pt(outerZ, p.body.height), color, STROKE_WEIGHT.section)(g, ui);
      for (let y of flatEnds) renderSegment(new Pt(innerZ, y), new Pt(outerZ, y), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    }
    if (!solved) return;

    let { span, yStart, lowered, takeoff, farZ } = solved;
    let xBase = outerZ - sign * takeoff.takeoffDepth;
    // halo behind the point whose field has focus; a mirrored point halos both of its knots
    if (opts.highlight?.plate === plate && lowered.type === 'spline') {
      for (let knot of archSplineKnots(lowered.archHeight, lowered.points, lowered.peak)) {
        if (knot.source === opts.highlight.source) renderPointHalo(new Pt(xBase + sign * knot.z, yStart + knot.t * span), color)(g, ui);
      }
    }
    let arch = buildArchPathFor(lowered, span, yStart, xBase, sign, farZ);
    renderPath(cut ? arch : occludePath(arch, slab).visible, color, STROKE_WEIGHT.section)(g, ui);

    // the guide takes the arch as typed and the plate's outer surface, not the lowered arch against
    // its takeoff: the takeoff moves with the channel, and a guide counting from it would label a
    // height nobody typed
    if (opts.showGuides) {
      let authored = longArchCurve(p.arching![plate].arch);
      renderGuideBaseline(new Pt(outerZ, 0), new Pt(outerZ, p.body.height), color)(g, ui);
      for (let knot of archGuideKnots(authored)) {
        let y = yStart + knot.t * span;
        let at = new Pt(outerZ + sign * knot.z, y);
        renderGuideMeasure(new Pt(outerZ, y), at, color, 0, knot.z)(g, ui);
        renderGuideKnot(at, color)(g, ui);
      }
    }
  }
};

// a spline is its control points, so every knot is marked; a catenary follows from the one height
function archGuideKnots(arch: LongArchCurve): { t: number; z: number }[] {
  return arch.type === 'spline' ? archSplineKnots(arch.archHeight, arch.points, arch.peak) : [{ t: 0.5, z: arch.archHeight }];
}

export function buildArchPathFor(arch: LongArchCurve, span: number, yStart: number, xBase: number, sign: 1 | -1, farZ: number): string {
  return arch.type === 'catenary'
    ? buildCatenaryPath(arch.archHeight, span, yStart, xBase, sign)
    : buildSplinePath(arch.archHeight, span, yStart, xBase, sign, arch.points, arch.peak, undefined, farZ);
}

// the channel's own section at a body cap, in the side view (canvas X = Z, canvas Y = body length),
// stopped at the arch's contact when one is given: past it the arch is the surface
export function channelCapPath(p: ViolinFamilyParams, g: GougeParams, xBase: number, sign: 1 | -1, atStart: boolean, sEnd?: number, n = 40): string {
  let w = gougeHalfWidth(g.sweepRadius, g.depth);
  if (w <= 0) return '';
  let centerY = p.fluting!.flutingEdge + w;
  let end = Math.min(sEnd ?? w, w);
  let pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    let s = -w + ((end + w) * i) / n;
    let y = atStart ? centerY + s : p.body.height - centerY - s;
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * gougeProfileZ(s, g.sweepRadius, g.depth)} ${y}`);
  }
  return pts.join(' ');
}

// the ribs taper because they are planed down after the back is glued on. The entered heights are
// a caliper reading square to the rib edge, so w = z cos(angle) inverts to the vertical rise. The
// lower anchor is the body datum, the upper the rib's top end. Null where the two heights don't
// make a garland: a taper so steep the rib line outruns the body, or a height that isn't one
export function solveRibTaper(p: ViolinFamilyParams): RibTaper | null {
  let a = p.arching!;
  let wLower = a.ribHeightLower, wUpper = a.ribHeightUpper;
  let yLower = 0, yUpper = p.body.height - p.body.overhang;
  let run = yUpper - yLower;
  let max = maxRibTaper(p);
  if (!(wLower > 0 && wUpper > 0) || Math.abs(wLower - wUpper) > max) return null;
  let angle = run > 0 ? Math.asin((wLower - wUpper) / run) : 0;
  let cos = Math.cos(angle);
  return { yLower, yUpper, zLower: wLower / cos, zUpper: wUpper / cos, angle, max };
}

// where the tilted rib, the hypotenuse over the run, would outgrow the body
export function maxRibTaper(p: ViolinFamilyParams): number {
  let run = p.body.height - p.body.overhang;
  return run <= 0 || p.body.height <= run ? 0 : run * Math.sqrt(1 - (run / p.body.height) ** 2);
}

// linear in y and run on past both anchors, since the plate overhangs the rib at each end
export function ribHeightAt(p: ViolinFamilyParams, y: number, t: RibTaper): number {
  let run = t.yUpper - t.yLower;
  if (run <= 0) return t.zLower;
  return t.zLower + (y - t.yLower) * (t.zUpper - t.zLower) / run;
}

// the garland's top edge in the side view: the line the top plate glues to
export function ribLine(p: ViolinFamilyParams, t: RibTaper): { yLow: number; yHigh: number; zLow: number; zHigh: number } {
  let o = p.body.overhang;
  return { yLow: o, yHigh: p.body.height - o, zLow: ribHeightAt(p, o, t), zHigh: ribHeightAt(p, p.body.height - o, t) };
}

export interface TopPlatePlacement { dx: number; dy: number; angleDeg: number; pivotX: number; pivotY: number }

// a rigid rotation, not a shear, so the plate reads as carved rather than leaned; pivoted on the
// plate's midpoint so it overhangs the garland equally at both ends. In SVG's own terms
export function topPlatePlacement(p: ViolinFamilyParams, t: RibTaper): TopPlatePlacement {
  let rib = ribLine(p, t);
  let run = rib.yHigh - rib.yLow;
  let pivotX = t.zLower, pivotY = p.body.height / 2;
  if (run <= 0) return { dx: 0, dy: 0, angleDeg: 0, pivotX, pivotY };
  return {
    dx: (rib.zLow + rib.zHigh) / 2 - pivotX,
    dy: (rib.yLow + rib.yHigh) / 2 - pivotY,
    angleDeg: Math.atan2(rib.zLow - rib.zHigh, run) / TURN.degree,
    pivotX,
    pivotY,
  };
}

// a point in the top plate's carved frame, where it lands in the side view
export function placeOnTopPlate(pl: TopPlatePlacement, pt: Pt): Pt {
  let a = pl.angleDeg * TURN.degree;
  let px = pt.x - pl.pivotX, py = pt.y - pl.pivotY;
  return new Pt(px * Math.cos(a) - py * Math.sin(a) + pl.pivotX + pl.dx, px * Math.sin(a) + py * Math.cos(a) + pl.pivotY + pl.dy);
}

// the typed arch in the solver's terms: fractions along the body, the peak among them
export function longArchCurve(arch: LongArchParams): LongArchCurve {
  return { type: arch.type, archHeight: arch.height, peak: arch.peak / 100, points: arch.points.map(pt => ({ t: pt.t / 100, z: pt.z, mirror: pt.mirror })) };
}

// Where the arch stops being the curve the maker typed and becomes the run into the channel.
// Tangency against a known circle is one equation, so one unknown satisfies it: the contact point,
// free to slide along the channel's flank. Nobody chooses where the blend begins at the bench
// either; the tool and the wood decide.
//
// archSlopeAt is the slope the arch would arrive with at a given contact, supplied by the caller
// since the long arch and the cross arch build their curves differently. A root of that slope
// minus the channel's own is a tangent meeting, bracketed by a coarse scan before bisecting since
// both the span and the takeoff depth move with the contact. The inner flank is scanned first so an
// arch that met it lands where it did; an arch arriving sloping down meets the outer flank, past the
// trough. With no root anywhere the closest approach comes back flagged, never nothing: near the
// caps the two slopes go to zero together and whether they cross comes down to the last digits,
// and a station pinned at the flank's top beside neighbours at the trough rang a seam round the cap
export function solveArchTakeoff(
  sweepRadius: number, depth: number,
  archSlopeAt: (takeoffDepth: number, contactS: number) => number,
  scanSteps = 32,
): ArchTakeoff | null {
  let w = gougeHalfWidth(sweepRadius, depth);
  if (w <= 0) return null;
  // held just inside both ends: at 0 the channel is exactly flat, at w it has left the cut
  let lo = w * 1e-3, hi = w * (1 - 1e-3);
  let residual = (s: number): number => archSlopeAt(-gougeProfileZ(s, sweepRadius, depth), s) - gougeProfileSlope(s, sweepRadius, depth);
  let takeoffAt = (contactS: number, tangent: boolean): ArchTakeoff =>
    ({ contactS, takeoffDepth: -gougeProfileZ(contactS, sweepRadius, depth), slope: gougeProfileSlope(contactS, sweepRadius, depth), tangent });

  let nearest = { s: lo, mag: Infinity };
  let bracketOn = (dir: 1 | -1): [number, number, number] | null => {
    let aS = dir * lo, aR = residual(aS);
    if (Math.abs(aR) < nearest.mag) nearest = { s: aS, mag: Math.abs(aR) };
    for (let i = 1; i <= scanSteps; i++) {
      let s = dir * (lo + ((hi - lo) * i) / scanSteps);
      let r = residual(s);
      if (Math.abs(r) < nearest.mag) nearest = { s, mag: Math.abs(r) };
      if (aR === 0) return [aS, aR, aS];
      if (aR * r < 0) return aS < s ? [aS, aR, s] : [s, r, aS];
      aS = s; aR = r;
    }
    return null;
  };
  let bracket = bracketOn(1) ?? bracketOn(-1);
  if (!bracket) return takeoffAt(nearest.s, false);

  let [x0, r0, x1] = bracket;
  for (let i = 0; i < 60 && x1 - x0 > 1e-9; i++) {
    let mid = (x0 + x1) / 2;
    let rMid = residual(mid);
    if (r0 * rMid <= 0) x1 = mid; else { x0 = mid; r0 = rMid; }
  }
  return takeoffAt((x0 + x1) / 2, true);
}

// every height the maker enters is measured from the plate's edge, so an arch taking off
// edgeDepth below it gains that much once the builders measure z up from the lowered takeoff
export function archFromLoweredTakeoff(arch: LongArchCurve, edgeDepth: number): LongArchCurve {
  let raised = { ...arch, archHeight: arch.archHeight + edgeDepth };
  return raised.type === 'spline' ? { ...raised, points: raised.points.map(pt => ({ ...pt, z: pt.z + edgeDepth })) } : raised;
}

// arch height at s along a span, endZ the far end's height
export function archZAt(arch: LongArchCurve, span: number, s: number, endZ = 0): number {
  return arch.type === 'catenary'
    ? catenaryZAt(arch.archHeight, span, s)
    : splineZAt(arch.archHeight, span, arch.points, arch.peak, s, endZ);
}

function isSymmetric(arch: LongArchCurve): boolean {
  if (arch.type !== 'spline') return true;
  let k = archSplineKnots(arch.archHeight, arch.points, arch.peak);
  return k.every((a, i) => {
    let b = k[k.length - 1 - i];
    return Math.abs(a.t + b.t - 1) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
  });
}

function mirrored(arch: LongArchCurve): LongArchCurve {
  return arch.type === 'spline' ? { ...arch, peak: 1 - arch.peak, points: arch.points.map(pt => ({ ...pt, t: 1 - pt.t })) } : arch;
}

// the long arch terminated where it meets the channel at the body caps. Each end is solved as the
// start of its own view of the arch against wherever the other end currently lands, the far end
// seeing the mirrored arch; the ends nudge each other's span and level only weakly, so a few
// sweeps settle it. The C bout gouge never reaches a cap, so the main sweep governs both. Null
// when the gouge doesn't cut, the arch has no height, or the two landings leave no span
export function solveLongArch(p: ViolinFamilyParams, arch: LongArchCurve, g: GougeParams): LongArchSolve | null {
  let w = gougeHalfWidth(g.sweepRadius, g.depth);
  if (w <= 0 || arch.archHeight <= 0) return null;
  let centerY = p.fluting!.flutingEdge + w;
  let height = p.body.height;
  let eps = Math.max(height * 1e-5, 1e-4);

  let solveEnd = (a: LongArchCurve, other: ArchTakeoff | null): ArchTakeoff | null =>
    solveArchTakeoff(g.sweepRadius, g.depth, (takeoffDepth, contactS) => {
      let o = other ?? { takeoffDepth, contactS };
      let span = height - 2 * centerY - contactS - o.contactS;
      if (span <= 0) return 0;
      // a forward difference from the takeoff, which sits at exactly 0 in the lowered arch's frame
      return archZAt(archFromLoweredTakeoff(a, takeoffDepth), span, eps, takeoffDepth - o.takeoffDepth) / eps;
    });

  let start = solveEnd(arch, null);
  if (!start) return null;
  let far = start;
  if (!isSymmetric(arch)) {
    let flipped = mirrored(arch);
    for (let i = 0; i < 3; i++) {
      far = solveEnd(flipped, start) ?? far;
      start = solveEnd(arch, far) ?? start;
    }
  }
  let yStart = centerY + start.contactS;
  let yEnd = height - centerY - far.contactS;
  let span = yEnd - yStart;
  if (span <= 0) return null;
  return {
    span, yStart, yEnd, takeoff: start, farTakeoff: far,
    lowered: archFromLoweredTakeoff(arch, start.takeoffDepth),
    farZ: start.takeoffDepth - far.takeoffDepth,
    halfWidth: w, centerY,
  };
}

// the plate's centreline height at y, relative to its surface: flat land at the caps, down through
// the channel, then the arch over and back. One function across the body, since the arch's takeoff
// meets the channel's flank at the same height and slope. Without an arch the plate is channel and
// land only
export function channelCenterlineZAt(p: ViolinFamilyParams, g: GougeParams, la: LongArchSolve | null, y: number): number {
  let w = gougeHalfWidth(g.sweepRadius, g.depth);
  let centerY = p.fluting!.flutingEdge + w;
  let s = Math.min(y, p.body.height - y) - centerY;
  if (la && y > la.yStart && y < la.yEnd) return archZAt(la.lowered, la.span, y - la.yStart, la.farZ) - la.takeoff.takeoffDepth;
  return s <= -w ? 0 : gougeProfileZ(Math.min(s, w), g.sweepRadius, g.depth);
}

// a later panel reads the ribs and the arches by calling this; it returns and never writes to the
// params. An end that found no tangency keeps its closest approach and is reported, since a little
// sandpaper makes that join at the bench
export function solveLongArching(p: ViolinFamilyParams): LongArchingSolve | null {
  if (!p.arching || !p.fluting) return null;
  let a = p.arching;
  let s: LongArchingSolve = { ribs: null, top: null, back: null, failures: [] };
  let fail = (message: string, unsolved: LongArchingFailure['unsolved']): LongArchingFailure => ({ message, unsolved, circles: [], segments: [] });

  solveSection(s.failures, 'Ribs', ['ribs'], () => {
    if (!(a.ribHeightLower > 0 && a.ribHeightUpper > 0)) return fail('Ribs: both rib heights need a value above 0.', ['ribs']);
    s.ribs = solveRibTaper(p);
    if (!s.ribs) return fail(`Ribs: the ribs can taper by at most ${maxRibTaper(p).toFixed(1)}mm over a body this long. Past that the rib line runs longer than the instrument itself.`, ['ribs']);
    return null;
  });

  let f = solveFluting(p)!;
  for (let plate of ['top', 'back'] as const) {
    let label = plate === 'top' ? 'Top plate' : 'Back plate';
    let pa = a[plate];
    let arch = pa.arch;
    solveSection(s.failures, label, [plate], () => {
      if (!f[plate]) return fail(`${label}: the fluting channel has to solve first.`, [plate]);
      if (!(pa.thickness > 0)) return fail(`${label}: the thickness needs a value above 0.`, [plate]);
      if (!(arch.height > 0)) return fail(`${label}: the arch height needs a value above 0.`, [plate]);
      if (arch.type === 'spline') {
        // a cleared field reads as 0 against a range, so it is asked for first
        if (![arch.peak, ...arch.points.flatMap(pt => [pt.t, pt.z])].every(Number.isFinite)) return fail(`${label}: every point needs a position and a height.`, [plate]);
        if (!(arch.peak >= 5 && arch.peak <= 95)) return fail(`${label}: the peak has to sit between 5% and 95% of the length.`, [plate]);
        for (let pt of arch.points) {
          if (!(pt.t >= 1 && pt.t <= 99)) return fail(`${label}: every point has to sit between 1% and 99% of the length.`, [plate]);
          if (!(pt.z <= arch.height)) return fail(`${label}: a point stands above the peak. The arch height is its ceiling.`, [plate]);
          if (!(pt.z >= -pa.thickness)) return fail(`${label}: a point dips deeper than the plate is thick.`, [plate]);
        }
      }
      let solved = solveLongArch(p, longArchCurve(arch), p.fluting![plate]);
      if (!solved) return fail(`${label}: the arch can't meet its channel. Lower the arch, or widen the gouge.`, [plate]);
      s[plate] = solved;
      for (let [end, where] of [[solved.takeoff, 'lower'], [solved.farTakeoff, 'upper']] as const) {
        if (!end.tangent) s.failures.push(fail(`${label}: the arch meets the channel at a corner at the ${where} end. Ease the point nearest that end.`, []));
      }
      return null;
    });
  }
  return s;
}
