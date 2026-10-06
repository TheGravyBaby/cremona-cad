import { angleFromCenter, angleWithinSweep, dist, normalizeRadians, pointOnCircle, TURN } from '../../../helpers/math/simpleGeometry';
import { arcPathData, combinePathStrings, pathFromArc, pathFromCircle, pathFromLine, samplePathToPolyline, transformPath, unifyConnectedSvgPaths } from '../../../helpers/math/pathMath';
import { Arc, Pt } from '../../../models/types';
import { EnricoCerutiParams } from '../../ceruti-types';
import { heelFace, heelStands, mortiseFingerboardIntersect } from './ceruti-neck';
import { mortiseFloorY, scrollOnNeck } from '../outline/ceruti-paths';

// The neck and scroll template, in the side elevation's frame: the outline as one closed loop, neck
// foot to duck tail, and the volute inside it as a stencil. A template has to hold together, so the
// spiral can't be cut through: it's cut as slots along its path with bridges left between them, the
// way any stencil is, and where two turns run too close for a slot to leave wood between them, or the
// front's edge comes too near, it falls back to pricked dots along the curve. One wall of each slot
// is the curve itself — the wall away from the eye — and the slot's width is taken inward, so the
// maker rides a pencil against the true wall as they would the outline's edge. The eye is a prick at
// its centre, not a hole: a hole would leave a thin ring to the innermost turn.

export interface NeckTemplateSpec {
  slotWidth: number;
  bridgeWidth: number;
  // a bridge at every arc junction and at least this often along a run
  bridgeEvery: number;
  // a slot shorter than this is merged across the junction, or pricked instead
  minSlot: number;
  // the wood left between a slot and the next turn or the outline
  minWeb: number;
  dotEvery: number;
  dotRadius: number;
}

// the stencil's cuts scale with the material, not the instrument; the run lengths scale with it
export function defaultNeckTemplateSpec(p: EnricoCerutiParams): NeckTemplateSpec {
  const k = p.height / 350;
  return { slotWidth: 1.5, bridgeWidth: 2.5, bridgeEvery: 20 * k, minSlot: 8 * k, minWeb: 2, dotEvery: 4 * k, dotRadius: 0.5 };
}

export interface NeckTemplate {
  outline: string;
  slots: string[];
  dots: string[];
  eye: string;
}

// a stretch of one spiral arc, counterclockwise from `from` to `to`, at path lengths s0 to s1
type Piece = { arc: Arc; from: number; to: number; s0: number; s1: number };

function pieces(arcs: { arc: Arc; from: number; to: number }[]): Piece[] {
  let s = 0;
  return arcs.filter(a => a.to - a.from > 1e-9).map(a => {
    const s0 = s;
    s += a.arc.r * (a.to - a.from);
    return { ...a, s0, s1: s };
  });
}

const pieceAt = (run: Piece[], s: number): Piece => run.find(pc => s <= pc.s1 + 1e-9) ?? run.at(-1)!;

// the point at path length s, `offset` in from the curve toward the arc's centre
const pointAt = (run: Piece[], s: number, offset = 0): Pt => {
  const pc = pieceAt(run, s);
  return pointOnCircle({ ...pc.arc, r: pc.arc.r - offset }, pc.from + (s - pc.s0) / pc.arc.r);
};

// a wall along the run between path lengths a and b at `offset` in from each arc, as arc commands
// to carry a path on, forward or back
function wall(run: Piece[], a: number, b: number, offset: number, forward: boolean): string {
  const within = run.filter(pc => pc.s1 > a + 1e-9 && pc.s0 < b - 1e-9);
  const ordered = forward ? within : [...within].reverse();
  return ordered.map(pc => {
    const r = pc.arc.r - offset;
    const from = pc.from + (Math.max(a, pc.s0) - pc.s0) / pc.arc.r;
    const to = pc.from + (Math.min(b, pc.s1) - pc.s0) / pc.arc.r;
    const end = pointOnCircle({ ...pc.arc, r }, forward ? to : from);
    const large = to - from > TURN.half ? 1 : 0;
    return `A ${r},${r} 0 ${large},${forward ? 1 : 0} ${end.x},${end.y}`;
  }).join(' ');
}

