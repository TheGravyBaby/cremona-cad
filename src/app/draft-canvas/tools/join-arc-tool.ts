import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { arcPathData, dist, findAllJoiningArcsFromTangents, fitTangentArc, normalizeRadians } from '../../helpers/draftMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

const PREVIEW_COLOR = '#2563eb';

type Stage = 'idle' | 'start-set';

type ResolvedArc = { center: Pt; radius: number; startAngle: number; endAngle: number };


/** CCW sweep of an arc's boundary angles, in [0, 2π) — same convention as arcPathData. */
function arcSpan(startAngle: number, endAngle: number): number {
  return normalizeRadians(endAngle - startAngle);
}

/**
 * findAllJoiningArcsFromTangents labels each arc's sweep direction arbitrarily — the short way
 * around its circle between its two boundary points, or the long way, both equally valid/tangent.
 * Always take the short (≤180°) one; the long one is just the same circle looping the far way
 * around for no reason.
 */
function preferMinorSweep(arc: ResolvedArc): ResolvedArc {
  if (arcSpan(arc.startAngle, arc.endAngle) <= Math.PI) return arc;
  return { ...arc, startAngle: arc.endAngle, endAngle: arc.startAngle };
}

/**
 * A bare snapped point doesn't say which end of a shape it was, and the biarc math can have up to
 * 2 valid radii per orientation — so this tries all 4 invert1/invert2 combinations and every root
 * each gives (up to 8 candidates total) and scores them, rather than guessing one.
 *
 * Each candidate is scored on scaleMismatch (how far its radius is from the P1–P2 chord length,
 * log-scaled — a well-formed join's radius is roughly chord-sized) and turning (total curvature;
 * a tighter join turns less). combinedScore is `2 × scaleMismatch + turning` — added rather than
 * multiplied so one near-zero factor can't mask a badly-wrong other one, and fit against the
 * cases in join-arc-tool.spec.ts. jointRatio is computed and logged but not yet scored.
 *
 * All candidates are returned, sorted ascending by combinedScore (index 0 is the default).
 * Nothing is filtered out, so Shift can cycle to an implausible-looking one that's actually right
 * (see JoinArcTool.onKeyDown).
 */
export type BiarcCandidate = {
  invert1: boolean; invert2: boolean; radius: number; arcs: ResolvedArc[];
  turningDeg: number; scaleMismatch: number; jointRatio: number; combinedScore: number;
};

/** Where the two arcs meet — the midpoint of their centers, since two equal-radius circles that
 * are tangent to each other always touch exactly halfway between their centers. */
function computeJoint(arcs: ResolvedArc[]): Pt {
  return { x: (arcs[0].center.x + arcs[1].center.x) / 2, y: (arcs[0].center.y + arcs[1].center.y) / 2 };
}

/** Exported so join-arc-tool.spec.ts can test the scoring directly, without simulating pointer/keyboard events. */
export function computeBiarcCandidates(P1: Pt, T1: number, P2: Pt, T2: number): BiarcCandidate[] {
  const chord = dist(P2, P1);
  const chordMid: Pt = { x: (P1.x + P2.x) / 2, y: (P1.y + P2.y) / 2 };
  const candidates: BiarcCandidate[] = [];
  for (const invert1 of [false, true]) {
    for (const invert2 of [false, true]) {
      for (const rawArcs of findAllJoiningArcsFromTangents(P1, T1, P2, T2, invert1, invert2)) {
        const arcs = rawArcs.map(arc => preferMinorSweep({ center: { x: arc.x, y: arc.y }, radius: arc.r, startAngle: arc.start, endAngle: arc.end }));
        const turning = arcs.reduce((sum, arc) => sum + arcSpan(arc.startAngle, arc.endAngle), 0);
        const radius = arcs[0]?.radius ?? 0;
        const scaleMismatch = chord > 1e-6 && radius > 1e-9 ? Math.abs(Math.log(radius / chord)) : Number.POSITIVE_INFINITY;
        const joint = computeJoint(arcs);
        const jointRatio = chord > 1e-6 ? dist(joint, chordMid) / (chord / 2) : Number.POSITIVE_INFINITY;
        candidates.push({
          invert1, invert2, radius, arcs, turningDeg: turning * 180 / Math.PI, scaleMismatch, jointRatio,
          combinedScore: 2 * scaleMismatch + turning,
        });
      }
    }
  }
  candidates.sort((a, b) => a.combinedScore - b.combinedScore);
  return candidates;
}

