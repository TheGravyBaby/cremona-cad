import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pointOnCircle } from '../../../helpers/draftMath';
import { combinePathStrings, pathsBounds } from '../../../helpers/svgPathMath';
import { buildMirroredSvg, downloadFullPlanPdf, downloadSvgAsPdf, downloadSvgFile, PdfPage, SvgPathExport, SvgTextExport } from '../../../helpers/fileExporter';
import { downloadDxfFile, DxfText } from '../../../helpers/dxfExporter';
import { downloadStlFile } from '../../../helpers/stlExporter';
import { renderFilledPath, renderPath, renderText } from '../../../helpers/renderFuncs';
import { error } from '../../../shared/message-emitter';
import { calculateCornerBlocks, calculateMould, calculateOuterArcs, ensureCenterBoutInnerPath, ensureOuterTracePaths } from '../../ceruti-calcs';
import { defaultGougedCrossParams, defaultGougedFlutingParams } from '../../ceruti-gouged';
import { buildGougedPlateSurfaceModel, buildPlateStl, calculateCrossArchTemplates, calculateLongArchTemplates, TemplateShape } from '../../ceruti-surface';
import { CerutiColors, EnricoCerutiParams, PathEntry } from '../../ceruti-types';

type ExportType = 'innerTrace' | 'outerTrace' | 'back' | 'mould' | 'blocks' | 'crossArchTemplates' | 'longArchTemplates';

/** Templates are laid out in their own coordinate frame (not the violin's plan-view box), so their
 *  export sheet is sized from the actual combined geometry rather than the shared plan dimensions. */
const TEMPLATE_SHEET_PAD = 5;
/** Label text size (mm), consistent across the canvas preview, SVG/PDF, and DXF exports. */
const TEMPLATE_LABEL_SIZE = 5;

