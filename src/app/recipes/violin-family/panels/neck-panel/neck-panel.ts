import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  angleFromCenter, dist, intersectLines, lineFromTwoPoints, moveInVectorSpace, pointOnCircle, TURN, vectorFromSlope,
} from '../../../../helpers/math/simpleGeometry';
import { applyMatrix, Matrix2D, pathFromArc, pathFromLine, pathFromPolygon, transformPath, translatePath } from '../../../../helpers/math/pathMath';
import { occludePath } from '../../../../helpers/math/pathVibes';
import {
  renderArcHalo, renderDashedLine, renderGuideBaseline, renderGuideMeasure, renderPath, renderPolygon, renderSegment,
  renderSegmentHalo, renderSolveFailures, renderStroke,
} from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { Arc, arcFromCircle, Circle, Pt, Vect2D } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { DASH, STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { NeckFailure, NeckSolve, OuterContourSolve, RenderLayer, ScrollSolve, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { familyStandards } from '../../violin-family-seed';
import { PLATE_LAYOUT_GAP, solveOuterContour } from '../outer-contour-panel/outer-contour-panel';
import { fholePath, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import {
  channelCenterlineZAt, placeOnTopPlate, renderBodySideProfile, ribHeightAt, sideViewOffsetX, solveLongArching, topPlatePlacement,
} from '../long-arching-panel/long-arching-panel';
import { defineSideScrollPath } from '../scroll-panel/scroll-panel';
import { ScrollView, scrollBackViewStrokes, scrollFrontViewStrokes, solveScrollWidths } from '../scroll-widths-panel/scroll-widths-panel';

// The neck set in the side elevation, and its widths in plan. Everything hangs off the top plate's
// edge at the neck end, so the rib taper carries through: the fingerboard plane stands off that edge
// by the overstand at the neck's angle, the neck's length along it from the mortise floor places
// the nut, and the back runs straight from under the nut through the heel's corner. The heel is a
// cove from the back down to the button tip; the foot is cut square to the neck. Panel and renders,
// then the solve.

export type NeckHighlightKey = 'length' | 'upperThickness' | 'lowerThickness' | 'topWidth' | 'rootWidth' | 'heel' | 'buttonHeight' | 'mortise' | 'overstand' | 'angle';

@Component({
  selector: 'app-vf-neck-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './neck-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class NeckPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('varnish');

  // the length runs along the fingerboard plane from the mortise floor, so the stop grows by the
  // overhang and the mortise, at the neck's lean
  static seed(p: ViolinFamilyParams): void {
    if (p.neck || !p.arching) return;
    let s = familyStandards(p.body.height);
    let inPlate = (p.body.overhang + s.neck.mortiseDepth) / Math.cos(s.neck.angle * TURN.degree);
    p.neck = { length: Math.round((s.neckStop + inPlate) * 2) / 2, ...s.neck };
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; report() reads it
  n!: NeckSolve;

  // the field with focus, haloed where it measures
  highlighted: { key: NeckHighlightKey; color: string } | null = null;

  ngOnInit(): void {
    this.draw();
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  report(): void {
    reportFailures(this.n.failures, 'Neck');
  }

  focus(key: NeckHighlightKey, color: string): void {
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
      let n = this.n = solveNeck(p)!;
      let a = solveLongArching(p)!;
      let o = solveOuterContour(p)!;
      let w = p.scroll ? solveScrollWidths(p) : null;
      let scroll = w && !w.scroll.failures.length ? w.scroll : undefined;
      let scrollInPlan = scroll && !w!.failures.some(f => f.unsolved.length) ? scroll : null;
      let sideX = sideViewOffsetX(p);
      let side = [
        renderBodySideProfile(p, a, o, this.pal, false, { ground: true }),
        renderNeck(p, n, this.pal, { guides: this.flags.showModuleGuides, scroll }),
        renderNeckHighlight(p, n, this.highlighted, 'side'),
        renderSolveFailures(n.failures, this.pal.alert),
      ];
      this.drawn.emit([
        renderNeckFrontView(p, n, o, scrollInPlan, this.pal),
        renderNeckHighlight(p, n, this.highlighted, 'front', o.back ? -p.body.width * PLATE_LAYOUT_GAP : null),
        (g, ui) => {
          let frame = { g: g.append('g').attr('transform', `translate(${sideX},0)`), ui: ui.append('g').attr('transform', `translate(${sideX},0)`) };
          for (let layer of side) layer(frame.g, frame.ui);
        },
      ]);
    });
  }
}

// the neck in the side elevation, over the body's side profile. Only what a field sets is in
// colour: the front, the two thicknesses, the heel; the rest of the outline is plain. Ground,
// everything draws neutral and only the nut's end is closed: for a later panel where the neck is
// what something else stands on. A scroll solved whole is set on the neck's end, the pegbox running
// on past the nut and the back up to where the nape meets it, as the scroll panels draw it
export const renderNeck = (
  p: ViolinFamilyParams,
  n: NeckSolve,
  pal: PanelPalette,
  opts: { guides?: boolean; ground?: boolean; scroll?: ScrollSolve } = {},
) => (g: any, ui: any): void => {
  if (!n.root || !n.neckTop || !n.backNut || !n.backRoot || !n.bottomFront || !n.lowerThickness || !n.tip) return;
  let nk = p.neck!;
  let onNeck = opts.scroll ? scrollOnNeck(p, n) : null;
  let backTop = onNeck ? applyMatrix(onNeck, pointOnCircle(opts.scroll!.nape!, opts.scroll!.nape!.start)) : n.backNut;
  let ink = (c: string) => opts.ground ? pal.neutral : c;
  let seg = (a: Pt, b: Pt, color: string = pal.neutral) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);
  let hidden = (a: Pt, b: Pt) => opts.guides && renderDashedLine(a, b, pal.neutral, DASH.hidden, STROKE_WEIGHT.section, 1)(g, ui);
  let [frontHeel, backHeel] = n.lowerThickness;

  // the button: the back plate carried on past its edge, the heel's foot on top of it
  let backThickness = p.arching!.back.thickness;
  let h = p.body.height;
  renderPolygon([new Pt(0, h), new Pt(0, n.tip.y), new Pt(-backThickness, n.tip.y), new Pt(-backThickness, h)], ink(pal.ink(1)), STROKE_WEIGHT.section)(g, ui);

  // the foot from where it comes out of the plate at the mortise floor up to the fingerboard plane;
  // below it the foot is hidden in the block
  if (n.plateAtMortise) seg(n.plateAtMortise, n.bottomFront, ink(pal.ink(0).faint(-3)));

  if (onNeck) {
    seg(n.neckTop, applyMatrix(onNeck, new Pt(0, nk.nutHeight)));
    renderPath(transformPath(defineSideScrollPath(p, opts.scroll!), onNeck), pal.neutral, STROKE_WEIGHT.section)(g, ui);
  }

  let heel = n.heel;
  if (heel) {
    seg(backTop, pointOnCircle(heel, heel.start));
    renderPath(pathFromArc(heel), ink(pal.ink(3)), STROKE_WEIGHT.section)(g, ui);
    if (n.heelFace) seg(n.heelFace[0], n.heelFace[1], ink(pal.ink(3)));
  } else {
    seg(backTop, n.backRoot);
  }

  // the two thicknesses, across the nut end and across the heel's corner, the back carried on to
  // the corner the heel hides
  if (opts.ground) {
    if (!onNeck) seg(n.neckTop, n.backNut);
  } else {
    if (onNeck) hidden(backTop, n.backNut);
    if (heel) {
      hidden(pointOnCircle(heel, heel.start), backHeel);
      hidden(backHeel, pointOnCircle(heel, heel.end));
    }
  }
  seg(n.bottomFront, n.root, ink(pal.ink(2)));
  seg(n.root, n.neckTop, ink(pal.ink(2)));

  if (!opts.guides) return;
  let rootPlaneY = h - p.body.overhang;
  // offsets scale with the neck's own thickness, so the dimensions clear a cello neck as a violin's
  if (n.plateEdge) renderGuideMeasure(n.plateEdge, n.root, pal.neutral, -nk.upperThickness)(g, ui);
  renderGuideBaseline(new Pt(0, rootPlaneY), new Pt(n.bottomFront.x, rootPlaneY), pal.neutral)(g, ui);
  renderGuideMeasure(new Pt(n.bottomFront.x, rootPlaneY), n.bottomFront, pal.neutral, 2 * nk.upperThickness)(g, ui);
  renderGuideMeasure(n.bottomFront, n.neckTop, pal.neutral, -2 * nk.upperThickness)(g, ui);
  renderGuideMeasure(n.neckTop, n.backNut, pal.neutral)(g, ui);
  renderGuideMeasure(frontHeel, backHeel, pal.neutral)(g, ui);
};

// the halo behind whatever the focused field measures, in the view that shows it: the widths in
// plan, everything else in the side elevation
const renderNeckHighlight = (
  p: ViolinFamilyParams,
  n: NeckSolve,
  highlighted: { key: NeckHighlightKey; color: string } | null,
  view: 'side' | 'front',
  backDx: number | null = null,
) => (g: any, ui: any): void => {
  if (!highlighted || !n.root || !n.neckTop || !n.backNut || !n.bottomFront || !n.lowerThickness || !n.tip) return;
  let { key, color } = highlighted;
  if ((key === 'topWidth' || key === 'rootWidth') !== (view === 'front')) return;
  let nk = p.neck!;
  let line = (a: Pt, b: Pt) => renderSegmentHalo(a, b, color)(g, ui);
  let floorY = mortiseFloorY(p);
  switch (key) {
    case 'length': line(n.bottomFront, n.neckTop); break;
    case 'upperThickness': line(n.neckTop, n.backNut); break;
    case 'lowerThickness': line(...n.lowerThickness); break;
    case 'topWidth':
      for (let dx of backDx === null ? [0] : [0, backDx]) line(new Pt(dx - nk.topWidth / 2, n.neckTop.y), new Pt(dx + nk.topWidth / 2, n.neckTop.y));
      break;
    case 'rootWidth':
      for (let dx of backDx === null ? [0] : [0, backDx]) line(new Pt(dx - nk.rootWidth / 2, floorY), new Pt(dx + nk.rootWidth / 2, floorY));
      break;
    case 'heel': if (n.heel) renderArcHalo(n.heel, color)(g, ui); break;
    case 'buttonHeight': line(new Pt(0, p.body.height), n.tip); break;
    case 'mortise': line(new Pt(0, p.body.height - p.body.overhang), new Pt(0, floorY)); break;
    case 'overstand': if (n.plateEdge) line(n.plateEdge, n.root); break;
    case 'angle': line(n.root, n.neckTop); break;
  }
};

// the scroll's frame set on the neck: its origin the nut's foot on the neck's front, +x the
// fingerboard plane's normal and +y up the neck, so the neck's angle turns it
export function scrollOnNeck(p: ViolinFamilyParams, n: NeckSolve): Matrix2D {
  let angle = p.neck!.angle * TURN.degree;
  let normal = vectorFromSlope(angle);
  let up = vectorFromSlope(angle + TURN.quarter);
  return [normal.a, normal.b, up.a, up.b, n.neckTop!.x, n.neckTop!.y];
}

// how much deeper the back sits per mm along the fingerboard plane toward the heel, the back running
// straight from the upper thickness at the nut to the lower at the heel's corner. In the scroll's
// frame the back is x = -upperThickness + taper * y. Square, 0, until the neck solves
export function neckTaper(p: ViolinFamilyParams, n: NeckSolve | null = solveNeck(p)): number {
  if (!n?.neckTop || !n.lowerThickness) return 0;
  return (p.neck!.lowerThickness - p.neck!.upperThickness) / dist(n.neckTop, n.lowerThickness[0]);
}

// the neck in plan, top width at the nut's foot to root width at the mortise floor
export function neckInPlan(p: ViolinFamilyParams, n: NeckSolve): string {
  let nk = p.neck!;
  let floorY = mortiseFloorY(p);
  let topY = n.neckTop!.y;
  return pathFromPolygon([
    new Pt(-nk.rootWidth / 2, floorY), new Pt(nk.rootWidth / 2, floorY),
    new Pt(nk.topWidth / 2, topY), new Pt(-nk.topWidth / 2, topY),
  ]);
}

// the instrument from the front, the top plate with whatever the neck covers cut away and the neck
// over it, and beside it the back with the neck's sides coming out past its edge, the plate nearest
// the eye. Only the two ends a width sets are in colour, the top the neck's and the root the root's
const renderNeckFrontView = (p: ViolinFamilyParams, n: NeckSolve, o: OuterContourSolve, scroll: ScrollSolve | null, pal: PanelPalette) => (g: any, ui: any): void => {
  if (!n.neckTop) return;
  let nk = p.neck!;
  let neck = neckInPlan(p, n);
  let cut = (d: string | null) => d ? occludePath(d, neck).visible : '';
  let holes = p.fHoleContours ? solveFholeContours(p)! : null;
  let fHoles = holes?.path ? [holes.path, fholePath(p, holes, true)!] : [];
  renderPath(cut(o.top), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  for (let d of [o.purfling, o.outerPurfling, ...fHoles]) renderPath(cut(d), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  renderPath(neck, pal.neutral, STROKE_WEIGHT.section)(g, ui);

  let dx = -p.body.width * PLATE_LAYOUT_GAP;
  if (o.back) {
    let back = translatePath(o.back, dx, 0);
    renderPath(back, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    for (let d of [o.purfling, o.outerPurfling]) if (d) renderPath(translatePath(d, dx, 0), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    let floorY = mortiseFloorY(p);
    for (let side of [1, -1]) {
      let edge = pathFromLine(new Pt(dx + side * nk.rootWidth / 2, floorY), new Pt(dx + side * nk.topWidth / 2, n.neckTop.y));
      renderPath(occludePath(edge, back).visible, pal.neutral, STROKE_WEIGHT.section)(g, ui);
    }
    renderSegment(new Pt(dx - nk.topWidth / 2, n.neckTop.y), new Pt(dx + nk.topWidth / 2, n.neckTop.y), pal.neutral, STROKE_WEIGHT.section)(g, ui);
  }

  // the scroll's frame seen from the front: across stays across, up the neck foreshortens by the angle
  if (scroll) {
    let onNeck = scrollOnNeck(p, n);
    let drawn = (view: ScrollView) => {
      let { nut: _, neck: __, ...rest } = view;
      for (let stroke of Object.values(rest).flat()) renderStroke(stroke, pal.neutral)(g, ui);
    };
    let height = (y: number) => onNeck[3] * y + onNeck[5];
    drawn(scrollFrontViewStrokes(p, scroll, (x, y) => new Pt(x, height(y)), 0));
    if (o.back) drawn(scrollBackViewStrokes(p, scroll, (x, y) => new Pt(dx + x, height(y)), 0));
  }

  // drawn last, since they lie along the neck's own ends
  renderSegment(new Pt(-nk.topWidth / 2, n.neckTop.y), new Pt(nk.topWidth / 2, n.neckTop.y), pal.ink(2).faint(3), STROKE_WEIGHT.section)(g, ui);
  if (o.back) renderSegment(new Pt(dx - nk.topWidth / 2, n.neckTop.y), new Pt(dx + nk.topWidth / 2, n.neckTop.y), pal.ink(2).faint(3), STROKE_WEIGHT.section)(g, ui);
  renderSegment(new Pt(-nk.rootWidth / 2, mortiseFloorY(p)), new Pt(nk.rootWidth / 2, mortiseFloorY(p)), pal.ink(2).faint(-3), STROKE_WEIGHT.section)(g, ui);
};

// the mortise floor, inside the rib's outer face by the mortise depth
export function mortiseFloorY(p: ViolinFamilyParams): number {
  return p.body.height - p.body.overhang - p.neck!.mortiseDepth;
}

// the neck's half width seen from the front, top width at the nut to root width at the mortise
// floor; the fingerboard carries the same taper on down over the body
export function neckHalfWidthAt(p: ViolinFamilyParams, n: NeckSolve, y: number): number {
  let nk = p.neck!;
  let topY = n.neckTop!.y;
  return (nk.topWidth + (nk.rootWidth - nk.topWidth) * (topY - y) / (topY - mortiseFloorY(p))) / 2;
}

// how far behind the neck's back line the button tip sits: the heel only stands when it's positive
function tipDepthBehindBack(backRoot: Pt, backNut: Pt, tip: Pt): number {
  let backRunLength = dist(backRoot, backNut);
  if (backRunLength < 1e-9) return NaN;
  return ((tip.y - backRoot.y) * (backNut.x - backRoot.x) - (tip.x - backRoot.x) * (backNut.y - backRoot.y)) / backRunLength;
}

// the heel rounds the corner at `backHeel` between the back and the foot running out to the tip.
// The foot is cut square to the neck, not level with the body, so it leaves the tip square to the
// fingerboard plane: a plain fillet if it fits, else the arc reaches the tip itself. Null when the
// back runs out past the tip, where no cove can reach it
function solveHeel(backHeel: Pt, backNut: Pt, tip: Pt, radius: number): Arc | null {
  let tipDepth = tipDepthBehindBack(backHeel, backNut, tip);
  if (!(radius > 0) || !(tipDepth > 0)) return null;

  let backRunLength = dist(backHeel, backNut);
  let footLength = dist(backHeel, tip);
  let up: Vect2D = { a: (backNut.x - backHeel.x) / backRunLength, b: (backNut.y - backHeel.y) / backRunLength, mag: 1 };
  let out: Vect2D = { a: (tip.x - backHeel.x) / footLength, b: (tip.y - backHeel.y) / footLength, mag: 1 };
  // off the back toward the tip, where the arc's centre stands
  let cos = up.a * out.a + up.b * out.b;
  let offBack: Vect2D = { a: (out.a - cos * up.a) / Math.sqrt(1 - cos * cos), b: (out.b - cos * up.b) / Math.sqrt(1 - cos * cos), mag: 1 };

  let start: Pt;
  let end: Pt;
  let tangentRun = radius * Math.sqrt((1 + cos) / (1 - cos));
  if (tangentRun < footLength) {
    start = moveInVectorSpace(backHeel, [{ ...up, mag: tangentRun }]);
    end = moveInVectorSpace(backHeel, [{ ...out, mag: tangentRun }]);
  } else {
    let fromTip = new Pt(backHeel.x + offBack.a * radius - tip.x, backHeel.y + offBack.b * radius - tip.y);
    let along = fromTip.x * up.a + fromTip.y * up.b;
    let upBack = -along + Math.sqrt(Math.max(along * along - (fromTip.x ** 2 + fromTip.y ** 2) + radius * radius, 0));
    start = moveInVectorSpace(backHeel, [{ ...up, mag: upBack }]);
    end = tip;
  }

  let center = moveInVectorSpace(start, [{ ...offBack, mag: radius }]);
  let circle: Circle = { x: center.x, y: center.y, r: radius };
  return arcFromCircle(circle, angleFromCenter(center, start), angleFromCenter(center, end));
}

// a later panel reads the neck by calling this; it returns and never writes to the params. The
// fingerboard plane and the normal to it are both square to the neck's angle, which leaves the top
// plate tilted by that angle off the plate's own square-to-the-rib line
export function solveNeck(p: ViolinFamilyParams): NeckSolve | null {
  if (!p.neck || !p.arching) return null;
  let nk = p.neck;
  let s: NeckSolve = {
    plateEdge: null, root: null, bottomFront: null, neckTop: null, backNut: null, backRoot: null, plateAtMortise: null,
    lowerThickness: null, tip: null, heel: null, heelFace: null, failures: [],
  };
  let fail = (message: string, unsolved: NeckFailure['unsolved']): NeckFailure => ({ message, unsolved, circles: [], segments: [] });
  let a = solveLongArching(p)!;

  solveSection(s.failures, 'Neck', ['neck', 'heel'], () => {
    if (!a.ribs) return fail('Neck: the ribs have to solve first; it stands on the top plate.', ['neck', 'heel']);
    let typed = [nk.length, nk.angle, nk.upperThickness, nk.lowerThickness, nk.topWidth, nk.rootWidth, nk.mortiseDepth, nk.overstand];
    if (!typed.every(Number.isFinite)) return fail('Neck: every neck field needs a value.', ['neck', 'heel']);
    if (![nk.length, nk.upperThickness, nk.lowerThickness, nk.topWidth, nk.rootWidth].every(v => v > 0))
      return fail('Neck: the length, thicknesses and widths need values above 0.', ['neck', 'heel']);
    if (nk.mortiseDepth < 0 || nk.overstand < 0) return fail('Neck: the mortise and overstand can\'t be negative.', ['neck', 'heel']);
    if (!(nk.angle > -90 && nk.angle < 90)) return fail('Neck: the projection has to lie between -90° and 90°.', ['neck', 'heel']);
    let buttonHeight = p.outerContour!.button.height;
    if (!Number.isFinite(buttonHeight) || buttonHeight < 0) return fail('Neck: the button height needs a value of 0 or more.', ['neck', 'heel']);

    let angle = nk.angle * TURN.degree;
    let h = p.body.height;
    let placement = topPlatePlacement(p, a.ribs);
    let outerZ = a.ribs.zLower + p.arching!.top.thickness;
    let direction = vectorFromSlope(angle + TURN.quarter);
    let normal = vectorFromSlope(angle);
    let floorY = mortiseFloorY(p);
    s.plateEdge = placeOnTopPlate(placement, new Pt(outerZ, h));
    s.plateAtMortise = new Pt(ribHeightAt(p, floorY, a.ribs) + p.arching!.top.thickness, floorY); // note the plates are likely tapered, so we take the rib height at that Y then add the plate thickness
    let root = s.root = placeOnTopPlate(placement, new Pt(outerZ + nk.overstand, h));
    let fingerboardPlane = lineFromTwoPoints(root, moveInVectorSpace(root, [{ ...direction, mag: 1 }]));
    let rootPlaneY = h - p.body.overhang;
    let neckAtRootPlane = intersectLines(fingerboardPlane, lineFromTwoPoints(new Pt(0, rootPlaneY), new Pt(1, rootPlaneY)))!;

    // the length runs along the fingerboard plane from the mortise floor to the nut's foot; the back
    // sits the upper thickness under the nut and runs straight through the lower under the heel
    let tip = s.tip = new Pt(0, h + buttonHeight);
    let bottomFront = s.bottomFront = intersectLines(fingerboardPlane, lineFromTwoPoints(new Pt(0, floorY), new Pt(1, floorY)))!;
    let neckTop = s.neckTop = moveInVectorSpace(bottomFront, [{ ...direction, mag: nk.length }]);
    let backNut = s.backNut = moveInVectorSpace(neckTop, [{ ...normal, mag: -nk.upperThickness }]);

    // the lower thickness is taken square to the plane through the button tip: the line the heel's
    // foot is cut along, so it is measured at the corner the heel rounds
    let front = moveInVectorSpace(root, [{ ...direction, mag: (tip.x - root.x) * direction.a + (tip.y - root.y) * direction.b }]);
    let backHeel = moveInVectorSpace(front, [{ ...normal, mag: -nk.lowerThickness }]);
    s.lowerThickness = [front, backHeel];
    s.backRoot = intersectLines(lineFromTwoPoints(backNut, backHeel), lineFromTwoPoints(neckAtRootPlane, moveInVectorSpace(neckAtRootPlane, [normal])))!;

    // the heel: a cove, so a back past the tip or a cleared radius leaves the back straight down to
    // the root, and says so
    if (!Number.isFinite(nk.heelRadius) || nk.heelRadius <= 0) {
      s.failures.push(fail('Heel: the heel radius needs a value above 0.', ['heel']));
      return null;
    }
    s.heel = solveHeel(backHeel, backNut, tip, nk.heelRadius);
    if (!s.heel) {
      s.failures.push(fail('Heel: the neck\'s back runs out past the button tip, so no cove can reach it. Thin the neck at the heel.', ['heel']));
      return null;
    }
    let end = pointOnCircle(s.heel, s.heel.end);
    s.heelFace = dist(end, tip) > 1e-9 ? [end, tip] : null;
    return null;
  });
  return s;
}
