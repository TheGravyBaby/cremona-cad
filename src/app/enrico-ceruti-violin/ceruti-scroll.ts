import { angleFromCenter, angleWithinSweep, dist, moveInVectorSpace, normalizeRadians, placeCircleOnPointAtAngle, pointOnCircle, vectorFromSlope } from '../helpers/math/simpleGeometry';
import { circleCircleIntersections } from '../helpers/math/draftMath';
import { reportFailures, SolveFailure, solveSection } from '../helpers/validators';
import { Pt, SweptArc } from '../models/types';
import { EnricoCerutiParams, VoluteParams, VoluteStyle } from './ceruti-types';
import { standardNutLength } from './ceruti-neck';

// The scroll in its own side-view frame: the nut at the origin on the neck's front, up the neck +y,
// toward the back -x. The volute's spiral styles about the eye, and `calculateScroll`, which lays
// the spiral out and runs the back and front off it, writing every arc and line onto `p.volute`
// for renders/scroll.render.ts to read — the split calculateFholeContours and calculateNeck use.
// The volute panel edits the spiral and the crown (S0, S1), the scroll panel the back from S2 on
// and the front.

// what a style draws from: the eye, for the four point the arc radii, for the Archimedean its
// pitch and for Kelly his seed
export type VoluteSpec = Pick<VoluteParams, 'style' | 'eyeRadius' | 'arcRadii' | 'pitch' | 'seedLength'>;

// A style draws its whole construction in the eye's own frame (origin at the eye's centre), arcs
// outermost first. Every spiral leaves the eye at its front, heading up, as Kelly's later drawings
// do; the older authors set the volute against a column and started at the top of the eye, so
// their figures are turned a quarter clockwise here. Counterclockwise is the way it winds outward,
// so an arc runs from its inner neighbour's end to its own end. Neighbours share that point
// (inner.to = outer.from) and are tangent there. Every style is drawn two full turns, `front` of
// its arcs from the eye, so the scroll's own arcs can always take over at the front heading
// straight up. `guides` is the figure the centres are found on, as polylines in the same frame,
// for the guides view. `custom` marks the four point. A historical figure is sized at its
// author's proportion to the eye, so the eye alone sets the whole spiral, all but Kelly's seed.
export interface VoluteStyleDef {
  label: string;
  custom?: boolean;
  front: number;
  arcs: (v: VoluteSpec) => SweptArc[];
  guides: (v: VoluteSpec) => Pt[][];
}

// quarter turns from the eye's front out to the spiral's, where every style stops: two full turns
export const TO_FRONT = 8;

const QUARTER = Math.PI / 2;
const TWO_PI = 2 * Math.PI;
const polar = (r: number, angle: number) => new Pt(r * Math.cos(angle), r * Math.sin(angle));
const sweptArc = (center: Pt, r: number, from: number, to: number): SweptArc => ({ x: center.x, y: center.y, r, from, to });
const square = (left: number, right: number, bottom: number, top: number) =>
  [new Pt(left, bottom), new Pt(right, bottom), new Pt(right, top), new Pt(left, top), new Pt(left, bottom)];

// a quarter turn about each centre in turn, from the eye's front, each radius the last's plus the
// step between their centres so the arcs run on tangent. Outermost first
const quarterTurns = (centers: Pt[], first: number): SweptArc[] => {
  let r = first;
  return centers.map((center, i) => {
    if (i > 0) r += dist(centers[i - 1], center);
    const from = normalizeRadians(QUARTER * i);
    return sweptArc(center, r, from, from + QUARTER);
  }).reverse();
};

// Serlio (1537): semicircles about centres on the line of centres, his eye's own diameter cut in
// sixths, stepping out to either side in turn, so the turns close up toward the eye. The innermost
// reaches the front of the eye from the centre just behind its middle.
const serlio: VoluteStyleDef = {
  label: 'Serlio (1537)',
  front: TO_FRONT,
  arcs: ({ eyeRadius }) => quarterTurns([-1, 1, -2, 2, -3, 3].flatMap(k => {
    const c = new Pt(k * eyeRadius / 3, 0);
    return [c, c];
  }), 4 * eyeRadius / 3),
  guides: ({ eyeRadius }) => [[new Pt(-eyeRadius, 0), new Pt(eyeRadius, 0)]],
};

