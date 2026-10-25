// Every glyph the app draws on a button, one 24-unit square each, stroked in currentColor so it
// follows its button's colour in either theme. A template draws one with <svg icon="name">; a page
// of the info booth with :name:. An icon states only what differs from DEFAULT_ATTRS, so the set
// keeps one weight, one cap and one join unless a glyph has a reason not to.

export const DEFAULT_ATTRS: Record<string, string> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
};

type IconDef = string | { body: string; attrs: Record<string, string> };

// a construction mark beside the stroke it explains: thin, dashed, square-ended
const GUIDE = 'stroke-width="1.1" stroke-dasharray="2 2.6" stroke-linecap="butt"';
const DOT = 'fill="currentColor" stroke="none"';
const TRASH = '<polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />';
const TRAY = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />';
const EYE_OPEN = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />';

export const ICONS = {
  select: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />',

  line: '<line x1="5" y1="19" x2="19" y2="5" />',
  polyline: '<path d="M4 18L9 7L15 15L20 6" />',
  'line-tangent': `<circle cx="14" cy="14" r="6" stroke-width="1.4" />
    <line x1="3.76" y1="15.76" x2="16.76" y2="2.76" />
    <circle cx="9.76" cy="9.76" r="1.6" ${DOT} />`,
  'line-perpendicular': `<path d="M3 19H21M12 19V4" />
    <path d="M12 14.5H16.5V19" stroke-width="1.4" stroke-linejoin="miter" />`,

  // The four hand-placed arc constructions share one glyph and one grammar, so the flyout reads
  // as a family: solid dots are the points you click, dashed spokes are radii, and the hub is
  // filled when the center is the first click, hollow when it comes later, and absent entirely
  // from the one construction that never asks for a center. The marks migrate off the hub and
  // onto the curve as the center click moves later in the sequence. The hub is at 19,19 — the
  // quarter arc below bows away from it, so that corner is its center of curvature.
  arc: `<path d="M4 19a15 15 0 0 1 15-15" />
    <path d="M15.8 19H4M19 15.8V4" ${GUIDE} />
    <circle cx="19" cy="19" r="2" ${DOT} />`,
  'arc-start': `<path d="M4 19a15 15 0 0 1 15-15" />
    <path d="M15.8 19H4" ${GUIDE} />
    <circle cx="4" cy="19" r="2.2" ${DOT} />
    <circle cx="19" cy="19" r="1.7" stroke-width="1.1" />`,
  'arc-ends-center': `<path d="M4 19a15 15 0 0 1 15-15" />
    <path d="M15.8 19H4M19 15.8V4" ${GUIDE} />
    <circle cx="4" cy="19" r="2.2" ${DOT} />
    <circle cx="19" cy="4" r="2.2" ${DOT} />
    <circle cx="19" cy="19" r="1.7" stroke-width="1.1" />`,
  // no hub and no spokes at all: every point of this construction sits on the curve itself, the
  // third one at 8.4,8.4, the arc's own midpoint
  'arc-through': `<path d="M4 19a15 15 0 0 1 15-15" />
    <circle cx="4" cy="19" r="2.2" ${DOT} />
    <circle cx="19" cy="4" r="2.2" ${DOT} />
    <circle cx="8.4" cy="8.4" r="2.2" ${DOT} />`,
  'arc-tangent': `<path d="M3 15L10 15" />
    <path d="M10 15C16 15 20 11 20 5" />
    <circle cx="3" cy="15" r="1.4" ${DOT} />`,
  'arc-chain': `<path d="M4 20A8 8 0 0 1 12 12" />
    <path d="M12 12A6 6 0 0 0 20 4" />
    <circle cx="12" cy="12" r="1.4" ${DOT} />`,
  'join-arc': `<path d="M3 17a9 9 0 0 1 8-9" />
    <path d="M21 7a9 9 0 0 1-8 9" />
    <circle cx="12" cy="12" r="1.6" ${DOT} />`,

  circle: '<circle cx="12" cy="12" r="8" />',
  'polygon-3': '<polygon points="12,4.5 19.79,18 4.21,18" />',
  'polygon-4': '<rect x="5.5" y="5.5" width="13" height="13" />',
  'polygon-5': '<polygon points="12,3.5 20.08,9.37 17,18.88 7,18.88 3.92,9.37" />',
  'polygon-6': '<polygon points="12,3.5 19.36,7.75 19.36,16.25 12,20.5 4.64,16.25 4.64,7.75" />',
  'polygon-8': '<polygon points="8.75,4.15 15.25,4.15 19.85,8.75 19.85,15.25 15.25,19.85 8.75,19.85 4.15,15.25 4.15,8.75" />',
  rect: '<rect x="4" y="6" width="16" height="12" />',
  'right-triangle': '<polygon points="5,5 5,19 19,19" />',

  catenary: `<path d="M4 5C6.5 21 17.5 21 20 5" />
    <circle cx="4" cy="5" r="1.8" ${DOT} />
    <circle cx="20" cy="5" r="1.8" ${DOT} />`,
  // a strip bent through three pins, running on straight past the end ones
  batten: `<path d="M1.9 18.7L3 17C5.8 12.6 8.6 8.2 12 8C14.7 7.8 17.9 10.4 21 13L22.5 14.3" />
    <circle cx="3" cy="17" r="2" ${DOT} />
    <circle cx="12" cy="8" r="2" ${DOT} />
    <circle cx="21" cy="13" r="2" ${DOT} />`,
  // a true cycloid, traced by the point on the rim of the circle rolling along the baseline
  cycloid: `<path d="M1 19H23" stroke-width="1.4" />
    <circle cx="15.00" cy="12.00" r="7" stroke-width="1.4" />
    <path d="M1.00 19.00 L1.01 18.86 L1.07 18.45 L1.25 17.78 L1.58 16.88 L2.11 15.78 L2.88 14.54 L3.90 13.19 L5.20 11.80 L6.78 10.41 L8.63 9.09" />
    <circle cx="8.63" cy="9.09" r="1.8" ${DOT} />`,

  dimension: `<line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="7" x2="4" y2="17" />
    <line x1="20" y1="7" x2="20" y2="17" />`,
  angle: `<path d="M20 20H4L15 6" />
    <path d="M13 20A9 9 0 0 0 9.56 12.93" stroke-width="1.4" />`,
  'curve-length': `<path d="M4 18C8 8 16 8 20 18" />
    <path d="M1.2 16.9L6.8 19.1M17.2 19.1L22.8 16.9" stroke-width="1.4" />`,
  'curve-ticks': `<path d="M4 18C8 8 16 8 20 18" stroke-width="1.4" />
    <path d="M1.2 16.9L6.8 19.1M5.9 10.5L9.3 14.2M12 8V13M18.1 10.5L14.7 14.2M17.2 19.1L22.8 16.9" />`,
  section: `<rect x="3" y="8" width="18" height="8" />
    <line x1="9" y1="8" x2="9" y2="16" />
    <line x1="15" y1="8" x2="15" y2="16" />`,
  ticks: `<line x1="3" y1="12" x2="21" y2="12" stroke-width="1.5" />
    <line x1="3" y1="7" x2="3" y2="17" />
    <line x1="9" y1="9" x2="9" y2="15" />
    <line x1="15" y1="9" x2="15" y2="15" />
    <line x1="21" y1="7" x2="21" y2="17" />`,

  text: `<text x="12" y="19" font-size="22" text-anchor="middle" ${DOT} font-family="">T</text>`,
  point: `<line x1="12" y1="4" x2="12" y2="20" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <circle cx="12" cy="12" r="2.5" ${DOT} />`,
  freehand: '<path d="M3 17c2-6 3-9 5-9s2 5 4 5 2-8 4-8 2 10 5 10" />',
  eraser: `<path d="M18 13l-7.5 7.5a2 2 0 0 1-2.8 0L3 15.8a2 2 0 0 1 0-2.8L13.2 2.8a2 2 0 0 1 2.8 0L20.8 7.6a2 2 0 0 1 0 2.8L18 13z" />
    <path d="M8.5 8.5l7 7" />
    <line x1="6" y1="20.5" x2="19" y2="20.5" />`,

  move: `<path d="M12 3v18M3 12h18" />
    <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />`,
  offset: `<path d="M4 19a15 15 0 0 1 15-15" />
    <path d="M8 19a11 11 0 0 1 11-11" stroke-dasharray="3 2.5" />`,
  fillet: `<path d="M4 21V12A8 8 0 0 1 12 4H21" />
    <path d="M4 12V4H12" stroke-width="1.1" stroke-dasharray="1.6 1.8" stroke-linecap="butt" stroke-linejoin="miter" />`,
  // a turn swept from a spoke about the dot it turns on; the pivot is what sets it apart from the
  // quarter turns beside it, which turn about the selection's own centre
  rotate: `<path d="M20 12A8 8 0 1 1 12 4" />
    <path d="M9.5 1.5L12.5 4L9.5 6.5" />
    <path d="M12 12H20" stroke-width="1.1" stroke-dasharray="2 2.2" stroke-linecap="butt" />
    <circle cx="12" cy="12" r="1.6" ${DOT} />`,
  'rotate-ccw': `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />`,
  'rotate-cw': `<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />`,
  scale: `<rect x="3" y="13" width="8" height="8" stroke-width="1.1" stroke-dasharray="2 2" />
    <path d="M3 9V3h18v18h-6" />
    <path d="M11 13l7-7M13 6h5v5" />`,

  // the shape (a triangle, as on the flips) and its image either side of a slanted axis
  'mirror-line': `<path d="M3 4h8L3 12z" />
    <path d="M20 21v-8l-8 8z" />
    <path d="M3 21 21 3" ${GUIDE} />`,
  'flip-h': `<path d="M9 6v12H3z" />
    <path d="M15 6v12h6z" />
    <path d="M12 3v18" ${GUIDE} />`,
  'flip-v': `<path d="M6 9h12V3z" />
    <path d="M6 15h12v6z" />
    <path d="M3 12h18" ${GUIDE} />`,
  // half a body and its dashed mirror either side of a drafting centreline (long dash, short
  // dash): the other half of the instrument
  'flip-centreline': `<path d="M10.5 2.5C7 2.5 4.5 3.8 4.5 6.5C4.5 9 7.5 9.5 7.5 12C7.5 14.5 3.5 14.8 3.5 17.8C3.5 20.5 7 21.5 10.5 21.5" />
    <path d="M13.5 2.5C17 2.5 19.5 3.8 19.5 6.5C19.5 9 16.5 9.5 16.5 12C16.5 14.5 20.5 14.8 20.5 17.8C20.5 20.5 17 21.5 13.5 21.5" stroke-dasharray="2.4 2.2" />
    <path d="M12 1v22" stroke-width="1.1" stroke-dasharray="4 1.6 1 1.6" stroke-linecap="butt" />`,

  'align-left': `<path d="M4 3v18" />
    <rect x="8" y="6" width="12" height="4" rx="1" />
    <rect x="8" y="14" width="7" height="4" rx="1" />`,
  'align-centre': `<path d="M12 3v3M12 10v4M12 18v3" />
    <rect x="5" y="6" width="14" height="4" rx="1" />
    <rect x="8" y="14" width="8" height="4" rx="1" />`,
  'align-right': `<path d="M20 3v18" />
    <rect x="4" y="6" width="12" height="4" rx="1" />
    <rect x="9" y="14" width="7" height="4" rx="1" />`,
  'align-top': `<path d="M3 4h18" />
    <rect x="6" y="8" width="4" height="12" rx="1" />
    <rect x="14" y="8" width="4" height="7" rx="1" />`,
  'align-middle': `<path d="M3 12h3M10 12h4M18 12h3" />
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="8" width="4" height="8" rx="1" />`,
  'align-bottom': `<path d="M3 20h18" />
    <rect x="6" y="4" width="4" height="12" rx="1" />
    <rect x="14" y="9" width="4" height="7" rx="1" />`,
  'distribute-h': `<path d="M3 4v16M21 4v16" />
    <rect x="7" y="8" width="3" height="8" rx="1" />
    <rect x="14" y="8" width="3" height="8" rx="1" />`,
  'distribute-v': `<path d="M4 3h16M4 21h16" />
    <rect x="8" y="7" width="8" height="3" rx="1" />
    <rect x="8" y="14" width="8" height="3" rx="1" />`,
  group: `<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2.5" />
    <rect x="7" y="7" width="4" height="4" />
    <circle cx="15" cy="15" r="2.2" />`,
  ungroup: `<rect x="4" y="4" width="6" height="6" />
    <circle cx="16.5" cy="16.5" r="3" />`,
  // the filled square is the selection; which one overlaps the other says where it goes
  front: `<rect x="3" y="3" width="12" height="12" rx="1" />
    <rect x="9" y="9" width="12" height="12" rx="1" fill="currentColor" />`,
  back: `<rect x="9" y="9" width="12" height="12" rx="1" fill="currentColor" />
    <rect x="3" y="3" width="12" height="12" rx="1" fill="var(--ui-canvas-btn-bg-end)" />`,

  undo: '<polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" />',
  redo: '<polyline points="15 14 20 9 15 4" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" />',
  cut: `<circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />`,
  copy: `<rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />`,
  paste: `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />`,
  duplicate: `<rect x="3" y="3" width="11" height="11" rx="2" />
    <rect x="10" y="10" width="11" height="11" rx="2" />`,
  delete: TRASH,
  clear: `${TRASH}<line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />`,
  download: `${TRAY}<polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />`,
  upload: `${TRAY}<polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />`,
  'move-to-layer': `<path d="M12 3v11M7 9l5 5 5-5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />`,
  link: `<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />`,

  layers: `<polygon points="12 3 21 8 12 13 3 8 12 3" />
    <polyline points="3 13 12 18 21 13" />
    <polyline points="3 18 12 23 21 18" />`,
  image: `<rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />`,
  axes: `<path d="M4 20V4" />
    <path d="M1.5 8L4 4l2.5 4" />
    <path d="M4 20h16" />
    <path d="M16 22.5L20 20l-4-2.5" />`,
  // one eye for "visible" wherever it appears, so it reads the same on every strip
  eye: EYE_OPEN,
  'eye-off': `<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />`,
  lock: '<rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />',
  unlock: '<rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 9.5-2.2" />',

  pen: '<path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /><path d="M15 5l4 4" />',
  highlighter: `<path d="M9 11l6 6-3 3H8v-4l1-1" />
    <path d="M14 6l4 4" />
    <path d="M17.5 2.5l4 4L11 17l-6-6L15.5 2.5a2 2 0 0 1 2 0z" />`,
  'fade-white': '<path d="M12 3c3.5 4 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 8.5 7 12 3z" />',
  'mirror-image': '<path d="M12 3v18" /><path d="M16 7l4 5-4 5" /><path d="M8 7l-4 5 4 5" />',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M2 6h14a2 2 0 0 1 2 2v14" />',
  'panel-scope': '<path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" />',

  fit: `<path d="M9 4H5a1 1 0 0 0-1 1v4" />
    <path d="M15 4h4a1 1 0 0 1 1 1v4" />
    <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
    <path d="M15 20h4a1 1 0 0 0 1-1v-4" />`,
  plus: '<path d="M12 5v14M5 12h14" />',
  minus: '<line x1="5" y1="12" x2="19" y2="12" />',
  'chevron-down': '<path d="M6 9l6 6 6-6" />',
  'chevron-up': '<path d="M6 15l6-6 6 6" />',
  settings: {
    body: '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />',
    attrs: { 'stroke-width': '1.8' },
  },
  day: {
    body: '<circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />',
    attrs: { 'stroke-width': '1.6' },
  },
  night: {
    body: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />',
    attrs: { 'stroke-width': '1.6' },
  },
  'day-night': {
    body: '<circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />',
    attrs: { 'stroke-width': '1.6' },
  },

  'module-arcs': `<path d="M4 19a15 15 0 0 1 15-15" />
    <line x1="4" y1="19" x2="19" y2="19" opacity="0.25" />
    <line x1="19" y1="4" x2="19" y2="19" opacity="0.25" />`,
  'all-arcs': {
    body: '<rect x="3" y="3" width="13" height="13" rx="2" /><path d="M21 8v11a2 2 0 0 1-2 2H8" />',
    attrs: { 'stroke-width': '2.5' },
  },
  'module-guides': `<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5" />
    <line x1="12" y1="2" x2="12" y2="22" stroke-dasharray="2 2" />
    <line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="2 2" />`,
  'fhole-bounds': `<rect x="3" y="4" width="18" height="16" rx="1" stroke-dasharray="3 2.5" />
    <line x1="11" y1="4" x2="9" y2="20" stroke-dasharray="2 2" />
    <line x1="17" y1="4" x2="15" y2="20" stroke-dasharray="2 2" />`,
  'placement-guides': `<circle cx="8" cy="15" r="6" opacity="0.45" />
    <circle cx="16" cy="13" r="7" opacity="0.45" />
    <circle cx="12.4" cy="9.4" r="1.7" ${DOT} />`,
  'fluting-edge': `<path d="M4 19a15 15 0 0 1 15-15" />
    <path d="M4 12a8 8 0 0 1 8-8" opacity="0.45" />`,
  'volute-construction': `<circle cx="12" cy="12" r="9" />
    <rect x="10.5" y="7" width="3" height="10" stroke-width="1.5" />
    <line x1="10.5" y1="12" x2="13.5" y2="12" stroke-width="1.5" />`,
  fingerboard: '<rect x="7" y="2" width="10" height="20" rx="3" />',
  'scoop-guide': `<line x1="3" y1="8" x2="21" y2="8" opacity="0.4" />
    <path d="M3 8 Q 12 17 21 8" />
    <line x1="12" y1="12.5" x2="12" y2="21" opacity="0.4" />`,
  'fret-marks': `<line x1="12" y1="3" x2="12" y2="21" opacity="0.4" />
    <line x1="6" y1="7" x2="9" y2="7" />
    <line x1="6" y1="12" x2="9" y2="12" />
    <line x1="6" y1="17" x2="9" y2="17" />`,
  blocks: `<rect x="9" y="2" width="6" height="4" rx="1" />
    <rect x="9" y="18" width="6" height="4" rx="1" />
    <rect x="2" y="9" width="5" height="6" rx="1" />
    <rect x="17" y="9" width="5" height="6" rx="1" />`,
  'rib-outline': `<rect x="2" y="2" width="20" height="20" rx="4" />
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" stroke-dasharray="3 2.5" />`,
  circles: '<circle cx="12" cy="7" r="5" /><circle cx="12" cy="17" r="6" />',

  // the corner of a button that holds variants behind it
  'flyout-mark': {
    body: '<path d="M8 0v8H0z" />',
    attrs: { viewBox: '0 0 8 8', fill: 'currentColor', stroke: 'none' },
  },
  // Hinge, the quadrant, and two long legs. The quadrant rides high near the hinge, where a real
  // compass carries its adjuster: down between the points it read as a capital A's crossbar, and
  // what makes this a compass rather than a triangle is the length of leg below it. Weight and
  // height are matched to the f-hole on the panel's tab.
  compass: {
    body: `<circle cx="12" cy="3.2" r="2" />
      <path d="M11 5 6 22.5" />
      <path d="M13 5 18 22.5" />
      <path d="M9.5 9.5a7 7 0 0 1 5 0" />`,
    attrs: { 'stroke-width': '1.4' },
  },
  // A joiner's mallet, for the bench, where a piece already drawn is worked on: splayed faces and
  // a head curved top and bottom, as the real one's is. Two marks, head and handle, at the
  // compass's height and stroke, so the tabs carry the same weight.
  mallet: {
    body: '<path d="M6 3.4Q12 1.6 18 3.4L16.8 10Q12 8.4 7.2 10Z" /><path d="M12 9.3V22.5" />',
    attrs: { 'stroke-width': '1.4' },
  },
  fhole: {
    body: '<path transform="scale(0.86 1)" d="M15.1 0.6C15.8 0.4 16.3 0.4 16.6 0.6C17 0.8 17.4 1.3 17.4 1.6C17.4 1.9 17.4 2.2 16.8 2.2C16.2 2.3 14.5 1.7 13.8 1.9C13 2 13 1.6 12.4 3.1C11.8 4.7 10.5 9.7 10.1 11.1C9.7 12.5 10 11.4 10.1 11.6C10.2 11.8 10.8 12.1 10.7 12.3C10.7 12.4 10.1 11.9 9.7 12.8C9.4 13.6 9.1 16 8.7 17.1C8.4 18.2 8.2 18.8 7.9 19.4C7.6 20 7.4 20.3 7 20.8C6.6 21.2 5.9 21.9 5.5 22.3C5 22.6 4.7 22.8 4.2 23C3.8 23.2 3.3 23.4 2.7 23.4C2.2 23.4 1.3 23.4 1 23.3C0.6 23.2 0.7 23.1 0.6 22.9C0.5 22.7 0.5 22.3 0.6 22.1C0.7 22 0.4 21.8 1.1 21.8C1.8 21.7 3.8 22 4.6 21.9C5.4 21.8 5.5 21.5 5.9 21C6.2 20.6 6.2 20.5 6.6 19.1C7 17.8 7.9 14.2 8.1 13.1C8.4 12 8.3 12.9 8.1 12.6C8 12.4 7.2 12 7.2 11.7C7.3 11.5 8.1 12.1 8.6 11C9.1 9.8 9.8 6.2 10.2 4.9C10.7 3.5 10.9 3.6 11.2 3.1C11.6 2.6 12 2.1 12.6 1.7C13.3 1.3 14.5 0.8 15.1 0.6Z" />',
    attrs: { viewBox: '0 0 15.47 24', fill: 'currentColor', 'stroke-width': '0.45' },
  },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export function isIconName(name: string): name is IconName {
  return Object.hasOwn(ICONS, name);
}

export function iconBody(name: IconName): string {
  const def: IconDef = ICONS[name];
  return typeof def === 'string' ? def : def.body;
}

export function iconAttrs(name: IconName): Record<string, string> {
  const def: IconDef = ICONS[name];
  return typeof def === 'string' ? DEFAULT_ATTRS : { ...DEFAULT_ATTRS, ...def.attrs };
}

// the whole <svg> as markup, for places that build HTML as a string rather than through a template
export function iconSvg(name: IconName, size: number, attrs: Record<string, string> = {}): string {
  const all = { width: String(size), height: String(size), ...iconAttrs(name), ...attrs };
  const list = Object.entries(all).map(([k, v]) => `${k}="${v}"`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" ${list}>${iconBody(name)}</svg>`;
}
