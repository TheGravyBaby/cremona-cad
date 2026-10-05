import { angleFromCenter, angleWithinSweep, arcReach, dist, moveInVectorSpace, normalizeRadians, placeCircleOnPointAtAngle, pointOnCircle, TURN, vectorFromSlope } from '../helpers/math/simpleGeometry';
import { circleCircleIntersections } from '../helpers/math/draftMath';
import { reportFailures, SolveFailure, solveSection } from '../helpers/validators';
import { Arc, Circle, Pt, Pt3D } from '../models/types';
import { EnricoCerutiParams, ScrollParams, VoluteStyle } from './ceruti-types';
import { defaultNeckParams, defaultStringSetup } from './ceruti-neck';

// The scroll in its own side-view frame: the nut at the origin on the neck's front, up the neck +y,
// toward the back -x. calculateScroll writes every arc onto `p.volute` for scroll.render.ts to read.

export type VoluteSpec = Pick<ScrollParams, 'style' | 'eye' | 'pitch' | 'seedLength' | 'arcRadii'>;
export type ScrollKey = 'spiral' | 'S0' | 'S1' | 'S2' | 'S3' | 'nape' | 'backStraight' | 'F0' | 'F1' | 'flat' | 'frontStraight';
export type ScrollFailure = SolveFailure<ScrollKey>;
export type ScrollLine = 'square' | 'backStraight' | 'flat' | 'frontStraight';

export const VOLUTE_STYLE_LABELS: Record<VoluteStyle, string> = {
  fourPoint: 'Four Point (custom)',
  archimedean: 'Archimedes (c. 225 BC)',
  serlio: 'Serlio (1537)',
  salviati: 'Salviati (1552)',
  goldmann: 'Goldmann (1696)',
  kelly: 'Kelly (2011)',
};

// quarter-turn arcs from the eye out to the front: two full turns
export const TO_FRONT = 8;

export const PATH_SECTIONS = 12;

const BACK_KEYS: ScrollKey[] = ['S0', 'S1', 'S2', 'S3', 'nape', 'backStraight'];
const FRONT_KEYS: ScrollKey[] = ['F0', 'F1', 'flat', 'frontStraight'];
const ALL_KEYS: ScrollKey[] = ['spiral', ...BACK_KEYS, ...FRONT_KEYS];

// the style's spiral in the eye's frame, outermost arc first, or [] when its fields can't draw it.
// Each winds counterclockwise from the eye's front and ends two turns out heading straight up
export function spiralArcs(v: VoluteSpec): Arc[] {
  switch (v.style) {
    case 'fourPoint': return fourPointArcs(v.eye.r, v.arcRadii);
    case 'archimedean': return archimedeanArcs(v.eye.r, v.pitch);
    // the older authors started at the top of the eye; their figures are turned a quarter here
    case 'serlio': return serlioArcs(v.eye.r);
    case 'salviati': return salviatiArcs(v.eye.r);
    case 'goldmann': return goldmannArcs(v.eye.r);
    case 'kelly': return kellyArcs(v.eye.r, v.seedLength);
  }
}

// Four point: a quarter turn per radius, each centre stepping back from the last joint by the
// growth so the arcs stay tangent. The radii are the user's, since old scrolls rarely open evenly
function fourPointArcs(eyeRadius: number, arcRadii: number[]): Arc[] {
  const radii = arcRadii.slice(0, TO_FRONT);
  if (radii.length < TO_FRONT || !(radii[0] > 0) || !radii.every((r, i) => r >= (radii[i - 1] ?? 0))) return [];

  const arcs: Arc[] = [];
  // straight behind the eye's front, so the first arc runs on tangent to the eye
  let center = new Pt(eyeRadius - radii[0], 0);
  for (let i = 0; i < TO_FRONT; i++) {
    if (i > 0) {
      const grow = radii[i] - radii[i - 1];
      center = new Pt(center.x - grow * Math.cos(TURN.quarter * i), center.y - grow * Math.sin(TURN.quarter * i));
    }
    const from = normalizeRadians(TURN.quarter * i);
    arcs.push(new Arc(center.x, center.y, radii[i], from, from + TURN.quarter));
  }
  return arcs.reverse();
}

