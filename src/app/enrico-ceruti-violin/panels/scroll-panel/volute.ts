import { dist, normalizeRadians } from '../../../helpers/math/simpleGeometry';
import { Pt } from '../../../models/types';
import { VoluteParams, VoluteStyle } from '../../ceruti-types';

// One arc of the spiral, swept counterclockwise from `from` to `to`.
export type VoluteArc = { center: Pt; r: number; from: number; to: number };

// what a style draws from: the eye, and for the four point style the arc radii
export type VoluteSpec = Pick<VoluteParams, 'style' | 'eyeRadius' | 'arcRadii'>;

// A style draws the whole construction in the eye's own frame (origin at the eye's centre), arcs
// outermost first, in the orientation its author drew it: every one of them set the volute
// against a column and started the spiral at the top of the eye, on the vertical through its
// centre, so that is where the innermost arc leaves the eye, heading left, and the four point
// spiral follows suit. Counterclockwise is the way it winds outward, so an arc runs from its
// inner neighbour's end to its own end. Neighbours share that point (inner.to = outer.from) and
// are tangent there. layoutVolute cuts the spiral where it last reaches its front heading up, a
// quarter turn short of the historical authors' end at the top, and the crown takes over there;
// the four point is drawn only that far to begin with. `guides` is the figure the centres are
// found on, as polylines in the same frame, for the guides view.
export interface VoluteStyleDef {
  label: string;
  arcs: (v: VoluteSpec) => VoluteArc[];
  guides: (v: VoluteSpec) => Pt[][];
}

const polar = (r: number, angle: number) => new Pt(r * Math.cos(angle), r * Math.sin(angle));
const square = (left: number, right: number, bottom: number, top: number) =>
  [new Pt(left, bottom), new Pt(right, bottom), new Pt(right, top), new Pt(left, top), new Pt(left, bottom)];

// semicircles about centres on the eye's vertical diameter, bulging to alternate sides: each row
// is how far up that line the centre sits and the radius, in eye diameters, outermost first
const semicircles = (rows: readonly [center: number, radius: number][]) => ({ eyeRadius }: VoluteSpec) => {
  const d = 2 * eyeRadius;
  return rows.map(([center, radius], i) => {
    const from = (rows.length - 1 - i) % 2 === 0 ? Math.PI / 2 : 3 * Math.PI / 2;
    return { center: new Pt(0, center * d), r: radius * d, from, to: from + Math.PI };
  });
};
const axis = ({ eyeRadius }: VoluteSpec) => [[new Pt(0, -eyeRadius), new Pt(0, eyeRadius)]];

// Alberti (1452, printed 1485): two turns of semicircles about the two ends of the eye's
// diameter, each a diameter shorter than the last, so the turns keep an even spacing.
const alberti: VoluteStyleDef = {
  label: 'Alberti (1485)',
  arcs: semicircles([[1 / 2, 4], [-1 / 2, 3], [1 / 2, 2], [-1 / 2, 1]]),
  guides: axis,
};

// Serlio (1537): the line of centres is the eye's own diameter cut in sixths, and each radius is
// the last less the distance between the two centres, so the turns close up toward the eye.
const serlio: VoluteStyleDef = {
  label: 'Serlio (1537)',
  arcs: semicircles([[3 / 6, 4], [-3 / 6, 3], [2 / 6, 13 / 6], [-2 / 6, 3 / 2], [1 / 6, 1], [-1 / 6, 2 / 3]]),
  guides: axis,
};

