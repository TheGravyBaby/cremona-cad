import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { widthFromRatio } from '../helpers/helpers';
import { RecipeInterface } from '../models/recipe';
import { RecipeComponentBase } from '../recipe-base/recipe-base';

@Component({
  selector: 'app-beard-violin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './beard-violin.html',
  styleUrls: ['../sidebar.css', './beard-violin.css'],
})

export class BeardViolinComponent extends RecipeComponentBase {
  override openPanel = 'lowerBout'

  override d: RecipeInterface = {
    recipeName: 'Beard Violin',
    fileName: "defaultBeard",
    version: ".1",
    ratios: {
      heightMm: 356,
      ratioHeight: 7,
      ratioWidth: 4,
      upperBoutReduction: 6,
      lowerRadiiPart: 5,
      lowerGapPart: 4,
      lowerJoinAngle: 7/4 * Math.PI,
      upperRadiiPart: 1,
      upperGrapPart: 1,
    },
    calcs: {}
  }

  override firstRender = (g: any): void => {
    // this.renderBounds(g)
    this.renderBoutBounds(g)
    this.renderLowerVesica(g)
  }

  changeBase(): void {
    this.draftChange.emit([this.firstRender]);
  }

  changeVesica(): void {
    this.draftChange.emit([this.renderBoutBounds, this.renderLowerVesica]);
  }

  renderBounds = (g: any): void => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = widthFromRatio(h, this.d.ratios.ratioHeight, this.d.ratios.ratioWidth);
    const xLeft = -w / 2;

    // bounding rect (above x-axis)
    g.append('rect')
      .attr('x', xLeft)
      .attr('y', 0)
      .attr('width', w)
      .attr('height', h)
      .attr('fill', 'none')
      .attr('stroke', '#222')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
  }

  renderBoutBounds = (g: any) => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = widthFromRatio(h, this.d.ratios.ratioHeight, this.d.ratios.ratioWidth);
    const xLeft = -w / 2;

    // bottom square
    g.append('rect')
      .attr('x', xLeft)
      .attr('y', 0)
      .attr('width', w)
      .attr('height', w)
      .attr('fill', 'blue')
      .attr('opacity', 0.25);

    // top square using reduction
    const upperBoutW = this.d.ratios.upperBoutReduction <= 0 ? w : w - w * (1 / this.d.ratios.upperBoutReduction);
    const upperBoutLeft = -upperBoutW / 2;

    g.append('rect')
      .attr('x', upperBoutLeft)
      .attr('y', h - upperBoutW)
      .attr('width', upperBoutW)
      .attr('height', upperBoutW)
      .attr('fill', 'green')
      .attr('opacity', 0.25);

  }

  renderLowerVesica = (g: any): void => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = widthFromRatio(h, this.d.ratios.ratioHeight, this.d.ratios.ratioWidth);

    // w = 2 * lowerBoutRadii + lowerGapDist
    // lowerBoutRadii = lowerGapDist *  lowerRadiiPart / lowerGapPart
    // thus
    // w = 2 * LBR + LBR * lgp/lrp = LBR (2 + lgp/lrp)
    // thus
    let r = w / ( 2+ this.d.ratios.lowerGapPart / this.d.ratios.lowerRadiiPart)
    let gap = Math.abs(w - 2 * r)
    let Cx = w/2 - r
    let Cy = r

    // now we want to create a joining arc
    // we can start by just getting a line going 
    // we'll define a point Q along the circle at some angle theta, lets pick one for example
    let QxofT = (t: number) =>  Math.cos(t) * r + Cx
    let QyofT = (t: number ) => Math.sin(t) * r + r

    // we now want a perpendicular line, thus a line between Q and C
    // equation of a line between two points is 
    // y- y1 = m (x-x1) where m is the slope defined as (y2-y1/ x2-x1)
    // thus
    // y = (y2-y1/ x2-x1) * (x-x1) + y1, or in our terms
    // y = (Cy-Qy/ Cx-Qx) * (x-Qx) + Qy
    let yofX = (x: number, t: number) => ( (Cy - QyofT(t))/(Cx - QxofT(t)) ) * (x-QxofT(t)) + QyofT(t)

    // now we want to define a point P where our line from Q to C intercepts the Y axis
    // x will always be 0, thats helpful, now we can just get a function y of theta
    let yofTheta = (t: number) => yofX(0,t)

    let t = this.d.ratios.lowerJoinAngle
    let Py = yofTheta(t)
    let Qx = QxofT(t)
    let Qy = QyofT(t)

    g.append('circle')
      .attr('cx', Cx)
      .attr('cy', Cy)
      .attr('r', r)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
     g.append('circle')
      .attr('cx', Cx)
      .attr('cy', r)
      .attr('r', 1)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
    
    // mirror circle
     g.append('circle')
      .attr('cx', - Cx)
      .attr('cy', Cy)
      .attr('r', r)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
    g.append('circle')
      .attr('cx', -Cx)
      .attr('cy', Cy)
      .attr('r', 1)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');


    g.append('circle')
      .attr('cx', Qx)
      .attr('cy', Qy)
      .attr('r', 1)
      .attr('stroke', 'red')
      .attr('fill', 'none')
      .attr('stroke-width', 5)
      .attr('vector-effect', 'non-scaling-stroke');
    // g.append('circle')
    //   .attr('cx', -Qx)
    //   .attr('cy', Qy)
    //   .attr('r', 1)
    //   .attr('stroke', 'red')
    //   .attr('fill', 'none')
    //   .attr('stroke-width', 5)
    //   .attr('vector-effect', 'non-scaling-stroke');
    g.append('circle')
      .attr('cx', 0)
      .attr('cy', Py)
      .attr('r', 1)
      .attr('stroke', 'red')
      .attr('fill', 'none')
      .attr('stroke-width', 5)
    //   .attr('vector-effect', 'non-scaling-stroke');
    // g.append("line")
    //   .attr("x1", 0)
    //   .attr("y1", Q)
    //   .attr("x2", Qx)
    //   .attr("y2", Qy)
    //   .attr("stroke", "red")
    //   .attr('stroke-width', 2)
    //   .attr('vector-effect', 'non-scaling-stroke');
    // g.append("line")
    //   .attr("x1", 0)
    //   .attr("y1", yofTheta)
    //   .attr("x2", -Qx)
    //   .attr("y2", Qy)
    //   .attr("stroke", "red")
    //   .attr('stroke-width', 2)
    //   .attr('vector-effect', 'non-scaling-stroke');
  }


}
