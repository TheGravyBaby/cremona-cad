import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dist, widthFromRatio } from '../helpers/helpers';
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
  override openPanel = 'upperBout'

  override d: RecipeInterface = {
    recipeName: 'Beard Violin',
    fileName: "defaultBeard",
    version: ".1",
    ratios: {
      heightMm: 356,
      heightPart: 7,
      widthPart: 4,
      upperBoutReductionDenom: 6,
      lowerRadiiPart: 1,
      lowerGapPart: 1,
      lowerJoinRatioNum: 2,
      lowerJoinRatioDen: 3,
      upperRadiiPart: 1,
      upperGapPart: 1,
    },
    paths: []
  }

  override firstRender = (g: any, ui: any): void => {
    this.renderBounds(g, ui)
    this.renderBoutBounds(g, ui)
    // this.renderLowerVesica(g, ui)
  }

  override onToggle(panel: string, ev: Event) {
    const details = ev.target as HTMLDetailsElement;

    if (details.open) {
      // opened -> make it the active panel and render it
      this.openPanel = panel;

      // render the last opened panel
      if (panel === 'upperBout') this.changeUpperVesica();
      else if (panel === 'base') this.changeBase();
      else if (panel === 'lowerBout') this.changeLowerVesica();
    } else {
      // closed -> don't switch panels (prevents "weird" behavior)
      // optional: if you want to forbid closing the active one, re-open it:
      // if (this.openPanel === panel) queueMicrotask(() => (details.open = true));
    }
  }

  changeBase(): void {
    this.draftChange.emit([this.firstRender]);
  }

  changeLowerVesica(): void {
    this.draftChange.emit([this.renderBoutBounds, this.renderLowerVesica, this.renderAllPaths(this.d.paths)
    ]);
  }

  changeUpperVesica(): void {
    this.draftChange.emit([this.renderBoutBounds, this.renderUpperVesica, this.renderAllPaths(this.d.paths)
    ]);
  }

  renderBounds = (g: any, ui: any): void => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = widthFromRatio(h, this.d.ratios.heightPart, this.d.ratios.widthPart);
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

  renderBoutBounds = (g: any, ui: any) => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = widthFromRatio(h, this.d.ratios.heightPart, this.d.ratios.widthPart);
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
    const upperBoutW = this.d.ratios.upperBoutReductionDenom <= 0 ? w : w - w * (1 / this.d.ratios.upperBoutReductionDenom);
    const upperBoutLeft = -upperBoutW / 2;

    g.append('rect')
      .attr('x', upperBoutLeft)
      .attr('y', h - upperBoutW)
      .attr('width', upperBoutW)
      .attr('height', upperBoutW)
      .attr('fill', 'green')
      .attr('opacity', 0.25);
  }

  renderLowerVesica = (g: any, ui: any): void => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = widthFromRatio(h, this.d.ratios.heightPart, this.d.ratios.widthPart);

    // we need to define two circles that will be bounded inside our bout
    // w = 2 * lowerBoutRadii + lowerGapDist
    // lowerBoutRadii = lowerGapDist *  lowerRadiiPart / lowerGapPart
    // w = 2 * LBR + LBR * lgp/lrp = LBR (2 + lgp/lrp)
    let r = w / (2 + this.d.ratios.lowerGapPart / this.d.ratios.lowerRadiiPart)
    let gap = Math.abs(w - 2 * r)
    let Cx = w / 2 - r
    let Cy = r

    const L = (this.d.ratios.lowerJoinRatioNum / this.d.ratios.lowerJoinRatioDen) * h; // now a COMPASS LENGTH ratio
    let Qy = 0
    let Qx = 0;
    try {
      Qy = this.solveForQyByCompassLength({ h, targetLen: L, Cx, Cy, r });
    }
    catch (e) {
      console.log("Error: " + e)
      Qy = L
    }

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
    let circofX = (x: number) => Cy + Math.sqrt(r * r - Math.pow(x - Cx, 2));

    // now let us solve for the points we intercept 
    // (m*x + h)^2 = Cy ± sqrt(r^2 - (x - Cx)^2)
    // m^2*x^2 + 2mxh + h^2 = x^2 - 2*Cx*x + Cx^2
    // m^2*x^2 - x^2 + 2mxh  + -2*Cx*x =  Cx^2 - h^2 
    // (m+1)x^2   +   2(mh-Cx)x    -   (Cx^2 - h^2)  = 0
    // ax^2      +   bx                +   c             = 0
    const a = m * m + 1;
    const b = 2 * (m * (Qy - Cy) - Cx);
    const c = (Qy - Cy) ** 2 + Cx ** 2 - r * r;
    let quadraticEqPlus = (a: number, b: number, c: number) => (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
    let quadraticEqMinus = (a: number, b: number, c: number) => (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a)

    // great now we have out intersection points, I just happen to know its plus in this case
    let Px = quadraticEqPlus(a, b, c)
    let Py = yofX(Px)

    // we now need to calculate an offset, because the joining arc will currently go into 
    // the -y axis, and we don't want to extend the size of our violin
    let compassDist = dist({ x: Qx, y: Qy }, { x: Px, y: Py })

    // the center of our vesici, in the model thus far, are one radii above x=0
    // lets find the difference between r and compass dist, this is our offset
    let yOffset = compassDist - Qy

    Py += yOffset
    Qy += yOffset
    Cy += yOffset

    let xMax = w / 2

    // now lets define our paths
    let bottomBoutJoin = arcPathFrom3Points({ x: Qx, y: Qy }, { x: -Px, y: Py }, { x: Px, y: Py })
    let leftBout = arcPathFrom3Points({ x: -Cx, y: Cy }, { x: -xMax, y: Cy }, { x: -Px, y: Py })
    let rightBout = arcPathFrom3Points({ x: Cx, y: Cy }, { x: xMax, y: Cy }, { x: Px, y: Py }, { clockwise: false })

    let paths = [
      { name: 'bottomBoutJoin', d: bottomBoutJoin },
      { name: 'leftLowerBout', d: leftBout },
      { name: 'rightLowerBout', d: rightBout }
    ];

    this.addPaths(paths)

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

    this.renderBoxLine(g, ui, { x: w * .7, y: 0 }, { x: w * .7, y: L }, this.d.ratios.lowerJoinRatioNum, "blue", "green", false)
    this.renderBoxLine(g, ui, { x: w * .8, y: 0 }, { x: w * .8, y: h }, this.d.ratios.lowerJoinRatioDen, "blue", "green", true)
    this.drawDashedLine(g, { x: 3 * w, y: L }, { x: -3 * w, y: L })

    let vesicaiRatios = [this.d.ratios.lowerRadiiPart, this.d.ratios.lowerGapPart, this.d.ratios.lowerRadiiPart]
    this.renderBoxLine(g, ui, { x: -xMax, y: -25 }, { x: xMax, y: -25 }, vesicaiRatios, "blue", "green", true, { labelMode: "segmentWeight" })

  }

  renderUpperVesica = (g: any, ui: any): void => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = widthFromRatio(h, this.d.ratios.heightPart, this.d.ratios.widthPart);
    const upW = this.d.ratios.upperBoutReductionDenom <= 0 ? w : w - w * (1 / this.d.ratios.upperBoutReductionDenom);

    // we need to define two circles that will be bounded inside our bout
    // w = 2 * lowerBoutRadii + lowerGapDist
    // lowerBoutRadii = lowerGapDist *  lowerRadiiPart / lowerGapPart
    // w = 2 * LBR + LBR * lgp/lrp = LBR (2 + lgp/lrp)
    let r = upW / (2 + this.d.ratios.upperGapPart / this.d.ratios.lowerRadiiPart)
    let gap = Math.abs(w - 2 * r)
    let Cx = upW / 2 - r
    let Cy = h - r

    const L = (this.d.ratios.lowerJoinRatioNum / this.d.ratios.lowerJoinRatioDen) * h; // now a COMPASS LENGTH ratio
    let Qy = 0
    let Qx = 0;
    try {
      Qy = this.solveForQyByCompassLength({ h, targetLen: L, Cx, Cy, r });
    }
    catch (e) {
      console.log("Error: " + e)
      Qy = L
    }

    const m = (Cy - Qy) / (Cx - Qx); // Qx = 0
    const yofX = (x: number) => m * x + Qy;
    let circofX = (x: number) => Cy + Math.sqrt(r * r - Math.pow(x - Cx, 2));
    const a = m * m + 1;
    const b = 2 * (m * (Qy - Cy) - Cx);
    const c = (Qy - Cy) ** 2 + Cx ** 2 - r * r;
    let quadraticEqPlus = (a: number, b: number, c: number) => (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
    let quadraticEqMinus = (a: number, b: number, c: number) => (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a)
    let Px = quadraticEqPlus(a, b, c)
    let Py = yofX(Px)
    let compassDist = dist({ x: Qx, y: Qy }, { x: Px, y: Py })
    let yOffset = compassDist - Qy
    // Py += yOffset
    // Qy += yOffset
    // Cy += yOffset

    let xMax = w / 2

    // now lets define our paths
    let bottomBoutJoin = arcPathFrom3Points({ x: Qx, y: Qy }, { x: -Px, y: Py }, { x: Px, y: Py })
    let leftBout = arcPathFrom3Points({ x: -Cx, y: Cy }, { x: -xMax, y: Cy }, { x: -Px, y: Py })
    let rightBout = arcPathFrom3Points({ x: Cx, y: Cy }, { x: xMax, y: Cy }, { x: Px, y: Py }, { clockwise: false })

    // vesecai
    g.append('circle')
      .attr('cx', Cx)
      .attr('cy', Cy)
      .attr('r', r)
      .attr('stroke', 'green')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
    g.append('circle')
      .attr('cx', Cx)
      .attr('cy', Cy)
      .attr('r', 1)
      .attr('stroke', 'green')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');

    // mirror vesecai
    g.append('circle')
      .attr('cx', - Cx)
      .attr('cy', Cy)
      .attr('r', r)
      .attr('stroke', 'green')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
    g.append('circle')
      .attr('cx', -Cx)
      .attr('cy', Cy)
      .attr('r', 1)
      .attr('stroke', 'green')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');


    // joining arc compass
    // g.append('circle')
    //   .attr('cx', Qx)
    //   .attr('cy', Qy)
    //   .attr('r', 1)
    //   .attr('stroke', 'blue')
    //   .attr('fill', 'none')
    //   .attr('stroke-width', 2)
    //   .attr('vector-effect', 'non-scaling-stroke')

    // g.append("line")
    //   .attr("x1", Qx)
    //   .attr("y1", Qy)
    //   .attr("x2", Px)
    //   .attr("y2", Py)
    //   .attr("stroke", "blue")
    //   .attr('stroke-width', 2)
    //   .attr('vector-effect', 'non-scaling-stroke')
    //   .attr('opacity', 0.25);
    // g.append("line")
    //   .attr("x1", Qx)
    //   .attr("y1", Qy)
    //   .attr("x2", -Px)
    //   .attr("y2", Py)
    //   .attr("stroke", "blue")
    //   .attr('stroke-width', 2)
    //   .attr('vector-effect', 'non-scaling-stroke')
    //   .attr('opacity', 0.25);

    // g.append("path")
    //   .attr("d", bottomBoutJoin)
    //   .attr("fill", "none")
    //   .attr("stroke", "red")
    //   .attr("stroke-width", 2);
    // g.append("path")
    //   .attr("d", leftBout)
    //   .attr("fill", "none")
    //   .attr("stroke", "red")
    //   .attr("stroke-width", 2);
    // g.append("path")
    //   .attr("d", rightBout)
    //   .attr("fill", "none")
    //   .attr("stroke", "red")
    //   .attr("stroke-width", 2);

    // this.renderBoxLine(g, ui, { x: w * .7, y: 0 }, { x: w * .7, y: L }, this.d.ratios.lowerJoinRatioNum, "blue", "green", false)
    // this.renderBoxLine(g, ui, { x: w * .8, y: 0 }, { x: w * .8, y: h }, this.d.ratios.lowerJoinRatioDen, "blue", "green", true)
    // this.drawDashedLine(g, { x: 3 * w, y: L }, { x: -3 * w, y: L })

    // let vesicaiRatios = [this.d.ratios.lowerRadiiPart, this.d.ratios.lowerGapPart, this.d.ratios.lowerRadiiPart]
    // this.renderBoxLine(g, ui, { x: -xMax, y: -25 }, { x: xMax, y: -25 }, vesicaiRatios, "blue", "green", true, { labelMode: "segmentWeight" })

  }

  renderAllPaths = (paths: Array<{ d: string }>) => (g: any, ui: any) => {
    paths.forEach(p => {
      g.append("path")
        .attr("d", p.d)
        .attr("fill", "none")
        .attr("stroke", "red")
        .attr("stroke-width", 2);
    });
  };

  addPaths(calcs: {name: string, d: string}[]) {
    this.d.paths = this.d.paths || [];
    for (const entry of calcs) {
      const idx = this.d.paths.findIndex((c: any) => c.name === entry.name);
      if (idx === -1) this.d.paths.push(entry);
      else this.d.paths[idx] = entry;
    }
  }

  solveForQyByCompassLength(opts: {
    h: number;
    targetLen: number;   // L = ratio * h
    Cx: number;
    Cy: number;
    r: number;
    pickRoot?: "plus" | "minus";
  }) {
    const { h, targetLen, Cx, Cy, r } = opts;

    const compassDistForQy = (Qy: number) => {
      const Qx = 0;
      const m = (Cy - Qy) / (Cx - Qx); // Cx should be > 0
      const yofX = (x: number) => m * x + Qy;

      // Line-circle intersection quadratic 
      const a = m * m + 1;
      const b = 2 * (m * (Qy - Cy) - Cx);
      const c = (Qy - Cy) ** 2 + Cx ** 2 - r * r;

      const disc = b * b - 4 * a * c;
      if (disc < 0) return NaN;

      const sqrtDisc = Math.sqrt(disc);
      const xPlus = (-b + sqrtDisc) / (2 * a);
      const xMinus = (-b - sqrtDisc) / (2 * a);

      // Choose the intersection on the right side of the right circle.
      // Usually that means "the larger x" (but keep it explicit).
      const Px = Math.max(xPlus, xMinus);
      const Py = yofX(Px);

      return dist({ x: Qx, y: Qy }, { x: Px, y: Py });
    };

    // Bracket the root
    // You can tune these bounds based on your geometry.
    let lo = 0;
    let hi = h;

    let fLo = compassDistForQy(lo) - targetLen;
    let fHi = compassDistForQy(hi) - targetLen;

    // If we failed to bracket (can happen with weird ratios), expand search a bit.
    if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) {
      lo = -h;
      hi = 2 * h;
      fLo = compassDistForQy(lo) - targetLen;
      fHi = compassDistForQy(hi) - targetLen;
    }

    if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) {
      throw new Error("Could not bracket a solution for Qy (compass length target may be impossible).");
    }

    // Bisection
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const fMid = compassDistForQy(mid) - targetLen;

      if (!Number.isFinite(fMid)) {
        // Nudge if we hit a NaN region
        hi = mid;
        continue;
      }

      if (Math.abs(fMid) < 1e-6) return mid;

      if (fLo * fMid <= 0) {
        hi = mid;
        fHi = fMid;
      } else {
        lo = mid;
        fLo = fMid;
      }
    }

    return (lo + hi) / 2;
  }

}