// Archimedes (On Spirals, c. 225 BC): the radius grows evenly with the angle, by `pitch` every
// turn, from the eye's edge at its front, so the turns stand an even pitch apart all the way out.
// Not a volute method, but the plain spiral the others are measured against. Set out by points an
// eighth of a turn apart: the compass can't follow a curve, so each arc is the circle through the
// next point tangent to the last. An arc's direction misses the curve's by an amount that flips
// sign at each joint on, so the first is the one that misses equally at both its ends: started on
// the curve's exact direction at the eye instead, the arcs alternate a little flat and a little
// round the whole way out.
const EIGHTHS = 2 * TO_FRONT;
const archimedeanArcs = (eyeRadius: number, pitch: number): SweptArc[] => {
  const angle = (k: number) => k * Math.PI / 4;
  const radius = (k: number) => eyeRadius + pitch * k / 8;
  const points = Array.from({ length: EIGHTHS + 1 }, (_, k) => polar(radius(k), angle(k)));
  const growth = pitch / TWO_PI;
  const heading = (k: number) => {
    const r = radius(k);
    const t = angle(k);
    return Math.atan2(growth * Math.sin(t) + r * Math.cos(t), growth * Math.cos(t) - r * Math.sin(t));
  };
  const chord = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  const miss = (k: number) => normalizeRadians(heading(k) - chord + Math.PI) - Math.PI;

  let tangent = polar(1, chord + (miss(0) - miss(1)) / 2);
  const arcs: SweptArc[] = [];
  for (let k = 0; k < EIGHTHS; k++) {
    const p = points[k];
    const q = points[k + 1];
    const len = Math.hypot(tangent.x, tangent.y);
    const normal = new Pt(-tangent.y / len, tangent.x / len);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const r = (dx * dx + dy * dy) / (2 * (dx * normal.x + dy * normal.y));
    const center = new Pt(p.x + r * normal.x, p.y + r * normal.y);
    const from = angleFromCenter(center, p);
    const to = from + normalizeRadians(angleFromCenter(center, q) - from);
    arcs.push(sweptArc(center, r, from, to));
    tangent = new Pt(center.y - q.y, q.x - center.x);
  }
  return arcs.reverse();
};
const archimedean: VoluteStyleDef = {
  label: 'Archimedes (c. 225 BC)',
  front: EIGHTHS,
  arcs: ({ eyeRadius, pitch }) => pitch > 0 ? archimedeanArcs(eyeRadius, pitch) : [],
  // a ray from the eye's centre out to the last point on each of the eight lines, the front's
  // two turns out and the rest a turn and a bit
  guides: ({ eyeRadius, pitch }) => pitch > 0 ? Array.from({ length: 8 }, (_, ray) =>
    [new Pt(0, 0), polar(eyeRadius + pitch * (ray ? 8 + ray : EIGHTHS) / 8, ray * Math.PI / 4)]) : [],
};

// Salviati (1552): twelve quarter-circle arcs, their centres round the corners of three nested
// squares, the outer one's side his eye's radius (the eye's inscribed square turned to its edge
// midpoints), the other two 2/3 and 1/3 of it. Each radius is the next one in plus the
// distance between their centres, so a quarter turn steps in by 1/2, 1/3 and 1/6 of an eye diameter
// on the three rings. Where one ring meets the next the centres are not a quarter turn apart, so
// the two arcs there run a little long and a little short to stay tangent. Vignola (1562),
// Palladio (1570) and Scamozzi (1615) reprint these same centres.
const salviati: VoluteStyleDef = {
  label: 'Salviati (1552)',
  front: TO_FRONT,
  arcs: ({ eyeRadius }) => {
    const g = eyeRadius * Math.SQRT2 / 6;
    const n = 12;
    const centers = Array.from({ length: n }, (_, i) => polar((3 - Math.floor(i / 4)) * g, Math.PI / 4 - i * QUARTER));

    // the innermost arc leaves the front of the eye, so it runs a little over a quarter
    const radii = new Array<number>(n);
    const last = centers[n - 1];
    radii[n - 1] = Math.hypot(eyeRadius - last.x, last.y);
    for (let i = n - 2; i >= 0; i--) radii[i] = radii[i + 1] + dist(centers[i], centers[i + 1]);

    // joints[i] is where arc i meets the arc inside it, along the line between their centres
    const joints = centers.slice(0, n - 1).map((c, i) => angleFromCenter(c, centers[i + 1]));
    return centers.map((center, i) => {
      const from = i < n - 1 ? joints[i] : Math.atan2(-last.y, eyeRadius - last.x);
      const outerEnd = i > 0 ? joints[i - 1] : joints[0] + QUARTER;
      return sweptArc(center, radii[i], from, from + normalizeRadians(outerEnd - from));
    });
  },
  guides: ({ eyeRadius }) => {
    const h = eyeRadius / 2;
    return [
      [0, 1, 2, 3, 4].map(i => polar(eyeRadius, i * QUARTER)),
      square(-h, h, -h, h),
      [new Pt(-h, -h), new Pt(h, h)],
      [new Pt(-h, h), new Pt(h, -h)],
    ];
  },
};

