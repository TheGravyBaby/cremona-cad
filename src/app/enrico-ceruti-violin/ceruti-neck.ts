import { Arc, arcFromCircle, Circle, Pt, Vect2D } from '../models/types';
import {
  angleFromCenter, dist, intersectLines, lineFromTwoPoints,
  moveInVectorSpace, pointAtDistanceToward, pointOnCircle, vectorFromSlope,
} from '../helpers/math/simpleGeometry';
import { pathFromArc, pathFromLine, unifyConnectedSvgPaths } from '../helpers/math/pathMath';
import { EnricoCerutiParams, FlutingParams, NeckParams } from './ceruti-types';
import { placeOnTopPlate, solveRibTaper, topPlatePlacement } from './ceruti-arching';
import { channelCenterlineZAt, LongArchSolve } from './ceruti-arch-geometry';

// The neck set in the side elevation, in the frame the body section is drawn in: x is height off
// the back plate's inner face, y runs up the body, the neck end at y = height. Everything hangs off
// the top plate's edge at the neck end, so the rib taper carries through. `calculateNeck` writes
// onto `p.neck` only what fixes the neck's shape and what the panel reads out: the four corners of
// the neck wood, the heel arc, the bridge and the string length. The dressing the panel also draws
// (button, nut block, fingerboard, bridge wedge, guides) is read off those by the functions below,
// which the render and the path builder share.

const REFERENCE_BODY_HEIGHT = 355;
// the bridge's blank, drawn as a wedge: how much narrower the feet are than the body stop line, and
// the top than the feet
const BRIDGE_FOOT_HALF_WIDTH_RATIO = 0.07;
const BRIDGE_TOP_TO_FOOT_WIDTH_RATIO = 1 / 3;

// violin numbers, scaled by body length for the larger sizes — generic for the size class rather
// than measured
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

    root: null, nut: null, backRoot: null, backNut: null, heel: null,
    bridgeFoot: null, bridgeTop: null, stringLength: null,
  };
}

// fingerboards run standard lengths by instrument size, not a free parameter — the same size-class
// thresholds as the mould block sizing in ceruti-calcs.ts
function standardFingerboardLength(bodyHeight: number): number {
  if (bodyHeight < 400) return 270;
  if (bodyHeight < 500) return 310;
  if (bodyHeight < 800) return 580;
  return 850;
}

// the nut's span along the neck, scaled from the violin's 6 mm by body length
export function standardNutLength(bodyHeight: number): number {
  return 6 * bodyHeight / REFERENCE_BODY_HEIGHT;
}

