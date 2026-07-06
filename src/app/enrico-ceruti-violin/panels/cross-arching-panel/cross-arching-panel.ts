import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArchingParams, CerutiColors, CerutiViewFlags, CrossArchParams, EnricoCerutiParams, FlutingChannelParams, PlateViewMode } from '../../ceruti-types';
import { archContoursInfo, crossArchCycloidControlsInfo, crossArchEdgeDepthInfo, crossSectionStationInfo, flatPlatformInfo, troughPositionInfo } from '../../ceruti-helpers';

@Component({
  selector: 'app-ceruti-cross-arching-panel',
  imports: [FormsModule],
  templateUrl: './cross-arching-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CrossArchingPanel {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  @Output() changed = new EventEmitter<void>();

  protected readonly crossSectionStationInfo = crossSectionStationInfo;
  protected readonly crossArchCycloidControlsInfo = crossArchCycloidControlsInfo;
  protected readonly crossArchEdgeDepthInfo = crossArchEdgeDepthInfo;
  protected readonly troughPositionInfo = troughPositionInfo;
  protected readonly flatPlatformInfo = flatPlatformInfo;
  protected readonly archContoursInfo = archContoursInfo;



  get arching(): ArchingParams { return this.params.arching!; }
  get topCross(): CrossArchParams { return this.arching.top.cross!; }
  get topFluting(): FlutingChannelParams { return this.arching.top.fluting!; }
  get backCross(): CrossArchParams { return this.arching.bottom.cross!; }
  get backFluting(): FlutingChannelParams { return this.arching.bottom.fluting!; }

  get topCrossPercent(): number { return Math.round(this.topCross.pct * 100); }
  set topCrossPercent(v: number) {
    this.topCross.pct = Math.min(Math.max(v, 5), 100) / 100;
  }

  get backCrossPercent(): number { return Math.round(this.backCross.pct * 100); }
  set backCrossPercent(v: number) {
    this.backCross.pct = Math.min(Math.max(v, 5), 100) / 100;
  }

  onChange(): void { this.changed.emit(); }

  /**
   * Toggles a plate's overlay: clicking the active mode turns it off, clicking the
   * other mode switches to it. Only one plate may have an overlay at a time — the
   * costly contour/wireframe render is one-at-a-time across both plates, not just
   * within a single plate — so activating one clears the other plate's overlay.
   */
  togglePlateView(plate: 'top' | 'back', mode: PlateViewMode): void {
    const key = plate === 'top' ? 'topPlateView' : 'backPlateView';
    const otherKey = plate === 'top' ? 'backPlateView' : 'topPlateView';
    const next = this.flags[key] === mode ? 'none' : mode;
    this.flags[key] = next;
    if (next !== 'none') this.flags[otherKey] = 'none';
    this.onChange();
  }
}
