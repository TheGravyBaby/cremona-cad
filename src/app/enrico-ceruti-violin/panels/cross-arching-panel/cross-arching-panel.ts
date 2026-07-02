import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArchingParams, CerutiColors, CerutiViewFlags, CrossArchParams, EnricoCerutiParams, FlutingChannelParams } from '../../ceruti-types';
import { archContoursInfo, crossArchEdgeDepthInfo, crossSectionStationInfo, trochoidFactorInfo, troughPositionInfo } from '../../ceruti-helpers';
import { resolveTroughU } from '../../ceruti-calcs';
import { RenderToggles } from '../../render-toggles/render-toggles';

@Component({
  selector: 'app-ceruti-cross-arching-panel',
  imports: [FormsModule, RenderToggles],
  templateUrl: './cross-arching-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CrossArchingPanel {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  @Output() changed = new EventEmitter<void>();

  protected readonly crossSectionStationInfo = crossSectionStationInfo;
  protected readonly trochoidFactorInfo = trochoidFactorInfo;
  protected readonly crossArchEdgeDepthInfo = crossArchEdgeDepthInfo;
  protected readonly troughPositionInfo = troughPositionInfo;
  protected readonly archContoursInfo = archContoursInfo;

  get arching(): ArchingParams { return this.params.arching!; }
  get topCross(): CrossArchParams { return this.arching.top.cross!; }
  get topFluting(): FlutingChannelParams { return this.arching.top.fluting!; }

  /** troughT = null means "derive from the purfling line"; unchecking pins the current derived value. */
  get troughAuto(): boolean { return this.topFluting.troughT === null; }
  set troughAuto(v: boolean) {
    this.topFluting.troughT = v ? null : Math.round(resolveTroughU(this.params, this.topFluting) * 100) / 100;
  }

  onChange(): void { this.changed.emit(); }
}
