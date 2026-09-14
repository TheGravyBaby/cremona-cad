import { Arc, arcFromCircle, Circle, Pt, Vect2D } from '../models/types';
import {
  angleFromCenter, dist, intersectLines, lineCircleIntersection, lineFromTwoPoints,
  moveInVectorSpace, pointAtDistanceToward, shortestDistanceFromPtToLine, vectorFromSlope,
} from '../helpers/math/simpleGeometry';
import { EnricoCerutiParams, FlutingParams, NeckParams } from './ceruti-types';
import { placeOnTopPlate, ribHeightAt, solveRibTaper, topPlatePlacement } from './ceruti-arching';
import { channelCenterlineZAt, LongArchSolve } from './ceruti-arch-geometry';

// ===== Neck set =====
// Where the neck, fingerboard, nut and bridge stand in the side elevation, in the frame the body
// section is drawn in: x is height off the back plate's inner face, y runs up the body, the neck
// end at y = height. Everything hangs off the top plate's edge at the neck end, so the rib taper
// carries through — the edge point is read off the same placement the section draws with.
//
// This file only solves geometry: every shape it hands back (bridge wedge, nut block, heel arc,
// scroll box) is already the exact points or Arc the renderer draws, so `renders/neck.render.ts`
// never has to do its own trigonometry.

const REFERENCE_BODY_HEIGHT = 355;
/** Violin pegbox and scroll beyond the nut, as a box until the scroll panel draws them. */
const SCROLL_LENGTH_MM = 110;
const SCROLL_DEPTH_MM = 40;
/** The bridge's blank, drawn as a wedge: how much narrower the feet are than the body stop line, and the top than the feet. */
const BRIDGE_FOOT_HALF_WIDTH_RATIO = 0.07;
const BRIDGE_TOP_TO_FOOT_WIDTH_RATIO = 1 / 3;

/** Violin numbers, scaled by body length for the larger sizes — generic for the size class rather than measured. */
export function defaultNeckParams(p: EnricoCerutiParams): NeckParams {
  const k = p.height / REFERENCE_BODY_HEIGHT;
  const mm = (v: number) => Math.round(v * k * 2) / 2;
  return {
    bodyStop: mm(195),
    bridgeHeight: mm(33),
    mortiseDepth: mm(6.5),
    overstand: mm(6.5),
    angle: 7.5 * Math.PI / 180,
    nutHeight: mm(1),
    stopLength: mm(325),
    thicknessRoot: mm(15),
    thicknessNut: mm(12),
    heelRadius: mm(20),
    fingerboard: { length: mm(270), thickness: mm(10) },
  };
}

/** Recipes saved before the fingerboard's thickness was made uniform carried it as two fields,
 * thicknessNut and thicknessEnd; this collapses them into the one that replaced both, preferring
 * the end thickness since that's the one the projection and string-clearance readouts actually
 * turn on — the far end anchors the fingerboard's top line, the nut end barely levers it. */
export function normalizeNeckParams(p: EnricoCerutiParams): void {
  if (!p.neck) return;
  const fb = p.neck.fingerboard as unknown as { length: number; thickness?: number; thicknessNut?: number; thicknessEnd?: number };
  if (fb.thickness !== undefined) return;
  fb.thickness = fb.thicknessEnd ?? fb.thicknessNut ?? 10;
  delete fb.thicknessNut;
  delete fb.thicknessEnd;
}

