import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Circle } from '../models/types';
import { renderCircle, renderDashedLine, renderDashLine, renderDistanceMeasurementLine, renderPath } from '../helpers/renderFuncs';
import { arcPathFrom3Points, circleCircleIntersections, findJoiningCircleFromCircleAndPoint } from '../helpers/draftMath';
import { arc } from 'd3';

@Component({
  selector: 'app-kelly-violin',
  imports: [FormsModule],
  templateUrl: './kelly-violin.html',
  styleUrls: ['../sidebar.css', './kelly-violin.css']
})

export class KellyViolin extends RecipeComponentBase {

  showInsetGuides = true;
  showCircles = true;

  override d = {
    recipeName: 'Kelly Violin',
    fileName: "Kelly-Baltic",
    version: ".1",
    params: {
      h: 348,
      w: 203,
      inset: 4,
      upperBoutWidth: 156,
      upperBoutCenter: 283,
      lowerBoutWidth: 195,
      lowerBoutCenter: 73,
      centerBoutRadius: 80.5,
      upperVesaciRadius: 57,
      lowerVesaciRadius: 66,
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

    if (details.open) {
      // opened -> make it the active panel and render it
      this.openPanel = panel;


      if (panel === 'base') this.changeBaseMeasurements();
      else if (panel === 'mainBouts') this.changeMainBouts();
      else if (panel === 'minorBouts') this.changeMinorBouts();
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
    this.draftChange.emit([this.renderBounds]);
  }

  changeMainBouts() {
    this.draftChange.emit([this.renderBounds, this.renderMainBouts(true)]);
  }

  changeMinorBouts() {
    this.draftChange.emit([this.renderBounds, this.renderMainBouts(false), this.renderMinorBouts]);
  }


  renderMainBouts = (guides: boolean) => (g: any, ui: any): void => {
    this.d.shapes.upperBout = { x: 0, y: this.d.params.upperBoutCenter, r: this.d.params.upperBoutWidth / 2 };
    this.d.shapes.lowerBout = { x: 0, y: this.d.params.lowerBoutCenter, r: this.d.params.lowerBoutWidth / 2 };

    // defining some terms, L is lower bout circle, U is upper bout circle, C is center bout circle
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
    let Uc = this.d.params.centerBoutRadius + this.d.params.upperBoutWidth / 2; // distance from center of U to edge of C
    let Lc = this.d.params.centerBoutRadius + this.d.params.lowerBoutWidth / 2; // distance from center of L to edge of C

    // using law of cosines to find angle t
    let cosT = (Ul * Ul + Uc * Uc - Lc * Lc) / (2 * Ul * Uc);
    let t = Math.acos(cosT);

    // now we can find the coordinates of the center of C
    let Cx = Uc * Math.sin(t);
    let Cy = this.d.params.upperBoutCenter - Uc * Math.cos(t);

    this.d.shapes.centerBoutLeft = { x: -Cx, y: Cy, r: this.d.params.centerBoutRadius };
    this.d.shapes.centerBoutRight = { x: Cx, y: Cy, r: this.d.params.centerBoutRadius };

    let waistWidth = (this.d.shapes.centerBoutRight.x - this.d.params.centerBoutRadius) * 2;

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

    if (this.showCircles) {
      renderCircle(this.d.shapes.upperBout, "red")(g, ui);
      renderCircle(this.d.shapes.lowerBout, "black")(g, ui);
      renderCircle(this.d.shapes.centerBoutLeft, "blue")(g, ui);
      renderCircle(this.d.shapes.centerBoutRight, "blue")(g, ui);
    }


    if (guides) {
      renderDashedLine({ x: -1000, y: Cy }, { x: 1000, y: Cy }, "blue")(g, ui);
      renderDashedLine({ x: -1000, y: this.d.params.lowerBoutCenter }, { x: 1000, y: this.d.params.lowerBoutCenter }, "black")(g, ui);
      renderDashedLine({ x: -1000, y: this.d.params.upperBoutCenter }, { x: 1000, y: this.d.params.upperBoutCenter }, "red")(g, ui);
    }

    if (this.showInsetGuides && guides) {
      let inset = this.d.params.inset;
      let insetWaist = waistWidth + 2 * inset;
      let insetLowerBout = this.d.params.lowerBoutWidth  + 2 * inset;
      let insetUpperBout = this.d.params.upperBoutWidth  + 2 * inset;

      renderDistanceMeasurementLine({ x: -insetWaist / 2, y: Cy }, { x: insetWaist / 2, y: Cy }, insetWaist.toFixed(1) + " mm", "blue")(g, ui);
      renderDistanceMeasurementLine({ x: -insetLowerBout / 2, y: this.d.params.lowerBoutCenter }, { x: insetLowerBout / 2, y: this.d.params.lowerBoutCenter }, insetLowerBout.toFixed(1) + " mm", "black")(g, ui);
      renderDistanceMeasurementLine({ x: -insetUpperBout / 2, y: this.d.params.upperBoutCenter }, { x: insetUpperBout / 2, y: this.d.params.upperBoutCenter }, insetUpperBout.toFixed(1) + " mm", "red")(g, ui);
    }
  }

  renderMinorBouts = (g: any, ui: any): void => {
    let lowerRightVesica = {x: this.d.params.lowerBoutWidth/2 - this.d.params.lowerVesaciRadius, y: this.d.params.lowerBoutCenter, r: this.d.params.lowerVesaciRadius};
    let lowerLeftVesica = {x: -this.d.params.lowerBoutWidth/2 + this.d.params.lowerVesaciRadius, y: this.d.params.lowerBoutCenter, r: this.d.params.lowerVesaciRadius};
    let upperRightVesica = {x: this.d.params.upperBoutWidth/2 - this.d.params.upperVesaciRadius, y: this.d.params.upperBoutCenter, r: this.d.params.upperVesaciRadius};
    let upperLeftVesica = {x: -this.d.params.upperBoutWidth/2 + this.d.params.upperVesaciRadius, y: this.d.params.upperBoutCenter, r: this.d.params.upperVesaciRadius};
    let upperJoiningCircle = findJoiningCircleFromCircleAndPoint(upperRightVesica, {x: 0, y: this.d.params.h - this.d.params.inset})
    let lowerJoiningCircle = findJoiningCircleFromCircleAndPoint(lowerRightVesica, {x: 0, y: this.d.params.inset})

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


    if (this.showCircles) {
      renderCircle(upperRightVesica, "orange")(g, ui);
      renderCircle(upperLeftVesica, "orange")(g, ui);
      renderCircle(upperJoiningCircle, "orange")(g, ui);
      renderCircle(lowerRightVesica, "green")(g, ui);
      renderCircle(lowerLeftVesica, "green")(g, ui);
      renderCircle(lowerJoiningCircle, "green")(g, ui);
    }
    
    this.renderPaths(g, ui);
  }

  renderPaths = (g: any, ui: any): void => {

    let paths = []

    if (this.d.shapes.lowerLeftCornerC1) {
      // todo
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


    if (this.d.shapes.upperLeftCornerC1) {
      // todo
    }
    else {
      let c1 = arcPathFrom3Points(this.d.shapes.centerBoutLeft, this.d.intersectionPoints.majorBouts.lowerLeft, this.d.intersectionPoints.majorBouts.upperLeft)
      let c2 = arcPathFrom3Points(this.d.shapes.centerBoutRight, this.d.intersectionPoints.majorBouts.upperRight, this.d.intersectionPoints.majorBouts.lowerRight)
      paths.push(c1, c2);
    }

    if (this.d.shapes.upperLeftCornerC1) {
      // todo
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


  // render functions
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

}
