import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Circle, Pt, Rectangle } from '../models/types';
import { renderCircle, renderCrosshair, renderDashedLine, renderDashLine, renderDistanceMeasurementLine, renderLine, renderPath, renderRect, renderRectRoundedCorners } from '../helpers/renderFuncs';
import { arcPathFrom3Points, calculateOffset, circleCircleIntersections, combinePathStrings, concatSvgPaths, differenceFromTwoPaths, dist, findClosestPointOnPathToCircle, findJoiningCircleFromCircleAndPoint, inscribeCircleWithinCircle, interceptCirclesAndPoint, lineCircleIntersection, pathFromCircle, pathFromLine, pathFromRect, pathFromRoundedRect, pointOnCircle, unifyConnectedSvgPaths } from '../helpers/draftMath';

@Component({
  selector: 'app-kelly-violin',
  imports: [FormsModule],
  templateUrl: './kelly-violin.html',
  styleUrls: ['../sidebar.css', './kelly-violin.css']
})

export class KellyViolin extends RecipeComponentBase {
  override openPanel = 'topAndBottom';

  showGuideLines = true;
  showAllCircles = true;
  showModuleCircles = false;
  viewOuterPathExport = false;
  viewInnerPathExport = false;
  viewMouldExport = false;

  override d = {
    recipeName: 'Kelly Violin',
    fileName: "Kelly-Baltic",
    version: ".1",
    params: {
      h: 348,
      w: 203,
      inset: 4,
      bitDiameter: 6.35,

      upperBoutRadius: 78,
      upperBoutCenter: 284,
      lowerBoutRadius: 97.5,
      lowerBoutCenter: 70,
      centerBoutRadius: 85,
      upperVesaciRadius: 57,
      lowerVesaciRadius: 62,

      cornerTargetRadius: 74,
      lowerCornerGuideYIntercept: 51,
      lowerCornerGuideXOffset: 0,
      upperCornerGuideYIntercept: 278,
      upperCornerGuideXOffset: 0,

      upperTopCornerCircleRadius: 24,
      upperBottomCornerCircleRadius: 20,
      lowerTopCornerCircleRadius: 20,
      lowerBottomCornerCircleRadius: 24,

      cornerBlockHeight: 24,
      cornerBlockWidth: 20,
      cornerBlockPadding: 8,
      lowerBlockHeight: 20,
      lowerBlockWidth: 60,
      upperBlockHeight: 20,
      upperBlockWidth: 40,

      lowerTopCornerDubCircleRadius: 10,
      lowerTopCornerDubCircleTheta: -70,
      lowerBottomCornerDubCircleRadius: 10,
      lowerBottomCornerDubCircleTheta: 165,
      lowerTopCornerDubCircleCutoffTheta: 300,
      lowerBottomCornerDubCircleCutoffTheta: 135,

      upperTopCornerDubCircleRadius: 10,
      upperTopCornerDubCircleTheta: 200,
      upperBottomCornerDubCircleRadius: 10,
      upperBottomCornerDubCircleTheta: 105,
      upperTopCornerDubCircleCutoffTheta: 225,
      upperBottomCornerDubCircleCutoffTheta: 70
    },
    shapes: {
      upperBout: {} as Circle,
      lowerBout: {} as Circle,
      centerBoutLeft: {} as Circle,
      centerBoutRight: {} as Circle,
      lowerRightVesaci: {} as Circle,
      lowerLeftVesaci: {} as Circle,
      upperRightVesaci: {} as Circle,
      upperLeftVesaci: {} as Circle,
      upperJoiningCircle: {} as Circle,
      lowerJoiningCircle: {} as Circle,

      lowerLeftCornerC1: null as Circle | null,
      lowerLeftCornerC2: null as Circle | null,
      lowerRightCornerC1: null as Circle | null,
      lowerRightCornerC2: null as Circle | null,
      upperLeftCornerC1: null as Circle | null,
      upperLeftCornerC2: null as Circle | null,
      upperRightCornerC1: null as Circle | null,
      upperRightCornerC2: null as Circle | null,

      lowerLeftBlock: null as Rectangle | null,
      lowerRightBlock: null as Rectangle | null,
      upperRightBlock: null as Rectangle | null,
      upperLeftBlock: null as Rectangle | null,
      lowerBlock: null as Rectangle | null,
      upperBlock: null as Rectangle | null,

      upperClampCutout: null as Rectangle | null,
      lowerClampCutout: null as Rectangle | null,
      leftClampCutout: null as Rectangle | null,
      rightClampCutout: null as Rectangle | null,

      lowerRightC1Offset: null as Circle | null,
      lowerRightC2Offset: null as Circle | null,
      lowerRightCornerDoubleC1: null as Circle | null,
      lowerRightCornerDoubleC2: null as Circle | null,

      lowerLeftC1Offset: null as Circle | null,
      lowerLeftC2Offset: null as Circle | null,
      lowerLeftCornerDoubleC1: null as Circle | null,
      lowerLeftCornerDoubleC2: null as Circle | null,

      upperRightC1Offset: null as Circle | null,
      upperRightC2Offset: null as Circle | null,
      upperRightCornerDoubleC1: null as Circle | null,
      upperRightCornerDoubleC2: null as Circle | null,

      upperLeftC1Offset: null as Circle | null,
      upperLeftC2Offset: null as Circle | null,
      upperLeftCornerDoubleC1: null as Circle | null,
      upperLeftCornerDoubleC2: null as Circle | null,

      lowerRightCutoff1: null as Pt | null,
      lowerRightCutoff2: null as Pt | null,
      lowerLeftCutoff1: null as Pt | null,
      lowerLeftCutoff2: null as Pt | null,
      upperRightCutoff1: null as Pt | null,
      upperRightCutoff2: null as Pt | null,
      upperLeftCutoff1: null as Pt | null,
      upperLeftCutoff2: null as Pt | null,
    },
    intersects: {
      majorBouts: {
        upperRight: {} as any,
        upperLeft: {} as any,
        lowerRight: {} as any,
        lowerLeft: {} as any
      },
      minorBouts: {
        lowerRightVesicaUpper: {} as any,
        lowerRightVesicaLower: {} as any,
        lowerLeftVesicaUpper: {} as any,
        lowerLeftVesicaLower: {} as any,
        upperRightVesicaUpper: {} as any,
        upperRightVesicaLower: {} as any,
        upperLeftVesicaUpper: {} as any,
        upperLeftVesicaLower: {} as any
      },
      corners: {
        lowerRight: null as Pt | null,
        lowerLeft: null as Pt | null,
        upperRight: null as Pt | null,
        upperLeft: null as Pt | null,

        lowerLeftCornerTopBodyIntersection: null as Pt | null,
        lowerLeftCornerBottomBodyIntersection: null as Pt | null,
        lowerRightCornerTopBodyIntersection: null as Pt | null,
        lowerRightCornerBottomBodyIntersection: null as Pt | null,
        upperLeftCornerTopBodyIntersection: null as Pt | null,
        upperLeftCornerBottomBodyIntersection: null as Pt | null,
        upperRightCornerTopBodyIntersection: null as Pt | null,
        upperRightCornerBottomBodyIntersection: null as Pt | null,
      },
      blocks: {
        lowerLeftBlockP1: { x: 0, y: 0 } as Pt,
        lowerLeftBlockP2: { x: 0, y: 0 } as Pt,
        lowerLeftBlockP3: { x: 0, y: 0 } as Pt,
        lowerRightBlockP1: { x: 0, y: 0 } as Pt,
        lowerRightBlockP2: { x: 0, y: 0 } as Pt,
        lowerRightBlockP3: { x: 0, y: 0 } as Pt,
        upperRightBlockP1: { x: 0, y: 0 } as Pt,
        upperRightBlockP2: { x: 0, y: 0 } as Pt,
        upperRightBlockP3: { x: 0, y: 0 } as Pt,
        upperLeftBlockP1: { x: 0, y: 0 } as Pt,
        upperLeftBlockP2: { x: 0, y: 0 } as Pt,
        upperLeftBlockP3: { x: 0, y: 0 } as Pt,
      }
    },
    calcs: []
  }

  insetTooltip = "Inset is the distance from the outer edge of the bounding box to inner edge. It can be used to create a margin for the outline of the violin.";


  override firstRender = (g: any, ui: any): void => {
    this.renderBounds(g, ui);
    this.setBounds.emit({ pt1: { x: -this.d.params.w / 2, y: 0 }, pt2: { x: this.d.params.w / 2, y: this.d.params.h } });
  }

