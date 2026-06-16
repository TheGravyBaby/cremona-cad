import { Arc } from '../../models/types';

/** Stroke width used for the "final" (non-module) trace lines across all panel renders. */
export const PATH_STROKE_WIDTH = 2;

export interface HighlightedArc {
  arc: Arc;
  color: string;
}
