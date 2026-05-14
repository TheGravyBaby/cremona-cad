export type SvgPathExport = {
  d: string;
  stroke?: string;
  fill?: string;
};

export type PdfPage = {
  label: string;
  width: number;
  height: number;
  paths: SvgPathExport[];
  fileName?: string;
  description?: string;
};

// ─── layout constants ────────────────────────────────────────────────────────
const MARGIN_X = 15;      // mm left & right
const MARGIN_TOP = 12;    // mm top
const MARGIN_BOTTOM = 48; // mm bottom (title block lives here)
const BORDER_INSET = 3;   // mm from page edge to thick outer border
const INNER_PAD = 5;      // mm gap between content border and path

// ─── SVG builders ────────────────────────────────────────────────────────────

export function buildMirroredSvg(
  width: number,
  height: number,
  paths: SvgPathExport[]
): string {
  const viewBox = `${-width / 2} 0 ${width} ${height}`;
  const pathMarkup = paths
    .map(p => `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'black'}"/>`)
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
    .map(p => `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'black'}" stroke-width="0.5"/>`)
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
    pageNum: number;
    pageTotal: number;
  }
): void {
  const {
    pathWidth, pathHeight, pageW, pageH,
    offsetX, offsetY,
    fileName, description, sheetLabel,
    pageNum, pageTotal,
  } = opts;

  // ── double-line outer border ─────────────────────────────────────────
  doc.setDrawColor(0);
  doc.setLineWidth(0.7);
  doc.rect(BORDER_INSET, BORDER_INSET, pageW - BORDER_INSET * 2, pageH - BORDER_INSET * 2);
  doc.setLineWidth(0.2);
  const bi2 = BORDER_INSET + 1.4;
  doc.rect(bi2, bi2, pageW - bi2 * 2, pageH - bi2 * 2);

  // ── content area border ──────────────────────────────────────────────
  doc.setLineWidth(0.3);
  doc.rect(
    offsetX - INNER_PAD,
    offsetY - INNER_PAD,
    pathWidth + INNER_PAD * 2,
    pathHeight + INNER_PAD * 2
  );

  // ── tick-mark rulers ─────────────────────────────────────────────────
  const MINOR = 0.8;
  const MAJOR = 1.8;
  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'normal');

  // Horizontal ticks – drawn outward (into margin), never touching the path
  for (let mm = 0; mm <= pathWidth; mm += 10) {
    const px = offsetX + mm;
    const len = mm % 50 === 0 ? MAJOR : MINOR;
    doc.setLineWidth(0.1);
    doc.line(px, offsetY - INNER_PAD - len, px, offsetY - INNER_PAD);               // top: upward
    doc.line(px, offsetY + pathHeight + INNER_PAD, px, offsetY + pathHeight + INNER_PAD + len); // bottom: downward
    if (mm % 50 === 0) {
      doc.text(
        String(Math.round(mm - pathWidth / 2)),
        px,
        offsetY + pathHeight + INNER_PAD + MAJOR + 2.5,
        { align: 'center' }
      );
    }
  }

  // Vertical ticks – drawn outward (into margin), never touching the path
  for (let mm = 0; mm <= pathHeight; mm += 10) {
    const py = offsetY + pathHeight - mm;
    const len = mm % 50 === 0 ? MAJOR : MINOR;
    doc.setLineWidth(0.1);
    doc.line(offsetX - INNER_PAD - len, py, offsetX - INNER_PAD, py);               // left: leftward
    doc.line(offsetX + pathWidth + INNER_PAD, py, offsetX + pathWidth + INNER_PAD + len, py); // right: rightward
    if (mm % 50 === 0) {
      doc.text(String(mm), offsetX - INNER_PAD - MAJOR - 1.2, py + 1, { align: 'right' });
    }
  }

  // ── centre-line markers (dashed gaps at mid-lines) ───────────────────
  doc.setLineWidth(0.12);
  doc.setDrawColor(150);
  const midX = offsetX + pathWidth / 2;
  const midY = offsetY + pathHeight / 2;
  const overshoot = 2.5;
  const gap = INNER_PAD + 3;
  // horizontal axis – only in the margin, gapped away from path
  doc.line(offsetX - INNER_PAD - overshoot, midY, offsetX - gap, midY);
  doc.line(offsetX + pathWidth + gap, midY, offsetX + pathWidth + INNER_PAD + overshoot, midY);
  // vertical axis – only in the margin
  doc.line(midX, offsetY - INNER_PAD - overshoot, midX, offsetY - gap);
  doc.line(midX, offsetY + pathHeight + gap, midX, offsetY + pathHeight + INNER_PAD + overshoot);
  doc.setDrawColor(0);

  // ── title block ──────────────────────────────────────────────────────
  const tbX = bi2 + 0.5;
  const tbY = offsetY + pathHeight + INNER_PAD + MAJOR + 5;
  const tbW = pageW - tbX * 2;
  const tbH = MARGIN_BOTTOM - MAJOR - 9;

  const row1H = tbH * 0.36;
  const row2H = tbH * 0.30;
  const row3H = tbH * 0.34;

  doc.setLineWidth(0.3);
  doc.rect(tbX, tbY, tbW, tbH);
  // horizontal dividers
  doc.line(tbX, tbY + row1H, tbX + tbW, tbY + row1H);
  doc.line(tbX, tbY + row1H + row2H, tbX + tbW, tbY + row1H + row2H);
  // vertical divider rows 1+2
  const divV1 = tbX + tbW * 0.68;
  doc.line(divV1, tbY, divV1, tbY + row1H + row2H);
  // vertical dividers row 3
  const divV2 = tbX + tbW * 0.33;
  const divV3 = tbX + tbW * 0.66;
  doc.line(divV2, tbY + row1H + row2H, divV2, tbY + tbH);
  doc.line(divV3, tbY + row1H + row2H, divV3, tbY + tbH);

  const pad = 2;

  // Row 1: file name | sheet label
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(fileName || 'Untitled', tbX + pad, tbY + row1H * 0.65);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(sheetLabel, (divV1 + tbX + tbW) / 2, tbY + row1H * 0.65, { align: 'center' });

  // Row 2: description | W × H
  doc.setFontSize(8);
  doc.setTextColor(50);
  doc.text(description || '', tbX + pad, tbY + row1H + row2H * 0.65, {
    maxWidth: divV1 - tbX - pad * 2,
  });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(`${pathWidth} × ${pathHeight} mm`, divV1 + pad, tbY + row1H + row2H * 0.65);

  // Row 3: date | page | generated by
  const r3Y = tbY + row1H + row2H + row3H * 0.65;
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70);
  doc.text(date, tbX + pad, r3Y);
  doc.text(`Page ${pageNum} of ${pageTotal}`, (divV2 + divV3) / 2, r3Y, { align: 'center' });
  doc.setFont('helvetica', 'italic');
  doc.text('Generated by CremonaCad', (divV3 + tbX + tbW) / 2, r3Y, { align: 'center' });
}

