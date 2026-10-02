import { dist, normalizeRadians } from '../../../helpers/math/simpleGeometry';
import { Pt } from '../../../models/types';
import { VoluteParams, VoluteStyle } from '../../ceruti-types';

// One arc of the spiral, swept counterclockwise from `from` to `to`.
export type VoluteArc = { center: Pt; r: number; from: number; to: number };

// what a style draws from: the eye, the seed figure's size, for the four point the arc radii and
// for the Archimedean its pitch
export type VoluteSpec = Pick<VoluteParams, 'style' | 'eyeRadius' | 'arcRadii' | 'pitch' | 'seed'>;

// A style draws its whole construction in the eye's own frame (origin at the eye's centre), arcs
// outermost first, in the orientation its author drew it: the older authors set the volute against
// a column and started the spiral at the top of the eye, on the vertical through its centre, so
// that is where the innermost arc leaves the eye, heading left, and the four point follows suit;
// Kelly's later drawings start it a quarter turn earlier, at the eye's front. Counterclockwise is
// the way it winds outward, so an arc runs from its inner neighbour's end to its own end.
// Neighbours share that point (inner.to = outer.from) and are tangent there. Every style is drawn
// out to the front, `front` of its arcs from the eye, so the scroll's own
// arcs can always take over there heading straight up. `guides` is the figure the centres are found on, as
// polylines in the same frame, for the guides view. `custom` marks the four point. `seed` is for a
// style whose centres are found on a figure: what the user's `seed` measures on it, and its size
// at its author's proportion to the eye. The spiral still leaves the eye where its author had it,
// so the eye sets where it starts and the seed how it opens.
export interface VoluteStyleDef {
  label: string;
  custom?: boolean;
  seed?: { natural: (eyeRadius: number) => number; title: string };
  front: number;
  arcs: (v: VoluteSpec) => VoluteArc[];
  guides: (v: VoluteSpec) => Pt[][];
}

// quarter turns from the top of the eye out to the front, where every style stops: a turn and
// three quarters
export const TO_FRONT = 7;

const polar = (r: number, angle: number) => new Pt(r * Math.cos(angle), r * Math.sin(angle));
const square = (left: number, right: number, bottom: number, top: number) =>
  [new Pt(left, bottom), new Pt(right, bottom), new Pt(right, top), new Pt(left, top), new Pt(left, bottom)];

// semicircles about centres on the eye's vertical diameter, bulging to alternate sides: each row
// is how far up that line the centre sits and the radius, outermost first. Each is drawn as two
// quarters about the same centre, so the spiral can stop at its front
const semicircles = (rows: [center: number, radius: number][]) => rows.flatMap(([center, r], i) => {
  const from = (rows.length - 1 - i) % 2 === 0 ? Math.PI / 2 : 3 * Math.PI / 2;
  const c = new Pt(0, center);
  return [{ center: c, r, from: from + Math.PI / 2, to: from + Math.PI }, { center: c, r, from, to: from + Math.PI / 2 }];
});
const axis = ({ eyeRadius }: VoluteSpec) => [[new Pt(0, -eyeRadius), new Pt(0, eyeRadius)]];

// Serlio (1537): the line of centres, his eye's own diameter, is cut in sixths, and each radius is
// the last less the distance between the two centres, so the turns close up toward the eye. The
// innermost reaches the top of the eye from the centre just below its middle.
const serlio: VoluteStyleDef = {
  label: 'Serlio (1537)',
  front: TO_FRONT,
  seed: { natural: r => 2 * r, title: "Length of the line of centres, cut in sixths; Serlio made it the eye's diameter" },
  arcs: ({ eyeRadius, seed }) => {
    if (!(seed > 0)) return [];
    const centres = [-1, 1, -2, 2, -3, 3].map(k => k * seed / 6);
    const radii = [eyeRadius - centres[0]];
    centres.slice(1).forEach((c, i) => radii.push(radii[i] + Math.abs(c - centres[i])));
    return semicircles(centres.map((c, i): [number, number] => [c, radii[i]]).reverse());
  },
  guides: ({ seed }) => seed > 0 ? [[new Pt(0, -seed / 2), new Pt(0, seed / 2)]] : [],
};