// Archimedes (c. 225 BC): the radius grows by `pitch` each turn from the eye's edge. Set out as
// arcs through points an eighth of a turn apart, each tangent to the last
function archimedeanArcs(eyeRadius: number, pitch: number): Arc[] {
  if (!(pitch > 0)) return [];
  const eighths = 2 * TO_FRONT;
  const angle = (k: number) => k * TURN.eighth;
  const radius = (k: number) => eyeRadius + pitch * k / 8;
  const points = Array.from({ length: eighths + 1 }, (_, k) => pointOnCircle({ x: 0, y: 0, r: radius(k) }, angle(k)));
  const growth = pitch / TURN.full;
  const heading = (k: number) => {
    const r = radius(k);
    const t = angle(k);
    return Math.atan2(growth * Math.sin(t) + r * Math.cos(t), growth * Math.cos(t) - r * Math.sin(t));
  };
  const chord = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  const miss = (k: number) => normalizeRadians(heading(k) - chord + TURN.half) - TURN.half;

  // aimed to miss the curve's heading equally at both ends, or the arcs alternate flat and round
  let tangent = pointOnCircle({ x: 0, y: 0, r: 1 }, chord + (miss(0) - miss(1)) / 2);
  const arcs: Arc[] = [];
  for (let k = 0; k < eighths; k++) {
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
    arcs.push(new Arc(center.x, center.y, r, from, to));
    tangent = new Pt(center.y - q.y, q.x - center.x);
  }

  // the last arc reaches the front a little off vertical; roll it to end heading straight up
  const outer = arcs.pop()!;
  arcs.push(new Arc(outer.x, outer.y, outer.r, outer.start, Math.round(outer.end / TURN.full) * TURN.full));
  return arcs.reverse();
}

// Serlio (1537): semicircles about centres a sixth of his eye's diameter apart, stepping out to
// either side in turn. Two turns end on his 13/6-diameter semicircle
function serlioArcs(eyeRadius: number): Arc[] {
  // a semicircle is two quarter arcs about the same centre
  const centers: Pt[] = [];
  for (const k of [-1, 1, -2, 2]) {
    const center = new Pt(k * eyeRadius / 3, 0);
    centers.push(center, center);
  }

  // growing by the step between centres keeps the arcs tangent
  const arcs: Arc[] = [];
  let r = 4 * eyeRadius / 3;
  for (let i = 0; i < centers.length; i++) {
    if (i > 0) r += dist(centers[i - 1], centers[i]);
    const from = normalizeRadians(TURN.quarter * i);
    arcs.push(new Arc(centers[i].x, centers[i].y, r, from, from + TURN.quarter));
  }
  return arcs.reverse();
}

// Salviati (1552): quarter arcs about the corners of three nested squares on the eye's diagonals;
// two turns use the inner two. Vignola, Palladio and Scamozzi reprint the same centres
function salviatiArcs(eyeRadius: number): Arc[] {
  const g = eyeRadius * Math.SQRT2 / 6;
  const n = TO_FRONT;
  const centers = Array.from({ length: n }, (_, i) => pointOnCircle({ x: 0, y: 0, r: (2 - Math.floor(i / 4)) * g }, TURN.eighth - i * TURN.quarter));

  // the innermost arc leaves the front of the eye, so it runs a little over a quarter
  const radii = new Array<number>(n);
  const last = centers[n - 1];
  radii[n - 1] = Math.hypot(eyeRadius - last.x, last.y);
  for (let i = n - 2; i >= 0; i--) radii[i] = radii[i + 1] + dist(centers[i], centers[i + 1]);

  // arc i meets the one inside it on the line between their centres, which at a ring change
  // isn't a quarter turn on, so the two arcs there run a little long and short
  const joints = centers.slice(0, n - 1).map((c, i) => angleFromCenter(c, centers[i + 1]));
  return centers.map((center, i) => {
    const from = i < n - 1 ? joints[i] : Math.atan2(-last.y, eyeRadius - last.x);
    // the outermost has no ring change to end on: a quarter on to the front
    const end = i > 0 ? from + normalizeRadians(joints[i - 1] - from) : Math.round((from + TURN.quarter) / TURN.full) * TURN.full;
    return new Arc(center.x, center.y, radii[i], from, end);
  });
}

