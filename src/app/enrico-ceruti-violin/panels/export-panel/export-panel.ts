import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pointOnCircle } from '../../../helpers/draftMath';
import { combinePathStrings } from '../../../helpers/svgPathMath';
import { buildMirroredSvg, downloadFullPlanPdf, downloadSvgAsPdf, downloadSvgFile, PdfPage } from '../../../helpers/fileExporter';
import { downloadDxfFile } from '../../../helpers/dxfExporter';
import { renderPath } from '../../../helpers/renderFuncs';
import { calculateCornerBlocks, calculateMould, defineInnerPath, defineOffsetPath } from '../../ceruti-calcs';
import { CerutiColors, EnricoCerutiParams } from '../../ceruti-types';

type ExportType = 'innerTrace' | 'outerTrace' | 'back' | 'mould' | 'blocks';

@Component({
  selector: 'app-ceruti-export-panel',
  imports: [FormsModule],
  templateUrl: './export-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ExportPanel {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input() fileName = '';
  @Input() description = '';

  /** Forwarded straight through to the canvas by the parent — this panel composes its own preview renders. */
  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();

  previewExport(type: ExportType): void {
    const p = this.params;

    switch (type) {
      case 'innerTrace': {
        const d = defineInnerPath(p);
        this.draftChange.emit([renderPath(d, this.colors.innerTrace)]);
        break;
      }
      case 'outerTrace': {
        const path = combinePathStrings([defineOffsetPath(p), defineInnerPath(p)]);
        this.draftChange.emit([
          renderPath(path, this.colors.outerTrace),
        ]);
        break;
      }
      case 'back': {
        const path = combinePathStrings([defineOffsetPath(p, p.overhang + p.rib, true), defineInnerPath(p)]);
        this.draftChange.emit([
          renderPath(path, this.colors.outerTrace),
        ]);
        break;
      }
      case 'mould': {
        const d = calculateMould(p, true, false);
        this.draftChange.emit([renderPath(d, this.colors.mouldTrace)]);
        break;
      }
      case 'blocks': {
        const d = calculateCornerBlocks(p, defineInnerPath(p));
        let renders = d.map((block: string) => renderPath(block, this.colors.mouldTrace));
        this.draftChange.emit(renders);
        break;
      }
    }
  }

  downloadExport(type: ExportType): void {
    const p = this.params;
    const offset = p.overhang + p.rib;
    const baseName = this.fileName?.trim() || 'ceruti-violin';

    let height = p.height + 2 * p.button!.height + p.button!.width / 2;

    let pathD: string;
    switch (type) {
      case 'innerTrace':
        pathD = defineInnerPath(p);
        break;
      case 'outerTrace':
        pathD = combinePathStrings([defineOffsetPath(p), defineInnerPath(p)]);
        break;
      case 'back':
        pathD = combinePathStrings([defineOffsetPath(p, offset, true), defineInnerPath(p)]);
        break;
      case 'mould':
        pathD = calculateMould(p, false, false);
        break;
      case 'blocks':
        pathD = combinePathStrings(calculateCornerBlocks(p, defineInnerPath(p)));
        break;
    }

    const svg = buildMirroredSvg(p.width, height, [{ d: pathD!, stroke: "black", fill: 'none', strokeWidth: '.5' }]);
    downloadSvgFile(`${baseName}-${type}.svg`, svg);
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
      case 'outerTrace':
        pathD = combinePathStrings([defineOffsetPath(p), defineInnerPath(p)]);
        break;
      case 'back':
        pathD = combinePathStrings([defineOffsetPath(p, offset, true), defineInnerPath(p)]);
        break;
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
    const baseName = this.fileName?.trim() || 'ceruti-violin';
    const sheetLabels: Record<string, string> = {
      innerTrace: 'Inner Contour',
      outerTrace: 'Outer Contour',
      mould: 'Mould Path',
    };

    let height = p.height + 2 * p.button!.height + p.button!.width / 2;

    let pathD: string;
    switch (type) {
      case 'innerTrace':
        pathD = defineInnerPath(p);
        break;
      case 'outerTrace':
        pathD = combinePathStrings([defineOffsetPath(p), defineInnerPath(p)]);
        break;
      case 'back':
        pathD = combinePathStrings([defineOffsetPath(p, p.overhang + p.rib, true), defineInnerPath(p)]);
        break;
      case 'mould':
        pathD = calculateMould(p, true, false);
        break;
      case 'blocks':
        pathD = combinePathStrings(calculateCornerBlocks(p, defineInnerPath(p)));
        break;
    }

    downloadSvgAsPdf(
      `${baseName}-${type}.pdf`,
      p.width,
      height,
      [{ d: pathD!, stroke: 'black', fill: 'none' }],
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
    let height = p.height + 2 * p.button!.height + p.button!.width / 2;
    let inset = p.overhang + p.rib;
    if (p.options.useViolNeck)
      height = pointOnCircle(p.viol.V0!, 0).y + 2 * p.button!.height + p.button!.width / 2 + inset;

    const pages: PdfPage[] = [
      {
        label: 'Inner Contour',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: [{ d: defineInnerPath(p), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Top Contour',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: [{ d: defineOffsetPath(p), stroke: 'black', fill: 'none' }, { d: defineInnerPath(p), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Back Contour',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: [{ d: defineOffsetPath(p, p.overhang + p.rib, true), stroke: 'black', fill: 'none' }, { d: defineInnerPath(p), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Mould',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: [{ d: calculateMould(p, true, false), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Blocks',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: calculateCornerBlocks(p, defineInnerPath(p)).map((block: string) => ({ d: block, stroke: 'black', fill: 'none' })),
      }
    ];

    downloadFullPlanPdf(`${baseName}-full-plan.pdf`, pages);
  }
}