// `p.arching`, `p.neck` and `p.button` must already be in place — the panel seeds them
export function calculateNeck(p: EnricoCerutiParams, topArch: LongArchSolve | null, topGouge: FlutingParams): void {
  const nk = p.neck!;
  const taper = solveRibTaper(p);
  const placement = topPlatePlacement(p, taper);
  const outerZ = taper.zLower + p.arching!.top.thickness;

  // toward the nut, and the fingerboard's outward normal — both square to the fingerboard plane,
  // which leaves the top plate tilted by the neck angle off the plate's own square-to-the-rib line
  const direction = vectorFromSlope(nk.angle + Math.PI / 2);
  const normal = vectorFromSlope(nk.angle);
  const root = placeOnTopPlate(placement, new Pt(outerZ + nk.overstand, p.height));
  const fingerboardPlane = lineFromTwoPoints(root, moveInVectorSpace(root, [{ ...direction, mag: 1 }]));
  const rootPlaneY = p.height - p.overhang;
  const neckAtRootPlane = intersectLines(fingerboardPlane, lineFromTwoPoints(new Pt(0, rootPlaneY), new Pt(1, rootPlaneY)))!;

  const bridgeY = p.height - nk.bodyStop;
  const archZAtBridge = channelCenterlineZAt(p, topGouge, topArch, bridgeY);
  const bridgeFoot = placeOnTopPlate(placement, new Pt(outerZ + archZAtBridge, bridgeY));
  const bridgeTop = placeOnTopPlate(placement, new Pt(outerZ + archZAtBridge + nk.bridgeHeight, bridgeY));

  // `length` is the neck as felt in hand: the back's own top corner at the nut down to a level
  // line at the button's height — not root to nut, and not a straight-line reach to the heel's
  // curve either, since a maker's ruler runs along the neck, not through it. The back line (the
  // root's line carried onto the back) crosses that level first; the nut is `length` further up
  // it, and the fingerboard plane sits the neck's thickness above
  const tip = buttonTip(p);
  const backRoot = moveInVectorSpace(neckAtRootPlane, [{ ...normal, mag: -nk.thickness }]);
  const backLine = lineFromTwoPoints(backRoot, moveInVectorSpace(backRoot, [{ ...direction, mag: 1 }]));
  const buttonPlane = lineFromTwoPoints(new Pt(0, tip.y), new Pt(1, tip.y));
  const heelBottom = intersectLines(backLine, buttonPlane)!;
  const backNut = moveInVectorSpace(heelBottom, [{ ...direction, mag: nk.length }]);
  const nut = moveInVectorSpace(backNut, [{ ...normal, mag: nk.thickness }]);

  // the string runs flush with the fingerboard's own surface at the nut, no separate nut height
  const nutTop = moveInVectorSpace(nut, [{ ...normal, mag: nk.nutThickness }]);

  nk.root = root;
  nk.nut = nut;
  nk.backRoot = backRoot;
  nk.backNut = backNut;
  nk.heel = calculateHeel(backRoot, backNut, tip, nk.heelRadius);
  nk.bridgeFoot = bridgeFoot;
  nk.bridgeTop = bridgeTop;
  nk.stringLength = dist(nutTop, bridgeTop);
}

function calculateHeel(backRoot: Pt, backNut: Pt, tip: Pt, radius: number): Arc | null {
  const backRunLength = dist(backRoot, backNut);
  if (!(radius > 0) || backRunLength < 1e-9) return null;

  const backDirection: Vect2D = { a: (backNut.x - backRoot.x) / backRunLength, b: (backNut.y - backRoot.y) / backRunLength, mag: 1 };
  const backNormal: Vect2D = { a: backDirection.b, b: -backDirection.a, mag: 1 };
  const tipDepthBehindBack = -((tip.x - backRoot.x) * backNormal.a + (tip.y - backRoot.y) * backNormal.b);
  if (!(tipDepthBehindBack > 0)) return null;

  let center: Pt;
  let end: Pt;

  // the foot is cut square to the neck, not level with the body, so it leaves the tip along the
  // back's normal and meets the back line `tipDepthBehindBack` later — a plain fillet if it fits,
  // else the arc reaches the tip itself
  if (radius < tipDepthBehindBack) {
    end = moveInVectorSpace(tip, [{ ...backNormal, mag: tipDepthBehindBack - radius }]);
    center = moveInVectorSpace(end, [{ ...backDirection, mag: radius }]);
  } else {
    const alongBackToCenter = tipDepthBehindBack - radius;
    const acrossBackToCenter = Math.sqrt(Math.max(radius * radius - alongBackToCenter * alongBackToCenter, 0));
    center = moveInVectorSpace(tip, [{ ...backNormal, mag: alongBackToCenter }, { ...backDirection, mag: acrossBackToCenter }]);
    end = tip;
  }

  const start = moveInVectorSpace(center, [{ ...backNormal, mag: radius }]);
  const circle: Circle = { x: center.x, y: center.y, r: radius };
  return arcFromCircle(circle, angleFromCenter(center, start), angleFromCenter(center, end));
}

// the button's tip on the centreline, the button's height beyond the plate's end; the heel foot ends there
export function buttonTip(p: EnricoCerutiParams): Pt {
  return new Pt(0, p.height + (p.button?.height ?? 0));
}

// the mortise floor, inside the rib's outer face by the mortise depth
export function mortiseFloorY(p: EnricoCerutiParams): number {
  return p.height - p.overhang - p.neck!.mortiseDepth;
}

