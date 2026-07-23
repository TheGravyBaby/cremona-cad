import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flipRectAboutY } from '../../../helpers/draftMath';
import { renderPath, renderRect } from '../../../helpers/renderFuncs';
import { calculateMould } from '../../ceruti-calcs';
import { bitDiameterInfo, channelDepthInfo } from '../../ceruti-helpers';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, PathEntry } from '../../ceruti-types';
import { ensureCenterBoutInnerPath, ensureOuterTracePaths } from '../../shared/derived-paths';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

@Component({
  selector: 'app-ceruti-mould-panel',
  imports: [FormsModule],
  templateUrl: './mould-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class MouldPanel extends CerutiPanelBase implements OnInit {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly bitDiameterInfo = bitDiameterInfo;
  protected readonly channelDepthInfo = channelDepthInfo;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  private getPath(key: string): string {
    return this.paths.find(p => p.key === key)!.path;
  }

  protected buildRun(): RenderLayer[] {
    const p = this.params;
    ensureCenterBoutInnerPath(p, this.paths);
    ensureOuterTracePaths(p, this.paths);

    const innerPath = this.getPath('inner');
    const previewMouldPath = calculateMould(p, false, this.flags.simpleClampBox);

    return [
      renderMould(p, this.colors, this.flags.showBlocks, this.flags.showInnerPath, previewMouldPath, innerPath),
    ];
  }
}

export const renderMould = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  showBlocks: boolean,
  showInnerPath: boolean,
  mouldPath: string,
  innerPath: string,
) => (g: any, ui: any): void => {
  showInnerPath && renderPath(innerPath, colors.innerTrace)(g, ui);
  renderPath(mouldPath, colors.mouldTrace)(g, ui);

  if (showBlocks) {
    renderRect(params.blocks.U!, colors.upperBout)(g, ui);
    renderRect(params.blocks.CU!, colors.centerBoutUp)(g, ui);
    renderRect(flipRectAboutY(params.blocks.CU!), colors.centerBoutUp)(g, ui);
    renderRect(params.blocks.CL!, colors.centerBoutLow)(g, ui);
    renderRect(flipRectAboutY(params.blocks.CL!), colors.centerBoutLow)(g, ui);
    renderRect(params.blocks.L!, colors.lowerBout)(g, ui);
  }
};
