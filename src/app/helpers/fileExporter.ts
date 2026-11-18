import type { jsPDF as JsPdf } from 'jspdf';
import { pathsBounds } from './math/pathMath';
import { LASER } from '../theme/palettes';

export type SvgPathExport = {
  d: string;
  stroke?: string;
  fill?: string;
  fillRule?: string;
  fillOpacity?: number;
  strokeWidth?: number | string;
  transform?: string;
  // a dash pattern, in the sheet's mm
  dash?: string;
  // the laser pass the bulk SVG puts it in (`LASER`); unmarked is an outline, cut last
  laser?: 'cut1' | 'cut2' | 'etch';
};

export type SvgTextExport = {
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  /** Degrees, counter-clockwise in drafting space (before the export's Y-flip). */
  rotationDeg?: number;
  // which end of the text x is; the middle unless said
  anchor?: 'start' | 'middle' | 'end';
  italic?: boolean;
  // a font family the PDF writer has built in
  font?: string;
};

// a drawing bound for a page, in its own frame and sized to itself, with the name its page goes by
export type PdfPage = {
  label: string;
  width: number;
  height: number;
  paths: SvgPathExport[];
  texts?: SvgTextExport[];
};

// a whole page as it prints, the paper's size, in the sheet's frame: centred on x = 0 from y = 0 up
export type PaperPage = {
  width: number;
  height: number;
  paths: SvgPathExport[];
  texts: SvgTextExport[];
};

export type PaperFormat = {
  name: string;
  width: number;  // mm – short edge (portrait)
  height: number; // mm – long edge (portrait)
};

/** Standard drafting paper formats (short × long edge, in mm). */
export const PAPER_FORMATS: Record<string, PaperFormat> = {
  // ISO A series
  A5:       { name: 'A5',     width: 148, height: 210  },
  A4:       { name: 'A4',     width: 210, height: 297  },
  A3:       { name: 'A3',     width: 297, height: 420  },
  A2:       { name: 'A2',     width: 420, height: 594  },
  A1:       { name: 'A1',     width: 594, height: 841  },
  A0:       { name: 'A0',     width: 841, height: 1189 },
};

// what a page of the scaled drawings keeps clear of its drawing for the header, the footer and the two
// scales: `pageContentSize` is the paper less these, and `helpers/sheetDraft.ts` lays the frame
// out inside them
const DRAWING_FRAME_WIDTH = 36;
const DRAWING_FRAME_HEIGHT = 50;
// mm of empty sheet round the content on every side: content starts on x = 0, y = 0, so with none a
// stroke on its lowest point is cut in half by the sheet's edge
const SHEET_PAD = 3;

// ─── SVG builders ────────────────────────────────────────────────────────────

function buildPathMarkup(paths: SvgPathExport[], strokeWidth: (p: SvgPathExport) => number | string): string {
  return paths
    .map(p => {
      const extras = [
        p.fillRule ? ` fill-rule="${p.fillRule}"` : '',
        p.fillOpacity != null ? ` fill-opacity="${p.fillOpacity}"` : '',
        p.transform ? ` transform="${p.transform}"` : '',
        p.dash ? ` stroke-dasharray="${p.dash}"` : '',
      ].join('');
      return `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'black'}" stroke-width="${strokeWidth(p)}"${extras}/>`;
    })
    .join('');
}

// The root <g> flips Y so drafting coordinates (Y-up) land correctly in SVG's Y-down
// space; that flip would also mirror text glyphs, so each <text> carries its own
// counter-transform — translate to its drafting position, undo the flip, then rotate —
// keeping labels upright (and rotated the intended way) regardless of the outer flip. A browser
// centres a label on its point by `dominant-baseline`; the PDF writer only reads
// `alignment-baseline`, so a label carries both.
// `laser` draws the glyphs as outlines in that colour, unfilled, since the cutter reads strokes only
function buildTextMarkup(texts: SvgTextExport[], laser?: string): string {
  const paint = (t: SvgTextExport) => laser
    ? `fill="none" stroke="${laser}" stroke-width="${LASER.hairline}" font-family="monospace"`
    : `fill="${t.color ?? 'black'}"${t.font ? ` font-family="${t.font}"` : ''}${t.italic ? ' font-style="italic"' : ''}`;
  const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return texts
    .map(t => `<text transform="translate(${t.x} ${t.y}) scale(1 -1) rotate(${-(t.rotationDeg ?? 0)})" text-anchor="${t.anchor ?? 'middle'}" dominant-baseline="central" alignment-baseline="central" ${paint(t)} font-size="${t.fontSize ?? 5}">${escaped(t.text)}</text>`)
    .join('');
}

