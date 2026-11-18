import { Component, EventEmitter, Input, Output } from '@angular/core';
import { EXPORT_DESCRIPTIONS } from '../../../../docs/export-descriptions';
import {
  angleFromCenter, angleWithinSweep, dist, normalizeRadians, pointAtDistanceToward, pointOnCircle, signedArcSweep, TURN,
} from '../../../../helpers/math/simpleGeometry';
import {
  applyMatrix, arcPathData, combinePathStrings, Matrix2D, parseSvgTransform, pathFromArc, pathFromCircle, pathFromLine, pathFromPolygon, pathFromPolyline,
  pathFromRect, pathsBounds, rotatePath180, samplePathToPolyline, transformPath, translatePath,
} from '../../../../helpers/math/pathMath';
import { occludePath, unifyConnectedSvgPaths } from '../../../../helpers/math/pathVibes';
import { developOverSurface, polylineCrossingsAtY } from '../../../../helpers/math/vibeMath';
import {
  buildMirroredSvg, buildPackedSvg, downloadPdf, downloadSvgFile, pageSizeFor, paginatePieces, PaperPage, paperFor, PdfPage, PieceGroup,
  SvgPathExport, SvgTextExport,
} from '../../../../helpers/fileExporter';
import { downloadDxfFile } from '../../../../helpers/dxfExporter';
import { buildHeightFieldStl, downloadStlFile, HeightFieldCut } from '../../../../helpers/stlExporter';
import { renderFilledPath, renderPath, renderText, renderTranslatedLayers } from '../../../../helpers/renderFuncs';
import {
  buildDrawingPage, buildSchematicPage, DRAWING_TEXT, formatHeight, formatMm, SCHEMATIC_AREA, SHEET_SCREEN_FONT, SheetBlock, SheetHeading, SheetMark, SheetPageSpec, SheetRow, SheetStroke,
  SheetView, timesWidth,
} from '../../../../helpers/sheetDraft';
import { Arc, Circle, Pt, Rectangle } from '../../../../models/types';
import { DASH, SHEET, STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  RenderLayer,
  ViolinFamilyParams,
  ViolinFamilyToggleKey,
} from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import {
  NeckSolve,
  Plate,
  PlateSurface,
  ScrollSolve,
  StringSetupSolve,
  SurfaceRow,
} from '../../violin-family-solves';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout, solveRibArcs } from '../center-bout-panel/center-bout-panel';
import { calcStemEdgePoints, stemEdgeAt } from '../fhole-placement-panel/fhole-placement-panel';
import { definePurflingPath, solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { defineFholePath, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import {
  calcRibLine, calcTopPlatePlacement, channelCenterlineZAt, defineArchPath, defineBodySideProfile, longArchHeightAt, placeOnTopPlate, solveLongArching,
} from '../long-arching-panel/long-arching-panel';
import {
  BodyLandmark, calcBodyLandmarks, calcSectionRuns, plateHalfChordAtY, rowAt, solveCrossArching, STATION_MERGE_EPS_MM, surfaceZAt,
} from '../cross-arching-panel/cross-arching-panel';
import { calcMortiseFloorY, neckHalfWidthAt, calcScrollOnNeck, solveNeck } from '../neck-panel/neck-panel';
import { solveStringSetup } from '../string-setup-panel/string-setup-panel';
import { fingerboardSurfaceZAt, PositionMarkSolve, solveScoop } from '../dev-fingerboard-panel/dev-fingerboard-panel';
import { calcScrollExtent } from '../volute-panel/volute-panel';
import { defineSideScrollPath } from '../pegbox-panel/pegbox-panel';
import {
  buildScrollBackStrip, buildScrollBackViewStrokes, buildScrollCompassWalk, buildScrollFrontViewStrokes, calcScrollWidthStations, ScrollStationKey, ScrollView,
  solveScrollWidths,
} from '../scroll-widths-panel/scroll-widths-panel';
import { buildBlockLayout, MOULD_EXPORT_STEP, solveMould } from '../mould-panel/mould-panel';

// The export panel: every sheet the drawing leaves the app on. Each is built once, by `exportSheet`,
// from the earlier panels' solvers, and the preview, the SVG, the PDF and the DXF are all written
// from that one sheet. The two documents, the scaled drawings and the schematic, are pages of the
// same paths and texts, so they preview and print the same way. Nothing is typed here, and nothing
// is written back to the params. Panel, then the sheets, the scaled drawings and the schematic, then
// what exists for the sheets alone: the arch templates, the neck template, the plate solid and the
// fingerboard solid.

type ScrollExportType = 'neckTemplate' | 'scrollSide' | 'scrollFrontView' | 'scrollBackView' | 'scrollBack' | 'scrollCompass';
export type ExportType = 'innerContour' | 'topPlate' | 'backPlate' | 'mould' | 'blocks' | 'crossArchTemplates' | 'longArchTemplates' | 'fholeTemplate' | 'fholeTemplateNoEyes' | 'fholeTemplateArched' | ScrollExportType;
export type ExportReady = ExportType | 'stlTop' | 'stlBack' | 'stlFingerboard';
// the two PDFs of many pages
export type ExportDocument = 'schematic' | 'scaledDrawings';

// the sheet's title on a PDF page, one at a time or in the scaled drawings
const SHEET_LABELS: Record<ExportType, string> = {
  innerContour: 'Inner Contour',
  topPlate: 'Top Plate',
  backPlate: 'Back Plate',
  mould: 'Mould',
  blocks: 'Blocks',
  fholeTemplate: 'F-Hole Template',
  fholeTemplateNoEyes: 'F-Hole Template (No Eyes)',
  fholeTemplateArched: 'F-Hole Template (Arched)',
  crossArchTemplates: 'Cross Arch Templates',
  longArchTemplates: 'Long Arch Templates',
  neckTemplate: 'Neck Template',
  scrollSide: 'Scroll Side Profile',
  scrollFrontView: 'Scroll Front View',
  scrollBackView: 'Scroll Back View',
  scrollBack: 'Scroll Back',
  scrollCompass: 'Compass Walk',
};
const SCROLL_EXPORTS: readonly ScrollExportType[] = ['neckTemplate', 'scrollSide', 'scrollFrontView', 'scrollBackView', 'scrollBack', 'scrollCompass'];
const EXPORT_TYPES: readonly ExportType[] = ['topPlate', 'backPlate', 'innerContour', 'longArchTemplates', 'crossArchTemplates', 'fholeTemplate', 'fholeTemplateArched', ...SCROLL_EXPORTS, 'mould', 'blocks'];
// drawn on the plan's own sheet, the body's width by its height, rather than sized to themselves
const PLAN_SHEETS: readonly ExportType[] = ['innerContour', 'topPlate', 'backPlate', 'mould', 'blocks'];
// the scaled drawings' first pages, each a whole outline standing on the centreline, which its page draws
const PLAN_PAGES = ['topPlate', 'backPlate', 'innerContour', 'mould'] as const;
const FULL_SIZE_NOTE = 'Full size. Measurements in millimetres';
const SHEET_CREDIT = 'Made with CremonaCad';
// the scaled drawings' pages past the plan sheets, in order: a group shares a page with the one before it
// when the two fit together
const PDF_GROUPS: ReadonlyArray<{ label: string; types: readonly ExportType[] }> = [
  { label: 'Blocks', types: ['blocks'] },
  { label: 'F-Hole Templates', types: ['fholeTemplate', 'fholeTemplateArched'] },
  { label: 'Arch Templates', types: ['longArchTemplates', 'crossArchTemplates'] },
  { label: 'Neck & Scroll', types: SCROLL_EXPORTS },
];
// what the templates SVG gathers: the pieces a maker cuts from card or ply and works to
const TEMPLATE_BUNDLE: readonly ExportType[] = ['neckTemplate', 'scrollBack', 'scrollCompass', 'longArchTemplates', 'crossArchTemplates', 'fholeTemplate', 'fholeTemplateArched', 'blocks'];
// the rows the panel offers, in the bench's order
export const EXPORT_GROUPS: ReadonlyArray<{ label: string; rows: ReadonlyArray<{ type: ExportType; name: string }> }> = [
  { label: 'Contours', rows: [{ type: 'topPlate', name: 'Top Plate' }, { type: 'backPlate', name: 'Back Plate' }, { type: 'innerContour', name: 'Inner Contour' }] },
  { label: 'Arch Templates', rows: [{ type: 'longArchTemplates', name: 'Long Arch Templates' }, { type: 'crossArchTemplates', name: 'Cross Arch Templates' }] },
  { label: 'F-Hole Templates', rows: [
    { type: 'fholeTemplate', name: 'F-Hole Template' }, 
    // fholeTemplateNoEyes is built but not offered, see exportReady
    { type: 'fholeTemplateArched', name: 'F-Hole (Arched)' }] 
  },
  { label: 'Neck & Scroll', rows: SCROLL_EXPORTS.map(type => ({ type, name: SHEET_LABELS[type] })) },
  { label: 'Mould', rows: [{ type: 'mould', name: 'Mould' }, { type: 'blocks', name: 'Block Templates' }] },
];

const FHOLE_TEMPLATE_MARGIN = 10;
// from the blank's right edge to the centre of the 'Arched' label, about half its width and a gap
const FHOLE_LABEL_INSET = 11;
// a sheet in its own frame is sized from its geometry, with this much round it
const TEMPLATE_SHEET_PAD = 5;
// label text size (mm), the same on the canvas preview, SVG/PDF and DXF
const TEMPLATE_LABEL_SIZE = 5;
// the compass walk is a box to cut, its marks etched: every circle clears the box by this. Each
// centre is a star of three lines through it, arms this long, so the beam crosses the point three
// times and it reads apart from where a circle crosses the spine; its own path, to etch deeper
const COMPASS_BOX_MARGIN = 5;
const COMPASS_STAR = 1;

const black = (d: string, strokeWidth = '.5'): SvgPathExport => ({ d, stroke: 'black', fill: 'none', strokeWidth });
const etched = (d: string, strokeWidth = '.5'): SvgPathExport => ({ ...black(d, strokeWidth), laser: 'etch' });
// a hole inside a piece, which the laser cuts before any outline so the piece is still held
const cutFirst = (d: string, strokeWidth = '.5'): SvgPathExport => ({ ...black(d, strokeWidth), laser: 'cut1' });

@Component({
  selector: 'app-vf-export-panel',
  imports: [],
  templateUrl: './export-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class ExportPanel extends PanelComponentBase {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  // a sheet's preview draws in the trace grey alone; a document's takes one ink for the instrument
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly describe = (id: string): string => EXPORT_DESCRIPTIONS[id] ?? '';
  protected readonly groups = EXPORT_GROUPS;
  protected readonly templateBundle = TEMPLATE_BUNDLE;

  @Input() fileName = '';
  @Input() description = '';
  @Output() saveRecipe = new EventEmitter<void>();

  // what each sheet can be built from, refreshed before every preview and download: a sheet is
  // offered once the panels it's drawn from have been reached, so a blank instrument skipped
  // straight here offers its inner contour alone
  ready = new Set<ExportReady>();
  // what is on the canvas: the schematic until a sheet or a document is picked, or the first sheet there is
  preview: ExportType | ExportDocument = 'schematic';

  // nothing is edited here, so an edit settling has nothing to say
  reportSolveFailures(): void {}

  show(type: ExportType | ExportDocument): void {
    this.preview = type;
    this.drawCanvas();
  }

  protected buildCanvasLayers(): RenderLayer[] {
    this.ready = exportReady(this.params);
    let shown = this.preview;
    if (shown === 'schematic' || shown === 'scaledDrawings') {
      let pages = shown === 'schematic' ? buildSchematic(this.params, this.heading()) : buildScaledDrawings(this.params, this.heading(FULL_SIZE_NOTE));
      if (pages.length) return renderPages(pages, this.pal);
      shown = 'topPlate';
    }
    if (!this.ready.has(shown)) shown = EXPORT_TYPES.find(type => this.ready.has(type)) ?? shown;
    this.preview = shown;
    let sheet = this.ready.has(shown) ? exportSheet(this.params, shown) : null;
    return sheet ? renderSheet(sheet, this.pal) : [];
  }

  readyCount(types: ReadonlyArray<{ type: ExportReady } | ExportReady>): number {
    return types.filter(t => this.ready.has(typeof t === 'string' ? t : t.type)).length;
  }

  private baseName(): string {
    return this.fileName?.trim() || 'violin-family';
  }

  private heading(note?: string): SheetHeading {
    return { title: this.baseName(), description: this.description ?? '', note };
  }

  download(type: ExportType, format: 'svg' | 'pdf' | 'dxf'): void {
    this.ready = exportReady(this.params);
    let sheet = this.ready.has(type) ? exportSheet(this.params, type) : null;
    if (!sheet) return;
    let name = `${this.baseName()}-${type}.${format}`;
    let { width, height } = sheetSize(this.params, type, sheet);
    if (format === 'svg') downloadSvgFile(name, buildMirroredSvg(width, height, sheet.paths, sheet.texts));
    else if (format === 'pdf') downloadPdf(name, [buildScaledDrawingPage(type, { width, height, ...sheet }, this.heading(FULL_SIZE_NOTE))]);
    else downloadDxfFile(name, combinePathStrings(sheet.paths.map(s => s.d)), sheet.texts.map(t => ({ text: t.text, x: t.x, y: t.y, height: t.fontSize ?? TEMPLATE_LABEL_SIZE, rotationDeg: t.rotationDeg })));
  }

  // every sheet that can be built, or the templates among them, packed onto one SVG. Each sheet
  // packs whole, laid out as its own download lays it out, so like templates stay together
  downloadBundle(bundle: 'templates' | 'full'): void {
    this.ready = exportReady(this.params);
    let types = (bundle === 'templates' ? TEMPLATE_BUNDLE : EXPORT_TYPES).filter(type => this.ready.has(type));
    let pieces = types.map(type => exportSheet(this.params, type)).filter((sheet): sheet is ExportSheet => !!sheet);
    if (!pieces.length) return;
    downloadSvgFile(`${this.baseName()}-${bundle}.svg`, buildPackedSvg(pieces));
  }

  downloadStl(plate: Plate): void {
    let surface = this.params.arching ? solveCrossArching(this.params)?.[plate] : null;
    if (!surface) return;
    downloadStlFile(`${this.baseName()}-${plate}-plate.stl`, plateStl(this.params, surface, plate));
  }

  // no button yet: kept for the fingerboard's CNC export to come
  downloadFingerboardStl(): void {
    let solid = fingerboardStl(this.params);
    if (solid) downloadStlFile(`${this.baseName()}-fingerboard.stl`, solid);
  }

  downloadScaledDrawings(): void {
    downloadPdf(`${this.baseName()}-scaled-drawings.pdf`, buildScaledDrawings(this.params, this.heading(FULL_SIZE_NOTE)));
  }

  downloadSchematic(): void {
    downloadPdf(`${this.baseName()}-schematic.pdf`, buildSchematic(this.params, this.heading()));
  }
}

// a sheet's paths and labels, in the frame its own download draws it in. The laser pass only matters
// to the SVG; the PDF draws every path at one weight and the DXF carries none
export interface ExportSheet {
  paths: SvgPathExport[];
  texts: SvgTextExport[];
}

// a sheet on the canvas as the file will have it: outlines at trace weight, etched marks at guide.
// Printed, it is a document's page, drawn in the canvas's own inks rather than the paper's: the
// instrument in the panel's ink, everything said about it in the trace grey, dashes dashed
const INSTRUMENT_INK = 4;
export const renderSheet = (sheet: ExportSheet, pal: PanelPalette, printed = false): RenderLayer[] => [
  ...sheet.paths.map(path => {
    let d = path.transform ? transformPath(path.d, parseSvgTransform(path.transform)) : path.d;
    if (!printed) return renderPath(d, pal.neutral, path.laser === 'etch' ? STROKE_WEIGHT.guide : STROKE_WEIGHT.trace);
    if (path.fill && path.fill !== 'none') return renderFilledPath(d, pal.neutral, 1);
    let ink = path.stroke === SHEET.subject ? pal.ink(INSTRUMENT_INK) : pal.neutral;
    return renderPath(d, ink, path.strokeWidth === SHEET.light ? STROKE_WEIGHT.guide : STROKE_WEIGHT.section, 1, path.dash ? DASH.preview : undefined);
  }),
  ...sheet.texts.map(t => printed
    ? renderText(new Pt(t.x, t.y), t.text, pal.neutral, t.fontSize, t.rotationDeg ?? 0, { anchor: t.anchor, italic: t.italic, family: SHEET_SCREEN_FONT })
    : renderText(new Pt(t.x, t.y), t.text, pal.neutral, t.fontSize ?? TEMPLATE_LABEL_SIZE, t.rotationDeg ?? 0)),
];

// a document on the canvas, its pages laid out as they read, three to a row and the rows running
// down, each in a box the size of its paper, the first standing where a single sheet does
const PAGE_GAP = 20;
const PAGES_PER_ROW = 3;
export const renderPages = (pages: PaperPage[], pal: PanelPalette): RenderLayer[] => {
  let x = 0, y = 0;
  return pages.map((page, i) => {
    if (i && i % PAGES_PER_ROW === 0) {
      x = 0;
      y -= Math.max(...pages.slice(i, i + PAGES_PER_ROW).map(next => next.height)) + PAGE_GAP;
    }
    let paper = pathFromRect(new Rectangle(new Pt(-page.width / 2, 0), new Pt(page.width / 2, page.height)));
    let layer = renderTranslatedLayers([renderPath(paper, pal.neutral, STROKE_WEIGHT.guide), ...renderSheet(page, pal, true)], x, y);
    x += page.width + PAGE_GAP;
    return layer;
  });
};

// which sheets the stages reached so far can build. Each check is the cheapest that says so; a sheet
// that still can't be built when asked for writes nothing
export function exportReady(p: ViolinFamilyParams): Set<ExportReady> {
  let ready = new Set<ExportReady>();
  if (!ribOutline(p)) return ready;
  ready.add('innerContour');
  let o = solvePlateContour(p);
  if (o?.top) ready.add('topPlate');
  if (o?.back) ready.add('backPlate');
  if (p.fHoleContours && solveFholeContours(p)?.path) {
    ready.add('fholeTemplate');
    // fholeTemplateNoEyes still builds through exportSheet but isn't offered, so it is in no
    // preview or bulk export; add it here to bring it back
  }
  if (p.arching) {
    let a = solveLongArching(p);
    if (a?.top || a?.back) ready.add('longArchTemplates');
    let c = solveCrossArching(p);
    if (c?.top || c?.back) ready.add('crossArchTemplates');
    if (c?.top) ready.add('stlTop');
    if (c?.back) ready.add('stlBack');
    if (c?.top && ready.has('fholeTemplate')) ready.add('fholeTemplateArched');
  }
  if (p.mould) {
    ready.add('mould');
    ready.add('blocks');
  }
  if (solvedFingerboard(p)) ready.add('stlFingerboard');
  let scroll = solvedScroll(p);
  if (scroll) {
    ready.add('scrollSide');
    if (solvedNeck(p)) ready.add('neckTemplate');
    if (scroll.widths) for (let type of ['scrollFrontView', 'scrollBackView', 'scrollBack', 'scrollCompass'] as const) ready.add(type);
  }
  return ready;
}

export function exportSheet(p: ViolinFamilyParams, type: ExportType): ExportSheet | null {
  let sheet = (paths: (SvgPathExport | null)[], texts: SvgTextExport[] = []): ExportSheet => ({ paths: paths.filter((path): path is SvgPathExport => !!path), texts });
  switch (type) {
    case 'innerContour': {
      let inner = ribOutline(p);
      let holes = solveMould(p)?.alignmentHoles ?? [];
      return inner ? sheet([black(inner), ...holes.map(hole => cutFirst(pathFromCircle(hole)))]) : null;
    }
    case 'topPlate':
    case 'backPlate': {
      // outline, holes and purfling. The channel is not drawn here in any form: in plan it is only
      // two rims with nothing between them to say how deep, and the arch templates carry that whole
      let o = solvePlateContour(p);
      let plate = type === 'topPlate' ? o?.top : o?.back;
      if (!o || !plate) return null;
      let holes = type === 'topPlate' ? fholes(p) : [];
      return sheet([black(plate), ...holes.map(d => cutFirst(d)), ...[o.purfling, o.outerPurfling].map(d => d && etched(d))]);
    }
    case 'mould': {
      let m = solveMould(p, MOULD_EXPORT_STEP);
      return m?.outline ? sheet([black(combinePathStrings([...m.clampBox, m.outline])), ...m.alignmentHoles.map(hole => cutFirst(pathFromCircle(hole)))]) : null;
    }
    case 'blocks': {
      let m = solveMould(p);
      if (!m?.blocks) return null;
      let blocks = buildBlockLayout(m);
      return sheet([black(combinePathStrings(blocks.map(b => b.path)))], blocks.map(b => ({ text: b.label, x: b.x, y: b.y, fontSize: TEMPLATE_LABEL_SIZE })));
    }
    case 'fholeTemplate':
    case 'fholeTemplateNoEyes':
    case 'fholeTemplateArched': {
      let t = fholeTemplate(p, type !== 'fholeTemplateNoEyes', type === 'fholeTemplateArched');
      return t && sheet([black(t.blank), cutFirst(t.hole)], type === 'fholeTemplateArched' ? [{ text: 'Arched', x: t.labelPos.x, y: t.labelPos.y, fontSize: TEMPLATE_LABEL_SIZE }] : []);
    }
    case 'crossArchTemplates':
    case 'longArchTemplates': {
      let shapes = type === 'crossArchTemplates' ? crossArchTemplates(p) : longArchTemplates(p);
      if (!shapes.length) return null;
      return sheet([black(combinePathStrings(shapes.map(s => s.path)))], shapes.map(s => ({ text: s.label, x: s.labelPos.x, y: s.labelPos.y, rotationDeg: s.labelRotation, fontSize: TEMPLATE_LABEL_SIZE })));
    }
    case 'neckTemplate': {
      let t = neckTemplateOnSheet(p);
      return t && sheet([black(t.outline), cutFirst(combinePathStrings([...t.slots, ...t.dots, t.eye]))]);
    }
    case 'scrollSide': {
      // the scroll from the side as its panels draw it, the volute and the pegbox's back and front
      let scroll = solvedScroll(p);
      if (!scroll) return null;
      let d = defineSideScrollPath(p, scroll.s);
      let b = pathsBounds([d]);
      return sheet([black(translatePath(d, -(b.minX + b.maxX) / 2, -b.minY))]);
    }
    case 'scrollFrontView':
    case 'scrollBackView': {
      // the scroll seen from in front or behind, as the widths panel draws it: the head and the nut,
      // the neck's sides from the nut up to where they meet it
      let scroll = solvedScroll(p);
      if (!scroll?.widths) return null;
      let place = (x: number, y: number) => new Pt(x, y);
      let strokes = type === 'scrollFrontView' ? buildScrollFrontViewStrokes(p, scroll.s, place, 0) : buildScrollBackViewStrokes(p, scroll.s, place, 0);
      let d = defineScrollViewPath(strokes);
      return sheet([black(translatePath(d, 0, -pathsBounds([d]).minY))]);
    }
    case 'scrollBack': {
      // the back unrolled into a strip, on its own sheet from the duck tail up
      let scroll = solvedScroll(p);
      return scroll?.widths ? sheet([black(pathFromPolygon(buildScrollBackStrip(p, scroll.s).outline))]) : null;
    }
    case 'scrollCompass': {
      let t = compassSheet(p);
      return t && sheet([black(t.box), etched(t.marks, '.25'), etched(t.centres), etched(t.edges, '.1')]);
    }
  }
}

// a plan sheet is the body's width by its height with room for the button at both ends, or larger
// where the drawing runs past that (a viol neck's plate does); the rest are sized to themselves
function sheetSize(p: ViolinFamilyParams, type: ExportType, sheet: ExportSheet): { width: number; height: number } {
  let b = pathsBounds(sheet.paths.map(s => s.d));
  if (!PLAN_SHEETS.includes(type)) return { width: b.width + TEMPLATE_SHEET_PAD, height: b.height + TEMPLATE_SHEET_PAD };
  let button = p.plateContour?.button.height ?? 0;
  return { width: Math.max(p.body.width, b.width), height: Math.max(p.body.height + 2 * button, b.maxY) };
}

// the rib outline as one closed path, or null until every arc of it has solved
function ribOutline(p: ViolinFamilyParams): string | null {
  if (!p.bouts || !p.corners) return null;
  let rib = solveRibArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
  return rib && definePurflingPath(p, rib, 0);
}

// the two holes cut into the top plate, each its own path so either can be picked alone; empty until the contours close
function fholes(p: ViolinFamilyParams): string[] {
  let s = p.fHoleContours ? solveFholeContours(p) : null;
  return s?.path ? [s.path, defineFholePath(p, s, true)!] : [];
}

// the single-hole cutting template, moved off the plate's real coordinates onto its own sheet: the
// hole sits wherever it is on the plate, and every sheet frame here is centred on x = 0 from y = 0
// up. A whole-mm blank round the hole: the maker traces the hole from inside it, so cutting the pair
// leaves a rectangle with the hole's negative in it. The drawing shows the hole from above, flat,
// but the card is bent over the arch to use: arched, the hole is developed over the top's surface
// along a spine up the hole's middle, so a card bent across the plate there traces the hole drawn.
// The arched one is labelled in the blank's bottom right corner, so it can be told from the flat
// one once cut out.
// With renderEyes off the eyes close with a short arc, for hand-cut eyes: not offered at present
// (see exportReady), kept for if the template comes back
function fholeTemplate(p: ViolinFamilyParams, renderEyes: boolean, arched = false): { blank: string; hole: string; labelPos: Pt } | null {
  let s = p.fHoleContours ? solveFholeContours(p) : null;
  let raw = s?.path ? defineFholePath(p, s, false, renderEyes) : null;
  if (!raw) return null;
  if (arched) {
    let surface = p.arching ? solveCrossArching(p)?.top : null;
    if (!surface) return null;
    let flat = pathsBounds([raw]);
    let spine = new Pt((flat.minX + flat.maxX) / 2, (flat.minY + flat.maxY) / 2);
    raw = pathFromPolygon(developOverSurface(plateZAt(surface), samplePathToPolyline(raw, 0.25), spine));
  }
  let b = pathsBounds([raw]);
  let width = Math.ceil(b.width + 2 * FHOLE_TEMPLATE_MARGIN);
  let height = Math.ceil(b.height + 2 * FHOLE_TEMPLATE_MARGIN);
  return {
    blank: pathFromRect(new Rectangle(new Pt(-width / 2, 0), new Pt(width / 2, height))),
    hole: translatePath(raw, -(b.minX + b.maxX) / 2, (height - b.height) / 2 - b.minY),
    labelPos: new Pt(width / 2 - FHOLE_LABEL_INSET, (height - b.height) / 4),
  };
}

// the neck set against the arch, whole, or null
function solvedNeck(p: ViolinFamilyParams): NeckSolve | null {
  let n = p.neck ? solveNeck(p) : null;
  return n?.neckTop && n.backRoot ? n : null;
}

// the scroll solved whole, and whether its widths hold against it: the strip, the walk and the
// views hang the widths on the side, the side alone needs only the scroll
function solvedScroll(p: ViolinFamilyParams): { s: ScrollSolve; widths: boolean } | null {
  let w = p.scroll && p.neck ? solveScrollWidths(p) : null;
  if (!w || w.scroll.failures.length) return null;
  return { s: w.scroll, widths: !w.failures.some(f => f.unsolved.length) };
}

// the neck and scroll template on its own sheet, like the f-hole's
function neckTemplateOnSheet(p: ViolinFamilyParams): NeckTemplate | null {
  let n = solvedNeck(p);
  let scroll = solvedScroll(p);
  if (!n || !scroll) return null;
  let t = defineNeckTemplate(p, n, scroll.s);
  let b = pathsBounds([neckTemplatePath(t)]);
  let onSheet = (d: string) => translatePath(d, -(b.minX + b.maxX) / 2, -b.minY);
  return { outline: onSheet(t.outline), slots: t.slots.map(onSheet), dots: t.dots.map(onSheet), eye: onSheet(t.eye) };
}

// the compass walk as a box to cut, the spine up its middle with a crosshair and a circle at each
// station etched in it, the duck tail's at the bottom with room to breathe. The last station is the
// second turn's bottom, a flat, so its circle is the half hanging under its level, swept from 0 to
// π the negative way as the crown's is on the widths panel, with the flat drawn across its top as
// the end of the path. Faint straight edges run through the circles' sides, the back's outline
// roughly, where the strip has it in full
function compassSheet(p: ViolinFamilyParams): { box: string; marks: string; centres: string; edges: string } | null {
  let scroll = solvedScroll(p);
  if (!scroll?.widths) return null;
  let walk = buildScrollCompassWalk(p, scroll.s);
  let bottom = Math.max(...walk.stations.filter(st => st.along === 0).map(st => st.half));
  let y = (st: { along: number }) => COMPASS_BOX_MARGIN + bottom + st.along;
  let half = Math.max(...walk.stations.map(st => st.half)) + COMPASS_BOX_MARGIN;
  let last = walk.stations.length - 1;
  let height = Math.max(...walk.stations.map((st, k) => y(st) + (k === last ? 0 : st.half))) + COMPASS_BOX_MARGIN;
  let marks = [pathFromLine(new Pt(0, 0), new Pt(0, height))];
  let centres: string[] = [];
  walk.stations.forEach((st, k) => {
    marks.push(k === last
      ? combinePathStrings([
        pathFromPolyline(Array.from({ length: 33 }, (_, i) => pointOnCircle({ x: 0, y: y(st), r: st.half }, -TURN.half * i / 32))),
        pathFromLine(new Pt(-st.half, y(st)), new Pt(st.half, y(st))),
      ])
      : pathFromCircle(new Circle(0, y(st), st.half)));
    let centre = { x: 0, y: y(st), r: COMPASS_STAR };
    for (let angle of [0, TURN.half / 3, 2 * TURN.half / 3]) {
      centres.push(pathFromLine(pointOnCircle(centre, angle), pointOnCircle(centre, angle + TURN.half)));
    }
  });
  let edges = [1, -1].map(side => pathFromPolyline(walk.stations.map(st => new Pt(side * st.half, y(st)))));
  return {
    box: pathFromRect(new Rectangle(new Pt(-half, 0), new Pt(half, height))),
    marks: combinePathStrings(marks),
    centres: combinePathStrings(centres),
    edges: combinePathStrings(edges),
  };
}

// every stroke of a scroll view as one path
function defineScrollViewPath(view: ScrollView): string {
  return combinePathStrings(Object.values(view).flat().map(s => 'line' in s ? pathFromLine(...s.line) : 'polygon' in s ? pathFromPolygon(s.polygon) : s.d));
}

// The scaled drawings: every sheet at full size on one paper, the plan sheets a page each and the rest
// packed after them, each page framed by helpers/sheetDraft.ts. A sheet's own PDF is one such page.

function buildScaledDrawingPage(type: ExportType, sheet: { width: number; height: number } & ExportSheet, heading: SheetHeading): PaperPage {
  let centreline = (PLAN_PAGES as readonly ExportType[]).includes(type);
  return buildDrawingPage({ ...sheet, centreline }, pageSizeFor(sheet.width, sheet.height), heading, { page: 1, of: 1, name: SHEET_LABELS[type], credit: SHEET_CREDIT });
}

export function buildScaledDrawings(p: ViolinFamilyParams, heading: SheetHeading): PaperPage[] {
  let ready = exportReady(p);
  let plans: (PdfPage & { centreline: boolean })[] = [];
  for (let type of PLAN_PAGES) {
    let sheet = ready.has(type) ? exportSheet(p, type) : null;
    if (sheet) plans.push({ label: SHEET_LABELS[type], ...sheetSize(p, type, sheet), paths: sheet.paths, texts: sheet.texts, centreline: true });
  }
  // the rest in their own frames, each sheet whole, filling pages of the one paper every page prints on
  let groups: PieceGroup[] = PDF_GROUPS
    .map(({ label, types }) => ({
      label,
      pieces: types.filter(type => ready.has(type)).map(type => exportSheet(p, type)).filter((sheet): sheet is ExportSheet => !!sheet),
    }))
    .filter(group => group.pieces.length);
  let paper = paperFor([...plans, ...groups.flatMap(g => g.pieces.map(piece => pathsBounds(piece.paths.map(path => path.d))))]);
  let pages = [...plans, ...paginatePieces(groups, paper)];
  return pages.map((page, i) => buildDrawingPage(page, pageSizeFor(page.width, page.height, paper), heading, { page: i + 1, of: pages.length, name: page.label, credit: SHEET_CREDIT }));
}

// The schematic: A4 pages to print at home and read at the bench, each view reduced to fit and
// carrying its own dimensions. A page here is a description, a view's paths and marks and a
// table's rows, which helpers/sheetDraft.ts draws. A page whose stage hasn't been reached is left
// out, and so is a mark or a row within one. Every number is a param or read off a solve; a
// dimension with no text of its own prints what it measures.

// the sections a maker works to: the two widest points and the waist
const SECTION_CODES: readonly BodyLandmark['code'][] = ['UB', 'C', 'LB'];
// how far apart a section's heights are taken: the first of these steps that leaves its figures
// room on one line at the scale it's drawn
const ORDINATE_STEPS = [10, 20, 40, 50, 100];
const CROSS_ORDINATE_PITCH = 8;
// a long arch is read every seventh of the body out from its peak, both ways, so the peak's
// neighbours stand evenly about it; a peak at the fourth seventh, where it usually stands, reads at
// the sevenths themselves. Where the arch has no peak the fourth seventh stands in for it
const LONG_ARCH_DIVISIONS = 7;
// what a page keeps under its view for a table of five rows
const TABLE_ROOM = 34;

export type SchematicPageName = 'body' | 'arching' | 'fHoles' | 'neck' | 'head';

export function buildSchematicPages(p: ViolinFamilyParams): { name: SchematicPageName; spec: SheetPageSpec }[] {
  let pages: [SchematicPageName, SheetPageSpec | null][] = [
    ['body', buildBodyPage(p)], ['arching', buildArchingPage(p)], ['fHoles', buildFholesPage(p)], ['neck', buildNeckPage(p)], ['head', buildHeadPage(p)],
  ];
  return pages.flatMap(([name, spec]) => spec ? [{ name, spec }] : []);
}

export function buildSchematic(p: ViolinFamilyParams, heading: SheetHeading): PaperPage[] {
  let pages = buildSchematicPages(p);
  return pages.map((page, i) => buildSchematicPage(page.spec, heading, { page: i + 1, of: pages.length, credit: SHEET_CREDIT }));
}

// values as a row prints them: a typed one to the hundredth, as it was typed, and a measured one
// to `places`. Null while any is missing
function formatValues(values: (number | null | undefined)[], between = ' / ', after = '', places = 2): string | null {
  return values.every(v => typeof v === 'number' && Number.isFinite(v)) ? values.map(v => formatMm(v!, places)).join(between) + after : null;
}

// a row with nothing to say is left out
function buildRows(rows: [string, string | null][]): SheetRow[] {
  return rows.flatMap(([label, value]) => value === null ? [] : [{ label, value }]);
}

// a plate's arch height: the solved surface on the joint, above the plate's edge, where the long
// arch stands highest
function calcArchPeak(p: ViolinFamilyParams, plate: Plate): { y: number; height: number } | null {
  let surface = p.arching ? solveCrossArching(p)?.[plate] : null;
  let la = surface?.longArch;
  if (!surface || !la) return null;
  let y = la.yStart;
  for (let at = la.yStart; at <= la.yEnd; at += 1) if (longArchHeightAt(la, at) > longArchHeightAt(la, y)) y = at;
  let height = surfaceZAt(surface, 0, y);
  return height === null ? null : { y, height };
}

// plan and side elevation on the same station lines. The widths are callipered off the outline at
// its stations; the side's are taken along the bottom, back to belly
function buildBodyPage(p: ViolinFamilyParams): SheetPageSpec | null {
  let rib = ribOutline(p);
  if (!rib) return null;
  let o = solvePlateContour(p);
  let outline = o?.top ?? rib;
  let loop = samplePathToPolyline(outline, 0.25);
  let half = Math.max(...loop.map(pt => Math.abs(pt.x)));
  let foot = Math.min(...loop.map(pt => pt.y));
  let head = Math.max(...loop.map(pt => pt.y));
  let h = p.body.height;
  let landmarks = calcBodyLandmarks(p);
  let holes = fholes(p);
  let a = p.arching && o ? solveLongArching(p) : null;
  let side = a?.ribs && o ? defineBodySideProfile(p, a, o) : null;
  let ribs = a?.ribs && side ? calcRibLine(p, a.ribs) : null;
  let backPeak = side ? calcArchPeak(p, 'back') : null;
  let topPeak = side ? calcArchPeak(p, 'top') : null;
  let backThickness = p.arching?.back.thickness ?? 0;
  let buttonHeight = o?.button ? p.plateContour!.button.height : 0;
  // the belly's edge and crown where the tilted plate carries them in the side view
  let onRibs = a?.ribs ? calcTopPlatePlacement(p, a.ribs) : null;
  let topEdgeZ = a?.ribs ? a.ribs.zLower + p.arching!.top.thickness : 0;
  let topEdge = onRibs && topPeak ? placeOnTopPlate(onRibs, new Pt(topEdgeZ, topPeak.y)) : null;
  let topCrown = onRibs && topPeak ? placeOnTopPlate(onRibs, new Pt(topEdgeZ + topPeak.height, topPeak.y)) : null;
  let backReach = backThickness + (backPeak?.height ?? 0);
  let topReach = topCrown?.x ?? (ribs ? Math.max(ribs.zLow, ribs.zHigh) + p.arching!.top.thickness : 0);

  let view = (scale: number): SheetView => {
    let left = -half - 11 * scale;
    let sideX = half + 11 * scale + backReach;
    let right = side ? sideX + topReach + 2 * scale : half + 2 * scale;
    let strokes: SheetStroke[] = [
      { d: outline },
      { d: pathFromLine(new Pt(0, foot - 3 * scale), new Pt(0, head + buttonHeight + 3 * scale)), ink: 'note', dashed: true },
    ];
    for (let d of [o?.purfling, o?.outerPurfling]) if (d) strokes.push({ d, weight: 'light' });
    for (let d of holes) strokes.push({ d });
    if (o?.button) strokes.push({ d: o.button.path, weight: 'light', dashed: true });

    let marks: SheetMark[] = [{ kind: 'dimension', from: new Pt(0, foot), to: new Pt(0, head), through: new Pt(left, 0) }];
    for (let m of landmarks) {
      marks.push({ kind: 'station', y: m.y, from: -half - 3 * scale, to: right, label: String(m.y), sub: m.code });
      let reach = plateHalfChordAtY(loop, m.y);
      if (reach && SECTION_CODES.includes(m.code)) marks.push({ kind: 'dimension', from: new Pt(-reach, m.y), to: new Pt(reach, m.y), textAt: 0.72 });
    }

    if (side && ribs) {
      strokes.push({ d: translatePath(side.ribs, sideX, 0), weight: 'light' });
      for (let plate of [side.back, side.top]) {
        strokes.push({ d: translatePath(plate.frame, sideX, 0), weight: 'light' });
        if (plate.edge) strokes.push({ d: translatePath(plate.edge, sideX, 0) });
        if (plate.arch) strokes.push({ d: translatePath(plate.arch, sideX, 0) });
      }
      if (buttonHeight) {
        strokes.push({ d: pathFromPolyline([new Pt(sideX, h), new Pt(sideX, h + buttonHeight), new Pt(sideX - backThickness, h + buttonHeight), new Pt(sideX - backThickness, h)]) });
      }
      let below = new Pt(0, 0);
      marks.push({ kind: 'dimension', from: new Pt(sideX, ribs.yHigh), to: new Pt(sideX + ribs.zHigh, ribs.yHigh), through: new Pt(0, h + buttonHeight), offset: 4 });
      marks.push({ kind: 'dimension', from: new Pt(sideX, ribs.yLow), to: new Pt(sideX + ribs.zLow, ribs.yLow), through: below, offset: -5 });
      if (backPeak) marks.push({ kind: 'dimension', from: new Pt(sideX - backReach, 0), to: new Pt(sideX - backThickness, 0), through: below, offset: -5 });
      if (topEdge && topCrown) marks.push({ kind: 'dimension', from: new Pt(sideX + topEdge.x, 0), to: new Pt(sideX + topCrown.x, 0), through: below, offset: -5 });
      if (backPeak && topCrown) marks.push({ kind: 'dimension', from: new Pt(sideX - backReach, 0), to: new Pt(sideX + topCrown.x, 0), through: below, offset: -11 });
    }
    return { strokes, marks };
  };

  let arching = p.arching;
  let measures = buildRows([
    ['Body length', formatValues([h])],
    ['Upper bout width', formatValues([p.bouts?.UBW])],
    ['Middle bout width', formatValues([solveCenterBout(p)?.CBW])],
    ['Lower bout width', formatValues([p.body.width])],
    ['Overhang', formatValues([p.body.overhang])],
  ]);
  let heights = buildRows([
    ['Rib height, end / neck', formatValues([arching?.ribHeightLower, arching?.ribHeightUpper])],
    ['Arch height, back / belly', formatValues([backPeak?.height, topPeak?.height], ' / ', '', 1)],
    ['Edge thickness, back / belly', formatValues([arching?.back.thickness, arching?.top.thickness])],
    ['Purfling from edge', formatValues([p.plateContour?.purflingOffset])],
    ['Button, width × height', formatValues([p.plateContour?.button.width, p.plateContour?.button.height], ' × ')],
  ]);
  return { columns: [{ x: 0, w: SCHEMATIC_AREA.width, blocks: [{ view, h: SCHEMATIC_AREA.height - TABLE_ROOM }, { tables: [measures, heights], w: 66 }] }] };
}

// the step between heights on a view drawn 1 : scale, its figures `pitch` mm apart on the paper or more
function calcOrdinateStep(scale: number, pitch: number): number {
  return ORDINATE_STEPS.find(step => step / scale >= pitch) ?? ORDINATE_STEPS[ORDINATE_STEPS.length - 1];
}

// one plate's section at a station, edge to edge: the surface the cross-arch templates are cut to.
// Both halves, since a crown set off the joint or a spline drawn one side at a time leaves them
// different
function calcSection(surface: PlateSurface, y: number): { half: number; profile: Pt[]; row: SurfaceRow } | null {
  let row = rowAt(surface, y);
  let half = row.outerHalf;
  if (half === null) return null;
  // the end samples stand on the outline itself, where the surface may read as off the plate
  let profile = calcSectionRuns(surface, y).flatMap(run => run.pts).filter(pt => Number.isFinite(pt.y));
  return { half, profile, row };
}

// each plate's sections at the upper bout, the waist and the lower bout, and both long
// arches, every height read off the solved surface
function buildArchingPage(p: ViolinFamilyParams): SheetPageSpec | null {
  let c = p.arching ? solveCrossArching(p) : null;
  if (!c || (!c.top && !c.back)) return null;
  let h = p.body.height;
  let stations = calcBodyLandmarks(p).filter(m => SECTION_CODES.includes(m.code)).sort((m, n) => n.y - m.y);
  let plates = [...TEMPLATE_PLATES].reverse().flatMap(({ plate, label }) => {
    let surface = c[plate];
    if (!surface) return [];
    let sections = stations.flatMap(m => {
      let section = calcSection(surface, m.y);
      return section ? [{ ...m, ...section, surface }] : [];
    });
    let centreline = Array.from({ length: Math.ceil(h / 2) + 1 }, (_, i) => {
      let y = h * i / Math.ceil(h / 2);
      return new Pt(channelCenterlineZAt(p, p.fluting![plate], surface.longArch, y), y);
    });
    return [{ plate, label, surface, sections, centreline }];
  });
  let widest = Math.max(...plates.flatMap(pl => pl.sections.map(sec => sec.half)));

  let cross = (scale: number): SheetView => {
    let strokes: SheetStroke[] = [];
    let marks: SheetMark[] = [];
    let cursor = 0;
    let step = calcOrdinateStep(scale, CROSS_ORDINATE_PITCH);
    for (let { label, sections } of plates) {
      marks.push({ kind: 'callout', at: new Pt(-widest - 7 * scale, cursor), text: label, bare: true, anchor: 'start' });
      cursor -= 6 * scale;
      for (let section of sections) {
        let rise = Math.max(...section.profile.map(pt => pt.y));
        let dip = Math.min(0, ...section.profile.map(pt => pt.y));
        let base = cursor - rise;
        strokes.push({ d: translatePath(pathFromPolyline(section.profile), 0, base) });
        strokes.push({ d: pathFromLine(new Pt(0, base), new Pt(0, base + rise + 4 * scale)), ink: 'note', dashed: true });
        // the solved surface's height above the plate's edge every step out from the joint, both
        // ways, each written as its point (x, z)
        let reach = Math.ceil(section.half / step) - 1;
        let heights = Array.from({ length: 2 * reach + 1 }, (_, i) => {
          let x = (i - reach) * step;
          let height = surfaceZAt(section.surface, x, section.y, section.row) ?? 0;
          return { at: x + section.half, height, text: `(${formatMm(x)}, ${formatHeight(height)})` };
        });
        marks.push({ kind: 'ordinates', origin: new Pt(-section.half, base), axis: new Pt(1, 0), normal: new Pt(0, 1), length: 2 * section.half, values: 'base', stations: heights });
        marks.push({ kind: 'callout', at: new Pt(-section.half - 1.5 * scale, base + rise / 2), text: section.code, sub: String(section.y), bare: true, anchor: 'end' });
        cursor = base + dip - 17 * scale;
      }
    }
    marks.push({ kind: 'callout', at: new Pt(-widest - 7 * scale, cursor + 6 * scale), text: `Points (x, z)`, bare: true, anchor: 'start' });
    return { strokes, marks };
  };

  // the back bows to the left and the belly to the right, as they lie in the side elevation, every
  // height written past its tip as its point (y, z), the neck's end among them. A step too near
  // either end to letter clear gives way
  let long = (scale: number): SheetView => {
    let strokes: SheetStroke[] = [];
    let marks: SheetMark[] = [];
    let step = h / LONG_ARCH_DIVISIONS;
    let room = (DRAWING_TEXT.label + 1) * scale;
    for (let [i, { plate, label, surface, centreline }] of [...plates].reverse().entries()) {
      let sign = plate === 'back' ? -1 : 1;
      let x = i * 20 * scale;
      let peak = calcArchPeak(p, plate);
      let anchor = peak?.y ?? h * 4 / LONG_ARCH_DIVISIONS;
      let steps = Array.from({ length: 2 * LONG_ARCH_DIVISIONS - 1 }, (_, k) => anchor + (k + 1 - LONG_ARCH_DIVISIONS) * step)
        .filter(at => at !== anchor && at > room && at < h - room);
      let heights = [...steps, h].map(at => ({ at, height: surfaceZAt(surface, 0, at) ?? 0 }));
      if (peak) heights = [...heights, { at: peak.y, height: peak.height }].sort((a, b) => a.at - b.at);
      let points = heights.map(st => ({ ...st, text: `(${formatMm(st.at, 0)}, ${formatHeight(st.height)})` }));
      strokes.push({ d: pathFromPolyline(centreline.map(pt => new Pt(x + sign * pt.x, pt.y))) });
      marks.push({ kind: 'ordinates', origin: new Pt(x, 0), axis: new Pt(0, 1), normal: new Pt(sign, 0), length: h, stations: points, values: 'tip' });
      marks.push({ kind: 'callout', at: new Pt(x, h + 5 * scale), text: label, bare: true });
    }
    marks.push({ kind: 'callout', at: new Pt(10 * scale, -6 * scale), text: 'Points (y, z)', bare: true });
    return { strokes, marks };
  };

  return {
    columns: [
      { x: 0, w: 120, blocks: [{ view: cross, h: SCHEMATIC_AREA.height }] },
      { x: 126, w: SCHEMATIC_AREA.width - 126, blocks: [{ view: long, h: SCHEMATIC_AREA.height }] },
    ],
  };
}

// both holes in place on the top, boxed, the plate's edge and purfling running through the box
function buildFholesPage(p: ViolinFamilyParams): SheetPageSpec | null {
  let s = p.fHoleContours ? solveFholeContours(p) : null;
  if (!s?.path || !s.UTip || !s.LTip) return null;
  let f = p.fHoles!;
  let o = solvePlateContour(p);
  let { UEye, LEye, stem } = f;
  let bass = defineFholePath(p, s, true)!;
  let b = pathsBounds([s.path]);
  let pad = 0.14 * b.height;
  let box = pathFromRect(new Rectangle(new Pt(-b.maxX - 2 * pad, b.minY - pad), new Pt(b.maxX + 2 * pad, b.maxY + pad)));
  let edges = calcStemEdgePoints(stem);
  let notch = stemEdgeAt(stem, edges.inner, stem.center.y);

  let strokes: SheetStroke[] = [
    { d: box, ink: 'note', weight: 'heavy' },
    { d: s.path },
    { d: bass },
    { d: pathFromLine(new Pt(0, b.minY - pad), new Pt(0, b.maxY + pad)), ink: 'note', dashed: true },
    { d: pathFromLine(new Pt(-notch.x, notch.y), notch), ink: 'note', dashed: true },
  ];
  if (o?.top) strokes.push({ d: occludePath(o.top, box).hidden });
  for (let d of [o?.purfling, o?.outerPurfling]) if (d) strokes.push({ d: occludePath(d, box).hidden, weight: 'light' });

  // the two measures that run aslant, eye to eye and wing point to wing point, are drawn on the
  // bass hole and read off beside it, where their figures don't lie along the hole's own edge
  let bassUEye = new Pt(-UEye.x, UEye.y), bassLEye = new Pt(-LEye.x, LEye.y);
  let bassUTip = new Pt(-s.UTip.x, s.UTip.y), bassLTip = new Pt(-s.LTip.x, s.LTip.y);
  let marks: SheetMark[] = [
    { kind: 'dimension', from: new Pt(-(UEye.x - UEye.r), UEye.y), to: new Pt(UEye.x - UEye.r, UEye.y), textAt: 0.62 },
    { kind: 'dimension', from: new Pt(-(LEye.x - LEye.r), LEye.y), to: new Pt(LEye.x - LEye.r, LEye.y), textAt: 0.62 },
    { kind: 'dimension', from: new Pt(UEye.x - UEye.r, UEye.y), to: new Pt(UEye.x + UEye.r, UEye.y), through: new Pt(0, UEye.y - UEye.r), offset: -6.5 },
    { kind: 'dimension', from: new Pt(LEye.x - LEye.r, LEye.y), to: new Pt(LEye.x + LEye.r, LEye.y), through: new Pt(0, LEye.y + LEye.r), offset: 3 },
    { kind: 'dimension', from: edges.inner, to: edges.outer, text: formatMm(stem.width, 2) },
    { kind: 'dimension', from: bassUEye, to: bassLEye, text: '' },
    { kind: 'callout', at: pointAtDistanceToward(bassUEye, bassLEye, 0.3 * dist(bassUEye, bassLEye)), dx: 16, dy: 4, text: formatMm(dist(bassUEye, bassLEye)) },
    { kind: 'dimension', from: bassUTip, to: bassLTip, text: '' },
    { kind: 'callout', at: pointAtDistanceToward(bassUTip, bassLTip, 0.62 * dist(bassUTip, bassLTip)), dx: 18, dy: -5, text: formatMm(dist(bassUTip, bassLTip)) },
    { kind: 'dimension', from: new Pt(-b.maxX, b.minY), to: new Pt(-b.maxX, b.maxY), offset: 5 },
  ];

  let lengths = buildRows([
    ['Stop, upper edge to notches', formatValues([p.body.height - stem.center.y])],
    ['Length', formatValues([b.height], '', '', 1)],
    ['Between upper eyes', formatValues([2 * (UEye.x - UEye.r)])],
    ['Between lower eyes', formatValues([2 * (LEye.x - LEye.r)])],
    ['Upper eye to lower eye', formatValues([dist(UEye, LEye)], '', '', 1)],
  ]);
  let widths = buildRows([
    ['Upper eye diameter', formatValues([2 * UEye.r])],
    ['Lower eye diameter', formatValues([2 * LEye.r])],
    ['Eye centres from joint, upper / lower', formatValues([UEye.x, LEye.x])],
    ['Stem width', formatValues([stem.width])],
    ['Between wing points', formatValues([dist(s.UTip, s.LTip)], '', '', 1)],
  ]);
  return { columns: [{ x: 0, w: SCHEMATIC_AREA.width, blocks: [{ view: { strokes, marks }, h: SCHEMATIC_AREA.height - TABLE_ROOM }, { tables: [lengths, widths], w: 76 }] }] };
}

// the neck and whatever of the scroll has solved, in the side elevation's frame
function defineNeckSidePath(p: ViolinFamilyParams, n: NeckSolve, scroll: ScrollSolve | null): string {
  if (!scroll) return combinePathStrings([...neckOutline(p, n, n.backNut!), pathFromLine(n.neckTop!, n.backNut!)]);
  let onNeck = calcScrollOnNeck(p, n);
  return combinePathStrings([
    ...neckOutline(p, n, applyMatrix(onNeck, pointOnCircle(scroll.nape!, scroll.nape!.start))),
    pathFromLine(n.neckTop!, applyMatrix(onNeck, new Pt(0, p.neck!.nutHeight))),
    transformPath(defineSideScrollPath(p, scroll), onNeck),
  ]);
}

// the neck from the side with what sets it, and beside it the whole instrument small, strung: the
// string's length along the string and the stop down the body
function buildNeckPage(p: ViolinFamilyParams): SheetPageSpec | null {
  let n = solvedNeck(p);
  if (!n) return null;
  let nk = p.neck!;
  let h = p.body.height;
  let neck = defineNeckSidePath(p, n, solvedScroll(p)?.s ?? null);
  let root = n.root!;
  let lean = nk.angle * TURN.degree;
  let reach = 0.42 * nk.length;
  let a = solveLongArching(p);
  let o = solvePlateContour(p);
  let side = a && o ? defineBodySideProfile(p, a, o) : null;
  let body = side ? [side.ribs, side.back.frame, side.back.edge, side.back.arch, side.top.frame, side.top.edge, side.top.arch].filter((d): d is string => !!d) : [];
  let backThickness = p.arching!.back.thickness;
  let button = pathFromPolyline([new Pt(0, h), new Pt(0, n.tip!.y), new Pt(-backThickness, n.tip!.y), new Pt(-backThickness, h)]);

  // the top of the body the neck stands on, and no more of it
  let below = new Rectangle(new Pt(-1e4, h - 0.03 * h), new Pt(1e4, h + 1e4));
  let strokes: SheetStroke[] = [
    { d: neck },
    { d: button, weight: 'light' },
    ...body.map(d => ({ d: occludePath(d, pathFromRect(below)).hidden, weight: 'light' as const })),
    { d: pathFromLine(root, new Pt(root.x, root.y + 1.15 * reach)), ink: 'note', dashed: true },
    { d: arcPathData(root, reach, TURN.quarter + Math.min(lean, 0), TURN.quarter + Math.max(lean, 0)), ink: 'note' },
  ];
  let marks: SheetMark[] = [
    { kind: 'dimension', from: n.bottomFront!, to: n.neckTop!, offset: -14 },
    { kind: 'dimension', from: n.neckTop!, to: n.backNut!, offset: 4 },
    { kind: 'dimension', from: n.lowerThickness![0], to: n.lowerThickness![1], offset: -4 },
    { kind: 'callout', at: pointOnCircle({ ...root, r: reach }, TURN.quarter + lean / 2), dy: 2.4, text: `${formatMm(nk.angle, 2)}°`, bare: true },
  ];
  if (n.plateEdge) marks.push({ kind: 'dimension', from: n.plateEdge, to: root, offset: -6 });
  if (n.heel) marks.push({ kind: 'callout', at: pointOnCircle(n.heel, n.heel.start + signedArcSweep(n.heel) / 2), dx: -16, dy: 9, text: `R ${formatMm(nk.heelRadius, 2)}` });

  let beside: SheetBlock[] = [];
  let st = p.stringSetup ? solveStringSetup(p) : null;
  if (st?.nutTop && st.bridgeTop && st.bridgeFoot && st.bridge) {
    let stop = p.stringSetup!.bodyStop;
    beside.push({
      h: 150,
      view: {
        strokes: [
          { d: neck },
          { d: button },
          ...body.map(d => ({ d })),
          { d: pathFromPolygon(st.bridge) },
          { d: pathFromLine(st.nutTop, st.bridgeTop), ink: 'note' },
        ],
        marks: [
          { kind: 'dimension', from: st.nutTop, to: st.bridgeTop, offset: 6, text: `~${Math.round(dist(st.nutTop, st.bridgeTop))}` },
          { kind: 'dimension', from: new Pt(st.bridgeFoot.x, h), to: new Pt(st.bridgeFoot.x, h - stop), through: st.bridgeTop, offset: 15 },
        ],
      },
    });
  }
  let rows = buildRows([
    ['Neck length', formatValues([nk.length])],
    ['Angle', formatValues([nk.angle], '', '°')],
    ['Overstand', formatValues([nk.overstand])],
    ['Width, nut / root', formatValues([nk.topWidth, nk.rootWidth])],
    ['Mortise depth', formatValues([nk.mortiseDepth])],
  ]);
  return {
    columns: [
      { x: 0, w: 118, blocks: [{ view: { strokes, marks }, h: SCHEMATIC_AREA.height }] },
      { x: 126, w: SCHEMATIC_AREA.width - 126, blocks: [...beside, { tables: [rows], w: SCHEMATIC_AREA.width - 126 }] },
    ],
  };
}

// the volute's turns as a maker callipers them: where the curve, from the eye's back under the eye
// and out round the spiral and over the head's back, crosses the level and the plumb through the
// eye's centre. They pair from the inside out, one each side of the centre; a crossing left with no
// partner, the back's own, is no turn's
export function calcVoluteTurns(s: ScrollSolve): { widths: [Pt, Pt][]; heights: [Pt, Pt][] } {
  let eye = s.eye!;
  let curve = combinePathStrings([
    arcPathData(eye, eye.r, -TURN.half, 0),
    ...[...[...s.spiral!].reverse(), s.S0!, s.S1!, s.S2!].map(arc => arcPathData(arc, arc.r, arc.start, arc.end)),
  ]);
  let run = samplePathToPolyline(curve, 0.02, true);
  // a hair under the centre, so the eye's own two ends on the level each count once
  let xs = polylineCrossingsAtY(run, eye.y - 1e-7, false);
  let ys = polylineCrossingsAtY(run.map(pt => new Pt(pt.y, pt.x)), eye.x, false);
  let left = xs.filter(x => x < eye.x).reverse(), right = xs.filter(x => x > eye.x);
  let under = ys.filter(y => y < eye.y).reverse(), over = ys.filter(y => y > eye.y);
  return {
    widths: left.slice(0, right.length).map((x, i) => [new Pt(x, eye.y), new Pt(right[i], eye.y)]),
    heights: under.slice(0, over.length).map((y, i) => [new Pt(eye.x, y), new Pt(eye.x, over[i])]),
  };
}

// which view shows each width, and what the sheet calls it
const HEAD_WIDTHS: Partial<Record<ScrollStationKey, { view: 'front' | 'back'; name: string }>> = {
  nut: { view: 'front', name: 'nut' },
  hip: { view: 'front', name: 'hips' },
  throat: { view: 'front', name: 'throat' },
  turn2Bottom: { view: 'front', name: 'turn 2, bottom' },
  eye: { view: 'front', name: 'eyes' },
  turn2Top: { view: 'front', name: 'turn 2, top' },
  crown: { view: 'front', name: 'crown' },
  duckTail: { view: 'back', name: 'duck tail' },
  foot: { view: 'back', name: 'foot' },
  poll: { view: 'back', name: 'poll' },
  turn1Bottom: { view: 'back', name: 'turn 1, bottom' },
};
// how close two call-outs' texts, or two levels' labels, may stand on the paper
const CALLOUT_PITCH = 6.2;
const CALLOUT_REACH = 5;
const LEVEL_PITCH = 2.4;

// the head from the side, the front and the back, all standing on the nut line. The side carries
// each turn's width and height through the eye; the front and back each width, called out at the
// height the widths solve hangs it at
function buildHeadPage(p: ViolinFamilyParams): SheetPageSpec | null {
  let scroll = solvedScroll(p);
  if (!scroll?.widths) return null;
  let s = scroll.s;
  let v = p.scroll!;
  let eye = s.eye!;
  let side = defineSideScrollPath(p, s);
  let front = defineScrollViewPath(buildScrollFrontViewStrokes(p, s, (x, y) => new Pt(x, y), 0));
  let back = defineScrollViewPath(buildScrollBackViewStrokes(p, s, (x, y) => new Pt(x, y), 0));
  let sb = pathsBounds([side]), fb = pathsBounds([front]), bb = pathsBounds([back]);
  let turns = calcVoluteTurns(s);
  let extent = calcScrollExtent(s);
  let widths = calcScrollWidthStations(p, s).filter(st => HEAD_WIDTHS[st.key]).sort((m, n) => m.at.y - n.at.y);

  let view = (scale: number): SheetView => {
    // each call-out reads on its own level, the figure over the line and the name under it, a
    // leader's reach out from the outline. One that would land on another's text steps out past it
    let texts: Record<'front' | 'back', { from: number; to: number; level: number }[]> = { front: [], back: [] };
    let placed = widths.map(st => {
      let { view: which, name } = HEAD_WIDTHS[st.key]!;
      let wide = Math.max(timesWidth(formatMm(st.width, 2), DRAWING_TEXT.label), timesWidth(name, DRAWING_TEXT.small));
      let level = st.at.y / scale;
      let from = st.width / 2 / scale + CALLOUT_REACH;
      for (let t of texts[which]) if (Math.abs(t.level - level) < CALLOUT_PITCH && from < t.to + 1 && from + wide + 1 > t.from) from = t.to + 1 + CALLOUT_REACH;
      texts[which].push({ from, to: from + wide + 1, level });
      return { st, which, name, dx: from - st.width / 2 / scale };
    });
    let frontX = sb.maxX + 9 * scale - fb.minX;
    let backX = frontX + (Math.max(...texts.front.map(t => t.to)) + 2) * scale - bb.minX;
    let right = backX + bb.maxX + 2 * scale;
    let top = Math.max(sb.maxY, fb.maxY, bb.maxY);
    let strokes: SheetStroke[] = [
      { d: side },
      { d: translatePath(front, frontX, 0) },
      { d: translatePath(back, backX, 0) },
      { d: pathFromLine(new Pt(sb.minX, 0), new Pt(right, 0)), ink: 'note' },
      { d: pathFromLine(new Pt(frontX, -2 * scale), new Pt(frontX, top + 2 * scale)), ink: 'note', dashed: true },
      { d: pathFromLine(new Pt(backX, -2 * scale), new Pt(backX, top + 2 * scale)), ink: 'note', dashed: true },
    ];
    let marks: SheetMark[] = [];
    turns.widths.forEach(([from, to], i) => marks.push({ kind: 'dimension', from, to, through: new Pt(0, sb.maxY), offset: 3 + 3.8 * i }));
    turns.heights.forEach(([from, to], i) => marks.push({ kind: 'dimension', from, to, through: new Pt(sb.minX, 0), offset: 3 + 3.8 * i }));
    marks.push({ kind: 'dimension', from: new Pt(-extent.width, sb.minY), to: new Pt(0, sb.minY), offset: -5 });

    let labelled = -Infinity;
    for (let { st, which, name, dx } of placed) {
      let level = st.at.y / scale;
      let clear = level - labelled >= LEVEL_PITCH;
      marks.push({ kind: 'station', y: st.at.y, from: frontX + fb.minX - 2 * scale, to: right, sub: clear ? formatMm(st.at.y) : undefined });
      if (clear) labelled = level;
      let at = new Pt((which === 'front' ? frontX : backX) + st.width / 2, st.at.y);
      marks.push({ kind: 'callout', at, dx, text: formatMm(st.width, 2), sub: name });
    }
    return { strokes, marks };
  };

  let lengths = buildRows([
    ['Head length, duck tail to crown', formatValues([extent.height - sb.minY], '', '', 1)],
    ['Head depth', formatValues([extent.width], '', '', 1)],
    ['Eye diameter', formatValues([2 * eye.r])],
  ]);
  let across = buildRows([
    ['Width across the eyes', formatValues([v.widths.eye])],
    ['Nut width', formatValues([p.neck!.nutWidth])],
    ['Pegbox wall', formatValues([v.wall])],
  ]);
  return { columns: [{ x: 0, w: SCHEMATIC_AREA.width, blocks: [{ view, h: SCHEMATIC_AREA.height - TABLE_ROOM }, { tables: [lengths, across], w: 66 }] }] };
}

// Physical templates for hand-carving: a strip with the arch along both long edges, so one edge
// sits over the outside of a carved plate and the other in a hollow carved from the inside.

const TEMPLATE_GAP = 5;
const TEMPLATE_MIN_WIDTH = 15;
// a longer strip is wider in proportion, length to width at most this, so it holds its shape in the hand
const TEMPLATE_SLENDERNESS = 18.75;
const templateWidth = (span: number) => Math.max(TEMPLATE_MIN_WIDTH, span / TEMPLATE_SLENDERNESS);

// a closed template blank plus where and how to print its label: upright on the wide cross-arch
// strips, turned 90° along the long, narrow long-arch strips
export interface TemplateShape {
  path: string;
  label: string;
  labelPos: Pt;
  labelRotation: number;
}

// the vertices of a plain `M x y L x y …` polyline, exactly as written
function parsePolyline(path: string): Pt[] {
  return [...path.matchAll(/[ML]\s*(-?[\d.]+(?:e-?\d+)?)[\s,]+(-?[\d.]+(?:e-?\d+)?)/gi)].map(m => new Pt(+m[1], +m[2]));
}

const archSpan = (arch: Pt[]) => dist(arch[0], arch[arch.length - 1]);

// the arch, the same arch lifted off the wood by `lift`, and the two ends joining them. The lifted
// copy is handed over already walking back, since unify can only turn round a single segment. The
// label sits at the crown, where the strip runs straightest
function archTemplate(arch: Pt[], lift: Pt, label: string, labelRotation: number): TemplateShape {
  let last = arch.length - 1;
  let lifted = arch.map(pt => new Pt(pt.x + lift.x, pt.y + lift.y));
  let path = unifyConnectedSvgPaths([
    pathFromPolyline(arch),
    pathFromLine(arch[last], lifted[last]),
    pathFromPolyline([...lifted].reverse()),
    pathFromLine(lifted[0], arch[0]),
  ]) + ' Z';
  let along = (pt: Pt) => pt.x * lift.x + pt.y * lift.y;
  let crown = arch.reduce((a, b) => along(b) > along(a) ? b : a);
  return { path, label, labelPos: new Pt(crown.x + lift.x / 2, crown.y + lift.y / 2), labelRotation };
}

function translateTemplateShape(shape: TemplateShape, dx: number, dy: number): TemplateShape {
  return { ...shape, path: translatePath(shape.path, dx, dy), labelPos: new Pt(shape.labelPos.x + dx, shape.labelPos.y + dy) };
}

// turned 180° about the origin, so a plate whose arch runs the other way in its own frame bows the
// same way on the sheet. A rotation, not a mirror: an asymmetric arch keeps its hand. The label's
// rotation is untouched, since text renders upright regardless
function rotateTemplateShape180(shape: TemplateShape): TemplateShape {
  return { ...shape, path: rotatePath180(shape.path), labelPos: new Pt(-shape.labelPos.x, -shape.labelPos.y) };
}

// each shape centred on x = 0, placed left to right with a gap between, the row itself centred
function rowTemplates(shapes: TemplateShape[]): TemplateShape[] {
  let bounds = shapes.map(s => pathsBounds([s.path]));
  let totalWidth = bounds.reduce((sum, b) => sum + b.width, 0) + TEMPLATE_GAP * Math.max(shapes.length - 1, 0);
  let xCursor = -totalWidth / 2;
  return shapes.map((shape, i) => {
    let b = bounds[i];
    let placed = translateTemplateShape(shape, xCursor - b.minX, -b.minY);
    xCursor += b.width + TEMPLATE_GAP;
    return placed;
  });
}

// each shape centred on x = 0, stacked bottom to top with a gap between
function stackTemplates(shapes: TemplateShape[]): TemplateShape[] {
  let yCursor = 0;
  return shapes.map(shape => {
    let b = pathsBounds([shape.path]);
    let placed = translateTemplateShape(shape, -b.minX - b.width / 2, yCursor - b.minY);
    yCursor += b.height + TEMPLATE_GAP;
    return placed;
  });
}

// where a plate gets cross-arch templates: the two widest points and the waist, which a section is
// sighted against whether or not the maker set a station there, plus any station they did set that
// isn't already on one, which would be the same template cut twice. A station set on a corner
// takes the corner's name
function templateStations(p: ViolinFamilyParams, plate: Plate): { y: number; code: string }[] {
  let landmarks = calcBodyLandmarks(p);
  let sighted = landmarks.filter(m => SECTION_CODES.includes(m.code)).map(m => ({ y: m.y, code: m.code as string }));
  let authored = p.arching![plate].cross.stations
    .map(st => Math.round(st.y))
    .filter(y => Number.isFinite(y) && !sighted.some(m => Math.abs(m.y - y) <= STATION_MERGE_EPS_MM))
    .map(y => ({ y, code: landmarks.find(m => Math.abs(m.y - y) <= STATION_MERGE_EPS_MM)?.code ?? '' }));
  return [...sighted, ...authored].sort((a, b) => a.y - b.y);
}

// the two plates, back first: the order the blanks stack in on the sheet
const TEMPLATE_PLATES: ReadonlyArray<{ plate: Plate; label: string }> = [{ plate: 'back', label: 'Back' }, { plate: 'top', label: 'Top' }];

// cross-arch template blanks for both plates, stacked into one layout, all as wide as the longest
// needs. Each section is read off the sampled surface rather than the station's own chord-wise
// solve, which disagrees with the surface at the corners: the blank has to match what the plate is
// carved to. The back's arch hangs down in its own frame, so its blanks are turned over to bow the
// same way as the top's. Each plate is cut at its own stations
export function crossArchTemplates(p: ViolinFamilyParams): TemplateShape[] {
  let c = p.arching ? solveCrossArching(p) : null;
  if (!c) return [];
  let arches = TEMPLATE_PLATES.flatMap(({ plate, label }) => {
    let surface = c[plate];
    if (!surface) return [];
    let signZ = plate === 'top' ? 1 : -1;
    return templateStations(p, plate).flatMap(({ y, code }) => {
      let arch = calcSectionRuns(surface, y).find(run => run.part === 'arch');
      return arch ? [{ pts: arch.pts.map(pt => new Pt(pt.x, signZ * pt.y)), label: `${label} ${code ? `${code} ` : ''}${Math.round(y)}mm`, plate, signZ }] : [];
    });
  });
  if (!arches.length) return [];
  // one width for the whole set, the longest blank's, so they read as a set
  let width = templateWidth(Math.max(...arches.map(a => archSpan(a.pts))));
  return stackTemplates(arches.map(({ pts, label, plate, signZ }) => {
    let shape = archTemplate(pts, new Pt(0, signZ * width), label, 0);
    return plate === 'back' ? rotateTemplateShape180(shape) : shape;
  }));
}

// the two long-arch blanks side by side, each plate's long arch as the long arching panel draws it,
// takeoff to takeoff, so the two can differ in length as well as height. The top is turned over to
// bow the same way as the back
export function longArchTemplates(p: ViolinFamilyParams): TemplateShape[] {
  let a = p.arching ? solveLongArching(p) : null;
  if (!a) return [];
  let templates: TemplateShape[] = [];
  for (let { plate, label } of TEMPLATE_PLATES) {
    let la = a[plate];
    if (!la) continue;
    let sign: 1 | -1 = plate === 'top' ? 1 : -1;
    let arch = parsePolyline(defineArchPath(la.lowered, la.span, la.yStart, 0, sign, la.farZ));
    let shape = archTemplate(arch, new Pt(sign * templateWidth(archSpan(arch)), 0), `${label} Long`, 90);
    templates.push(plate === 'top' ? rotateTemplateShape180(shape) : shape);
  }
  return rowTemplates(templates);
}

// The neck and scroll template, in the side elevation's frame: the outline as one closed loop, neck
// foot to duck tail, and the volute inside it as a stencil. A template has to hold together, so the
// spiral can't be cut through: it's cut as slots along its path with bridges left between them, the
// way any stencil is, and where two turns run too close for a slot to leave wood between them, or the
// front's edge comes too near, it falls back to pricked dots along the curve. One wall of each slot
// is the curve itself, the wall away from the eye, and the slot's width is taken inward, so the
// maker rides a pencil against the true wall as they would the outline's edge. The eye is a prick at
// its centre, not a hole: a hole would leave a thin ring to the innermost turn.

export interface NeckTemplateSpec {
  slotWidth: number;
  bridgeWidth: number;
  // a bridge at every arc junction and at least this often along a run
  bridgeEvery: number;
  // a slot shorter than this is merged across the junction, or pricked instead
  minSlot: number;
  // the wood left between a slot and the next turn or the outline
  minWeb: number;
  dotEvery: number;
  dotRadius: number;
}

// the stencil's cuts scale with the material, not the instrument; the run lengths scale with it
export function defaultNeckTemplateSpec(p: ViolinFamilyParams): NeckTemplateSpec {
  let k = p.body.height / 350;
  return { slotWidth: 1, bridgeWidth: 2.5, bridgeEvery: 20 * k, minSlot: 8 * k, minWeb: 2, dotEvery: 4 * k, dotRadius: 0.5 };
}

export interface NeckTemplate {
  outline: string;
  slots: string[];
  dots: string[];
  eye: string;
}

// a stretch of one spiral arc, counterclockwise from `from` to `to`, at path lengths s0 to s1
type Piece = { arc: Arc; from: number; to: number; s0: number; s1: number };

function pieces(arcs: { arc: Arc; from: number; to: number }[]): Piece[] {
  let s = 0;
  return arcs.filter(a => a.to - a.from > 1e-9).map(a => {
    let s0 = s;
    s += a.arc.r * (a.to - a.from);
    return { ...a, s0, s1: s };
  });
}

const pieceAt = (run: Piece[], s: number): Piece => run.find(pc => s <= pc.s1 + 1e-9) ?? run.at(-1)!;

// the point at path length s, `offset` in from the curve toward the arc's centre
const pointAt = (run: Piece[], s: number, offset = 0): Pt => {
  let pc = pieceAt(run, s);
  return pointOnCircle({ ...pc.arc, r: pc.arc.r - offset }, pc.from + (s - pc.s0) / pc.arc.r);
};

// a wall along the run between path lengths a and b at `offset` in from each arc, as arc commands
// to carry a path on, forward or back
function wall(run: Piece[], a: number, b: number, offset: number, forward: boolean): string {
  let within = run.filter(pc => pc.s1 > a + 1e-9 && pc.s0 < b - 1e-9);
  let ordered = forward ? within : [...within].reverse();
  return ordered.map(pc => {
    let r = pc.arc.r - offset;
    let from = pc.from + (Math.max(a, pc.s0) - pc.s0) / pc.arc.r;
    let to = pc.from + (Math.min(b, pc.s1) - pc.s0) / pc.arc.r;
    let end = pointOnCircle({ ...pc.arc, r }, forward ? to : from);
    let large = to - from > TURN.half ? 1 : 0;
    return `A ${r},${r} 0 ${large},${forward ? 1 : 0} ${end.x},${end.y}`;
  }).join(' ');
}

// the spiral from the eye out to where the front's F1 meets it; from there out it's the outline's
function interiorSpiral(s: ScrollSolve): { interior: Piece[]; whole: Piece[]; crossing: { index: number; angle: number } } {
  let arcs = [...s.spiral!].reverse();
  let hit = pointOnCircle(s.F1!, s.F1!.start);
  let on = (a: Arc) => Math.abs(dist(a, hit) - a.r) < 1e-3 && angleWithinSweep(angleFromCenter(a, hit), a.start, a.end);
  let index = arcs.length - 1;
  for (let i = arcs.length - 1; i >= 0; i--) if (on(arcs[i])) { index = i; break; }
  let angle = arcs[index].start + normalizeRadians(angleFromCenter(arcs[index], hit) - arcs[index].start);
  return {
    interior: pieces([...arcs.slice(0, index).map(arc => ({ arc, from: arc.start, to: arc.end })), { arc: arcs[index], from: arcs[index].start, to: angle }]),
    whole: pieces(arcs.map(arc => ({ arc, from: arc.start, to: arc.end }))),
    crossing: { index, angle },
  };
}

// the outline, in the scroll's frame, as the pieces either side of the spiral: the front up from the
// nut to F1's crossing, and the back from where the spiral leaves S0 round to the nape's foot on the
// neck's back
function scrollOutline(p: ViolinFamilyParams, s: ScrollSolve, crossing: { index: number; angle: number }): string[] {
  let arcs = [...s.spiral!].reverse();
  let arc = (a: Arc) => arcPathData(a, a.r, a.start, a.end);
  let backward = (a: Arc) => {
    let from = pointOnCircle(a, a.end);
    let to = pointOnCircle(a, a.start);
    let large = normalizeRadians(a.end - a.start) > TURN.half ? 1 : 0;
    return `M ${from.x},${from.y} A ${a.r},${a.r} 0 ${large},0 ${to.x},${to.y}`;
  };
  let at = pointOnCircle;
  let [S0, S1, S2, S3, nape, F0, F1] = [s.S0!, s.S1!, s.S2!, s.S3!, s.nape!, s.F0!, s.F1!];
  let nutTop = new Pt(0, p.neck!.nutHeight);
  let flatTop = at(F0, F0.start);
  let outer = arcs[crossing.index];
  return [
    pathFromLine(new Pt(0, 0), nutTop),
    pathFromLine(nutTop, flatTop),
    arc(F0),
    pathFromLine(at(F0, F0.end), at(F1, F1.end)),
    backward(F1),
    ...(outer.end - crossing.angle > 1e-9 ? [arcPathData(outer, outer.r, crossing.angle, outer.end)] : []),
    ...arcs.slice(crossing.index + 1).map(arc),
    arc(S0), arc(S1), arc(S2),
    pathFromLine(at(S2, S2.end), at(S3, S3.end)),
    backward(S3),
    pathFromLine(at(S3, S3.start), at(nape, nape.end)),
    backward(nape),
  ];
}

// the neck's own edge in the side elevation: the foot and the fingerboard plane up to the nut, and
// the back down from where the nape meets it over the heel, closed along the back's face
function neckOutline(p: ViolinFamilyParams, n: NeckSolve, backTop: Pt): string[] {
  let floor = new Pt(0, calcMortiseFloorY(p));
  let segments = [pathFromLine(floor, n.bottomFront!), pathFromLine(n.bottomFront!, n.root!), pathFromLine(n.root!, n.neckTop!)];
  let end: Pt;
  if (n.heel) {
    segments.push(pathFromLine(backTop, pointOnCircle(n.heel, n.heel.start)), pathFromArc(n.heel));
    if (n.heelFace) segments.push(pathFromLine(...n.heelFace));
    end = n.heelFace ? n.heelFace[1] : pointOnCircle(n.heel, n.heel.end);
  } else {
    segments.push(pathFromLine(backTop, n.backRoot!));
    end = n.backRoot!;
  }
  segments.push(pathFromLine(end, floor));
  return segments;
}

export function defineNeckTemplate(p: ViolinFamilyParams, n: NeckSolve, s: ScrollSolve, spec: NeckTemplateSpec = defaultNeckTemplateSpec(p)): NeckTemplate {
  let m: Matrix2D = calcScrollOnNeck(p, n);
  let { interior, whole, crossing } = interiorSpiral(s);
  let edge = scrollOutline(p, s, crossing);
  let backTop = applyMatrix(m, pointOnCircle(s.nape!, s.nape!.start));
  let outline = unifyConnectedSvgPaths([...edge.map(d => transformPath(d, m)), ...neckOutline(p, n, backTop)]);

  // what else a slot could break through to: the next turn of the spiral, or the outline's other
  // pieces. A point's own stretch of the spiral is left out, half a turn either way
  let others = edge.flatMap(d => samplePathToPolyline(d, 1, true));
  let turns = whole.flatMap(pc => {
    let count = Math.max(1, Math.ceil(pc.s1 - pc.s0));
    return Array.from({ length: count + 1 }, (_, i) => {
      let at = pc.s0 + (pc.s1 - pc.s0) * i / count;
      return { s: at, r: pc.arc.r, pt: pointOnCircle(pc.arc, pc.from + (at - pc.s0) / pc.arc.r) };
    });
  });
  // the web a slot here leaves, measured from whichever of its two walls comes nearer: the slot
  // cuts inward, so the next turn out keeps the whole gap off the true wall and only the turn
  // within loses the slot's width
  let web = (at: number): number => {
    let r = pieceAt(interior, at).arc.r;
    let walls = [pointAt(interior, at), pointAt(interior, at, spec.slotWidth)];
    let near = (o: Pt) => Math.min(...walls.map(w => dist(o, w)));
    let nearTurn = Math.min(...turns.filter(t => Math.abs(t.s - at) > r * TURN.half).map(t => near(t.pt)));
    let nearEdge = Math.min(...others.map(near));
    return Math.min(nearTurn, nearEdge);
  };

  // a bridge at each end of the stencil, then the run classed millimetre by millimetre: slot where
  // the web holds, dots where it won't
  let length = interior.at(-1)?.s1 ?? 0;
  let ok = (at: number) => pieceAt(interior, at).arc.r - spec.slotWidth > 0.1 && web(at) >= spec.minWeb - 1e-6;
  let runs: { ok: boolean; a: number; b: number }[] = [];
  let step = 1;
  for (let at = spec.bridgeWidth; at < length - spec.bridgeWidth; at += step) {
    let b = Math.min(at + step, length - spec.bridgeWidth);
    let kind = ok(at + (b - at) / 2);
    let last = runs.at(-1);
    if (last && last.ok === kind) last.b = b;
    else runs.push({ ok: kind, a: at, b });
  }

  let junctions = interior.slice(1).map(pc => pc.s0);
  let slotSpans: [number, number][] = [];
  let dotSpans: [number, number][] = [];
  // a short stretch that fails at either end of the stencil isn't pricked: there the curve runs on
  // into the eye, or into the outline where the front crosses it
  let atEnd = (run: { a: number; b: number }) => run.a <= spec.bridgeWidth + 1e-9 || run.b >= length - spec.bridgeWidth - 1e-9;
  for (let run of runs) {
    if (!run.ok || run.b - run.a < spec.minSlot) {
      if (!(atEnd(run) && run.b - run.a < spec.minSlot)) dotSpans.push([run.a, run.b]);
      continue;
    }
    // split at the junctions that leave a slot's worth either side, and then as often as the
    // bridge spacing asks, bridges straddling each split
    let cuts: number[] = [];
    for (let j of junctions) {
      if (j - run.a >= spec.minSlot && run.b - j >= spec.minSlot && j - (cuts.at(-1) ?? run.a) >= spec.minSlot) cuts.push(j);
    }
    let bounds = [run.a, ...cuts, run.b];
    for (let i = 0; i + 1 < bounds.length; i++) {
      let count = Math.max(1, Math.ceil((bounds[i + 1] - bounds[i]) / spec.bridgeEvery));
      for (let k = 0; k < count; k++) {
        let a = bounds[i] + (bounds[i + 1] - bounds[i]) * k / count;
        let b = bounds[i] + (bounds[i + 1] - bounds[i]) * (k + 1) / count;
        slotSpans.push([a === run.a ? a : a + spec.bridgeWidth / 2, b === run.b ? b : b - spec.bridgeWidth / 2]);
      }
    }
  }

  // the true wall forward along the curve, square across, and the inner wall back
  let slot = ([a, b]: [number, number]): string => {
    let start = pointAt(interior, a);
    let across = pointAt(interior, b, spec.slotWidth);
    return `M ${start.x},${start.y} ${wall(interior, a, b, 0, true)} L ${across.x},${across.y} ${wall(interior, a, b, spec.slotWidth, false)} Z`;
  };
  let dots = dotSpans.flatMap(([a, b]) => {
    let count = Math.max(1, Math.floor((b - a) / spec.dotEvery));
    return Array.from({ length: count }, (_, i) => pointAt(interior, a + (b - a) * (i + 0.5) / count));
  });

  let place = (d: string) => transformPath(d, m);
  return {
    outline,
    slots: slotSpans.map(span => place(slot(span))),
    dots: dots.map(pt => place(pathFromCircle({ ...pt, r: spec.dotRadius }))),
    eye: place(pathFromCircle({ x: s.eye!.x, y: s.eye!.y, r: spec.dotRadius })),
  };
}

// every cut of the template as one path, for a sheet
export function neckTemplatePath(t: NeckTemplate): string {
  return combinePathStrings([t.outline, ...t.slots, ...t.dots, t.eye]);
}

// a plate's height as one function of x and y, a station's row kept while the y holds: its readers
// walk a row at a time
function plateZAt(surface: PlateSurface): (x: number, y: number) => number | null {
  let rowY: number | null = null;
  let row: SurfaceRow | null = null;
  return (x, y) => {
    if (!row || y !== rowY) { rowY = y; row = rowAt(surface, y); }
    return surfaceZAt(surface, x, y, row);
  };
}

// the string setup with its board and scoop standing, or null
function solvedFingerboard(p: ViolinFamilyParams): StringSetupSolve | null {
  let s = p.stringSetup && p.neck ? solveStringSetup(p) : null;
  if (!s?.fingerboardEnd || s.failures.some(f => f.unsolved.includes('fingerboard')) || solveScoop(p, s).failures.length) return null;
  return s;
}

// how deep a position mark's pocket is cut below the surface at its centre, a flat floor for the
// inlay, and how finely its rim is drawn
const MARK_POCKET_DEPTH = 2;
const MARK_RIM_SEGMENTS = 48;

// the fingerboard as a solid for the CNC, in its own frame: the gluing face flat on z = 0, the nut
// end on y = 0 and the board running up +y, which puts the bass edge at +x in a right-handed frame,
// the mirror of the front view's. The top is the conical crown
// standing on the chord between the two scooped edges at each station, that station's radius. The
// outline is sampled a grid step apart all round so the end walls follow the crown and the long
// walls the scoop. Each position mark is a round, flat-floored pocket sunk from the surface; one
// over the edge notches the wall. Null while the board or the scoop doesn't solve. Not offered in
// the panel yet; kept for when the fingerboard joins the CNC exports
export function fingerboardStl(p: ViolinFamilyParams, gridMm = 0.5, marks: PositionMarkSolve[] = []): ArrayBuffer | null {
  let s = solvedFingerboard(p);
  if (!s) return null;
  let neckTop = s.neck.neckTop!, end = s.fingerboardEnd!;
  let length = dist(neckTop, end);
  let worldY = (d: number) => pointAtDistanceToward(neckTop, end, d).y;
  let halfAt = (d: number) => neckHalfWidthAt(p, s.neck, worldY(d));
  let topZ = (x: number, d: number) => fingerboardSurfaceZAt(p, s, -x, d);
  let onBoard = (d: number) => Math.max(0, Math.min(length, d));
  let cuts: HeightFieldCut[] = marks.flatMap(m => m.dots.map(dot => {
    let x = -dot.x, d = dist(neckTop, m.station);
    let rim = Array.from({ length: MARK_RIM_SEGMENTS }, (_, k): [number, number] => {
      let a = k * TURN.full / MARK_RIM_SEGMENTS;
      return [x + dot.r * Math.cos(a), d + dot.r * Math.sin(a)];
    });
    return { outline: rim, floorZ: Math.max(0, topZ(x, d) - MARK_POCKET_DEPTH) };
  }));
  let outline: [number, number][] = [];
  let walk = (from: [number, number], to: [number, number]) => {
    let steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / gridMm));
    for (let i = 0; i < steps; i++) outline.push([from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]);
  };
  let topHalf = halfAt(0), endHalf = halfAt(length);
  let corners: [number, number][] = [[-topHalf, 0], [topHalf, 0], [endHalf, length], [-endHalf, length]];
  for (let k = 0; k < 4; k++) walk(corners[k], corners[(k + 1) % 4]);
  let widest = Math.max(topHalf, endHalf);
  return buildHeightFieldStl((x, y) => (y < 0 || y > length || Math.abs(x) > halfAt(y)) ? null : topZ(x, y), {
    xMin: -widest - 1, xMax: widest + 1, yMin: -1, yMax: length + 1, gridMm, baseZ: 0,
    outline,
    outlineTopZ: (x, y) => topZ(x, onBoard(y)),
    cuts,
  });
}

// a plate as a solid for the CNC: the carved surface over a flat base the plate's thickness down,
// walled at the plate's own outline rather than the grid's staircase. The grid reaches the
// outline's own bounds, so the back's button, past the body's end, is solid: flat land there, so
// the edge thickness
export function plateStl(p: ViolinFamilyParams, surface: PlateSurface, plate: Plate, gridMm = 0.5): ArrayBuffer {
  let thickness = p.arching![plate].thickness;
  let xMax = p.body.width / 2 + p.body.overhang + p.body.rib + 2;
  let yMax = Math.max(p.body.height, ...surface.outline.map(pt => pt.y)) + 1;
  let zAt = plateZAt(surface);
  return buildHeightFieldStl((x, y) => { let z = zAt(x, y); return z === null ? null : thickness + z; }, {
    xMin: -xMax, xMax, yMin: -1, yMax, gridMm, baseZ: 0,
    outline: surface.outline.map(pt => [pt.x, pt.y] as [number, number]),
    outlineTopZ: thickness,
  });
}
