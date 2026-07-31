import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderFilledPath, renderPath } from '../../../helpers/renderFuncs';
import { translatePath } from '../../../helpers/svgPathMath';
import { calculateOuterArcs } from '../../ceruti-calcs';
import { defineOuterPath } from '../../ceruti-paths';
import { ArchingParams, CerutiColors, CerutiViewFlags, EnricoCerutiParams, GougedFlutingParams } from '../../ceruti-types';
import { defaultArchingParams } from '../../ceruti-arching';
import {
  channelSwing, ClassicChannelSample, classicChannelProfile, cornerGougeOn, defaultGougedFlutingParams,
  diagnosticRibbonPath, effectiveCBoutSweep, gougedChannelAreaPath, gougedChannelPaths,
  gougedCornerJoinAreaPath, gougeHalfWidth, plateLayoutOffset,
} from '../../ceruti-gouged';
import {
  classicChannelDiagnosticInfo, cornerGougeInfo, gougeCenterlineInfo, gougeSectionInfo,
} from '../../ceruti-helpers';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

/** Ribbon height (mm) for the diagnostic overlay — big enough to read, small enough not to swamp the plan view. */
const DIAGNOSTIC_AMPLITUDE = 14;

/**
 * Step one of the gouged model: carve the channel. It comes first because
 * that's the order at the bench — the channel is cut at constant section
 * before any arching exists to derive it from, which is exactly the dependency
 * the classic model has backwards.
 *
 * Nothing here reads or writes the classic `fluting`/`cross` params, so the
 * two models can be flipped between freely for comparison.
 */