const forLaser = (p: SvgPathExport): SvgPathExport =>
  ({ ...p, stroke: LASER[p.laser ?? 'cut2'], fill: 'none', fillOpacity: undefined, strokeWidth: LASER.hairline, dash: undefined });

// the sheet's frame: content centred on x = 0 from y = 0 up, y flipped to point up, SHEET_PAD of
// empty sheet round it
const sheetViewBox = (width: number, height: number) => `${-width / 2 - SHEET_PAD} ${-SHEET_PAD} ${width + 2 * SHEET_PAD} ${height + 2 * SHEET_PAD}`;

// a laser cutter's software drops a bare viewBox's units and zeroes on its origin, so the sheet
// starts at 0 0, states its size in mm, and carries a whole-mm box round the content with the
// box's dimensions written beside it
const BOX_MARGIN = 10;
function dimensionedSvg(width: number, height: number, markup: string, laser = false): string {
  const w = Math.ceil(width + 1);
  const h = Math.ceil(height + 1);
  const y0 = (height - h) / 2;
  const frame = [{ d: `M ${-w / 2} ${y0} H ${w / 2} V ${y0 + h} H ${-w / 2} Z`, stroke: laser ? LASER.guide : 'blue', strokeWidth: laser ? LASER.hairline : 0.25 }];
  const labels = buildTextMarkup([
    { text: `${w} mm`, x: 0, y: y0 + h + 5, fontSize: 4, color: 'blue' },
    { text: `${h} mm`, x: w / 2 + 5, y: y0 + h / 2, fontSize: 4, color: 'blue', rotationDeg: 90 },
  ], laser ? LASER.guide : undefined);
  const sheetW = w + 2 * BOX_MARGIN;
  const sheetH = h + 2 * BOX_MARGIN;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="${sheetW}mm" height="${sheetH}mm" viewBox="0 0 ${sheetW} ${sheetH}"><sodipodi:namedview id="namedview" inkscape:document-units="mm" units="mm"/><g transform="translate(${w / 2 + BOX_MARGIN} ${height - y0 + BOX_MARGIN}) scale(1 -1)"><g id="size-box">${buildPathMarkup(frame, p => p.strokeWidth ?? 0.25)}${labels}</g>${markup}</g></svg>`;
}

export function buildMirroredSvg(
  width: number,
  height: number,
  paths: SvgPathExport[],
  texts: SvgTextExport[] = []
): string {
  return dimensionedSvg(width, height, buildPathMarkup(paths, p => p.strokeWidth ?? 0.5) + buildTextMarkup(texts));
}

export type SvgPiece = { paths: SvgPathExport[]; texts?: SvgTextExport[] };

// many sheets' worth of pieces laid out on one, each still in its own frame, `dx`/`dy` the move
// that places it, in the sheet frame `sheetViewBox` draws. Skyline packing, tallest first: each piece
// drops from the top into the lowest place across the sheet it fits, leftmost on a tie, so short
// pieces fill in under a tall one's neighbours rather than starting a row of their own. The sheet is
// `maxWidth` wide, or failing that the side of a square that holds them all, and never narrower than
// the widest piece. A piece is placed by a move rather than by rewriting its path data, so arcs and
// relative commands come through untouched
export function packPieces(pieces: SvgPiece[], gap = 10, maxWidth?: number): { width: number; height: number; placed: Array<{ piece: SvgPiece; dx: number; dy: number }> } {
  const sized = pieces
    .map(piece => ({ piece, b: pathsBounds(piece.paths.map(p => p.d)) }))
    .sort((a, b) => b.b.height - a.b.height);
  const area = sized.reduce((sum, { b }) => sum + (b.width + gap) * (b.height + gap), 0);
  const limit = Math.max(...sized.map(({ b }) => b.width), maxWidth ?? Math.sqrt(area));

  // y runs down from the sheet's top here; each segment is how far down the sheet is filled over its span
  let sky = [{ x: 0, w: limit, y: 0 }];
  const depthOver = (x: number, w: number) =>
    Math.max(...sky.filter(seg => seg.x < x + w - 1e-9 && seg.x + seg.w > x + 1e-9).map(seg => seg.y));
  const spots = sized.map(({ piece, b }) => {
    let best = { x: 0, y: Infinity };
    for (const seg of sky) {
      if (seg.x + b.width > limit + 1e-9) break;
      const y = depthOver(seg.x, Math.min(b.width + gap, limit - seg.x));
      if (y < best.y - 1e-9) best = { x: seg.x, y };
    }
    const end = Math.min(best.x + b.width + gap, limit);
    sky = [
      ...sky.flatMap(seg => seg.x < best.x ? [{ ...seg, w: Math.min(seg.w, best.x - seg.x) }] : []),
      { x: best.x, w: end - best.x, y: best.y + b.height + gap },
      ...sky.flatMap(seg => seg.x + seg.w > end ? [{ x: Math.max(seg.x, end), w: seg.x + seg.w - Math.max(seg.x, end), y: seg.y }] : []),
    ].filter(seg => seg.w > 1e-9);
    return { piece, b, ...best };
  });

  const width = Math.max(0, ...spots.map(s => s.x + s.b.width));
  const height = Math.max(0, ...spots.map(s => s.y + s.b.height));
  return {
    width,
    height,
    placed: spots.map(({ piece, b, x, y }) => ({ piece, dx: x - width / 2 - b.minX, dy: height - y - b.maxY })),
  };
}

// the packed pieces as one SVG, each its own group so it moves as one in an editor. This is the
// sheet that goes to the laser, so it alone is drawn in the machine's codes (`LASER`): every
// stroke a hairline, the passes told apart by colour, labels etched
export function buildPackedSvg(pieces: SvgPiece[], gap = 10): string {
  const { width, height, placed } = packPieces(pieces, gap);
  const groups = placed.map(({ piece, dx, dy }) =>
    `<g transform="translate(${dx} ${dy})">${buildPathMarkup(piece.paths.map(forLaser), p => p.strokeWidth!)}${buildTextMarkup(piece.texts ?? [], LASER.etch)}</g>`);
  return dimensionedSvg(width, height, groups.join(''), true);
}

// the packed pieces as one PDF page's content: each path carries its piece's move as a transform,
// each label is moved outright
export function packedPage(pieces: SvgPiece[], gap = 10, maxWidth?: number): { width: number; height: number; paths: SvgPathExport[]; texts: SvgTextExport[] } {
  const { width, height, placed } = packPieces(pieces, gap, maxWidth);
  return {
    width,
    height,
    paths: placed.flatMap(({ piece, dx, dy }) => piece.paths.map(p => ({ ...p, transform: `translate(${dx} ${dy})` }))),
    texts: placed.flatMap(({ piece, dx, dy }) => (piece.texts ?? []).map(t => ({ ...t, x: t.x + dx, y: t.y + dy }))),
  };
}

function buildScaledSvg(
  width: number,
  height: number,
  paths: SvgPathExport[],
  texts: SvgTextExport[] = []
): string {
  const markup = buildPathMarkup(paths, p => p.strokeWidth ?? 0.5) + buildTextMarkup(texts);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     width="${width + 2 * SHEET_PAD}mm" height="${height + 2 * SHEET_PAD}mm"`,
    `     viewBox="${sheetViewBox(width, height)}">`,
    `  <g transform="translate(0 ${height}) scale(1 -1)">`,
    `    ${markup}`,
    `  </g>`,
    `</svg>`,
  ].join('\n');
}

