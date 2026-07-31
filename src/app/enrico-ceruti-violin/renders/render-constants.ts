import { Arc } from '../../models/types';

/** Stroke width used for the "final" (non-module) trace lines across all panel renders. */
export const PATH_STROKE_WIDTH = 2;

export interface HighlightedArc {
  arc: Arc;
  color: string;
}

/**
 * The spline control point whose textbox has focus, marked on canvas — the
 * point-shaped counterpart of {@link HighlightedArc}. Identified by source
 * rather than by object reference because a mirrored point draws two knots
 * and both should light up together (see svgPathMath's ArchSplineKnot).
 *
 * Which plate/shape it belongs to isn't carried here: a panel resolves that
 * before rendering and simply passes null for the plates that aren't focused.
 */
export interface HighlightedSplinePoint {
  /** Matches ArchSplineKnot.source: a control point's index, or SPLINE_PEAK_SOURCE. */
  source: number;
  color: string;
}