// Goldmann (1696): Salviati's squares hung below the eye's horizontal diameter instead, so every
// arc is an exact quarter. Two turns go round the inner two squares
function goldmannArcs(eyeRadius: number): Arc[] {
  // round each square from its upper left corner
  const centers: Pt[] = [];
  for (const k of [1, 2]) {
    const w = k * eyeRadius / 3;
    const h = k * eyeRadius / 6;
    centers.push(new Pt(-h, 0), new Pt(-h, -w), new Pt(h, -w), new Pt(h, 0));
  }

  const arcs: Arc[] = [];
  let r = 7 * eyeRadius / 6;
  for (let i = 0; i < centers.length; i++) {
    if (i > 0) r += dist(centers[i - 1], centers[i]);
    const from = normalizeRadians(TURN.quarter * i);
    arcs.push(new Arc(centers[i].x, centers[i].y, r, from, from + TURN.quarter));
  }
  return arcs.reverse();
}

// Kelly (2011): from the left end of the seed's middle line, then round the outer corners of its
// middle two squares and then its own. He varies the seed's length by scroll, so it's a field
function kellyArcs(eyeRadius: number, seedLength: number): Arc[] {
  if (!(seedLength > 0)) return [];
  const s = seedLength / 4;
  const centers = [new Pt(-s / 2, 0)];
  for (const t of [1, 2]) {
    centers.push(new Pt(-s / 2, -t * s), new Pt(s / 2, -t * s), new Pt(s / 2, t * s), new Pt(-s / 2, t * s));
  }

  const arcs: Arc[] = [];
  let r = eyeRadius + s / 2;
  for (let i = 0; i < TO_FRONT; i++) {
    if (i > 0) r += dist(centers[i - 1], centers[i]);
    const from = normalizeRadians(TURN.quarter * i);
    arcs.push(new Arc(centers[i].x, centers[i].y, r, from, from + TURN.quarter));
  }
  return arcs.reverse();
}

// after Stradivari's Betts on a 350 mm body, scaled by body length. F0 shares S3's centre, as on
// the Betts, so its radius and the flat are read off the solved back
export function defaultVoluteParams(p: EnricoCerutiParams): ScrollParams {
  let k = p.height / 350;
  let mm = (v: number) => Math.round(v * k);
  let eyeRadius = Math.round(3.5 * k * 4) / 4;

  let v: ScrollParams = {
    style: 'salviati',
    // the flush in calculateScroll below sets Eye X
    eye: new Circle(0, mm(83), eyeRadius),
    flushWithNeck: true,
    // about the Salviati's own opening, its front as far out
    pitch: Math.round(1.9 * eyeRadius * 10) / 10,
    seedLength: eyeRadius,
    arcRadii: [],

    spiral: null,
    S0: new Arc(0, 0, mm(21), 0, 80 * TURN.degree),
    S1: new Arc(0, 0, mm(28), 0, 165 * TURN.degree),
    S2: new Arc(0, 0, mm(35), 0, 215 * TURN.degree),
    S3: new Arc(0, 0, mm(35), -25 * TURN.degree, 0),
    nape: new Arc(0, 0, mm(10), 0, TURN.quarter),
    backStraight: mm(25),

    F0: new Arc(0, 0, mm(60), 0, 45 * TURN.degree),
    F1: new Arc(0, 0, mm(9), 0, 0),
    flat: 0,
    frontStraight: mm(18),

    pathWidths: [],
  };

  let stringSetup = p.stringSetup ?? defaultStringSetup(p);
  calculateScroll({ ...p, neck: p.neck ?? defaultNeckParams(p), stringSetup, scroll: v });
  v.F0 = new Arc(0, 0, Math.round(-v.S3.x), 0, v.F0.end);
  v.flat = Math.round(v.S3.y - stringSetup.nutHeight);
  return v;
}