// Goldmann (written c. 1662, printed 1696): Salviati's three squares again, the largest's side his
// eye's radius and the others 1/3 and 2/3 of it, but sharing a side along the eye's horizontal
// diameter and centred on it, hanging below, rather than nested about the eye's centre. That
// lines every ring change up with the joint, so all twelve arcs are exact quarter circles and
// still tangent; radii run 7/6 of the eye's radius up to 51/6, reaching 9 radii out. Later than
// Cremona's golden age and printed in Germany, so the least likely of these to have been on a
// Cremonese bench.
const goldmann: VoluteStyleDef = {
  label: 'Goldmann (1696)',
  front: TO_FRONT,
  // round each square from its upper left corner, the first reaching the front of the eye
  arcs: ({ eyeRadius }) => quarterTurns([1, 2, 3].flatMap(k => {
    const w = k * eyeRadius / 3;
    const h = k * eyeRadius / 6;
    return [new Pt(-h, 0), new Pt(-h, -w), new Pt(h, -w), new Pt(h, 0)];
  }), 7 * eyeRadius / 6),
  guides: ({ eyeRadius }) => [
    [new Pt(-eyeRadius, 0), new Pt(eyeRadius, 0)],
    ...[1, 2, 3].map(k => square(-k * eyeRadius / 6, k * eyeRadius / 6, -k * eyeRadius / 3, 0)),
  ],
};

// Kelly (Kevin Kelly, Boston, 2011): a seed of four equal squares stacked in a column, centred on
// the eye with its middle line on the eye's vertical diameter. The first arc leaves the eye's front
// from the left end of the middle line, then the centres go round the two middle squares' outer
// corners, lower left, lower right, upper right, upper left, and the same round the seed's own
// corners. His ninth arc goes on past the front. He varies the seed's length from scroll to scroll,
// so it is a field of its own; his drawing stands it as tall as the eye's radius.
const kelly: VoluteStyleDef = {
  label: 'Kelly (2011)',
  front: TO_FRONT,
  arcs: ({ eyeRadius, seedLength }) => {
    if (!(seedLength > 0)) return [];
    const s = seedLength / 4;
    const corners = [1, 2].flatMap(t => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new Pt(x * s / 2, y * t * s)));
    return quarterTurns([new Pt(-s / 2, 0), ...corners], eyeRadius + s / 2);
  },
  guides: v => {
    if (!(v.seedLength > 0)) return [];
    const s = v.seedLength / 4;
    const reach = Math.max(v.eyeRadius, ...kelly.arcs(v).slice(1).map(a => dist(new Pt(0, 0), a) + a.r));
    return [
      square(-s / 2, s / 2, -2 * s, 2 * s),
      ...[-1, 0, 1].map(k => [new Pt(-s / 2, k * s), new Pt(s / 2, k * s)]),
      [new Pt(0, -reach), new Pt(0, reach)],
      [new Pt(-reach, 0), new Pt(reach, 0)],
    ];
  },
};

