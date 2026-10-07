import { Arc, arcFromCircle, Circle, Pt, Vect2D } from '../../../models/types';
import { angleFromCenter, dist, intersectLines, lineFromTwoPoints, moveInVectorSpace, pointOnCircle, TURN, vectorFromSlope } from '../../../helpers/math/simpleGeometry';
import { pathFromArc, pathFromLine } from '../../../helpers/math/pathMath';
import { unifyConnectedSvgPaths } from '../../../helpers/math/pathVibes';
import { EnricoCerutiParams, FlutingParams, NeckParams, StringSetup } from '../../ceruti-types';
import { reportFailures, SolveFailure } from '../../../helpers/validators';
import { placeOnTopPlate, solveRibTaper, topPlatePlacement } from '../arching/ceruti-arching';
import { channelCenterlineZAt, LongArchSolve } from '../arching/ceruti-arch-geometry';
import { fingerboardEnd, mortiseFloorY, neckHalfWidthAt } from '../outline/ceruti-paths';

// The neck set in the side elevation, in the frame the body section is drawn in: x is height off
// the back plate's inner face, y runs up the body, the neck end at y = height. Everything hangs off
// the top plate's edge at the neck end, so the rib taper carries through. `calculateNeck` writes
// onto `p.neck` the four corners of the neck wood and the heel arc, and, once the string setup panel
// has set `p.stringSetup`, onto it the bridge and the string's point at the nut. The dressing the panel also draws (button, nut block,
// fingerboard, bridge wedge, guides) and the string length are read off those by the functions
// below, which the render and the path builder share.

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
    mortiseDepth: mm(6.5),
    overstand: mm(6.5),
    angle: 7.5 * TURN.degree,
    length: mm(144),
    thickness: mm(13),
    topWidth: mm(24),
    rootWidth: mm(33),
    heel: new Arc(0, 0, mm(20), 0, 0),
    nutHeight: mm(6),
    nutWidth: mm(24),

    root: null, neckTop: null, backRoot: null, backNut: null, plateAtMortise: null,
  };
}

