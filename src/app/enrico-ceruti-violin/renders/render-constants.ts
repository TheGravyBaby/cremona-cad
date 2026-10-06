import { Arc, Pt } from '../../models/types';

/** Raw, mode-independent hex values. ceruti-violin.ts's `colors` getter runs these through
 *  contrast/saturation adjustment for the current theme — nothing here is drawn as-is. */
export const CERUTI_COLOR_PALETTE = {
  upperBout: '#4D8660',
  centerBoutUp: '#c2642e',
  centerBout: '#A97645',
  centerBoutLow: 'rgb(225, 174, 80)',
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
  pathError: '#d62828',
  neck: '#b07a3c',
  // the scroll's back cool and its front warm, as the plates' archBack and archTop are, each
  // alternating a deep and a light tone down its arcs; no red, which is the solve-failure colour
  scrollBack: '#5c82d6',
  scrollBackLight: '#93aeeb',
  scrollNape: '#3d5fb0',
  scrollFront: '#e8952f',
  scrollFrontLight: '#f4be6a',
  // the scroll widths' points: the front's warm like scrollFront, the back's a walk through the blues
  // from indigo at the duck tail to cyan at the eye, deep and light in turn so neighbours differ in
  // both hue and tone
  scrollWidthNut: '#c9972b',
  scrollWidthHip: '#f2c46d',
  scrollWidthThroat: '#d1661f',
  scrollWidthDuckTail: '#34519c',
  scrollWidthReach: '#9fb6ee',
  scrollWidthCrown: '#2a6fc0',
  scrollWidthTurn1Bottom: '#8fcbf0',
  scrollWidthTurn2Top: '#1f86b6',
  scrollWidthTurn2Bottom: '#7fd4e6',
  scrollWidthEye: '#1aa0a8',
  // the spiral a turn at a time from the eye out, its arcs alternating ivory and a darker tan, far
  // enough apart to follow one arc round in the four point's fields
  voluteTurn1: '#f2eadb',
  voluteTurn1Alt: '#b08a5a',
  voluteTurn2: '#e6dccb',
  voluteTurn2Alt: '#a8814f',
  voluteTurn3: '#dacfbb',
  voluteTurn3Alt: '#9c7650',
  neckRoot: '#d2691e',
  fingerboard: '#8a6cb8',
  nut: '#6f4d9a',
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
// visibly the lightest of their triad at the cost of falling short of full AA contrast. The
// scroll's light tones and the volute's Alt tones take it for the same reason: at one floor each
// deep/light pair lands on a single lightness.
export const LIGHT_CONTRAST_MIN_PALE = 2.0;

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