// `p.neck` and `p.stringSetup` must already be in place — the panel seeds them
export function calculateScroll(p: EnricoCerutiParams): ScrollFailure[] {
  p.scroll ??= defaultVoluteParams(p);
  let v = p.scroll;

  // the four point seeds once from Kelly's radii, which land its centres on his
  if (v.style === 'fourPoint' && !v.arcRadii.length)
    v.arcRadii = kellyArcs(v.eye.r, v.seedLength).reverse().map(a => Math.round(a.r * 100) / 100);

  let neckBack = -p.neck!.thickness;
  let nutTop = new Pt(0, p.stringSetup!.nutHeight);

  v.spiral = null;

  // a run stops at the first bad part; everything solved after it stays unsolved
  let badArc = (section: string, key: ScrollKey, arc: Arc, unsolved: ScrollKey[]): ScrollFailure => ({
    message: !(arc.r > 0)
      ? `${section}: ${key} needs a radius.`
      : `${section}: ${key} has to sweep on from where the last part ended, by up to a full turn.`,
    unsolved, circles: [], segments: [],
  });
  let badLength = (section: string, key: ScrollKey, unsolved: ScrollKey[]): ScrollFailure => ({
    message: `${section}: ${key} needs a length, or 0.`,
    unsolved, circles: [], segments: [],
  });

  let failures: ScrollFailure[] = [];

  solveSection(failures, 'Volute', ALL_KEYS, () => {
    if (!(v.eye.r > 0))
      return { message: 'Volute: the eye needs a radius.', unsolved: ALL_KEYS, circles: [], segments: [] };
    let arcs = spiralArcs(v);
    if (!arcs.length)
      return {
        message: v.style === 'fourPoint'
          ? 'Volute: the four point needs every radius set, each at least the one inside it.'
          : v.style === 'archimedean' ? 'Volute: the Archimedean needs a pitch.'
          : v.style === 'kelly' ? "Volute: Kelly's needs a seed length."
          : `Volute: ${VOLUTE_STYLE_LABELS[v.style]} can't be drawn from this eye.`,
        unsolved: ALL_KEYS, circles: [], segments: [],
      };

    // rewritten each pass while on, so turning flush off leaves the eye where it was
    if (v.flushWithNeck) {
      let front = Math.max(...arcs.flatMap(a => arcReach(a, 0)).map(pt => pt.x));
      v.eye = new Circle(Math.round(-front * 100) / 100, v.eye.y, v.eye.r);
    }
    if (!Number.isFinite(v.eye.x) || !Number.isFinite(v.eye.y))
      return { message: 'Volute: the eye needs a position.', unsolved: ALL_KEYS, circles: [], segments: [] };

    v.spiral = arcs.map(a => new Arc(a.x + v.eye.x, a.y + v.eye.y, a.r, a.start, a.end));
    return null;
  });
  if (!v.spiral) {
    reportFailures(failures, 'Scroll');
    return failures;
  }

  solveSection(failures, 'Back', BACK_KEYS, () => {
    // S0 to S2 run on tangent from the spiral's front, each to its own end angle
    let outer = v.spiral![0];
    let joint = pointOnCircle(outer, outer.end);

    if (!(v.S0.r > 0) || !(v.S0.end > 0) || v.S0.end > TURN.full)
      return badArc('Back', 'S0', v.S0, ['S0', 'S1', 'S2', 'S3', 'nape', 'backStraight']);
    let S0 = placeCircleOnPointAtAngle(v.S0.r, joint, 0);
    v.S0 = new Arc(S0.x, S0.y, S0.r, 0, v.S0.end);
    joint = pointOnCircle(v.S0, v.S0.end);

    if (!(v.S1.r > 0) || !(v.S1.end > v.S0.end) || v.S1.end - v.S0.end > TURN.full)
      return badArc('Back', 'S1', v.S1, ['S1', 'S2', 'S3', 'nape', 'backStraight']);
    let S1 = placeCircleOnPointAtAngle(v.S1.r, joint, v.S0.end);
    v.S1 = new Arc(S1.x, S1.y, S1.r, v.S0.end, v.S1.end);
    joint = pointOnCircle(v.S1, v.S1.end);

    if (!(v.S2.r > 0) || !(v.S2.end > v.S1.end) || v.S2.end - v.S1.end > TURN.full)
      return badArc('Back', 'S2', v.S2, ['S2', 'S3', 'nape', 'backStraight']);
    let S2 = placeCircleOnPointAtAngle(v.S2.r, joint, v.S1.end);
    v.S2 = new Arc(S2.x, S2.y, S2.r, v.S1.end, v.S2.end);

    if (!(v.backStraight >= 0)) return badLength('Back', 'backStraight', ['S3', 'nape', 'backStraight']);
    let foot = moveInVectorSpace(pointOnCircle(v.S2, v.S2.end), [{ ...vectorFromSlope(v.S2.end + TURN.quarter), mag: v.backStraight }]);

    // S3 turns back clockwise, so as a counterclockwise sweep it runs from the duck tail to the foot
    let S3end = v.S2.end - TURN.half;
    if (!(v.S3.r > 0)) return badArc('Back', 'S3', v.S3, ['S3', 'nape']);
    if (!(v.S3.start < S3end) || S3end - v.S3.start > TURN.full)
      return { message: "Back: S3 has to turn back from the straight's foot, by up to a full turn.", unsolved: ['S3', 'nape'], circles: [], segments: [] };
    let S3 = placeCircleOnPointAtAngle(v.S3.r, foot, S3end);
    v.S3 = new Arc(S3.x, S3.y, S3.r, v.S3.start, S3end);

    // a line runs square from the duck tail to the neck's back, the nape filleting the corner
    let duckTail = pointOnCircle(v.S3, v.S3.start);
    let napeStart = neckBack - v.nape.r;
    if (!(v.nape.r > 0)) return badArc('Back', 'nape', v.nape, ['nape']);
    if (duckTail.x > napeStart)
      return {
        message: `Back: the duck tail sits too far forward for a nape of ${v.nape.r}mm to fit before the neck's back. Shrink the nape, or move the duck tail back with S3 or the straight.`,
        unsolved: ['nape'],
        circles: [{ x: napeStart, y: duckTail.y - v.nape.r, r: v.nape.r }],
        segments: [[duckTail, new Pt(neckBack, duckTail.y)]],
      };
    v.nape = new Arc(napeStart, duckTail.y - v.nape.r, v.nape.r, 0, TURN.quarter);
    return null;
  });

  solveSection(failures, 'Front', FRONT_KEYS, () => {
    if (!(v.flat >= 0)) return badLength('Front', 'flat', ['F0', 'F1', 'flat', 'frontStraight']);
    let top = new Pt(nutTop.x, nutTop.y + v.flat);

    if (!(v.F0.r > 0) || !(v.F0.end > 0) || v.F0.end > TURN.full)
      return badArc('Front', 'F0', v.F0, ['F0', 'F1', 'frontStraight']);
    let F0 = placeCircleOnPointAtAngle(v.F0.r, top, 0);
    v.F0 = new Arc(F0.x, F0.y, F0.r, 0, v.F0.end);

    if (!(v.frontStraight >= 0)) return badLength('Front', 'frontStraight', ['F1', 'frontStraight']);
    let foot = moveInVectorSpace(pointOnCircle(v.F0, v.F0.end), [{ ...vectorFromSlope(v.F0.end + TURN.quarter), mag: v.frontStraight }]);

    // F1 curves back clockwise until it first crosses a drawn arc of the spiral
    if (!(v.F1.r > 0)) return badArc('Front', 'F1', v.F1, ['F1']);
    let F1end = v.F0.end + TURN.half;
    let F1 = placeCircleOnPointAtAngle(v.F1.r, foot, F1end);
    let sweep = Infinity;
    for (let arc of v.spiral!) {
      for (let crossing of circleCircleIntersections(F1, arc)) {
        if (!angleWithinSweep(angleFromCenter(arc, crossing), arc.start, arc.end)) continue;
        let s = normalizeRadians(F1end - angleFromCenter(F1, crossing));
        if (s > 1e-9 && s < sweep) sweep = s;
      }
    }
    if (sweep === Infinity)
      return {
        message: "Front: F1 never meets the spiral. Enlarge F1, or aim the straight in under the volute with F0's end.",
        unsolved: ['F1'], circles: [F1], segments: [],
      };
    v.F1 = new Arc(F1.x, F1.y, F1.r, F1end - sweep, F1end);
    return null;
  });

  reportFailures(failures, 'Scroll');
  return failures;
}

