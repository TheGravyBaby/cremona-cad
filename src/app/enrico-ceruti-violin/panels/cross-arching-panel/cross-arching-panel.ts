import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArchingParams, CerutiColors, CerutiViewFlags, CrossArchParams, EnricoCerutiParams } from '../../ceruti-types';
import { crossSectionStationInfo, trochoidFactorInfo } from '../../ceruti-helpers';
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

  get arching(): ArchingParams { return this.params.arching!; }
  get topCross(): CrossArchParams { return this.arching.top.cross!; }

  onChange(): void { this.changed.emit(); }
}
