import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pointOnCircle, TURN } from '../../../helpers/math/simpleGeometry';
import { combinePathStrings, pathFromCircle, pathFromLine, pathFromPolygon, pathFromPolyline, pathFromRect, pathsBounds, splitPathStrings, translatePath } from '../../../helpers/math/pathMath';
import { buildMirroredSvg, buildPackedSvg, downloadFullPlanPdf, downloadSvgAsPdf, downloadSvgFile, paginatePieces, paperFor, PdfPage, PieceGroup, SvgPathExport, SvgPiece, SvgTextExport } from '../../../helpers/fileExporter';
import { downloadDxfFile, DxfText } from '../../../helpers/dxfExporter';
import { downloadStlFile } from '../../../helpers/stlExporter';
import { renderPath, renderText } from '../../../helpers/renderFuncs';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { calculateCornerBlocks, calculateMould, calculateOuterArcs, ensureFrontProfilePaths, FrontProfileSolve, getPath, getPathOrNull, hasOuterTrace, solveNeckForProfile } from '../../calculation/outline/ceruti-calcs';
import { defineNeckTemplate, NeckTemplate, neckTemplatePath } from '../../calculation/neck/ceruti-neck-template';
import { calculateScroll, calculateScrollWidths, scrollBackStrip, scrollCompassWalk } from '../../calculation/neck/ceruti-scroll';
import { scrollBackViewStrokes, scrollFrontViewStrokes } from '../../calculation/neck/ceruti-scroll-views';
import { Circle, Pt, Rectangle } from '../../../models/types';
import { defineOneFholePath, defineSideScrollPath } from '../../calculation/outline/ceruti-paths';
import { defaultCrossArchParams, defaultFlutingParams } from '../../calculation/arching/ceruti-arch-geometry';
import { buildPlateSurfaceModel, buildPlateStl, calculateCrossArchTemplates, calculateLongArchTemplates, TemplateShape } from '../../calculation/arching/ceruti-surface';
import { EnricoCerutiParams, PathEntry, PathKey } from '../../ceruti-types';
import { EXPORT_DESCRIPTIONS } from '../../../docs/export-descriptions';
import { ThemeService } from '../../../theme/theme.service';

type ScrollExportType = 'neckTemplate' | 'scrollSide' | 'scrollFrontView' | 'scrollBackView' | 'scrollBack' | 'scrollCompass';
type ExportType = 'innerTrace' | 'outerTrace' | 'back' | 'mould' | 'blocks' | 'crossArchTemplates' | 'longArchTemplates' | 'fholeTemplate' | 'fholeTemplateNoEyes' | ScrollExportType;