// ─── standard page selection ─────────────────────────────────────────────────

// the drawing a page of this paper holds inside its frame, upright or turned
export function pageContentSize(format: PaperFormat, landscape: boolean): { width: number; height: number } {
  const [w, h] = landscape ? [format.height, format.width] : [format.width, format.height];
  return { width: w - DRAWING_FRAME_WIDTH, height: h - DRAWING_FRAME_HEIGHT };
}

// whether a drawing fits this paper turned, upright first; null if it fits neither way
function orientationOn(format: PaperFormat, width: number, height: number): boolean | null {
  for (const landscape of [false, true]) {
    const area = pageContentSize(format, landscape);
    if (width <= area.width + 1e-9 && height <= area.height + 1e-9) return landscape;
  }
  return null;
}

const FORMATS_BY_AREA = Object.values(PAPER_FORMATS).sort((a, b) => a.width * a.height - b.width * b.height);

// the smallest standard paper every one of these drawings fits on, each upright or turned, or null
// when one is too large for any
export function paperFor(sizes: Array<{ width: number; height: number }>): PaperFormat | null {
  return FORMATS_BY_AREA.find(format => sizes.every(sz => orientationOn(format, sz.width, sz.height) !== null)) ?? null;
}

// the page a drawing this size prints on: `paper` when given and it fits there, upright or turned,
// else the smallest standard paper it fits, else a page cut to the drawing and its frame
export function pageSizeFor(width: number, height: number, paper: PaperFormat | null = null): { width: number; height: number } {
  const format = paper && orientationOn(paper, width, height) !== null ? paper : paperFor([{ width, height }]);
  if (!format) return { width: width + DRAWING_FRAME_WIDTH, height: height + DRAWING_FRAME_HEIGHT };
  return orientationOn(format, width, height) ? { width: format.height, height: format.width } : { width: format.width, height: format.height };
}

