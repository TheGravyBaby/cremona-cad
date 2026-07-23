import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArchingParams, CerutiColors, CerutiViewFlags, CrossArchParams, EnricoCerutiParams, FlutingChannelParams, PlateViewMode } from '../../ceruti-types';
import { archContoursInfo, crossArchCycloidControlsInfo, crossArchEdgeDepthInfo, crossSectionStationInfo, flatPlatformInfo } from '../../ceruti-helpers';
import { defaultArchingParams, defaultCrossArchParams, defaultFlutingChannelParams } from '../../ceruti-arching';
import { CrossArchingSceneBuilder } from './cross-arching-scene';
import { CrossArchingRotationController } from './cross-arching-rotation-controller';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

@Component({
  selector: 'app-ceruti-cross-arching-panel',
  imports: [FormsModule],
  templateUrl: './cross-arching-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CrossArchingPanel extends CerutiPanelBase implements OnInit, OnDestroy {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  private readonly scene = new CrossArchingSceneBuilder();
  private rotation: CrossArchingRotationController | null = null;

  protected readonly crossSectionStationInfo = crossSectionStationInfo;
  protected readonly crossArchCycloidControlsInfo = crossArchCycloidControlsInfo;
  protected readonly crossArchEdgeDepthInfo = crossArchEdgeDepthInfo;
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

  ngOnInit(): void {
    this.rotation = new CrossArchingRotationController(
      this.flags,
      () => this.emitDragRefresh(),
    );
    this.emitImmediate();
  }

  ngOnDestroy(): void {
    this.rotation?.dispose();
  }

  onChange(): void {
    this.emitDebounced();
  }

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

  private emitDragRefresh(): void {
    this.emitImmediate(false, false);
  }

  private ensureCrossArchingState(): void {
    if (!this.params.arching) {
      this.params.arching = defaultArchingParams(this.params.height);
    }
    const a = this.params.arching;
    for (const plate of [a.top, a.bottom]) {
      plate.cross ??= defaultCrossArchParams();
      // Older recipes carry a cross block without the cycloid window; backfill it.
      plate.cross.pct ??= defaultCrossArchParams().pct;
      plate.fluting ??= defaultFlutingChannelParams();
    }

    // Station is ephemeral view state; default to c-bout waist on first open.
    this.flags.crossSectionY ??= Math.round(this.params.bouts.C0?.y ?? this.params.height / 2);
  }

  protected buildRun(): RenderLayer[] {
    this.ensureCrossArchingState();
    return this.scene.build(
      {
        params: this.params,
        viewFlags: this.flags,
        colors: this.colors,
      },
      {
        active: this.rotation?.isDragging ?? false,
        onPointerDown: this.rotation?.onPointerDown ?? (() => {}),
      },
    );
  }
}
