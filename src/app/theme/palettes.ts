// every colour and stroke the drawing uses. A palette is a list of inks, any length, that a panel
// reads by position (`pal.ink(1)`) wrapping past the end, so a panel wanting two inks can take a
// palette of six. Inks are picked for the night canvas; `theme.service.ts` remaps each into the
// band that reads by day. The names say where each palette was lifted from, not who may read it:
// a panel names any of them in its `paletteId`. Add a palette here and it's available
export interface Palette {
  name: string;
  inks: readonly string[];
}

export const PALETTES = {
  // the outline's colours from the app's first years: the corners' orange, the upper bout's green,
  // the lower bout's blue, and a violet for whatever a fourth part needs
  classicCremona: {
    name: 'Classic Cremona',
    inks: ['#c2642e', '#4d8660', '#4d74a8', '#a969b4'],
  },
  // the two plates as the arching panels first drew them: the top's warm, the fluting's green, the
  // back's blue
  plates: {
    name: 'Plates',
    inks: ['#c47b3a', '#478968', '#4d74a8', '#9a66b4'],
  },
  // the f-holes' first colours: the cut's orange, the upper eye's green, a blue, the lower eye's
  // violet. The stem draws in the neutral
  fHoles: {
    name: 'F-Holes',
    inks: ['#e08a1e', '#3fa568', '#4d74a8', '#a969b4'],
  },
  // the neck set's first colours: the neck's tan, the fret marks' green, the back plate's blue for
  // the button, the fingerboard's violet
  neck: {
    name: 'Neck',
    inks: ['#b07a3c', '#2e9e44', '#4d74a8', '#8a6cb8'],
  },
  // the scroll's first colours: the front's warm, the turns' green, the back's blue, the nut's violet
  scroll: {
    name: 'Scroll',
    inks: ['#e8952f', '#3aa58a', '#5c82d6', '#6f4d9a'],
  },
} as const satisfies Record<string, Palette>;

export type PaletteId = keyof typeof PALETTES;

// the trace grey for earlier work and construction, and the solve-failure red, belong to the
// theme rather than any palette, so they read the same whichever palette a panel took
export const NEUTRAL = '#868484';
export const ALERT = '#d62828';

// the toolbox's own colours: the pen a new shape is stamped with, the preview of a shape being
// drawn, and the selection, snap and grabber marks over it. Fixed in both modes, since a pen
// colour is saved into the shape and the marks sit over shapes of any colour
export const CANVAS_COLORS = {
  pen: '#1d4ed8',
  sectionAlt: '#93c5fd',
  preview: '#2563eb',
  snap: '#16a34a',
  selection: '#f59e0b',
  grabberStroke: '#78350f',
  highlighter: '#fde047',
} as const;

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
