import { Component, HostListener, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { error, warn } from '../shared/message-emitter';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Circle } from '../models/types';
import { greyOut, renderCircle, renderCircleAngleIndicator, renderCrosshair, renderDashedLine, renderDashLine, renderDistanceMeasurementLine, renderPath, renderRect } from '../helpers/renderFuncs';
import { combinePathStrings } from '../helpers/draftMath';
import { KellyViolinData, KellyViolinRecipe } from './kellyTypes';
import { calculatePrimaryShapes, calculateMainPathsSegmented, calculateMainPathsUnified, calculateMouldPath, calculateOffsetPathsSegments, calculateTopPath, initializeMainBouts, initializeMinorBouts, initializeCornerPlacement, initializeCornerCircles, initializeTopAndBottomTrace, initializeBlocks, normalizeDegrees, calculateMainBouts } from './kellyCals';
import { clampParam, safeRun } from '../helpers/validators';

@Component({
  selector: 'app-kelly-violin',
  imports: [FormsModule],
  templateUrl: './kelly-violin.html',
  styleUrls: ['../sidebar.css', './kelly-violin.css']
})

export class KellyViolin extends RecipeComponentBase {

  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _skipDebounce = false;

  @HostListener('keydown', ['$event'])
  onHostKeyDown(e: KeyboardEvent) {
    this._skipDebounce = e.key === 'ArrowUp' || e.key === 'ArrowDown';
  }

  @HostListener('mousedown', ['$event'])
  onHostMouseDown(e: MouseEvent) {
    const target = e.target as HTMLInputElement;
    this._skipDebounce = target.tagName === 'INPUT' && target.type === 'number';
  }

