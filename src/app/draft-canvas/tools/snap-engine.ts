import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { extractArcCenters } from './svg-path-arcs';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export type SnapKind = 'endpoint' | 'center' | 'path';

// `tangent` (radians) is set on what nearest() returns for an endpoint or on-path candidate — any
// point on a line/arc/circle has a well-defined tangent direction — but not for centers, which
// have none. Lets a tool starting at a snapped point (e.g. TangentArcTool) continue smoothly from
// the geometry it snapped to. `along` is where a sample came from on its element: what nearest()
// slides an on-path hit to the exact closest point with, and what the tangent is measured from —
// for the one winner only, since measuring it for every sample tripled the calls into the
// browser's path geometry and made each new shape a visible pause.
export type SnapCandidate = {
  kind: SnapKind; pt: Pt; tangent?: number;
  along?: { el: SVGGeometryElement; s: number; step: number; total: number };
};

// Lower wins ties when multiple candidate kinds fall within tolerance.
const KIND_PRIORITY: Record<SnapKind, number> = { endpoint: 0, center: 1, path: 2 };

const ALONG_PATH_STEP_MM = 2;
const MAX_SAMPLES_PER_ELEMENT = 400;

/**
 * Reads the shapes actually rendered into a layer (recipe draft functions'
 * output plus toolbox shapes) and indexes points a drafting tool can snap
 * to: endpoints, arc/circle centers, and points along a path. Works from the
 * rendered SVG rather than recipe-specific data, so it applies to any recipe
 * and to toolbox shapes alike.
 */
export class SnapEngine {
  private parts = new Map<string, SnapCandidate[]>();

  /** Indexes what `layer` holds as `part`, replacing only that part: the recipe's many long paths
   * and the handful of drawn shapes are indexed separately, so drawing a line beside the recipe
   * doesn't re-sample the recipe. */
  rebuild(layer: RootGroup, part = 'all'): void {
    const candidates: SnapCandidate[] = [];
    // `[data-no-snap]` marks purely decorative sub-elements (e.g. a Section's
    // banding/ticks) that would otherwise flood candidates with noise — only
    // the shape's real geometry (e.g. its centerline) should be snappable.
    layer.selectAll<SVGGeometryElement, unknown>(
      'path:not([data-no-snap]), line:not([data-no-snap]), circle, rect, polyline, polygon',
    )
      .each(function () {
        collectFromElement(this, candidates);
      });
    this.parts.set(part, candidates);
  }

  /** Nearest candidate within `toleranceMm`, preferring endpoints/centers over on-path points.
   * An on-path hit is the exact closest point of the curve, not the nearest sample: the curve
   * may pass within tolerance between two samples that both miss it, so samples are gathered
   * from half a step further out and the winner is refined before the tolerance is applied. */
  nearest(pt: Pt, toleranceMm: number): SnapCandidate | null {
    let best: SnapCandidate | null = null;
    let bestDist2 = Infinity;

    for (const candidates of this.parts.values()) {
      for (const c of candidates) {
        const dx = c.pt.x - pt.x;
        const dy = c.pt.y - pt.y;
        const d2 = dx * dx + dy * dy;
        const reach = toleranceMm + (c.kind === 'path' && c.along ? c.along.step / 2 : 0);
        if (d2 > reach * reach) continue;

        const priority = KIND_PRIORITY[c.kind];
        const bestPriority = best ? KIND_PRIORITY[best.kind] : Infinity;
        if (!best || priority < bestPriority || (priority === bestPriority && d2 < bestDist2)) {
          best = c;
          bestDist2 = d2;
        }
      }
    }

    if (!best?.along) return best;
    if (best.kind === 'path') {
      const refined = closestOnPath(best.along, pt);
      return Math.hypot(refined.pt.x - pt.x, refined.pt.y - pt.y) <= toleranceMm ? refined : null;
    }
    const { el, s, total } = best.along;
    return { ...best, tangent: tangentAt(el, s, total) };
  }
}

