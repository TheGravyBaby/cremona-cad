import { Arc, Pt } from '../../models/types';

/**
 * Named stroke-width tiers, screen px (every render call draws with
 * `vector-effect: non-scaling-stroke`, so these don't scale with zoom). One shared table rather
 * than each panel/render file picking its own literal, so the weight of a given kind of line is
 * consistent everywhere it's drawn and there's one place to change it.
 *
 *   trace     — a "final" outline/construction arc: the bout, corner and center-bout curves,
 *               the f-hole contours, anything that reads as the actual cut line.
 *   guide     — purfling, insets, and other secondary reference lines drawn alongside a trace.
 *   section   — the arch/channel/crown curves in the long- and cross-arching section views.
 *   focusHalo — the translucent halo behind an arc/point whose input field has focus
 *               (see renderArcHalo/renderPointHalo).
 */
export const STROKE_WEIGHT = {
  trace: 2,
  guide: 1,
  section: 1.5,
  focusHalo: 12,
} as const;

/** Raw, mode-independent hex values. ceruti-violin.ts's `colors` getter runs these through
 *  contrast/saturation adjustment for the current theme — nothing here is drawn as-is. */
export const CERUTI_COLOR_PALETTE = {
  upperBout: '#4D8660',
  centerBoutUp: '#C24B2E',
  centerBout: '#A97645',
  centerBoutLow: '#e1bf50ff',
  lowerBout: '#4D74A8',
  violNeck: '#248f48ff',
  innerTrace: '#868484ff',
  outerTrace: '#868484ff',
  mouldTrace: '#81887eff',
  fluting: '#478968ff',
  archTop: '#C47B3A',
  archBack: '#4D74A8',
  fHoleUpperDark: '#24714a',
  fHoleUpper: '#3fa568',
  fHoleUpperLight: '#7fd3a2',
  fHoleLowerDark: '#7a3e95',
  fHoleLower: '#a969b4',
  fHoleLowerLight: '#d0a3de',
  fHoleStem: '#8b939e',
  // the cut is the only warm thing in the f-hole drawing, and the only straight line the maker
  // actually cuts — everything either side of it is an arc
  fHoleCut: '#e08a1e',
  neck: '#b07a3c',
  neckRoot: '#d2691e',
  fingerboard: '#6f4d9a',
  bridge: '#d9d2c0',
} as const;

/** Degree of {@link https://en.wikipedia.org/wiki/HSL_and_HSV|greyOut} for a de-emphasized
 *  ("off"/"muted") color — OFF2 is the more de-emphasized of the two. */
export const OFF_FACTOR = 0.5;
export const OFF2_FACTOR = 0.8;

export const LIGHT_SATURATE_DEGREE = 0.4;
// must track --ui-bg-canvas under :root.day-mode in styles.css — the only place that color is
// otherwise defined. If that variable changes, this drifts out of sync silently.
export const LIGHT_MODE_CANVAS_BG = '#c3bfb3';
// WCAG non-text contrast floor (1.4.11) for strokes against the day-mode canvas.
export const LIGHT_CONTRAST_MIN = 3.0;
// centerBoutLow/fHoleUpperLight/fHoleLowerLight are the pale end of a dark/mid/light triad and
// sit at nearly the same lightness as the day-mode canvas itself. Holding them to the same 3:1
// floor as everything else would push them down onto their "mid" sibling's lightness — in
// f-hole-contours-panel.ts, U1/U2/U3 and L1/L2/L3 are adjacent arcs told apart by this triad
// while editing, so collapsing it isn't just a cosmetic loss. This lower floor keeps them
// visibly the lightest of their triad at the cost of falling short of full AA contrast.
export const LIGHT_CONTRAST_MIN_PALE = 2.0;

export interface HighlightedArc {
  arc: Arc;
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