@Component({
  selector: 'app-ceruti-export-panel',
  imports: [FormsModule],
  templateUrl: './export-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ExportPanel implements OnInit {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) paths!: PathEntry[];
  @Input() fileName = '';
  @Input() description = '';

  /** Forwarded straight through to the canvas by the parent — this panel composes its own preview renders. */
  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();

  /** Looks up a precalculated path from the shared cache populated by panel updates/shared derivation helpers. */
  private getPath(key: string): string {
    return this.paths.find(entry => entry.key === key)!.path;
  }

  /** Same, but for keys that are legitimately absent (e.g. purfling not yet configured). */
  private getPathOrNull(key: string): string | null {
    return this.paths.find(entry => entry.key === key)?.path ?? null;
  }

  /**
   * Which plate's channel belongs on this sheet. The two plates carry their own
   * gouges, so the top and back contours are no longer the same drawing with a
   * different outline — each shows the channel that plate is actually cut with.
   */
  private channelKey(type: 'outerTrace' | 'back', part: 'Area' | 'Line'): string {
    return `channel${part}${type === 'back' ? 'Back' : 'Top'}`;
  }

  /** Arching templates need the arching modules built, same precondition as STL export. */
  private requireArching(): boolean {
    if (!this.params.arching) {
      error('Arching templates need the arching modules — open Fluting Channel, Long Arching and Cross Arching first.', 'Arching Templates');
      return false;
    }
    return true;
  }

  private archTemplates(type: 'crossArchTemplates' | 'longArchTemplates'): TemplateShape[] {
    return type === 'crossArchTemplates' ? calculateCrossArchTemplates(this.params) : calculateLongArchTemplates(this.params);
  }

  private ensureDerivedPaths(): void {
    ensureCenterBoutInnerPath(this.params, this.paths);
    ensureOuterTracePaths(this.params, this.paths);
  }

  private toSvgTexts(shapes: TemplateShape[]): SvgTextExport[] {
    return shapes.map(s => ({ text: s.label, x: s.labelPos.x, y: s.labelPos.y, rotationDeg: s.labelRotation, fontSize: TEMPLATE_LABEL_SIZE }));
  }

  private toDxfTexts(shapes: TemplateShape[]): DxfText[] {
    return shapes.map(s => ({ text: s.label, x: s.labelPos.x, y: s.labelPos.y, height: TEMPLATE_LABEL_SIZE, rotationDeg: s.labelRotation }));
  }

  ngOnInit(): void {
    this.ensureDerivedPaths();
    this.previewExport('outerTrace');
  }

  previewExport(type: ExportType): void {
    this.ensureDerivedPaths();
    const p = this.params;

    switch (type) {
      case 'innerTrace': {
        this.draftChange.emit([renderPath(this.getPath('inner'), this.colors.innerTrace)]);
        break;
      }
      case 'outerTrace':
      case 'back': {
        const renders: Array<(g: any, ui: any) => void> = [
          renderPath(this.getPath(type === 'back' ? 'back' : 'top'), this.colors.outerTrace),
        ];
        const channelPath = this.getPathOrNull(this.channelKey(type, 'Area'));
        if (channelPath) renders.push(renderFilledPath(channelPath, this.colors.fluting));
        const purflingPath = this.getPathOrNull('purfling');
        if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
        const outerPurflingPath = this.getPathOrNull('outerPurfling');
        if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));
        this.draftChange.emit(renders);
        break;
      }
      case 'mould': {
        // Computed directly rather than read from the cache — it's export-only and
        // too expensive (10x denser boolean diff) to keep current on every edit.
        this.draftChange.emit([renderPath(calculateMould(p, true, false), this.colors.mouldTrace)]);
        break;
      }
      case 'blocks': {
        const renders = calculateCornerBlocks(p, this.getPath('inner')).map((block: string) => renderPath(block, this.colors.mouldTrace));
        this.draftChange.emit(renders);
        break;
      }
      case 'crossArchTemplates':
      case 'longArchTemplates': {
        if (!this.requireArching()) { this.draftChange.emit([]); break; }
        const shapes = this.archTemplates(type);
        const renders = shapes.flatMap(s => [
          renderPath(s.path, this.colors.mouldTrace),
          renderText(s.labelPos, s.label, this.colors.mouldTrace, TEMPLATE_LABEL_SIZE, s.labelRotation),
        ]);
        this.draftChange.emit(renders);
        break;
      }
    }
  }

  downloadExport(type: ExportType): void {
    this.ensureDerivedPaths();
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const height = p.height + 2 * p.button!.height + p.button!.width / 2;

    let paths: SvgPathExport[];
    let texts: SvgTextExport[] = [];
    let sheetWidth = p.width;
    let sheetHeight = height;
    switch (type) {
      case 'innerTrace':
        paths = [{ d: this.getPath('inner'), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        break;
      case 'outerTrace':
      case 'back': {
        paths = [{ d: this.getPath(type === 'back' ? 'back' : 'top'), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        const channelPath = this.getPathOrNull(this.channelKey(type, 'Area'));
        if (channelPath) paths.push({ d: channelPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 1, stroke: 'none', strokeWidth: 0 });
        const purflingPath = this.getPathOrNull('purfling');
        if (purflingPath) paths.push({ d: purflingPath, stroke: 'black', fill: 'none', strokeWidth: '.5' });
        const outerPurflingPath = this.getPathOrNull('outerPurfling');
        if (outerPurflingPath) paths.push({ d: outerPurflingPath, stroke: 'black', fill: 'none', strokeWidth: '.5' });
        break;
      }
      case 'mould':
        paths = [{ d: calculateMould(p, true, false), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        break;
      case 'blocks':
        paths = [{ d: combinePathStrings(calculateCornerBlocks(p, this.getPath('inner'))), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        break;
      case 'crossArchTemplates':
      case 'longArchTemplates': {
        if (!this.requireArching()) return;
        const shapes = this.archTemplates(type);
        const bounds = pathsBounds(shapes.map(s => s.path));
        sheetWidth = bounds.width + TEMPLATE_SHEET_PAD;
        sheetHeight = bounds.height + TEMPLATE_SHEET_PAD;
        paths = [{ d: combinePathStrings(shapes.map(s => s.path)), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        texts = this.toSvgTexts(shapes);
        break;
      }
    }

    downloadSvgFile(`${baseName}-${type}.svg`, buildMirroredSvg(sheetWidth, sheetHeight, paths!, texts));
  }

  downloadStl(side: 'top' | 'bottom' = 'top'): void {
    const p = this.params;
    const plateLabel = side === 'top' ? 'top' : 'back';
    if (!p.arching) {
      error(`The ${plateLabel} plate surface needs the arching modules — open Long Arching and Cross Arching first.`, "STL Export");
      return;
    }
    const plate = p.arching[side];
    plate.gougedFluting ??= defaultGougedFlutingParams(p);
    plate.gougedCross ??= defaultGougedCrossParams();
    calculateOuterArcs(p);
    const model = buildGougedPlateSurfaceModel(p, side);
    if (!model) return;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    downloadStlFile(`${baseName}-${plateLabel}-plate.stl`, buildPlateStl(p, model, side));
  }

  downloadDxf(type: ExportType): void {
    this.ensureDerivedPaths();
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
        const channelPath = this.getPathOrNull(this.channelKey(type, 'Line'));
        if (channelPath) dxfPaths.push(channelPath);
        pathD = combinePathStrings(dxfPaths);
        break;
      }
      case 'mould':
        pathD = calculateMould(p, true, false);
        break;
      case 'blocks':
        pathD = combinePathStrings(calculateCornerBlocks(p, this.getPath('inner')));
        break;
      case 'crossArchTemplates':
      case 'longArchTemplates': {
        if (!this.requireArching()) return;
        const shapes = this.archTemplates(type);
        pathD = combinePathStrings(shapes.map(s => s.path));
        texts = this.toDxfTexts(shapes);
        break;
      }
    }

    downloadDxfFile(`${baseName}-${type}.dxf`, pathD!, texts);
  }

  downloadPdf(type: ExportType): void {
    this.ensureDerivedPaths();
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const sheetLabels: Record<string, string> = {
      innerTrace: 'Inner Contour',
      outerTrace: 'Outer Contour',
      mould: 'Mould Path',
      crossArchTemplates: 'Cross Arch Templates',
      longArchTemplates: 'Long Arch Templates',
    };

    const height = p.height + 2 * p.button!.height + p.button!.width / 2;

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
        const channelPath = this.getPathOrNull(this.channelKey(type, 'Area'));
        if (channelPath) pdfPaths.push({ d: channelPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 1, stroke: 'none' });
        const purflingPath = this.getPathOrNull('purfling');
        if (purflingPath) pdfPaths.push({ d: purflingPath, stroke: 'black', fill: 'none' });
        const outerPurflingPath = this.getPathOrNull('outerPurfling');
        if (outerPurflingPath) pdfPaths.push({ d: outerPurflingPath, stroke: 'black', fill: 'none' });
        break;
      }
      case 'mould':
        pdfPaths = [{ d: calculateMould(p, true, false), stroke: 'black', fill: 'none' }];
        break;
      case 'blocks':
        pdfPaths = [{ d: combinePathStrings(calculateCornerBlocks(p, this.getPath('inner'))), stroke: 'black', fill: 'none' }];
        break;
      case 'crossArchTemplates':
      case 'longArchTemplates': {
        if (!this.requireArching()) return;
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
        sheetLabel: sheetLabels[type],
      },
      texts
    );
  }

  downloadFullPlan(): void {
    this.ensureDerivedPaths();
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const description = this.description ?? '';
    const inset = p.overhang + p.rib;
    let height = p.height + 2 * p.button!.height + p.button!.width / 2;
    if (p.options.useViolNeck)
      height = pointOnCircle(p.viol.V0!, 0).y + 2 * p.button!.height + p.button!.width / 2 + inset;

    const purflingPath = this.getPathOrNull('purfling');
    const outerPurflingPath = this.getPathOrNull('outerPurfling');
    const topChannel = this.getPathOrNull('channelAreaTop');
    const backChannel = this.getPathOrNull('channelAreaBack');

    // Arching templates sit in their own coordinate frame, so their page is sized from the
    // actual combined geometry rather than the shared plan width/height used above.
    const templatePage = (label: string, shapes: TemplateShape[]): PdfPage => {
      const bounds = pathsBounds(shapes.map(s => s.path));
      return {
        label,
        fileName: baseName,
        description,
        width: bounds.width + TEMPLATE_SHEET_PAD,
        height: bounds.height + TEMPLATE_SHEET_PAD,
        paths: [{ d: combinePathStrings(shapes.map(s => s.path)), stroke: 'black', fill: 'none' }],
        texts: this.toSvgTexts(shapes),
      };
    };

    const pages: PdfPage[] = [
      {
        label: 'Inner Contour',
        fileName: baseName,
        description,
        width: p.width,
        height,
        paths: [{ d: this.getPath('inner'), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Top Contour',
        fileName: baseName,
        description,
        width: p.width,
        height,
        paths: [
          { d: this.getPath('top'), stroke: 'black', fill: 'none' },
          ...(topChannel ? [{ d: topChannel, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 1, stroke: 'none' }] : []),
          ...(purflingPath ? [{ d: purflingPath, stroke: 'black', fill: 'none' }] : []),
          ...(outerPurflingPath ? [{ d: outerPurflingPath, stroke: 'black', fill: 'none' }] : []),
        ],
      },
      {
        label: 'Back Contour',
        fileName: baseName,
        description,
        width: p.width,
        height,
        paths: [
          { d: this.getPath('back'), stroke: 'black', fill: 'none' },
          ...(backChannel ? [{ d: backChannel, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 1, stroke: 'none' }] : []),
          ...(purflingPath ? [{ d: purflingPath, stroke: 'black', fill: 'none' }] : []),
          ...(outerPurflingPath ? [{ d: outerPurflingPath, stroke: 'black', fill: 'none' }] : []),
        ],
      },
      {
        label: 'Mould',
        fileName: baseName,
        description,
        width: p.width,
        height,
        paths: [{ d: calculateMould(p, true, false), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Blocks',
        fileName: baseName,
        description,
        width: p.width,
        height,
        paths: calculateCornerBlocks(p, this.getPath('inner')).map((block: string) => ({ d: block, stroke: 'black', fill: 'none' })),
      },
      // Arching templates need the arching modules built — omit these pages rather than
      // failing the whole plan when they haven't been opened yet.
      ...(p.arching ? [
        templatePage('Long Arch Templates', calculateLongArchTemplates(p)),
        templatePage('Cross Arch Templates', calculateCrossArchTemplates(p)),
      ] : []),
    ];

    downloadFullPlanPdf(`${baseName}-full-plan.pdf`, pages);
  }
}