// Four point: the spiral drawn about the corners of a square inside the eye, every arc an exact
// quarter turn. It leaves the front of the eye heading up like the rest, so the first centre sits
// straight behind that point, the first radius in, and the first arc runs on tangent to the eye;
// a centre on the eye's edge would kink it off the eye instead. Each centre steps back from the
// last joint by the growth, which keeps the joint on the line between the two and the arcs
// tangent; an arc no wider than the last carries on about the same centre. The radii are the
// user's, since old scrolls rarely open evenly.
const fourPointCentres = (eyeRadius: number, arcRadii: number[]) => {
  const centers = [new Pt(eyeRadius - arcRadii[0], 0)];
  arcRadii.slice(1).forEach((r, i) => {
    const last = centers[i];
    const grow = r - arcRadii[i];
    const joint = QUARTER * (i + 1);
    centers.push(new Pt(last.x - grow * Math.cos(joint), last.y - grow * Math.sin(joint)));
  });
  return centers;
};

const fourPoint: VoluteStyleDef = {
  label: 'Four Point (custom)',
  custom: true,
  front: TO_FRONT,
  arcs: ({ eyeRadius, arcRadii }) => {
    if (!(arcRadii[0] > 0) || !arcRadii.every((r, i) => r >= (arcRadii[i - 1] ?? 0))) return [];
    return fourPointCentres(eyeRadius, arcRadii).map((center, i) => {
      const from = normalizeRadians(QUARTER * i);
      return sweptArc(center, arcRadii[i], from, from + QUARTER);
    }).reverse();
  },
  guides: ({ eyeRadius, arcRadii }) => [arcRadii.length ? fourPointCentres(eyeRadius, arcRadii) : []],
};

// the four point's fields start from Kelly's radii on the volute's own eye and seed: both strike a
// quarter turn about each centre in turn, so with his radii the four point's centres land on his
// and it draws his spiral until a field moves. Rounded to the hundredth like the fields
export const kellyArcRadii = (v: Pick<VoluteParams, 'eyeRadius' | 'seedLength'>): number[] =>
  kelly.arcs({ ...v, style: 'kelly', arcRadii: [], pitch: 0 })
    .reverse()
    .slice(0, TO_FRONT)
    .map(a => Math.round(a.r * 100) / 100);

export const VOLUTE_STYLES: Record<VoluteStyle, VoluteStyleDef> = {
  fourPoint, archimedean, serlio, salviati, goldmann, kelly,
};

// the style's figure out to the front, in the eye's frame, the outermost arc rolled back or on to
// end there exactly about its own centre, heading straight up. Salviati's ring changes and the
// Archimedean's points only come close to it on their own
function drawn(v: VoluteSpec): SweptArc[] | null {
  if (!(v.eyeRadius > 0)) return null;
  const { front, arcs: figure } = VOLUTE_STYLES[v.style];
  const arcs = figure(v);
  if (arcs.length < front) return null;
  const [outer, ...rest] = arcs.slice(-front);
  return [{ ...outer, to: Math.round(outer.to / TWO_PI) * TWO_PI }, ...rest];
}

// the furthest an arc reaches toward the front
function frontmost({ x, r, from, to }: SweptArc): number {
  const passesFront = Math.floor(to / TWO_PI) > Math.floor(from / TWO_PI);
  return passesFront ? x + r : x + r * Math.max(Math.cos(from), Math.cos(to));
}

// the eye's x that brings the spiral's front flush with the neck's front, x = 0
export function flushVolute(v: VoluteSpec): number | null {
  const arcs = drawn(v);
  return arcs ? -Math.max(...arcs.map(frontmost)) : null;
}

// the figure the style finds its centres on, carried to the eye, for the construction view
export function voluteGuides(v: VoluteParams): Pt[][] {
  return VOLUTE_STYLES[v.style].guides(v).map(line => line.map(pt => new Pt(v.eyeX + pt.x, v.eyeY + pt.y)));
}

// about the Salviati's own opening, its front as far out
export const defaultPitch = (eyeRadius: number) => Math.round(1.9 * eyeRadius * 10) / 10;

// unplaced until calculateScroll solves its centre and the angle the field doesn't set
const unplaced = (r: number, from: number, to: number): SweptArc => ({ x: 0, y: 0, r, from, to });

