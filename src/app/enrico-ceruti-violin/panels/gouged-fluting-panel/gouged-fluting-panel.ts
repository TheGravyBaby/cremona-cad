import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderFilledPath, renderPath } from '../../../helpers/renderFuncs';
import { translatePath } from '../../../helpers/svgPathMath';
import { calculateOuterArcs } from '../../ceruti-calcs';
import { defineOuterPath, defineOuterPurflingPath, definePurflingPath } from '../../ceruti-paths';
import { ArchingParams, CerutiColors, CerutiViewFlags, EnricoCerutiParams, GougedFlutingParams } from '../../ceruti-types';
import { defaultArchingParams } from '../../ceruti-arching';
import {
  cornerGougeOn, defaultGougedFlutingParams, effectiveCBoutSweep, gougedChannelAreaPath,
  gougedChannelPaths, gougedCornerJoinAreaPath, gougeHalfWidth, plateLayoutOffset,
} from '../../ceruti-gouged';
import {
  cornerGougeInfo, gougeCBoutInfo, gougeCenterlineInfo, gougeSectionInfo,
} from '../../ceruti-helpers';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

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
  protected readonly gougeCBoutInfo = gougeCBoutInfo;
  protected readonly gougeCenterlineInfo = gougeCenterlineInfo;
  protected readonly cornerGougeInfo = cornerGougeInfo;

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

  /**
   * One toggle for both plates. The corners are gouged out at the bench in a
   * single operation with the plate in front of you either way, so a top that
   * had them and a back that didn't would be describing two different methods
   * rather than two different tools. Reads as on if either plate has it, so an
   * older recipe with only one set doesn't quietly lose the cut.
   */
  get cornerGouge(): boolean {
    return cornerGougeOn(this.gouge('top')) || cornerGougeOn(this.gouge('bottom'));
  }

  setCornerGouge(on: boolean): void {
    this.gouge('top').cornerGouge = on;
    this.gouge('bottom').cornerGouge = on;
    this.onToggle();
  }

  /** Whether a second gouge is set for the waist at all. */
  cBoutGouge(plate: 'top' | 'bottom'): boolean {
    return this.gouge(plate).sweepRadius_cBout !== null;
  }

  /** Turning it on seeds from the main sweep, so the channel doesn't jump before it's dialled. */
  setCBoutGouge(plate: 'top' | 'bottom', on: boolean): void {
    const g = this.gouge(plate);
    g.sweepRadius_cBout = on ? g.sweepRadius : null;
    this.onToggle();
  }

  /**
   * A narrower gouge for the waist. Only the sweep varies — same land edge,
   * same depth — so the channel keeps its outer line and pulls its inner edge
   * back. Held above the depth, since a gouge cannot cut deeper than it is
   * curved.
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
    const inset = this.params.overhang + this.params.rib;
    const layers: RenderLayer[] = [
      renderPath(at(defineOuterPath(this.params, undefined, true, plate === 'bottom')), this.colors.outerTrace, 1),
    ];

    // Cosmetic only — nothing here reads the purfling. It is drawn because the
    // land edge below is set *against* it at the bench, so seeing the two
    // together is how you tell whether the channel starts where it should.
    // Both lines come from the Outer Path panel's own path functions rather
    // than a copy, so they cannot drift from what that panel shows.
    for (const purfling of [definePurflingPath(this.params, inset), defineOuterPurflingPath(this.params, inset)]) {
      if (purfling) layers.push(renderPath(at(purfling), this.colors.innerTrace, 1));
    }

    const paths = gougedChannelPaths(this.params, this.gouge(plate));
    if (!paths) return layers;

    // Areas rather than outlines: the channel and the corner-join land are
    // regions of the plate, and a maker reads them as regions. Both are
    // even-odd fills between two loops, so neither needs a tolerance or a
    // sampled boundary test. Each plate carries its own colour so a top and a
    // back with different gouges can be told apart at a glance.
    //
    // With the pass on, the corner region is the channel — same tool, same
    // depth, just anchored to the land edge instead — so it is drawn as the
    // channel, with no weight of its own to suggest otherwise. Off, it drops
    // back to marking wood that is being left rather than taken. It understates
    // the cut either way: the pass also takes wood from inside the channel's
    // own outer edge, which this region by definition excludes.
    const carved = cornerGougeOn(this.gouge(plate));
    layers.push(renderFilledPath(
      at(gougedCornerJoinAreaPath(this.params, paths)),
      color,
      carved ? 0.3 : 0.2,
    ));
    layers.push(renderFilledPath(at(gougedChannelAreaPath(paths)), color, 0.3));
    return layers;
  }
}