export function defaultStringSetup(p: EnricoCerutiParams): StringSetup {
  const k = p.height / REFERENCE_BODY_HEIGHT;
  const mm = (v: number) => Math.round(v * k * 2) / 2;
  return {
    bodyStop: mm(195),
    bridgeHeight: mm(33),
    nutThickness: mm(7.5),
    fingerboardLength: standardFingerboardLength(p.height),
    fingerboardThickness: mm(5),
    fingerboardRadius: mm(42),

    bridgeFoot: null, bridgeTop: null, nutTop: null,
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

// `p.arching`, `p.neck` and `p.button` must already be in place — the panel seeds them
export function calculateNeck(p: EnricoCerutiParams, topArch: LongArchSolve | null, topGouge: FlutingParams): SolveFailure<'nutThickness' | 'fingerboardRadius'>[] {
  const nk = p.neck!;
  const taper = solveRibTaper(p);
  const placement = topPlatePlacement(p, taper);
  const outerZ = taper.zLower + p.arching!.top.thickness;

  // toward the nut, and the fingerboard's outward normal — both square to the fingerboard plane,
  // which leaves the top plate tilted by the neck angle off the plate's own square-to-the-rib line
  const direction = vectorFromSlope(nk.angle + TURN.quarter);
  const normal = vectorFromSlope(nk.angle);
  const root = placeOnTopPlate(placement, new Pt(outerZ + nk.overstand, p.height));
  const fingerboardPlane = lineFromTwoPoints(root, moveInVectorSpace(root, [{ ...direction, mag: 1 }]));
  const rootPlaneY = p.height - p.overhang;
  const neckAtRootPlane = intersectLines(fingerboardPlane, lineFromTwoPoints(new Pt(0, rootPlaneY), new Pt(1, rootPlaneY)))!;

  // `length` runs along the fingerboard plane from where it crosses the mortise floor to the
  // nut's bottom, the neck's end; the back sits the neck's thickness below
  const tip = buttonTip(p);
  const floorY = mortiseFloorY(p);
  const floorCrossing = intersectLines(fingerboardPlane, lineFromTwoPoints(new Pt(0, floorY), new Pt(1, floorY)))!;
  const neckTop = moveInVectorSpace(floorCrossing, [{ ...direction, mag: nk.length }]);
  const backNut = moveInVectorSpace(neckTop, [{ ...normal, mag: -nk.thickness }]);
  const backRoot = moveInVectorSpace(neckAtRootPlane, [{ ...normal, mag: -nk.thickness }]);

  nk.root = root;
  nk.neckTop = neckTop;
  nk.backRoot = backRoot;
  nk.backNut = backNut;
  // where the mortise floor comes out through the plate's surface; below it the foot is hidden in the
  // block. The floor is level with the body, so the point stays on it: the taper's tilt moves the
  // placed point's y by a fraction of a mm, across which the surface barely rises
  const surface = placeOnTopPlate(placement, new Pt(outerZ + channelCenterlineZAt(p, topGouge, topArch, floorY), floorY));
  nk.plateAtMortise = new Pt(surface.x, floorY);
  nk.heel = calculateHeel(backRoot, backNut, tip, nk.heel.r) ?? nk.heel;

  const ss = p.stringSetup;
  if (!ss) return [];
  const bridgeY = p.height - ss.bodyStop;
  const archZAtBridge = channelCenterlineZAt(p, topGouge, topArch, bridgeY);
  ss.bridgeFoot = placeOnTopPlate(placement, new Pt(outerZ + archZAtBridge, bridgeY));
  ss.bridgeTop = placeOnTopPlate(placement, new Pt(outerZ + archZAtBridge + ss.bridgeHeight, bridgeY));
  ss.nutTop = moveInVectorSpace(neckTop, [{ ...normal, mag: ss.nutThickness }]);

  const failures: SolveFailure<'nutThickness' | 'fingerboardRadius'>[] = [];
  const fbEnd = fingerboardEnd(p);
  const widest = 2 * neckHalfWidthAt(p, fbEnd.y);
  if (ss.fingerboardRadius <= widest) failures.push({
    message: `The fingerboard radius has to be larger than the board's widest point, ${widest.toFixed(1)} mm at its end.`,
    unsolved: ['fingerboardRadius'], circles: [], segments: [],
    points: [moveInVectorSpace(fbEnd, [{ ...normal, mag: ss.fingerboardThickness }])],
  });
  const crownAtNut = ss.fingerboardThickness + fingerboardCrown(p, neckTop.y);
  if (ss.nutThickness < crownAtNut) failures.push({
    message: `The nut stands below the fingerboard's crown, which is ${crownAtNut.toFixed(1)} mm off the neck at the nut.`,
    unsolved: ['nutThickness'], circles: [], segments: [],
    points: [moveInVectorSpace(neckTop, [{ ...normal, mag: crownAtNut }])],
  });
  reportFailures(failures, 'String Setup');
  return failures;
}

// how far behind the neck's back line the button tip sits: the heel only stands when it's positive
function tipDepthBehindBack(backRoot: Pt, backNut: Pt, tip: Pt): number {
  const backRunLength = dist(backRoot, backNut);
  if (backRunLength < 1e-9) return NaN;
  return ((tip.y - backRoot.y) * (backNut.x - backRoot.x) - (tip.x - backRoot.x) * (backNut.y - backRoot.y)) / backRunLength;
}

// whether the heel's entered radius stood on the last pass; when it didn't, the neck's back runs
// straight down to the root
export function heelStands(p: EnricoCerutiParams): boolean {
  const nk = p.neck!;
  return nk.heel.r > 0 && tipDepthBehindBack(nk.backRoot!, nk.backNut!, buttonTip(p)) > 0;
}

function calculateHeel(backRoot: Pt, backNut: Pt, tip: Pt, radius: number): Arc | null {
  const tipDepth = tipDepthBehindBack(backRoot, backNut, tip);
  if (!(radius > 0) || !(tipDepth > 0)) return null;

  const backRunLength = dist(backRoot, backNut);
  const backDirection: Vect2D = { a: (backNut.x - backRoot.x) / backRunLength, b: (backNut.y - backRoot.y) / backRunLength, mag: 1 };
  const backNormal: Vect2D = { a: backDirection.b, b: -backDirection.a, mag: 1 };

  let center: Pt;
  let end: Pt;

  // the foot is cut square to the neck, not level with the body, so it leaves the tip along the
  // back's normal and meets the back line `tipDepth` later — a plain fillet if it fits, else the
  // arc reaches the tip itself
  if (radius < tipDepth) {
    end = moveInVectorSpace(tip, [{ ...backNormal, mag: tipDepth - radius }]);
    center = moveInVectorSpace(end, [{ ...backDirection, mag: radius }]);
  } else {
    const alongBackToCenter = tipDepth - radius;
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

// how far the fingerboard's cylindrical crown stands above its edges, over the board's width at y
export function fingerboardCrown(p: EnricoCerutiParams, y: number): number {
  const r = p.stringSetup!.fingerboardRadius;
  const half = Math.min(neckHalfWidthAt(p, y), r);
  return r - Math.sqrt(r * r - half * half);
}

// where the fingerboard plane crosses the mortise floor
export function mortiseFingerboardIntersect(p: EnricoCerutiParams): Pt {
  const nk = p.neck!;
  const floorY = mortiseFloorY(p);
  return intersectLines(lineFromTwoPoints(nk.root!, nk.neckTop!), lineFromTwoPoints(new Pt(0, floorY), new Pt(1, floorY)))!;
}

// the top plate's outer edge at the neck end, which the root stands off by the overstand
export function plateEdgeAtNeck(p: EnricoCerutiParams): Pt {
  const taper = solveRibTaper(p);
  return placeOnTopPlate(topPlatePlacement(p, taper), new Pt(taper.zLower + p.arching!.top.thickness, p.height));
}

// the flat foot square to the neck, from the heel's end on to the button tip, when the arc stops
// short of it
export function heelFace(p: EnricoCerutiParams): [Pt, Pt] | null {
  if (!heelStands(p)) return null;
  const heel = p.neck!.heel;
  const end = pointOnCircle(heel, heel.end);
  const tip = buttonTip(p);
  return dist(end, tip) > 1e-9 ? [end, tip] : null;
}

// nut to bridge, straight-line: the string's approximate length. The real one runs a little longer
// over the fingerboard's and bridge's curvature
export function stringLength(p: EnricoCerutiParams): number {
  return dist(p.stringSetup!.nutTop!, p.stringSetup!.bridgeTop!);
}

// the bridge blank's four corners: foot-left, foot-right, top-right, top-left
export function bridgeWedge(p: EnricoCerutiParams): [Pt, Pt, Pt, Pt] {
  const foot = p.stringSetup!.bridgeFoot!;
  const top = p.stringSetup!.bridgeTop!;
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
  const glue = mortiseFingerboardIntersect(p);
  const segments = [
    pathFromLine(new Pt(0, mortiseFloorY(p)), glue),
    pathFromLine(glue, nk.root!),
    pathFromLine(nk.root!, nk.neckTop!),
    pathFromLine(nk.neckTop!, nk.backNut!),
  ];
  const heel = nk.heel;
  if (heelStands(p)) {
    segments.push(pathFromLine(nk.backNut!, pointOnCircle(heel, heel.start)));
    segments.push(pathFromArc(heel));
    const face = heelFace(p);
    if (face) segments.push(pathFromLine(...face));
  } else {
    segments.push(pathFromLine(nk.backNut!, nk.backRoot!));
  }
  return unifyConnectedSvgPaths(segments);
}
