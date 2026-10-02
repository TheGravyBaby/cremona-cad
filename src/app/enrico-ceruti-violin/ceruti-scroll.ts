import { angleWithinSweep, dist, normalizeRadians } from '../helpers/math/simpleGeometry';
import { circleCircleIntersections } from '../helpers/math/draftMath';
import { Pt } from '../models/types';
import { EnricoCerutiParams, VoluteParams, VoluteStyle } from './ceruti-types';
import { standardNutLength } from './ceruti-neck';

// The scroll in its own side-view frame: the nut at the origin on the neck's front, up the neck +y,
// toward the back -x. The volute's spiral about the eye, then the back and front run off it, and
// the defaults for all of it. The volute panel edits the spiral and the crown (S0, S1), the scroll
// panel the rest of the back and the front; both draw through renders/scroll.render.ts.

// One arc of the spiral, swept counterclockwise from `from` to `to`.
export type VoluteArc = { center: Pt; r: number; from: number; to: number };

// what a style draws from: the eye, for the four point the arc radii and for the Archimedean its
// pitch
export type VoluteSpec = Pick<VoluteParams, 'style' | 'eyeRadius' | 'arcRadii' | 'pitch'>;

// A style draws its whole construction in the eye's own frame (origin at the eye's centre), arcs
// outermost first. Every spiral leaves the eye at its front, heading up, as Kelly's later drawings
// do; the older authors set the volute against a column and started at the top of the eye, so
// their figures are turned a quarter clockwise here. Counterclockwise is the way it winds outward,
// so an arc runs from its inner neighbour's end to its own end. Neighbours share that point
// (inner.to = outer.from) and are tangent there. Every style is drawn two full turns, `front` of
// its arcs from the eye, so the scroll's own arcs can always take over at the front heading
// straight up. `guides` is the figure the centres are found on, as polylines in the same frame,
// for the guides view. `custom` marks the four point. A historical figure is sized at its
// author's proportion to the eye, so the eye alone sets the whole spiral.
export interface VoluteStyleDef {
  label: string;
  custom?: boolean;
  front: number;
  arcs: (v: VoluteSpec) => VoluteArc[];
  guides: (v: VoluteSpec) => Pt[][];
}

// quarter turns from the eye's front out to the spiral's, where every style stops: two full turns
export const TO_FRONT = 8;

const QUARTER = Math.PI / 2;
const polar = (r: number, angle: number) => new Pt(r * Math.cos(angle), r * Math.sin(angle));
const square = (left: number, right: number, bottom: number, top: number) =>
  [new Pt(left, bottom), new Pt(right, bottom), new Pt(right, top), new Pt(left, top), new Pt(left, bottom)];

