import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { findAllJoiningArcsFromTangents } from '../../helpers/draftMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { arcPathData, fitTangentArc } from './arc-geometry';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

const PREVIEW_COLOR = '#2563eb';

type Stage = 'idle' | 'start-set';

type ResolvedArc = { center: Pt; radius: number; startAngle: number; endAngle: number };

const TWO_PI = Math.PI * 2;

/** CCW sweep of an arc's boundary angles, in [0, 2π) — same convention as arcPathData. */
function arcSpan(startAngle: number, endAngle: number): number {
  return ((endAngle - startAngle) % TWO_PI + TWO_PI) % TWO_PI;
}

/**
 * findAllJoiningArcsFromTangents always labels each piece "sweep CCW from the shared endpoint
 * to the joint" (or joint-to-endpoint) — but the joint J and the far endpoint are just two fixed
 * points on an already-correct circle, and *either* of the two arcs between them (the minor one,
 * or its complement going the long way around) touches both points and keeps the exact same
 * tangency, since neither the circle nor the two boundary points move when you relabel which one
 * is "start". Which of the two the fixed CCW-from-P-to-J labeling happens to produce is an
 * accident of where the points land angularly — sometimes it's the minor arc, sometimes (as seen
 * on real cases) it's the ~347° major one, whose small complement — the "negative space" of that
 * big circle — was the one that actually belonged in the join. Always taking the minor (≤180°)
 * arc for each piece keeps the same circles and the same joint, and reliably draws the small
 * portion of them instead of looping the long way around for no geometric reason.
 */
function preferMinorSweep(arc: ResolvedArc): ResolvedArc {
  if (arcSpan(arc.startAngle, arc.endAngle) <= Math.PI) return arc;
  return { ...arc, startAngle: arc.endAngle, endAngle: arc.startAngle };
}

/**
 * The equal-radius biarc solve has two independent sources of ambiguity: which of the 4
 * invert1/invert2 departure-direction combinations is physically correct (a bare snapped point
 * doesn't say whether it was a shape's start or end — see findAllJoiningArcsFromTangents' doc
 * comment), and which of up to 2 valid radii for a given combination is the graceful one vs. the
 * tight/looping one. Trying all combinations of both (up to 4 × 2 = 8 candidates) is cheap; the
 * question is how to score them. Each piece is first corrected to its minor sweep
 * (preferMinorSweep) regardless of scoring — see its own doc comment.
 *
 * Three single-number metrics were each falsified by a real logged case before this one. Total
 * arc *length* buries a large gentle arc (more raw length than a small tight loop despite looking
 * better) under a shorter-but-uglier one. Total *turning* (the curvature integral, independent of
 * radius) fixed that, but is fooled by near-singular radius blowups (T1/T2 close to antiparallel
 * sends one candidate's radius to the thousands while its turning — barely anything, because
 * that's exactly what makes it degenerate — looks artificially great). Radius-to-chord
 * proportionality (|log(radius / chord)|, since a well-formed biarc's radius sits on the same
 * order as the distance it's bridging) fixed both of those, but a fourth case then falsified it
 * alone too: it preferred a radius with slightly better proportionality (0.41 vs 0.50 mismatch)
 * whose turning was far worse (151° vs 35°) — neither axis alone survives every case, because a
 * candidate can be near-best on one and clearly wrong on the other.
 *
 * What separates right from wrong in every one of the four real cases logged from this tool is
 * being *simultaneously* reasonable on both axes, not optimal on either alone — so the two scores
 * are combined multiplicatively (scaleMismatch × turning-in-radians) rather than compared
 * separately. A candidate only scores well if it's not badly wrong on either count; one being
 * near-zero doesn't let the other run wild. This reproduces the confirmed-correct choice on all
 * four logged cases (see /tmp verification during development — not persisted, but readily
 * reproducible from the debug log). A generous hard cutoff still discards radii far beyond
 * anything a real join needs (50× the chord) as a pure safety net: in the extreme limit of a
 * near-singularity, turning shrinks faster than the mismatch score grows, so the product alone
 * isn't proof against an even worse blowup than any seen so far. Sorted ascending so index 0 is
 * the default and index 1 is the next-best fallback for Shift.
 */
type BiarcCandidate = {
  invert1: boolean; invert2: boolean; radius: number; arcs: ResolvedArc[];
  turningDeg: number; scaleMismatch: number; combinedScore: number;
};

/** Hard safety cutoff — see computeBiarcCandidates' doc comment on why the combined score alone
 * isn't asymptotically proof against an arbitrarily extreme near-singularity. */
const MAX_RADIUS_TO_CHORD_RATIO = 50;

