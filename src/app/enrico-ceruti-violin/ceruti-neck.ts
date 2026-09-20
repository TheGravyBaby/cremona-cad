import { Arc, arcFromCircle, Circle, Pt, Vect2D } from '../models/types';
import {
  angleFromCenter, dist, intersectLines, lineFromTwoPoints,
  moveInVectorSpace, pointAtDistanceToward, shortestDistanceFromPtToLine, vectorFromSlope,
} from '../helpers/math/simpleGeometry';
import { EnricoCerutiParams, FlutingParams, NeckParams } from './ceruti-types';
import { placeOnTopPlate, solveRibTaper, topPlatePlacement } from './ceruti-arching';
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
    length: mm(136),
    nutHeight: mm(1),
    thickness: mm(13),
    heelRadius: mm(20),
    fingerboard: { length: mm(270), thickness: mm(10) },
  };
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
  nut: { at: Pt; top: Pt; string: Pt; neckStop: number };
  /** The little block of wood past the fingerboard end, where the string rides over the nut. */
  nutBlock: [Pt, Pt, Pt, Pt];
  fingerboard: { nutTop: Pt; end: Pt; endTop: Pt };
  /** The neck's back, nut end to root end; the heel departs it at `heel.start`. */
  back: { nut: Pt; root: Pt };
  /** The cove from `start` on the back to `end`; `face` is the button tip when a square face runs on from the arc to it; `arc` is the same curve, ready to draw. Null when the heel radius can't stand on its own — see solveHeel. */
  heel: { center: Pt; r: number; start: Pt; end: Pt; face: Pt | null; arc: Arc } | null;
  /** Stand-in for the pegbox and scroll, beyond the nut: front-nut, front-far, back-far, back-nut. */
  scroll: [Pt, Pt, Pt, Pt];
  /** Rotation, in degrees, that sits the scroll's label along the neck. */
  scrollLabelAngleDeg: number;
  /** The fingerboard's top line, carried on to where it crosses the bridge axis. Null when the
   * two lines run parallel. */
  projectionHit: Pt | null;
  /** Distance from the bridge foot to `projectionHit`, along the bridge axis. */
  projection: number | null;
  /** Nut to bridge, straight-line (mm) — the string's approximate length. Actual length runs a
   * little longer once the fingerboard and bridge curvature are accounted for. */
  stringLength: number;
  /** Acute angle between the string (nut to bridge) and the bridge's own axis, in degrees.
   * Luthiers aim for about 79°. */
  stringAngleDeg: number;
  stringOverFingerboardEnd: number;
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

  // the nut sits `length` mm from the mortise floor, straight up the neck centreline — that
  // same line already carries `root` and `gluingAtMortise`, so this is a single move rather
  // than another intersection. The string line stands `stringHeightAtNut` above it along
  // `normal`, which is what the nut block and fingerboard both hang off.
  const nutAt = moveInVectorSpace(gluingAtMortise, [{ ...direction, mag: nk.length }]);
  const fb = nk.fingerboard;
  const stringHeightAtNut = fb.thickness + nk.nutHeight;
  const nutString = moveInVectorSpace(nutAt, [{ ...normal, mag: stringHeightAtNut }]);
  const nutTop = moveInVectorSpace(nutAt, [{ ...normal, mag: fb.thickness }]);
  const neckStop = (nutAt.x - root.x) * direction.a + (nutAt.y - root.y) * direction.b;
  const nut = { at: nutAt, top: nutTop, string: nutString, neckStop };

  const nutLength = 6 * p.height / REFERENCE_BODY_HEIGHT;
  const nutBlockFar = moveInVectorSpace(nutAt, [{ ...direction, mag: nutLength }]);
  const nutBlock: [Pt, Pt, Pt, Pt] = [nutAt, nutBlockFar, moveInVectorSpace(nutBlockFar, [{ ...normal, mag: stringHeightAtNut }]), nutString];

  const fingerboardEnd = pointAtDistanceToward(nutAt, root, fb.length);
  const fingerboardEndTop = moveInVectorSpace(fingerboardEnd, [{ ...normal, mag: fb.thickness }]);
  const fingerboard = { nutTop, end: fingerboardEnd, endTop: fingerboardEndTop };

  const back = {
    nut: moveInVectorSpace(nutAt, [{ ...normal, mag: -nk.thickness }]),
    root: moveInVectorSpace(neckAtRootPlane, [{ ...normal, mag: -nk.thickness }]),
  };
  const heel = solveHeel(back, buttonTip, nk.heelRadius);

  // the scroll continues the neck's own plane out past the nut — the nut itself sits proud of
  // it, raised by the string height, so the scroll box starts at `nutAt`, not `nutString`.
  const k = p.height / REFERENCE_BODY_HEIGHT;
  const scrollLength = SCROLL_LENGTH_MM * k;
  const scrollDepth = SCROLL_DEPTH_MM * k;
  const scrollFront1 = moveInVectorSpace(nutAt, [{ ...direction, mag: scrollLength }]);
  const scroll: [Pt, Pt, Pt, Pt] = [
    nutAt, scrollFront1,
    moveInVectorSpace(scrollFront1, [{ ...normal, mag: -scrollDepth }]),
    moveInVectorSpace(nutAt, [{ ...normal, mag: -scrollDepth }]),
  ];
  const scrollLabelAngleDeg = 90 - Math.atan2(direction.b, direction.a) * 180 / Math.PI;

  // projection: the fingerboard's top line, carried on to where it crosses the bridge's axis
  const fingerboardTopLine = lineFromTwoPoints(fingerboardEndTop, nutTop);
  const bridgeAxisLine = lineFromTwoPoints(bridgeFoot, bridgeTop);
  const projectionHit = intersectLines(fingerboardTopLine, bridgeAxisLine);
  const projection = projectionHit
    ? (projectionHit.x - bridgeFoot.x) * bridgeAxis.a + (projectionHit.y - bridgeFoot.y) * bridgeAxis.b
    : null;
  const stringOverFingerboardEnd = shortestDistanceFromPtToLine(fingerboardEndTop, lineFromTwoPoints(nutString, bridgeTop));
  const stringLength = dist(nutString, bridgeTop);
  const stringDirection: Vect2D = { a: (bridgeTop.x - nutString.x) / stringLength, b: (bridgeTop.y - nutString.y) / stringLength, mag: 1 };
  const stringBridgeCos = Math.min(1, Math.max(-1, stringDirection.a * bridgeAxis.a + stringDirection.b * bridgeAxis.b));
  const stringAngleRaw = Math.acos(stringBridgeCos) * 180 / Math.PI;
  const stringAngleDeg = stringAngleRaw > 90 ? 180 - stringAngleRaw : stringAngleRaw;

  return {
    edge, root, direction, normal, rootPlaneY, mortiseFloorY, gluingAtMortise,
    plateEndY, buttonTip, backThickness, buttonProfile, bridge, bridgeWedge,
    nutLength, nut, nutBlock, fingerboard, back, heel,
    scroll, scrollLabelAngleDeg, projectionHit, projection, stringLength, stringAngleDeg, stringOverFingerboardEnd,
  };
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