// a Salviati as wide as the one that fitted the Betts scroll, on a 2.6 mm eye 96 mm up from the
// nut; everything defaults from there. The back is in proportion to the spiral's outermost arc,
// widest at the front and tightening over the back, a quarter turn each up to the top and over to
// the back, then an eighth on down, S3 bringing it round to run straight down parallel to the neck.
// The front is in proportion to the rise from the top of the nut to the bottom of the spiral,
// which it has to climb: F0 turning back by a twelfth of a turn leaves the straight aimed in under
// the volute for F1 to meet it
export function defaultVoluteParams(p: EnricoCerutiParams): VoluteParams {
  let k = p.height / 355;
  let eyeRadius = Math.round(2.6 * k * 10) / 10;
  let v: VoluteSpec = { style: 'salviati', eyeRadius, arcRadii: [], pitch: defaultPitch(eyeRadius), seedLength: eyeRadius };
  let eyeX = Math.round((flushVolute(v) ?? 0) * 100) / 100;
  let eyeY = Math.round(96 * k * 10) / 10;

  let spiral = drawn(v) ?? [];
  let outer = spiral[0]?.r ?? 0;
  let back = (ratio: number) => Math.round(ratio * outer * 10) / 10;

  let bottom = Math.min(...spiral.map(a => eyeY + a.y - a.r));
  let rise = bottom - standardNutLength(p.height);
  let front = (ratio: number) => Number.isFinite(rise) ? Math.round(ratio * rise * 10) / 10 : 0;

  return {
    style: v.style, eyeRadius, eyeX, eyeY, flushWithNeck: true, pitch: v.pitch, seedLength: v.seedLength, arcRadii: [],
    spiral: null,
    S0: unplaced(back(1.4), 0, Math.PI / 2),
    S1: unplaced(back(1.2), 0, Math.PI),
    S2: unplaced(back(1), 0, 5 * Math.PI / 4),
    backStraight: back(0.5), backStraightLine: null,
    S3: unplaced(back(1), 0, 0),
    square: null,
    nape: unplaced(back(0.3), 0, Math.PI / 2),
    flat: front(0.45), flatLine: null,
    F0: unplaced(front(0.4), 0, Math.PI / 6),
    frontStraight: front(0.3), frontStraightLine: null,
    F1: unplaced(front(0.15), 0, 0),
  };
}

export type ScrollKey = 'spiral' | 'S0' | 'S1' | 'S2' | 'backStraight' | 'S3' | 'square' | 'nape' | 'flat' | 'F0' | 'frontStraight' | 'F1';
export type ScrollFailure = SolveFailure<ScrollKey>;
const BACK_KEYS: ScrollKey[] = ['S0', 'S1', 'S2', 'backStraight', 'S3', 'square', 'nape'];
const FRONT_KEYS: ScrollKey[] = ['flat', 'F0', 'frontStraight', 'F1'];
const ALL_KEYS: ScrollKey[] = ['spiral', ...BACK_KEYS, ...FRONT_KEYS];