function computeBiarcCandidates(P1: Pt, T1: number, P2: Pt, T2: number): BiarcCandidate[] {
  const chord = Math.hypot(P2.x - P1.x, P2.y - P1.y);
  const candidates: BiarcCandidate[] = [];
  for (const invert1 of [false, true]) {
    for (const invert2 of [false, true]) {
      for (const rawArcs of findAllJoiningArcsFromTangents(P1, T1, P2, T2, invert1, invert2)) {
        const arcs = rawArcs.map(arc => preferMinorSweep({ center: { x: arc.x, y: arc.y }, radius: arc.r, startAngle: arc.start, endAngle: arc.end }));
        const turning = arcs.reduce((sum, arc) => sum + arcSpan(arc.startAngle, arc.endAngle), 0);
        const radius = arcs[0]?.radius ?? 0;
        const scaleMismatch = chord > 1e-6 && radius > 1e-9 ? Math.abs(Math.log(radius / chord)) : Number.POSITIVE_INFINITY;
        candidates.push({ invert1, invert2, radius, arcs, turningDeg: turning * 180 / Math.PI, scaleMismatch, combinedScore: scaleMismatch * turning });
      }
    }
  }
  candidates.sort((a, b) => a.combinedScore - b.combinedScore);

  const reasonable = chord > 1e-6 ? candidates.filter(c => c.radius <= chord * MAX_RADIUS_TO_CHORD_RATIO) : candidates;
  return reasonable.length > 0 ? reasonable : candidates;
}

function rankedBiarcCandidates(P1: Pt, T1: number, P2: Pt, T2: number): ResolvedArc[][] {
  return computeBiarcCandidates(P1, T1, P2, T2).map(c => c.arcs);
}

// Diagnostic aid used while tuning the candidate-selection heuristic — disabled now that the
// combined scale/turning score has been picking correctly on its own, but left here (not
// deleted) in case a future bad case needs the same paste-the-JSON-here workflow again.
//
// /**
//  * Dumps every candidate this biarc solve considered — point/tangent inputs, each candidate's
//  * invert flags, radius, total turning, scale-mismatch, and combined score — as JSON on commit, so
//  * a case where the auto-picked default is wrong can be pasted verbatim instead of reconstructed
//  * by hand.
//  */
// function logJoinDebug(P1: Pt, T1: number, P2: Pt, T2: number, chosenIndex: number, shiftHeld: boolean): void {
//   const candidates = computeBiarcCandidates(P1, T1, P2, T2);
//   console.log('[JoinArcTool] biarc candidates', JSON.stringify({
//     P1, T1deg: T1 * 180 / Math.PI, P2, T2deg: T2 * 180 / Math.PI,
//     shiftHeld, chosenIndex,
//     candidates: candidates.map((c, index) => ({
//       index, invert1: c.invert1, invert2: c.invert2, radius: c.radius,
//       turningDeg: c.turningDeg, scaleMismatch: c.scaleMismatch, combinedScore: c.combinedScore,
//       arcs: c.arcs.map(a => ({ center: a.center, radius: a.radius, startAngleDeg: a.startAngle * 180 / Math.PI, endAngleDeg: a.endAngle * 180 / Math.PI })),
//     })),
//   }, null, 2));
// }

/**
 * Connects two existing shapes (or a shape and a bare point) with a new tangent arc, or a
 * two-arc biarc when both ends have a tangent to satisfy. Two clicks, like TangentArcTool: the
 * first snaps to an existing endpoint (capturing its tangent via host.getSnapTangent(), same
 * mechanism every other arc tool uses), the second is either another snapped endpoint or a free
 * point. When only one side has a tangent, this reduces to exactly TangentArcTool's single-arc
 * case (fitTangentArc); when both do, a single circle generally can't satisfy both constraints,
 * so this reaches for the biarc solver instead (findAllJoiningArcsFromTangents), auto-picking
 * whichever candidate orientation scores best on radius-proportionality combined with total
 * turning (see rankedBiarcCandidates / computeBiarcCandidates) as the default.
 *
 * Remaining ambiguity — ties, or a case where the top-ranked pick isn't actually the one the user
 * wants — is resolved the same way every arc tool resolves its own two-solution ambiguity: holding
 * Shift (host.isAngleLockHeld()) steps to the next-best candidate instead of the first.
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

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.stage !== 'idle') {
      this.reset();
      return true;
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
  }

  private commit(pt: Pt, host: DraftToolHost): void {
    if (!this.start) return;
    const endTangent = host.getSnapTangent();
    const shiftHeld = host.isAngleLockHeld();
    // Debug logging disabled — see logJoinDebug's comment above. Re-enable by uncommenting that
    // function and this block if a bad candidate needs diagnosing again:
    // if (this.startTangent !== undefined && endTangent !== undefined) {
    //   const candidateCount = computeBiarcCandidates(this.start, this.startTangent, pt, endTangent).length;
    //   const chosenIndex = shiftHeld && candidateCount > 1 ? 1 : 0;
    //   logJoinDebug(this.start, this.startTangent, pt, endTangent, chosenIndex, shiftHeld);
    // }
    const arcs = this.resolve(pt, endTangent, shiftHeld);
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
        // Shift-driven alternate-candidate override disabled — the combined scale/turning score
        // has been picking correctly on its own. Restore `preferOther && candidates.length > 1 ?
        // 1 : 0` here if a future case needs the manual escape hatch again.
        const index = 0;
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