// a quarter turn about each centre in turn, from the eye's front, each radius the last's plus the
// step between their centres so the arcs run on tangent. Outermost first
const quarterTurns = (centers: Pt[], first: number): VoluteArc[] => {
  let r = first;
  return centers.map((center, i) => {
    if (i > 0) r += dist(centers[i - 1], center);
    const from = normalizeRadians(QUARTER * i);
    return { center, r, from, to: from + QUARTER };
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
const archimedeanArcs = (eyeRadius: number, pitch: number): VoluteArc[] => {
  const angle = (k: number) => k * Math.PI / 4;
  const radius = (k: number) => eyeRadius + pitch * k / 8;
  const points = Array.from({ length: EIGHTHS + 1 }, (_, k) => polar(radius(k), angle(k)));
  const heading = (k: number) => {
    const [r, g, t] = [radius(k), pitch / (2 * Math.PI), angle(k)];
    return Math.atan2(g * Math.sin(t) + r * Math.cos(t), g * Math.cos(t) - r * Math.sin(t));
  };
  const chord = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  const miss = (k: number) => normalizeRadians(heading(k) - chord + Math.PI) - Math.PI;
  let tangent = polar(1, chord + (miss(0) - miss(1)) / 2);
  const arcs: VoluteArc[] = [];
  for (let k = 0; k < EIGHTHS; k++) {
    const [p, q] = [points[k], points[k + 1]];
    const len = Math.hypot(tangent.x, tangent.y);
    const normal = new Pt(-tangent.y / len, tangent.x / len);
    const [dx, dy] = [q.x - p.x, q.y - p.y];
    const r = (dx * dx + dy * dy) / (2 * (dx * normal.x + dy * normal.y));
    const center = new Pt(p.x + r * normal.x, p.y + r * normal.y);
    const from = Math.atan2(p.y - center.y, p.x - center.x);
    const to = from + normalizeRadians(Math.atan2(q.y - center.y, q.x - center.x) - from);
    arcs.push({ center, r, from, to });
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
    const joints = centers.slice(0, n - 1).map((c, i) => Math.atan2(centers[i + 1].y - c.y, centers[i + 1].x - c.x));
    return centers.map((center, i) => {
      const from = i < n - 1 ? joints[i] : Math.atan2(-last.y, eyeRadius - last.x);
      const outerEnd = i > 0 ? joints[i - 1] : joints[0] + QUARTER;
      return { center, r: radii[i], from, to: from + normalizeRadians(outerEnd - from) };
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
// still tangent; radii run 7/6 of the eye's radius up to 51/6, reaching 9 radii out. Later than Cremona's golden age and printed in Germany, so
// the least likely of these to have been on a Cremonese bench.
const goldmann: VoluteStyleDef = {
  label: 'Goldmann (1696)',
  front: TO_FRONT,
  // round each square from its upper left corner, the first reaching the front of the eye
  arcs: ({ eyeRadius }) => quarterTurns([1, 2, 3].flatMap(k => {
    const [w, h] = [k * eyeRadius / 3, k * eyeRadius / 6];
    return [new Pt(-h, 0), new Pt(-h, -w), new Pt(h, -w), new Pt(h, 0)];
  }), 7 * eyeRadius / 6),
  guides: ({ eyeRadius }) => [
    [new Pt(-eyeRadius, 0), new Pt(eyeRadius, 0)],
    ...[1, 2, 3].map(k => square(-k * eyeRadius / 6, k * eyeRadius / 6, -k * eyeRadius / 3, 0)),
  ],
};

// Kelly (Kevin Kelly, Boston, 2011): a seed of four equal squares stacked in a column as tall as
// the eye's radius, centred on the eye with its middle line on the eye's vertical diameter. The
// first arc leaves the eye's front from the left end of the middle line, then the centres go round
// the two middle squares' outer corners, lower left, lower right, upper right, upper left, and the
// same round the seed's own corners. His ninth arc goes on past the front.
const kelly: VoluteStyleDef = {
  label: 'Kelly (2011)',
  front: TO_FRONT,
  arcs: ({ eyeRadius }) => {
    const s = eyeRadius / 4;
    const corners = [1, 2].flatMap(t => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new Pt(x * s / 2, y * t * s)));
    return quarterTurns([new Pt(-s / 2, 0), ...corners], 9 * eyeRadius / 8);
  },
  guides: v => {
    const s = v.eyeRadius / 4;
    const reach = Math.max(v.eyeRadius, ...kelly.arcs(v).slice(1).map(a => dist(new Pt(0, 0), a.center) + a.r));
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
    const [last, grow, joint] = [centers[i], r - arcRadii[i], QUARTER * (i + 1)];
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
      return { center, r: arcRadii[i], from, to: from + QUARTER };
    }).reverse();
  },
  guides: ({ eyeRadius, arcRadii }) => [arcRadii.length ? fourPointCentres(eyeRadius, arcRadii) : []],
};

// the even growth the four point's fields start from: the centres going round a square as large as
// the eye holds, one side on its horizontal diameter and its far corners on its edge, the first arc
// from the front of the eye back to the first corner and each after it a side longer. Rounded to the
// hundredth like the fields
export const naturalArcRadii = (eyeRadius: number, count: number): number[] => {
  const side = 2 * eyeRadius / Math.sqrt(5);
  return Array.from({ length: count }, (_, i) => Math.round((eyeRadius + side / 2 + i * side) * 100) / 100);
};

export const VOLUTE_STYLES: Record<VoluteStyle, VoluteStyleDef> = {
  fourPoint, archimedean, serlio, salviati, goldmann, kelly,
};

export interface PlacedVolute {
  spiral: VoluteArc[];
  guides: Pt[][];
}

// the style's figure out to the front, the outermost arc rolled back or on to end there exactly
// about its own centre, heading straight up. Salviati's ring changes and the Archimedean's points
// only come close to it on their own
function drawn(v: VoluteSpec): VoluteArc[] | null {
  if (!(v.eyeRadius > 0)) return null;
  const { front, arcs: figure } = VOLUTE_STYLES[v.style];
  const arcs = figure(v);
  if (arcs.length < front) return null;
  const [outer, ...rest] = arcs.slice(-front);
  return [{ ...outer, to: Math.round(outer.to / (2 * Math.PI)) * 2 * Math.PI }, ...rest];
}

// the furthest an arc reaches toward the front
function frontmost({ center, r, from, to }: VoluteArc): number {
  const passesFront = Math.floor(to / (2 * Math.PI)) > Math.floor(from / (2 * Math.PI));
  return passesFront ? center.x + r : center.x + r * Math.max(Math.cos(from), Math.cos(to));
}

// the eye's x that brings the spiral's front flush with the neck's front, x = 0. In the scroll's
// frame: the nut at the origin, up the neck +y, toward the back -x
export function flushVolute(v: VoluteSpec): number | null {
  const arcs = drawn(v);
  return arcs ? -Math.max(...arcs.map(frontmost)) : null;
}

// every style goes through the same steps about the eye, wherever it has been put in the scroll's frame
export function layoutVolute(v: VoluteSpec, eye: Pt): PlacedVolute | null {
  if (!Number.isFinite(eye.x) || !Number.isFinite(eye.y)) return null;
  const arcs = drawn(v);
  if (!arcs) return null;

  // the drawing is in the eye's own frame, so the eye's centre carries it into the scroll's
  const place = (p: Pt) => new Pt(eye.x + p.x, eye.y + p.y);
  return {
    spiral: arcs.map(a => ({ ...a, center: place(a.center) })),
    guides: VOLUTE_STYLES[v.style].guides(v).map(line => line.map(place)),
  };
}

// S0 and S1, the crown over the top of the scroll, are edited with the volute; the rest of the
// back from S2 on with the front
export const CROWN_ARCS = 2;

export interface PlacedBack {
  arcs: VoluteArc[];
  straight: [Pt, Pt] | null;
  square: [Pt, Pt] | null;
  nape: VoluteArc | null;
}

// the back takes over at the spiral's front, where its outermost arc ends heading straight up, S0
// to S2 each on tangent from where the last ended round to its own end angle. The straight runs on
// along S2's heading, and S3 turns the other way off its end, clockwise about a centre on the far
// side, to the duck tail. From there a line runs square to the neck, forward to its back at
// `neckBack`, the nape filleting that corner. Whatever isn't a positive radius, a forward sweep of
// up to a full turn, or a length, or a duck tail too near the neck for the nape, ends the run there
export function layoutBack(spiral: VoluteArc[], { back, straight, hollow, nape }: Pick<VoluteParams, 'back' | 'straight' | 'hollow' | 'nape'>, neckBack: number): PlacedBack {
  const placed: PlacedBack = { arcs: [], straight: null, square: null, nape: null };
  if (!spiral.length) return placed;
  const { center, r } = spiral[0];
  let joint = new Pt(center.x + r, center.y);
  let from = 0;
  for (const { r, end } of back) {
    if (!(r > 0) || !(end > from) || end - from > 2 * Math.PI) return placed;
    const c = new Pt(joint.x - r * Math.cos(from), joint.y - r * Math.sin(from));
    placed.arcs.push({ center: c, r, from, to: end });
    joint = new Pt(c.x + r * Math.cos(end), c.y + r * Math.sin(end));
    from = end;
  }

  if (!(straight >= 0)) return placed;
  const foot = new Pt(joint.x - straight * Math.sin(from), joint.y + straight * Math.cos(from));
  if (straight > 0) placed.straight = [joint, foot];

  const start = from - Math.PI;
  if (!(hollow.r > 0) || !(hollow.end < start) || start - hollow.end > 2 * Math.PI) return placed;
  const c = new Pt(foot.x + hollow.r * Math.cos(from), foot.y + hollow.r * Math.sin(from));
  placed.arcs.push({ center: c, r: hollow.r, from: hollow.end, to: start });

  const duckTail = new Pt(c.x + hollow.r * Math.cos(hollow.end), c.y + hollow.r * Math.sin(hollow.end));
  const napeStart = neckBack - nape;
  if (!(nape > 0) || !(duckTail.x <= napeStart)) return placed;
  if (duckTail.x < napeStart) placed.square = [duckTail, new Pt(napeStart, duckTail.y)];
  placed.nape = { center: new Pt(napeStart, duckTail.y - nape), r: nape, from: 0, to: Math.PI / 2 };
  return placed;
}

export interface PlacedFront {
  flat: [Pt, Pt] | null;
  arcs: VoluteArc[];
  straight: [Pt, Pt] | null;
}

// the front rises from `start`, the top of the nut on the neck's front: the flat straight up, F0
// turning toward the back to its end angle, the straight on along its heading, and F1 curving back
// toward the volute, clockwise about a centre on the far side, until it first crosses a drawn arc
// of the spiral. Whatever isn't a length, a positive radius or a forward sweep of up to a full
// turn, or an F1 that never reaches the spiral, ends the run there
export function layoutFront(spiral: VoluteArc[], { flat, f0, straight, f1 }: VoluteParams['front'], start: Pt): PlacedFront {
  const placed: PlacedFront = { flat: null, arcs: [], straight: null };
  if (!(flat >= 0)) return placed;
  const top = new Pt(start.x, start.y + flat);
  if (flat > 0) placed.flat = [start, top];

  if (!(f0.r > 0) || !(f0.end > 0) || f0.end > 2 * Math.PI) return placed;
  const c0 = new Pt(top.x - f0.r, top.y);
  placed.arcs.push({ center: c0, r: f0.r, from: 0, to: f0.end });
  const joint = new Pt(c0.x + f0.r * Math.cos(f0.end), c0.y + f0.r * Math.sin(f0.end));

  if (!(straight >= 0)) return placed;
  const foot = new Pt(joint.x - straight * Math.sin(f0.end), joint.y + straight * Math.cos(f0.end));
  if (straight > 0) placed.straight = [joint, foot];

  if (!(f1.r > 0)) return placed;
  const c1 = new Pt(foot.x + f1.r * Math.cos(f0.end), foot.y + f1.r * Math.sin(f0.end));
  const from = f0.end + Math.PI;
  let sweep = Infinity;
  for (const a of spiral) {
    for (const q of circleCircleIntersections({ ...c1, r: f1.r }, { ...a.center, r: a.r })) {
      if (!angleWithinSweep(Math.atan2(q.y - a.center.y, q.x - a.center.x), a.from, a.to)) continue;
      const s = normalizeRadians(from - Math.atan2(q.y - c1.y, q.x - c1.x));
      if (s > 1e-9 && s < sweep) sweep = s;
    }
  }
  if (sweep < Infinity) placed.arcs.push({ center: c1, r: f1.r, from: from - sweep, to: from });
  return placed;
}

// about the Salviati's own opening, its front as far out
export const defaultPitch = (eyeRadius: number) => Math.round(1.9 * eyeRadius * 10) / 10;

// a Salviati as wide as the one that fitted the Betts scroll, on a 2.6 mm eye 96 mm up from the
// nut; everything defaults from there
export function defaultVoluteParams(p: EnricoCerutiParams): VoluteParams {
  const k = p.height / 355;
  const eyeRadius = Math.round(2.6 * k * 10) / 10;
  const v = { style: 'salviati' as const, eyeRadius, arcRadii: [], pitch: defaultPitch(eyeRadius) };
  const [eyeX, eyeY] = [Math.round((flushVolute(v) ?? 0) * 100) / 100, Math.round(96 * k * 10) / 10];
  const front = defaultFront(v, new Pt(eyeX, eyeY), standardNutLength(p.height));
  return { ...v, ...defaultBack(v), front, flushWithNeck: true, eyeX, eyeY };
}

// the front in proportion to the rise from the top of the nut to the bottom of the spiral, which
// it has to climb: F0 turning back by a twelfth of a turn leaves the straight aimed in under the
// volute for F1 to meet it
function defaultFront(v: VoluteSpec, eye: Pt, nutLength: number): VoluteParams['front'] {
  const spiral = layoutVolute(v, eye)?.spiral ?? [];
  const rise = Math.min(...spiral.map(a => a.center.y - a.r)) - nutLength;
  const r = (k: number) => Number.isFinite(rise) ? Math.round(k * rise * 10) / 10 : 0;
  return { flat: r(0.45), f0: { r: r(0.4), end: Math.PI / 6 }, straight: r(0.3), f1: { r: r(0.15) } };
}

// the back in proportion to the spiral's outermost arc, widest at the front and tightening over
// the back, a quarter turn each up to the top and over to the back, then an eighth on down. S3
// brings the back round to run straight down, parallel to the neck
function defaultBack(v: VoluteSpec): Pick<VoluteParams, 'back' | 'straight' | 'hollow' | 'nape'> {
  const outer = layoutVolute(v, new Pt(0, 0))?.spiral[0].r ?? 0;
  const r = (k: number) => Math.round(k * outer * 10) / 10;
  return {
    back: [{ r: r(1.4), end: Math.PI / 2 }, { r: r(1.2), end: Math.PI }, { r: r(1), end: 5 * Math.PI / 4 }],
    straight: r(0.5),
    hollow: { r: r(1), end: 0 },
    nape: r(0.3),
  };
}

// writes the flush Eye X into its field, to the hundredth, every pass flush is on, so turning it
// off leaves the eye where it was
export function flushEye(v: VoluteParams): void {
  const eyeX = v.flushWithNeck ? flushVolute(v) : null;
  if (eyeX !== null) v.eyeX = Math.round(eyeX * 100) / 100;
}

// what either scroll panel draws from: the volute's defaults the first time, the four point's
// fields from the even growth once (the user's after), and the flush eye's X
export function ensureVolute(p: EnricoCerutiParams): VoluteParams {
  p.volute ??= defaultVoluteParams(p);
  if (VOLUTE_STYLES[p.volute.style].custom && !p.volute.arcRadii.length) p.volute.arcRadii = naturalArcRadii(p.volute.eyeRadius, TO_FRONT);
  flushEye(p.volute);
  return p.volute;
}
