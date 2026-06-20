import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

export type SvgPathExport = {
  d: string;
  stroke?: string;
  fill?: string;
  fillRule?: string;
  fillOpacity?: number;
  strokeWidth?: number | string;
};

export type PdfPage = {
  label: string;
  width: number;
  height: number;
  paths: SvgPathExport[];
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

// ─── SVG builders ────────────────────────────────────────────────────────────

export function buildMirroredSvg(
  width: number,
  height: number,
  paths: SvgPathExport[]
): string {
  const viewBox = `${-width / 2} 0 ${width} ${height}`;
  const pathMarkup = paths
    .map(p => {
      const extras = [
        p.fillRule ? ` fill-rule="${p.fillRule}"` : '',
        p.fillOpacity != null ? ` fill-opacity="${p.fillOpacity}"` : '',
      ].join('');
      return `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'black'}" stroke-width="${p.strokeWidth ?? 0.5}"${extras}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g transform="translate(0 ${height}) scale(1 -1)">${pathMarkup}</g></svg>`;
}

function buildScaledSvg(
  width: number,
  height: number,
  paths: SvgPathExport[]
): string {
  const viewBox = `${-width / 2} 0 ${width} ${height}`;
  const pathMarkup = paths
    .map(p => {
      const extras = [
        p.fillRule ? ` fill-rule="${p.fillRule}"` : '',
        p.fillOpacity != null ? ` fill-opacity="${p.fillOpacity}"` : '',
      ].join('');
      return `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'black'}" stroke-width="0.5"${extras}/>`;
    })
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     width="${width}mm" height="${height}mm"`,
    `     viewBox="${viewBox}">`,
    `  <g transform="translate(0 ${height}) scale(1 -1)">`,
    `    ${pathMarkup}`,
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

    // ── centre-line marker (vertical axis only — violin is left/right symmetric) ──
    doc.setLineWidth(0.12);
    doc.setDrawColor(150);
    const midX = offsetX + pathWidth / 2;
    const CLgap = 2; // small visual gap between marker and path edge
    doc.line(midX, cbTop, midX, offsetY - CLgap);
    doc.line(midX, offsetY + pathHeight + CLgap, midX, cbTop + cbH);
    doc.setDrawColor(0);

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

/**
 * Returns the smallest standard page that can contain the given content
 * dimensions (including all required margins), and whether it should be
 * rendered in landscape orientation. Returns null if no standard size fits.
 */
function findStandardPage(
  contentWidth: number,
  contentHeight: number
): { format: PaperFormat; landscape: boolean } | null {
  const minW = contentWidth  + (MARGIN_X + INNER_PAD) * 2;
  const minH = contentHeight + (MARGIN_TOP + INNER_PAD) + (MARGIN_BOTTOM + INNER_PAD);

  const byArea = Object.values(PAPER_FORMATS)
    .sort((a, b) => a.width * a.height - b.width * b.height);

  for (const format of byArea) {
    if (format.width >= minW && format.height >= minH) {
      return { format, landscape: false };
    }
    if (format.height >= minW && format.width >= minH) {
      return { format, landscape: true };
    }
  }

  return null; // content too large for any standard format
}

// ─── public export functions ─────────────────────────────────────────────────

export async function downloadSvgAsPdf(
  filename: string,
  width: number,
  height: number,
  paths: SvgPathExport[],
  meta?: { fileName?: string; description?: string; sheetLabel?: string }
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
    pageW = width  + (MARGIN_X + INNER_PAD) * 2;
    pageH = height + (MARGIN_TOP + INNER_PAD) + (MARGIN_BOTTOM + INNER_PAD);
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

  const svgString = buildScaledSvg(width, height, paths);
  const parser = new DOMParser();
  const svgEl = parser.parseFromString(svgString, 'image/svg+xml')
    .documentElement as unknown as SVGSVGElement;
  await svg2pdf(svgEl, doc, { x: offsetX, y: offsetY, width, height });

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

export async function downloadFullPlanPdf(
  filename: string,
  pages: PdfPage[]
): Promise<void> {
  const parser = new DOMParser();

  let doc: InstanceType<typeof jsPDF> | null = null;

  for (let i = 0; i < pages.length; i++) {
    const { label, width, height, paths, fileName, description } = pages[i];

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
      pageW = width  + (MARGIN_X + INNER_PAD) * 2;
      pageH = height + (MARGIN_TOP + INNER_PAD) + (MARGIN_BOTTOM + INNER_PAD);
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
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pageW, pageH],
      });
    } else {
      doc.addPage([pageW, pageH], width > height ? 'landscape' : 'portrait');
    }

    const svgString = buildScaledSvg(width, height, paths);
    const svgEl = parser.parseFromString(svgString, 'image/svg+xml')
      .documentElement as unknown as SVGSVGElement;
    await svg2pdf(svgEl, doc, { x: offsetX, y: offsetY, width, height });

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