// the lines aren't stored: each runs between stored arcs, so the render reads them off here
export function scrollLines(p: EnricoCerutiParams): Record<ScrollLine, [Pt, Pt]> {
  let v = p.scroll!;
  let nutTop = new Pt(0, p.stringSetup!.nutHeight);
  let backTop = pointOnCircle(v.S2, v.S2.end);
  let frontTop = pointOnCircle(v.F0, v.F0.end);
  return {
    square: [pointOnCircle(v.S3, v.S3.start), pointOnCircle(v.nape, TURN.quarter)],
    backStraight: [backTop, moveInVectorSpace(backTop, [{ ...vectorFromSlope(v.S2.end + TURN.quarter), mag: v.backStraight }])],
    flat: [nutTop, new Pt(nutTop.x, nutTop.y + v.flat)],
    frontStraight: [frontTop, moveInVectorSpace(frontTop, [{ ...vectorFromSlope(v.F0.end + TURN.quarter), mag: v.frontStraight }])],
  };
}

// the path's heights and depths, off a scroll calculateScroll solved whole: from the top of the duck
// tail's round, over the crown and round the spiral in to the eye, cut into equal lengths with both
// ends kept.
// The user's x carries over. Where the nut and the neck differ in width, the duck tail's round and
// the path's start differ too, leaving a shoulder
export function calculateScrollWidths(p: EnricoCerutiParams): void {
  let v = p.scroll!;
  // the path starts as wide as the nut, which the front view carries on down to, and a point
  // nobody has set yet takes the same width
  let start = p.stringSetup!.nutWidth / 2;
  let path = scrollPath(p);
  v.pathWidths = Array.from({ length: PATH_SECTIONS + 1 }, (_, k) => {
    let pt = path.at(path.length * k / PATH_SECTIONS);
    return new Pt3D(k === 0 ? start : v.pathWidths?.[k]?.x ?? start, pt.y, pt.x);
  });
}