// ─── public export functions ─────────────────────────────────────────────────

export async function downloadSvgAsPdf(
  filename: string,
  width: number,
  height: number,
  paths: SvgPathExport[],
  meta?: { fileName?: string; description?: string; sheetLabel?: string }
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { svg2pdf } = await import('svg2pdf.js');

  const offsetX = MARGIN_X + INNER_PAD;
  const offsetY = MARGIN_TOP + INNER_PAD;
  const pageW = width + (MARGIN_X + INNER_PAD) * 2;
  const pageH = height + MARGIN_TOP + INNER_PAD + MARGIN_BOTTOM + INNER_PAD;

  const doc = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
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
    pageNum: 1,
    pageTotal: 1,
  });

  doc.save(filename);
}

export async function downloadFullPlanPdf(
  filename: string,
  pages: PdfPage[]
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { svg2pdf } = await import('svg2pdf.js');
  const parser = new DOMParser();

  let doc: InstanceType<typeof jsPDF> | null = null;

  for (let i = 0; i < pages.length; i++) {
    const { label, width, height, paths, fileName, description } = pages[i];

    const offsetX = MARGIN_X + INNER_PAD;
    const offsetY = MARGIN_TOP + INNER_PAD;
    const pageW = width + (MARGIN_X + INNER_PAD) * 2;
    const pageH = height + MARGIN_TOP + INNER_PAD + MARGIN_BOTTOM + INNER_PAD;

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
      pageNum: i + 1,
      pageTotal: pages.length,
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
