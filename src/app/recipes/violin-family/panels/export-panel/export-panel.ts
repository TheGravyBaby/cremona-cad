import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EXPORT_DESCRIPTIONS } from '../../../../docs/export-descriptions';
import { angleFromCenter, angleWithinSweep, dist, normalizeRadians, pointAtDistanceToward, pointOnCircle, TURN } from '../../../../helpers/math/simpleGeometry';
import {
  applyMatrix, arcPathData, combinePathStrings, Matrix2D, pathFromArc, pathFromCircle, pathFromLine, pathFromPolygon, pathFromPolyline, pathFromRect,
  pathsBounds, rotatePath180, samplePathToPolyline, transformPath, translatePath,
} from '../../../../helpers/math/pathMath';
import { unifyConnectedSvgPaths } from '../../../../helpers/math/pathVibes';
import { developOverSurface } from '../../../../helpers/math/vibeMath';
import {
  buildMirroredSvg, buildPackedSvg, downloadFullPlanPdf, downloadSvgAsPdf, downloadSvgFile, paginatePieces, paperFor, PdfPage, PieceGroup,
  SvgPathExport, SvgTextExport,
} from '../../../../helpers/fileExporter';
import { downloadDxfFile } from '../../../../helpers/dxfExporter';
import { buildHeightFieldStl, downloadStlFile, HeightFieldCut } from '../../../../helpers/stlExporter';
import { renderPath, renderText } from '../../../../helpers/renderFuncs';
import { safeRun } from '../../../../helpers/validators';
import { Arc, Circle, Pt, Rectangle } from '../../../../models/types';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  NeckSolve, Plate, PlateSurface, RenderLayer, ScrollSolve, StringSetupSolve, SurfaceRow, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey,
} from '../../violin-family-types';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { purflingPath, ribArcs, solveOuterContour } from '../outer-contour-panel/outer-contour-panel';
import { fholePath, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import { buildArchPathFor, solveLongArching } from '../long-arching-panel/long-arching-panel';
import { bodyLandmarks, rowAt, sectionRuns, solveCrossArching, STATION_MERGE_EPS_MM, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { mortiseFloorY, neckHalfWidthAt, scrollOnNeck, solveNeck } from '../neck-panel/neck-panel';
import { fingerboardRadiusAt, fingerboardScoopAt, solveStringSetup } from '../string-setup-panel/string-setup-panel';
import { defineSideScrollPath } from '../scroll-panel/scroll-panel';
import { scrollBackStrip, scrollBackViewStrokes, scrollCompassWalk, scrollFrontViewStrokes, solveScrollWidths } from '../scroll-widths-panel/scroll-widths-panel';
import { blockLayout, MOULD_EXPORT_STEP, solveMould } from '../mould-panel/mould-panel';

// The export panel: every sheet the drawing leaves the app on. Each is built once, by `exportSheet`,
// from the earlier panels' solvers, and the preview, the SVG, the PDF and the DXF are all written
// from that one sheet. Nothing is typed here, and nothing is written back to the params. Panel, then
// the sheets, then what exists for the sheets alone: the arch templates, the neck template, the
// plate solid and the fingerboard solid.

type ScrollExportType = 'neckTemplate' | 'scrollSide' | 'scrollFrontView' | 'scrollBackView' | 'scrollBack' | 'scrollCompass';
export type ExportType = 'innerContour' | 'topPlate' | 'backPlate' | 'mould' | 'blocks' | 'crossArchTemplates' | 'longArchTemplates' | 'fholeTemplate' | 'fholeTemplateNoEyes' | 'fholeTemplateArched' | ScrollExportType;
export type ExportReady = ExportType | 'stlTop' | 'stlBack' | 'stlFingerboard';

// the sheet's title on a PDF page, one at a time or in the full plan
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
// the full plan's pages past the plan sheets, in order: a group shares a page with the one before it
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
export class ExportPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  // the previews draw in the trace grey alone, so any palette serves
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly describe = (id: string): string => EXPORT_DESCRIPTIONS[id] ?? '';
  protected readonly groups = EXPORT_GROUPS;
  protected readonly templateBundle = TEMPLATE_BUNDLE;

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input() fileName = '';
  @Input() description = '';
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() saveRecipe = new EventEmitter<void>();

  // what each sheet can be built from, refreshed before every preview and download: a sheet is
  // offered once the panels it's drawn from have been reached, so a blank instrument skipped
  // straight here offers its inner contour alone
  ready = new Set<ExportReady>();
  // the sheet on the canvas: the top plate until one is picked, or the first sheet there is
  preview: ExportType = 'topPlate';

  ngOnInit(): void {
    this.draw();
  }

  // nothing is edited here, so an edit settling has nothing to say
  report(): void {}

  show(type: ExportType): void {
    this.preview = type;
    this.draw();
  }

  draw(): void {
    safeRun(() => {
      this.ready = exportReady(this.params);
      if (!this.ready.has(this.preview)) this.preview = EXPORT_TYPES.find(type => this.ready.has(type)) ?? this.preview;
      let sheet = this.ready.has(this.preview) ? exportSheet(this.params, this.preview) : null;
      this.drawn.emit(sheet ? renderSheet(sheet, this.pal) : []);
    });
  }

  readyCount(types: ReadonlyArray<{ type: ExportReady } | ExportReady>): number {
    return types.filter(t => this.ready.has(typeof t === 'string' ? t : t.type)).length;
  }

  private baseName(): string {
    return this.fileName?.trim() || 'violin-family';
  }

  download(type: ExportType, format: 'svg' | 'pdf' | 'dxf'): void {
    this.ready = exportReady(this.params);
    let sheet = this.ready.has(type) ? exportSheet(this.params, type) : null;
    if (!sheet) return;
    let name = `${this.baseName()}-${type}.${format}`;
    let { width, height } = sheetSize(this.params, type, sheet);
    if (format === 'svg') downloadSvgFile(name, buildMirroredSvg(width, height, sheet.paths, sheet.texts));
    else if (format === 'pdf') downloadSvgAsPdf(name, width, height, sheet.paths, { fileName: this.baseName(), description: this.description ?? '', sheetLabel: SHEET_LABELS[type] }, sheet.texts);
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

  downloadFingerboardStl(): void {
    let solid = fingerboardStl(this.params);
    if (solid) downloadStlFile(`${this.baseName()}-fingerboard.stl`, solid);
  }

  downloadFullPlan(): void {
    this.ready = exportReady(this.params);
    let p = this.params;
    let baseName = this.baseName();
    let description = this.description ?? '';
    let plans: PdfPage[] = [];
    for (let type of ['topPlate', 'backPlate', 'innerContour', 'mould'] as const) {
      let sheet = this.ready.has(type) ? exportSheet(p, type) : null;
      if (sheet) plans.push({ label: SHEET_LABELS[type], ...sheetSize(p, type, sheet), paths: sheet.paths, texts: sheet.texts });
    }
    // the rest in their own frames, each sheet whole, filling pages of the one paper every page prints on
    let groups: PieceGroup[] = PDF_GROUPS
      .map(({ label, types }) => ({
        label,
        pieces: types.filter(type => this.ready.has(type)).map(type => exportSheet(p, type)).filter((sheet): sheet is ExportSheet => !!sheet),
      }))
      .filter(group => group.pieces.length);
    let paper = paperFor([...plans, ...groups.flatMap(g => g.pieces.map(piece => pathsBounds(piece.paths.map(path => path.d))))]);
    let pages = [...plans, ...paginatePieces(groups, paper)].map(page => ({ ...page, fileName: baseName, description }));
    if (pages.length) downloadFullPlanPdf(`${baseName}-full-plan.pdf`, pages, paper);
  }
}

// a sheet's paths and labels, in the frame its own download draws it in. The laser pass only matters
// to the SVG; the PDF draws every path at one weight and the DXF carries none
export interface ExportSheet {
  paths: SvgPathExport[];
  texts: SvgTextExport[];
}

// a sheet on the canvas as the file will have it: outlines at trace weight, etched marks at guide
export const renderSheet = (sheet: ExportSheet, pal: PanelPalette): RenderLayer[] => [
  ...sheet.paths.map(path => renderPath(path.d, pal.neutral, path.laser === 'etch' ? STROKE_WEIGHT.guide : STROKE_WEIGHT.trace)),
  ...sheet.texts.map(t => renderText(new Pt(t.x, t.y), t.text, pal.neutral, t.fontSize ?? TEMPLATE_LABEL_SIZE, t.rotationDeg ?? 0)),
];

// which sheets the stages reached so far can build. Each check is the cheapest that says so; a sheet
// that still can't be built when asked for writes nothing
export function exportReady(p: ViolinFamilyParams): Set<ExportReady> {
  let ready = new Set<ExportReady>();
  if (!ribOutline(p)) return ready;
  ready.add('innerContour');
  let o = solveOuterContour(p);
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
      return inner ? sheet([black(inner)]) : null;
    }
    case 'topPlate':
    case 'backPlate': {
      // outline, holes and purfling. The channel is not drawn here in any form: in plan it is only
      // two rims with nothing between them to say how deep, and the arch templates carry that whole
      let o = solveOuterContour(p);
      let plate = type === 'topPlate' ? o?.top : o?.back;
      if (!o || !plate) return null;
      let holes = type === 'topPlate' ? fholes(p) : [];
      return sheet([black(plate), ...holes.map(d => cutFirst(d)), ...[o.purfling, o.outerPurfling].map(d => d && etched(d))]);
    }
    case 'mould': {
      let m = solveMould(p, MOULD_EXPORT_STEP);
      return m?.outline ? sheet([black(combinePathStrings([...m.clampBox, m.outline]))]) : null;
    }
    case 'blocks': {
      let m = solveMould(p);
      if (!m?.blocks) return null;
      let blocks = blockLayout(m);
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
      // the neck's sides from the nut up to where they meet it. The back is drawn alone, without
      // the pegbox's front the panel shows standing out past it
      let scroll = solvedScroll(p);
      if (!scroll?.widths) return null;
      let place = (x: number, y: number) => new Pt(x, y);
      let strokes = type === 'scrollFrontView' ? scrollFrontViewStrokes(p, scroll.s, place, 0) : scrollBackViewStrokes(p, scroll.s, place, 0, { front: false });
      let d = combinePathStrings(Object.values(strokes).flat().map(s => 'line' in s ? pathFromLine(...s.line) : 'polygon' in s ? pathFromPolygon(s.polygon) : s.d));
      return sheet([black(translatePath(d, 0, -pathsBounds([d]).minY))]);
    }
    case 'scrollBack': {
      // the back unrolled into a strip, on its own sheet from the duck tail up
      let scroll = solvedScroll(p);
      return scroll?.widths ? sheet([black(pathFromPolygon(scrollBackStrip(p, scroll.s).outline))]) : null;
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
  let button = p.outerContour?.button.height ?? 0;
  return { width: Math.max(p.body.width, b.width), height: Math.max(p.body.height + 2 * button, b.maxY) };
}

// the rib outline as one closed path, or null until every arc of it has solved
function ribOutline(p: ViolinFamilyParams): string | null {
  if (!p.bouts || !p.corners) return null;
  let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
  return rib && purflingPath(p, rib, 0);
}

// the two holes cut into the top plate, each its own path so either can be picked alone; empty until the contours close
function fholes(p: ViolinFamilyParams): string[] {
  let s = p.fHoleContours ? solveFholeContours(p) : null;
  return s?.path ? [s.path, fholePath(p, s, true)!] : [];
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
  let raw = s?.path ? fholePath(p, s, false, renderEyes) : null;
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
  let walk = scrollCompassWalk(p, scroll.s);
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

// where a plate gets cross-arch templates: the five body landmarks, which a section is sighted
// against whether or not the maker set a station there, plus any station they did set that isn't
// already on one, which would be the same template cut twice
function templateStations(p: ViolinFamilyParams, plate: Plate): { y: number; code: string }[] {
  let landmarks = bodyLandmarks(p).map(m => ({ y: m.y, code: m.code as string }));
  let authored = p.arching![plate].cross.stations
    .map(st => Math.round(st.y))
    .filter(y => Number.isFinite(y) && !landmarks.some(m => Math.abs(m.y - y) <= STATION_MERGE_EPS_MM))
    .map(y => ({ y, code: '' }));
  return [...landmarks, ...authored].sort((a, b) => a.y - b.y);
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
      let arch = sectionRuns(surface, y).find(run => run.part === 'arch');
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
    let arch = parsePolyline(buildArchPathFor(la.lowered, la.span, la.yStart, 0, sign, la.farZ));
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
  let floor = new Pt(0, mortiseFloorY(p));
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
  let m: Matrix2D = scrollOnNeck(p, n);
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
  if (!s?.fingerboardEnd || s.failures.some(f => f.unsolved.includes('fingerboard') || f.unsolved.includes('scoop'))) return null;
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
// over the edge notches the wall. Null while the board or the scoop doesn't solve
export function fingerboardStl(p: ViolinFamilyParams, gridMm = 0.5): ArrayBuffer | null {
  let s = solvedFingerboard(p);
  if (!s) return null;
  let ss = p.stringSetup!;
  let neckTop = s.neck.neckTop!, end = s.fingerboardEnd!;
  let length = dist(neckTop, end);
  let worldY = (d: number) => pointAtDistanceToward(neckTop, end, d).y;
  let halfAt = (d: number) => neckHalfWidthAt(p, s.neck, worldY(d));
  let topZ = (x: number, d: number) => {
    let y = worldY(d), half = halfAt(d);
    let side = Math.max(-1, Math.min(1, -x / half));
    let edge = ss.fingerboardThickness - fingerboardScoopAt(p, s, y, side);
    let r = fingerboardRadiusAt(p, s, y);
    return edge + Math.sqrt(Math.max(0, r * r - x * x)) - Math.sqrt(Math.max(0, r * r - half * half));
  };
  let onBoard = (d: number) => Math.max(0, Math.min(length, d));
  let cuts: HeightFieldCut[] = s.marks.flatMap(m => m.dots.map(dot => {
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