// the neck's half-width at y along it, in this frame. The taper is read off the authored widths over
// the neck's length rather than neckHalfWidthAt, which needs the neck solved against the body; over
// a scroll's reach the two differ by hundredths of a mm
export function scrollNeckHalfWidth(p: EnricoCerutiParams, y: number): number {
  let nk = p.neck!;
  return (nk.topWidth - (nk.rootWidth - nk.topWidth) * y / nk.length) / 2;
}

// seen from behind the scroll's back starts in a round at the duck tail, the neck's back carried
// on round, so as wide as the neck is there
export function duckTailRadius(p: EnricoCerutiParams): number {
  let v = p.scroll!;
  return scrollNeckHalfWidth(p, pointOnCircle(v.S3, v.S3.start).y);
}

// the front from the nut up to where F1 meets the spiral, a point a millimetre or so apart. Its
// width at each height is the path's there, and where the path passes that height more than once,
// the crossing furthest back: the pegbox's back, not the volute wrapping over it
export function scrollFrontWidths(p: EnricoCerutiParams): Pt3D[] {
  let v = p.scroll!;
  let path = scrollPath(p);
  let widthAt = (s: number) => {
    let t = s / path.length * PATH_SECTIONS;
    let k = Math.min(Math.floor(t), PATH_SECTIONS - 1);
    return v.pathWidths[k].x + (v.pathWidths[k + 1].x - v.pathWidths[k].x) * (t - k);
  };
  let along = (run: Run) => {
    let n = Math.ceil(run.length);
    return Array.from({ length: n + 1 }, (_, i) => ({ s: run.length * i / n, pt: run.at(run.length * i / n) }));
  };
  let traced = along(path).map(({ s, pt }) => new Pt3D(widthAt(s), pt.y, pt.x));

  return along(scrollFront(p)).flatMap(({ pt }) => {
    let back: Pt3D | null = null;
    for (let i = 1; i < traced.length; i++) {
      let a = traced[i - 1];
      let b = traced[i];
      if (a.y === b.y || (a.y - pt.y) * (b.y - pt.y) > 0) continue;
      let t = (pt.y - a.y) / (b.y - a.y);
      let z = a.z + (b.z - a.z) * t;
      if (!back || z < back.z) back = new Pt3D(a.x + (b.x - a.x) * t, pt.y, z);
    }
    // below the path's start the pegbox's front still runs down to the nut, as wide as the path starts
    if (!back && pt.y < traced[0].y) back = traced[0];
    return back ? [new Pt3D(back.x, pt.y, pt.x)] : [];
  });
}

