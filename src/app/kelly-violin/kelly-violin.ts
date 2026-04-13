import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Circle } from '../models/types';
import { renderCircle, renderDashedLine, renderDashLine, renderDistanceMeasurementLine } from '../helpers/renderFuncs';

@Component({
  selector: 'app-kelly-violin',
  imports: [FormsModule],
  templateUrl: './kelly-violin.html',
  styleUrls: ['../sidebar.css', './kelly-violin.css']
})

export class KellyViolin extends RecipeComponentBase {

  showInsetGuides = true;

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
      lowerBoutCenter: 72,
      centerBoutRadius: 80.5,
    },
    shapes: {
      upperBout: { x: 0, y: 0, r: 0 } as Circle,
      lowerBout: { x: 0, y: 0, r: 0 } as Circle,
      centerBoutLeft: { x: 0, y: 0, r: 0 } as Circle,
      centerBoutRight: { x: 0, y: 0, r: 0 } as Circle
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
    this.draftChange.emit([this.renderBounds, this.renderMainBouts]);
  }


  renderMainBouts = (g: any, ui: any): void => {
    this.d.shapes.upperBout = { x: 0, y: this.d.params.upperBoutCenter, r: this.d.params.upperBoutWidth / 2 };
    this.d.shapes.lowerBout = { x: 0, y: this.d.params.lowerBoutCenter, r: this.d.params.lowerBoutWidth / 2 };

    renderCircle(this.d.shapes.upperBout, "red")(g, ui);
    renderDashedLine({ x: -1000, y: this.d.params.upperBoutCenter }, { x: 1000, y: this.d.params.upperBoutCenter }, "red")(g, ui);
    renderCircle(this.d.shapes.lowerBout, "black")(g, ui);
    renderDashedLine({ x: -1000, y: this.d.params.lowerBoutCenter }, { x: 1000, y: this.d.params.lowerBoutCenter }, "black")(g, ui);

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

    renderCircle(this.d.shapes.centerBoutLeft, "blue")(g, ui);
    renderCircle(this.d.shapes.centerBoutRight, "blue")(g, ui);

    // render a blue dashed line at the center of the bouts
    renderDashedLine({ x: -1000, y: Cy }, { x: 1000, y: Cy }, "blue")(g, ui);

    let waistWidth = (this.d.shapes.centerBoutRight.x - this.d.params.centerBoutRadius) * 2;


    if (this.showInsetGuides) {
      let inset = this.d.params.inset;
      let insetWaist = waistWidth + 2 * inset;
      let insetLowerBout = this.d.params.lowerBoutWidth  + 2 * inset;
      let insetUpperBout = this.d.params.upperBoutWidth  + 2 * inset;

      renderDistanceMeasurementLine({ x: -insetWaist / 2, y: Cy }, { x: insetWaist / 2, y: Cy }, insetWaist.toFixed(1) + " mm", "blue")(g, ui);
      renderDistanceMeasurementLine({ x: -insetLowerBout / 2, y: this.d.params.lowerBoutCenter }, { x: insetLowerBout / 2, y: this.d.params.lowerBoutCenter }, insetLowerBout.toFixed(1) + " mm", "black")(g, ui);
      renderDistanceMeasurementLine({ x: -insetUpperBout / 2, y: this.d.params.upperBoutCenter }, { x: insetUpperBout / 2, y: this.d.params.upperBoutCenter }, insetUpperBout.toFixed(1) + " mm", "red")(g, ui);
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
