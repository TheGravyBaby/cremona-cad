import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { pathsBounds } from './math/pathMath';

export type SvgPathExport = {
  d: string;
  stroke?: string;
  fill?: string;
  fillRule?: string;
  fillOpacity?: number;
  strokeWidth?: number | string;
  transform?: string;
};

export type SvgTextExport = {
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  /** Degrees, counter-clockwise in drafting space (before the export's Y-flip). */
  rotationDeg?: number;
};

export type PdfPage = {
  label: string;
  width: number;
  height: number;
  paths: SvgPathExport[];
  texts?: SvgTextExport[];
  fileName?: string;
  description?: string;
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

// ─── layout constants ────────────────────────────────────────────────────────
const MARGIN_X = 12;      // mm left & right
const MARGIN_TOP = 8;     // mm top
const MARGIN_BOTTOM = 30; // mm bottom (title block lives here)
const BORDER_INSET = 3;   // mm from page edge to thick outer border
const INNER_PAD = 3;      // mm gap between content border and path
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
      ].join('');
      return `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'black'}" stroke-width="${strokeWidth(p)}"${extras}/>`;
    })
    .join('');
}

// The root <g> flips Y so drafting coordinates (Y-up) land correctly in SVG's Y-down
// space; that flip would also mirror text glyphs, so each <text> carries its own
// counter-transform — translate to its drafting position, undo the flip, then rotate —
// keeping labels upright (and rotated the intended way) regardless of the outer flip.
function buildTextMarkup(texts: SvgTextExport[]): string {
  return texts
    .map(t => `<text transform="translate(${t.x} ${t.y}) scale(1 -1) rotate(${-(t.rotationDeg ?? 0)})" text-anchor="middle" dominant-baseline="central" fill="${t.color ?? 'black'}" font-size="${t.fontSize ?? 5}">${t.text}</text>`)
    .join('');
}

// the sheet's frame: content centred on x = 0 from y = 0 up, y flipped to point up, SHEET_PAD of
// empty sheet round it
const sheetViewBox = (width: number, height: number) => `${-width / 2 - SHEET_PAD} ${-SHEET_PAD} ${width + 2 * SHEET_PAD} ${height + 2 * SHEET_PAD}`;

export function buildMirroredSvg(
  width: number,
  height: number,
  paths: SvgPathExport[],
  texts: SvgTextExport[] = []
): string {
  const markup = buildPathMarkup(paths, p => p.strokeWidth ?? 0.5) + buildTextMarkup(texts);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sheetViewBox(width, height)}"><g transform="translate(0 ${height}) scale(1 -1)">${markup}</g></svg>`;
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