// golden-section search over one step either side of the sample: the distance to a curve that
// smooth is unimodal there, and 24 halvings put the point well under a micron along it
function closestOnPath(along: NonNullable<SnapCandidate['along']>, pt: Pt): SnapCandidate {
  const { el, total } = along;
  const dist2 = (s: number) => {
    const p = el.getPointAtLength(s);
    return (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
  };
  let lo = Math.max(0, along.s - along.step);
  let hi = Math.min(total, along.s + along.step);
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = hi - phi * (hi - lo), b = lo + phi * (hi - lo);
  let fa = dist2(a), fb = dist2(b);
  for (let i = 0; i < 24; i++) {
    if (fa < fb) {
      hi = b; b = a; fb = fa;
      a = hi - phi * (hi - lo); fa = dist2(a);
    } else {
      lo = a; a = b; fa = fb;
      b = lo + phi * (hi - lo); fb = dist2(b);
    }
  }
  const s = (lo + hi) / 2;
  const p = el.getPointAtLength(s);
  return { kind: 'path', pt: { x: p.x, y: p.y }, tangent: tangentAt(el, s, total) };
}

function collectFromElement(el: SVGGeometryElement, out: SnapCandidate[]): void {
  if (el.tagName === 'circle') {
    const cx = parseFloat(el.getAttribute('cx') ?? '0');
    const cy = parseFloat(el.getAttribute('cy') ?? '0');
    out.push({ kind: 'center', pt: { x: cx, y: cy } });
  } else if (el.tagName === 'path') {
    const d = el.getAttribute('d');
    if (d) {
      for (const center of extractArcCenters(d)) out.push({ kind: 'center', pt: center });
    }
  } else if (el.tagName === 'rect') {
    // Exact corners as endpoints — the generic getTotalLength walk below only
    // reliably finds one of the four (it's a closed shape starting/ending at
    // the same point), and edge midpoints don't need to be pinpoint-exact.
    const x = parseFloat(el.getAttribute('x') ?? '0');
    const y = parseFloat(el.getAttribute('y') ?? '0');
    const w = parseFloat(el.getAttribute('width') ?? '0');
    const h = parseFloat(el.getAttribute('height') ?? '0');
    out.push({ kind: 'endpoint', pt: { x, y } });
    out.push({ kind: 'endpoint', pt: { x: x + w, y } });
    out.push({ kind: 'endpoint', pt: { x: x + w, y: y + h } });
    out.push({ kind: 'endpoint', pt: { x, y: y + h } });
  }

  if (typeof el.getTotalLength !== 'function') return;

  let total: number;
  try {
    total = el.getTotalLength();
  } catch {
    return;
  }
  if (!Number.isFinite(total) || total <= 0) return;

  const sampleCount = Math.min(MAX_SAMPLES_PER_ELEMENT, Math.max(1, Math.round(total / ALONG_PATH_STEP_MM)));
  const step = total / sampleCount;
  const start = el.getPointAtLength(0);
  const end = el.getPointAtLength(total);
  out.push({ kind: 'endpoint', pt: { x: start.x, y: start.y }, along: { el, s: 0, step, total } });
  out.push({ kind: 'endpoint', pt: { x: end.x, y: end.y }, along: { el, s: total, step, total } });
  for (let s = step; s < total; s += step) {
    const p = el.getPointAtLength(s);
    out.push({ kind: 'path', pt: { x: p.x, y: p.y }, along: { el, s, step, total } });
  }
}

/** Tangent direction at length `s` via a small finite difference — works uniformly for any geometry element. */
function tangentAt(el: SVGGeometryElement, s: number, total: number): number {
  const eps = Math.min(0.05, Math.max(total * 0.001, 1e-4));
  const s0 = Math.max(0, s - eps);
  const s1 = Math.min(total, s + eps);
  const p0 = el.getPointAtLength(s0);
  const p1 = el.getPointAtLength(s1);
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}
