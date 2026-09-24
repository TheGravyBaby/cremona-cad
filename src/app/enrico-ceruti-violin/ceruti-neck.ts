import { arcFromCircle, Circle, Pt, Vect2D } from '../models/types';
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
// `calculateNeck` only solves geometry: every shape it writes back onto `p.neck` (bridge wedge,
// nut block, heel arc, scroll box) is already the exact points or Arc the neck panel's render
// function draws, reading `p.neck` straight off params the way calculateFholeContours/
// calculateOuterArcs already work — see NeckParams' own header.

const REFERENCE_BODY_HEIGHT = 355;
/** The bridge's blank, drawn as a wedge: how much narrower the feet are than the body stop line, and the top than the feet. */
const BRIDGE_FOOT_HALF_WIDTH_RATIO = 0.07;
const BRIDGE_TOP_TO_FOOT_WIDTH_RATIO = 1 / 3;

/** Violin numbers, scaled by body length for the larger sizes — generic for the size class rather
 * than measured. The solved fields start undefined; `calculateNeck` fills them on the first pass. */
export function defaultNeckParams(p: EnricoCerutiParams): NeckParams {
  const k = p.height / REFERENCE_BODY_HEIGHT;
  const mm = (v: number) => Math.round(v * k * 2) / 2;
  return {
    bodyStop: mm(195),
    bridgeHeight: mm(33),
    mortiseDepth: mm(6.5),
    overstand: mm(6.5),
    angle: 7.5 * Math.PI / 180,
    length: mm(120),
    thickness: mm(13),
    heelRadius: mm(20),
    nutThickness: mm(10),
    scrollLength: mm(110),
    scrollDepth: mm(40),

    edge: undefined, root: undefined, direction: undefined, normal: undefined,
    rootPlaneY: undefined, mortiseFloorY: undefined, gluingAtMortise: undefined,
    plateEndY: undefined, buttonTip: undefined, backThickness: undefined, buttonProfile: undefined,
    nutLength: undefined, bridge: undefined, bridgeWedge: undefined,
    nut: undefined, nutBlock: undefined, fingerboard: undefined, back: undefined, heel: null, heelBottom: undefined,
    scroll: undefined, scrollLabelAngleDeg: undefined,
    stringLength: undefined, stringOverFingerboardEnd: undefined,
  };
}

/** Fingerboards run standard lengths by instrument size, not a free parameter — same size-class
 * thresholds as the mould block sizing in ceruti-calcs.ts. */
function standardFingerboardLength(bodyHeight: number): number {
  if (bodyHeight < 400) return 270; // violin
  if (bodyHeight < 500) return 310; // viola
  if (bodyHeight < 800) return 580; // cello
  return 850; // bass
}

/** The nut's span along the neck, scaled from the violin's 6 mm by body length. */
export function standardNutLength(bodyHeight: number): number {
  return 6 * bodyHeight / REFERENCE_BODY_HEIGHT;
}

/** `p.arching`, `p.neck` and `p.button` must already be in place — the panel seeds them. Writes
 * every solved shape back onto `p.neck` rather than returning it — see that interface's header. */
export function calculateNeck(p: EnricoCerutiParams, topArch: LongArchSolve | null, topGouge: FlutingParams): void {
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

  // `length` is the neck as felt in hand: the back's own top-left corner (at the nut) down to a
  // level line at the button's height — not root to nut, and not a straight-line reach to the
  // heel's curve either, since a maker's ruler runs along the neck, not through it. The back line
  // (root's line carried onto the back, before the nut is known) crosses that level first; the nut
  // is `length` further up it, and everything else — nutAt, back.nut — follows in the fingerboard
  // plane from there. The heel's own arc still departs the back line below the nut, same as always,
  // it just draws a curve rather than deciding where the nut sits.
  const backRoot = moveInVectorSpace(neckAtRootPlane, [{ ...normal, mag: -nk.thickness }]);
  const backLine = lineFromTwoPoints(backRoot, moveInVectorSpace(backRoot, [{ ...direction, mag: 1 }]));
  const buttonPlane = lineFromTwoPoints(new Pt(0, buttonTip.y), new Pt(1, buttonTip.y));
  const heelBottom = intersectLines(backLine, buttonPlane)!;
  const backNut = moveInVectorSpace(heelBottom, [{ ...direction, mag: nk.length }]);

  // The string runs flush with the fingerboard's own surface at the nut, no separate nut height,
  // so `nutTop` is both the fingerboard's top corner and where the string sits.
  const nutAt = moveInVectorSpace(backNut, [{ ...normal, mag: nk.thickness }]);
  const nutTop = moveInVectorSpace(nutAt, [{ ...normal, mag: nk.nutThickness }]);
  const nut = { at: nutAt, top: nutTop };

  const nutLength = standardNutLength(p.height);
  const nutBlockFar = moveInVectorSpace(nutAt, [{ ...direction, mag: nutLength }]);
  const nutBlock: [Pt, Pt, Pt, Pt] = [nutAt, nutBlockFar, moveInVectorSpace(nutBlockFar, [{ ...normal, mag: nk.nutThickness }]), nutTop];

  const fingerboardEnd = pointAtDistanceToward(nutAt, root, standardFingerboardLength(p.height));
  const fingerboardEndTop = moveInVectorSpace(fingerboardEnd, [{ ...normal, mag: nk.nutThickness }]);
  const fingerboard = { nutTop, end: fingerboardEnd, endTop: fingerboardEndTop };

  const back = { nut: backNut, root: backRoot };
  const heel = calculateHeel(back, buttonTip, nk.heelRadius);

  const scrollFront1 = moveInVectorSpace(nutAt, [{ ...direction, mag: nk.scrollLength }]);
  const scroll: [Pt, Pt, Pt, Pt] = [
    nutAt, scrollFront1,
    moveInVectorSpace(scrollFront1, [{ ...normal, mag: -nk.scrollDepth }]),
    moveInVectorSpace(nutAt, [{ ...normal, mag: -nk.scrollDepth }]),
  ];
  const scrollLabelAngleDeg = 90 - Math.atan2(direction.b, direction.a) * 180 / Math.PI;

  const stringOverFingerboardEnd = shortestDistanceFromPtToLine(fingerboardEndTop, lineFromTwoPoints(nutTop, bridgeTop));
  const stringLength = dist(nutTop, bridgeTop);

  nk.edge = edge; nk.root = root; nk.direction = direction; nk.normal = normal;
  nk.rootPlaneY = rootPlaneY; nk.mortiseFloorY = mortiseFloorY; nk.gluingAtMortise = gluingAtMortise;
  nk.plateEndY = plateEndY; nk.buttonTip = buttonTip; nk.backThickness = backThickness; nk.buttonProfile = buttonProfile;
  nk.bridge = bridge; nk.bridgeWedge = bridgeWedge;
  nk.nutLength = nutLength; nk.nut = nut; nk.nutBlock = nutBlock; nk.fingerboard = fingerboard; nk.back = back; nk.heel = heel;
  nk.heelBottom = heelBottom;
  nk.scroll = scroll; nk.scrollLabelAngleDeg = scrollLabelAngleDeg;
  nk.stringLength = stringLength; nk.stringOverFingerboardEnd = stringOverFingerboardEnd;
}

function calculateHeel(back: { nut: Pt; root: Pt }, tip: Pt, radius: number): NeckParams['heel'] {
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