// the spiral from the eye out to where the front's F1 meets it; from there out it's the outline's
function interiorSpiral(p: EnricoCerutiParams): { interior: Piece[]; whole: Piece[]; crossing: { index: number; angle: number } } {
  const v = p.scroll!;
  const arcs = [...v.spiral!].reverse();
  const hit = pointOnCircle(v.F1, v.F1.start);
  const on = (a: Arc) => Math.abs(dist(a, hit) - a.r) < 1e-3 && angleWithinSweep(angleFromCenter(a, hit), a.start, a.end);
  let index = arcs.length - 1;
  for (let i = arcs.length - 1; i >= 0; i--) if (on(arcs[i])) { index = i; break; }
  const angle = arcs[index].start + normalizeRadians(angleFromCenter(arcs[index], hit) - arcs[index].start);
  return {
    interior: pieces([...arcs.slice(0, index).map(arc => ({ arc, from: arc.start, to: arc.end })), { arc: arcs[index], from: arcs[index].start, to: angle }]),
    whole: pieces(arcs.map(arc => ({ arc, from: arc.start, to: arc.end }))),
    crossing: { index, angle },
  };
}

// the outline, in the scroll's frame, as the pieces either side of the spiral: the front up from the
// nut to F1's crossing, and the back from where the spiral leaves S0 round to the nape's foot on the
// neck's back
function scrollOutline(p: EnricoCerutiParams, crossing: { index: number; angle: number }): string[] {
  const v = p.scroll!;
  const arcs = [...v.spiral!].reverse();
  const arc = (a: Arc) => arcPathData(a, a.r, a.start, a.end);
  const backward = (a: Arc) => {
    const from = pointOnCircle(a, a.end);
    const to = pointOnCircle(a, a.start);
    const large = normalizeRadians(a.end - a.start) > TURN.half ? 1 : 0;
    return `M ${from.x},${from.y} A ${a.r},${a.r} 0 ${large},0 ${to.x},${to.y}`;
  };
  const at = pointOnCircle;
  const nutTop = new Pt(0, p.stringSetup!.nutHeight);
  const flatTop = at(v.F0, v.F0.start);
  const outer = arcs[crossing.index];
  return [
    pathFromLine(new Pt(0, 0), nutTop),
    pathFromLine(nutTop, flatTop),
    arc(v.F0),
    pathFromLine(at(v.F0, v.F0.end), at(v.F1, v.F1.end)),
    backward(v.F1),
    ...(outer.end - crossing.angle > 1e-9 ? [arcPathData(outer, outer.r, crossing.angle, outer.end)] : []),
    ...arcs.slice(crossing.index + 1).map(arc),
    arc(v.S0), arc(v.S1), arc(v.S2),
    pathFromLine(at(v.S2, v.S2.end), at(v.S3, v.S3.end)),
    backward(v.S3),
    pathFromLine(at(v.S3, v.S3.start), at(v.nape, v.nape.end)),
    backward(v.nape),
  ];
}

// the neck's own edge in the side elevation: the foot and the fingerboard plane up to the nut, and
// the back down from where the nape meets it over the heel, closed along the back's face
function neckOutline(p: EnricoCerutiParams, backTop: Pt): string[] {
  const nk = p.neck!;
  const floor = new Pt(0, mortiseFloorY(p));
  const glue = mortiseFingerboardIntersect(p);
  const segments = [pathFromLine(floor, glue), pathFromLine(glue, nk.root!), pathFromLine(nk.root!, nk.neckTop!)];
  const heel = nk.heel;
  let end: Pt;
  if (heelStands(p)) {
    segments.push(pathFromLine(backTop, pointOnCircle(heel, heel.start)), pathFromArc(heel));
    const face = heelFace(p);
    if (face) segments.push(pathFromLine(...face));
    end = face ? face[1] : pointOnCircle(heel, heel.end);
  } else {
    segments.push(pathFromLine(backTop, nk.backRoot!));
    end = nk.backRoot!;
  }
  segments.push(pathFromLine(end, floor));
  return segments;
}