// the packed pieces as one SVG, each its own group so it moves as one in an editor
export function buildPackedSvg(pieces: SvgPiece[], gap = 10): string {
  const { width, height, placed } = packPieces(pieces, gap);
  const groups = placed.map(({ piece, dx, dy }) =>
    `<g transform="translate(${dx} ${dy})">${buildPathMarkup(piece.paths, p => p.strokeWidth ?? 0.5)}${buildTextMarkup(piece.texts ?? [])}</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sheetViewBox(width, height)}"><g transform="translate(0 ${height}) scale(1 -1)">${groups.join('')}</g></svg>`;
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
  const markup = buildPathMarkup(paths, () => 0.5) + buildTextMarkup(texts);
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

// ─── drafting frame ──────────────────────────────────────────────────────────

function drawDraftingFrame(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  opts: {
    pathWidth: number;
    pathHeight: number;
    pageW: number;
    pageH: number;
    offsetX: number;
    offsetY: number;
    fileName: string;
    description: string;
    sheetLabel: string;
    paperFormatName: string;
  }
): void {
  const {
    pathWidth, pathHeight, pageW, pageH,
    offsetX, offsetY,
    fileName, description, sheetLabel,
    paperFormatName,
  } = opts;

    // ── constants ────────────────────────────────────────────────────────
    const MINOR = 0.8;
    const MAJOR = 1.8;
    const bi2 = BORDER_INSET + 1.4;

    // ── double-line outer border ─────────────────────────────────────────
    doc.setDrawColor(0);
    doc.setLineWidth(0.7);
    doc.rect(BORDER_INSET, BORDER_INSET, pageW - BORDER_INSET * 2, pageH - BORDER_INSET * 2);
    doc.setLineWidth(0.2);
    doc.rect(bi2, bi2, pageW - bi2 * 2, pageH - bi2 * 2);

    // ── title block geometry (computed early; anchored to page bottom) ───
    const tbX = bi2 + 0.5;
    const tbW = pageW - tbX * 2;
    const tbH = MARGIN_BOTTOM - MAJOR - 9;
    const tbY = pageH - bi2 - 0.5 - tbH;

    // ── content area (fills from inner border down to title block top) ───
    const cbLeft = bi2 + 0.5 + INNER_PAD;
    const cbTop  = bi2 + 0.5 + INNER_PAD;
    const cbW    = pageW - cbLeft * 2;
    const cbH    = tbY - cbTop - INNER_PAD;

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(cbLeft, cbTop, cbW, cbH);

    // ── tick-mark rulers (on content border edges, pointing outward into margin) ──
    doc.setFontSize(6.5);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'normal');

    // Horizontal ticks — px tracks path coordinate space; ticks live on the top/bottom border line
    const halfW = pathWidth / 2;
    const startCoordX = Math.ceil(-halfW / 10) * 10;
    for (let coord = startCoordX; coord <= halfW; coord += 10) {
      const px = offsetX + coord + halfW;
      const len = coord % 50 === 0 ? MAJOR : MINOR;
      doc.setLineWidth(0.1);
      doc.line(px, cbTop, px, cbTop - len);                       // top border: tick upward into margin
      doc.line(px, cbTop + cbH, px, cbTop + cbH + len);           // bottom border: tick downward into margin
      if (coord % 50 === 0) {
        // label just inside the bottom border
        doc.text(String(coord), px, cbTop + cbH - 2, { align: 'center' });
      }
    }

    // Vertical ticks — py tracks path coordinate space; ticks live on the left/right border line
    for (let mm = 0; mm <= pathHeight; mm += 10) {
      const py = offsetY + pathHeight - mm;
      const len = mm % 50 === 0 ? MAJOR : MINOR;
      doc.setLineWidth(0.1);
      doc.line(cbLeft, py, cbLeft - len, py);                     // left border: tick leftward into margin
      doc.line(cbLeft + cbW, py, cbLeft + cbW + len, py);         // right border: tick rightward into margin
      if (mm % 50 === 0) {
        // label just inside the left border
        doc.text(String(mm), cbLeft + 2, py + 1, { align: 'left' });
      }
    }

  // ── title block cells ─────────────────────────────────────────────────
  // tbX / tbW / tbH / tbY computed above in title block geometry section
  const row1H = tbH * 0.52;
  const row2H = tbH * 0.48;

  const pad = 2;

  // ── outer rect + horizontal row divider ──────────────────────────────
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(tbX, tbY, tbW, tbH);
  doc.line(tbX, tbY + row1H, tbX + tbW, tbY + row1H);

  // ── vertical dividers ────────────────────────────────────────────────
  // both rows: left content | right metadata
  const divMain = tbX + tbW * 0.68;
  doc.line(divMain, tbY, divMain, tbY + tbH);
  // row 2 right side: scale | paper + dims
  const divScale = tbX + tbW * 0.80;
  doc.line(divScale, tbY + row1H, divScale, tbY + tbH);

  // ── helper: labelled field (tiny muted label above, value below) ─────
  const LABEL_FS = 5;
  const VALUE_FS = 7.5;
  const drawField = (
    label: string,
    value: string,
    cx: number,
    cellY: number,
    cellH: number,
    bold = false,
  ): void => {
    doc.setFontSize(LABEL_FS);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140);
    doc.text(label.toUpperCase(), cx, cellY + cellH * 0.25, { align: 'center' });
    doc.setFontSize(VALUE_FS);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(0);
    doc.text(value, cx, cellY + cellH * 0.68, { align: 'center' });
  };

  // ── Row 1: Title | Sheet Label ────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(fileName || 'Untitled', tbX + pad, tbY + row1H * 0.60);

  drawField('Sheet', sheetLabel || '—', (divMain + tbX + tbW) / 2, tbY, row1H);

  // ── Row 2: Description | Scale | Paper + Dims ─────────────────────────
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text(description || '', tbX + pad, tbY + row1H + row2H * 0.55, {
    maxWidth: divMain - tbX - pad * 2,
  });

  drawField('Scale', '1:1', (divMain + divScale) / 2, tbY + row1H, row2H, true);

  // Paper format + dims stacked in far-right cell
  const fmtCx = (divScale + tbX + tbW) / 2;
  doc.setFontSize(LABEL_FS);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(140);
  doc.text('PAPER', fmtCx, tbY + row1H + row2H * 0.22, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30);
  doc.text(paperFormatName, fmtCx, tbY + row1H + row2H * 0.55, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(`${Math.round(pathWidth)} × ${Math.round(pathHeight)} mm`, fmtCx, tbY + row1H + row2H * 0.85, { align: 'center' });
}

// ─── standard page selection ─────────────────────────────────────────────────

// the drawing a page of this paper holds inside its margins and title block, upright or turned
export function pageContentSize(format: PaperFormat, landscape: boolean): { width: number; height: number } {
  const [w, h] = landscape ? [format.height, format.width] : [format.width, format.height];
  return {
    width: w - 2 * SHEET_PAD - (MARGIN_X + INNER_PAD) * 2,
    height: h - 2 * SHEET_PAD - (MARGIN_TOP + INNER_PAD) - (MARGIN_BOTTOM + INNER_PAD),
  };
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

function findStandardPage(width: number, height: number): { format: PaperFormat; landscape: boolean } | null {
  const format = paperFor([{ width, height }]);
  return format && { format, landscape: orientationOn(format, width, height)! };
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

export async function downloadSvgAsPdf(
  filename: string,
  width: number,
  height: number,
  paths: SvgPathExport[],
  meta?: { fileName?: string; description?: string; sheetLabel?: string },
  texts: SvgTextExport[] = []
): Promise<void> {
  const match = findStandardPage(width, height);

  let pageW: number;
  let pageH: number;
  let paperFormatName: string;

  if (match) {
    const { format, landscape } = match;
    pageW = landscape ? format.height : format.width;
    pageH = landscape ? format.width  : format.height;
    paperFormatName = `${format.name} ${landscape ? 'Landscape' : 'Portrait'}`;
  } else {
    // Content too large for any standard format – fall back to a custom size.
    pageW = width  + 2 * SHEET_PAD + (MARGIN_X + INNER_PAD) * 2;
    pageH = height + 2 * SHEET_PAD + (MARGIN_TOP + INNER_PAD) + (MARGIN_BOTTOM + INNER_PAD);
    paperFormatName = 'Custom';
  }

  // Centre content within the full drawing area (inner border to title block top).
  const bi2    = BORDER_INSET + 1.4;
  const MAJOR  = 1.8;
  const tbH    = MARGIN_BOTTOM - MAJOR - 9;
  const tbY    = pageH - bi2 - 0.5 - tbH;
  const cbLeft = bi2 + 0.5 + INNER_PAD;
  const cbTop  = bi2 + 0.5 + INNER_PAD;
  const cbW    = pageW - cbLeft * 2;
  const cbH    = tbY - cbTop - INNER_PAD;
  const offsetX = cbLeft + (cbW - width)  / 2;
  const offsetY = cbTop  + (cbH - height) / 2;

  const doc = new jsPDF({
    orientation: pageW > pageH ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pageW, pageH],
  });

  const svgString = buildScaledSvg(width, height, paths, texts);
  const parser = new DOMParser();
  const svgEl = parser.parseFromString(svgString, 'image/svg+xml')
    .documentElement as unknown as SVGSVGElement;
  await svg2pdf(svgEl, doc, { x: offsetX - SHEET_PAD, y: offsetY - SHEET_PAD, width: width + 2 * SHEET_PAD, height: height + 2 * SHEET_PAD });

  drawDraftingFrame(doc, {
    pathWidth: width,
    pathHeight: height,
    pageW,
    pageH,
    offsetX,
    offsetY,
    fileName: meta?.fileName ?? filename.replace(/\.pdf$/, ''),
    description: meta?.description ?? '',
    sheetLabel: meta?.sheetLabel ?? '',
    paperFormatName,
  });

  doc.save(filename);
}

// every page on `paper` when given, upright or turned to fit, and a page too large for it on the
// smallest paper it fits, as without
export async function downloadFullPlanPdf(
  filename: string,
  pages: PdfPage[],
  paper: PaperFormat | null = null,
): Promise<void> {
  const parser = new DOMParser();

  let doc: InstanceType<typeof jsPDF> | null = null;

  for (let i = 0; i < pages.length; i++) {
    const { label, width, height, paths, texts, fileName, description } = pages[i];

    const onPaper = paper && orientationOn(paper, width, height);
    const match = paper && onPaper !== null ? { format: paper, landscape: onPaper! } : findStandardPage(width, height);
    let pageW: number;
    let pageH: number;
    let paperFormatName: string;

    if (match) {
      const { format, landscape } = match;
      pageW = landscape ? format.height : format.width;
      pageH = landscape ? format.width  : format.height;
      paperFormatName = `${format.name} ${landscape ? 'Landscape' : 'Portrait'}`;
    } else {
      pageW = width  + 2 * SHEET_PAD + (MARGIN_X + INNER_PAD) * 2;
      pageH = height + 2 * SHEET_PAD + (MARGIN_TOP + INNER_PAD) + (MARGIN_BOTTOM + INNER_PAD);
      paperFormatName = 'Custom';
    }

    // Centre content within the full drawing area (inner border to title block top).
    const bi2    = BORDER_INSET + 1.4;
    const MAJOR  = 1.8;
    const tbH    = MARGIN_BOTTOM - MAJOR - 9;
    const tbY    = pageH - bi2 - 0.5 - tbH;
    const cbLeft = bi2 + 0.5 + INNER_PAD;
    const cbTop  = bi2 + 0.5 + INNER_PAD;
    const cbW    = pageW - cbLeft * 2;
    const cbH    = tbY - cbTop - INNER_PAD;
    const offsetX = cbLeft + (cbW - width)  / 2;
    const offsetY = cbTop  + (cbH - height) / 2;

    if (!doc) {
      doc = new jsPDF({
        orientation: pageW > pageH ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pageW, pageH],
      });
    } else {
      doc.addPage([pageW, pageH], pageW > pageH ? 'landscape' : 'portrait');
    }

    const svgString = buildScaledSvg(width, height, paths, texts);
    const svgEl = parser.parseFromString(svgString, 'image/svg+xml')
      .documentElement as unknown as SVGSVGElement;
    await svg2pdf(svgEl, doc, { x: offsetX - SHEET_PAD, y: offsetY - SHEET_PAD, width: width + 2 * SHEET_PAD, height: height + 2 * SHEET_PAD });

    drawDraftingFrame(doc, {
      pathWidth: width,
      pathHeight: height,
      pageW,
      pageH,
      offsetX,
      offsetY,
      fileName: fileName ?? label,
      description: description ?? '',
      sheetLabel: label,
      paperFormatName,
    });
  }

  doc?.save(filename);
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
