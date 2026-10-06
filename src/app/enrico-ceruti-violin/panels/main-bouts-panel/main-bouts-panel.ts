import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getArcEndDeg, getArcStartDeg, setArcEndDeg, setArcStartDeg } from '../../../helpers/math/arcDegrees';
import {
  flipAngleAboutYAxis, flipArcAboutY, offsetArcRadius,
} from '../../../helpers/math/simpleGeometry';
import { nearestFraction } from '../../../helpers/nearestFraction';
import {
  renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderSegment, renderSolveFailures,
} from '../../../helpers/renderFuncs';
import { arcFromCircle, Arc } from '../../../models/types';
import { calculateInnerOutline, calculateMainBouts, MainBoutFailure, violNeckJoinLimit } from '../../calculation/outline/ceruti-calcs';
import { error } from '../../../shared/message-emitter';
import { boutWidthInfo, violNeckInfo, violNeckJoinInfo } from '../field-info';
import { violNeckCap } from '../../calculation/outline/ceruti-paths';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey } from '../../ceruti-types';
import { renderBounds, renderBoutBouts } from '../../renders/guides.render';
import { renderFrontInnerProfile } from '../../renders/front-profile.render';
import { HighlightedArc, STROKE_WEIGHT } from '../../renders/render-constants';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';

export interface MainBoutsViewFlags {
  showModuleCircles: boolean;
  showAllCircles: boolean;
  showModuleArcs: boolean;
  showAllArcs: boolean;
  renderOuterPath: boolean;
}

@Component({
  selector: 'app-ceruti-main-bouts-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './main-bouts-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})

export class MainBoutsPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs', 'showModuleGuides', 'renderOuterPath'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly nearestFraction = nearestFraction;
  protected readonly boutWidthInfo = boutWidthInfo;
  protected readonly violNeckInfo = violNeckInfo;
  protected readonly violNeckJoinInfo = violNeckJoinInfo;
  protected readonly getArcStartDeg = getArcStartDeg;
  protected readonly setArcStartDeg = setArcStartDeg;
  protected readonly getArcEndDeg = getArcEndDeg;
  protected readonly setArcEndDeg = setArcEndDeg;

  private highlightedArc: Arc | null = null;
  private highlightedArcColor = '';

  private get highlighted(): HighlightedArc | null {
    return this.highlightedArc ? { arc: this.highlightedArc, color: this.highlightedArcColor } : null;
  }

  ngOnInit(): void {
    // When the panel is shown, emit one initial render request so the parent
    // does not need to import panel-specific bootstrap helpers.
    this.emitImmediate(true);
  }

  onChange(): void {
    this.reportViolNeckJoin();
    this.emitDebounced(true);
  }

  /**
   * The neck can be driven wider than the upper bout can receive, and the outline doubles back
   * on itself rather than failing — see `violNeckJoinLimit`. Reported rather than clamped: five
   * fields feed it and any of them is a legitimate thing to have just changed, so which one to
   * pull back is the maker's call. Messages dedupe by title, so this replaces itself as the
   * number is dragged rather than stacking.
   */
  private reportViolNeckJoin(): void {
    const join = violNeckJoinLimit(this.params);
    if (!join || join.headroom >= 0) return;

    error(
      `The neck reaches ${(-join.headroom).toFixed(1)}mm further than the upper bout can recieve, ` +
      `so U0 doubles back to meet U1, this should look pretty weird.\n\n` +
      `You have some options. Narrow the neck, shorten V0's radius, or lower V0s end angle. Play with it, I'm sure you'll figure it out.` +
      `Widening the upper bout or shrinking U1 also buys room.`,
      'Viol Neck Join',
    );
  }

  onArcFocus(arc: Arc, color: string): void {
    this.highlightedArc = arc;
    this.highlightedArcColor = color;
    this.emitImmediate(false);
  }

  onArcBlur(): void {
    this.highlightedArc = null;
    this.highlightedArcColor = '';
    this.emitImmediate(false);
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    const f = this.flags;
    const c = this.colors;
    const highlighted = this.highlighted;

    const failures = calculateMainBouts(p);
    // the rib outline as far as it's been drafted, under this panel's own work
    const profile = failures.length ? [] : renderFrontInnerProfile(p, c, calculateInnerOutline(p));
    return [
      ...profile,
      renderBounds(p, f.showModuleGuides),
      renderBoutBouts(p, c, f.showModuleGuides),
      renderMainBouts(p, c, f, true, highlighted, failures),
      renderSolveFailures(failures, c.pathError, true),
    ];
  }
}

