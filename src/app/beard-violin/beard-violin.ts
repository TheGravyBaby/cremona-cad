import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { widthFromRatio } from '../helpers/helpers';
import { RecipeInterface } from '../models/recipe';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { arcPathFrom3Points } from '../helpers/helpers';

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
      lowerRadiiPart: 10,
      lowerGapPart: 10,
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
    let t = this.d.ratios.lowerJoinAngle

    // we need to define two circles that will be bounded inside our bout
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
    // this was traditionally done with a compass
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
    // we can now define the points for our compass
    let Py = (t: number) => ( (Cy - QyofT(t))/(Cx - QxofT(t)) ) * -QxofT(t) + QyofT(t)
    let Qx = (t: number) => QxofT(t)
    let Qy = (t: number) => QyofT(t)

    // the arc being drawn will go below x=0, so to keep our distances correct, we need to correct our bouts
    // lets start by calculating the compass distance
    let compassDist = (t: number ) => Math.sqrt(Math.pow((Qx(t)-0), 2) + Math.pow((Qy(t) - Py(t)),2) )

    // the center of our vesici, in the model thus far, are one radii above x=0
    // lets find the difference between r and compass dist, this is our offset
    let yOffset = (t: number) => compassDist(t) - Py(t)

    // great now lets define some fixed values instead of functions

    let yOff = yOffset(t)
    let qx = Qx(t)
    let qy = Qy(t) + yOff
    let py = Py(t) + yOff


    // now lets define our paths
    let leftBoutJoin = arcPathFrom3Points({x: -Cx, y: Cy + yOff}, {x: -w/2, y: Cy + yOff}, {x: -qx, y: qy})
    let bottomBoutJoin = arcPathFrom3Points({x: 0, y: py}, {x: -qx, y: qy}, {x: qx, y: qy})
    let rightBoutJoin = arcPathFrom3Points({x: Cx, y: Cy + yOff}, {x: qx, y: qy}, {x: w/2, y: Cy + yOff})


    // vesecai
    g.append('circle')
      .attr('cx', Cx)
      .attr('cy', Cy + yOff)
      .attr('r', r)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
     g.append('circle')
      .attr('cx', Cx)
      .attr('cy', Cy + yOff)
      .attr('r', 2)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
    
    // mirror vesecai
     g.append('circle')
      .attr('cx', - Cx)
      .attr('cy', Cy + yOff)
      .attr('r', r)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
    g.append('circle')
      .attr('cx', -Cx)
      .attr('cy', Cy + yOff)
      .attr('r', 2)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');


    // joining arc compass
    // g.append('circle')
    //   .attr('cx', qx)
    //   .attr('cy', qy)
    //   .attr('r', 1)
    //   .attr('stroke', 'blue')
    //   .attr('fill', 'none')
    //   .attr('stroke-width', 2)
    //   .attr('vector-effect', 'non-scaling-stroke')
    // g.append('circle')
    //   .attr('cx', -qx)
    //   .attr('cy', qy)
    //   .attr('r', 1)
    //   .attr('stroke', 'blue')
    //   .attr('fill', 'none')
    //   .attr('stroke-width', 2)
    //   .attr('vector-effect', 'non-scaling-stroke')
    // g.append('circle')
    //   .attr('cx', 0)
    //   .attr('cy', py)
    //   .attr('r', 2)
    //   .attr('stroke', 'blue')
    //   .attr('fill', 'none')
    //   .attr('stroke-width', 2)
    //   .attr('vector-effect', 'non-scaling-stroke')


    g.append("line")
      .attr("x1", 0)
      .attr("y1", py)
      .attr("x2", qx)
      .attr("y2", qy)
      .attr("stroke", "blue")
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0.25);
    g.append("line")
      .attr("x1", 0)
      .attr("y1", py)
      .attr("x2", -qx)
      .attr("y2", qy)
      .attr("stroke", "blue")
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0.25);


    g.append("path")
      .attr("d", bottomBoutJoin)
      .attr("fill", "none")
      .attr("stroke", "red")
      .attr("stroke-width", 2);
    g.append("path")
      .attr("d", leftBoutJoin)
      .attr("fill", "none")
      .attr("stroke", "red")
      .attr("stroke-width", 2);
    g.append("path")
      .attr("d", rightBoutJoin)
      .attr("fill", "none")
      .attr("stroke", "red")
      .attr("stroke-width", 2);
  }


}
