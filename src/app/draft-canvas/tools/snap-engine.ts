import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { extractArcCenters } from './svg-path-arcs';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export type SnapKind = 'endpoint' | 'center' | 'path';

// `tangent` (radians) is set for endpoint/path candidates — any point on a
// line/arc/circle has a well-defined tangent direction — but not for
// centers, which have none. Lets a tool starting at a snapped point (e.g.
// TangentArcTool) continue smoothly from the geometry it snapped to.
export type SnapCandidate = { kind: SnapKind; pt: Pt; tangent?: number };

// Lower wins ties when multiple candidate kinds fall within tolerance.
const KIND_PRIORITY: Record<SnapKind, number> = { endpoint: 0, center: 1, path: 2 };

const ALONG_PATH_STEP_MM = 2;
const MAX_SAMPLES_PER_ELEMENT = 150;

/**
 * Reads the shapes actually rendered into a layer (recipe draft functions'
 * output plus toolbox shapes) and indexes points a drafting tool can snap
 * to: endpoints, arc/circle centers, and points along a path. Works from the
 * rendered SVG rather than recipe-specific data, so it applies to any recipe
 * and to toolbox shapes alike.
 */
export class SnapEngine {
  private candidates: SnapCandidate[] = [];

  rebuild(layer: RootGroup): void {
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
    this.candidates = candidates;
  }

  /** Nearest candidate within `toleranceMm`, preferring endpoints/centers over on-path points. */
  nearest(pt: Pt, toleranceMm: number): SnapCandidate | null {
    const tol2 = toleranceMm * toleranceMm;
    let best: SnapCandidate | null = null;
    let bestDist2 = Infinity;

    for (const c of this.candidates) {
      const dx = c.pt.x - pt.x;
      const dy = c.pt.y - pt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > tol2) continue;

      const priority = KIND_PRIORITY[c.kind];
      const bestPriority = best ? KIND_PRIORITY[best.kind] : Infinity;
      if (!best || priority < bestPriority || (priority === bestPriority && d2 < bestDist2)) {
        best = c;
        bestDist2 = d2;
      }
    }

    return best;
  }
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

  const start = el.getPointAtLength(0);
  const end = el.getPointAtLength(total);
  out.push({ kind: 'endpoint', pt: { x: start.x, y: start.y }, tangent: tangentAt(el, 0, total) });
  out.push({ kind: 'endpoint', pt: { x: end.x, y: end.y }, tangent: tangentAt(el, total, total) });

  const sampleCount = Math.min(MAX_SAMPLES_PER_ELEMENT, Math.max(1, Math.round(total / ALONG_PATH_STEP_MM)));
  const step = total / sampleCount;
  for (let s = step; s < total; s += step) {
    const p = el.getPointAtLength(s);
    out.push({ kind: 'path', pt: { x: p.x, y: p.y }, tangent: tangentAt(el, s, total) });
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