export interface NeckSolve {
  /** The top plate's outer edge at the neck end. */
  edge: Pt;
  /** The fingerboard's underside at the plate edge — where the neck stop counts from. */
  root: Pt;
  /** Unit vector along the neck toward the nut, and its normal away from the back. */
  direction: Vect2D;
  normal: Vect2D;
  /** The rib's outer face, and the mortise floor inside it. */
  rootPlaneY: number;
  mortiseFloorY: number;
  /** The fingerboard plane where it crosses the mortise floor. */
  gluingAtMortise: Pt;
  /** Where the plates end, and the button's tip on the centreline beyond it; the heel foot ends there. */
  plateEndY: number;
  buttonTip: Pt;
  backThickness: number;
  /** The back plate carried on past its edge, drawn as a rectangle: plate end/tip, front/back face. */
  buttonProfile: [Pt, Pt, Pt, Pt];
  /** Along the neck, past the fingerboard. */
  nutLength: number;
  bridge: { foot: Pt; top: Pt; axis: Vect2D };
  /** The bridge blank's four corners, foot-left, foot-right, top-right, top-left. */
  bridgeWedge: [Pt, Pt, Pt, Pt];
  /** Null when the string cannot reach its stop length from the bridge. */
  nut: { at: Pt; top: Pt; string: Pt; neckStop: number } | null;
  /** The little block of wood past the fingerboard end, where the string rides over the nut. */
  nutBlock: [Pt, Pt, Pt, Pt] | null;
  fingerboard: { nutTop: Pt; end: Pt; endTop: Pt } | null;
  /** The neck's back, nut end to root end; the heel departs it at `heel.start`. */
  back: { nut: Pt; root: Pt } | null;
  /** The cove from `start` on the back to `end`; `face` is the button tip when a square face runs on from the arc to it; `arc` is the same curve, ready to draw. */
  heel: { center: Pt; r: number; start: Pt; end: Pt; face: Pt | null; arc: Arc } | null;
  /** Stand-in for the pegbox and scroll, beyond the nut: front-nut, front-far, back-far, back-nut. */
  scroll: [Pt, Pt, Pt, Pt] | null;
  /** Rotation, in degrees, that sits the scroll's label along the neck. */
  scrollLabelAngleDeg: number | null;
  /** The fingerboard's top line, carried on to where it crosses the bridge axis. */
  projectionHit: Pt | null;
  /** Distance from the bridge foot to `projectionHit`, along the bridge axis. */
  projection: number | null;
  stringOverFingerboardEnd: number | null;
  bodyDepthAtRoot: number;
}

