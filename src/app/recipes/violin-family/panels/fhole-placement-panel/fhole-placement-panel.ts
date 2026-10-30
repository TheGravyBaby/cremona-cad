import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections } from '../../../../helpers/math/draftMath';
import {
  angleFromCenter, angleOnDrawnArc, arcHorizontalIntersections, dist, flipArcAboutY, flipCircleAboutY, flipPointAboutY, flipRectAboutY,
  lineCircleIntersection, lineFromPointAndSlope, pointOnCircle, TURN,
} from '../../../../helpers/math/simpleGeometry';
import { pathFromPolyline } from '../../../../helpers/math/pathMath';
import { nearestFraction, nearestSmallFraction } from '../../../../helpers/nearestFraction';
import {
  renderArcFromArcFancy, renderCircle, renderDashedLine, renderPath, renderRect, renderSegment, renderSmallCrosshair,
} from '../../../../helpers/renderFuncs';
import { safeRun } from '../../../../helpers/validators';
import { Arc, Circle, Pt, Rectangle } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { DASH, STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { FholePlacementParams, FholeStemParams, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { FHOLE_SEED_RATIOS, FholeRatios } from '../../violin-family-seed';
import { renderBoutBounds, solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { purflingPath, ribArcs, RibArcs, solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { renderFlutingInnerEdge, solveFluting } from '../fluting-panel/fluting-panel';
import { renderFholes, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import { showFieldHelp } from '../../../../docs/field-help';

// Where the two f-holes sit on the top plate: the eyes first, everything else hung off them. The
// stage is all typed values, so there is nothing to solve here beyond the box the eyes and rises
// carve out; the contours panel bends the outline between them. Panel and renders, then ratios.

@Component({
  selector: 'app-vf-f-hole-placement-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './fhole-placement-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class FHolePlacementPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showFholeBounds', 'showFholePlacementGuides', 'showBeardGuides', 'showFlutingEdge', 'showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('orchid');
  protected readonly help = showFieldHelp;

  // eyes, rises and stem placed from the corners and the waist alone, once the plate has solved,
  // by the fractions in FHOLE_SEED_RATIOS: the lower eye in from the lower corner, the upper eye
  // where two guide circles meet, and the stem seated in the frame the eyes and rises carve out
  static seed(p: ViolinFamilyParams): void {
    if (p.fHoles || !p.corners || !p.plateContour) return;
    let waist = solveWaist(p);
    if (!waist || !solvePlateContour(p)?.top) return;
    let r = FHOLE_SEED_RATIOS;
    let lowerCorner = p.corners.LCr;
    // eyes to the quarter millimetre, as they are measured
    let quarter = (v: number) => Math.round(v * 4) / 4;
    let lowerEyeR = quarter(p.body.width * r.LEyetoW);
    let lowerEye = new Circle(lowerCorner.x * r.LEyeXtoLCX, lowerCorner.y * r.LEyeYtoLCY, lowerEyeR);

    let eyeSpan = new Circle(lowerEye.x, lowerEye.y, dist(lowerEye, waist) * r.EyeSpantoWaist);
    let waistGuide = new Circle(waist.x, waist.y, waist.x * r.UEyeGuidetoWaist);
    let upperEyeCenter = circleCircleIntersections(eyeSpan, waistGuide)[0];
    if (!upperEyeCenter) return;
    let upperEye = new Circle(upperEyeCenter.x, upperEyeCenter.y, quarter(lowerEyeR * r.UEyetoLEye));

    // to a hundredth, as the fields show them
    let tidy = (v: number) => Math.round(v * 100) / 100;
    let f: FholePlacementParams = {
      UEye: new Circle(tidy(upperEye.x), tidy(upperEye.y), upperEye.r),
      LEye: new Circle(tidy(lowerEye.x), tidy(lowerEye.y), lowerEyeR),
      URise: tidy(upperEye.r * r.URisetoUEye),
      LRise: tidy(lowerEye.r * r.LRisetoLEye),
      stem: { center: new Pt(0, 0), width: tidy(upperEye.r * r.StemWtoUEye), angle: r.stemAngle },
      notches: true,
    };
    let frame = fholeBounds(f);
    f.stem.center = new Pt(tidy(frame.Pt1.x + frame.width! * r.StemXtoFrame), tidy(frame.Pt2.y + frame.height! * r.StemYtoFrame));
    p.fHoles = f;
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  protected readonly stemAngleRange = STEM_ANGLE_RANGE;

  // what the last draw read off the placement; the template's readouts read these
  boundsHtoW = '–';
  eyeDistance = 0;
  eyeAngle = 0;
  stemGap = 0;
  notchStop = 0;
  ratios: Partial<FholeRatios> = {};

  ngOnInit(): void {
    this.draw();
  }

  // every field calls this: the shell seeds the stage and schedules the commit (the undo entry, the
  // session write, report()) for when the typing stops, and the picture catches up now
  edited(): void {
    this.edit.emit();
    this.draw();
  }

  // the lower eye against the width is a small fraction (1/50), where the usual search collapses to 0
  ratio(key: keyof FholeRatios): string {
    let value = this.ratios[key];
    if (!Number.isFinite(value)) return '–';
    return key === 'LEyetoW' ? nearestSmallFraction(value!) : nearestFraction(value!);
  }

  // nothing solves here, so nothing to report; the contours panel reports what the placement broke
  report(): void {}

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let f = p.fHoles!;
      let bounds = fholeBounds(f);
      this.boundsHtoW = bounds.width ? nearestFraction(bounds.height! / bounds.width) : '–';
      this.eyeDistance = Math.round(dist(f.UEye, f.LEye) * 100) / 100;
      this.eyeAngle = Math.round(angleFromCenter(f.LEye, f.UEye) / TURN.degree * 10) / 10;
      // across the two stems' inner edges at the stem's height, where the pair is mirrored about x = 0
      this.stemGap = Math.round(2 * stemEdgeAt(f.stem, stemEdgePoints(f.stem).inner, f.stem.center.y).x * 100) / 100;
      // the top edge down to the notch line, the stop as the trade reads it off a finished top
      this.notchStop = Math.round((p.body.height - f.stem.center.y) * 100) / 100;
      this.ratios = solveFholePlacementRatios(p);
      let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
      let layers: RenderLayer[] = [renderFholePlate(p, this.pal, rib, false)];
      if (this.flags.showFlutingEdge) layers.push(renderFlutingEdgeGuide(p));
      if (this.flags.showModuleGuides) layers.push(renderBoutBounds(p, ThemeService.getPalette('classicCremona')));
      if (this.flags.showFholePlacementGuides && rib) layers.push(renderFholeEyePlacementGuides(p, rib, this.pal));
      if (this.flags.showBeardGuides) layers.push(renderBeardBoxes(p, ThemeService.getPalette('classicCremona')));
      if (this.flags.showFholeBounds) layers.push(renderFholeBounds(f, this.pal));
      layers.push(renderFholeRise(f, this.pal), renderFholeStem(f, this.pal), renderFholeEyes(f, this.pal));
      // the outer notch is struck from the lower wing's tip, so it waits on the contours
      let contours = p.fHoleContours ? solveFholeContours(p) : null;
      if (f.notches) layers.push(renderFholeNotches(f, contours?.LTip ?? null, this.pal));
      this.drawn.emit(layers);
    });
  }
}

// how far past upright the stem leans, in degrees: mean 91.8°, sd 0.7° across a 6-instrument
// survey (2026-09), the tightest constant found in that pass. Positive leans the top of the stem
// toward the hole's upper eye
const STEM_ANGLE_RANGE = [90, 102];

// the stem's edges where the perpendicular through its centre meets them: the width is measured
// square across the stem, as calipers read it, and the notches are set from these points
export const stemEdgePoints = (stem: FholeStemParams): { inner: Pt; outer: Pt } => {
  const angle = stem.angle * TURN.degree;
  const across = { x: Math.sin(angle) * stem.width / 2, y: -Math.cos(angle) * stem.width / 2 };
  return {
    inner: new Pt(stem.center.x - across.x, stem.center.y - across.y),
    outer: new Pt(stem.center.x + across.x, stem.center.y + across.y),
  };
};

// where the edge through `edge` passes at height y
export const stemEdgeAt = (stem: FholeStemParams, edge: Pt, y: number): Pt => new Pt(edge.x + (y - edge.y) * stemRun(stem), y);

// the stem's lean as a run per unit of rise, the form every line through the stem is drawn in
export const stemRun = (stem: FholeStemParams): number => {
  let angle = stem.angle * TURN.degree;
  return Math.cos(angle) / Math.sin(angle);
};

// the box each eye's radius and rise carve out: top-left from the upper eye, bottom-right from the
// lower one. Shared with the H to W readout so the ratio always matches what's drawn
export const fholeBounds = (f: FholePlacementParams): Rectangle => {
  const topLeftPt = new Pt(f.UEye.x - f.UEye.r, f.UEye.y + f.UEye.r + f.URise);
  const lowerRightPt = new Pt(f.LEye.x + f.LEye.r, f.LEye.y - f.LEye.r - f.LRise);
  return new Rectangle(topLeftPt, lowerRightPt);
};

// the top plate as the holes are placed on it: its outline grey, the rib outline a guide inside it
// in the purfling's place, the channel's inner edge when asked for, and the holes cut to their
// contours as placed, where those have been drafted. With `purfling` the purfling lines instead
// of the rib outline, as the contours panel shows them
export const renderFholePlate = (p: ViolinFamilyParams, pal: PanelPalette, rib: RibArcs | null, purfling: boolean) => (g: any, ui: any): void => {
  let o = solvePlateContour(p);
  if (o?.top) renderPath(o.top, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  if (purfling) {
    for (let d of [o?.purfling, o?.outerPurfling]) if (d) renderPath(d, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  }
  else if (rib) {
    let inner = purflingPath(p, rib, 0);
    if (inner) renderPath(inner, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  }
  renderFholes(p, pal)(g, ui);
};

// the channel's inner edge on the top plate, faint, for either f-hole panel's toggle; nothing
// until the fluting has been drafted
export const renderFlutingEdgeGuide = (p: ViolinFamilyParams) => (g: any, ui: any): void => {
  let f = p.fluting ? solveFluting(p) : null;
  if (f) renderFlutingInnerEdge(f)(g, ui);
};

// the derived box and the stem edges across it: construction, not shape, so they sit behind
// showFholeBounds. Anything the user can edit is drawn by the contour pass
export const renderFholeBounds = (f: FholePlacementParams, pal: PanelPalette) => (g: any, ui: any): void => {
  const stem = f.stem;
  const rect = fholeBounds(f);
  const topLeftPt = rect.Pt1;
  const lowerRightPt = rect.Pt2;

  const edges = stemEdgePoints(stem);
  for (const edge of [edges.inner, edges.outer]) {
    const edgeTop = stemEdgeAt(stem, edge, topLeftPt.y);
    const edgeBottom = stemEdgeAt(stem, edge, lowerRightPt.y);
    renderDashedLine(edgeTop, edgeBottom, pal.ink(2), DASH.hidden, STROKE_WEIGHT.guide)(g, ui);
    renderDashedLine(flipPointAboutY(edgeTop), flipPointAboutY(edgeBottom), pal.ink(2), DASH.hidden, STROKE_WEIGHT.guide)(g, ui);
  }

  renderRect(rect, pal.neutral, 'none', STROKE_WEIGHT.guide, DASH.hidden)(g, ui);
  renderRect(flipRectAboutY(rect), pal.neutral, 'none', STROKE_WEIGHT.guide, DASH.hidden)(g, ui);

  // a tick across the middle of each side, to read the box's halves against the hole
  const midX = (topLeftPt.x + lowerRightPt.x) / 2, midY = (topLeftPt.y + lowerRightPt.y) / 2;
  const ticks: [Pt, Pt][] = [
    [new Pt(midX, topLeftPt.y - BOUNDS_TICK_HALF_LENGTH), new Pt(midX, topLeftPt.y + BOUNDS_TICK_HALF_LENGTH)],
    [new Pt(midX, lowerRightPt.y - BOUNDS_TICK_HALF_LENGTH), new Pt(midX, lowerRightPt.y + BOUNDS_TICK_HALF_LENGTH)],
    [new Pt(topLeftPt.x - BOUNDS_TICK_HALF_LENGTH, midY), new Pt(topLeftPt.x + BOUNDS_TICK_HALF_LENGTH, midY)],
    [new Pt(lowerRightPt.x - BOUNDS_TICK_HALF_LENGTH, midY), new Pt(lowerRightPt.x + BOUNDS_TICK_HALF_LENGTH, midY)],
  ];
  for (const [a, b] of ticks) {
    renderSegment(a, b, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    renderSegment(flipPointAboutY(a), flipPointAboutY(b), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  }
};

const BOUNDS_TICK_HALF_LENGTH = 1.5;

export const renderFholeRise = (f: FholePlacementParams, pal: PanelPalette) => (g: any, ui: any): void => {
  for (const [eye, rise, side, color] of [[f.UEye, f.URise, 1, pal.ink(1)], [f.LEye, f.LRise, -1, pal.ink(0)]] as const) {
    const boundY = eye.y + side * (eye.r + rise);
    const boundLeft = new Pt(eye.x - eye.r, boundY);
    const boundRight = new Pt(eye.x + eye.r, boundY);
    renderSegment(boundLeft, boundRight, color, STROKE_WEIGHT.guide)(g, ui);
    renderSegment(flipPointAboutY(boundLeft), flipPointAboutY(boundRight), color, STROKE_WEIGHT.guide)(g, ui);
    const dropTop = new Pt(eye.x, eye.y + side * eye.r);
    const dropBottom = new Pt(eye.x, boundY);
    renderDashedLine(dropTop, dropBottom, color, DASH.fine, STROKE_WEIGHT.guide, 0.9)(g, ui);
    renderDashedLine(flipPointAboutY(dropTop), flipPointAboutY(dropBottom), color, DASH.fine, STROKE_WEIGHT.guide, 0.9)(g, ui);
  }
};

export const renderFholeStem = (f: FholePlacementParams, pal: PanelPalette) => (g: any, ui: any): void => {
  const stem = f.stem, c = stem.center;
  const edges = stemEdgePoints(stem);

  // a twelfth of the height the hole occupies, either way off the centre
  const reach = Math.abs((f.UEye.y + f.UEye.r + f.URise) - (f.LEye.y - f.LEye.r - f.LRise)) / 12;

  for (const edge of [edges.inner, edges.outer]) {
    const edgeTop = stemEdgeAt(stem, edge, c.y - reach);
    const edgeBottom = stemEdgeAt(stem, edge, c.y + reach);
    renderSegment(edgeTop, edgeBottom, pal.ink(2), STROKE_WEIGHT.section)(g, ui);
    renderSegment(flipPointAboutY(edgeTop), flipPointAboutY(edgeBottom), pal.ink(2), STROKE_WEIGHT.section)(g, ui);
  }
  renderSmallCrosshair(c, pal.ink(2).faint(5))(g, ui);
  renderSmallCrosshair(flipPointAboutY(c), pal.ink(2).faint(5))(g, ui);
};

// the nicks cut into both edges of the stem, each a shallow V centred on its mark and cut square
// to the edge, well under half as deep as its mouth is long (measured on a Stradivari cello,
// 2026-10). The inner notch is centred where the stop line crosses the inner edge; the outer where
// an arc struck from the lower wing's tip through the inner mark crosses the outer edge, so it
// sits a little higher. Sized from the stem's width, so the nick reads against the edge it is cut
// in, and never a field: the notch is a mark, not a shape the plate depends on
const NOTCH_TO_STEM = { depth: 0.14, mouth: 0.4 };

export interface FholeNotch {
  // mouth on the stem's edge, top then bottom, with the apex between them out in the wood
  top: Pt;
  apex: Pt;
  bottom: Pt;
}

// the treble hole's two notches, the inner edge's apex toward the centreline and the outer's away.
// The outer waits on the lower wing's tip: null without one, or when the arc from it can't reach
// the outer edge
export const fholeNotches = (f: FholePlacementParams, lowerTip: Pt | null): { inner: FholeNotch; outer: FholeNotch | null } => {
  const stem = f.stem;
  const angle = stem.angle * TURN.degree;
  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const across = { x: Math.sin(angle), y: -Math.cos(angle) };
  const depth = stem.width * NOTCH_TO_STEM.depth;
  const mouth = stem.width * NOTCH_TO_STEM.mouth;
  const notch = (mark: Pt, side: -1 | 1): FholeNotch => ({
    top: new Pt(mark.x + mouth / 2 * along.x, mark.y + mouth / 2 * along.y),
    apex: new Pt(mark.x + side * depth * across.x, mark.y + side * depth * across.y),
    bottom: new Pt(mark.x - mouth / 2 * along.x, mark.y - mouth / 2 * along.y),
  });
  const edges = stemEdgePoints(stem);
  const innerMark = stemEdgeAt(stem, edges.inner, stem.center.y);
  let outerMark: Pt | null = null;
  if (lowerTip) {
    const reach = new Circle(lowerTip.x, lowerTip.y, dist(lowerTip, innerMark));
    // the arc crosses the outer edge twice; the notch is the upper crossing
    outerMark = lineCircleIntersection(lineFromPointAndSlope(edges.outer, Math.tan(angle)), reach).sort((a, b) => b.y - a.y)[0] ?? null;
  }
  return { inner: notch(innerMark, -1), outer: outerMark && notch(outerMark, 1) };
};

export const renderFholeNotches = (f: FholePlacementParams, lowerTip: Pt | null, pal: PanelPalette) => (g: any, ui: any): void => {
  const { inner, outer } = fholeNotches(f, lowerTip);
  for (const n of [inner, outer]) {
    if (!n) continue;
    const v = [n.top, n.apex, n.bottom];
    renderPath(pathFromPolyline(v), pal.ink(2), STROKE_WEIGHT.section)(g, ui);
    renderPath(pathFromPolyline(v.map(flipPointAboutY)), pal.ink(2), STROKE_WEIGHT.section)(g, ui);
  }
};

export const renderFholeEyes = (f: FholePlacementParams, pal: PanelPalette) => (g: any, ui: any): void => {
  renderCircle(f.UEye, pal.ink(1))(g, ui);
  renderCircle(flipCircleAboutY(f.UEye), pal.ink(1))(g, ui);
  renderCircle(f.LEye, pal.ink(0))(g, ui);
  renderCircle(flipCircleAboutY(f.LEye), pal.ink(0))(g, ui);
};

// the construction the seed placed the eyes by, laid over the plate: the lower corner's line and
// the lower eye's drop, the eye's reach to the rib outline, and the two guide circles that cross
// at the upper eye
export const renderFholeEyePlacementGuides = (p: ViolinFamilyParams, rib: RibArcs, pal: PanelPalette) => (g: any, ui: any): void => {
  let f = p.fHoles!;
  let k = p.corners!;
  // lower corner line
  renderDashedLine(new Pt(k.LCr.x, k.LCr.y), new Pt(-k.LCr.x, k.LCr.y), pal.neutral, DASH.guide, STROKE_WEIGHT.guide)(g, ui);
  // the drop line
  renderDashedLine(new Pt(k.LCr.x, f.LEye.y), new Pt(-k.LCr.x, f.LEye.y), pal.neutral, DASH.guide, STROKE_WEIGHT.guide)(g, ui);

  // now I need to intersect the drop line with the inner path
  let arcs = Object.values(rib).filter((arc): arc is Arc => !!arc);
  for (const arc of arcs) {
    let intersets = arcHorizontalIntersections(arc, f.LEye.y);
    if (intersets.length > 0) {
      renderSmallCrosshair(intersets[0], pal.ink(2))(g, ui);
      break;
    }
  }
  // the red guide circle: the shortest distance from the eye to the inner edge, not a tangent
  // construction — the nearest point across every inner arc, sized to just touch the eye
  let nearestEdgePt: Pt | undefined;
  let nearestEdgeDist = Infinity;
  for (const arc of arcs) {
    const angleToEye = angleFromCenter(arc, f.LEye);
    const ends = [pointOnCircle(arc, arc.start), pointOnCircle(arc, arc.end)];
    const candidate = angleOnDrawnArc(arc, angleToEye)
      ? pointOnCircle(arc, angleToEye)
      : (dist(ends[0], f.LEye) <= dist(ends[1], f.LEye) ? ends[0] : ends[1]);
    const candidateDist = dist(candidate, f.LEye);
    if (candidateDist < nearestEdgeDist) {
      nearestEdgeDist = candidateDist;
      nearestEdgePt = candidate;
    }
  }
  if (nearestEdgePt) {
    let radForGuide = nearestEdgeDist - f.LEye.r;
    let guideCircle = new Circle(nearestEdgePt.x, nearestEdgePt.y, radForGuide);
    renderCircle(guideCircle, pal.ink(2))(g, ui);
    renderSmallCrosshair(nearestEdgePt, pal.ink(2))(g, ui);
  }

  // now find the midpoint between the corners
  let waistMidPt = solveWaist(p);
  if (waistMidPt) {
    let distToUpperEyeFromTangent = dist(f.UEye, waistMidPt);
    let upperEyeGuide = new Arc(waistMidPt.x, waistMidPt.y, distToUpperEyeFromTangent, 150 * TURN.degree, 210 * TURN.degree);
    // draw a fancy arc that spans 135 - 225 degrees
    renderArcFromArcFancy(upperEyeGuide, pal.neutral.faint(3))(g, ui);
  }

  let distBetweenEyes = dist(f.UEye, f.LEye);
  let upperEyeGuideTwo = new Arc(f.LEye.x, f.LEye.y, distBetweenEyes, TURN.half, TURN.quarter);
  renderArcFromArcFancy(upperEyeGuideTwo, pal.neutral.faint(3))(g, ui);
};

export const renderBeardBoxes = (p: ViolinFamilyParams, pal: PanelPalette) => (g: any, ui: any): void => {
  let h = p.body.height;
  let f = p.fHoles!;
  renderRect(new Rectangle(new Pt(-h / 6, h / 3), new Pt(h / 6, 2 * h / 3)), pal.ink(2), 'none', STROKE_WEIGHT.guide)(g, ui);
  renderRect(new Rectangle(new Pt(-h / 18, 4 * h / 9), new Pt(h / 18, 5 * h / 9)), pal.ink(4), 'none', STROKE_WEIGHT.guide, DASH.hidden)(g, ui);
  // its foot falls within 1.5 mm of the lower eye centres on the served violins
  renderRect(new Rectangle(new Pt(-h / 9, 7 * h / 18), new Pt(h / 9, 11 * h / 18)), pal.ink(3), 'none', STROKE_WEIGHT.guide, DASH.hidden)(g, ui);

  let waist = solveWaist(p);
  renderDashedLine(new Pt(-waist.x, waist.y), new Pt(waist.x, waist.y), pal.neutral, DASH.guide, STROKE_WEIGHT.guide)(g, ui);
  let long = new Arc(f.LEye.x, f.LEye.y, waist.y - f.LEye.y, TURN.quarter, angleFromCenter(f.LEye, f.UEye) + 10 * TURN.degree);
  let edge = new Pt(waist.x + p.body.overhang + p.body.rib, waist.y);
  let half = new Arc(edge.x, edge.y, long.r / 2, TURN.half, angleFromCenter(edge, f.UEye) + 10 * TURN.degree);
  
  for (let arc of [long, flipArcAboutY(long)]) renderArcFromArcFancy(arc, pal.ink(0))(g, ui);
  // this one misses a lot, hard to know where the waist really is
  // for (let arc of [half, flipArcAboutY(half)]) renderArcFromArcFancy(arc, pal.ink(1))(g, ui);
};

// where the waist meets the centre bout's own arc: the point the upper eye's guides are struck from
export function solveWaist(p: ViolinFamilyParams): Pt | null {
  let C0 = solveCenterBout(p)?.C0;
  return C0 ? new Pt(C0.x - C0.r, C0.y) : null;
}

// the placement read back as the fractions it was seeded by; the guide ratios only once the
// corners and the waist are there to measure against
export function solveFholePlacementRatios(p: ViolinFamilyParams): Partial<FholeRatios> {
  let f = p.fHoles;
  if (!f) return {};
  let frame = fholeBounds(f);
  let r: Partial<FholeRatios> = {
    LEyetoW: f.LEye.r / p.body.width,
    UEyetoLEye: f.UEye.r / f.LEye.r,
    URisetoUEye: f.URise / f.UEye.r,
    LRisetoLEye: f.LRise / f.LEye.r,
    StemXtoFrame: (f.stem.center.x - frame.Pt1.x) / frame.width!,
    StemYtoFrame: (f.stem.center.y - frame.Pt2.y) / frame.height!,
    StemWtoUEye: f.stem.width / f.UEye.r,
  };
  let LCr = p.corners?.LCr;
  if (LCr) {
    r.LEyeXtoLCX = f.LEye.x / LCr.x;
    r.LEyeYtoLCY = f.LEye.y / LCr.y;
  }
  let waist = solveWaist(p);
  if (waist) {
    r.UEyeGuidetoWaist = dist(f.UEye, waist) / waist.x;
    r.EyeSpantoWaist = dist(f.UEye, f.LEye) / dist(f.LEye, waist);
  }
  return r;
}