// the sheet's title on a PDF page, one at a time or in the full plan
const SHEET_LABELS: Record<string, string> = {
  innerTrace: 'Inner Contour',
  outerTrace: 'Outer Contour',
  mould: 'Mould Path',
  fholeTemplate: 'F-Hole Template',
  fholeTemplateNoEyes: 'F-Hole Template (No Eyes)',
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
const EXPORT_TYPES: readonly ExportType[] = ['outerTrace', 'back', 'innerTrace', 'longArchTemplates', 'crossArchTemplates', 'fholeTemplate', 'fholeTemplateNoEyes', ...SCROLL_EXPORTS, 'mould', 'blocks'];
// drawn on the plan's own sheet, the body's width by its height, rather than sized to themselves
const PLAN_SHEETS: readonly ExportType[] = ['innerTrace', 'outerTrace', 'back', 'mould', 'blocks'];
// the full plan's pages past the plan sheets, in order: a group shares a page with the one before it
// when the two fit together
const PDF_GROUPS: ReadonlyArray<{ label: string; types: readonly ExportType[] }> = [
  { label: 'Blocks', types: ['blocks'] },
  { label: 'F-Hole Templates', types: ['fholeTemplate', 'fholeTemplateNoEyes'] },
  { label: 'Arch Templates', types: ['longArchTemplates', 'crossArchTemplates'] },
  { label: 'Neck & Scroll', types: SCROLL_EXPORTS },
];
// what the templates SVG gathers: the pieces a maker cuts from card or ply and works to
const TEMPLATE_BUNDLE: readonly ExportType[] = ['neckTemplate', 'scrollSide', 'scrollFrontView', 'scrollBackView', 'scrollBack', 'scrollCompass', 'longArchTemplates', 'crossArchTemplates', 'blocks'];

/** Templates are laid out in their own coordinate frame (not the violin's plan-view box), so their
 *  export sheet is sized from the actual combined geometry rather than the shared plan dimensions. */
const TEMPLATE_SHEET_PAD = 5;
/** Label text size (mm), consistent across the canvas preview, SVG/PDF, and DXF exports. */
const TEMPLATE_LABEL_SIZE = 5;
// the compass walk is a box to cut, its marks etched: every circle clears the box by this. Each
// centre is a star of three lines through it, arms this long, so the beam crosses the point three
// times and it reads apart from where a circle crosses the spine; its own path, to etch deeper
const COMPASS_BOX_MARGIN = 5;
const COMPASS_STAR = 1;

const black = (d: string, strokeWidth = '.5'): SvgPathExport => ({ d, stroke: 'black', fill: 'none', strokeWidth });

@Component({
  selector: 'app-ceruti-export-panel',
  imports: [FormsModule],
  templateUrl: './export-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ExportPanel implements OnInit {
  protected readonly describe = (id: string): string => EXPORT_DESCRIPTIONS[id] ?? '';

  @Input({ required: true }) params!: EnricoCerutiParams;
  // the previews draw in the trace grey alone, so any palette serves
  private readonly pal = ThemeService.getPalette('classicCremona');
  @Input({ required: true }) paths!: PathEntry[];
  @Input() fileName = '';
  @Input() description = '';

  /** Forwarded straight through to the canvas by the parent — this panel composes its own preview renders. */
  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();

  private getPath(key: PathKey): string {
    return getPath(this.paths, key);
  }

  private getPathOrNull(key: PathKey): string | null {
    return getPathOrNull(this.paths, key);
  }

  // the neck and scroll template, on its own sheet like the f-hole's, or null until the neck is set
  // against the arch and the scroll solved whole
  private neckTemplate(): NeckTemplate | null {
    const { neck, scroll } = solveNeckForProfile(this.params);
    if (!neck || !scroll) return null;
    const t = defineNeckTemplate(this.params);
    const bounds = pathsBounds([neckTemplatePath(t)]);
    const onSheet = (d: string) => translatePath(d, -(bounds.minX + bounds.maxX) / 2, -bounds.minY);
    return { outline: onSheet(t.outline), slots: t.slots.map(onSheet), dots: t.dots.map(onSheet), eye: onSheet(t.eye) };
  }

  // the scroll's widths need the scroll solved whole, though not the neck set against the body
  private scrollWidthsSolved(): boolean {
    const p = this.params;
    if (!p.scroll || !p.neck || calculateScroll(p).length) return false;
    calculateScrollWidths(p);
    return true;
  }

  // the scroll's back unrolled into a strip, on its own sheet from the duck tail up
  private scrollBack(): string | null {
    return this.scrollWidthsSolved() ? pathFromPolygon(scrollBackStrip(this.params).outline) : null;
  }

  // the compass walk as a box to cut, the spine up its middle with a crosshair and a circle at each
  // station etched in it, the duck tail's at the bottom with room to breathe. The last station is the
  // second turn's bottom, a flat, so its circle is the half hanging under its level, swept from 0 to
  // π the negative way as the crown's is on the widths panel, with the flat drawn across its top as
  // the end of the path. Faint straight edges run
  // through the circles' sides, the back's outline roughly, where the strip has it in full
  private scrollCompass(): { box: string; marks: string; centres: string; edges: string } | null {
    if (!this.scrollWidthsSolved()) return null;
    const walk = scrollCompassWalk(this.params);
    const bottom = Math.max(...walk.stations.filter(st => st.along === 0).map(st => st.half));
    const y = (st: { along: number }) => COMPASS_BOX_MARGIN + bottom + st.along;
    const half = Math.max(...walk.stations.map(st => st.half)) + COMPASS_BOX_MARGIN;
    const last = walk.stations.length - 1;
    const height = Math.max(...walk.stations.map((st, k) => y(st) + (k === last ? 0 : st.half))) + COMPASS_BOX_MARGIN;
    const marks = [pathFromLine(new Pt(0, 0), new Pt(0, height))];
    const centres: string[] = [];
    walk.stations.forEach((st, k) => {
      marks.push(k === last
        ? combinePathStrings([
          pathFromPolyline(Array.from({ length: 33 }, (_, i) => pointOnCircle({ x: 0, y: y(st), r: st.half }, -TURN.half * i / 32))),
          pathFromLine(new Pt(-st.half, y(st)), new Pt(st.half, y(st))),
        ])
        : pathFromCircle(new Circle(0, y(st), st.half)));
      const centre = { x: 0, y: y(st), r: COMPASS_STAR };
      for (const angle of [0, TURN.half / 3, 2 * TURN.half / 3]) {
        centres.push(pathFromLine(pointOnCircle(centre, angle), pointOnCircle(centre, angle + TURN.half)));
      }
    });
    const edges = [1, -1].map(side => pathFromPolyline(walk.stations.map(st => new Pt(side * st.half, y(st)))));
    return {
      box: pathFromRect(new Rectangle(new Pt(-half, 0), new Pt(half, height))),
      marks: combinePathStrings(marks),
      centres: combinePathStrings(centres),
      edges: combinePathStrings(edges),
    };
  }

  // the scroll from the side as its panels draw it, the volute and the pegbox's back and front, on its
  // own sheet
  private scrollSide(): string | null {
    if (!this.scrollWidthsSolved()) return null;
    const d = defineSideScrollPath(this.params);
    const bounds = pathsBounds([d]);
    return translatePath(d, -(bounds.minX + bounds.maxX) / 2, -bounds.minY);
  }

  // the scroll seen from in front or behind, as the widths panel draws it, on its own sheet: the
  // head and the nut, the neck's sides from the nut up to where they meet it. The back is drawn
  // alone, without the pegbox's front the panel shows standing out past it
  private scrollView(type: 'scrollFrontView' | 'scrollBackView'): string | null {
    if (!this.scrollWidthsSolved()) return null;
    const place = (x: number, y: number) => new Pt(x, y);
    const strokes = type === 'scrollFrontView' ? scrollFrontViewStrokes(this.params, place, 0) : scrollBackViewStrokes(this.params, place, 0, { front: false });
    const d = combinePathStrings(Object.values(strokes).flat().map(s => 'line' in s ? pathFromLine(...s.line) : 'polygon' in s ? pathFromPolygon(s.polygon) : s.d));
    return translatePath(d, 0, -pathsBounds([d]).minY);
  }

  // the neck and scroll sheets, each in its own frame, as paths for any of the three formats, or
  // null where the sheet can't be built. The strokes only matter to the SVG; the PDF draws every path at
  // one weight and the DXF carries none
  private scrollSheet(type: ScrollExportType): SvgPathExport[] | null {
    switch (type) {
      case 'neckTemplate': {
        const t = this.neckTemplate();
        return t && [black(t.outline, '.5'), black(combinePathStrings([...t.slots, ...t.dots, t.eye]), '.5')];
      }
      case 'scrollSide': {
        const side = this.scrollSide();
        return side && [black(side)];
      }
      case 'scrollFrontView':
      case 'scrollBackView': {
        const view = this.scrollView(type);
        return view && [black(view, '.5')];
      }
      case 'scrollBack': {
        const strip = this.scrollBack();
        return strip && [black(strip, '.5')];
      }
      case 'scrollCompass': {
        const t = this.scrollCompass();
        return t && [black(t.box, '.5'), black(t.marks, '.25'), black(t.centres, '.5'), black(t.edges, '.1')];
      }
    }
  }

  private archTemplates(type: 'crossArchTemplates' | 'longArchTemplates'): TemplateShape[] {
    return type === 'crossArchTemplates' ? calculateCrossArchTemplates(this.params) : calculateLongArchTemplates(this.params);
  }

  // what each sheet can be built from, refreshed before every preview and download. A sheet is
  // offered once the panels it's drawn from have been reached; nothing here seeds a stage the user
  // hasn't, so a blank instrument skipped straight to Export offers its inner trace alone
  protected ready = new Set<ExportType | 'stl'>();
  protected readonly templateBundle = TEMPLATE_BUNDLE;

  private refresh(): void {
    const solve = ensureFrontProfilePaths(this.params, this.paths, { neck: false });
    this.ready = new Set([...EXPORT_TYPES.filter(type => this.canBuild(type, solve)), ...(this.params.arching ? ['stl' as const] : [])]);
  }

  private canBuild(type: ExportType, solve: FrontProfileSolve): boolean {
    const p = this.params;
    if (solve.failures.length || !this.getPathOrNull('inner')) return false;
    switch (type) {
      case 'innerTrace': return true;
      case 'outerTrace':
      case 'back': return hasOuterTrace(p) && !!this.getPathOrNull('top');
      case 'fholeTemplate':
      case 'fholeTemplateNoEyes': return !!p.fHoles && !!this.getPathOrNull('fHole');
      case 'crossArchTemplates':
      case 'longArchTemplates': return !!p.arching;
      case 'mould':
      case 'blocks': return !!p.blocks?.CU;
      default: return !!this.scrollSheet(type);
    }
  }

  protected readyCount(types: readonly (ExportType | 'stl')[]): number {
    return types.filter(type => this.ready.has(type)).length;
  }

  // a plan-view sheet's height: the body, with room for the button at both ends once there is one
  private planHeight(): number {
    return this.params.height + 2 * (this.params.button?.height ?? 0);
  }

  /**
   * The single-hole cutting template, moved off the plate's real coordinates onto its own sheet.
   * `defineOneFholePath` sits wherever the treble-side hole actually is on the plate (near the
   * corner, so y is in the hundreds of mm) — every sheet frame in this file (`buildMirroredSvg`,
   * `downloadSvgAsPdf`, `templatePage`) assumes its content is centred on x=0 and starts at y=0,
   * same as `calculateCrossArchTemplates`/`calculateLongArchTemplates` already re-centre their own
   * shapes before handing them here. Skipping this left the template page geometrically valid but
   * entirely outside the sheet's viewBox — a blank page, not a thrown error.
   */
  private fholeTemplatePath(renderEyes = true): string {
    const raw = defineOneFholePath(this.params, false, renderEyes);
    const bounds = pathsBounds([raw]);
    return translatePath(raw, -(bounds.minX + bounds.maxX) / 2, -bounds.minY);
  }

  private cornerBlocks(): string[] {
    return calculateCornerBlocks(this.params, getPath(this.paths, 'inner'));
  }

  private toSvgTexts(shapes: TemplateShape[]): SvgTextExport[] {
    return shapes.map(s => ({ text: s.label, x: s.labelPos.x, y: s.labelPos.y, rotationDeg: s.labelRotation, fontSize: TEMPLATE_LABEL_SIZE }));
  }

  private toDxfTexts(shapes: TemplateShape[]): DxfText[] {
    return shapes.map(s => ({ text: s.label, x: s.labelPos.x, y: s.labelPos.y, height: TEMPLATE_LABEL_SIZE, rotationDeg: s.labelRotation }));
  }

  ngOnInit(): void {
    this.refresh();
    if (!this.ready.has(this.lastPreview)) this.lastPreview = 'innerTrace';
    this.previewExport(this.lastPreview);
  }

  /** Whatever is currently on the canvas. Only set once a preview actually draws, so a sheet
   * undo has taken away doesn't become the thing redrawPreview re-fires. */
  private lastPreview: ExportType = 'outerTrace';

  /** Redraws the current preview against the params as they now stand. For undo/redo, which
   * changes the geometry under a preview this panel has no other reason to recompute. */
  public redrawPreview(): void {
    this.previewExport(this.lastPreview);
  }

  previewExport(type: ExportType): void {
    this.refresh();
    if (!this.ready.has(type)) { this.draftChange.emit([]); return; }
    const p = this.params;

    switch (type) {
      case 'innerTrace': {
        this.draftChange.emit([renderPath(this.getPath('inner'), this.pal.neutral, STROKE_WEIGHT.trace)]);
        break;
      }
      case 'outerTrace':
      case 'back': {
        // Outline and purfling. The channel is not drawn here in any form: in
        // plan it is only ever two rims with nothing between them to say how
        // deep or what section, and the arching templates now carry that
        // whole. A rim pair on a contour sheet would be a second, weaker
        // account of geometry that is stated exactly elsewhere.
        const renders: Array<(g: any, ui: any) => void> = [
          renderPath(this.getPath(type === 'back' ? 'back' : 'top'), this.pal.neutral, STROKE_WEIGHT.trace),
        ];
        const purflingPath = this.getPathOrNull('purfling');
        if (purflingPath) renders.push(renderPath(purflingPath, this.pal.neutral, STROKE_WEIGHT.guide));
        const outerPurflingPath = this.getPathOrNull('outerPurfling');
        if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.pal.neutral, STROKE_WEIGHT.guide));
        const fHole = this.getPathOrNull('fHole');
        if (type === 'outerTrace' && fHole) {
          for (const hole of splitPathStrings(fHole)) renders.push(renderPath(hole, this.pal.neutral, STROKE_WEIGHT.trace));
        }
        this.draftChange.emit(renders);
        break;
      }
      case 'fholeTemplate':
      case 'fholeTemplateNoEyes': {
        this.draftChange.emit([renderPath(this.fholeTemplatePath(type === 'fholeTemplate'), this.pal.neutral, STROKE_WEIGHT.trace)]);
        break;
      }
      case 'mould': {
        // Computed directly rather than read from the cache — it's export-only and
        // too expensive (10x denser boolean diff) to keep current on every edit.
        this.draftChange.emit([renderPath(calculateMould(p, true, false), this.pal.neutral, STROKE_WEIGHT.trace)]);
        break;
      }
      case 'blocks': {
        const renders = this.cornerBlocks().map((block: string) => renderPath(block, this.pal.neutral, STROKE_WEIGHT.trace));
        this.draftChange.emit(renders);
        break;
      }
      case 'neckTemplate': {
        const t = this.neckTemplate();
        if (!t) { this.draftChange.emit([]); return; }
        this.draftChange.emit([
          renderPath(t.outline, this.pal.neutral, STROKE_WEIGHT.trace),
          renderPath(combinePathStrings([...t.slots, ...t.dots, t.eye]), this.pal.neutral, STROKE_WEIGHT.trace),
        ]);
        break;
      }
      case 'scrollBack': {
        const strip = this.scrollBack();
        if (!strip) { this.draftChange.emit([]); return; }
        this.draftChange.emit([renderPath(strip, this.pal.neutral, STROKE_WEIGHT.trace)]);
        break;
      }
      case 'scrollSide': {
        const side = this.scrollSide();
        if (!side) { this.draftChange.emit([]); return; }
        this.draftChange.emit([renderPath(side, this.pal.neutral, STROKE_WEIGHT.trace)]);
        break;
      }
      case 'scrollFrontView':
      case 'scrollBackView': {
        const view = this.scrollView(type);
        if (!view) { this.draftChange.emit([]); return; }
        this.draftChange.emit([renderPath(view, this.pal.neutral, STROKE_WEIGHT.trace)]);
        break;
      }
      case 'scrollCompass': {
        const t = this.scrollCompass();
        if (!t) { this.draftChange.emit([]); return; }
        this.draftChange.emit([
          renderPath(t.box, this.pal.neutral, STROKE_WEIGHT.trace),
          renderPath(t.marks, this.pal.neutral, STROKE_WEIGHT.guide),
          renderPath(t.centres, this.pal.neutral, STROKE_WEIGHT.trace),
          renderPath(t.edges, this.pal.neutral, STROKE_WEIGHT.guide, 0.4),
        ]);
        break;
      }
      case 'crossArchTemplates':
      case 'longArchTemplates': {
        const shapes = this.archTemplates(type);
        const renders = shapes.flatMap(s => [
          renderPath(s.path, this.pal.neutral, STROKE_WEIGHT.trace),
          renderText(s.labelPos, s.label, this.pal.neutral, TEMPLATE_LABEL_SIZE, s.labelRotation),
        ]);
        this.draftChange.emit(renders);
        break;
      }
    }
    this.lastPreview = type;
  }

  // a sheet's paths and labels for the SVG, in the frame its own download draws it in
  private svgSheet(type: ExportType): SvgPiece | null {
    switch (type) {
      case 'innerTrace':
        return { paths: [black(this.getPath('inner'))] };
      case 'outerTrace':
      case 'back': {
        const extras = [this.getPathOrNull('purfling'), this.getPathOrNull('outerPurfling'), type === 'outerTrace' ? this.getPathOrNull('fHole') : null];
        return { paths: [this.getPath(type === 'back' ? 'back' : 'top'), ...extras.filter((d): d is string => !!d)].map(d => black(d)) };
      }
      case 'mould':
        return { paths: [black(calculateMould(this.params, true, false))] };
      case 'blocks':
        return { paths: [black(combinePathStrings(this.cornerBlocks()))] };
      case 'fholeTemplate':
      case 'fholeTemplateNoEyes':
        return { paths: [black(this.fholeTemplatePath(type === 'fholeTemplate'))] };
      case 'crossArchTemplates':
      case 'longArchTemplates': {
        const shapes = this.archTemplates(type);
        return { paths: [black(combinePathStrings(shapes.map(s => s.path)))], texts: this.toSvgTexts(shapes) };
      }
      default: {
        const sheet = this.scrollSheet(type);
        return sheet && { paths: sheet };
      }
    }
  }

  downloadExport(type: ExportType): void {
    this.refresh();
    const sheet = this.ready.has(type) && this.svgSheet(type);
    if (!sheet) return;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    let width = this.params.width;
    let height = this.planHeight();
    if (!PLAN_SHEETS.includes(type)) {
      const bounds = pathsBounds(sheet.paths.map(s => s.d));
      width = bounds.width + TEMPLATE_SHEET_PAD;
      height = bounds.height + TEMPLATE_SHEET_PAD;
    }
    downloadSvgFile(`${baseName}-${type}.svg`, buildMirroredSvg(width, height, sheet.paths, sheet.texts));
  }

  // every sheet that can be built, or the templates among them, packed onto one SVG. Each sheet
  // packs whole, laid out as its own download lays it out, so like templates stay together
  downloadBundle(bundle: 'templates' | 'full'): void {
    this.refresh();
    const types = (bundle === 'templates' ? TEMPLATE_BUNDLE : EXPORT_TYPES).filter(type => this.ready.has(type));
    const pieces = types.map(type => this.svgSheet(type)).filter((sheet): sheet is SvgPiece => !!sheet);
    if (!pieces.length) return;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    downloadSvgFile(`${baseName}-${bundle}.svg`, buildPackedSvg(pieces));
  }

  downloadStl(side: 'top' | 'bottom' = 'top'): void {
    const p = this.params;
    const plateLabel = side === 'top' ? 'top' : 'back';
    if (!p.arching) return;
    const plate = p.arching[side];
    plate.fluting ??= defaultFlutingParams(p);
    plate.cross ??= defaultCrossArchParams();
    calculateOuterArcs(p);
    const model = buildPlateSurfaceModel(p, side);
    if (!model) return;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    downloadStlFile(`${baseName}-${plateLabel}-plate.stl`, buildPlateStl(p, model, side));
  }

  downloadDxf(type: ExportType): void {
    this.refresh();
    if (!this.ready.has(type)) return;
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';

    let pathD: string;
    let texts: DxfText[] = [];
    switch (type) {
      case 'innerTrace':
        pathD = this.getPath('inner');
        break;
      case 'outerTrace':
      case 'back': {
        const dxfPaths = [this.getPath(type === 'back' ? 'back' : 'top')];
        const purflingPath = this.getPathOrNull('purfling');
        if (purflingPath) dxfPaths.push(purflingPath);
        const outerPurflingPath = this.getPathOrNull('outerPurfling');
        if (outerPurflingPath) dxfPaths.push(outerPurflingPath);
        const fHole = this.getPathOrNull('fHole');
        if (type === 'outerTrace' && fHole) dxfPaths.push(fHole);
        pathD = combinePathStrings(dxfPaths);
        break;
      }
      case 'mould':
        pathD = calculateMould(p, true, false);
        break;
      case 'blocks':
        pathD = combinePathStrings(this.cornerBlocks());
        break;
      case 'fholeTemplate':
      case 'fholeTemplateNoEyes':
        pathD = this.fholeTemplatePath(type === 'fholeTemplate');
        break;
      case 'neckTemplate':
      case 'scrollSide':
      case 'scrollFrontView':
      case 'scrollBackView':
      case 'scrollBack':
      case 'scrollCompass': {
        const sheet = this.scrollSheet(type);
        if (!sheet) return;
        pathD = combinePathStrings(sheet.map(s => s.d));
        break;
      }
      case 'crossArchTemplates':
      case 'longArchTemplates': {
        const shapes = this.archTemplates(type);
        pathD = combinePathStrings(shapes.map(s => s.path));
        texts = this.toDxfTexts(shapes);
        break;
      }
    }

    downloadDxfFile(`${baseName}-${type}.dxf`, pathD!, texts);
  }

  downloadPdf(type: ExportType): void {
    this.refresh();
    if (!this.ready.has(type)) return;
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const height = this.planHeight();

    let pdfPaths: SvgPathExport[];
    let texts: SvgTextExport[] = [];
    let sheetWidth = p.width;
    let sheetHeight = height;
    switch (type) {
      case 'innerTrace':
        pdfPaths = [{ d: this.getPath('inner'), stroke: 'black', fill: 'none' }];
        break;
      case 'outerTrace':
      case 'back': {
        pdfPaths = [{ d: this.getPath(type === 'back' ? 'back' : 'top'), stroke: 'black', fill: 'none' }];
        const purflingPath = this.getPathOrNull('purfling');
        if (purflingPath) pdfPaths.push({ d: purflingPath, stroke: 'black', fill: 'none' });
        const outerPurflingPath = this.getPathOrNull('outerPurfling');
        if (outerPurflingPath) pdfPaths.push({ d: outerPurflingPath, stroke: 'black', fill: 'none' });
        const fHole = this.getPathOrNull('fHole');
        if (type === 'outerTrace' && fHole) pdfPaths.push({ d: fHole, stroke: 'black', fill: 'none' });
        break;
      }
      case 'mould':
        pdfPaths = [{ d: calculateMould(p, true, false), stroke: 'black', fill: 'none' }];
        break;
      case 'blocks':
        pdfPaths = [{ d: combinePathStrings(this.cornerBlocks()), stroke: 'black', fill: 'none' }];
        break;
      case 'fholeTemplate':
      case 'fholeTemplateNoEyes': {
        const onePath = this.fholeTemplatePath(type === 'fholeTemplate');
        const bounds = pathsBounds([onePath]);
        sheetWidth = bounds.width + TEMPLATE_SHEET_PAD;
        sheetHeight = bounds.height + TEMPLATE_SHEET_PAD;
        pdfPaths = [{ d: onePath, stroke: 'black', fill: 'none' }];
        break;
      }
      case 'neckTemplate':
      case 'scrollSide':
      case 'scrollFrontView':
      case 'scrollBackView':
      case 'scrollBack':
      case 'scrollCompass': {
        const sheet = this.scrollSheet(type);
        if (!sheet) return;
        const bounds = pathsBounds(sheet.map(s => s.d));
        sheetWidth = bounds.width + TEMPLATE_SHEET_PAD;
        sheetHeight = bounds.height + TEMPLATE_SHEET_PAD;
        pdfPaths = sheet;
        break;
      }
      case 'crossArchTemplates':
      case 'longArchTemplates': {
        const shapes = this.archTemplates(type);
        const bounds = pathsBounds(shapes.map(s => s.path));
        sheetWidth = bounds.width + TEMPLATE_SHEET_PAD;
        sheetHeight = bounds.height + TEMPLATE_SHEET_PAD;
        pdfPaths = [{ d: combinePathStrings(shapes.map(s => s.path)), stroke: 'black', fill: 'none' }];
        texts = this.toSvgTexts(shapes);
        break;
      }
    }

    downloadSvgAsPdf(
      `${baseName}-${type}.pdf`,
      sheetWidth,
      sheetHeight,
      pdfPaths!,
      {
        fileName: baseName,
        description: this.description ?? '',
        sheetLabel: SHEET_LABELS[type],
      },
      texts
    );
  }

  downloadFullPlan(): void {
    this.refresh();
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const description = this.description ?? '';
    const inset = p.overhang + p.rib;
    let height = this.planHeight();
    if (p.options.useViolNeck)
      height = pointOnCircle(p.viol.V0!, 0).y + 2 * (p.button?.height ?? 0) + inset;

    const plans: PdfPage[] = [];
    const planPage = (label: string, paths: SvgPathExport[]) => plans.push({ label, width: p.width, height, paths });
    const purfling = [this.getPathOrNull('purfling'), this.getPathOrNull('outerPurfling')].filter((d): d is string => !!d).map(d => black(d));
    const fHole = this.getPathOrNull('fHole');
    if (this.ready.has('outerTrace')) planPage('Top Contour', [black(this.getPath('top')), ...purfling, ...(fHole ? [black(fHole)] : [])]);
    if (this.ready.has('back')) planPage('Back Contour', [black(this.getPath('back')), ...purfling]);
    if (this.ready.has('innerTrace')) planPage('Inner Contour', [black(this.getPath('inner'))]);
    if (this.ready.has('mould')) planPage('Mould', [black(calculateMould(p, true, false))]);

    // the rest in their own frames, each sheet whole, filling pages of the one paper every page prints on
    const groups: PieceGroup[] = PDF_GROUPS
      .map(({ label, types }) => ({
        label,
        pieces: types.filter(type => this.ready.has(type)).map(type => this.svgSheet(type)).filter((sheet): sheet is SvgPiece => !!sheet),
      }))
      .filter(group => group.pieces.length);
    const paper = paperFor([...plans, ...groups.flatMap(g => g.pieces.map(piece => pathsBounds(piece.paths.map(path => path.d))))]);
    const pages = [...plans, ...paginatePieces(groups, paper)].map(page => ({ ...page, fileName: baseName, description }));

    if (pages.length) downloadFullPlanPdf(`${baseName}-full-plan.pdf`, pages, paper);
  }
}