@Component({
  selector: 'app-ceruti-gouged-fluting-panel',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './gouged-fluting-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class GougedFlutingPanel extends CerutiPanelBase implements OnInit {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly gougeSectionInfo = gougeSectionInfo;
  protected readonly gougeCenterlineInfo = gougeCenterlineInfo;
  protected readonly classicChannelDiagnosticInfo = classicChannelDiagnosticInfo;
  protected readonly cornerGougeInfo = cornerGougeInfo;

  /**
   * Panel-local, not a shared view flag: the diagnostic describes the *classic*
   * model and is only meaningful while standing in this panel deciding whether
   * the gouged one earns itself.
   */
  showDiagnostic = false;
  diagnosticPlate: 'top' | 'bottom' = 'top';

  /** Filled in by buildRun so the template can report the swing numerically. */
  diagnosticWidth: { min: number; max: number; ratio: number } | null = null;
  diagnosticRadius: { min: number; max: number; ratio: number } | null = null;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  /** A toggle is something the user watches happen, so it redraws without waiting on the debounce. */
  onToggle(): void {
    this.emitImmediate();
  }

  get arching(): ArchingParams { return this.params.arching!; }

  gouge(plate: 'top' | 'bottom'): GougedFlutingParams {
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    return (plateParams.gougedFluting ??= defaultGougedFlutingParams(this.params));
  }

  /** The cut's width at the set depth — derived from the tool, so read-only. */
  channelWidth(plate: 'top' | 'bottom'): number {
    const g = this.gouge(plate);
    return 2 * gougeHalfWidth(g.sweepRadius, g.depth);
  }

  /** The same through the C-bout, where a second gouge may be in force. */
  channelWidthCBout(plate: 'top' | 'bottom'): number {
    const g = this.gouge(plate);
    return 2 * gougeHalfWidth(effectiveCBoutSweep(g), g.depth);
  }

  /** Whether the corner pass is cutting on this plate. */
  cornerGouge(plate: 'top' | 'bottom'): boolean {
    return cornerGougeOn(this.gouge(plate));
  }

  setCornerGouge(plate: 'top' | 'bottom', on: boolean): void {
    this.gouge(plate).cornerGouge = on;
    this.onToggle();
  }

  /** Whether a distinct C-bout gouge is actually in force (set, and able to cut to depth). */
  hasCBoutGouge(plate: 'top' | 'bottom'): boolean {
    const g = this.gouge(plate);
    return g.sweepRadius_cBout !== null && effectiveCBoutSweep(g) !== g.sweepRadius;
  }

  /**
   * Where the channel's inner edge falls, mm from the plate edge. This is the
   * gouged model's answer to the classic `innerFlutingDepth` — an output rather
   * than an input, which is the whole point of anchoring the channel to the
   * land.
   */
  innerEdgeOffset(plate: 'top' | 'bottom'): number {
    return (this.params.outerFlutingDepth ?? 0) + this.channelWidth(plate);
  }

  innerEdgeOffsetCBout(plate: 'top' | 'bottom'): number {
    return (this.params.outerFlutingDepth ?? 0) + this.channelWidthCBout(plate);
  }

  /**
   * A narrower gouge for the waist. Only the sweep varies — same land edge,
   * same depth — so the channel keeps its outer line and pulls its inner edge
   * back. Blank clears the override. Held above the depth, since a gouge cannot
   * cut deeper than it is curved.
   */
  setSweepRadiusCBout(plate: 'top' | 'bottom', mm: number | null): void {
    const g = this.gouge(plate);
    const raw = mm === null || mm === undefined || (mm as unknown as string) === '' ? null : Number(mm);
    g.sweepRadius_cBout = raw === null || !Number.isFinite(raw)
      ? null
      : Math.max(raw, g.depth / 0.9);
    this.onChange();
  }

  /**
   * A gouge can only cut to its own sweep radius, and the width formula goes
   * imaginary past that. Holding depth below the radius keeps the section real
   * without needing the panel to explain the constraint.
   */
  setDepth(plate: 'top' | 'bottom', mm: number): void {
    const g = this.gouge(plate);
    g.depth = Math.min(Math.max(mm || 0, 0), g.sweepRadius * 0.9);
    this.onChange();
  }

  setSweepRadius(plate: 'top' | 'bottom', mm: number): void {
    const g = this.gouge(plate);
    g.sweepRadius = Math.max(mm || 0, 0.1);
    if (g.depth > g.sweepRadius * 0.9) g.depth = g.sweepRadius * 0.9;
    this.onChange();
  }

  /**
   * The channel's outer edge, shared by both plates because it is the edge of
   * the flat land — a property of the outline and the purfling, not of either
   * gouge. Lives in `params` alongside the other Outer Path measurements; this
   * panel edits it here only because it is the number the channel is anchored
   * to and is useless to set out of sight of the result.
   */
  setLandEdge(mm: number): void {
    this.params.outerFlutingDepth = Math.max(mm || 0, 0);
    this.onChange();
  }

  protected buildRun(): RenderLayer[] {
    this.params.arching ??= defaultArchingParams(this.params.height);
    // The channel offsets are taken off the outer arcs, which must be current.
    calculateOuterArcs(this.params);

    const renders: RenderLayer[] = [];
    // Side by side rather than superimposed: the two plates carry different
    // gouges, and stacking them buries whichever is drawn first. Top right,
    // back left, mirroring how a pair of plates sits on the bench.
    for (const plate of ['top', 'bottom'] as const) {
      renders.push(...this.plateLayers(plate, plateLayoutOffset(this.params, plate)));
    }
    return renders;
  }

  /** One plate's channel, shifted into its own half of the view. */
  private plateLayers(plate: 'top' | 'bottom', dx: number): RenderLayer[] {
    const at = (path: string): string => translatePath(path, dx, 0);
    const color = plate === 'top' ? this.colors.archTop : this.colors.archBack;
    const layers: RenderLayer[] = [
      renderPath(at(defineOuterPath(this.params, undefined, true, plate === 'bottom')), this.colors.outerTrace, 1),
    ];

    const paths = gougedChannelPaths(this.params, this.gouge(plate));
    if (!paths) return layers;

    // Areas rather than outlines: the channel and the corner-join land are
    // regions of the plate, and a maker reads them as regions. Both are
    // even-odd fills between two loops, so neither needs a tolerance or a
    // sampled boundary test.
    //
    // With the corner pass running, that region is carved rather than left, so
    // it reads as channel. It understates the cut slightly — the second pass
    // also takes wood from inside the channel's own outer edge, which this
    // region by definition excludes — so it marks what the corner pass is *for*
    // rather than tracing its exact footprint.
    const cornerCarved = cornerGougeOn(this.gouge(plate));
    layers.push(renderFilledPath(
      at(gougedCornerJoinAreaPath(this.params, paths)),
      cornerCarved ? this.colors.fluting : this.colors.centerBoutUp,
      cornerCarved ? 0.45 : 0.3,
    ));
    layers.push(renderFilledPath(at(gougedChannelAreaPath(paths)), this.colors.fluting, 0.45));
    layers.push(renderPath(at(paths.outer), color, 1));
    layers.push(renderPath(at(paths.inner), color, 1));

    if (this.showDiagnostic && this.diagnosticPlate === plate) {
      layers.push(...this.diagnosticLayers(classicChannelProfile(this.params, plate), dx));
    }
    return layers;
  }

  /** Two ribbons — annulus width and the sweep radius it forces — plus their swing read-outs. */
  private diagnosticLayers(samples: ClassicChannelSample[], dx: number): RenderLayer[] {
    if (!samples.length) return [];
    const widths = samples.map(s => s.width);
    const radii = samples.map(s => s.radius);
    this.diagnosticWidth = channelSwing(widths);
    this.diagnosticRadius = channelSwing(radii);

    const layers: RenderLayer[] = [];
    const radiusPath = diagnosticRibbonPath(samples, radii, DIAGNOSTIC_AMPLITUDE);
    if (radiusPath) layers.push(renderFilledPath(translatePath(radiusPath, dx, 0), this.colors.centerBoutLow, 0.35, 'nonzero'));
    const widthPath = diagnosticRibbonPath(samples, widths, DIAGNOSTIC_AMPLITUDE);
    if (widthPath) layers.push(renderPath(translatePath(widthPath, dx, 0), this.colors.innerTrace, 1));
    return layers;
  }
}
