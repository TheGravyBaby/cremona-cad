import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderFilledPath } from '../../../helpers/renderFuncs';
import { PaletteId, STROKE_WEIGHT } from '../../../theme/palettes';
import { translatePath } from '../../../helpers/math/pathMath';
import { calculateOuterArcs, ensureFholePath, ensureOuterTracePaths } from '../../calculation/outline/ceruti-calcs';
import { renderPlatePair } from '../../renders/front-profile.render';
import { CerutiViewFlags, EnricoCerutiParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { defaultArchingParams } from '../../calculation/arching/ceruti-arching';
import { defaultFlutingParams, effectiveCBoutSweep, channelAreaPath, channelPaths, cornerJoinAreaPath, gougeHalfWidth, plateLayoutOffset } from '../../calculation/arching/ceruti-arch-geometry';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { TooltipDirective } from '../../../docs/tooltips';

@Component({
  selector: 'app-ceruti-fluting-panel',
  imports: [TooltipDirective, FormsModule, DecimalPipe, NumberStepperDirective],
  templateUrl: './fluting-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class FlutingPanel extends CerutiPanelBase implements OnInit {
  protected override readonly paletteId: PaletteId = 'plates';
  static readonly renderToggles: readonly RenderToggleKey[] = [];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) flags!: CerutiViewFlags;
  protected readonly gougeHalfWidth = gougeHalfWidth;
  protected readonly effectiveCBoutSweep = effectiveCBoutSweep;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.arching ??= defaultArchingParams(p.height);
    // the channel offsets are taken off the outer arcs, which must be current
    calculateOuterArcs(p);
    p.outerFlutingDepth = Math.max(p.outerFlutingDepth ?? 0, 0);

    const top = (p.arching.top.fluting ??= defaultFlutingParams(p));
    const back = (p.arching.bottom.fluting ??= defaultFlutingParams(p));
    // one toggle for both plates: the corners are smoothed in a single operation at the bench, so
    // a top that had them and a back that didn't would be two methods, not two tools
    back.cornerGouge = top.cornerGouge;
    for (const g of [top, back]) {
      // a gouge cuts no deeper than its own sweep, and the width formula goes imaginary past that
      g.sweepRadius = Math.max(g.sweepRadius || 0, 0.1);
      g.depth = Math.min(Math.max(g.depth || 0, 0), g.sweepRadius * 0.9);
      if (g.sweepRadius_cBout !== null) g.sweepRadius_cBout = Math.max(g.sweepRadius_cBout, g.depth / 0.9);
    }

    // side by side rather than superimposed, top centred and back to its left as a pair sits on the
    // bench: the two plates carry different gouges, and stacking them buries whichever is drawn first.
    // The plates are context only, so guide weight; the purfling is what the land edge is set against
    ensureOuterTracePaths(p, this.paths);
    if (p.fHoles) ensureFholePath(p, this.paths);
    const renders: RenderLayer[] = renderPlatePair(p, this.paths, this.pal, STROKE_WEIGHT.guide);
    for (const plate of ['top', 'bottom'] as const) {
      const g = plate === 'top' ? top : back;
      const color = plate === 'top' ? this.pal.ink(0).css : this.pal.ink(2).css;
      const dx = plateLayoutOffset(p, plate);
      const at = (path: string): string => translatePath(path, dx, 0);

      const paths = channelPaths(p, g);
      if (!paths) continue;

      // the corner join is smoothed down after the gouge has run, so it draws lighter than the
      // channel, and lighter still with the corner pass off, when it marks wood left rather than taken
      renders.push(renderFilledPath(at(cornerJoinAreaPath(p, paths)), color, g.cornerGouge ? 0.15 : 0.08));
      renders.push(renderFilledPath(at(channelAreaPath(paths)), color, 0.3));
    }
    return renders;
  }
}