// A curve set out by points an eighth of a turn apart, from the top of the eye: `radius(k)` is how
// far out the kth point is, `growth(k)` how fast the radius grows there per radian. The compass
// can't follow a curve, so each arc is the circle through the next point tangent to the last. An
// arc's direction misses the curve's by an amount that flips sign at each joint on, so the first is
// the one that misses equally at both its ends: seeded with the curve's exact direction at the eye
// instead, the arcs alternate a little flat and a little round the whole way out. Outermost first
const eighthsThrough = (n: number, radius: (k: number) => number, growth: (k: number) => number): VoluteArc[] => {
  const angle = (k: number) => Math.PI / 2 + k * Math.PI / 4;
  const points = Array.from({ length: n + 1 }, (_, k) => polar(radius(k), angle(k)));
  const heading = (k: number) => {
    const [r, g, t] = [radius(k), growth(k), angle(k)];
    return Math.atan2(g * Math.sin(t) + r * Math.cos(t), g * Math.cos(t) - r * Math.sin(t));
  };
  const chord = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  const miss = (k: number) => normalizeRadians(heading(k) - chord + Math.PI) - Math.PI;
  let tangent = polar(1, chord + (miss(0) - miss(1)) / 2);
  const arcs: VoluteArc[] = [];
  for (let k = 0; k < n; k++) {
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

// rays from the eye's centre to the outermost drawn point on each of the eight lines, or the
// first point on a line the spiral hasn't reached yet
const eighthRays = (arcs: number, radius: (k: number) => number) =>
  Array.from({ length: 8 }, (_, ray) => {
    const k = arcs - ((arcs - ray) % 8 + 8) % 8;
    return [new Pt(0, 0), polar(radius(Math.max(k, ray)), Math.PI / 2 + ray * Math.PI / 4)];
  });

// Philandrier (1544), after Dürer: set out by points, not centres. On a right triangle 3½ units
// wide and 4½ tall with the eye at its right angle, the arc about the far vertex from the eye's
// top to the hypotenuse is cut into 24, and each cut projected from that vertex back onto the tall
// side is the next radius, an eighth of a turn on: r = 3.5·tan(β + k(γ−β)/24) in eye diameters,
// from the eye's edge to 4½ out after three turns. He leaves the arcs between the points to the
// compass.
const philandrierCurve = (eyeRadius: number) => {
  const d = 2 * eyeRadius;
  const [beta, gamma] = [Math.atan2(0.5, 3.5), Math.atan2(4.5, 3.5)];
  const step = (gamma - beta) / 24;
  return {
    radius: (k: number) => 3.5 * d * Math.tan(beta + k * step),
    growth: (k: number) => 3.5 * d * step * 4 / Math.PI / Math.cos(beta + k * step) ** 2,
  };
};
const philandrier: VoluteStyleDef = {
  label: 'Philandrier (1544)',
  front: 2 * TO_FRONT,
  arcs: ({ eyeRadius }) => {
    const { radius, growth } = philandrierCurve(eyeRadius);
    return eighthsThrough(24, radius, growth);
  },
  guides: ({ eyeRadius }) => eighthRays(2 * TO_FRONT, philandrierCurve(eyeRadius).radius),
};

// Archimedes (On Spirals, c. 225 BC): the radius grows evenly with the angle, by `pitch` every
// turn, from the eye's edge at its top, so the turns stand an even pitch apart all the way out.
// Not a volute method, but the plain spiral the others are measured against, so listed first.
const archimedean: VoluteStyleDef = {
  label: 'Archimedes (c. 225 BC)',
  front: 2 * TO_FRONT,
  arcs: ({ eyeRadius, pitch }) => {
    if (!(pitch > 0)) return [];
    return eighthsThrough(2 * TO_FRONT, k => eyeRadius + pitch * k / 8, () => pitch / (2 * Math.PI));
  },
  guides: ({ eyeRadius, pitch }) => pitch > 0 ? eighthRays(2 * TO_FRONT, k => eyeRadius + pitch * k / 8) : [],
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
  seed: { natural: r => r, title: "Side of the outer of the three nested squares the centres sit on; Salviati made it the eye's radius" },
  arcs: ({ eyeRadius, seed }) => {
    if (!(seed > 0)) return [];
    const g = seed * Math.SQRT2 / 6;
    const n = 12;
    const centers = Array.from({ length: n }, (_, i) => polar((3 - Math.floor(i / 4)) * g, 3 * Math.PI / 4 - i * Math.PI / 2));

    // the innermost arc leaves the top of the eye, so it runs a little over a quarter
    const radii = new Array<number>(n);
    const last = centers[n - 1];
    radii[n - 1] = Math.hypot(last.x, eyeRadius - last.y);
    for (let i = n - 2; i >= 0; i--) radii[i] = radii[i + 1] + dist(centers[i], centers[i + 1]);

    // joints[i] is where arc i meets the arc inside it, along the line between their centres
    const joints = centers.slice(0, n - 1).map((c, i) => Math.atan2(centers[i + 1].y - c.y, centers[i + 1].x - c.x));
    return centers.map((center, i) => {
      const from = i < n - 1 ? joints[i] : Math.atan2(eyeRadius - last.y, -last.x);
      const outerEnd = i > 0 ? joints[i - 1] : joints[0] + Math.PI / 2;
      return { center, r: radii[i], from, to: from + normalizeRadians(outerEnd - from) };
    });
  },
  guides: ({ eyeRadius, seed }) => {
    const h = seed / 2;
    if (!(h > 0)) return [];
    return [
      [0, 1, 2, 3, 4].map(i => polar(eyeRadius, i * Math.PI / 2)),
      square(-h, h, -h, h),
      [new Pt(-h, -h), new Pt(h, h)],
      [new Pt(-h, h), new Pt(h, -h)],
    ];
  },
};

// Goldmann (written c. 1662, printed 1696): Salviati's three squares again, the largest's side his
// eye's radius and the others 1/3 and 2/3 of it, but sharing a side along the eye's diameter and centred on it rather
// than nested about the eye's centre. That lines every ring change up with the joint, so all
// twelve arcs are exact quarter circles and still tangent; radii run 7/6 of the eye's radius
// up to 51/6, reaching 9 radii out. Later than Cremona's golden age and printed in Germany, so
// the least likely of these to have been on a Cremonese bench.
const goldmann: VoluteStyleDef = {
  label: 'Goldmann (1696)',
  front: TO_FRONT,
  seed: { natural: r => r, title: "Side of the largest of the three squares the centres sit on; Goldmann made it the eye's radius" },
  arcs: ({ eyeRadius, seed }) => {
    if (!(seed > 0)) return [];
    const centers = [1, 2, 3].flatMap(k => square(0, k * seed / 3, -k * seed / 6, k * seed / 6).slice(0, 4));
    // the innermost reaches the top of the eye from the smallest square's lower left corner
    const radii = [eyeRadius + seed / 6];
    for (let i = 1; i < 12; i++) radii.push(radii[i - 1] + dist(centers[i - 1], centers[i]));
    return centers.map((center, i) => {
      const from = normalizeRadians(Math.PI / 2 * (i + 1));
      return { center, r: radii[i], from, to: from + Math.PI / 2 };
    }).reverse();
  },
  guides: v => v.seed > 0 ? [
    ...axis(v),
    ...[1, 2, 3].map(k => square(0, k * v.seed / 3, -k * v.seed / 6, k * v.seed / 6)),
  ] : [],
};

// Kelly (Kevin Kelly, Boston, as he now draws it): a seed of four equal squares stacked in a
// column, centred on the eye with its middle line on the eye's vertical diameter, its size its own
// (`seed`, the column's height). The first arc leaves the eye's front from the left end of the middle
// line, then the centres go round the two middle squares' outer corners, lower left, lower right,
// upper right, upper left, and the same round the seed's own corners. Every arc is a quarter turn,
// its radius the last's plus the step between their centres, so they run on tangent. His ninth arc
// goes on past the front; two full turns are drawn.
const kellyCentres = (side: number) => [new Pt(-side / 2, 0), ...[1, 2].flatMap(t =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new Pt(x * side / 2, y * t * side)))];
const kelly: VoluteStyleDef = {
  label: 'Kelly',
  front: TO_FRONT + 1,
  seed: { natural: r => r, title: "Height of the column of four squares the arcs are struck from; the eye's radius in his drawing" },
  arcs: ({ eyeRadius, seed }) => {
    if (!(seed > 0)) return [];
    const centers = kellyCentres(seed / 4);
    const radii = [eyeRadius + seed / 8];
    for (let i = 1; i < centers.length; i++) radii.push(radii[i - 1] + dist(centers[i - 1], centers[i]));
    return centers.map((center, i) => {
      const from = normalizeRadians(Math.PI / 2 * i);
      return { center, r: radii[i], from, to: from + Math.PI / 2 };
    }).reverse();
  },
  guides: v => {
    const s = v.seed / 4;
    if (!(s > 0)) return [];
    const reach = Math.max(v.eyeRadius, ...kelly.arcs(v).slice(1).map(a => dist(new Pt(0, 0), a.center) + a.r));
    return [
      [...square(-s / 2, s / 2, -2 * s, 2 * s)],
      ...[-1, 0, 1].map(k => [new Pt(-s / 2, k * s), new Pt(s / 2, k * s)]),
      [new Pt(0, -reach), new Pt(0, reach)],
      [new Pt(-reach, 0), new Pt(reach, 0)],
    ];
  },
};

// Four point: the spiral drawn about the corners of a square inside the eye, every arc an exact
// quarter turn. It leaves the top of the eye heading left like the rest, so the first centre sits
// straight below that point, the first radius down, and the first arc runs on tangent to the eye;
// a centre on the eye's edge would kink it off the eye instead. Each centre steps back from the
// last joint by the growth, which keeps the joint on the line between the two and the arcs
// tangent; an arc no wider than the last carries on about the same centre. The radii are the
// user's, since old scrolls rarely open evenly.
const QUARTER = Math.PI / 2;
const fourPointCentres = (eyeRadius: number, arcRadii: number[]) => {
  const centers = [new Pt(0, eyeRadius - arcRadii[0])];
  arcRadii.slice(1).forEach((r, i) => {
    const [last, grow, joint] = [centers[i], r - arcRadii[i], QUARTER * (i + 2)];
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
      const from = normalizeRadians(QUARTER * (i + 1));
      return { center, r: arcRadii[i], from, to: from + QUARTER };
    }).reverse();
  },
  guides: ({ eyeRadius, arcRadii }) => [arcRadii.length ? fourPointCentres(eyeRadius, arcRadii) : []],
};

// the even growth the four point's fields start from: the centres going round a square as large as
// the eye holds, one side on its vertical diameter and its far corners on its edge, the first arc
// from the top of the eye down to the first corner and each after it a side longer. Rounded to the
// hundredth like the fields
export const naturalArcRadii = (eyeRadius: number, count: number): number[] => {
  const side = 2 * eyeRadius / Math.sqrt(5);
  return Array.from({ length: count }, (_, i) => Math.round((eyeRadius + side / 2 + i * side) * 100) / 100);
};

export const VOLUTE_STYLES: Record<VoluteStyle, VoluteStyleDef> = {
  archimedean, serlio, philandrier, salviati, goldmann, kelly, fourPoint,
};

export interface PlacedVolute {
  spiral: VoluteArc[];
  guides: Pt[][];
}

// the style's figure out to the front, the outermost arc rolled back or on to end there exactly
// about its own centre, heading straight up. The curves set out by points only come close to it on
// their own
function drawn(v: VoluteSpec): VoluteArc[] | null {
  const { front } = VOLUTE_STYLES[v.style];
  if (!(v.eyeRadius > 0)) return null;
  const arcs = VOLUTE_STYLES[v.style].arcs(v);
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
