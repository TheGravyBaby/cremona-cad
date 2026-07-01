import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pointOnCircle } from '../../../helpers/draftMath';
import { combinePathStrings } from '../../../helpers/svgPathMath';
import { buildMirroredSvg, downloadFullPlanPdf, downloadSvgAsPdf, downloadSvgFile, PdfPage, SvgPathExport } from '../../../helpers/fileExporter';
import { downloadDxfFile } from '../../../helpers/dxfExporter';
import { renderFilledPath, renderPath } from '../../../helpers/renderFuncs';
import { calculateCornerBlocks } from '../../ceruti-calcs';
import { CerutiColors, EnricoCerutiParams, PathEntry } from '../../ceruti-types';

type ExportType = 'innerTrace' | 'outerTrace' | 'back' | 'mould' | 'blocks';

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

  /** Looks up a precalculated path from the shared cache populated by the parent's panel handlers. */
  private getPath(key: string): string {
    return this.paths.find(entry => entry.key === key)!.path;
  }

  /** Same, but for keys that are legitimately absent (e.g. purfling not yet configured). */
  private getPathOrNull(key: string): string | null {
    return this.paths.find(entry => entry.key === key)?.path ?? null;
  }

  ngOnInit(): void {
    this.previewExport('outerTrace');
  }

  previewExport(type: ExportType): void {
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
        const flutingPath = this.getPathOrNull('flutingArea');
        if (flutingPath) renders.push(renderFilledPath(flutingPath, this.colors.fluting));
        const purflingPath = this.getPathOrNull('purfling');
        if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
        const outerPurflingPath = this.getPathOrNull('outerPurfling');
        if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));
        this.draftChange.emit(renders);
        break;
      }
      case 'mould': {
        this.draftChange.emit([renderPath(this.getPath('mould'), this.colors.mouldTrace)]);
        break;
      }
      case 'blocks': {
        const renders = calculateCornerBlocks(p, this.getPath('inner')).map((block: string) => renderPath(block, this.colors.mouldTrace));
        this.draftChange.emit(renders);
        break;
      }
    }
  }

  downloadExport(type: ExportType): void {
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const height = p.height + 2 * p.button!.height + p.button!.width / 2;

    let paths: SvgPathExport[];
    switch (type) {
      case 'innerTrace':
        paths = [{ d: this.getPath('inner'), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        break;
      case 'outerTrace':
      case 'back': {
        paths = [{ d: this.getPath(type === 'back' ? 'back' : 'top'), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        const flutingPath = this.getPathOrNull('flutingArea');
        if (flutingPath) paths.push({ d: flutingPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 1, stroke: 'none', strokeWidth: 0 });
        const purflingPath = this.getPathOrNull('purfling');
        if (purflingPath) paths.push({ d: purflingPath, stroke: 'black', fill: 'none', strokeWidth: '.5' });
        const outerPurflingPath = this.getPathOrNull('outerPurfling');
        if (outerPurflingPath) paths.push({ d: outerPurflingPath, stroke: 'black', fill: 'none', strokeWidth: '.5' });
        break;
      }
      case 'mould':
        paths = [{ d: this.getPath('mould'), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        break;
      case 'blocks':
        paths = [{ d: combinePathStrings(calculateCornerBlocks(p, this.getPath('inner'))), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        break;
    }

    downloadSvgFile(`${baseName}-${type}.svg`, buildMirroredSvg(p.width, height, paths!));
  }

  downloadDxf(type: ExportType): void {
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';

    let pathD: string;
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
        const flutingPath = this.getPathOrNull('flutingLine');
        if (flutingPath) dxfPaths.push(flutingPath);
        pathD = combinePathStrings(dxfPaths);
        break;
      }
      case 'mould':
        pathD = this.getPath('mould');
        break;
      case 'blocks':
        pathD = combinePathStrings(calculateCornerBlocks(p, this.getPath('inner')));
        break;
    }

    downloadDxfFile(`${baseName}-${type}.dxf`, pathD!);
  }

  downloadPdf(type: ExportType): void {
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const sheetLabels: Record<string, string> = {
      innerTrace: 'Inner Contour',
      outerTrace: 'Outer Contour',
      mould: 'Mould Path',
    };

    const height = p.height + 2 * p.button!.height + p.button!.width / 2;

    let pdfPaths: SvgPathExport[];
    switch (type) {
      case 'innerTrace':
        pdfPaths = [{ d: this.getPath('inner'), stroke: 'black', fill: 'none' }];
        break;
      case 'outerTrace':
      case 'back': {
        pdfPaths = [{ d: this.getPath(type === 'back' ? 'back' : 'top'), stroke: 'black', fill: 'none' }];
        const flutingPath = this.getPathOrNull('flutingArea');
        if (flutingPath) pdfPaths.push({ d: flutingPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 1, stroke: 'none' });
        const purflingPath = this.getPathOrNull('purfling');
        if (purflingPath) pdfPaths.push({ d: purflingPath, stroke: 'black', fill: 'none' });
        const outerPurflingPath = this.getPathOrNull('outerPurfling');
        if (outerPurflingPath) pdfPaths.push({ d: outerPurflingPath, stroke: 'black', fill: 'none' });
        break;
      }
      case 'mould':
        pdfPaths = [{ d: this.getPath('mould'), stroke: 'black', fill: 'none' }];
        break;
      case 'blocks':
        pdfPaths = [{ d: combinePathStrings(calculateCornerBlocks(p, this.getPath('inner'))), stroke: 'black', fill: 'none' }];
        break;
    }

    downloadSvgAsPdf(
      `${baseName}-${type}.pdf`,
      p.width,
      height,
      pdfPaths!,
      {
        fileName: baseName,
        description: this.description ?? '',
        sheetLabel: sheetLabels[type],
      }
    );
  }

  downloadFullPlan(): void {
    const p = this.params;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const description = this.description ?? '';
    const inset = p.overhang + p.rib;
    let height = p.height + 2 * p.button!.height + p.button!.width / 2;
    if (p.options.useViolNeck)
      height = pointOnCircle(p.viol.V0!, 0).y + 2 * p.button!.height + p.button!.width / 2 + inset;

    const purflingPath = this.getPathOrNull('purfling');
    const outerPurflingPath = this.getPathOrNull('outerPurfling');
    const flutingPath = this.getPathOrNull('flutingArea');

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
          ...(flutingPath ? [{ d: flutingPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 1, stroke: 'none' }] : []),
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
          ...(flutingPath ? [{ d: flutingPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 1, stroke: 'none' }] : []),
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
        paths: [{ d: this.getPath('mould'), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Blocks',
        fileName: baseName,
        description,
        width: p.width,
        height,
        paths: calculateCornerBlocks(p, this.getPath('inner')).map((block: string) => ({ d: block, stroke: 'black', fill: 'none' })),
      }
    ];

    downloadFullPlanPdf(`${baseName}-full-plan.pdf`, pages);
  }
}