/**
 * Where the neck meets its top face at one offset: the join arc, mirrored, and the face itself.
 *
 * Both are derived rather than authored — no field places them — so they draw plain even in the
 * module view, which is also where the join is worth seeing. At a join radius of 0 there is no
 * inner arc to draw: the rib corner is sharp, and only the offsets round it.
 */
const renderViolNeckJoin = (p: EnricoCerutiParams, d: number, color: string) => (g: any, ui: any): void => {
  const cap = violNeckCap(p, d);
  if (!cap) return;

  if (cap.fillet) {
    renderArcFromArc(cap.fillet, color, STROKE_WEIGHT.trace)(g, ui);
    renderArcFromArc(flipArcAboutY(cap.fillet), color, STROKE_WEIGHT.trace)(g, ui);
  }

  renderSegment({ x: cap.topX, y: cap.topY }, { x: -cap.topX, y: cap.topY }, color, STROKE_WEIGHT.trace)(g, ui);
};

/**
 * The whole neck at one offset — V0 trimmed back to the join, then the join itself.
 *
 * Goes through `violNeckCap` rather than drawing the raw V0 offset, so this preview shows the
 * same join the outer trace will, which is the point of a Join Radius field living on this panel.
 */
const renderViolNeck = (p: EnricoCerutiParams, d: number, color: string) => (g: any, ui: any): void => {
  const cap = violNeckCap(p, d);
  if (!cap) return;

  const V0 = offsetArcRadius(p.viol.V0!, -d);
  V0.start = cap.v0Start;
  renderArcFromArc(V0, color, STROKE_WEIGHT.trace)(g, ui);
  renderArcFromArc(flipArcAboutY(V0), color, STROKE_WEIGHT.trace)(g, ui);

  renderViolNeckJoin(p, d, color)(g, ui);
};