// a stretch of the side profile, walked by distance from its start
type Run = { length: number; at: (s: number) => Pt };

const straight = (a: Pt, b: Pt): Run => {
  let length = dist(a, b);
  return { length, at: s => length > 0 ? new Pt(a.x + (b.x - a.x) * s / length, a.y + (b.y - a.y) * s / length) : a };
};
const counterclockwise = (a: Arc): Run => ({ length: a.r * (a.end - a.start), at: s => pointOnCircle(a, a.start + s / a.r) });
const clockwise = (a: Arc): Run => ({ length: a.r * (a.end - a.start), at: s => pointOnCircle(a, a.end - s / a.r) });

const joined = (runs: Run[]): Run => {
  let last = runs.at(-1)!;
  return {
    length: runs.reduce((sum, run) => sum + run.length, 0),
    at: s => {
      for (let run of runs) {
        if (s <= run.length) return run.at(s);
        s -= run.length;
      }
      return last.at(last.length);
    },
  };
};

function scrollPath(p: EnricoCerutiParams): Run {
  let v = p.scroll!;
  let at = pointOnCircle;
  let whole = joined([
    counterclockwise(v.S3),
    straight(at(v.S3, v.S3.end), at(v.S2, v.S2.end)),
    clockwise(v.S2), clockwise(v.S1), clockwise(v.S0),
    ...v.spiral!.map(clockwise),
  ]);

  // the path starts where the back first rises to the top of the duck tail's round
  let top = whole.at(0).y + duckTailRadius(p);
  let below = (s: number) => whole.at(s).y < top;
  let hi = 0;
  while (hi < whole.length && below(hi)) hi = Math.min(hi + 0.5, whole.length);
  let lo = Math.max(hi - 0.5, 0);
  for (let i = 0; i < 40; i++) {
    let mid = (lo + hi) / 2;
    if (below(mid)) lo = mid; else hi = mid;
  }
  return { length: whole.length - hi, at: s => whole.at(hi + s) };
}

function scrollFront(p: EnricoCerutiParams): Run {
  let v = p.scroll!;
  let at = pointOnCircle;
  let flatTop = at(v.F0, v.F0.start);
  return joined([
    straight(new Pt(flatTop.x, flatTop.y - v.flat), flatTop),
    counterclockwise(v.F0),
    straight(at(v.F0, v.F0.end), at(v.F1, v.F1.end)),
    clockwise(v.F1),
  ]);
}

// the readouts, off a back solved through S3: the nut up to the crown's top, and the neck's front
// back to the scroll's furthest reach
export function scrollExtent(v: ScrollParams): { height: number; width: number } {
  let back = [v.S0, v.S1, v.S2, v.S3];
  return {
    height: Math.max(...back.flatMap(a => arcReach(a, TURN.quarter)).map(pt => pt.y)),
    width: -Math.min(...back.flatMap(a => arcReach(a, TURN.half)).map(pt => pt.x)),
  };
}
