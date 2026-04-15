import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Circle, Pt } from '../models/types';
import { renderCircle, renderCrosshair, renderDashedLine, renderDashLine, renderDashLineMxB, renderDistanceMeasurementLine, renderPath } from '../helpers/renderFuncs';
import { arcPathFrom3Points, circleCircleIntersections, findJoiningCircleFromCircleAndPoint, interceptCirclesAndPoint, lineCircleIntersection, lineFromTwoPoints } from '../helpers/draftMath';
import { arc } from 'd3';

@Component({
  selector: 'app-kelly-violin',
  imports: [FormsModule],
  templateUrl: './kelly-violin.html',
  styleUrls: ['../sidebar.css', './kelly-violin.css']
})

export class KellyViolin extends RecipeComponentBase {

  showGuideLines = true;
  showAllCircles = true;
  showModuleCircles = false;

  override d = {
    recipeName: 'Kelly Violin',
    fileName: "Kelly-Baltic",
    version: ".1",
    params: {
      h: 348,
      w: 203,
      inset: 4,
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
      upperTopCornerCircleRadius: 20,
      upperBottomCornerCircleRadius: 20,
      lowerTopCornerCircleRadius: 20,
      lowerBottomCornerCircleRadius: 20,
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
    },
    intersectionPoints: {
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
      else if (panel ==='cornerCircles') this.changeCornerCircles()
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
    this.draftChange.emit([this.renderBounds, this.renderMainBouts(false), this.renderMinorBouts(true), this.renderPaths]);
  }

  changeCornerPlacement() {
    this.calculateAll();
    this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(true), this.renderPaths]);

  }

  changeCornerCircles() {
    this.calculateAll();
    this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(false), this.renderCornerCircles(true), this.renderPaths]);
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
      let insetLowerBout = this.d.params.lowerBoutRadius*2  + 2 * inset;
      let insetUpperBout = this.d.params.upperBoutRadius*2  + 2 * inset;

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
    let rightTargetCircle: Circle = {x: this.d.shapes.centerBoutRight.x, y: this.d.shapes.centerBoutRight.y, r: this.d.params.cornerTargetRadius};
    let leftTargetCircle: Circle = {x: this.d.shapes.centerBoutLeft.x, y: this.d.shapes.centerBoutLeft.y, r: this.d.params.cornerTargetRadius};

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
      renderCrosshair(this.d.shapes.lowerBout,"green")(g, ui);
      renderCrosshair(this.d.shapes.upperBout,"red")(g, ui);
      renderCrosshair(this.d.shapes.upperRightVesaci,"red")(g, ui);
      renderCrosshair(this.d.shapes.upperLeftVesaci,"red")(g, ui);

      renderDashLine({x: 0 , y: this.d.params.lowerCornerGuideYIntercept}, this.d.intersectionPoints.corners.lowerRight, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({x: 0 , y: this.d.params.lowerCornerGuideYIntercept}, this.d.intersectionPoints.corners.lowerLeft, "purple", 1, "4,4", true)(g, ui);
    
      renderDashLine({x: 0 , y: this.d.params.upperCornerGuideYIntercept}, this.d.intersectionPoints.corners.upperRight, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({x: 0 , y: this.d.params.upperCornerGuideYIntercept}, this.d.intersectionPoints.corners.upperLeft, "purple", 1, "4,4", true)(g, ui);

    }

    if (currentModule) {
      renderCrosshair(this.d.intersectionPoints.corners.lowerRight, "purple")(g, ui);
      renderCrosshair(this.d.intersectionPoints.corners.lowerLeft, "purple")(g, ui);
      renderCrosshair(this.d.intersectionPoints.corners.upperRight, "purple")(g, ui);
      renderCrosshair(this.d.intersectionPoints.corners.upperLeft, "purple")(g, ui);
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

      renderCrosshair(this.d.intersectionPoints.corners.lowerRight, "purple")(g, ui);
      renderCrosshair(this.d.intersectionPoints.corners.lowerLeft, "purple")(g, ui);
      renderCrosshair(this.d.intersectionPoints.corners.upperRight, "purple")(g, ui);
      renderCrosshair(this.d.intersectionPoints.corners.upperLeft, "purple")(g, ui);
    }

    if (currentModule && this.showGuideLines) {
      renderDashLine({x: 0 , y: this.d.params.lowerCornerGuideYIntercept}, this.d.intersectionPoints.corners.lowerRight, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({x: 0 , y: this.d.params.lowerCornerGuideYIntercept}, this.d.intersectionPoints.corners.lowerLeft, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({x: 0 , y: this.d.params.upperCornerGuideYIntercept}, this.d.intersectionPoints.corners.upperRight, "purple", 1, "4,4", true)(g, ui);
      renderDashLine({x: 0 , y: this.d.params.upperCornerGuideYIntercept}, this.d.intersectionPoints.corners.upperLeft, "purple", 1, "4,4", true)(g, ui);

    }
  }

  renderPaths = (g: any, ui: any): void => {
    let paths = []
    let cornersCalculated = this.d.shapes.lowerLeftCornerC1 && this.d.intersectionPoints.corners.lowerLeftCornerBottomBodyIntersection


    if (cornersCalculated) {
      let lbc1 = arcPathFrom3Points(this.d.shapes.lowerLeftCornerC2, this.d.intersectionPoints.corners.lowerLeftCornerBottomBodyIntersection, this.d.intersectionPoints.corners.lowerLeft)
      let lbc2 = arcPathFrom3Points(this.d.shapes.lowerBout, this.d.intersectionPoints.corners.lowerLeftCornerBottomBodyIntersection, this.d.intersectionPoints.minorBouts.lowerLeftVesicaUpper)
      let lbc3 = arcPathFrom3Points(this.d.shapes.lowerLeftCornerC1, this.d.intersectionPoints.corners.lowerLeft, this.d.intersectionPoints.corners.lowerLeftCornerTopBodyIntersection)
      
      paths.push(lbc1, lbc2, lbc3);
    }
    else {
      let l1 = arcPathFrom3Points(this.d.shapes.lowerBout, this.d.intersectionPoints.majorBouts.lowerLeft, this.d.intersectionPoints.minorBouts.lowerLeftVesicaUpper)
      let l5 = arcPathFrom3Points(this.d.shapes.lowerBout, this.d.intersectionPoints.minorBouts.lowerRightVesicaUpper, this.d.intersectionPoints.majorBouts.lowerRight)
      paths.push(l1, l5);
    }

    let l2 = arcPathFrom3Points(this.d.shapes.lowerLeftVesaci, this.d.intersectionPoints.minorBouts.lowerLeftVesicaUpper, this.d.intersectionPoints.minorBouts.lowerLeftVesicaLower)
    let l3 = arcPathFrom3Points(this.d.shapes.lowerJoiningCircle, this.d.intersectionPoints.minorBouts.lowerLeftVesicaLower, this.d.intersectionPoints.minorBouts.lowerRightVesicaLower)
    let l4 = arcPathFrom3Points(this.d.shapes.lowerRightVesaci, this.d.intersectionPoints.minorBouts.lowerRightVesicaLower, this.d.intersectionPoints.minorBouts.lowerRightVesicaUpper)
    paths.push(l2, l3, l4);



    if (cornersCalculated) {
      let rbc1 = arcPathFrom3Points(this.d.shapes.lowerRightCornerC2, this.d.intersectionPoints.corners.lowerRight, this.d.intersectionPoints.corners.lowerRightCornerBottomBodyIntersection)
      let rbc2 = arcPathFrom3Points(this.d.shapes.lowerBout, this.d.intersectionPoints.minorBouts.lowerRightVesicaUpper, this.d.intersectionPoints.corners.lowerRightCornerBottomBodyIntersection)
      let rbc3 = arcPathFrom3Points(this.d.shapes.lowerRightCornerC1, this.d.intersectionPoints.corners.lowerRightCornerTopBodyIntersection, this.d.intersectionPoints.corners.lowerRight)
      
      let ruc1 = arcPathFrom3Points(this.d.shapes.upperRightCornerC2, this.d.intersectionPoints.corners.upperRight, this.d.intersectionPoints.corners.upperRightCornerBottomBodyIntersection)
      let luc1 = arcPathFrom3Points(this.d.shapes.upperLeftCornerC2, this.d.intersectionPoints.corners.upperLeftCornerBottomBodyIntersection, this.d.intersectionPoints.corners.upperLeft)

      let c1 = arcPathFrom3Points(this.d.shapes.centerBoutRight, this.d.intersectionPoints.corners.upperRightCornerBottomBodyIntersection, this.d.intersectionPoints.corners.lowerRightCornerTopBodyIntersection)
      let c2 = arcPathFrom3Points(this.d.shapes.centerBoutLeft, this.d.intersectionPoints.corners.lowerLeftCornerTopBodyIntersection, this.d.intersectionPoints.corners.upperLeftCornerBottomBodyIntersection)

      paths.push(rbc1, rbc2, rbc3, ruc1, luc1, c1, c2);
    }
    else {
      let c1 = arcPathFrom3Points(this.d.shapes.centerBoutLeft, this.d.intersectionPoints.majorBouts.lowerLeft, this.d.intersectionPoints.majorBouts.upperLeft)
      let c2 = arcPathFrom3Points(this.d.shapes.centerBoutRight, this.d.intersectionPoints.majorBouts.upperRight, this.d.intersectionPoints.majorBouts.lowerRight)
      paths.push(c1, c2);
    }

    if (cornersCalculated) {
      let rtc1 = arcPathFrom3Points(this.d.shapes.upperRightCornerC1, this.d.intersectionPoints.corners.upperRightCornerTopBodyIntersection, this.d.intersectionPoints.corners.upperRight)
      let rtc2 = arcPathFrom3Points(this.d.shapes.upperBout, this.d.intersectionPoints.corners.upperRightCornerTopBodyIntersection, this.d.intersectionPoints.minorBouts.upperRightVesicaLower)

      
      let luc1 = arcPathFrom3Points(this.d.shapes.upperLeftCornerC1, this.d.intersectionPoints.corners.upperLeft, this.d.intersectionPoints.corners.upperLeftCornerTopBodyIntersection)
      let luc2 = arcPathFrom3Points(this.d.shapes.upperBout, this.d.intersectionPoints.minorBouts.upperLeftVesicaLower, this.d.intersectionPoints.corners.upperLeftCornerTopBodyIntersection)


      paths.push(rtc1, rtc2, luc1, luc2);
    }
    else {
      let u1 = arcPathFrom3Points(this.d.shapes.upperBout, this.d.intersectionPoints.majorBouts.upperRight, this.d.intersectionPoints.minorBouts.upperRightVesicaLower)
      let u5 = arcPathFrom3Points(this.d.shapes.upperBout, this.d.intersectionPoints.minorBouts.upperLeftVesicaLower, this.d.intersectionPoints.majorBouts.upperLeft)
      paths.push(u1, u5);
    }

    let u2 = arcPathFrom3Points(this.d.shapes.upperRightVesaci, this.d.intersectionPoints.minorBouts.upperRightVesicaLower, this.d.intersectionPoints.minorBouts.upperRightVesicaUpper)
    let u3 = arcPathFrom3Points(this.d.shapes.upperJoiningCircle, this.d.intersectionPoints.minorBouts.upperRightVesicaUpper, this.d.intersectionPoints.minorBouts.upperLeftVesicaUpper)
    let u4 = arcPathFrom3Points(this.d.shapes.upperLeftVesaci, this.d.intersectionPoints.minorBouts.upperLeftVesicaUpper, this.d.intersectionPoints.minorBouts.upperLeftVesicaLower)

    paths.push(u2, u3, u4);


    for (let path of paths) {
      renderPath(path, "red")(g, ui);
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

      this.d.intersectionPoints.majorBouts = {
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

      this.d.intersectionPoints.minorBouts = {
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
      let rightTargetCircle: Circle = {x: this.d.shapes.centerBoutRight.x, y: this.d.shapes.centerBoutRight.y, r: this.d.params.cornerTargetRadius};
      let leftTargetCircle: Circle = {x: this.d.shapes.centerBoutLeft.x, y: this.d.shapes.centerBoutLeft.y, r: this.d.params.cornerTargetRadius};
      
      let lowerRightCornerTarget: Circle = {x: rightTargetCircle.x + this.d.params.lowerCornerGuideXOffset, y: rightTargetCircle.y, r: rightTargetCircle.r};
      let lowerLeftCornerTarget: Circle = {x: leftTargetCircle.x - this.d.params.lowerCornerGuideXOffset, y: leftTargetCircle.y, r: leftTargetCircle.r};
      let lowerRightCorner = lineCircleIntersection({x: 0 , y: this.d.params.lowerCornerGuideYIntercept}, lowerRightCornerTarget, rightTargetCircle)[1];
      let lowerLeftCorner = lineCircleIntersection({x: 0 , y: this.d.params.lowerCornerGuideYIntercept}, lowerLeftCornerTarget, leftTargetCircle)[1];
      let upperRightCornerTarget: Circle = {x: rightTargetCircle.x + this.d.params.upperCornerGuideXOffset, y: rightTargetCircle.y, r: rightTargetCircle.r};
      let upperLeftCornerTarget: Circle = {x: leftTargetCircle.x - this.d.params.upperCornerGuideXOffset, y: leftTargetCircle.y, r: leftTargetCircle.r};
      let upperRightCorner = lineCircleIntersection({x: 0 , y: this.d.params.upperCornerGuideYIntercept}, upperRightCornerTarget, rightTargetCircle)[1];
      let upperLeftCorner = lineCircleIntersection({x: 0 , y: this.d.params.upperCornerGuideYIntercept}, upperLeftCornerTarget, leftTargetCircle)[1];
      
      this.d.intersectionPoints.corners.lowerRight = lowerRightCorner;
      this.d.intersectionPoints.corners.lowerLeft = lowerLeftCorner;
      this.d.intersectionPoints.corners.upperRight = upperRightCorner;
      this.d.intersectionPoints.corners.upperLeft = upperLeftCorner;
    }

    // corner cirlces
    if (this.d.params.upperTopCornerCircleRadius && this.d.params.upperBottomCornerCircleRadius && this.d.params.lowerTopCornerCircleRadius && this.d.params.lowerBottomCornerCircleRadius) {
       let lowerTopRightCornerCircle = interceptCirclesAndPoint(this.d.shapes.centerBoutRight, this.d.intersectionPoints.corners.lowerRight, this.d.params.lowerTopCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[0];
      let lowerBottomRightCornerCircle = interceptCirclesAndPoint(this.d.shapes.lowerBout, this.d.intersectionPoints.corners.lowerRight, this.d.params.lowerBottomCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[1];
      let lowerTopLeftCornerCircle = interceptCirclesAndPoint(this.d.shapes.centerBoutLeft, this.d.intersectionPoints.corners.lowerLeft, this.d.params.lowerTopCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[0];
      let lowerBottomLeftCornerCircle = interceptCirclesAndPoint(this.d.shapes.lowerBout, this.d.intersectionPoints.corners.lowerLeft, this.d.params.lowerBottomCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[1];
      
      let upperTopRightCornerCircle = interceptCirclesAndPoint(this.d.shapes.upperBout, this.d.intersectionPoints.corners.upperRight, this.d.params.upperTopCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[0];
      let upperBottomRightCornerCircle = interceptCirclesAndPoint(this.d.shapes.centerBoutRight, this.d.intersectionPoints.corners.upperRight, this.d.params.upperBottomCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[1];
      let upperTopLeftCornerCircle = interceptCirclesAndPoint(this.d.shapes.upperBout, this.d.intersectionPoints.corners.upperLeft, this.d.params.upperTopCornerCircleRadius)
        .sort((a, b) => b.y - a.y)[0];
      let upperBottomLeftCornerCircle = interceptCirclesAndPoint(this.d.shapes.centerBoutLeft, this.d.intersectionPoints.corners.upperLeft, this.d.params.upperBottomCornerCircleRadius)
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

        this.d.intersectionPoints.corners.lowerLeftCornerTopBodyIntersection = lowerLeftCornerTopBodyIntersection;
        this.d.intersectionPoints.corners.lowerLeftCornerBottomBodyIntersection = lowerLeftCornerBottomBodyIntersection;
        this.d.intersectionPoints.corners.lowerRightCornerTopBodyIntersection = lowerRightCornerTopBodyIntersection;
        this.d.intersectionPoints.corners.lowerRightCornerBottomBodyIntersection = lowerRightCornerBottomBodyIntersection;
        this.d.intersectionPoints.corners.upperLeftCornerTopBodyIntersection = upperLeftCornerTopBodyIntersection;
        this.d.intersectionPoints.corners.upperLeftCornerBottomBodyIntersection = upperLeftCornerBottomBodyIntersection;
        this.d.intersectionPoints.corners.upperRightCornerTopBodyIntersection = upperRightCornerTopBodyIntersection;
        this.d.intersectionPoints.corners.upperRightCornerBottomBodyIntersection = upperRightCornerBottomBodyIntersection;
    }
  }

}