export type PieceGroup = { label: string; pieces: SvgPiece[] };

// groups of pieces onto pages of one paper. A group joins the page before it if it fits there beside
// what's on it and starts a page of its own if not; only a group too big for one page is split, piece
// by piece. A page is labelled with every group on it. With no paper, each group is a page sized to
// itself
export function paginatePieces(groups: PieceGroup[], format: PaperFormat | null, gap = 10): PdfPage[] {
  if (!format) return groups.map(g => ({ label: g.label, ...packedPage(g.pieces, gap) }));
  const fit = (pieces: SvgPiece[]) => {
    for (const landscape of [false, true]) {
      const area = pageContentSize(format, landscape);
      const packed = packedPage(pieces, gap, area.width);
      if (orientationOn(format, packed.width, packed.height) !== null) return packed;
    }
    return null;
  };
  const pages: PdfPage[] = [];
  let labels: string[] = [];
  let pieces: SvgPiece[] = [];
  const close = () => {
    if (pieces.length) pages.push({ label: labels.join(', '), ...(fit(pieces) ?? packedPage(pieces, gap)) });
    labels = [];
    pieces = [];
  };
  for (const group of groups) {
    if (!fit([...pieces, ...group.pieces])) close();
    if (!pieces.length && !fit(group.pieces)) {
      for (const piece of group.pieces) {
        if (pieces.length && !fit([...pieces, piece])) close();
        pieces.push(piece);
        labels = [group.label];
      }
      continue;
    }
    pieces.push(...group.pieces);
    labels.push(group.label);
  }
  close();
  return pages;
}

// ─── public export functions ─────────────────────────────────────────────────

// fetched on the first PDF export rather than with the app: jspdf and svg2pdf are near half a
// megabyte that a session drafting on screen never needs
async function loadPdf() {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  return { jsPDF, svg2pdf };
}

// every page drawn whole from its paths and texts, each on paper its own size
export async function downloadPdf(filename: string, pages: PaperPage[]): Promise<void> {
  if (!pages.length) return;
  const { jsPDF, svg2pdf } = await loadPdf();
  const parser = new DOMParser();
  let doc: JsPdf | null = null;
  for (const { width, height, paths, texts } of pages) {
    const orientation = width > height ? 'landscape' : 'portrait';
    if (!doc) doc = new jsPDF({ orientation, unit: 'mm', format: [width, height] });
    else doc.addPage([width, height], orientation);
    const svgEl = parser.parseFromString(buildScaledSvg(width, height, paths, texts), 'image/svg+xml').documentElement as unknown as SVGSVGElement;
    await svg2pdf(svgEl, doc, { x: -SHEET_PAD, y: -SHEET_PAD, width: width + 2 * SHEET_PAD, height: height + 2 * SHEET_PAD });
  }
  doc!.save(filename);
}

export function downloadSvgFile(filename: string, svgContent: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
