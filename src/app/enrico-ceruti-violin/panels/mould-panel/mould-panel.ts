import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flipRectAboutY } from '../../../helpers/math/simpleGeometry';
import { renderPath, renderRect } from '../../../helpers/renderFuncs';
import { calculateMould, ensureCenterBoutInnerPath, getPath } from '../../calculation/outline/ceruti-calcs';
import { CerutiViewFlags, EnricoCerutiParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { PanelPalette } from '../../../theme/palette';

@Component({
  selector: 'app-ceruti-mould-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './mould-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class MouldPanel extends CerutiPanelBase implements OnInit {
  // What the mould is drawn *around* — the blocks it is built to hold, and the inner path it is
  // cut to. What appears on the canvas rather than what the recipe is, so they belong on the
  // toggle bar rather than as checkboxes at the foot of this panel.
  static readonly renderToggles: readonly RenderToggleKey[] = ['showBlocks', 'showInnerPath'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) flags!: CerutiViewFlags;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    ensureCenterBoutInnerPath(p, this.paths);

    const innerPath = getPath(this.paths, 'inner');
    const previewMouldPath = calculateMould(p, false, this.flags.simpleClampBox);

    return [
      renderMould(p, this.pal, this.flags.showBlocks, this.flags.showInnerPath, previewMouldPath, innerPath),
    ];
  }
}

export const renderMould = (
  params: EnricoCerutiParams,
  pal: PanelPalette,
  showBlocks: boolean,
  showInnerPath: boolean,
  mouldPath: string,
  innerPath: string,
) => (g: any, ui: any): void => {
  showInnerPath && renderPath(innerPath, pal.neutral.css)(g, ui);
  renderPath(mouldPath, pal.neutral.css)(g, ui);

  if (showBlocks) {
    renderRect(params.blocks.U!, pal.ink(1).css)(g, ui);
    renderRect(params.blocks.CU!, pal.ink(0).css)(g, ui);
    renderRect(flipRectAboutY(params.blocks.CU!), pal.ink(0).css)(g, ui);
    renderRect(params.blocks.CL!, pal.ink(0).lightness(0.5).css)(g, ui);
    renderRect(flipRectAboutY(params.blocks.CL!), pal.ink(0).lightness(0.5).css)(g, ui);
    renderRect(params.blocks.L!, pal.ink(2).css)(g, ui);
  }
};