// where the fingerboard plane crosses the mortise floor
export function gluingAtMortise(p: EnricoCerutiParams): Pt {
  const nk = p.neck!;
  const floorY = mortiseFloorY(p);
  return intersectLines(lineFromTwoPoints(nk.root!, nk.nut!), lineFromTwoPoints(new Pt(0, floorY), new Pt(1, floorY)))!;
}

// the top plate's outer edge at the neck end, which the root stands off by the overstand
export function plateEdgeAtNeck(p: EnricoCerutiParams): Pt {
  const taper = solveRibTaper(p);
  return placeOnTopPlate(topPlatePlacement(p, taper), new Pt(taper.zLower + p.arching!.top.thickness, p.height));
}

// where `length` is measured from: the back line at the button's height, `length` back down the
// neck from the nut. A construction point, not one on the heel's own arc
export function heelBottom(p: EnricoCerutiParams): Pt {
  const nk = p.neck!;
  return moveInVectorSpace(nk.backNut!, [{ ...vectorFromSlope(nk.angle + Math.PI / 2), mag: -nk.length }]);
}

// the flat foot square to the neck, from the heel's end on to the button tip, when the arc stops
// short of it
export function heelFace(p: EnricoCerutiParams): [Pt, Pt] | null {
  const heel = p.neck!.heel;
  if (!heel) return null;
  const end = pointOnCircle(heel, heel.end);
  const tip = buttonTip(p);
  return dist(end, tip) > 1e-9 ? [end, tip] : null;
}

// the fingerboard's end, a standard length down the neck from the nut
export function fingerboardEnd(p: EnricoCerutiParams): Pt {
  const nk = p.neck!;
  return pointAtDistanceToward(nk.nut!, nk.root!, standardFingerboardLength(p.height));
}

// the bridge blank's four corners: foot-left, foot-right, top-right, top-left
export function bridgeWedge(p: EnricoCerutiParams): [Pt, Pt, Pt, Pt] {
  const foot = p.neck!.bridgeFoot!;
  const top = p.neck!.bridgeTop!;
  const span = dist(foot, top);
  const across: Vect2D = { a: -(top.y - foot.y) / span, b: (top.x - foot.x) / span, mag: 1 };
  const footHalfWidth = BRIDGE_FOOT_HALF_WIDTH_RATIO * span;
  const topHalfWidth = footHalfWidth * BRIDGE_TOP_TO_FOOT_WIDTH_RATIO;
  return [
    moveInVectorSpace(foot, [{ ...across, mag: -footHalfWidth }]),
    moveInVectorSpace(foot, [{ ...across, mag: footHalfWidth }]),
    moveInVectorSpace(top, [{ ...across, mag: topHalfWidth }]),
    moveInVectorSpace(top, [{ ...across, mag: -topHalfWidth }]),
  ];
}

// the neck's own visible boundary as one path, for a template export: the foot in the mortise, the
// fingerboard plane, the nut end, the back and the heel. It stops at the heel's end or face rather
// than closing a loop, since the block's foot inside the mortise has no back-face point solved.
// The fingerboard, nut block, bridge and button are separate parts
export function defineNeckPath(p: EnricoCerutiParams): string {
  const nk = p.neck!;
  const glue = gluingAtMortise(p);
  const segments = [
    pathFromLine(new Pt(0, mortiseFloorY(p)), glue),
    pathFromLine(glue, nk.root!),
    pathFromLine(nk.root!, nk.nut!),
    pathFromLine(nk.nut!, nk.backNut!),
  ];
  const heel = nk.heel;
  if (heel) {
    segments.push(pathFromLine(nk.backNut!, pointOnCircle(heel, heel.start)));
    segments.push(pathFromArc(heel));
    const face = heelFace(p);
    if (face) segments.push(pathFromLine(...face));
  } else {
    segments.push(pathFromLine(nk.backNut!, nk.backRoot!));
  }
  return unifyConnectedSvgPaths(segments);
}
