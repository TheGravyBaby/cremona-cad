import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pointOnCircle } from '../../../helpers/draftMath';
import { combinePathStrings } from '../../../helpers/svgPathMath';
import { buildMirroredSvg, downloadFullPlanPdf, downloadSvgAsPdf, downloadSvgFile, PdfPage, SvgPathExport } from '../../../helpers/fileExporter';
import { downloadDxfFile } from '../../../helpers/dxfExporter';
import { renderFilledPath, renderPath } from '../../../helpers/renderFuncs';
import { calculateCornerBlocks, calculateMould, defineFlutingPath, defineFlutingPlatformPath, defineInnerPath, defineOuterPath, defineOuterPurflingPath, definePurflingPath } from '../../ceruti-calcs';
import { CerutiColors, EnricoCerutiParams } from '../../ceruti-types';

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
  @Input() fileName = '';
  @Input() description = '';

  /** Forwarded straight through to the canvas by the parent — this panel composes its own preview renders. */
  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();

  ngOnInit(): void {
    this.previewExport('outerTrace');
  }

  previewExport(type: ExportType): void {
    const p = this.params;

    switch (type) {
      case 'innerTrace': {
        this.draftChange.emit([renderPath(defineInnerPath(p), this.colors.innerTrace)]);
        break;
      }
      case 'outerTrace': {
        const offset = p.overhang + p.rib;
        const renders: Array<(g: any, ui: any) => void> = [
          renderPath(defineOuterPath(p), this.colors.outerTrace),
        ];
        const purflingPath = definePurflingPath(p, offset);
        if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
        const outerPurflingPath = defineOuterPurflingPath(p, offset);
        if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));
        const flutingPath = defineFlutingPlatformPath(p, offset);
        if (flutingPath) renders.push(renderFilledPath(flutingPath, this.colors.fluting));
        this.draftChange.emit(renders);
        break;
      }
      case 'back': {
        const offset = p.overhang + p.rib;
        const renders: Array<(g: any, ui: any) => void> = [
          renderPath(defineOuterPath(p, offset, true), this.colors.outerTrace),
        ];
        const purflingPath = definePurflingPath(p, offset);
        if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
        const outerPurflingPath = defineOuterPurflingPath(p, offset);
        if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));
        const flutingPath = defineFlutingPlatformPath(p, offset, true);
        if (flutingPath) renders.push(renderFilledPath(flutingPath, this.colors.fluting));
        this.draftChange.emit(renders);
        break;
      }
      case 'mould': {
        this.draftChange.emit([renderPath(calculateMould(p, true, false), this.colors.mouldTrace)]);
        break;
      }
      case 'blocks': {
        const renders = calculateCornerBlocks(p, defineInnerPath(p)).map((block: string) => renderPath(block, this.colors.mouldTrace));
        this.draftChange.emit(renders);
        break;
      }
    }
  }

  downloadExport(type: ExportType): void {
    const p = this.params;
    const offset = p.overhang + p.rib;
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const height = p.height + 2 * p.button!.height + p.button!.width / 2;

    let paths: SvgPathExport[];
    switch (type) {
      case 'innerTrace':
        paths = [{ d: defineInnerPath(p), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        break;
      case 'outerTrace': {
        paths = [{ d: defineOuterPath(p), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        const purflingPath = definePurflingPath(p, offset);
        if (purflingPath) paths.push({ d: purflingPath, stroke: 'black', fill: 'none', strokeWidth: '.5' });
        const outerPurflingPath = defineOuterPurflingPath(p, offset);
        if (outerPurflingPath) paths.push({ d: outerPurflingPath, stroke: 'black', fill: 'none', strokeWidth: '.5' });
        const flutingPath = defineFlutingPlatformPath(p, offset);
        if (flutingPath) paths.push({ d: flutingPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 0.35, stroke: 'none', strokeWidth: 0 });
        break;
      }
      case 'back': {
        paths = [{ d: defineOuterPath(p, offset, true), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        const purflingPath = definePurflingPath(p, offset);
        if (purflingPath) paths.push({ d: purflingPath, stroke: 'black', fill: 'none', strokeWidth: '.5' });
        const outerPurflingPath = defineOuterPurflingPath(p, offset);
        if (outerPurflingPath) paths.push({ d: outerPurflingPath, stroke: 'black', fill: 'none', strokeWidth: '.5' });
        const flutingPath = defineFlutingPlatformPath(p, offset, true);
        if (flutingPath) paths.push({ d: flutingPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 0.35, stroke: 'none', strokeWidth: 0 });
        break;
      }
      case 'mould':
        paths = [{ d: calculateMould(p, false, false), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        break;
      case 'blocks':
        paths = [{ d: combinePathStrings(calculateCornerBlocks(p, defineInnerPath(p))), stroke: 'black', fill: 'none', strokeWidth: '.5' }];
        break;
    }

    downloadSvgFile(`${baseName}-${type}.svg`, buildMirroredSvg(p.width, height, paths!));
  }

  downloadDxf(type: ExportType): void {
    const p = this.params;
    const offset = p.overhang + p.rib;
    const baseName = this.fileName?.trim() || 'ceruti-violin';

    let pathD: string;
    switch (type) {
      case 'innerTrace':
        pathD = defineInnerPath(p);
        break;
      case 'outerTrace': {
        const dxfPaths = [defineOuterPath(p)];
        const purflingPath = definePurflingPath(p, offset);
        if (purflingPath) dxfPaths.push(purflingPath);
        const outerPurflingPath = defineOuterPurflingPath(p, offset);
        if (outerPurflingPath) dxfPaths.push(outerPurflingPath);
        const flutingPath = defineFlutingPath(p, offset);
        if (flutingPath) dxfPaths.push(flutingPath);
        pathD = combinePathStrings(dxfPaths);
        break;
      }
      case 'back': {
        const dxfPaths = [defineOuterPath(p, offset, true)];
        const purflingPath = definePurflingPath(p, offset);
        if (purflingPath) dxfPaths.push(purflingPath);
        const outerPurflingPath = defineOuterPurflingPath(p, offset);
        if (outerPurflingPath) dxfPaths.push(outerPurflingPath);
        const flutingPath = defineFlutingPath(p, offset);
        if (flutingPath) dxfPaths.push(flutingPath);
        pathD = combinePathStrings(dxfPaths);
        break;
      }
      case 'mould':
        pathD = calculateMould(p, false, false);
        break;
      case 'blocks':
        pathD = combinePathStrings(calculateCornerBlocks(p, defineInnerPath(p)));
        break;
    }

    downloadDxfFile(`${baseName}-${type}.dxf`, pathD!);
  }

  downloadPdf(type: ExportType): void {
    const p = this.params;
    const offset = p.overhang + p.rib;
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
        pdfPaths = [{ d: defineInnerPath(p), stroke: 'black', fill: 'none' }];
        break;
      case 'outerTrace': {
        pdfPaths = [{ d: defineOuterPath(p), stroke: 'black', fill: 'none' }];
        const purflingPath = definePurflingPath(p, offset);
        if (purflingPath) pdfPaths.push({ d: purflingPath, stroke: 'black', fill: 'none' });
        const outerPurflingPath = defineOuterPurflingPath(p, offset);
        if (outerPurflingPath) pdfPaths.push({ d: outerPurflingPath, stroke: 'black', fill: 'none' });
        const flutingPath = defineFlutingPlatformPath(p, offset);
        if (flutingPath) pdfPaths.push({ d: flutingPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 0.35, stroke: 'none' });
        break;
      }
      case 'back': {
        pdfPaths = [{ d: defineOuterPath(p, offset, true), stroke: 'black', fill: 'none' }];
        const purflingPath = definePurflingPath(p, offset);
        if (purflingPath) pdfPaths.push({ d: purflingPath, stroke: 'black', fill: 'none' });
        const outerPurflingPath = defineOuterPurflingPath(p, offset);
        if (outerPurflingPath) pdfPaths.push({ d: outerPurflingPath, stroke: 'black', fill: 'none' });
        const flutingPath = defineFlutingPlatformPath(p, offset, true);
        if (flutingPath) pdfPaths.push({ d: flutingPath, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 0.35, stroke: 'none' });
        break;
      }
      case 'mould':
        pdfPaths = [{ d: calculateMould(p, true, false), stroke: 'black', fill: 'none' }];
        break;
      case 'blocks':
        pdfPaths = [{ d: combinePathStrings(calculateCornerBlocks(p, defineInnerPath(p))), stroke: 'black', fill: 'none' }];
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

    const topPurfling = definePurflingPath(p, inset);
    const topOuterPurfling = defineOuterPurflingPath(p, inset);
    const topFluting = defineFlutingPlatformPath(p, inset);
    const backPurfling = definePurflingPath(p, inset);
    const backOuterPurfling = defineOuterPurflingPath(p, inset);
    const backFluting = defineFlutingPlatformPath(p, inset, true);

    const pages: PdfPage[] = [
      {
        label: 'Inner Contour',
        fileName: baseName,
        description,
        width: p.width,
        height,
        paths: [{ d: defineInnerPath(p), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Top Contour',
        fileName: baseName,
        description,
        width: p.width,
        height,
        paths: [
          { d: defineOuterPath(p), stroke: 'black', fill: 'none' },
          ...(topPurfling ? [{ d: topPurfling, stroke: 'black', fill: 'none' }] : []),
          ...(topOuterPurfling ? [{ d: topOuterPurfling, stroke: 'black', fill: 'none' }] : []),
          ...(topFluting ? [{ d: topFluting, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 0.35, stroke: 'none' }] : []),
        ],
      },
      {
        label: 'Back Contour',
        fileName: baseName,
        description,
        width: p.width,
        height,
        paths: [
          { d: defineOuterPath(p, inset, true), stroke: 'black', fill: 'none' },
          ...(backPurfling ? [{ d: backPurfling, stroke: 'black', fill: 'none' }] : []),
          ...(backOuterPurfling ? [{ d: backOuterPurfling, stroke: 'black', fill: 'none' }] : []),
          ...(backFluting ? [{ d: backFluting, fill: '#bbbbbb', fillRule: 'evenodd', fillOpacity: 0.35, stroke: 'none' }] : []),
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
        paths: calculateCornerBlocks(p, defineInnerPath(p)).map((block: string) => ({ d: block, stroke: 'black', fill: 'none' })),
      }
    ];

    downloadFullPlanPdf(`${baseName}-full-plan.pdf`, pages);
  }
}
