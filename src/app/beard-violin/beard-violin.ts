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
      lowerJoinRatio: .75,
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

    // we need to define two circles that will be bounded inside our bout
    // w = 2 * lowerBoutRadii + lowerGapDist
    // lowerBoutRadii = lowerGapDist *  lowerRadiiPart / lowerGapPart
    // w = 2 * LBR + LBR * lgp/lrp = LBR (2 + lgp/lrp)
    let r = w / ( 2+ this.d.ratios.lowerGapPart / this.d.ratios.lowerRadiiPart)
    let gap = Math.abs(w - 2 * r)
    let Cx = w/2 - r
    let Cy = r

    // Q will be a point on the y axis from which we will draw our joining arc
    let Qy = this.d.ratios.lowerJoinRatio * h
    let Qx = 0

    // lets define a line between our point Q 
    // and the midpoint of our right most circle
    // y = mx + b
    // slope is 
    const m = (Cy - Qy) / (Cx - Qx); // Qx = 0
    const yofX = (x: number) => m * x + Qy;

    // now we want to find the intersection point on our right most circle
    // r^2 = (y- Cy)^2 + (x-Cx)^2, in this case we want to solve for 
    // y = Cy ± sqrt(r^2 - (x - Cx)^2)
    // we don't need the function but why not
    let circofX = (x: number) => Cy + Math.sqrt(r*r - Math.pow(x - Cx, 2));

    // now let us solve for the points we intercept 
    // (m*x + h)^2 = Cy ± sqrt(r^2 - (x - Cx)^2)
    // m^2*x^2 + 2mxh + h^2 = x^2 - 2*Cx*x + Cx^2
    // m^2*x^2 - x^2 + 2mxh  + -2*Cx*x =  Cx^2 - h^2 
    // (m+1)x^2   +   2(mh-Cx)x    -   (Cx^2 - h^2)  = 0
    // ax^2      +   bx                +   c             = 0
    const a = m*m + 1;
    const b = 2 * (m * (Qy - Cy) - Cx);
    const c = (Qy - Cy)**2 + Cx**2 - r*r;  
    let quadraticEqPlus  = (a: number, b: number, c: number) => (-b + Math.sqrt(b*b - 4*a*c)) / (2*a)
    let quadraticEqMinus = (a: number, b: number, c: number) => (-b - Math.sqrt(b*b - 4*a*c)) / (2*a)

    // great now we have out intersection points, I just happen to know its plus in this case
    let Px = quadraticEqPlus(a,b,c)
    let Py = yofX(Px)    

    // we now need to calculate an offset, because the joining arc will currently go into 
    // the -y axis, and we don't want to extend the size of our violin
    let compassDist = Math.sqrt(Math.pow((Qx-Px), 2) + Math.pow((Qy - Py),2) )

    // the center of our vesici, in the model thus far, are one radii above x=0
    // lets find the difference between r and compass dist, this is our offset
    let yOffset = compassDist - Qy

    Py += yOffset
    Qy += yOffset
    Cy += yOffset

    let xMax = w/2

    // // now lets define our paths
    let bottomBoutJoin = arcPathFrom3Points({x: Qx, y: Qy}, {x: -Px, y: Py}, {x: Px, y: Py})
    let leftBoutJoin = arcPathFrom3Points({x: -Cx, y: Cy}, {x: -xMax, y: Cy}, {x: -Px, y: Py})
    let rightBoutJoin = arcPathFrom3Points({x: Cx, y: Cy}, {x: xMax, y: Cy}, {x: Px, y: Py}, {clockwise: false})

    // vesecai
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
      .attr('cy', Cy)
      .attr('r', 1)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
    
    // mirror vesecai
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


    // joining arc compass
    g.append('circle')
      .attr('cx', Qx)
      .attr('cy', Qy)
      .attr('r', 1)
      .attr('stroke', 'blue')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke')

    g.append("line")
      .attr("x1", Qx)
      .attr("y1", Qy)
      .attr("x2", Px)
      .attr("y2", Py)
      .attr("stroke", "blue")
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0.25);
    g.append("line")
      .attr("x1", Qx)
      .attr("y1", Qy)
      .attr("x2", -Px)
      .attr("y2", Py)
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