/** `p.arching`, `p.neck` and `p.button` must already be in place — the panel seeds them. */
export function solveNeck(p: EnricoCerutiParams, topArch: LongArchSolve | null, topGouge: FlutingParams): NeckSolve {
  const nk = p.neck!;
  const a = p.arching!;
  const taper = solveRibTaper(p);
  const placement = topPlatePlacement(p, taper);
  const outerZ = taper.zLower + a.top.thickness;

  const edge = placeOnTopPlate(placement, new Pt(outerZ, p.height));
  const root = placeOnTopPlate(placement, new Pt(outerZ + nk.overstand, p.height));

  // toward the nut, and the fingerboard's outward normal — both square to the fingerboard plane,
  // which leaves the top plate tilted by the neck angle off the plate's own square-to-the-rib line
  const direction = vectorFromSlope(nk.angle + Math.PI / 2);
  const normal = vectorFromSlope(nk.angle);
  const rootAheadByOneMm = moveInVectorSpace(root, [{ ...direction, mag: 1 }]);
  const neckCenterline = lineFromTwoPoints(root, rootAheadByOneMm);

  const rootPlaneY = p.height - p.overhang;
  const mortiseFloorY = rootPlaneY - nk.mortiseDepth;
  const gluingAtMortise = intersectLines(neckCenterline, lineFromTwoPoints(new Pt(0, mortiseFloorY), new Pt(1, mortiseFloorY)))!;
  const neckAtRootPlane = intersectLines(neckCenterline, lineFromTwoPoints(new Pt(0, rootPlaneY), new Pt(1, rootPlaneY)))!;

  const plateEndY = p.height;
  const buttonTip = new Pt(0, plateEndY + (p.button?.height ?? 0));
  const backThickness = a.bottom.thickness;
  const buttonProfile: [Pt, Pt, Pt, Pt] = [
    new Pt(0, plateEndY), new Pt(0, buttonTip.y), new Pt(-backThickness, buttonTip.y), new Pt(-backThickness, plateEndY),
  ];
  const bodyDepthAtRoot = ribHeightAt(p, rootPlaneY, taper) + a.top.thickness + backThickness;

  const bridgeY = p.height - nk.bodyStop;
  const archZAtBridge = channelCenterlineZAt(p, topGouge, topArch, bridgeY);
  const bridgeFoot = placeOnTopPlate(placement, new Pt(outerZ + archZAtBridge, bridgeY));
  const bridgeTop = placeOnTopPlate(placement, new Pt(outerZ + archZAtBridge + nk.bridgeHeight, bridgeY));
  const bridgeSpan = dist(bridgeFoot, bridgeTop);
  const bridgeAxis: Vect2D = { a: (bridgeTop.x - bridgeFoot.x) / bridgeSpan, b: (bridgeTop.y - bridgeFoot.y) / bridgeSpan, mag: 1 };
  const bridgeAcross: Vect2D = { a: -bridgeAxis.b, b: bridgeAxis.a, mag: 1 };
  const bridgeFootHalfWidth = BRIDGE_FOOT_HALF_WIDTH_RATIO * bridgeSpan;
  const bridgeTopHalfWidth = bridgeFootHalfWidth * BRIDGE_TOP_TO_FOOT_WIDTH_RATIO;
  const bridgeWedge: [Pt, Pt, Pt, Pt] = [
    moveInVectorSpace(bridgeFoot, [{ ...bridgeAcross, mag: -bridgeFootHalfWidth }]),
    moveInVectorSpace(bridgeFoot, [{ ...bridgeAcross, mag: bridgeFootHalfWidth }]),
    moveInVectorSpace(bridgeTop, [{ ...bridgeAcross, mag: bridgeTopHalfWidth }]),
    moveInVectorSpace(bridgeTop, [{ ...bridgeAcross, mag: -bridgeTopHalfWidth }]),
  ];
  const bridge = { foot: bridgeFoot, top: bridgeTop, axis: bridgeAxis };

  const solve: NeckSolve = {
    edge, root, direction, normal, rootPlaneY, mortiseFloorY, gluingAtMortise,
    plateEndY, buttonTip, backThickness, buttonProfile, bridge, bridgeWedge,
    nutLength: 6 * p.height / REFERENCE_BODY_HEIGHT, bodyDepthAtRoot,
    nut: null, nutBlock: null, fingerboard: null, back: null, heel: null,
    scroll: null, scrollLabelAngleDeg: null, projectionHit: null, projection: null,
    stringOverFingerboardEnd: null,
  };

  // the nut sits where a string of the full stop length, leaving the bridge, comes down onto the
  // string line above the fingerboard plane: that line meeting a circle of radius stopLength
  // about the bridge top. The line crosses the circle twice, at two candidate string points; the
  // nut is whichever sits further from the root in the direction of the nut. Since the string
  // line and the fingerboard plane are a fixed height apart along `normal`, and `normal` is
  // perpendicular to `direction`, projecting either one along `direction` from `root` gives the
  // same distance — so the same projection also reads off the true neck stop.
  const fb = nk.fingerboard;
  const stringHeightAtNut = fb.thickness + nk.nutHeight;
  const stringLineAtRoot = moveInVectorSpace(root, [{ ...normal, mag: stringHeightAtNut }]);
  const stringLineAhead = moveInVectorSpace(stringLineAtRoot, [{ ...direction, mag: 1 }]);
  const stringLine = lineFromTwoPoints(stringLineAtRoot, stringLineAhead);
  const stopCircle: Circle = { x: bridgeTop.x, y: bridgeTop.y, r: nk.stopLength };
  const stringPointCandidates = lineCircleIntersection(stringLine, stopCircle);
  if (stringPointCandidates.length === 0) return solve;

  const neckStopOf = (hit: Pt) => (hit.x - root.x) * direction.a + (hit.y - root.y) * direction.b;
  const [candidate0, candidate1] = [stringPointCandidates[0], stringPointCandidates[1] ?? stringPointCandidates[0]];
  const neckStop = Math.max(neckStopOf(candidate0), neckStopOf(candidate1));
  if (!(neckStop > 0)) return solve;
  const nutString = neckStopOf(candidate0) >= neckStopOf(candidate1) ? candidate0 : candidate1;

  const nutAt = moveInVectorSpace(nutString, [{ ...normal, mag: -stringHeightAtNut }]);
  const nutTop = moveInVectorSpace(nutAt, [{ ...normal, mag: fb.thickness }]);
  solve.nut = { at: nutAt, top: nutTop, string: nutString, neckStop };

  const nutBlockFar = moveInVectorSpace(nutAt, [{ ...direction, mag: solve.nutLength }]);
  solve.nutBlock = [nutAt, nutBlockFar, moveInVectorSpace(nutBlockFar, [{ ...normal, mag: stringHeightAtNut }]), nutString];

  const fingerboardEnd = pointAtDistanceToward(nutAt, root, fb.length);
  const fingerboardEndTop = moveInVectorSpace(fingerboardEnd, [{ ...normal, mag: fb.thickness }]);
  solve.fingerboard = { nutTop, end: fingerboardEnd, endTop: fingerboardEndTop };

  const back = {
    nut: moveInVectorSpace(nutAt, [{ ...normal, mag: -nk.thicknessNut }]),
    root: moveInVectorSpace(neckAtRootPlane, [{ ...normal, mag: -nk.thicknessRoot }]),
  };
  solve.back = back;
  solve.heel = solveHeel(back, buttonTip, nk.heelRadius);

  const k = p.height / REFERENCE_BODY_HEIGHT;
  const scrollLength = SCROLL_LENGTH_MM * k;
  const scrollDepth = SCROLL_DEPTH_MM * k;
  const scrollFront1 = moveInVectorSpace(nutAt, [{ ...direction, mag: scrollLength }]);
  solve.scroll = [
    nutAt, scrollFront1,
    moveInVectorSpace(scrollFront1, [{ ...normal, mag: -scrollDepth }]),
    moveInVectorSpace(nutAt, [{ ...normal, mag: -scrollDepth }]),
  ];
  solve.scrollLabelAngleDeg = 90 - Math.atan2(direction.b, direction.a) * 180 / Math.PI;

  // projection: the fingerboard's top line, carried on to where it crosses the bridge's axis
  const fingerboardTopLine = lineFromTwoPoints(fingerboardEndTop, nutTop);
  const bridgeAxisLine = lineFromTwoPoints(bridgeFoot, bridgeTop);
  const hit = intersectLines(fingerboardTopLine, bridgeAxisLine);
  solve.projectionHit = hit;
  solve.projection = hit ? (hit.x - bridgeFoot.x) * bridgeAxis.a + (hit.y - bridgeFoot.y) * bridgeAxis.b : null;
  solve.stringOverFingerboardEnd = shortestDistanceFromPtToLine(fingerboardEndTop, lineFromTwoPoints(nutString, bridgeTop));
  return solve;
}

