import { angleWithinSweep, normalizeRadians } from '../../../helpers/math/simpleGeometry';
import { Pt } from '../../../models/types';
import { VoluteStyle } from '../../ceruti-types';

// One arc of the spiral, swept counterclockwise from `from` to `to`.
export type VoluteArc = { center: Pt; r: number; from: number; to: number };

// A style draws the whole construction in the eye's own frame (origin at the eye's centre) from
// the eye radius alone, arcs outermost first. Counterclockwise is the way it winds outward, so an
// arc runs from its inner neighbour's end to its own end. Neighbours share that point (inner.to =
// outer.from) and are tangent there. `rotation` (radians, counterclockwise) turns the method's
// own orientation to the scroll's; the user's turn is added to it. The style draws further out than it may be used: layoutVolute
// cuts the spiral where the turned drawing reaches its top heading left, so the arcs beyond
// that point go unused and turning the drawing draws more or less of it.
export interface VoluteStyleDef {
  label: string;
  rotation: number;
  arcs: (eyeRadius: number) => VoluteArc[];
}

// Serlio (1537), outermost arc first, in eye diameters: where each centre sits on the axis, its
// radius, and which side of the axis it bulges to. The line of centres is the eye's own
// diameter cut in sixths, and each radius is the last less the distance between the two centres.
const SERLIO_ARCS: readonly { center: number; radius: number; side: 'up' | 'down' }[] = [
  { center: 3 / 6, radius: 4, side: 'down' },
  { center: -3 / 6, radius: 3, side: 'up' },
  { center: 2 / 6, radius: 13 / 6, side: 'down' },
  { center: -2 / 6, radius: 3 / 2, side: 'up' },
  { center: 1 / 6, radius: 1, side: 'down' },
  { center: -1 / 6, radius: 2 / 3, side: 'up' },
];

const serlio: VoluteStyleDef = {
  label: 'Serlio',
  rotation: 0,
  arcs: eyeRadius => {
    const d = 2 * eyeRadius;
    return SERLIO_ARCS.map(({ center, radius, side }) => {
      const from = side === 'up' ? 0 : Math.PI;
      return { center: new Pt(center * d, 0), r: radius * d, from, to: from + Math.PI };
    });
  },
};

// Salviati (1552): twelve quarter-circle arcs, their centres round the corners of three nested
// squares 3, 2 and 1 sixths of the way out along the eye's diagonal (the outer square being the
// eye's inscribed square turned to its edge midpoints). Each radius is the next one in plus the
// distance between their centres, so a quarter turn steps in by 1/2, 1/3 and 1/6 of an eye diameter
// on the three rings. Where one ring meets the next the centres are not a quarter turn apart, so
// the two arcs there run a little long and a little short to stay tangent.
const salviati: VoluteStyleDef = {
  label: 'Salviati',
  rotation: 0,
  arcs: eyeRadius => {
    const g = eyeRadius * Math.SQRT2 / 6;
    const centers = Array.from({ length: 12 }, (_, i) => {
      const a = 3 * Math.PI / 4 - i * Math.PI / 2;
      const dist = (3 - Math.floor(i / 4)) * g;
      return new Pt(dist * Math.cos(a), dist * Math.sin(a));
    });

    // the innermost arc leaves the eye's edge heading straight up from its centre
    const radii = new Array<number>(12);
    const last = centers[11];
    radii[11] = Math.sqrt(eyeRadius ** 2 - last.x ** 2) - last.y;
    for (let i = 10; i >= 0; i--) radii[i] = radii[i + 1] + Math.hypot(centers[i + 1].x - centers[i].x, centers[i + 1].y - centers[i].y);

    // joints[i] is where arc i meets the arc inside it, along the line between their centres
    const joints = centers.slice(0, 11).map((c, i) => Math.atan2(centers[i + 1].y - c.y, centers[i + 1].x - c.x));
    return centers.map((center, i) => {
      const from = i < 11 ? joints[i] : joints[10] - Math.PI / 2;
      const outerEnd = i > 0 ? joints[i - 1] : joints[0] + Math.PI / 2;
      return { center, r: radii[i], from, to: from + normalizeRadians(outerEnd - from) };
    });
  },
};

export const VOLUTE_STYLES: Record<VoluteStyle, VoluteStyleDef> = { serlio, salviati };

function turn(a: VoluteArc, angle: number): VoluteArc {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return { center: new Pt(a.center.x * cos - a.center.y * sin, a.center.x * sin + a.center.y * cos), r: a.r, from: a.from + angle, to: a.to + angle };
}

// the outermost arc that reaches the top heading left is cut there, and everything outside it dropped
function cutAtTop(arcs: VoluteArc[]): VoluteArc[] | null {
  const EPS = 1e-9;
  for (let i = 0; i < arcs.length; i++) {
    const { from, to } = arcs[i];
    let top = from + normalizeRadians(Math.PI / 2 - from);
    if (top <= from + EPS) top += 2 * Math.PI;
    if (top <= to + EPS) return [{ ...arcs[i], to: top }, ...arcs.slice(i + 1)];
  }
  return null;
}

function rightmost(arcs: VoluteArc[]): number {
  let right = -Infinity;
  for (const { center, r, from, to } of arcs) {
    const angles = [from, to, 0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]
      .filter(a => angleWithinSweep(a, from, to));
    for (const a of angles) right = Math.max(right, center.x + r * Math.cos(a));
  }
  return right;
}

export interface PlacedVolute {
  eye: Pt;
  spiral: VoluteArc[];
  join: VoluteArc | null;
}

// every style goes through the same three steps, in the scroll's frame: the nut at the origin,
// length up +y, depth toward -x
export function layoutVolute(style: VoluteStyle, eyeRadius: number, rotation: number, scrollLength: number, scrollDepth: number): PlacedVolute | null {
  if (!(eyeRadius > 0)) return null;

  // 1. draw: the style's arcs around the eye, turned to the scroll's orientation
  const def = VOLUTE_STYLES[style];
  const drawn = def.arcs(eyeRadius).map(a => turn(a, def.rotation + rotation));

  // 2. fit: cut the spiral where it turns left at its top, then slide the eye until that point
  // touches the box's top and the spiral's right side the box's front
  const cut = cutAtTop(drawn);
  if (!cut) return null;
  const right = rightmost(cut);
  const eye = new Pt(-right, scrollLength - (cut[0].center.y + cut[0].r));
  const spiral = cut.map(a => ({ ...a, center: new Pt(eye.x + a.center.x, eye.y + a.center.y) }));

  // 3. join: leave the outermost arc at its top, tangent to the box top there, so the centre
  // sits straight below; a quarter turn on it reaches the box's back edge. Null if the outermost
  // arc's centre is already past the back edge.
  const outer = spiral[0];
  const joinR = outer.center.x + scrollDepth;
  const join = joinR > 0
    ? { center: new Pt(outer.center.x, scrollLength - joinR), r: joinR, from: Math.PI / 2, to: Math.PI }
    : null;

  return { eye, spiral, join };
}