// Philandrier (1544), after Dürer: set out by points, not centres. On a right triangle 3½ units
// wide and 4½ tall with the eye at its right angle, the arc about the far vertex from the eye's
// top to the hypotenuse is cut into 24, and each cut projected from that vertex back onto the tall
// side is the next radius, an eighth of a turn on: r = 3.5·tan(β + k(γ−β)/24) in eye diameters,
// from the eye's edge to 4½ out after three turns. He leaves the arcs between the points to the
// compass, so each one here is the circle through the next point tangent to the last. An arc's
// direction misses the curve's by an amount that flips sign at each joint on, so the first is the
// one that misses equally at both its ends: seeded with the curve's exact direction at the eye
// instead, the arcs alternate a little flat and a little round the whole way out.
const philandrier: VoluteStyleDef = {
  label: 'Philandrier (1544)',
  arcs: ({ eyeRadius }) => {
    const d = 2 * eyeRadius;
    const [beta, gamma] = [Math.atan2(0.5, 3.5), Math.atan2(4.5, 3.5)];
    const step = (gamma - beta) / 24;
    const radius = (k: number) => 3.5 * d * Math.tan(beta + k * step);
    const points = Array.from({ length: 25 }, (_, k) => polar(radius(k), Math.PI / 2 + k * Math.PI / 4));

    const heading = (k: number) => {
      const [r, t] = [radius(k), Math.PI / 2 + k * Math.PI / 4];
      const growth = 3.5 * d * step * 4 / Math.PI / Math.cos(beta + k * step) ** 2;
      return Math.atan2(growth * Math.sin(t) + r * Math.cos(t), growth * Math.cos(t) - r * Math.sin(t));
    };
    const chord = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
    const miss = (k: number) => normalizeRadians(heading(k) - chord + Math.PI) - Math.PI;
    let tangent = polar(1, chord + (miss(0) - miss(1)) / 2);
    const arcs: VoluteArc[] = [];
    for (let k = 0; k < 24; k++) {
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
  },
  guides: ({ eyeRadius }) => {
    const d = 2 * eyeRadius;
    const [beta, gamma] = [Math.atan2(0.5, 3.5), Math.atan2(4.5, 3.5)];
    const reach = (k: number) => 3.5 * d * Math.tan(beta + k * (gamma - beta) / 24);
    return Array.from({ length: 8 }, (_, ray) => [new Pt(0, 0), polar(reach(ray === 0 ? 24 : ray + 16), Math.PI / 2 + ray * Math.PI / 4)]);
  },
};

// Salviati (1552): twelve quarter-circle arcs, their centres round the corners of three nested
// squares 3, 2 and 1 sixths of the way out along the eye's diagonal (the outer square being the
// eye's inscribed square turned to its edge midpoints). Each radius is the next one in plus the
// distance between their centres, so a quarter turn steps in by 1/2, 1/3 and 1/6 of an eye diameter
// on the three rings. Where one ring meets the next the centres are not a quarter turn apart, so
// the two arcs there run a little long and a little short to stay tangent. Vignola (1562),
// Palladio (1570) and Scamozzi (1615) reprint these same centres.
const salviati: VoluteStyleDef = {
  label: 'Salviati (1552)',
  arcs: ({ eyeRadius }) => {
    const g = eyeRadius * Math.SQRT2 / 6;
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
  guides: ({ eyeRadius }) => {
    const h = eyeRadius / 2;
    return [
      [0, 1, 2, 3, 4].map(i => polar(eyeRadius, i * Math.PI / 2)),
      square(-h, h, -h, h),
      [new Pt(-h, -h), new Pt(h, h)],
      [new Pt(-h, h), new Pt(h, -h)],
    ];
  },
};

// Goldmann (written c. 1662, printed 1696): Salviati's three squares again, sides 1/3, 2/3 and
// 1 of the eye's radius, but sharing a side along the eye's diameter and centred on it rather
// than nested about the eye's centre. That lines every ring change up with the joint, so all
// twelve arcs are exact quarter circles and still tangent; radii run 7/6 of the eye's radius
// up to 51/6, reaching 9 radii out. Later than Cremona's golden age and printed in Germany, so
// the least likely of these to have been on a Cremonese bench.
const goldmann: VoluteStyleDef = {
  label: 'Goldmann (1696)',
  arcs: ({ eyeRadius }) => {
    const centers = [1, 2, 3].flatMap(k => square(0, k * eyeRadius / 3, -k * eyeRadius / 6, k * eyeRadius / 6).slice(0, 4));
    const radii = [7 * eyeRadius / 6];
    for (let i = 1; i < 12; i++) radii.push(radii[i - 1] + dist(centers[i - 1], centers[i]));
    return centers.map((center, i) => {
      const from = normalizeRadians(Math.PI / 2 * (i + 1));
      return { center, r: radii[i], from, to: from + Math.PI / 2 };
    }).reverse();
  },
  guides: v => [
    ...axis(v),
    ...[1, 2, 3].map(k => square(0, k * v.eyeRadius / 3, -k * v.eyeRadius / 6, k * v.eyeRadius / 6)),
  ],
};

// Four point: the spiral drawn about a square's corners, every arc an exact quarter, each
// centre on the line through the last centre and the joint so the arcs stay tangent. It leaves
// the top of the eye heading left like the rest, so the first centre sits straight below that
// point, the first radius down. From there each arc's radius is the user's, since old scrolls
// rarely open evenly, and each centre steps back from the last joint by the growth, which is
// what keeps the joint on the line between the two. With every arc a side longer than the last
// the centres are the corners of one square hung from the top of the eye, as the old figure has
// it; with the growth a real scroll has, a millimetre or two an arc, they stay close about it.
// Eleven quarters reach the front; the twelfth is the crown, so it has no radius here.
const fourPointCentres = (eyeRadius: number, arcRadii: number[]) => {
  const centers = [new Pt(0, eyeRadius - arcRadii[0])];
  arcRadii.slice(1).forEach((r, i) => {
    const [last, grow, joint] = [centers[i], r - arcRadii[i], (i + 2) * Math.PI / 2];
    centers.push(new Pt(last.x - grow * Math.cos(joint), last.y - grow * Math.sin(joint)));
  });
  return centers;
};
const fourPoint: VoluteStyleDef = {
  label: 'Four point',
  arcs: ({ eyeRadius, arcRadii }) => {
    if (!arcRadii.length || !arcRadii.every((r, i) => r > (arcRadii[i - 1] ?? 0))) return [];
    return fourPointCentres(eyeRadius, arcRadii).map((center, i) => {
      const from = ((i + 1) % 4) * Math.PI / 2;
      return { center, r: arcRadii[i], from, to: from + Math.PI / 2 };
    }).reverse();
  },
  guides: v => [...axis(v), v.arcRadii.length ? fourPointCentres(v.eyeRadius, v.arcRadii) : []],
};

// Salviati's radii at the same eye, so the four point spiral starts out as the one that has
// fitted real scrolls best, and every field is then a nudge from a known shape
export const defaultArcRadii = (eyeRadius: number): number[] =>
  salviati.arcs({ style: 'salviati', eyeRadius, arcRadii: [] }).map(a => Math.round(a.r * 100) / 100).reverse().slice(0, 11);

export const VOLUTE_STYLES: Record<VoluteStyle, VoluteStyleDef> = { alberti, serlio, philandrier, salviati, goldmann, fourPoint };

// the outermost arc that reaches the front heading up is cut there, and everything outside it dropped
function cutAtFront(arcs: VoluteArc[]): VoluteArc[] | null {
  const EPS = 1e-9;
  for (let i = 0; i < arcs.length; i++) {
    const { from, to } = arcs[i];
    let front = from + normalizeRadians(-from);
    // reached at the very start, it was the inner neighbour's end
    if (front <= from + EPS) front += 2 * Math.PI;
    if (front <= to + EPS) return [{ ...arcs[i], to: front }, ...arcs.slice(i + 1)];
  }
  return null;
}

// the spiral proper, then the two arcs that carry it round the box: the crown from the spiral's
// front up to the box's top, and the throat from there down to the back edge
export interface PlacedVolute {
  spiral: VoluteArc[];
  crown: VoluteArc | null;
  throat: VoluteArc | null;
  guides: Pt[][];
}

// the style's arcs about the eye, cut where the spiral heads up at its front
function drawn(v: VoluteSpec): VoluteArc[] | null {
  return v.eyeRadius > 0 ? cutAtFront(VOLUTE_STYLES[v.style].arcs(v)) : null;
}

// where the eye goes so the cut spiral's front touches the box's front, at the height where the
// crown carries the outermost arc on unchanged: the box's top one outer radius above the cut.
// In the scroll's frame: the nut at the origin, length up +y, depth toward -x
export function fitVolute(v: VoluteSpec, scrollLength: number): Pt | null {
  const cut = drawn(v);
  if (!cut) return null;
  const outer = cut[0];
  return new Pt(-(outer.center.x + outer.r), scrollLength - outer.r - outer.center.y);
}

// every style goes through the same steps about the eye, wherever it has been put in the scroll's frame
export function layoutVolute(v: VoluteSpec, eye: Pt, scrollLength: number, scrollDepth: number): PlacedVolute | null {
  if (!Number.isFinite(eye.x) || !Number.isFinite(eye.y)) return null;
  const cut = drawn(v);
  if (!cut) return null;

  // the drawing is in the eye's own frame, so the eye's centre carries it into the scroll's
  const place = (p: Pt) => new Pt(eye.x + p.x, eye.y + p.y);
  const spiral = cut.map(a => ({ ...a, center: place(a.center) }));
  const guides = VOLUTE_STYLES[v.style].guides(v).map(line => line.map(place));

  // crown: leave the spiral at its front, tangent to the vertical there, so the centre sits
  // straight left; a quarter turn on it reaches the box's top, so its radius is the front's
  // distance below the top. That is the outer radius with the eye where fitVolute put it, and
  // the crown is the spiral's own next quarter; a lower eye fills the crown out, a higher one
  // tightens it. Null with the front on or above the top
  const outer = spiral[0];
  const front = new Pt(outer.center.x + outer.r, outer.center.y);
  const crownR = scrollLength - front.y;
  const crown = crownR > 0
    ? { center: new Pt(front.x - crownR, front.y), r: crownR, from: 0, to: Math.PI / 2 }
    : null;

  // throat: from the crown's top heading left, a quarter turn down to the box's back edge.
  // Null without a crown, or with the crown's centre already past the back edge
  const throatR = crown ? crown.center.x + scrollDepth : 0;
  const throat = crown && throatR > 0
    ? { center: new Pt(crown.center.x, scrollLength - throatR), r: throatR, from: Math.PI / 2, to: Math.PI }
    : null;

  return { spiral, crown, throat, guides };
}