// `p.neck` must already be in place — the panel seeds it
export function calculateScroll(p: EnricoCerutiParams): ScrollFailure[] {
  p.volute ??= defaultVoluteParams(p);
  let v = p.volute;
  let style = VOLUTE_STYLES[v.style];

  // the four point's fields seed from Kelly's once, then stay the user's
  if (style.custom && !v.arcRadii.length) v.arcRadii = kellyArcRadii(v);
  v.pitch ??= defaultPitch(v.eyeRadius);

  // flush rewrites Eye X to the hundredth every pass it is on, so turning it off leaves the eye where it was
  if (v.flushWithNeck) {
    let flushX = flushVolute(v);
    if (flushX !== null) v.eyeX = Math.round(flushX * 100) / 100;
  }

  let neckBack = -p.neck!.thickness;
  let nutTop = new Pt(0, standardNutLength(p.height));

  v.spiral = null;
  v.backStraightLine = null;
  v.square = null;
  v.flatLine = null;
  v.frontStraightLine = null;

  // a run ends at the first part that isn't a positive radius, a forward sweep of up to a full
  // turn, or a length; everything after it stays unsolved
  let badArc = (section: string, key: ScrollKey, arc: SweptArc, unsolved: ScrollKey[]): ScrollFailure => ({
    message: !(arc.r > 0)
      ? `${section}: ${key} needs a radius.`
      : `${section}: ${key} has to sweep on from where the last part ended, by up to a full turn.`,
    unsolved, circles: [], segments: [],
  });
  let badLength = (section: string, key: ScrollKey, unsolved: ScrollKey[]): ScrollFailure => ({
    message: `${section}: ${key} needs a length, or 0.`,
    unsolved, circles: [], segments: [],
  });
  let after = (keys: ScrollKey[], key: ScrollKey): ScrollKey[] => keys.slice(keys.indexOf(key));

  let failures: ScrollFailure[] = [];

  solveSection(failures, 'Volute', ALL_KEYS, () => {
    if (!(v.eyeRadius > 0))
      return { message: 'Volute: the eye needs a radius.', unsolved: ALL_KEYS, circles: [], segments: [] };
    if (!Number.isFinite(v.eyeX) || !Number.isFinite(v.eyeY))
      return { message: 'Volute: the eye needs a position.', unsolved: ALL_KEYS, circles: [], segments: [] };
    let arcs = drawn(v);
    if (!arcs)
      return {
        message: style.custom
          ? 'Volute: the four point needs every radius set, each at least the one inside it.'
          : v.style === 'archimedean' ? 'Volute: the Archimedean needs a pitch.'
          : v.style === 'kelly' ? "Volute: Kelly's needs a seed length."
          : `Volute: ${style.label} can't be drawn from this eye.`,
        unsolved: ALL_KEYS, circles: [], segments: [],
      };
    // the drawing is in the eye's own frame, so the eye's centre carries it into the scroll's
    v.spiral = arcs.map(a => ({ ...a, x: a.x + v.eyeX, y: a.y + v.eyeY }));
    return null;
  });
  if (!v.spiral) {
    reportFailures(failures, 'Scroll');
    return failures;
  }

  solveSection(failures, 'Back', BACK_KEYS, () => {
    // the back takes over where the spiral's outermost arc ends, heading straight up; S0 to S2
    // each run on tangent from where the last ended round to their own end angle
    let outer = v.spiral![0];
    let joint = pointOnCircle(outer, outer.to);

    if (!(v.S0.r > 0) || !(v.S0.to > 0) || v.S0.to > TWO_PI) return badArc('Back', 'S0', v.S0, after(BACK_KEYS, 'S0'));
    let S0 = placeCircleOnPointAtAngle(v.S0.r, joint, 0);
    v.S0.x = S0.x;
    v.S0.y = S0.y;
    v.S0.from = 0;
    joint = pointOnCircle(v.S0, v.S0.to);

    if (!(v.S1.r > 0) || !(v.S1.to > v.S0.to) || v.S1.to - v.S0.to > TWO_PI) return badArc('Back', 'S1', v.S1, after(BACK_KEYS, 'S1'));
    let S1 = placeCircleOnPointAtAngle(v.S1.r, joint, v.S0.to);
    v.S1.x = S1.x;
    v.S1.y = S1.y;
    v.S1.from = v.S0.to;
    joint = pointOnCircle(v.S1, v.S1.to);

    if (!(v.S2.r > 0) || !(v.S2.to > v.S1.to) || v.S2.to - v.S1.to > TWO_PI) return badArc('Back', 'S2', v.S2, after(BACK_KEYS, 'S2'));
    let S2 = placeCircleOnPointAtAngle(v.S2.r, joint, v.S1.to);
    v.S2.x = S2.x;
    v.S2.y = S2.y;
    v.S2.from = v.S1.to;
    joint = pointOnCircle(v.S2, v.S2.to);

    // the straight runs on along S2's heading
    if (!(v.backStraight >= 0)) return badLength('Back', 'backStraight', after(BACK_KEYS, 'backStraight'));
    let heading = vectorFromSlope(v.S2.to + Math.PI / 2);
    let foot = moveInVectorSpace(joint, [{ ...heading, mag: v.backStraight }]);
    if (v.backStraight > 0) v.backStraightLine = [joint, foot];

    // S3 turns the other way off the foot, clockwise about a centre on the far side, so as a
    // counterclockwise sweep it runs from the duck tail round to the foot
    let S3to = v.S2.to - Math.PI;
    if (!(v.S3.r > 0)) return badArc('Back', 'S3', v.S3, after(BACK_KEYS, 'S3'));
    if (!(v.S3.from < S3to) || S3to - v.S3.from > TWO_PI)
      return { message: "Back: S3 has to turn back from the straight's foot, by up to a full turn.", unsolved: after(BACK_KEYS, 'S3'), circles: [], segments: [] };
    let S3 = placeCircleOnPointAtAngle(v.S3.r, foot, S3to);
    v.S3.x = S3.x;
    v.S3.y = S3.y;
    v.S3.to = S3to;

    // from the duck tail a line runs square to the neck, forward to its back, the nape filleting
    // that corner
    let duckTail = pointOnCircle(v.S3, v.S3.from);
    let napeStart = neckBack - v.nape.r;
    if (!(v.nape.r > 0)) return badArc('Back', 'nape', v.nape, after(BACK_KEYS, 'square'));
    if (duckTail.x > napeStart)
      return {
        message: `Back: the duck tail sits too far forward for a nape of ${v.nape.r}mm to fit before the neck's back. Shrink the nape, or move the duck tail back with S3 or the straight.`,
        unsolved: after(BACK_KEYS, 'square'),
        circles: [{ x: napeStart, y: duckTail.y - v.nape.r, r: v.nape.r }],
        segments: [[duckTail, new Pt(neckBack, duckTail.y)]],
      };
    if (duckTail.x < napeStart) v.square = [duckTail, new Pt(napeStart, duckTail.y)];
    v.nape.x = napeStart;
    v.nape.y = duckTail.y - v.nape.r;
    v.nape.from = 0;
    v.nape.to = Math.PI / 2;
    return null;
  });

  solveSection(failures, 'Front', FRONT_KEYS, () => {
    // the front rises from the top of the nut on the neck's front: the flat straight up
    if (!(v.flat >= 0)) return badLength('Front', 'flat', after(FRONT_KEYS, 'flat'));
    let top = new Pt(nutTop.x, nutTop.y + v.flat);
    if (v.flat > 0) v.flatLine = [nutTop, top];

    // F0 turns toward the back to its end angle
    if (!(v.F0.r > 0) || !(v.F0.to > 0) || v.F0.to > TWO_PI) return badArc('Front', 'F0', v.F0, after(FRONT_KEYS, 'F0'));
    let F0 = placeCircleOnPointAtAngle(v.F0.r, top, 0);
    v.F0.x = F0.x;
    v.F0.y = F0.y;
    v.F0.from = 0;
    let joint = pointOnCircle(v.F0, v.F0.to);

    // the straight on along its heading
    if (!(v.frontStraight >= 0)) return badLength('Front', 'frontStraight', after(FRONT_KEYS, 'frontStraight'));
    let heading = vectorFromSlope(v.F0.to + Math.PI / 2);
    let foot = moveInVectorSpace(joint, [{ ...heading, mag: v.frontStraight }]);
    if (v.frontStraight > 0) v.frontStraightLine = [joint, foot];

    // F1 curves back toward the volute, clockwise about a centre on the far side, until it first
    // crosses a drawn arc of the spiral
    if (!(v.F1.r > 0)) return badArc('Front', 'F1', v.F1, after(FRONT_KEYS, 'F1'));
    let F1to = v.F0.to + Math.PI;
    let F1 = placeCircleOnPointAtAngle(v.F1.r, foot, F1to);
    let sweep = Infinity;
    for (let arc of v.spiral!) {
      for (let crossing of circleCircleIntersections(F1, arc)) {
        if (!angleWithinSweep(angleFromCenter(arc, crossing), arc.from, arc.to)) continue;
        let s = normalizeRadians(F1to - angleFromCenter(F1, crossing));
        if (s > 1e-9 && s < sweep) sweep = s;
      }
    }
    if (sweep === Infinity)
      return {
        message: "Front: F1 never meets the spiral. Enlarge F1, or aim the straight in under the volute with F0's end.",
        unsolved: after(FRONT_KEYS, 'F1'), circles: [F1], segments: [],
      };
    v.F1.x = F1.x;
    v.F1.y = F1.y;
    v.F1.from = F1to - sweep;
    v.F1.to = F1to;
    return null;
  });

  reportFailures(failures, 'Scroll');
  return failures;
}
