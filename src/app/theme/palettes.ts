// every colour and stroke the drawing uses. A palette is a list of inks, any length, that a panel
// reads by position (`pal.ink(1)`) wrapping past the end, so a panel wanting two inks can take a
// palette of six. Each distinct part a panel draws takes its own ink, added here when the palette
// runs short; `faint(n)`, whole steps toward the canvas or away from it, only tells siblings of one
// part apart (the arcs of one bout, the turns of a spiral, a guide behind its subject), never
// stands in for another colour. Inks are picked for the night canvas; `theme.service.ts` remaps each into the band that
// reads by day. The names say where each palette was lifted from, not who may read it: a panel
// names any of them in `ThemeService.getPalette`
export interface Palette {
  name: string;
  inks: readonly string[];
}

// the trace grey for earlier work and construction, and the solve-failure red, belong to the
// theme rather than any palette, so they read the same whichever palette a panel took
export const NEUTRAL = '#868484';
export const ALERT = '#d62828';

// the canvas each mode draws on, pushed onto :root by the theme service; every ink is fitted
// against it
export const CANVAS = { night: '#1e1e1e', day: '#d8cfb1' } as const;

export const PALETTES = {
  classicCremona: {
    name: 'Classic Cremona',
    inks: ['#6450a1', '#4d74a8', '#4d8660', '#ffdf75', '#d38032', '#C24B2E'],
  },
  iceAndFire: {
    name: 'Ice and Fire',
    inks: ['#648f7b', '#e49338', '#7c95da'],
  },
  orchid: {
    name: 'Orchid',
    inks: ['#64ac70', '#d6b78e', '#6450a1', '#e49338'],
  },
  stones: {
    name: 'Stones',
    inks: ['#c57453', '#80719e', '#5a82b3', '#648f7b',],
  },
  varnish: {
    name: 'Varnish',
    inks: ['#d0803f', '#b4473c', '#e2bd9f'],
  },
} as const satisfies Record<string, Palette>;

export type PaletteId = keyof typeof PALETTES;


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