export function defineNeckTemplate(p: EnricoCerutiParams, spec: NeckTemplateSpec = defaultNeckTemplateSpec(p)): NeckTemplate {
  const v = p.scroll!;
  const m = scrollOnNeck(p);
  const { interior, whole, crossing } = interiorSpiral(p);
  const edge = scrollOutline(p, crossing);
  const backTop = { x: m[0] * -p.neck!.thickness + m[2] * v.nape.y + m[4], y: m[1] * -p.neck!.thickness + m[3] * v.nape.y + m[5] };
  const outline = unifyConnectedSvgPaths([...edge.map(d => transformPath(d, m)), ...neckOutline(p, backTop)]);

  // what else a slot could break through to: the next turn of the spiral, or the outline's other
  // pieces. A point's own stretch of the spiral is left out, half a turn either way
  const others = edge.flatMap(d => samplePathToPolyline(d, 1, true));
  const turns = whole.flatMap(pc => {
    const n = Math.max(1, Math.ceil(pc.s1 - pc.s0));
    return Array.from({ length: n + 1 }, (_, i) => {
      const s = pc.s0 + (pc.s1 - pc.s0) * i / n;
      return { s, r: pc.arc.r, pt: pointOnCircle(pc.arc, pc.from + (s - pc.s0) / pc.arc.r) };
    });
  });
  const clearance = (s: number): number => {
    const pt = pointAt(interior, s);
    const r = pieceAt(interior, s).arc.r;
    const nearTurn = Math.min(...turns.filter(t => Math.abs(t.s - s) > r * TURN.half).map(t => dist(t.pt, pt)));
    const nearEdge = Math.min(...others.map(o => dist(o, pt)));
    return Math.min(nearTurn, nearEdge);
  };

  // a bridge at each end of the stencil, then the run classed millimetre by millimetre: slot where
  // the web holds, dots where it won't
  const length = interior.at(-1)?.s1 ?? 0;
  const ok = (s: number) => pieceAt(interior, s).arc.r - spec.slotWidth > 0.1 && clearance(s) - spec.slotWidth >= spec.minWeb;
  const runs: { ok: boolean; a: number; b: number }[] = [];
  const step = 1;
  for (let s = spec.bridgeWidth; s < length - spec.bridgeWidth; s += step) {
    const b = Math.min(s + step, length - spec.bridgeWidth);
    const kind = ok(s + (b - s) / 2);
    const last = runs.at(-1);
    if (last && last.ok === kind) last.b = b;
    else runs.push({ ok: kind, a: s, b });
  }

  const junctions = interior.slice(1).map(pc => pc.s0);
  const slotSpans: [number, number][] = [];
  const dotSpans: [number, number][] = [];
  // a short stretch that fails at either end of the stencil isn't pricked: there the curve runs on
  // into the eye, or into the outline where the front crosses it
  const atEnd = (run: { a: number; b: number }) => run.a <= spec.bridgeWidth + 1e-9 || run.b >= length - spec.bridgeWidth - 1e-9;
  for (const run of runs) {
    if (!run.ok || run.b - run.a < spec.minSlot) {
      if (!(atEnd(run) && run.b - run.a < spec.minSlot)) dotSpans.push([run.a, run.b]);
      continue;
    }
    // split at the junctions that leave a slot's worth either side, and then as often as the
    // bridge spacing asks, bridges straddling each split
    const cuts: number[] = [];
    for (const j of junctions) {
      if (j - run.a >= spec.minSlot && run.b - j >= spec.minSlot && j - (cuts.at(-1) ?? run.a) >= spec.minSlot) cuts.push(j);
    }
    const bounds = [run.a, ...cuts, run.b];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const n = Math.max(1, Math.ceil((bounds[i + 1] - bounds[i]) / spec.bridgeEvery));
      for (let k = 0; k < n; k++) {
        const a = bounds[i] + (bounds[i + 1] - bounds[i]) * k / n;
        const b = bounds[i] + (bounds[i + 1] - bounds[i]) * (k + 1) / n;
        slotSpans.push([a === run.a ? a : a + spec.bridgeWidth / 2, b === run.b ? b : b - spec.bridgeWidth / 2]);
      }
    }
  }

  // the true wall forward along the curve, square across, and the inner wall back
  const slot = ([a, b]: [number, number]): string => {
    const start = pointAt(interior, a);
    const across = pointAt(interior, b, spec.slotWidth);
    return `M ${start.x},${start.y} ${wall(interior, a, b, 0, true)} L ${across.x},${across.y} ${wall(interior, a, b, spec.slotWidth, false)} Z`;
  };
  const dots = dotSpans.flatMap(([a, b]) => {
    const n = Math.max(1, Math.floor((b - a) / spec.dotEvery));
    return Array.from({ length: n }, (_, i) => pointAt(interior, a + (b - a) * (i + 0.5) / n));
  });

  const place = (d: string) => transformPath(d, m);
  return {
    outline,
    slots: slotSpans.map(span => place(slot(span))),
    dots: dots.map(pt => place(pathFromCircle({ ...pt, r: spec.dotRadius }))),
    eye: place(pathFromCircle({ x: v.eye.x, y: v.eye.y, r: spec.dotRadius })),
  };
}

// every cut of the template as one path, for a sheet
export function neckTemplatePath(t: NeckTemplate): string {
  return combinePathStrings([t.outline, ...t.slots, ...t.dots, t.eye]);
}