export const renderMainBouts = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  flags: MainBoutsViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
  failures: MainBoutFailure[] = [],
) => (g: any, ui: any): void => {
  const p = params;
  const inset = p.overhang + p.rib;
  const upper = !failures.some(f => f.unsolved.includes('U0'));
  const lower = !failures.some(f => f.unsolved.includes('L0'));

  if (highlighted) {
    renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
    renderArcHalo(flipArcAboutY(highlighted.arc), highlighted.color)(g, ui);
  }

  const wideTopArc = arcFromCircle(p.bouts.U0!, flipAngleAboutYAxis(p.bouts.U0!.end), p.bouts.U0!.end);
  const wideBottomArc = arcFromCircle(p.bouts.L0!, flipAngleAboutYAxis(p.bouts.L0!.end), p.bouts.L0!.end);
  const mirroredU1Arc = flipArcAboutY(p.bouts.U1!);
  const mirroredL1Arc = flipArcAboutY(p.bouts.L1!);

  if ((currentModule && flags.showModuleCircles) || flags.showAllCircles) {
    if (upper) {
      renderCircle(p.bouts.U0!, colors.upperBout)(g, ui);
      renderCircle(p.bouts.U1!, colors.upperBout, true)(g, ui);
    }
    if (lower) {
      renderCircle(p.bouts.L1!, colors.lowerBout, true)(g, ui);
      renderCircle(p.bouts.L0!, colors.lowerBout)(g, ui);
    }
  }

  if ((currentModule && flags.showModuleArcs) || flags.showAllArcs) {
    if (params.options.useViolNeck) {
      const mirrorV0 = flipArcAboutY(p.viol.V0!);
      renderArcFromArcFancy(p.viol.V0!, colors.violNeck)(g, ui);
      renderArcFromArcFancy(mirrorV0, colors.violNeck)(g, ui);
      // V0 draws in full: it is seated against the join, so its start is the tangency and there
      // is nothing for the join to trim off
      renderViolNeckJoin(p, 0, colors.violNeck)(g, ui);
    }

    if (upper) {
      if (params.options.useViolNeck) {
        renderArcFromArcFancy(p.bouts.U0!, colors.upperBout)(g, ui);
        renderArcFromArcFancy(flipArcAboutY(p.bouts.U0!), colors.upperBout)(g, ui);
      } else {
        renderArcFromArcFancy(wideTopArc, colors.upperBout)(g, ui);
      }
      renderArcFromArcFancy(p.bouts.U1!, colors.upperBoutOff)(g, ui);
      renderArcFromArcFancy(mirroredU1Arc, colors.upperBoutOff)(g, ui);
    }

    if (lower) {
      renderArcFromArcFancy(wideBottomArc, colors.lowerBout)(g, ui);
      renderArcFromArcFancy(p.bouts.L1!, colors.lowerBoutOff)(g, ui);
      renderArcFromArcFancy(mirroredL1Arc, colors.lowerBoutOff)(g, ui);
    }
  } else {
    // in their own colours on this panel, where their fields are; grey under a later panel's work
    const top = currentModule ? colors.upperBout : colors.innerTrace;
    const topOff = currentModule ? colors.upperBoutOff : colors.innerTrace;
    const bottom = currentModule ? colors.lowerBout : colors.innerTrace;
    const bottomOff = currentModule ? colors.lowerBoutOff : colors.innerTrace;
    if (params.options.useViolNeck) renderViolNeck(p, 0, currentModule ? colors.violNeck : colors.innerTrace)(g, ui);

    if (upper) {
      if (params.options.useViolNeck) {
        renderArcFromArc(p.bouts.U0!, top, STROKE_WEIGHT.trace)(g, ui);
        renderArcFromArc(flipArcAboutY(p.bouts.U0!), top, STROKE_WEIGHT.trace)(g, ui);
      } else {
        renderArcFromArc(wideTopArc, top, STROKE_WEIGHT.trace)(g, ui);
      }
      renderArcFromArc(p.bouts.U1!, topOff, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(mirroredU1Arc, topOff, STROKE_WEIGHT.trace)(g, ui);
    }

    if (lower) {
      renderArcFromArc(wideBottomArc, bottom, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(p.bouts.L1!, bottomOff, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(mirroredL1Arc, bottomOff, STROKE_WEIGHT.trace)(g, ui);
    }
  }

  if (flags.renderOuterPath) {
    const outerTopColor = currentModule ? colors.upperBout : colors.outerTrace;
    const outerTopOffColor = currentModule ? colors.upperBoutOff : colors.outerTrace;
    const outerBotColor = currentModule ? colors.lowerBout : colors.outerTrace;
    const outerBotOffColor = currentModule ? colors.lowerBoutOff : colors.outerTrace;
    const violNeckColor = currentModule ? colors.violNeck : colors.outerTrace;
    if (params.options.useViolNeck) renderViolNeck(p, inset, violNeckColor)(g, ui);

    if (upper) {
      if (params.options.useViolNeck) {
        renderArcFromArc(offsetArcRadius(p.bouts.U0!, inset), outerTopColor, STROKE_WEIGHT.trace)(g, ui);
        renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.U0!), inset), outerTopColor, STROKE_WEIGHT.trace)(g, ui);
      } else {
        renderArcFromArc(offsetArcRadius(wideTopArc, inset), outerTopColor, STROKE_WEIGHT.trace)(g, ui);
      }
      renderArcFromArc(offsetArcRadius(p.bouts.U1!, inset), outerTopOffColor, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(offsetArcRadius(mirroredU1Arc, inset), outerTopOffColor, STROKE_WEIGHT.trace)(g, ui);
    }

    if (lower) {
      renderArcFromArc(offsetArcRadius(wideBottomArc, inset), outerBotColor, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(offsetArcRadius(p.bouts.L1!, inset), outerBotOffColor, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(offsetArcRadius(mirroredL1Arc, inset), outerBotOffColor, STROKE_WEIGHT.trace)(g, ui);
    }
  }
};