  private debounce(fn: () => void, delay = 1000): void {
    if (this._skipDebounce) {
      this._skipDebounce = false;
      fn();
      return;
    }
    if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      fn();
    }, delay);
  }

  private clamp(key: keyof typeof this.d.params, min: number, max = Infinity, tooSmallMsg?: string, tooBigMsg?: string): void {
    clampParam(this.d.params, key, min, max, tooSmallMsg, tooBigMsg);
  }

  override openPanel = 'base';
  override d: KellyViolinData = new KellyViolinRecipe();

  showGuideLines = true;
  showAllCircles = true;
  showModuleCircles = false;
  showOuterCircles = false;
  showInnerCircles = true;
  showAngleIndicators = true;
  showCutoffIndicators = true;
  viewOuterPathExport = true;
  viewInnerPathExport = false;
  viewMouldExport = false;
  viewSegmentedOuter = false;
  viewSegmentedInnerPartial = false;

  userConfirmedHeight = 0;


  offFactor = .4;
  off2Factor = .6;
  readonly colors = {
    upperBout: '#4D8660',
    upperBoutOff: greyOut('#4D8660', this.offFactor), // '#6DA077',
    upperBoutOff2: greyOut('#4D8660', this.off2Factor), // '#97a49aff',
    centerBoutUp: '#C24B2E',
    centerBoutUpOff: greyOut('#C24B2E', this.offFactor), //'#E08A6B',
    centerBoutUpOff2: greyOut('#C24B2E', this.off2Factor), //'#dea793ff',
    centerBout: '#A97645',
    centerBoutOff: greyOut('#A97645', this.offFactor), //'#BC9368',
    centerBoutOff2: greyOut('#A97645', this.off2Factor), //'#bdab99ff',
    centerBoutLow: '#B8873A',
    centerBoutLowOff: greyOut('#B8873A', this.offFactor), //'#D6AA5F',
    centerBoutLowOff2: greyOut('#B8873A', this.off2Factor), //'#d2bb93ff',
    lowerBout: '#4D74A8',
    lowerBoutOff: greyOut('#4D74A8', this.offFactor), //'#7ba4dbff',
    lowerBoutOff2: greyOut('#4D74A8', this.off2Factor), //'#a6bcd9ff',
    innerTrace: '#a47272ff',
    outerTrace: '#b37f7fff',
    mouldTrace: '#83947fff',
  }

  insetTooltip = "Inset is the distance from the outer edge of the bounding box to inner edge. It can be used to create a margin for the outline of the violin.";

  @Input() set newFile(v: boolean) {
    if (v) {
      this.openPanel = 'base'
      let data = new KellyViolinRecipe()
      data.newFile()
      this.d = data;
      this.draftChange.emit([this.firstRender]);
      this.referenceImageChange.emit(null);
    }
  }

  override firstRender = (g: any, ui: any): void => {
    this.renderBounds(g, ui);
    this.setBounds.emit({ pt1: { x: -this.d.params.width / 2, y: 0 }, pt2: { x: this.d.params.width / 2, y: this.d.params.height } });
  }

  isPanelEnabled(panel: string): boolean {
    switch (panel) {
      case 'base':
        return true;
      case 'mainBouts':
        return this.hasBaseMeasurements();
      case 'minorBouts':
        return this.hasMajorBouts();
      case 'cornerPlacement':
        return this.hasMinorBouts();
      case 'cornerCircles':
        return this.hasCornerPlacement();
      case 'topAndBottom':
        return this.hasCornerCircles();
      case 'mouldPattern':
        return this.hasCornerCircles();
      case 'export':
        return this.hasTopAndBottom() && this.hasMouldPattern();
      default:
        return true;
    }
  }

  private hasBaseMeasurements(): boolean {
    return this.d.params.width > 0 && this.d.params.height > 0 && this.d.params.inset >= 0;
  }

  private hasMajorBouts(): boolean {
    const p = this.d.params;
    return p.boutUpR > 0 && p.boutUpY > 0 && p.boutCenR > 0 && p.boutLowR > 0 && p.boutLowY > 0;
  }

  private hasMinorBouts(): boolean {
    return this.hasMajorBouts() && this.d.params.vesaciUpR > 0 && this.d.params.vesaciLowR > 0;
  }

  private hasCornerPlacement(): boolean {
    return this.hasMinorBouts() && this.d.params.cornerR > 0 && this.d.params.cornerGuideUpY > 0 && this.d.params.cornerGuideLowY > 0;
  }

  private hasCornerCircles(): boolean {
    const p = this.d.params;
    return this.hasCornerPlacement()
      && p.cornerCircUpBoutR > 0
      && p.cornerCircUpCBoutR > 0
      && p.cornerCircLowCBoutR > 0
      && p.cornerCircLowBoutR > 0;
  }

  private hasTopAndBottom(): boolean {
    return this.hasCornerCircles() && this.d.params.cornerCircDubLowBoutR > 0;
  }

  private hasMouldPattern(): boolean {
    return this.hasTopAndBottom() && this.d.params.blockCornerH > 0;
  }

  override onToggle(panel: string, ev: Event) {
    this._skipDebounce = true;
    const details = ev.target as HTMLDetailsElement;

    if (!this.isPanelEnabled(panel)) {
      details.open = false;
      if (this.openPanel === panel) this.openPanel = '';
      return;
    }

    this.showModuleCircles = true;
    this.showAllCircles = false;

    if (details.open) {
      // opened -> make it the active panel and render it
      this.openPanel = panel;
      if (panel === 'base') this.changeBaseMeasurements();
      else if (panel === 'mainBouts') this.changeMainBouts();
      else if (panel === 'minorBouts') this.changeMinorBouts();
      else if (panel === 'cornerPlacement') this.changeCornerPlacement();
      else if (panel === 'cornerCircles') this.changeCornerCircles();
      else if (panel === 'topAndBottom') this.changeTopAndBottom();
      else if (panel === 'mouldPattern') this.changeMouldPattern();
      else if (panel === 'export') this.renderExports();

      else {
        // closed -> check if any panel is still open
        const anyOpen = Array.from(document.querySelectorAll('details')).some(d => d.open);
        if (!anyOpen) {
          this.openPanel = '';
          this.draftChange.emit([]);
        }
      }
    }
  }


  changeBaseMeasurements(): void {
    this.debounce(() => safeRun(() => {
      this.clamp('width', 10, 1000,
        "Even a 1/32 violin is wider than that  — width reset to 10mm.",
        "Wider than an upright bass? Let's be reasonable — width reset to 1000mm.");
      this.clamp('height', 100, 3800,
        "Trying to make the worlds smallest violin?— height reset to 100mm.",
        "An octobase is only 3800mm body length. Are you designing furniture? Height reset to 3800mm.");
      this.clamp('inset', 1, 10,
        "Inset must be at least 1mm — reset to 1mm.",
        "An inset of 10mm is already generous — reset to 10mm.");
      this.setBounds.emit({ pt1: { x: -this.d.params.width / 2, y: 0 }, pt2: { x: this.d.params.width / 2, y: this.d.params.height } });
      this.draftChange.emit([this.renderBounds]);
      this.userConfirmedHeight = this.d.params.height;
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  changeMainBouts() {
    this.debounce(() => safeRun(() => {
      initializeMainBouts(this.d)
      this.clamp('boutUpR', 5, 1000,
        "An upper bout that narrow? Even a pochette is bigger — reset to 5mm.",
        "That upper bout is wider than the whole violin body. Settle down — reset to 1000mm");
      this.clamp('boutLowR', 5, 1000,
        "Lower bout radius too small — reset to 5mm.",
        "A lower bout that wide would need its own zip code — reset to 1000mm.");
      this.clamp('boutCenR', 5, 1000,
        "Center bout radius too small — reset to 5mm.",
        "A center bout that large? That's not a waist, that's a barrel — reset to 1000mm.");
      this.clamp('boutUpY', 1, 3800,
        "Upper bout Y must be at least 1mm — reset to 1mm.",
        "Upper bout Y exceeds the max body length — reset to 3800mm.");
      this.clamp('boutLowY', 1, 3800,
        "Lower bout Y must be at least 1mm — reset to 1mm.",
        "Lower bout Y exceeds the max body length — reset to 3800mm.");

      let upBoutDiff = (this.d.params.height - this.d.params.inset) - (this.d.params.boutUpY + this.d.params.boutUpR)
      let lowBoutDiff = (this.d.params.boutLowY - this.d.params.boutLowR) - this.d.params.inset
      if (upBoutDiff > -2) {
        this.d.params.height -= Math.abs(upBoutDiff);
        warn(`Upper bout won't fit within the current height. Adjusting height to ${this.d.params.height}mm.`, "Upper Bout Limit");
      }
      if (lowBoutDiff > -2) {
        this.d.params.height -= lowBoutDiff
        this.d.params.boutLowY -= lowBoutDiff;
        this.d.params.boutUpY -= lowBoutDiff;
        warn(`Lower bout won't fit within the current height. Adjusting height to ${this.d.params.height}mm.`, "Lower Bout Limit");
      }


      calculateMainBouts(this.d);
      this.draftChange.emit([this.renderBounds, this.renderMainBouts(true)]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  upperVLimit = Math.round(this.d.params.boutUpR * .9)
  lowerVLimit = Math.round(this.d.params.boutLowR * .9)
  changeMinorBouts() {
    this.debounce(() => safeRun(() => {
      initializeMinorBouts(this.d)
      this.clamp('vesaciUpR', 1, this.upperVLimit,
        "Upper vesaci radius must be at least 1mm — reset to 1mm.",
        `Upper vesaci must be smaller than the upper bout (reset to ${this.upperVLimit}mm).`);
      this.clamp('vesaciLowR', 1, this.lowerVLimit,
        "Lower vesaci radius must be at least 1mm — reset to 1mm.",
        `Lower vesaci must be smaller than the lower bout (reset to ${this.lowerVLimit}mm).`);

      let vesaciUpDiff = (this.d.params.height - this.d.params.inset) - (this.d.params.boutUpY + this.d.params.vesaciUpR)
      let upBoutDiff = (this.d.params.height - this.d.params.inset) - (this.d.params.boutUpY + this.d.params.boutUpR)
      if (vesaciUpDiff < 2) {
        let limitedDiff = Math.abs(vesaciUpDiff);
        limitedDiff > 0 && (this.d.params.height += limitedDiff);
        warn(`Upper vesaci won't fit within the current height. Adjusting height to ${this.d.params.height}mm.`, "Upper Vesaci Limit");
      }
      else if (upBoutDiff > 2) {
        this.d.params.height -= upBoutDiff
        warn(`Upper bout won't fit within the current height. Adjusting height to ${this.d.params.height}mm.`, "Upper Vesaci Limit");
      }

      let vesicaLowDiff = this.d.params.boutLowY - this.d.params.inset - this.d.params.vesaciLowR
      let lowBoutDiff = (this.d.params.boutLowY - this.d.params.boutLowR) - this.d.params.inset

      if (vesicaLowDiff < -1) {
        let limitedDiffLow = Math.abs(vesicaLowDiff);
        limitedDiffLow > 0 && (this.d.params.height += limitedDiffLow);
        limitedDiffLow > 0 && (this.d.params.boutLowY += limitedDiffLow);
        limitedDiffLow > 0 && (this.d.params.boutUpY += limitedDiffLow);
        limitedDiffLow > 0 && warn(`Lower vesaci won't fit within the current height. Adjusting height to ${this.d.params.height}mm.`, "Lower Vesaci Limit");
      }
      else if (lowBoutDiff > -2) {
        this.d.params.height -= lowBoutDiff
        this.d.params.boutLowY -= lowBoutDiff;
        this.d.params.boutUpY -= lowBoutDiff;
        warn(`Lower bout won't fit within the current height. Adjusting height to ${this.d.params.height}mm.`, "Lower Vesaci Limit");
      }

      calculatePrimaryShapes(this.d);
      this.draftChange.emit([this.renderBounds, this.renderMainBouts(false), this.renderMinorBouts(true), this.renderMainPathCornerless]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  changeCornerPlacement() {
    this.debounce(() => safeRun(() => {
      initializeCornerPlacement(this.d);
      calculatePrimaryShapes(this.d);
      this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(true), this.renderMainPathCornerless]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  changeCornerCircles() {
    this.debounce(() => safeRun(() => {
      initializeCornerCircles(this.d);
      calculatePrimaryShapes(this.d);
      this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(false), this.renderCornerCircles(true), this.renderMainPath]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  changeTopAndBottom() {
    this.debounce(() => safeRun(() => {
      this.d.params.cornerCircDubUpBoutTheta = normalizeDegrees(this.d.params.cornerCircDubUpBoutTheta);
      this.d.params.cornerCircDubUpCBoutTheta = normalizeDegrees(this.d.params.cornerCircDubUpCBoutTheta);
      this.d.params.cornerCircDubLowCBoutTheta = normalizeDegrees(this.d.params.cornerCircDubLowCBoutTheta);
      this.d.params.cornerCircDubLowBoutTheta = normalizeDegrees(this.d.params.cornerCircDubLowBoutTheta);
      this.d.params.cornerCircDubUpBoutCutoffTheta = normalizeDegrees(this.d.params.cornerCircDubUpBoutCutoffTheta);
      this.d.params.cornerCircleDubUpCBoutCutoffTheta = normalizeDegrees(this.d.params.cornerCircleDubUpCBoutCutoffTheta);
      this.d.params.cornerCircleDubLowCBoutTheta = normalizeDegrees(this.d.params.cornerCircleDubLowCBoutTheta);
      this.d.params.cornerCircleDubLowBoutTheta = normalizeDegrees(this.d.params.cornerCircleDubLowBoutTheta);

      initializeTopAndBottomTrace(this.d);
      calculatePrimaryShapes(this.d);
      calculateMainPathsSegmented(this.d);
      calculateOffsetPathsSegments(this.d);
      calculateTopPath(this.d);
      this.draftChange.emit([this.renderFinalCorners(true), this.renderMainPath, this.renderTopPath]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  changeMouldPattern(calcChange = true) {
    this.debounce(() => safeRun(() => {
      calcChange && initializeBlocks(this.d);
      calcChange && calculatePrimaryShapes(this.d);
      calcChange && calculateMouldPath(this.d);
      this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(false), this.renderCornerCircles(false), this.renderBlocks(true), this.renderMainPathWithBlocks]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  renderExports() {
    safeRun(() => {
      calculatePrimaryShapes(this.d);
      initializeBlocks(this.d)
      calculateMouldPath(this.d);
      calculateMainPathsSegmented(this.d);
      calculateOffsetPathsSegments(this.d);
      calculateTopPath(this.d);
      let emitArray = [];
      this.viewOuterPathExport && emitArray.push(this.renderTopPath);
      this.viewInnerPathExport && emitArray.push(this.renderMainPath);
      this.viewMouldExport && emitArray.push(this.renderMainPathWithBlocks);

      this.viewSegmentedOuter && emitArray.push((g: any, ui: any) => {
        this.d.paths.find(c => c.name === 'offsetSegmentedPath')?.paths.forEach(p => renderPath(p, 'purple')(g, ui));
      });
      this.viewSegmentedInnerPartial && emitArray.push((g: any, ui: any) => {
        this.d.paths.find(c => c.name === 'innerPath')?.paths.forEach(p => renderPath(p, 'orange')(g, ui));
      });

      this.draftChange.emit(emitArray);
    });
  }

  renderBounds = (g: any, ui: any): void => {
    const h = this.d.params.height;
    const w = this.d.params.width;
    const inset = this.d.params.inset;
    const xLeft = -w / 2;

    // bounding rect (above x-axis)
    g.append('rect')
      .attr('x', xLeft)
      .attr('y', 0)
      .attr('width', w)
      .attr('height', h)
      .attr('fill', 'none')
      .attr('stroke', 'grey')
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke');

    // inset rectangle
    g.append('rect')
      .attr('x', xLeft + inset)
      .attr('y', inset)
      .attr('width', w - 2 * inset)
      .attr('height', h - 2 * inset)
      .attr('fill', 'none')
      .attr('stroke', 'grey')
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke');

  }

  renderMainBouts = (currentModule: boolean) => (g: any, ui: any): void => {
    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(this.d.shapes.upperBout, this.colors.upperBout)(g, ui);
      renderCircle(this.d.shapes.lowerBout, this.colors.lowerBout)(g, ui);
      renderCircle(this.d.shapes.centerBoutLeft, this.colors.centerBout)(g, ui);
      renderCircle(this.d.shapes.centerBoutRight, this.colors.centerBout)(g, ui);
    }

    if (currentModule && this.showGuideLines) {
      let waistWidth = (this.d.shapes.centerBoutRight.x - this.d.params.boutCenR) * 2;
      let inset = this.d.params.inset;
      let insetWaist = waistWidth + 2 * inset;
      let insetLowerBout = this.d.params.boutLowR * 2 + 2 * inset;
      let insetUpperBout = this.d.params.boutUpR * 2 + 2 * inset;

      renderDistanceMeasurementLine({ x: -insetWaist / 2, y: this.d.shapes.centerBoutLeft.y }, { x: insetWaist / 2, y: this.d.shapes.centerBoutLeft.y }, insetWaist.toFixed(1) + " mm", this.colors.centerBout)(g, ui);
      renderDistanceMeasurementLine({ x: -insetLowerBout / 2, y: this.d.params.boutLowY }, { x: insetLowerBout / 2, y: this.d.params.boutLowY }, insetLowerBout.toFixed(1) + " mm", this.colors.lowerBout)(g, ui);
      renderDistanceMeasurementLine({ x: -insetUpperBout / 2, y: this.d.params.boutUpY }, { x: insetUpperBout / 2, y: this.d.params.boutUpY }, insetUpperBout.toFixed(1) + " mm", this.colors.upperBout)(g, ui);
      renderDashedLine({ x: -1000, y: this.d.shapes.centerBoutLeft.y }, { x: 1000, y: this.d.shapes.centerBoutLeft.y }, this.colors.centerBout)(g, ui);
      renderDashedLine({ x: -1000, y: this.d.params.boutLowY }, { x: 1000, y: this.d.params.boutLowY }, this.colors.lowerBout)(g, ui);
      renderDashedLine({ x: -1000, y: this.d.params.boutUpY }, { x: 1000, y: this.d.params.boutUpY }, this.colors.upperBout)(g, ui);
    }
  }

  renderMinorBouts = (currentModule: boolean) => (g: any, ui: any): void => {
    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(this.d.shapes.upperRightVesaci, this.colors.upperBoutOff)(g, ui);
      renderCircle(this.d.shapes.upperLeftVesaci, this.colors.upperBoutOff)(g, ui);
      renderCircle(this.d.shapes.upperJoiningCircle, this.colors.upperBoutOff)(g, ui);
      renderCircle(this.d.shapes.lowerRightVesaci, this.colors.lowerBoutOff)(g, ui);
      renderCircle(this.d.shapes.lowerLeftVesaci, this.colors.lowerBoutOff)(g, ui);
      renderCircle(this.d.shapes.lowerJoiningCircle, this.colors.lowerBoutOff)(g, ui);
    }
  }

  renderCornerPlacements = (currentModule: boolean = true) => (g: any, ui: any): void => {
    let rightTargetCircle: Circle = { x: this.d.shapes.centerBoutRight.x, y: this.d.shapes.centerBoutRight.y, r: this.d.params.cornerR };
    let leftTargetCircle: Circle = { x: this.d.shapes.centerBoutLeft.x, y: this.d.shapes.centerBoutLeft.y, r: this.d.params.cornerR };

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(rightTargetCircle, this.colors.centerBoutOff)(g, ui);
      renderCircle(leftTargetCircle, this.colors.centerBoutOff)(g, ui);
      renderCircle(this.d.shapes.centerBoutRight, this.colors.centerBout)(g, ui);
      renderCircle(this.d.shapes.centerBoutLeft, this.colors.centerBout)(g, ui);
    }

    if (currentModule && this.showGuideLines) {
      renderCrosshair(this.d.shapes.centerBoutRight, this.colors.centerBout)(g, ui);
      renderCrosshair(this.d.shapes.centerBoutLeft, this.colors.centerBout)(g, ui);
      renderDashLine(this.d.shapes.centerBoutLeft, this.d.shapes.centerBoutRight, this.colors.centerBout, 1, "4,4", true)(g, ui);

      renderCrosshair(this.d.shapes.lowerRightVesaci, this.colors.lowerBout)(g, ui);
      renderCrosshair(this.d.shapes.lowerLeftVesaci, this.colors.lowerBout)(g, ui);
      renderCrosshair(this.d.shapes.lowerBout, this.colors.lowerBout)(g, ui);
      renderCrosshair(this.d.shapes.upperBout, this.colors.upperBout)(g, ui);
      renderCrosshair(this.d.shapes.upperRightVesaci, this.colors.upperBout)(g, ui);
      renderCrosshair(this.d.shapes.upperLeftVesaci, this.colors.upperBout)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.cornerGuideLowY }, this.d.intersects.corners.lowerRight, this.colors.lowerBout, 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.cornerGuideLowY }, this.d.intersects.corners.lowerLeft, this.colors.lowerBout, 1, "4,4", true)(g, ui);

      renderDashLine({ x: 0, y: this.d.params.cornerGuideUpY }, this.d.intersects.corners.upperRight, this.colors.upperBout, 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.cornerGuideUpY }, this.d.intersects.corners.upperLeft, this.colors.upperBout, 1, "4,4", true)(g, ui);
      renderCrosshair(this.d.intersects.corners.lowerRight, this.colors.lowerBout)(g, ui);
      renderCrosshair(this.d.intersects.corners.lowerLeft, this.colors.lowerBout)(g, ui);
      renderCrosshair(this.d.intersects.corners.upperRight, this.colors.upperBout)(g, ui);
      renderCrosshair(this.d.intersects.corners.upperLeft, this.colors.upperBout)(g, ui);

      let targetCircleDiff = this.d.params.boutCenR - this.d.params.cornerR;

      renderCrosshair({ ...this.d.shapes.centerBoutRight, x: this.d.shapes.centerBoutRight.x + targetCircleDiff }, this.colors.centerBout)(g, ui);
      renderCrosshair({ ...this.d.shapes.centerBoutRight, x: this.d.shapes.centerBoutRight.x - targetCircleDiff }, this.colors.centerBout)(g, ui);
      renderCrosshair({ ...this.d.shapes.centerBoutLeft, x: this.d.shapes.centerBoutLeft.x + targetCircleDiff }, this.colors.centerBout)(g, ui);
      renderCrosshair({ ...this.d.shapes.centerBoutLeft, x: this.d.shapes.centerBoutLeft.x - targetCircleDiff }, this.colors.centerBout)(g, ui);

    }

  }

  renderCornerCircles = (currentModule: boolean) => (g: any, ui: any): void => {
    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(this.d.shapes.upperRightCornerC1, this.colors.upperBout)(g, ui);
      renderCircle(this.d.shapes.upperLeftCornerC1, this.colors.upperBout)(g, ui);
      renderCircle(this.d.shapes.upperRightCornerC2, this.colors.centerBoutUp)(g, ui);
      renderCircle(this.d.shapes.upperLeftCornerC2, this.colors.centerBoutUp)(g, ui);
      renderCircle(this.d.shapes.lowerLeftCornerC1, this.colors.centerBoutLow)(g, ui);
      renderCircle(this.d.shapes.lowerRightCornerC1, this.colors.centerBoutLow)(g, ui);
      renderCircle(this.d.shapes.lowerRightCornerC2, this.colors.lowerBout)(g, ui);
      renderCircle(this.d.shapes.lowerLeftCornerC2, this.colors.lowerBout)(g, ui);

    }

    if (currentModule && this.showGuideLines) {
      renderDashLine({ x: 0, y: this.d.params.cornerGuideLowY }, this.d.intersects.corners.lowerRight, this.colors.lowerBoutOff, 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.cornerGuideLowY }, this.d.intersects.corners.lowerLeft, this.colors.lowerBoutOff, 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.cornerGuideUpY }, this.d.intersects.corners.upperRight, this.colors.upperBoutOff, 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.cornerGuideUpY }, this.d.intersects.corners.upperLeft, this.colors.upperBoutOff, 1, "4,4", true)(g, ui);
    }
  }

  renderBlocks = (currentModule: boolean) => (g: any, ui: any): void => {
    if (currentModule && this.showGuideLines) {
      renderRect(this.d.shapes.lowerLeftBlock, this.colors.centerBout, 'none', 2)(g, ui);
      renderRect(this.d.shapes.upperLeftBlock, this.colors.centerBout, 'none', 2)(g, ui);
      renderRect(this.d.shapes.upperRightBlock, this.colors.centerBout, 'none', 2)(g, ui);
      renderRect(this.d.shapes.lowerRightBlock, this.colors.centerBout, 'none', 2)(g, ui);

      renderRect(this.d.shapes.lowerBlock, this.colors.lowerBout, 'none', 2)(g, ui);
      renderRect(this.d.shapes.upperBlock, this.colors.upperBout, 'none', 2)(g, ui);
    }
  }

  renderFinalCorners = (currentModule: boolean) => (g: any, ui: any): void => {
    if (!currentModule) return;

    const showOuter = this.showOuterCircles;
    const showInner = this.showInnerCircles;
    const showOuterAngles = showOuter && this.showAngleIndicators;
    const showInnerAngles = showInner && this.showCutoffIndicators;

    if (showOuter) {
      renderCircle(this.d.shapes.upperRightC1Offset, this.colors.upperBoutOff2)(g, ui);
      renderCircle(this.d.shapes.upperRightC2Offset, this.colors.centerBoutUpOff2)(g, ui);
      renderCircle(this.d.shapes.upperLeftC1Offset, this.colors.upperBoutOff2)(g, ui);
      renderCircle(this.d.shapes.upperLeftC2Offset, this.colors.centerBoutUpOff2)(g, ui);

      renderCircle(this.d.shapes.lowerRightC1Offset, this.colors.centerBoutLowOff2)(g, ui);
      renderCircle(this.d.shapes.lowerRightC2Offset, this.colors.lowerBoutOff2)(g, ui);
      renderCircle(this.d.shapes.lowerLeftC1Offset, this.colors.centerBoutLowOff2)(g, ui);
      renderCircle(this.d.shapes.lowerLeftC2Offset, this.colors.lowerBoutOff2)(g, ui);
    }

    if (showOuterAngles) {
      if (this.d.shapes.upperRightC1Offset) renderCircleAngleIndicator(this.d.shapes.upperRightC1Offset, this.d.params.cornerCircDubUpBoutTheta, this.colors.upperBoutOff2)(g, ui);
      if (this.d.shapes.upperRightC2Offset) renderCircleAngleIndicator(this.d.shapes.upperRightC2Offset, this.d.params.cornerCircDubUpCBoutTheta, this.colors.centerBoutUpOff2)(g, ui);
      if (this.d.shapes.upperLeftC1Offset) renderCircleAngleIndicator(this.d.shapes.upperLeftC1Offset, 180 - this.d.params.cornerCircDubUpBoutTheta, this.colors.upperBoutOff2)(g, ui);
      if (this.d.shapes.upperLeftC2Offset) renderCircleAngleIndicator(this.d.shapes.upperLeftC2Offset, 180 - this.d.params.cornerCircDubUpCBoutTheta, this.colors.centerBoutUpOff2)(g, ui);

      if (this.d.shapes.lowerRightC1Offset) renderCircleAngleIndicator(this.d.shapes.lowerRightC1Offset, this.d.params.cornerCircDubLowCBoutTheta, this.colors.centerBoutLowOff2)(g, ui);
      if (this.d.shapes.lowerRightC2Offset) renderCircleAngleIndicator(this.d.shapes.lowerRightC2Offset, this.d.params.cornerCircDubLowBoutTheta, this.colors.lowerBoutOff2)(g, ui);
      if (this.d.shapes.lowerLeftC1Offset) renderCircleAngleIndicator(this.d.shapes.lowerLeftC1Offset, 180 - this.d.params.cornerCircDubLowCBoutTheta, this.colors.centerBoutLowOff2)(g, ui);
      if (this.d.shapes.lowerLeftC2Offset) renderCircleAngleIndicator(this.d.shapes.lowerLeftC2Offset, 180 - this.d.params.cornerCircDubLowBoutTheta, this.colors.lowerBoutOff2)(g, ui);
    }


    if (showInner) {
      renderCircle(this.d.shapes.upperRightCornerDoubleC1, this.colors.upperBout)(g, ui);
      renderCircle(this.d.shapes.upperRightCornerDoubleC2, this.colors.centerBoutUp)(g, ui);
      renderCircle(this.d.shapes.upperLeftCornerDoubleC1, this.colors.upperBout)(g, ui);
      renderCircle(this.d.shapes.upperLeftCornerDoubleC2, this.colors.centerBoutUp)(g, ui);

      renderCircle(this.d.shapes.lowerRightCornerDoubleC1, this.colors.centerBoutLow)(g, ui);
      renderCircle(this.d.shapes.lowerRightCornerDoubleC2, this.colors.lowerBout)(g, ui);
      renderCircle(this.d.shapes.lowerLeftCornerDoubleC1, this.colors.centerBoutLow)(g, ui);
      renderCircle(this.d.shapes.lowerLeftCornerDoubleC2, this.colors.lowerBout)(g, ui);
    }

    if (showInnerAngles) {
      if (this.d.shapes.upperRightCornerDoubleC1) renderCircleAngleIndicator(this.d.shapes.upperRightCornerDoubleC1, this.d.params.cornerCircDubUpBoutCutoffTheta, this.colors.upperBout)(g, ui);
      if (this.d.shapes.upperRightCornerDoubleC2) renderCircleAngleIndicator(this.d.shapes.upperRightCornerDoubleC2, this.d.params.cornerCircleDubUpCBoutCutoffTheta, this.colors.centerBoutUp)(g, ui);
      if (this.d.shapes.upperLeftCornerDoubleC1) renderCircleAngleIndicator(this.d.shapes.upperLeftCornerDoubleC1, 180 - this.d.params.cornerCircDubUpBoutCutoffTheta, this.colors.upperBout)(g, ui);
      if (this.d.shapes.upperLeftCornerDoubleC2) renderCircleAngleIndicator(this.d.shapes.upperLeftCornerDoubleC2, 180 - this.d.params.cornerCircleDubUpCBoutCutoffTheta, this.colors.centerBoutUp)(g, ui);

      if (this.d.shapes.lowerRightCornerDoubleC1) renderCircleAngleIndicator(this.d.shapes.lowerRightCornerDoubleC1, this.d.params.cornerCircleDubLowCBoutTheta, this.colors.centerBoutLow)(g, ui);
      if (this.d.shapes.lowerRightCornerDoubleC2) renderCircleAngleIndicator(this.d.shapes.lowerRightCornerDoubleC2, this.d.params.cornerCircleDubLowBoutTheta, this.colors.lowerBout)(g, ui);
      if (this.d.shapes.lowerLeftCornerDoubleC1) renderCircleAngleIndicator(this.d.shapes.lowerLeftCornerDoubleC1, 180 - this.d.params.cornerCircleDubLowCBoutTheta, this.colors.centerBoutLow)(g, ui);
      if (this.d.shapes.lowerLeftCornerDoubleC2) renderCircleAngleIndicator(this.d.shapes.lowerLeftCornerDoubleC2, 180 - this.d.params.cornerCircleDubLowBoutTheta, this.colors.lowerBout)(g, ui);
    }

  }

  renderMainPath = (g: any, ui: any): void => {
    let pathObj = this.d.paths.find(c => c.name === "innerPath");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, this.colors.innerTrace)(g, ui));
    }
  }

  renderMainPathCornerless = (g: any, ui: any): void => {
    let pathObj = this.d.paths.find(c => c.name === "innerPathCornerless");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, this.colors.innerTrace)(g, ui));
    }
  }

  renderUnifiedPath = (g: any, ui: any): void => {
    let pathObj = this.d.paths.find(c => c.name === "unifiedTrace");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, this.colors.innerTrace, 2, 0.7)(g, ui));
    }
  }

  renderMainPathWithBlocks = (g: any, ui: any): void => {
    let mouldPath = this.d.paths.find(c => c.name === "mouldPath");
    if (mouldPath) {
      mouldPath.paths.forEach((p: any) => renderPath(p, this.colors.mouldTrace, 2, 0.7)(g, ui));
    }
  }

  renderTopPath = (g: any, ui: any): void => {
    let pathObj = this.d.paths.find(c => c.name === "outerPath");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, this.colors.outerTrace, 2)(g, ui));
    }
  }

  downloadInnerPath = (): void => {
    safeRun(() => {
      calculateMainPathsUnified(this.d);
      const pathObj = this.d.paths.find(c => c.name === 'innerPathUnified');
      if (!pathObj) return;

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-this.d.params.width / 2} 0 ${this.d.params.width} ${this.d.params.height}"><g transform="translate(0 ${this.d.params.height}) scale(1 -1)"><path d="${pathObj.paths[0]}" fill="none" stroke="black"/></g></svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'unified_path.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  downloadMouldPath = (): void => {
    safeRun(() => {
      calculateMouldPath(this.d);
      const pathObj = this.d.paths.find(c => c.name === 'mouldPath');
      if (!pathObj) return;

      let allPaths = combinePathStrings(pathObj.paths);

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-this.d.params.width / 2} 0 ${this.d.params.width} ${this.d.params.height}"><g transform="translate(0 ${this.d.params.height}) scale(1 -1)"><path d="${allPaths}" fill="none" stroke="black"/></g></svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'mould_path.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  downloadInnerSegmentedPaths = (): void => {
    safeRun(() => {
      calculateMainPathsSegmented(this.d);
      const pathObj = this.d.paths.find(c => c.name === 'segmentedPartialPath');
      if (!pathObj) return;

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-this.d.params.width / 2} 0 ${this.d.params.width} ${this.d.params.height}"><g transform="translate(0 ${this.d.params.height}) scale(1 -1)">
    <path d="${pathObj.paths[0]}" fill="none" stroke="red"/><path d="${pathObj.paths[1]}" fill="none" stroke="blue"/><path d="${pathObj.paths[2]}" fill="none" stroke="green"/><path d="${pathObj.paths[3]}" fill="none" stroke="orange"/>
    
    </g></svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'segmented_paths.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  downloadOuterSegmentedPaths = (): void => {
    safeRun(() => {
      calculateMainPathsSegmented(this.d);
      calculateOffsetPathsSegments(this.d);
      const pathObj = this.d.paths.find(c => c.name === 'offsetSegmentedPath');
      if (!pathObj) return;

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-this.d.params.width / 2} 0 ${this.d.params.width} ${this.d.params.height}"><g transform="translate(0 ${this.d.params.height}) scale(1 -1)">
    <path d="${pathObj.paths[0]}" fill="none" stroke="red"/><path d="${pathObj.paths[1]}" fill="none" stroke="blue"/><path d="${pathObj.paths[2]}" fill="none" stroke="green"/><path d="${pathObj.paths[3]}" fill="none" stroke="orange"/>
    
    </g></svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'segmented_paths.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  downloadOuterPath = (): void => {
    safeRun(() => {
      calculateMainPathsUnified(this.d);
      calculateMainPathsSegmented(this.d);
      calculateOffsetPathsSegments(this.d);
      calculateTopPath(this.d);
      const pathObj = this.d.paths.find(c => c.name === 'outerPath');
      // let paths = combinePathStrings(pathObj?.paths);
      if (!pathObj) return;

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-this.d.params.width / 2} 0 ${this.d.params.width} ${this.d.params.height}"><g transform="translate(0 ${this.d.params.height}) scale(1 -1)">
      <path d="${pathObj.paths[0]}" fill="none" stroke="black"/>
      <path d="${pathObj.paths[1]}" fill="none" stroke="red"/>
      <path d="${pathObj.paths[2]}" fill="none" stroke="blue"/>
      <path d="${pathObj.paths[3]}" fill="none" stroke="green"/>
      <path d="${pathObj.paths[4]}" fill="none" stroke="orange"/>
      <path d="${pathObj.paths[5]}" fill="none" stroke="purple"/>
      <path d="${pathObj.paths[6]}" fill="none" stroke="purple"/>
      <path d="${pathObj.paths[7]}" fill="none" stroke="purple"/>
    </g></svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'unified_path.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

}