  override onToggle(panel: string, ev: Event) {
    const details = ev.target as HTMLDetailsElement;
    this.showModuleCircles = true;
    this.showAllCircles = false;

    if (details.open) {
      // opened -> make it the active panel and render it
      this.openPanel = panel;
      if (panel === 'base') this.changeBaseMeasurements();
      else if (panel === 'mainBouts') this.changeMainBouts();
      else if (panel === 'minorBouts') this.changeMinorBouts();
      else if (panel === 'cornerPlacement') this.changeCornerPlacement();
      else if (panel === 'cornerCircles') this.changeCornerCircles()
      else if (panel === 'mouldPattern') this.changeMouldPattern();
      else if (panel === 'topAndBottom') this.changeTopAndBottom();
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
    const ratio = this.d.params.h / this.d.params.w;
    this.setBounds.emit({ pt1: { x: -this.d.params.w / 2, y: 0 }, pt2: { x: this.d.params.w / 2, y: this.d.params.h } });
    this.calculateAll();
    this.draftChange.emit([this.renderBounds]);
  }

  changeMainBouts() {
    this.calculateAll();
    this.draftChange.emit([this.renderBounds, this.renderMainBouts(true)]);
  }

  changeMinorBouts() {
    this.calculateAll();
    this.draftChange.emit([this.renderBounds, this.renderMainBouts(false), this.renderMinorBouts(true), this.renderMainPath]);
  }

  changeCornerPlacement() {
    this.calculateAll();
    this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(true), this.renderMainPath]);

  }

  changeCornerCircles() {
    this.calculateAll();
    this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(false), this.renderCornerCircles(true), this.renderMainPath]);
  }

  changeMouldPattern(calcChange = true) {
    calcChange && this.calculateAll();
    calcChange && this.calculateMouldPath();
    this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(false), this.renderCornerCircles(false), this.renderBlocks(true), this.renderMainPathWithBlocks]);
  }

  changeTopAndBottom() {
    this.calculateAll();
    this.calculateMainPathsSegmented();
    this.calculateOffsetPathsSegments();
    this.calculateTopPath();
    this.draftChange.emit([this.renderFinalCorners(true), this.renderMainPath, this.renderTopPath]);
  }

  renderExports() {
    this.calculateAll();
    this.calculateMainPathsSegmented();
    this.calculateOffsetPathsSegments();
    this.calculateTopPath();

    let emitArray = [];
    this.viewOuterPathExport && emitArray.push(this.renderTopPath);
    this.viewInnerPathExport && emitArray.push(this.renderMainPath);
    this.viewMouldExport && emitArray.push(this.renderMainPathWithBlocks);

    this.draftChange.emit(emitArray);

  }

  renderBounds = (g: any, ui: any): void => {
    const h = this.d.params.h;
    const w = this.d.params.w;
    const inset = this.d.params.inset;
    const xLeft = -w / 2;

    // bounding rect (above x-axis)
    g.append('rect')
      .attr('x', xLeft)
      .attr('y', 0)
      .attr('width', w)
      .attr('height', h)
      .attr('fill', 'none')
      .attr('stroke', '#222')
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke');

    // inset rectangle
    g.append('rect')
      .attr('x', xLeft + inset)
      .attr('y', inset)
      .attr('width', w - 2 * inset)
      .attr('height', h - 2 * inset)
      .attr('fill', 'none')
      .attr('stroke', '#f00')
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke');

  }

  renderMainBouts = (currentModule: boolean) => (g: any, ui: any): void => {
    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(this.d.shapes.upperBout, "red")(g, ui);
      renderCircle(this.d.shapes.lowerBout, "black")(g, ui);
      renderCircle(this.d.shapes.centerBoutLeft, "blue")(g, ui);
      renderCircle(this.d.shapes.centerBoutRight, "blue")(g, ui);
    }

    if (currentModule && this.showGuideLines) {
      let waistWidth = (this.d.shapes.centerBoutRight.x - this.d.params.centerBoutRadius) * 2;
      let inset = this.d.params.inset;
      let insetWaist = waistWidth + 2 * inset;
      let insetLowerBout = this.d.params.lowerBoutRadius * 2 + 2 * inset;
      let insetUpperBout = this.d.params.upperBoutRadius * 2 + 2 * inset;

      renderDistanceMeasurementLine({ x: -insetWaist / 2, y: this.d.shapes.centerBoutLeft.y }, { x: insetWaist / 2, y: this.d.shapes.centerBoutLeft.y }, insetWaist.toFixed(1) + " mm", "blue")(g, ui);
      renderDistanceMeasurementLine({ x: -insetLowerBout / 2, y: this.d.params.lowerBoutCenter }, { x: insetLowerBout / 2, y: this.d.params.lowerBoutCenter }, insetLowerBout.toFixed(1) + " mm", "black")(g, ui);
      renderDistanceMeasurementLine({ x: -insetUpperBout / 2, y: this.d.params.upperBoutCenter }, { x: insetUpperBout / 2, y: this.d.params.upperBoutCenter }, insetUpperBout.toFixed(1) + " mm", "red")(g, ui);
      renderDashedLine({ x: -1000, y: this.d.shapes.centerBoutLeft.y }, { x: 1000, y: this.d.shapes.centerBoutLeft.y }, "blue")(g, ui);
      renderDashedLine({ x: -1000, y: this.d.params.lowerBoutCenter }, { x: 1000, y: this.d.params.lowerBoutCenter }, "black")(g, ui);
      renderDashedLine({ x: -1000, y: this.d.params.upperBoutCenter }, { x: 1000, y: this.d.params.upperBoutCenter }, "red")(g, ui);
    }
  }

  renderMinorBouts = (currentModule: boolean) => (g: any, ui: any): void => {
    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(this.d.shapes.upperRightVesaci, "orange")(g, ui);
      renderCircle(this.d.shapes.upperLeftVesaci, "orange")(g, ui);
      renderCircle(this.d.shapes.upperJoiningCircle, "orange")(g, ui);
      renderCircle(this.d.shapes.lowerRightVesaci, "green")(g, ui);
      renderCircle(this.d.shapes.lowerLeftVesaci, "green")(g, ui);
      renderCircle(this.d.shapes.lowerJoiningCircle, "green")(g, ui);
    }
  }

  renderCornerPlacements = (currentModule: boolean = true) => (g: any, ui: any): void => {
    let rightTargetCircle: Circle = { x: this.d.shapes.centerBoutRight.x, y: this.d.shapes.centerBoutRight.y, r: this.d.params.cornerTargetRadius };
    let leftTargetCircle: Circle = { x: this.d.shapes.centerBoutLeft.x, y: this.d.shapes.centerBoutLeft.y, r: this.d.params.cornerTargetRadius };

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(rightTargetCircle, "purple")(g, ui);
      renderCircle(leftTargetCircle, "purple")(g, ui);
      renderCircle(this.d.shapes.centerBoutRight, "blue")(g, ui);
      renderCircle(this.d.shapes.centerBoutLeft, "blue")(g, ui);
    }

    if (currentModule && this.showGuideLines) {
      renderCrosshair(this.d.shapes.centerBoutRight, "blue")(g, ui);
      renderCrosshair(this.d.shapes.centerBoutLeft, "blue")(g, ui);
      renderDashLine(this.d.shapes.centerBoutLeft, this.d.shapes.centerBoutRight, "blue", 1, "4,4", true)(g, ui);

      renderCrosshair(this.d.shapes.lowerRightVesaci, "green")(g, ui);
      renderCrosshair(this.d.shapes.lowerLeftVesaci, "green")(g, ui);
      renderCrosshair(this.d.shapes.lowerBout, "green")(g, ui);
      renderCrosshair(this.d.shapes.upperBout, "red")(g, ui);
      renderCrosshair(this.d.shapes.upperRightVesaci, "red")(g, ui);
      renderCrosshair(this.d.shapes.upperLeftVesaci, "red")(g, ui);

      renderDashLine({ x: 0, y: this.d.params.lowerCornerGuideYIntercept }, this.d.intersects.corners.lowerRight, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.lowerCornerGuideYIntercept }, this.d.intersects.corners.lowerLeft, "purple", 1, "4,4", true)(g, ui);

      renderDashLine({ x: 0, y: this.d.params.upperCornerGuideYIntercept }, this.d.intersects.corners.upperRight, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.upperCornerGuideYIntercept }, this.d.intersects.corners.upperLeft, "purple", 1, "4,4", true)(g, ui);

      renderCrosshair(this.d.intersects.corners.lowerRight, "purple")(g, ui);
      renderCrosshair(this.d.intersects.corners.lowerLeft, "purple")(g, ui);
      renderCrosshair(this.d.intersects.corners.upperRight, "purple")(g, ui);
      renderCrosshair(this.d.intersects.corners.upperLeft, "purple")(g, ui);
    }

  }

  renderCornerCircles = (currentModule: boolean) => (g: any, ui: any): void => {
    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(this.d.shapes.lowerLeftCornerC1, "purple")(g, ui);
      renderCircle(this.d.shapes.lowerLeftCornerC2, "purple")(g, ui);
      renderCircle(this.d.shapes.lowerRightCornerC1, "purple")(g, ui);
      renderCircle(this.d.shapes.lowerRightCornerC2, "purple")(g, ui);
      renderCircle(this.d.shapes.upperRightCornerC1, "purple")(g, ui);
      renderCircle(this.d.shapes.upperRightCornerC2, "purple")(g, ui);
      renderCircle(this.d.shapes.upperLeftCornerC1, "purple")(g, ui);
      renderCircle(this.d.shapes.upperLeftCornerC2, "purple")(g, ui);
    }

    if (currentModule && this.showGuideLines) {
      renderDashLine({ x: 0, y: this.d.params.lowerCornerGuideYIntercept }, this.d.intersects.corners.lowerRight, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.lowerCornerGuideYIntercept }, this.d.intersects.corners.lowerLeft, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.upperCornerGuideYIntercept }, this.d.intersects.corners.upperRight, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({ x: 0, y: this.d.params.upperCornerGuideYIntercept }, this.d.intersects.corners.upperLeft, "purple", 1, "4,4", true)(g, ui);
    }
  }

  renderBlocks = (currentModule: boolean) => (g: any, ui: any): void => {
    if (currentModule && this.showGuideLines) {
      renderRect(this.d.shapes.lowerLeftBlock, "blue")(g, ui);
      renderRect(this.d.shapes.upperLeftBlock, "blue")(g, ui);
      renderRect(this.d.shapes.upperRightBlock, "blue")(g, ui);
      renderRect(this.d.shapes.lowerRightBlock, "blue")(g, ui);

      renderRect(this.d.shapes.lowerBlock, "blue")(g, ui);
      renderRect(this.d.shapes.upperBlock, "blue")(g, ui);
    }
  }

  renderFinalCorners = (currentModule: boolean) => (g: any, ui: any): void => {

    if (currentModule && this.showGuideLines) {
      renderCircle(this.d.shapes.lowerRightC1Offset, "blue")(g, ui);
      renderCircle(this.d.shapes.lowerRightC2Offset, "blue")(g, ui);
      renderCircle(this.d.shapes.lowerRightCornerDoubleC1, "purple")(g, ui);
      renderCircle(this.d.shapes.lowerRightCornerDoubleC2, "purple")(g, ui);

      renderCircle(this.d.shapes.lowerLeftC1Offset, "blue")(g, ui);
      renderCircle(this.d.shapes.lowerLeftC2Offset, "blue")(g, ui);
      renderCircle(this.d.shapes.lowerLeftCornerDoubleC1, "purple")(g, ui);
      renderCircle(this.d.shapes.lowerLeftCornerDoubleC2, "purple")(g, ui);

      renderCircle(this.d.shapes.upperRightC1Offset, "blue")(g, ui);
      renderCircle(this.d.shapes.upperRightC2Offset, "blue")(g, ui);
      renderCircle(this.d.shapes.upperRightCornerDoubleC1, "purple")(g, ui);
      renderCircle(this.d.shapes.upperRightCornerDoubleC2, "purple")(g, ui);

      renderCircle(this.d.shapes.upperLeftC1Offset, "blue")(g, ui);
      renderCircle(this.d.shapes.upperLeftC2Offset, "blue")(g, ui);
      renderCircle(this.d.shapes.upperLeftCornerDoubleC1, "purple")(g, ui);
      renderCircle(this.d.shapes.upperLeftCornerDoubleC2, "purple")(g, ui);
      renderLine(this.d.shapes.upperLeftCutoff1, this.d.shapes.upperLeftCutoff2, "purple")(g, ui);
    }

  }

  renderMainPath = (g: any, ui: any): void => {
    let pathObj = this.d.calcs.find(c => c.name === "innerPath");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, "red")(g, ui));
    }
  }

  renderUnifiedPath = (g: any, ui: any): void => {
    let pathObj = this.d.calcs.find(c => c.name === "unifiedTrace");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, "blue", 2, 0.7)(g, ui));
    }
  }

  renderMainPathWithBlocks = (g: any, ui: any): void => {
    let mouldPath = this.d.calcs.find(c => c.name === "mouldPath");
    if (mouldPath) {
      mouldPath.paths.forEach((p: any) => renderPath(p, "green", 2, 0.7)(g, ui));
    }
  }

  renderTopPath = (g: any, ui: any): void => {
    let pathObj = this.d.calcs.find(c => c.name === "outerTrace");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, "blue", 2)(g, ui));
    }
  }

  calculateAll() {
    // calculate main bouts
    if (this.d.params.upperBoutCenter && this.d.params.lowerBoutCenter && this.d.params.upperBoutRadius && this.d.params.lowerBoutRadius && this.d.params.centerBoutRadius) {
      this.d.shapes.upperBout = { x: 0, y: this.d.params.upperBoutCenter, r: this.d.params.upperBoutRadius };
      this.d.shapes.lowerBout = { x: 0, y: this.d.params.lowerBoutCenter, r: this.d.params.lowerBoutRadius };

      // defining some terms, L is.lowerLeftVesicaLower bout circle, U is upper bout circle, C is center bout circle
      // our goal is to find x,y coordinates of the center of C
      // we can do this using the law of cosines, c^2 = a^2 + b^2 - 2ab*cos(theta)

      //    U
      //    |\
      //    | \ 
      //    |  \  a
      //    |   \ 
      //    |    \ 
      //  b |     \ 
      //    |     / C 
      //    |    /   
      //    |   /       
      //    |t /  c      
      //    | /
      //    L    

      let Ul = this.d.params.upperBoutCenter - this.d.params.lowerBoutCenter; // vertical distance between centers of U and L
      let Uc = this.d.params.centerBoutRadius + this.d.params.upperBoutRadius; // distance from center of U to edge of C
      let Lc = this.d.params.centerBoutRadius + this.d.params.lowerBoutRadius // distance from center of L to edge of C

      // using law of cosines to find angle t
      let cosT = (Ul * Ul + Uc * Uc - Lc * Lc) / (2 * Ul * Uc);
      let t = Math.acos(cosT);

      // now we can find the coordinates of the center of C
      let Cx = Uc * Math.sin(t);
      let Cy = this.d.params.upperBoutCenter - Uc * Math.cos(t);

      this.d.shapes.centerBoutLeft = { x: -Cx, y: Cy, r: this.d.params.centerBoutRadius };
      this.d.shapes.centerBoutRight = { x: Cx, y: Cy, r: this.d.params.centerBoutRadius };

      // lets calculate the four intersection points of the four circles
      let upperRight = circleCircleIntersections(this.d.shapes.upperBout, this.d.shapes.centerBoutRight)[0];
      let upperLeft = circleCircleIntersections(this.d.shapes.upperBout, this.d.shapes.centerBoutLeft)[0];
      let lowerRight = circleCircleIntersections(this.d.shapes.lowerBout, this.d.shapes.centerBoutRight)[0];
      let lowerLeft = circleCircleIntersections(this.d.shapes.lowerBout, this.d.shapes.centerBoutLeft)[0];

      this.d.intersects.majorBouts = {
        upperRight,
        upperLeft,
        lowerRight,
        lowerLeft
      }
    }

    if (this.d.params.lowerBoutRadius && this.d.params.lowerVesaciRadius && this.d.params.upperBoutRadius && this.d.params.upperVesaciRadius && this.d.shapes.lowerBout && this.d.shapes.upperBout) {
      let lowerRightVesica = { x: this.d.params.lowerBoutRadius - this.d.params.lowerVesaciRadius, y: this.d.params.lowerBoutCenter, r: this.d.params.lowerVesaciRadius };
      let lowerLeftVesica = { x: -this.d.params.lowerBoutRadius + this.d.params.lowerVesaciRadius, y: this.d.params.lowerBoutCenter, r: this.d.params.lowerVesaciRadius };
      let upperRightVesica = { x: this.d.params.upperBoutRadius - this.d.params.upperVesaciRadius, y: this.d.params.upperBoutCenter, r: this.d.params.upperVesaciRadius };
      let upperLeftVesica = { x: -this.d.params.upperBoutRadius + this.d.params.upperVesaciRadius, y: this.d.params.upperBoutCenter, r: this.d.params.upperVesaciRadius };
      let upperJoiningCircle = findJoiningCircleFromCircleAndPoint(upperRightVesica, { x: 0, y: this.d.params.h - this.d.params.inset })
      let lowerJoiningCircle = findJoiningCircleFromCircleAndPoint(lowerRightVesica, { x: 0, y: this.d.params.inset })

      this.d.shapes.lowerRightVesaci = lowerRightVesica;
      this.d.shapes.lowerLeftVesaci = lowerLeftVesica;
      this.d.shapes.upperRightVesaci = upperRightVesica;
      this.d.shapes.upperLeftVesaci = upperLeftVesica;
      this.d.shapes.upperJoiningCircle = upperJoiningCircle;
      this.d.shapes.lowerJoiningCircle = lowerJoiningCircle;


      // now lets calculate circle intersection points
      let lowerRightVesicaUpper = circleCircleIntersections(lowerRightVesica, this.d.shapes.lowerBout)[0];
      let lowerRightVesicaLower = circleCircleIntersections(lowerRightVesica, lowerJoiningCircle)[0];
      let lowerLeftVesicaUpper = circleCircleIntersections(lowerLeftVesica, this.d.shapes.lowerBout)[0];
      let lowerLeftVesicaLower = circleCircleIntersections(lowerLeftVesica, lowerJoiningCircle)[0];
      let upperRightVesicaLower = circleCircleIntersections(upperRightVesica, this.d.shapes.upperBout)[0];
      let upperRightVesicaUpper = circleCircleIntersections(upperRightVesica, upperJoiningCircle)[0];
      let upperLeftVesicaLower = circleCircleIntersections(upperLeftVesica, this.d.shapes.upperBout)[0];
      let upperLeftVesicaUpper = circleCircleIntersections(upperLeftVesica, upperJoiningCircle)[0];

      this.d.intersects.minorBouts = {
        lowerRightVesicaUpper,
        lowerRightVesicaLower,
        lowerLeftVesicaUpper,
        lowerLeftVesicaLower,
        upperRightVesicaUpper,
        upperRightVesicaLower,
        upperLeftVesicaUpper,
        upperLeftVesicaLower
      }
    }

    // corner placements
    if (this.d.params.cornerTargetRadius && this.d.params.upperCornerGuideYIntercept) {
      let rightTargetCircle: Circle = { x: this.d.shapes.centerBoutRight.x, y: this.d.shapes.centerBoutRight.y, r: this.d.params.cornerTargetRadius };
      let leftTargetCircle: Circle = { x: this.d.shapes.centerBoutLeft.x, y: this.d.shapes.centerBoutLeft.y, r: this.d.params.cornerTargetRadius };

      let lowerRightCornerTarget: Circle = { x: rightTargetCircle.x + this.d.params.lowerCornerGuideXOffset, y: rightTargetCircle.y, r: rightTargetCircle.r };
      let lowerLeftCornerTarget: Circle = { x: leftTargetCircle.x - this.d.params.lowerCornerGuideXOffset, y: leftTargetCircle.y, r: leftTargetCircle.r };
      let lowerRightCorner = lineCircleIntersection({ x: 0, y: this.d.params.lowerCornerGuideYIntercept }, lowerRightCornerTarget, rightTargetCircle)[1];
      let lowerLeftCorner = lineCircleIntersection({ x: 0, y: this.d.params.lowerCornerGuideYIntercept }, lowerLeftCornerTarget, leftTargetCircle)[1];
      let upperRightCornerTarget: Circle = { x: rightTargetCircle.x + this.d.params.upperCornerGuideXOffset, y: rightTargetCircle.y, r: rightTargetCircle.r };
      let upperLeftCornerTarget: Circle = { x: leftTargetCircle.x - this.d.params.upperCornerGuideXOffset, y: leftTargetCircle.y, r: leftTargetCircle.r };
      let upperRightCorner = lineCircleIntersection({ x: 0, y: this.d.params.upperCornerGuideYIntercept }, upperRightCornerTarget, rightTargetCircle)[1];
      let upperLeftCorner = lineCircleIntersection({ x: 0, y: this.d.params.upperCornerGuideYIntercept }, upperLeftCornerTarget, leftTargetCircle)[1];

      this.d.intersects.corners.lowerRight = lowerRightCorner;
      this.d.intersects.corners.lowerLeft = lowerLeftCorner;
      this.d.intersects.corners.upperRight = upperRightCorner;
      this.d.intersects.corners.upperLeft = upperLeftCorner;
    }

    // corner cirlces
    if (this.d.params.upperTopCornerCircleRadius && this.d.params.upperBottomCornerCircleRadius && this.d.params.lowerTopCornerCircleRadius && this.d.params.lowerBottomCornerCircleRadius) {
      let lowerTopRightCornerCircle = interceptCirclesAndPoint(this.d.shapes.centerBoutRight, this.d.intersects.corners.lowerRight, this.d.params.lowerTopCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[0];
      let lowerBottomRightCornerCircle = interceptCirclesAndPoint(this.d.shapes.lowerBout, this.d.intersects.corners.lowerRight, this.d.params.lowerBottomCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[1];
      let lowerTopLeftCornerCircle = interceptCirclesAndPoint(this.d.shapes.centerBoutLeft, this.d.intersects.corners.lowerLeft, this.d.params.lowerTopCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[0];
      let lowerBottomLeftCornerCircle = interceptCirclesAndPoint(this.d.shapes.lowerBout, this.d.intersects.corners.lowerLeft, this.d.params.lowerBottomCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[1];

      let upperTopRightCornerCircle = interceptCirclesAndPoint(this.d.shapes.upperBout, this.d.intersects.corners.upperRight, this.d.params.upperTopCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[0];
      let upperBottomRightCornerCircle = interceptCirclesAndPoint(this.d.shapes.centerBoutRight, this.d.intersects.corners.upperRight, this.d.params.upperBottomCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[1];
      let upperTopLeftCornerCircle = interceptCirclesAndPoint(this.d.shapes.upperBout, this.d.intersects.corners.upperLeft, this.d.params.upperTopCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[0];
      let upperBottomLeftCornerCircle = interceptCirclesAndPoint(this.d.shapes.centerBoutLeft, this.d.intersects.corners.upperLeft, this.d.params.upperBottomCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[1];

      this.d.shapes.lowerLeftCornerC1 = lowerTopLeftCornerCircle;
      this.d.shapes.lowerLeftCornerC2 = lowerBottomLeftCornerCircle;
      this.d.shapes.lowerRightCornerC1 = lowerTopRightCornerCircle;
      this.d.shapes.lowerRightCornerC2 = lowerBottomRightCornerCircle;
      this.d.shapes.upperRightCornerC1 = upperTopRightCornerCircle;
      this.d.shapes.upperRightCornerC2 = upperBottomRightCornerCircle;
      this.d.shapes.upperLeftCornerC1 = upperTopLeftCornerCircle;
      this.d.shapes.upperLeftCornerC2 = upperBottomLeftCornerCircle;

      let lowerLeftCornerTopBodyIntersection = circleCircleIntersections(lowerTopLeftCornerCircle, this.d.shapes.centerBoutLeft)[0];
      let lowerLeftCornerBottomBodyIntersection = circleCircleIntersections(lowerBottomLeftCornerCircle, this.d.shapes.lowerBout)[1];
      let lowerRightCornerTopBodyIntersection = circleCircleIntersections(lowerTopRightCornerCircle, this.d.shapes.centerBoutRight)[0];
      let lowerRightCornerBottomBodyIntersection = circleCircleIntersections(lowerBottomRightCornerCircle, this.d.shapes.lowerBout)[1];
      let upperLeftCornerTopBodyIntersection = circleCircleIntersections(upperTopLeftCornerCircle, this.d.shapes.upperBout)[0];
      let upperLeftCornerBottomBodyIntersection = circleCircleIntersections(upperBottomLeftCornerCircle, this.d.shapes.centerBoutLeft)[1];
      let upperRightCornerTopBodyIntersection = circleCircleIntersections(upperTopRightCornerCircle, this.d.shapes.upperBout)[0];
      let upperRightCornerBottomBodyIntersection = circleCircleIntersections(upperBottomRightCornerCircle, this.d.shapes.centerBoutRight)[1];

      this.d.intersects.corners.lowerLeftCornerTopBodyIntersection = lowerLeftCornerTopBodyIntersection;
      this.d.intersects.corners.lowerLeftCornerBottomBodyIntersection = lowerLeftCornerBottomBodyIntersection;
      this.d.intersects.corners.lowerRightCornerTopBodyIntersection = lowerRightCornerTopBodyIntersection;
      this.d.intersects.corners.lowerRightCornerBottomBodyIntersection = lowerRightCornerBottomBodyIntersection;
      this.d.intersects.corners.upperLeftCornerTopBodyIntersection = upperLeftCornerTopBodyIntersection;
      this.d.intersects.corners.upperLeftCornerBottomBodyIntersection = upperLeftCornerBottomBodyIntersection;
      this.d.intersects.corners.upperRightCornerTopBodyIntersection = upperRightCornerTopBodyIntersection;
      this.d.intersects.corners.upperRightCornerBottomBodyIntersection = upperRightCornerBottomBodyIntersection;
    }

    // block work
    let pad = this.d.params.cornerBlockPadding;
    let lowerRightBlock = new Rectangle(new Pt(this.d.intersects.corners.lowerRight.x + pad, this.d.intersects.corners.lowerRight.y + pad), new Pt(this.d.intersects.corners.lowerRight.x - (this.d.params.cornerBlockWidth - pad), this.d.intersects.corners.lowerRight.y - (this.d.params.cornerBlockHeight - pad)));
    let lowerLeftBlock = new Rectangle(new Pt(this.d.intersects.corners.lowerLeft.x - pad, this.d.intersects.corners.lowerLeft.y + pad), new Pt(this.d.intersects.corners.lowerLeft.x + (this.d.params.cornerBlockWidth - pad), this.d.intersects.corners.lowerLeft.y - (this.d.params.cornerBlockHeight - pad)));
    let upperRightBlock = new Rectangle(new Pt(this.d.intersects.corners.upperRight.x + pad, this.d.intersects.corners.upperRight.y - pad), new Pt(this.d.intersects.corners.upperRight.x - (this.d.params.cornerBlockWidth - pad), this.d.intersects.corners.upperRight.y + (this.d.params.cornerBlockHeight - pad)));
    let upperLeftBlock = new Rectangle(new Pt(this.d.intersects.corners.upperLeft.x - pad, this.d.intersects.corners.upperLeft.y - pad), new Pt(this.d.intersects.corners.upperLeft.x + (this.d.params.cornerBlockWidth - pad), this.d.intersects.corners.upperLeft.y + (this.d.params.cornerBlockHeight - pad)));

    let lowerBlockP1 = new Pt(-.5 * this.d.params.lowerBlockWidth, this.d.params.inset)
    let lowerBlockP2 = new Pt(.5 * this.d.params.lowerBlockWidth, lowerBlockP1.y + this.d.params.lowerBlockHeight)
    let lowerBlock = new Rectangle(lowerBlockP1, lowerBlockP2);

    let upperBlockP1 = new Pt(-.5 * this.d.params.upperBlockWidth, this.d.params.h - this.d.params.inset)
    let upperBlockP2 = new Pt(.5 * this.d.params.upperBlockWidth, upperBlockP1.y - this.d.params.upperBlockHeight)
    let upperBlock = new Rectangle(upperBlockP1, upperBlockP2);

    this.d.shapes.lowerRightBlock = lowerRightBlock;
    this.d.shapes.lowerLeftBlock = lowerLeftBlock;
    this.d.shapes.upperRightBlock = upperRightBlock;
    this.d.shapes.upperLeftBlock = upperLeftBlock;

    this.d.shapes.lowerBlock = lowerBlock;
    this.d.shapes.upperBlock = upperBlock;

    // clamping cutouts
    let blockInset = 20;
    let clampChanelWidth = 25;

    let lowerBlockClampingCutoutP1 = new Pt(this.d.shapes.lowerBlock.Pt1.x * 1.2, this.d.shapes.lowerBlock.Pt2.y + blockInset);
    let lowerBlockClampingCutoutP2 = new Pt(this.d.shapes.lowerBlock.Pt2.x * 1.2, this.d.shapes.lowerBlock.Pt2.y + blockInset + clampChanelWidth);
    let upperBlockClampingCutoutP1 = new Pt(lowerBlockClampingCutoutP1.x, this.d.shapes.upperBlock.Pt2.y - blockInset);
    let upperBlockClampingCutoutP2 = new Pt(lowerBlockClampingCutoutP2.x, this.d.shapes.upperBlock.Pt2.y - (blockInset + clampChanelWidth));

    let leftCornerBlockClampingCutoutP1 = new Pt(lowerBlockClampingCutoutP1.x, lowerBlockClampingCutoutP2.y + blockInset);
    let leftCornerBlockClampingCutoutP2 = new Pt(lowerBlockClampingCutoutP1.x + clampChanelWidth, upperBlockClampingCutoutP2.y - blockInset);
    let rightCornerBlockClampingCutoutP1 = new Pt(lowerBlockClampingCutoutP2.x, lowerBlockClampingCutoutP2.y + blockInset);
    let rightCornerBlockClampingCutoutP2 = new Pt(lowerBlockClampingCutoutP2.x - clampChanelWidth, upperBlockClampingCutoutP2.y - blockInset);

    this.d.shapes.lowerClampCutout = { Pt1: lowerBlockClampingCutoutP1, Pt2: lowerBlockClampingCutoutP2 };
    this.d.shapes.upperClampCutout = { Pt1: upperBlockClampingCutoutP1, Pt2: upperBlockClampingCutoutP2 };
    this.d.shapes.leftClampCutout = { Pt1: leftCornerBlockClampingCutoutP1, Pt2: leftCornerBlockClampingCutoutP2 };
    this.d.shapes.rightClampCutout = { Pt1: rightCornerBlockClampingCutoutP1, Pt2: rightCornerBlockClampingCutoutP2 };

    this.calculateMainPath();
  }

  calculateMainPath = (): void => {
    let paths = []
    let cornersCalculated = this.d.shapes.lowerLeftCornerC1 && this.d.intersects.corners.lowerLeftCornerBottomBodyIntersection


    if (cornersCalculated) {
      let lbc1 = arcPathFrom3Points(this.d.shapes.lowerLeftCornerC2, this.d.intersects.corners.lowerLeftCornerBottomBodyIntersection, this.d.intersects.corners.lowerLeft)
      let lbc2 = arcPathFrom3Points(this.d.shapes.lowerBout, this.d.intersects.corners.lowerLeftCornerBottomBodyIntersection, this.d.intersects.minorBouts.lowerLeftVesicaUpper)

      paths.push(lbc1, lbc2);
    }
    else {
      let l1 = arcPathFrom3Points(this.d.shapes.lowerBout, this.d.intersects.majorBouts.lowerLeft, this.d.intersects.minorBouts.lowerLeftVesicaUpper)
      let l5 = arcPathFrom3Points(this.d.shapes.lowerBout, this.d.intersects.minorBouts.lowerRightVesicaUpper, this.d.intersects.majorBouts.lowerRight)
      paths.push(l1, l5);
    }

    let l2 = arcPathFrom3Points(this.d.shapes.lowerLeftVesaci, this.d.intersects.minorBouts.lowerLeftVesicaUpper, this.d.intersects.minorBouts.lowerLeftVesicaLower)
    let l3 = arcPathFrom3Points(this.d.shapes.lowerJoiningCircle, this.d.intersects.minorBouts.lowerLeftVesicaLower, this.d.intersects.minorBouts.lowerRightVesicaLower)
    let l4 = arcPathFrom3Points(this.d.shapes.lowerRightVesaci, this.d.intersects.minorBouts.lowerRightVesicaLower, this.d.intersects.minorBouts.lowerRightVesicaUpper)
    paths.push(l2, l3, l4);

    if (cornersCalculated) {
      let rbc1 = arcPathFrom3Points(this.d.shapes.lowerBout, this.d.intersects.minorBouts.lowerRightVesicaUpper, this.d.intersects.corners.lowerRightCornerBottomBodyIntersection)
      let rbc2 = arcPathFrom3Points(this.d.shapes.lowerRightCornerC2, this.d.intersects.corners.lowerRight, this.d.intersects.corners.lowerRightCornerBottomBodyIntersection)
      let rbc3 = arcPathFrom3Points(this.d.shapes.lowerRightCornerC1, this.d.intersects.corners.lowerRightCornerTopBodyIntersection, this.d.intersects.corners.lowerRight)
      let ruc1 = arcPathFrom3Points(this.d.shapes.upperRightCornerC2, this.d.intersects.corners.upperRight, this.d.intersects.corners.upperRightCornerBottomBodyIntersection)
      let c1 = arcPathFrom3Points(this.d.shapes.centerBoutRight, this.d.intersects.corners.upperRightCornerBottomBodyIntersection, this.d.intersects.corners.lowerRightCornerTopBodyIntersection)

      paths.push(rbc1, rbc2, rbc3, c1, ruc1);
    }
    else {
      let c1 = arcPathFrom3Points(this.d.shapes.centerBoutLeft, this.d.intersects.majorBouts.lowerLeft, this.d.intersects.majorBouts.upperLeft)
      let c2 = arcPathFrom3Points(this.d.shapes.centerBoutRight, this.d.intersects.majorBouts.upperRight, this.d.intersects.majorBouts.lowerRight)
      paths.push(c1, c2);
    }

    if (cornersCalculated) {
      let rtc1 = arcPathFrom3Points(this.d.shapes.upperRightCornerC1, this.d.intersects.corners.upperRightCornerTopBodyIntersection, this.d.intersects.corners.upperRight)
      let rtc2 = arcPathFrom3Points(this.d.shapes.upperBout, this.d.intersects.corners.upperRightCornerTopBodyIntersection, this.d.intersects.minorBouts.upperRightVesicaLower)

      paths.push(rtc1, rtc2);
    }
    else {
      let u1 = arcPathFrom3Points(this.d.shapes.upperBout, this.d.intersects.majorBouts.upperRight, this.d.intersects.minorBouts.upperRightVesicaLower)
      let u5 = arcPathFrom3Points(this.d.shapes.upperBout, this.d.intersects.minorBouts.upperLeftVesicaLower, this.d.intersects.majorBouts.upperLeft)
      paths.push(u1, u5);
    }

    let u2 = arcPathFrom3Points(this.d.shapes.upperRightVesaci, this.d.intersects.minorBouts.upperRightVesicaLower, this.d.intersects.minorBouts.upperRightVesicaUpper)
    let u3 = arcPathFrom3Points(this.d.shapes.upperJoiningCircle, this.d.intersects.minorBouts.upperRightVesicaUpper, this.d.intersects.minorBouts.upperLeftVesicaUpper)
    let u4 = arcPathFrom3Points(this.d.shapes.upperLeftVesaci, this.d.intersects.minorBouts.upperLeftVesicaUpper, this.d.intersects.minorBouts.upperLeftVesicaLower)
    paths.push(u2, u3, u4);


    if (cornersCalculated) {
      let luc1 = arcPathFrom3Points(this.d.shapes.upperBout, this.d.intersects.minorBouts.upperLeftVesicaLower, this.d.intersects.corners.upperLeftCornerTopBodyIntersection)
      let luc2 = arcPathFrom3Points(this.d.shapes.upperLeftCornerC1, this.d.intersects.corners.upperLeft, this.d.intersects.corners.upperLeftCornerTopBodyIntersection)
      let lbc3 = arcPathFrom3Points(this.d.shapes.lowerLeftCornerC1, this.d.intersects.corners.lowerLeft, this.d.intersects.corners.lowerLeftCornerTopBodyIntersection)
      let c2 = arcPathFrom3Points(this.d.shapes.centerBoutLeft, this.d.intersects.corners.lowerLeftCornerTopBodyIntersection, this.d.intersects.corners.upperLeftCornerBottomBodyIntersection)
      let luc3 = arcPathFrom3Points(this.d.shapes.upperLeftCornerC2, this.d.intersects.corners.upperLeftCornerBottomBodyIntersection, this.d.intersects.corners.upperLeft)
      paths.push(luc1, luc2, luc3, lbc3, c2);
    }

    let pathObj = { name: "innerPath", paths: paths };

    let existingIndex = this.d.calcs.findIndex(c => c.name === "innerPath");
    if (existingIndex !== -1) {
      this.d.calcs[existingIndex] = pathObj;
    } else {
      this.d.calcs.push(pathObj);
    }

  }

  calculateMainPathsUnified = (): void => {
    const source = this.d.calcs.find(c => c.name === 'innerPath');
    if (!source?.paths?.length) return;

    const unifiedPath = unifyConnectedSvgPaths(source.paths);

    const pathObj = { name: 'innerPathUnified', paths: [unifiedPath] };
    const existingIndex = this.d.calcs.findIndex(c => c.name === 'innerPathUnified');
    if (existingIndex !== -1) {
      this.d.calcs[existingIndex] = pathObj;
    } else {
      this.d.calcs.push(pathObj);
    }
  }

  calculateMainPathsSegmented = (): void => {
    let paths = this.d.calcs.find(c => c.name === "innerPath")?.paths;
    if (!paths) return;

    let lowerBoutPartial = paths.slice(1, 6)
    let rightCenterBoutPartial = paths.slice(8, 9)
    let upperCenterBoutPartial = paths.slice(11, 16)
    let upperBoutPartial = paths.slice(19, 20)

    let lowerBout = paths.slice(1, 7);
    let rightCenterBout = paths.slice(7, 10);
    let upperCenterBout = paths.slice(10, 17);
    let upperBout = paths.slice(17, 20);

    // now unify each of these segments 
    let lowerBoutPartialUnified = unifyConnectedSvgPaths(lowerBoutPartial);
    let rightCenterBoutPartialUnified = unifyConnectedSvgPaths(rightCenterBoutPartial);
    let upperCenterBoutPartialUnified = unifyConnectedSvgPaths(upperCenterBoutPartial);
    let upperBoutPartialUnified = unifyConnectedSvgPaths(upperBoutPartial);

    let lowerBoutUnified = unifyConnectedSvgPaths(lowerBout);
    let rightCenterBoutUnified = unifyConnectedSvgPaths(rightCenterBout);
    let upperCenterBoutUnified = unifyConnectedSvgPaths(upperCenterBout);
    let upperBoutUnified = unifyConnectedSvgPaths(upperBout);

    let partialPathObj = { name: "segmentedPartialTrace", paths: [lowerBoutPartialUnified, rightCenterBoutPartialUnified, upperCenterBoutPartialUnified, upperBoutPartialUnified] };

    let existingIndex = this.d.calcs.findIndex(c => c.name === "segmentedTrace");
    if (existingIndex !== -1) {
      this.d.calcs[existingIndex] = partialPathObj;
    } else {
      this.d.calcs.push(partialPathObj);
    }

    let pathObj = { name: "segmentedTrace", paths: [lowerBoutUnified, rightCenterBoutUnified, upperCenterBoutUnified, upperBoutUnified] };
    if (existingIndex !== -1) {
      this.d.calcs[existingIndex] = pathObj;
    } else {
      this.d.calcs.push(pathObj);
    }
  }

  calculateOffsetPathsSegments = (): void => {
    let segmentedPaths = this.d.calcs.find(c => c.name === "segmentedPartialTrace");
    if (segmentedPaths) {
      let paths = []
      let offset1 = calculateOffset(segmentedPaths.paths[0], this.d.params.inset)
      let offset2 = calculateOffset(segmentedPaths.paths[1], -this.d.params.inset)
      let offset3 = calculateOffset(segmentedPaths.paths[2], this.d.params.inset)
      let offset4 = calculateOffset(segmentedPaths.paths[3], -this.d.params.inset)

      paths.push(offset1, offset2, offset3, offset4);

      let pathObj = { name: "offsetSegmentedTrace", paths: paths };
      let existingIndex = this.d.calcs.findIndex(c => c.name === "offsetSegmentedTrace");
      if (existingIndex !== -1) {
        this.d.calcs[existingIndex] = pathObj;
      } else {
        this.d.calcs.push(pathObj);
      }
    }
  }

  calculateTopPath = (): void => {
    let paths = this.d.calcs.find(c => c.name === "offsetSegmentedTrace")?.paths;
    this.d.shapes.lowerRightC1Offset = { ...this.d.shapes.lowerRightCornerC1, r: this.d.shapes.lowerRightCornerC1.r - this.d.params.inset };
    this.d.shapes.lowerRightC2Offset = { ...this.d.shapes.lowerRightCornerC2, r: this.d.shapes.lowerRightCornerC2.r - this.d.params.inset };
    let C1ClosestPoint = findClosestPointOnPathToCircle(paths[1], this.d.shapes.lowerRightC1Offset);
    let C2ClosestPoint = findClosestPointOnPathToCircle(paths[0], this.d.shapes.lowerRightC2Offset);
    let C1Dist = dist(C1ClosestPoint, this.d.shapes.lowerRightC1Offset);
    let C2Dist = dist(C2ClosestPoint, this.d.shapes.lowerRightC2Offset);
    this.d.shapes.lowerRightC1Offset.r = C1Dist;
    this.d.shapes.lowerRightC2Offset.r = C2Dist;

    let rad1 = this.d.params.lowerTopCornerDubCircleTheta * Math.PI / 180;
    let rad2 = this.d.params.lowerBottomCornerDubCircleTheta * Math.PI / 180;
    let cutoffRad1 = this.d.params.lowerTopCornerDubCircleCutoffTheta * Math.PI / 180;
    let cutoffRad2 = this.d.params.lowerBottomCornerDubCircleCutoffTheta * Math.PI / 180;

    this.d.shapes.lowerRightCornerDoubleC1 = inscribeCircleWithinCircle(this.d.shapes.lowerRightC1Offset, this.d.params.lowerTopCornerDubCircleRadius, rad1);
    this.d.shapes.lowerRightCornerDoubleC2 = inscribeCircleWithinCircle(this.d.shapes.lowerRightC2Offset, this.d.params.lowerBottomCornerDubCircleRadius, rad2);

    let lowerRightC1Intercept = pointOnCircle(this.d.shapes.lowerRightC1Offset, rad1);
    let lowerRightC2Intercept = pointOnCircle(this.d.shapes.lowerRightC2Offset, rad2);
    this.d.shapes.lowerRightCutoff1 = pointOnCircle(this.d.shapes.lowerRightCornerDoubleC1, cutoffRad1);
    this.d.shapes.lowerRightCutoff2 = pointOnCircle(this.d.shapes.lowerRightCornerDoubleC2, cutoffRad2);

    let path1 = arcPathFrom3Points(this.d.shapes.lowerRightC2Offset, lowerRightC2Intercept, C2ClosestPoint);
    let path2 = arcPathFrom3Points(this.d.shapes.lowerRightCornerDoubleC2, this.d.shapes.lowerRightCutoff2, lowerRightC2Intercept);
    let path3 = pathFromLine(this.d.shapes.lowerRightCutoff1, this.d.shapes.lowerRightCutoff2);
    let path4 = arcPathFrom3Points(this.d.shapes.lowerRightCornerDoubleC1, lowerRightC1Intercept, this.d.shapes.lowerRightCutoff1);
    let path5 = arcPathFrom3Points(this.d.shapes.lowerRightC1Offset, C1ClosestPoint, lowerRightC1Intercept);
    let lowerRightCornerPath = unifyConnectedSvgPaths([path1, path2, path3, path4, path5]);

    this.d.shapes.lowerLeftC1Offset = { ...this.d.shapes.lowerLeftCornerC1, r: C1Dist };
    this.d.shapes.lowerLeftC2Offset = { ...this.d.shapes.lowerLeftCornerC2, r: C2Dist };
    this.d.shapes.lowerLeftCornerDoubleC1 = inscribeCircleWithinCircle(this.d.shapes.lowerLeftC1Offset, this.d.params.lowerTopCornerDubCircleRadius, Math.PI - rad1);
    this.d.shapes.lowerLeftCornerDoubleC2 = inscribeCircleWithinCircle(this.d.shapes.lowerLeftC2Offset, this.d.params.lowerBottomCornerDubCircleRadius, Math.PI - rad2);
    let lowerLeftC1Intercept = pointOnCircle(this.d.shapes.lowerLeftC1Offset, Math.PI - rad1);
    let lowerLeftC2Intercept = pointOnCircle(this.d.shapes.lowerLeftC2Offset, Math.PI - rad2);
    this.d.shapes.lowerLeftCutoff1 = pointOnCircle(this.d.shapes.lowerLeftCornerDoubleC1, Math.PI - cutoffRad1);
    this.d.shapes.lowerLeftCutoff2 = pointOnCircle(this.d.shapes.lowerLeftCornerDoubleC2, Math.PI - cutoffRad2);

    let path6 = arcPathFrom3Points(this.d.shapes.lowerLeftC2Offset, lowerLeftC2Intercept, findClosestPointOnPathToCircle(paths[0], this.d.shapes.lowerLeftC2Offset), { clockwise: false })
    let path7 = arcPathFrom3Points(this.d.shapes.lowerLeftCornerDoubleC2, this.d.shapes.lowerLeftCutoff2, lowerLeftC2Intercept, { clockwise: false });
    let path8 = pathFromLine(this.d.shapes.lowerLeftCutoff1, this.d.shapes.lowerLeftCutoff2);
    let path9 = arcPathFrom3Points(this.d.shapes.lowerLeftCornerDoubleC1, lowerLeftC1Intercept, this.d.shapes.lowerLeftCutoff1, { clockwise: false });
    let path10 = arcPathFrom3Points(this.d.shapes.lowerLeftC1Offset, findClosestPointOnPathToCircle(paths[3], this.d.shapes.lowerLeftC1Offset), lowerLeftC1Intercept, { clockwise: false });

    let lowerLeftCornerPath = unifyConnectedSvgPaths([path6, path7, path8, path9, path10]);

    this.d.shapes.upperRightC1Offset = { ...this.d.shapes.upperRightCornerC1, r: this.d.shapes.upperRightCornerC1.r - this.d.params.inset };
    this.d.shapes.upperRightC2Offset = { ...this.d.shapes.upperRightCornerC2, r: this.d.shapes.upperRightCornerC2.r - this.d.params.inset };
    let upperRightC1ClosestPoint = findClosestPointOnPathToCircle(paths[2], this.d.shapes.upperRightC1Offset);
    let upperRightC2ClosestPoint = findClosestPointOnPathToCircle(paths[1], this.d.shapes.upperRightC2Offset);
    let upperRightC1Dist = dist(upperRightC1ClosestPoint, this.d.shapes.upperRightC1Offset);
    let upperRightC2Dist = dist(upperRightC2ClosestPoint, this.d.shapes.upperRightC2Offset);
    this.d.shapes.upperRightC1Offset.r = upperRightC1Dist;
    this.d.shapes.upperRightC2Offset.r = upperRightC2Dist;

    let rad3 = this.d.params.upperTopCornerDubCircleTheta * Math.PI / 180;
    let rad4 = this.d.params.upperBottomCornerDubCircleTheta * Math.PI / 180;
    let cutoffRad3 = this.d.params.upperTopCornerDubCircleCutoffTheta * Math.PI / 180;
    let cutoffRad4 = this.d.params.upperBottomCornerDubCircleCutoffTheta * Math.PI / 180;

    this.d.shapes.upperRightCornerDoubleC1 = inscribeCircleWithinCircle(this.d.shapes.upperRightC1Offset, this.d.params.upperTopCornerDubCircleRadius, rad3);
    this.d.shapes.upperRightCornerDoubleC2 = inscribeCircleWithinCircle(this.d.shapes.upperRightC2Offset, this.d.params.upperBottomCornerDubCircleRadius, rad4);
    let upperRightC1Intercept = pointOnCircle(this.d.shapes.upperRightC1Offset, rad3);
    let upperRightC2Intercept = pointOnCircle(this.d.shapes.upperRightC2Offset, rad4);
    this.d.shapes.upperRightCutoff1 = pointOnCircle(this.d.shapes.upperRightCornerDoubleC1, cutoffRad3);
    this.d.shapes.upperRightCutoff2 = pointOnCircle(this.d.shapes.upperRightCornerDoubleC2, cutoffRad4);

    let path11 = arcPathFrom3Points(this.d.shapes.upperRightC2Offset, upperRightC2Intercept, upperRightC2ClosestPoint);
    let path12 = arcPathFrom3Points(this.d.shapes.upperRightCornerDoubleC2, this.d.shapes.upperRightCutoff2, upperRightC2Intercept);
    let path13 = pathFromLine(this.d.shapes.upperRightCutoff1, this.d.shapes.upperRightCutoff2);
    let path14 = arcPathFrom3Points(this.d.shapes.upperRightCornerDoubleC1, upperRightC1Intercept, this.d.shapes.upperRightCutoff1);
    let path15 = arcPathFrom3Points(this.d.shapes.upperRightC1Offset, upperRightC1ClosestPoint, upperRightC1Intercept);
    let upperRightCornerPath = unifyConnectedSvgPaths([path11, path12, path13, path14, path15]);

    this.d.shapes.upperLeftC1Offset = { ...this.d.shapes.upperLeftCornerC1, r: upperRightC1Dist };
    this.d.shapes.upperLeftC2Offset = { ...this.d.shapes.upperLeftCornerC2, r: upperRightC2Dist };
    this.d.shapes.upperLeftCornerDoubleC1 = inscribeCircleWithinCircle(this.d.shapes.upperLeftC1Offset, this.d.params.upperTopCornerDubCircleRadius, Math.PI - rad3);
    this.d.shapes.upperLeftCornerDoubleC2 = inscribeCircleWithinCircle(this.d.shapes.upperLeftC2Offset, this.d.params.upperBottomCornerDubCircleRadius, Math.PI - rad4);
    let upperLeftC1Intercept = pointOnCircle(this.d.shapes.upperLeftC1Offset, Math.PI - rad3);
    let upperLeftC2Intercept = pointOnCircle(this.d.shapes.upperLeftC2Offset, Math.PI - rad4);
    this.d.shapes.upperLeftCutoff1 = pointOnCircle(this.d.shapes.upperLeftCornerDoubleC1, Math.PI - cutoffRad3);
    this.d.shapes.upperLeftCutoff2 = pointOnCircle(this.d.shapes.upperLeftCornerDoubleC2, Math.PI - cutoffRad4);
    let path16 = arcPathFrom3Points(this.d.shapes.upperLeftC2Offset, upperLeftC2Intercept, findClosestPointOnPathToCircle(paths[3], this.d.shapes.upperLeftC2Offset), { clockwise: false });
    let path17 = arcPathFrom3Points(this.d.shapes.upperLeftCornerDoubleC2, this.d.shapes.upperLeftCutoff2, upperLeftC2Intercept, { clockwise: false });
    let path18 = pathFromLine(this.d.shapes.upperLeftCutoff1, this.d.shapes.upperLeftCutoff2);
    let path19 = arcPathFrom3Points(this.d.shapes.upperLeftCornerDoubleC1, upperLeftC1Intercept, this.d.shapes.upperLeftCutoff1, { clockwise: false });
    let path20 = arcPathFrom3Points(this.d.shapes.upperLeftC1Offset, findClosestPointOnPathToCircle(paths[2], this.d.shapes.upperLeftC1Offset), upperLeftC1Intercept, { clockwise: false });

    let upperLeftCornerPath = unifyConnectedSvgPaths([path16, path17, path18, path19, path20]);

    // let unifiedPaths = concatSvgPaths(paths[0], lowerRightCornerPath);
    // let pathObj = { name: "unifiedOffsetTrace", paths: [unifiedPaths, lowerRightCornerPath] };

    let pathObj = { name: "outerTrace", paths: [...paths, upperRightCornerPath, upperLeftCornerPath, lowerRightCornerPath, lowerLeftCornerPath] };

    let existingIndex = this.d.calcs.findIndex(c => c.name === "outerTrace");
    if (existingIndex !== -1) {
      this.d.calcs[existingIndex] = pathObj;
    } else {
      this.d.calcs.push(pathObj);
    }
  }


  calculateMouldPath = (useHighAccuracy = false) => {
    this.calculateMainPathsUnified();
    let pathObj = this.d.calcs.find(c => c.name === "innerPathUnified").paths[0];
    if (!pathObj) return;

    let renderDensity = useHighAccuracy ? 0.1 : 1;

    let mouldPath = differenceFromTwoPaths(pathObj, pathFromRect(this.d.shapes.lowerLeftBlock), renderDensity);
    mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(this.d.shapes.lowerRightBlock), renderDensity);
    mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(this.d.shapes.upperRightBlock), renderDensity);
    mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(this.d.shapes.upperLeftBlock), renderDensity);
    mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(this.d.shapes.lowerBlock), renderDensity);
    mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(this.d.shapes.upperBlock), renderDensity);

    let bitRadius = this.d.params.bitDiameter ? this.d.params.bitDiameter / 2 : 0;

    if (bitRadius > 0) {
      let tolerance = .5
      let bitOffset = (bitRadius * Math.sqrt(2) / 2) - tolerance;
      // because the CNC bit can't do perfect 90 degree corners, we need to add circles to the corners of the blocks to ensure that the bit can fit in there
      const lowerLeftBlockCornerCircle = { x: this.d.shapes.lowerLeftBlock.Pt2.x - bitOffset, y: this.d.shapes.lowerLeftBlock.Pt2.y + bitOffset, r: bitRadius };
      const lowerRightBlockCornerCircle = { x: this.d.shapes.lowerRightBlock.Pt2.x + bitOffset, y: this.d.shapes.lowerRightBlock.Pt2.y + bitOffset, r: bitRadius };
      const upperLeftBlockCornerCircle = { x: this.d.shapes.upperLeftBlock.Pt2.x - bitOffset, y: this.d.shapes.upperLeftBlock.Pt2.y - bitOffset, r: bitRadius };
      const upperRightBlockCornerCircle = { x: this.d.shapes.upperRightBlock.Pt2.x + bitOffset, y: this.d.shapes.upperRightBlock.Pt2.y - bitOffset, r: bitRadius };
      const lowerBlockCornerCircle1 = { x: this.d.shapes.lowerBlock.Pt2.x - bitOffset, y: this.d.shapes.lowerBlock.Pt2.y - bitOffset, r: bitRadius };
      const lowerBlockCornerCircle2 = { x: this.d.shapes.lowerBlock.Pt1.x + bitOffset, y: this.d.shapes.lowerBlock.Pt2.y - bitOffset, r: bitRadius };
      const upperBlockCornerCircle1 = { x: this.d.shapes.upperBlock.Pt2.x - bitOffset, y: this.d.shapes.upperBlock.Pt2.y + bitOffset, r: bitRadius };
      const upperBlockCornerCircle2 = { x: this.d.shapes.upperBlock.Pt1.x + bitOffset, y: this.d.shapes.upperBlock.Pt2.y + bitOffset, r: bitRadius };

      // now we need to subtract the circles from the path as well
      mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(lowerLeftBlockCornerCircle));
      mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(lowerRightBlockCornerCircle));
      mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(upperLeftBlockCornerCircle));
      mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(upperRightBlockCornerCircle));
      mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(lowerBlockCornerCircle1));
      mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(lowerBlockCornerCircle2));
      mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(upperBlockCornerCircle1));
      mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(upperBlockCornerCircle2));
    }

    let lowerCutoutPath = pathFromRoundedRect(this.d.shapes.lowerClampCutout, bitRadius);
    let upperCutoutPath = pathFromRoundedRect(this.d.shapes.upperClampCutout, bitRadius);
    let leftCutoutPath = pathFromRoundedRect(this.d.shapes.leftClampCutout, bitRadius);
    let rightCutoutPath = pathFromRoundedRect(this.d.shapes.rightClampCutout, bitRadius);


    let mouldPathObj = { name: "mouldPath", paths: [mouldPath, lowerCutoutPath, upperCutoutPath, leftCutoutPath, rightCutoutPath] };
    let existingIndex = this.d.calcs.findIndex(c => c.name === "mouldPath");
    if (existingIndex !== -1) {
      this.d.calcs[existingIndex] = mouldPathObj;
    } else {
      this.d.calcs.push(mouldPathObj);
    }
  }

  downloadInnerPath = (): void => {
    this.calculateMainPathsUnified();
    const pathObj = this.d.calcs.find(c => c.name === 'innerPathUnified');
    if (!pathObj) return;

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-this.d.params.w / 2} 0 ${this.d.params.w} ${this.d.params.h}"><g transform="translate(0 ${this.d.params.h}) scale(1 -1)"><path d="${pathObj.paths[0]}" fill="none" stroke="black"/></g></svg>`;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'unified_path.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  downloadMouldPath = (): void => {
    this.calculateMouldPath(true); // we want to recalc with high accuracy for the download to ensure the best possible quality for CNC cutting.
    const pathObj = this.d.calcs.find(c => c.name === 'mouldPath');
    if (!pathObj) return;

    let allPaths = combinePathStrings(pathObj.paths);

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-this.d.params.w / 2} 0 ${this.d.params.w} ${this.d.params.h}"><g transform="translate(0 ${this.d.params.h}) scale(1 -1)"><path d="${allPaths}" fill="none" stroke="black"/></g></svg>`;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'mould_path.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  downloadOuterSegmentedPaths = (): void => {
    this.calculateMainPathsSegmented();
    const pathObj = this.d.calcs.find(c => c.name === 'offsetSegmentedTrace');
    if (!pathObj) return;

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-this.d.params.w / 2} 0 ${this.d.params.w} ${this.d.params.h}"><g transform="translate(0 ${this.d.params.h}) scale(1 -1)">
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
  }

  downloadOuterPath = (): void => {
    this.calculateMainPathsUnified();
    const pathObj = this.d.calcs.find(c => c.name === 'outerTrace');
    // let paths = combinePathStrings(pathObj?.paths);
    if (!pathObj) return;

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-this.d.params.w / 2} 0 ${this.d.params.w} ${this.d.params.h}"><g transform="translate(0 ${this.d.params.h}) scale(1 -1)">
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
  }

}