// the cove from the neck's back to the button tip: an arc tangent to the back line from the
// outside, its centre riding the line offset outward by the radius. A tight radius would sweep
// past square and pocket a thumb, so the arc stops where it runs straight at the back plane,
// level with the tip, and a square face carries on to the tip; a wide one reaches the tip on its
// own.
function solveHeel(back: { nut: Pt; root: Pt }, tip: Pt, radius: number): NeckSolve['heel'] {
  const backRunLength = dist(back.root, back.nut);
  if (!(radius > 0) || backRunLength < 1e-9) return null;

  const backDirection: Vect2D = { a: (back.nut.x - back.root.x) / backRunLength, b: (back.nut.y - back.root.y) / backRunLength, mag: 1 };
  const backNormal: Vect2D = { a: backDirection.b, b: -backDirection.a, mag: 1 };
  const tipDepthBehindBack = -((tip.x - back.root.x) * backNormal.a + (tip.y - back.root.y) * backNormal.b);
  if (!(tipDepthBehindBack > 0) || Math.abs(backNormal.a) < 1e-9) return null;

  let center: Pt;
  let end: Pt;
  let face: Pt | null;

  // the centre level with the tip, on the back's offset line — if that keeps the centre past the
  // tip, the arc runs square to the body there and a flat face carries on to the tip
  const levelCenterY = tip.y + radius;
  const levelCenterX = back.root.x + (-radius - (levelCenterY - back.root.y) * backNormal.b) / backNormal.a;
  if (levelCenterX > tip.x) {
    center = new Pt(levelCenterX, levelCenterY);
    end = new Pt(center.x, tip.y);
    face = tip;
  } else {
    const alongBackToCenter = tipDepthBehindBack - radius;
    const acrossBackToCenter = Math.sqrt(Math.max(radius * radius - alongBackToCenter * alongBackToCenter, 0));
    center = moveInVectorSpace(tip, [{ ...backNormal, mag: alongBackToCenter }, { ...backDirection, mag: acrossBackToCenter }]);
    end = tip;
    face = null;
  }

  const start = moveInVectorSpace(center, [{ ...backNormal, mag: radius }]);
  const circle: Circle = { x: center.x, y: center.y, r: radius };
  const arc = arcFromCircle(circle, angleFromCenter(center, start), angleFromCenter(center, end));
  return { center, r: radius, start, end, face, arc };
}