function rankedBiarcCandidates(P1: Pt, T1: number, P2: Pt, T2: number): ResolvedArc[][] {
  return computeBiarcCandidates(P1, T1, P2, T2).map(c => c.arcs);
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Logs the ranked candidates on every Shift cycle step and on commit, so a bad auto-pick can be
 * pasted straight into join-arc-tool.spec.ts as a new test case instead of reconstructed by hand.
 * Rounded, and limited to what diagnosing a scoring mistake needs — not the full arc geometry. */
function logJoinDebug(P1: Pt, T1: number, P2: Pt, T2: number, chosenIndex: number): void {
  const candidates = computeBiarcCandidates(P1, T1, P2, T2);
  console.log('[JoinArcTool] biarc candidates', JSON.stringify({
    P1: { x: round(P1.x, 2), y: round(P1.y, 2) }, T1deg: round(T1 * 180 / Math.PI, 2),
    P2: { x: round(P2.x, 2), y: round(P2.y, 2) }, T2deg: round(T2 * 180 / Math.PI, 2),
    chosenIndex,
    candidates: candidates.map((c, index) => ({
      index, invert1: c.invert1, invert2: c.invert2,
      turningDeg: round(c.turningDeg, 1), scaleMismatch: round(c.scaleMismatch, 4), combinedScore: round(c.combinedScore, 4),
    })),
  }, null, 2));
}

/**
 * Connects two existing shapes (or a shape and a bare point) with a tangent arc, or a two-arc
 * biarc when both ends need to match a tangent. Two clicks, like TangentArcTool: the first snaps
 * to an existing endpoint and captures its tangent, the second is another endpoint or a free
 * point. One tangent → a single arc (fitTangentArc); two tangents → the biarc solver, auto-picking
 * its best-scoring orientation (see computeBiarcCandidates).
 *
 * If the auto-pick is wrong, each Shift press steps to the next candidate by score and logs it.
 * The single-arc case keeps every other arc tool's simpler "hold Shift for the other solution"
 * behavior instead — there are only ever two, so there's nothing to cycle through.
 */
export class JoinArcTool implements DraftTool {
  readonly id = 'join-arc';
  readonly label = 'Join Arc';

  private stage: Stage = 'idle';
  private start: Pt | null = null;
  private startTangent: number | undefined;
  private hoverPt: Pt | null = null;
  private hoverTangent: number | undefined;
  private preferOther = false;
  /** Which biarc candidate (in computeBiarcCandidates' score order) Shift has cycled to for the
   * in-progress join — advances one discrete step per Shift key-down, wraps around. */
  private candidateCycleIndex = 0;

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') {
      this.start = pt;
      this.startTangent = host.getSnapTangent();
      this.stage = 'start-set';
    } else {
      this.commit(pt, host);
    }
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') return;
    this.hoverPt = pt;
    this.hoverTangent = host.getSnapTangent();
    this.preferOther = host.isAngleLockHeld();
    host.requestDraw();
  }

  onPointerUp(_pt: Pt, _host: DraftToolHost): void {
    // clicks drive this tool, not drags — state advances in onPointerDown only
  }

  onKeyDown(event: KeyboardEvent, host: DraftToolHost): boolean {
    if (event.key === 'Escape' && this.stage !== 'idle') {
      this.reset();
      return true;
    }
    if (event.key === 'Shift' && !event.repeat && this.stage === 'start-set'
      && this.start && this.startTangent !== undefined && this.hoverPt && this.hoverTangent !== undefined) {
      const candidates = computeBiarcCandidates(this.start, this.startTangent, this.hoverPt, this.hoverTangent);
      if (candidates.length > 0) {
        this.candidateCycleIndex = (this.candidateCycleIndex + 1) % candidates.length;
        logJoinDebug(this.start, this.startTangent, this.hoverPt, this.hoverTangent, this.candidateCycleIndex);
        host.requestDraw();
        return true;
      }
    }
    return false;
  }

  renderPreview(gRoot: RootGroup, _gUI: RootGroup, pxPerMm: number): void {
    if (!this.start || !this.hoverPt) return;

    if (this.startTangent !== undefined) {
      const guideLen = 16 / pxPerMm;
      gRoot.append('line')
        .attr('x1', this.start.x - Math.cos(this.startTangent) * guideLen)
        .attr('y1', this.start.y - Math.sin(this.startTangent) * guideLen)
        .attr('x2', this.start.x + Math.cos(this.startTangent) * guideLen)
        .attr('y2', this.start.y + Math.sin(this.startTangent) * guideLen)
        .attr('stroke', PREVIEW_COLOR)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2 4')
        .attr('opacity', 0.5)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');
    }

    for (const arc of this.resolve(this.hoverPt, this.hoverTangent, this.preferOther)) {
      gRoot.append('path')
        .attr('d', arcPathData(arc.center, arc.radius, arc.startAngle, arc.endAngle))
        .attr('fill', 'none')
        .attr('stroke', PREVIEW_COLOR)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 3')
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');
    }
  }

  reset(): void {
    this.stage = 'idle';
    this.start = null;
    this.startTangent = undefined;
    this.hoverPt = null;
    this.hoverTangent = undefined;
    this.preferOther = false;
    this.candidateCycleIndex = 0;
  }

  private commit(pt: Pt, host: DraftToolHost): void {
    if (!this.start) return;
    const endTangent = host.getSnapTangent();
    const preferOther = host.isAngleLockHeld();
    if (this.startTangent !== undefined && endTangent !== undefined) {
      const candidateCount = computeBiarcCandidates(this.start, this.startTangent, pt, endTangent).length;
      const chosenIndex = candidateCount > 0 ? this.candidateCycleIndex % candidateCount : 0;
      logJoinDebug(this.start, this.startTangent, pt, endTangent, chosenIndex);
    }
    const arcs = this.resolve(pt, endTangent, preferOther);
    for (const arc of arcs) {
      host.addShape({
        id: makeShapeId(),
        type: 'arc',
        center: arc.center,
        radius: arc.radius,
        startAngle: arc.startAngle,
        endAngle: arc.endAngle,
      });
    }
    this.reset();
  }

  /** Zero, one, or two arcs joining `this.start` to `end`, depending on which side(s) snapped to
   * a tangent. Two free points don't determine a curve, so that case yields nothing. */
  private resolve(end: Pt, endTangent: number | undefined, preferOther: boolean): ResolvedArc[] {
    if (!this.start) return [];
    const start = this.start;
    const startTangent = this.startTangent;

    if (startTangent !== undefined && endTangent !== undefined) {
      const candidates = rankedBiarcCandidates(start, startTangent, end, endTangent);
      if (candidates.length > 0) {
        // candidateCycleIndex walks the score-ordered list one step per Shift press — see onKeyDown.
        const index = this.candidateCycleIndex % candidates.length;
        return candidates[index];
      }
      // No real biarc solution (e.g. degenerate geometry) — fall through to a single tangent arc.
    }

    if (startTangent !== undefined) {
      const fit = fitTangentArc(start, startTangent, end, preferOther);
      return fit ? [fit] : [];
    }
    if (endTangent !== undefined) {
      // fitTangentArc already picks whichever of the two boundary-angle labelings continues
      // smoothly from endTangent at `end` — returned as-is, not swapped, so that choice stands.
      const fit = fitTangentArc(end, endTangent, start, preferOther);
      return fit ? [fit] : [];
    }
    return [];
  }
}

export function createJoinArcTool(): JoinArcTool {
  return new JoinArcTool();
}
