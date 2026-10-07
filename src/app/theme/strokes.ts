// stroke widths in screen px, every render drawing non-scaling. trace is a cut line (bouts, corners,
// f-hole contours), guide a reference drawn beside one (purfling, insets), section the curves in the
// arching section views, focusHalo the halo behind a focused arc or point
export const STROKE_WEIGHT = {
  trace: 2,
  guide: 1,
  section: 1.5,
  focusHalo: 12,
} as const;

// dash patterns in screen px. hidden is a line behind the surface or a failed solve, guide a
// placement line laid across the drawing, fine a short reference drop, preview the toolbox's
// in-progress shapes and dashed strokes, construction the toolbox's radii and chords
export const DASH = {
  hidden: '4 4',
  guide: '6 6',
  fine: '2 2',
  preview: '4 3',
  construction: '2 4',
} as const;
