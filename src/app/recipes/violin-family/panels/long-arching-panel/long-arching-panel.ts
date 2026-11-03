import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pointOnCircle, TURN } from '../../../../helpers/math/simpleGeometry';
import {
  archSplineKnots, calcChannelHalfWidth, catenaryZAt, channelProfileZAt, solveArchTakeoff, splineZAt, SPLINE_PEAK_SOURCE,
} from '../../../../helpers/math/archMath';
import { buildCatenaryPath, buildSplinePath, occludePath } from '../../../../helpers/math/pathVibes';
import {
  renderGuideBaseline, renderGuideKnot, renderGuideMeasure, renderPath, renderPointHalo, renderSegment, renderSolveFailures, renderTranslatedLayers,
} from '../../../../helpers/renderFuncs';
import { buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { TooltipDirective } from '../../../../docs/tooltips';
import { Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { applyRowMove, RowMove, RowReorderDirective, rowsWithMarker } from '../../../../shared/row-reorder';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { ChannelParams, LongArchParams, PlateArchParams, RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { ArchTakeoff, LongArchCurve, LongArchingSolve, LongArchSolve, PlateContourSolve, Plate, RibTaper, FlutingSolve } from '../../violin-family-solves';
import { familyStandards } from '../../violin-family-seed';
import { renderFluting, solveFluting } from '../fluting-panel/fluting-panel';
import { renderPlateContour, solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';

// The arch along the body. The channel is cut first, at the gouge's own section; the arch is then
// run from its peak down into the channel's inner flank and stops where it meets it tangentially,
// so where it starts and ends is solved, not typed. The ribs are here too, since the side view
// stands the top plate on them: their taper is placement, not carving, and tilts the plate as one
// piece. Panel and renders, then the ribs, then the arch's landing and the arch.

@Component({
  selector: 'app-vf-long-arching-panel',
  imports: [FormsModule, NumberStepperDirective, RowReorderDirective, TooltipDirective],
  templateUrl: './long-arching-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class LongArchingPanel extends PanelComponentBase<{ plate: Plate; source: number }> {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('iceAndFire');
  protected readonly peakSource = SPLINE_PEAK_SOURCE;
  protected readonly plates: readonly Plate[] = ['top', 'back'];
  protected readonly rows = rowsWithMarker;

  // the ribs and the edge off the family's standards, the arch heights the maker's eye by family;
  // every curve type's fields written at once, the spline's points hung off the seeded height, so
  // a type switch only reveals. The crown is seeded here too, since both arches share p.arching
  static seed(p: ViolinFamilyParams): void {
    if (p.arching || !p.fluting) return;
    let s = familyStandards(p.body.height);
    let [topH, backH] = { violin: [15, 14], viola: [20, 18], cello: [27, 25], bass: [55, 50] }[s.family];
    p.arching = { ribHeightLower: s.ribHeightLower, ribHeightUpper: s.ribHeightUpper, top: seedPlateArch(topH, s.edgeThickness), back: seedPlateArch(backH, s.edgeThickness) };
  }

  // what the last draw solved; the template's readouts and reportSolveFailures() read it
  a!: LongArchingSolve;

  reportSolveFailures(): void {
    reportFailures(this.a.failures, 'Long arching');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let o = solvePlateContour(p)!;
    let f = solveFluting(p)!;
    let a = this.a = solveLongArching(p, f)!;
    let sideX = calcSideViewOffsetX(p);
    let side = renderBodySideProfile(p, a, o, this.pal, true, { highlight: this.highlightedPart?.key ?? null, showGuides: this.flags.showModuleGuides });
    return [
      renderPlateContour(p, o, this.pal, this.flags, false, true),
      renderFluting(p, f, this.pal, false, true),
      renderFholes(p, this.pal),
      renderTranslatedLayers([side], sideX),
      renderSolveFailures(a.failures, this.pal.alert),
    ];
  }

  // a new point fills the widest gap in the curve as it stands, mirrored twins and the peak
  // included, since those are the knots on screen
  addPoint(plate: Plate): void {
    let arch = this.params.arching![plate].long;
    let knots = [{ t: 0, z: 0 }, ...archSplineKnots(arch.height, calcLongArchCurve(arch).points, arch.peak / 100), { t: 1, z: 0 }];
    let gap = 0, at = 0;
    for (let i = 0; i + 1 < knots.length; i++) {
      if (knots[i + 1].t - knots[i].t > gap) { gap = knots[i + 1].t - knots[i].t; at = i; }
    }
    arch.points.push({
      t: +(50 * (knots[at].t + knots[at + 1].t)).toFixed(1),
      z: +((knots[at].z + knots[at + 1].z) / 2).toFixed(1),
      mirror: false,
    });
    this.recordEditAndRedraw();
  }

  // the peak keeps its place between the same points
  removePoint(plate: Plate, index: number): void {
    let arch = this.params.arching![plate].long;
    if (index < (arch.peakRow ?? 0)) arch.peakRow!--;
    arch.points.splice(index, 1);
    this.recordEditAndRedraw();
  }

  // the upper end first, as the side view stands
  sortPoints(plate: Plate): void {
    let arch = this.params.arching![plate].long;
    arch.points.sort((a, b) => b.t - a.t);
    arch.peakRow = arch.points.filter(pt => pt.t > arch.peak).length;
    this.recordEditAndRedraw();
  }

  moveRow(plate: Plate, move: RowMove): void {
    let arch = this.params.arching![plate].long;
    arch.peakRow = applyRowMove(arch.points, arch.peakRow ?? 0, move);
    this.recordEditAndRedraw();
  }

  // the point whose field has focus, haloed on the arch; the peak is a point too
  highlightArchPoint(plate: Plate, source: number): void {
    this.highlightPart({ plate, source });
  }
}

function seedPlateArch(height: number, thickness: number): PlateArchParams {
  let points = seedLongArchPoints(height);
  return {
    thickness,
    long: { type: 'catenary' as const, height, peak: 50, peakRow: points.filter(pt => pt.t > 50).length, points },
    cross: { type: 'cycloid' as const, d: 40, pct: 90, peak: 50, points: [{ x: 83, z: 50, mirror: true }], stations: [] },
  };
}

// a spline seeded free end to end rather than mirrored: the upper and lower bouts carry different
// wood, so a long arch is rarely symmetric
function seedLongArchPoints(height: number): LongArchParams['points'] {
  return [
    { t: 75, z: +(height * 0.85).toFixed(1), mirror: false },
    { t: 25, z: +(height * 0.85).toFixed(1), mirror: false },
  ];
}

// the top plate takes the warm ink, the back the cold, the channel the one between
export const TOP_ARCH_INK = 2;
export const BACK_ARCH_INK = 0;
export const CHANNEL_INK = 1;

// right of the plan, where every panel leaves room. The back's gluing plane holds still while the
// arching is edited, a fixed reference on the canvas, until the back's arch would reach the plan
export function calcSideViewOffsetX(p: ViolinFamilyParams): number {
  let a = p.arching!;
  let clearance = Math.max(0.12 * p.body.height, 20 + a.back.thickness + a.back.long.height);
  return p.body.width / 2 + p.body.overhang + p.body.rib + clearance;
}

export interface SideProfileOpts {
  highlight?: { plate: Plate; source: number } | null;
  showGuides?: boolean;
  ground?: boolean;
  fluting?: boolean;
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
  p: ViolinFamilyParams, a: LongArchingSolve, o: PlateContourSolve, pal: PanelPalette, currentModule: boolean, opts: SideProfileOpts,
) => (g: any, ui: any): void => {
  let taper = a.ribs;
  if (!taper) return;
  let c = o.corners;
  let flatEnds = [c.U31 ?? c.U3, c.C21 ?? c.C2, c.C11 ?? c.C1, c.L31 ?? c.L3].flatMap(arc => arc ? [pointOnCircle(arc, arc.end).y] : []);
  let rib = calcRibLine(p, taper);
  renderPath(`M 0 ${rib.yLow} L ${rib.zLow} ${rib.yLow} L ${rib.zHigh} ${rib.yHigh} L 0 ${rib.yHigh} Z`, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  for (let corner of [p.corners!.UCr, p.corners!.LCr]) {
    renderSegment(new Pt(0, corner.y), new Pt(ribHeightAt(p, corner.y, taper), corner.y), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  }
  // the ui layer is Y-flipped, so its transform mirrors
  let { dx, dy, angleDeg, pivotX, pivotY } = calcTopPlatePlacement(p, taper);
  let gTop = g.append('g').attr('transform', `translate(${dx},${dy}) rotate(${angleDeg},${pivotX},${pivotY})`);
  let uiTop = ui.append('g').attr('transform', `translate(${dx},${-dy}) rotate(${-angleDeg},${pivotX},${-pivotY})`);
  renderPlateSideProfile(p, a, 'top', flatEnds, pal, currentModule, opts)(gTop, uiTop);
  renderPlateSideProfile(p, a, 'back', flatEnds, pal, currentModule, opts)(g, ui);
};

// one plate in the side view, flat: the top's tilt is the caller's transform. Cut down the
// centreline there's no slab outline: over all but the last few millimetres the plate's outer
// surface is the arch, and a rectangle at plate level would contradict the curve
export const renderPlateSideProfile = (
  p: ViolinFamilyParams, a: LongArchingSolve, plate: Plate, flatEnds: number[], pal: PanelPalette, currentModule: boolean, opts: SideProfileOpts,
) => (g: any, ui: any): void => {
  let isTop = plate === 'top';
  let sign: 1 | -1 = isTop ? 1 : -1;
  let thickness = p.arching![plate].thickness;
  let innerZ = isTop ? a.ribs!.zLower : 0;
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
    renderPath(defineChannelCapPath(p, gouge, outerZ, sign, true, solved?.takeoff.contactS), channel, STROKE_WEIGHT.section)(g, ui);
    renderPath(defineChannelCapPath(p, gouge, outerZ, sign, false, solved?.farTakeoff.contactS), channel, STROKE_WEIGHT.section)(g, ui);
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
  let arch = defineArchPath(lowered, span, yStart, xBase, sign, farZ);
  renderPath(cut ? arch : occludePath(arch, slab).visible, color, STROKE_WEIGHT.section)(g, ui);

  // the guide takes the arch as typed and the plate's outer surface, not the lowered arch against
  // its takeoff: the takeoff moves with the channel, and a guide counting from it would label a
  // height nobody typed
  if (opts.showGuides) {
    let authored = calcLongArchCurve(p.arching![plate].long);
    renderGuideBaseline(new Pt(outerZ, 0), new Pt(outerZ, p.body.height), color)(g, ui);
    for (let knot of calcArchGuideKnots(authored)) {
      let y = yStart + knot.t * span;
      let at = new Pt(outerZ + sign * knot.z, y);
      renderGuideMeasure(new Pt(outerZ, y), at, color, 0, knot.z)(g, ui);
      renderGuideKnot(at, color)(g, ui);
    }
  }
};

// a spline is its control points, so every knot is marked; a catenary follows from the one height
function calcArchGuideKnots(arch: LongArchCurve): { t: number; z: number }[] {
  return arch.type === 'spline' ? archSplineKnots(arch.archHeight, arch.points, arch.peak) : [{ t: 0.5, z: arch.archHeight }];
}

// the arch over its span in the side view (canvas X = Z, canvas Y = body length)
export function defineArchPath(arch: LongArchCurve, span: number, yStart: number, xBase: number, sign: 1 | -1, farZ: number): string {
  return arch.type === 'catenary'
    ? buildCatenaryPath(arch.archHeight, span, yStart, xBase, sign)
    : buildSplinePath(arch.archHeight, span, yStart, xBase, sign, arch.points, arch.peak, undefined, farZ);
}

// the channel's own section at a body cap, in the side view, stopped at the arch's contact when
// one is given: past it the arch is the surface
export function defineChannelCapPath(p: ViolinFamilyParams, g: ChannelParams, xBase: number, sign: 1 | -1, atStart: boolean, sEnd?: number, n = 40): string {
  let w = calcChannelHalfWidth(g.width, g.depth);
  if (w <= 0) return '';
  let centerY = p.fluting!.flutingEdge + w;
  let end = Math.min(sEnd ?? w, w);
  let pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    let s = -w + ((end + w) * i) / n;
    let y = atStart ? centerY + s : p.body.height - centerY - s;
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * channelProfileZAt(s, g.width, g.depth)} ${y}`);
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
  let max = calcMaxRibTaper(p);
  if (!(wLower > 0 && wUpper > 0) || Math.abs(wLower - wUpper) > max) return null;
  let angle = run > 0 ? Math.asin((wLower - wUpper) / run) : 0;
  let cos = Math.cos(angle);
  return { yLower, yUpper, zLower: wLower / cos, zUpper: wUpper / cos, angle, max };
}

// where the tilted rib, the hypotenuse over the run, would outgrow the body
export function calcMaxRibTaper(p: ViolinFamilyParams): number {
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
export function calcRibLine(p: ViolinFamilyParams, t: RibTaper): { yLow: number; yHigh: number; zLow: number; zHigh: number } {
  let o = p.body.overhang;
  return { yLow: o, yHigh: p.body.height - o, zLow: ribHeightAt(p, o, t), zHigh: ribHeightAt(p, p.body.height - o, t) };
}

export interface TopPlatePlacement { dx: number; dy: number; angleDeg: number; pivotX: number; pivotY: number }

// a rigid rotation, not a shear, so the plate reads as carved rather than leaned; pivoted on the
// plate's midpoint so it overhangs the garland equally at both ends. In SVG's own terms
export function calcTopPlatePlacement(p: ViolinFamilyParams, t: RibTaper): TopPlatePlacement {
  let rib = calcRibLine(p, t);
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
export function calcLongArchCurve(arch: LongArchParams): LongArchCurve {
  return { type: arch.type, archHeight: arch.height, peak: arch.peak / 100, points: arch.points.map(pt => ({ t: pt.t / 100, z: pt.z, mirror: pt.mirror })) };
}

// every height the maker enters is measured from the plate's edge, so an arch taking off
// edgeDepth below it gains that much once the builders measure z up from the lowered takeoff
export function restateArchFromTakeoff(arch: LongArchCurve, edgeDepth: number): LongArchCurve {
  let raised = { ...arch, archHeight: arch.archHeight + edgeDepth };
  return raised.type === 'spline' ? { ...raised, points: raised.points.map(pt => ({ ...pt, z: pt.z + edgeDepth })) } : raised;
}

// arch height at s along a span, endZ the far end's height
export function archZAt(arch: LongArchCurve, span: number, s: number, endZ = 0): number {
  return arch.type === 'catenary'
    ? catenaryZAt(arch.archHeight, span, s)
    : splineZAt(arch.archHeight, span, arch.points, arch.peak, s, endZ);
}

function isSymmetricArch(arch: LongArchCurve): boolean {
  if (arch.type !== 'spline') return true;
  let k = archSplineKnots(arch.archHeight, arch.points, arch.peak);
  return k.every((a, i) => {
    let b = k[k.length - 1 - i];
    return Math.abs(a.t + b.t - 1) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
  });
}

function mirrorArch(arch: LongArchCurve): LongArchCurve {
  return arch.type === 'spline' ? { ...arch, peak: 1 - arch.peak, points: arch.points.map(pt => ({ ...pt, t: 1 - pt.t })) } : arch;
}

// the slope the long arch arrives with at this end if it lands at contactS, takeoffDepth deep.
// The landing fixes the arch: its span runs from here to wherever the other end lands (or to a
// landing like this one while the other end is unsolved), its heights are restated from this
// takeoff, so the whole curve is known and its slope is read a hair in from the start
function calcLongArchArrivalSlope(
  bodyHeight: number, arch: LongArchCurve, centerY: number, other: ArchTakeoff | null, takeoffDepth: number, contactS: number,
): number {
  let o = other ?? { takeoffDepth, contactS };
  let span = bodyHeight - 2 * centerY - contactS - o.contactS;
  if (span <= 0) return 0;
  let eps = Math.max(bodyHeight * 1e-5, 1e-4);
  return archZAt(restateArchFromTakeoff(arch, takeoffDepth), span, eps, takeoffDepth - o.takeoffDepth) / eps;
}

// one end of the long arch landed tangent on its channel, the arch seen from this end as its
// start, against wherever the other end currently lands
function solveLongArchEndTakeoff(p: ViolinFamilyParams, arch: LongArchCurve, g: ChannelParams, centerY: number, other: ArchTakeoff | null): ArchTakeoff | null {
  return solveArchTakeoff(g.width, g.depth, (takeoffDepth, contactS) => calcLongArchArrivalSlope(p.body.height, arch, centerY, other, takeoffDepth, contactS));
}

// the long arch terminated where it meets the channel at the body caps. The two ends are coupled,
// each end's span depending on where the other lands, so a symmetric arch is solved once for both
// and an asymmetric one by alternating: the lower end against the upper's current landing, then
// the upper (seeing the mirrored arch) against the lower's. The ends nudge each other's span and
// level only weakly, so three rounds settle it. The C bout gouge never reaches a cap, so the main
// sweep governs both. Null when the gouge doesn't cut, the arch has no height, or the two landings
// leave no span
export function solveLongArch(p: ViolinFamilyParams, arch: LongArchCurve, g: ChannelParams): LongArchSolve | null {
  let w = calcChannelHalfWidth(g.width, g.depth);
  if (w <= 0 || arch.archHeight <= 0) return null;
  let centerY = p.fluting!.flutingEdge + w;

  let start = solveLongArchEndTakeoff(p, arch, g, centerY, null);
  if (!start) return null;
  let far = start;
  if (!isSymmetricArch(arch)) {
    let flipped = mirrorArch(arch);
    for (let i = 0; i < 3; i++) {
      far = solveLongArchEndTakeoff(p, flipped, g, centerY, start) ?? far;
      start = solveLongArchEndTakeoff(p, arch, g, centerY, far) ?? start;
    }
  }
  let yStart = centerY + start.contactS;
  let yEnd = p.body.height - centerY - far.contactS;
  let span = yEnd - yStart;
  if (span <= 0) return null;
  return {
    span, yStart, yEnd, takeoff: start, farTakeoff: far,
    lowered: restateArchFromTakeoff(arch, start.takeoffDepth),
    farZ: start.takeoffDepth - far.takeoffDepth,
    halfWidth: w, centerY,
  };
}

// the solved arch's height at y along the body, relative to the plate's surface; beyond either
// landing it holds that landing's depth, the arch having become the channel there
export function longArchHeightAt(la: LongArchSolve, y: number): number {
  let s = y - la.yStart;
  if (s <= 0) return -la.takeoff.takeoffDepth;
  if (s >= la.span) return -la.farTakeoff.takeoffDepth;
  return archZAt(la.lowered, la.span, s, la.farZ) - la.takeoff.takeoffDepth;
}

// the plate's centreline height at y, relative to its surface: flat land at the caps, down through
// the channel, then the arch over and back. One function across the body, since the arch's takeoff
// meets the channel's flank at the same height and slope. Without an arch the plate is channel and
// land only
export function channelCenterlineZAt(p: ViolinFamilyParams, g: ChannelParams, la: LongArchSolve | null, y: number): number {
  let w = calcChannelHalfWidth(g.width, g.depth);
  let centerY = p.fluting!.flutingEdge + w;
  let s = Math.min(y, p.body.height - y) - centerY;
  if (la && y > la.yStart && y < la.yEnd) return longArchHeightAt(la, y);
  return s <= -w ? 0 : channelProfileZAt(Math.min(s, w), g.width, g.depth);
}

// a later panel reads the ribs and the arches by calling this; it returns and never writes to the
// params. An end that found no tangency keeps its closest approach and is reported, since a little
// sandpaper makes that join at the bench
export function solveLongArching(p: ViolinFamilyParams, f?: FlutingSolve): LongArchingSolve | null {
  if (!p.arching || !p.fluting) return null;
  let a = p.arching;
  let s: LongArchingSolve = { ribs: null, top: null, back: null, failures: [] };
  f ??= solveFluting(p)

  solveSection(s.failures, 'Ribs', ['ribs'], () => {
    if (!(a.ribHeightLower > 0 && a.ribHeightUpper > 0)) return buildMiss('Ribs: both rib heights need a value above 0.', ['ribs']);
    s.ribs = solveRibTaper(p);
    if (!s.ribs) return buildMiss(`Ribs: the ribs can taper by at most ${calcMaxRibTaper(p).toFixed(1)}mm over a body this long. Past that the rib line runs longer than the instrument itself.`, ['ribs']);
    return null;
  });

  for (let plate of ['top', 'back'] as const) {
    let label = plate === 'top' ? 'Top plate' : 'Back plate';
    let pa = a[plate];
    let arch = pa.long;
    solveSection(s.failures, label, [plate], () => {
      if (!f[plate]) return buildMiss(`${label}: the fluting channel has to solve first.`, [plate]);
      if (!(pa.thickness > 0)) return buildMiss(`${label}: the thickness needs a value above 0.`, [plate]);
      if (!(arch.height > 0)) return buildMiss(`${label}: the arch height needs a value above 0.`, [plate]);
      if (arch.type === 'spline') {
        // a cleared field reads as 0 against a range, so it is asked for first
        if (![arch.peak, ...arch.points.flatMap(pt => [pt.t, pt.z])].every(Number.isFinite)) return buildMiss(`${label}: every point needs a position and a height.`, [plate]);
        if (!(arch.peak >= 5 && arch.peak <= 95)) return buildMiss(`${label}: the peak has to sit between 5% and 95% of the length.`, [plate]);
        for (let pt of arch.points) {
          if (!(pt.t >= 1 && pt.t <= 99)) return buildMiss(`${label}: every point has to sit between 1% and 99% of the length.`, [plate]);
          if (!(pt.z <= arch.height)) return buildMiss(`${label}: a point stands above the peak. The arch height is its ceiling.`, [plate]);
          if (!(pt.z >= -pa.thickness)) return buildMiss(`${label}: a point dips deeper than the plate is thick.`, [plate]);
        }
      }
      let solved = solveLongArch(p, calcLongArchCurve(arch), p.fluting![plate]);
      if (!solved) return buildMiss(`${label}: the arch can't meet its channel. Lower the arch, or widen the gouge.`, [plate]);
      s[plate] = solved;
      for (let [end, where] of [[solved.takeoff, 'lower'], [solved.farTakeoff, 'upper']] as const) {
        if (!end.tangent) s.failures.push(buildMiss(`${label}: the arch meets the channel at a corner at the ${where} end. Ease the point nearest that end.`, []));
      }
      return null;
    });
  }
  return s;
}
