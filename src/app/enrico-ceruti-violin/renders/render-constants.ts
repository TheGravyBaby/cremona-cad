import { Arc, Pt } from '../../models/types';

export interface HighlightedArc {
  arc: Arc;
  color: string;
}

/** A straight run whose length field has focus — the scroll's straights, flat and square line. */
export interface HighlightedSegment {
  line: [Pt, Pt];
  color: string;
}

/**
 * A location marked on canvas while the textbox editing it has focus — the counterpart of
 * {@link HighlightedArc} for fields that set a coordinate rather than an arc. The point is
 * resolved by the panel at render time rather than captured on focus, so it survives a recalc
 * replacing the object.
 */
export interface HighlightedPoint {
  point: Pt;
  color: string;
}

/**
 * The spline control point whose textbox has focus, marked on canvas — the
 * point-shaped counterpart of {@link HighlightedArc}. Identified by source
 * rather than by object reference because a mirrored point draws two knots
 * and both should light up together (see vibeMath's ArchSplineKnot).
 *
 * Which plate/shape it belongs to isn't carried here: a panel resolves that
 * before rendering and simply passes null for the plates that aren't focused.
 */
export interface HighlightedSplinePoint {
  /** Matches ArchSplineKnot.source: a control point's index, or SPLINE_PEAK_SOURCE. */
  source: number;
  color: string;
}
