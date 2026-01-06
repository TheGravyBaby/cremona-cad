import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dist, lineCircleIntersection, pointOnCircle, solveYOnCircleInset } from '../helpers/helpers';
import { RecipeInterface } from '../models/recipe';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { arcPathFrom3Points } from '../helpers/helpers';
import { Circle } from '../models/types';

@Component({
  selector: 'app-beard-violin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './beard-violin.html',
  styleUrls: ['../sidebar.css', './beard-violin.css'],
})

export class BeardViolinComponent extends RecipeComponentBase {
  override openPanel = 'base'

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
      upperJoinRatioNum: 2,
      upperJoinRatioDen: 3,

      waistCenterNum: 11,
      waistCenterDen: 20
    },
    calcs: []
  }

  lowerBoutError = ""
  upperBoutError = ""

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
      else if (panel == 'centerBouts') this.changeCenterBouts();
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
    this.draftChange.emit([this.renderBoutBounds, this.renderLowerVesica(true), this.renderUpperVesica(false)])
  }

  changeUpperVesica(): void {
    this.draftChange.emit([this.renderBoutBounds, this.renderLowerVesica(false), this.renderUpperVesica(true)]);
  }

  changeCenterBouts(): void {
     this.draftChange.emit([this.renderBoutBounds, this.renderLowerVesica(false), this.renderUpperVesica(false), this.renderCenterBout(true)]);
  }

  renderBounds = (g: any, ui: any): void => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = h * this.d.ratios.widthPart / this.d.ratios.heightPart;
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
    const w = h * this.d.ratios.widthPart / this.d.ratios.heightPart;
    const xLeft = -w / 2;

    // top square using reduction
    const upperBoutW = this.d.ratios.upperBoutReductionDenom <= 0 ? w : w - w * (1 / this.d.ratios.upperBoutReductionDenom);
    const upperBoutLeft = -upperBoutW / 2;

    g.append('rect')
      .attr('x', xLeft)
      .attr('y', 0)
      .attr('width', w)
      .attr('height', w)
      .attr('fill', 'blue')
      .attr('opacity', 0.25);
    g.append('rect')
      .attr('x', upperBoutLeft)
      .attr('y', h - upperBoutW)
      .attr('width', upperBoutW)
      .attr('height', upperBoutW)
      .attr('fill', 'green')
      .attr('opacity', 0.25);
  }

  renderLowerVesica = (guides: boolean = false) => (g: any, ui: any) => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = h * this.d.ratios.widthPart / this.d.ratios.heightPart;

    // this is the arc of our compass for the joining angle
    let Cy = h * this.d.ratios.lowerJoinRatioNum / this.d.ratios.lowerJoinRatioDen
    let C: Circle = {x: 0, y: Cy, r: Cy}  

    // right vesica
    let Vr = w / (2 + this.d.ratios.lowerGapPart / this.d.ratios.lowerRadiiPart)
    let Vx = w / 2 - Vr
    let Vy;
    try {
      Vy = solveYOnCircleInset(C, Vx, Vr, false)
    }
    catch {
      this.lowerBoutError = "Join arc length too small"
      return;
    }
    let VR: Circle = {x: Vx, y: Vy, r: Vr} 
    let VL: Circle = {x: -Vx, y: Vy, r: Vr} 
    
    // line Cy to center of vesica, find intersections, I know its [0] but one normally checks
    let intR = lineCircleIntersection(C, VR, VR)[0]
    let intL = {x: - intR.x, y: intR.y}
    let joinPath = arcPathFrom3Points(C, intL, intR)

    this.renderCircle(VR, "blue")(g,ui)
    this.renderCircle(VL, "blue")(g,ui)
    this.renderPath(joinPath, "red")(g,ui)

    if (guides) {
      this.renderLine(C, intR, "blue")(g,ui)
      this.renderLine(C, intL, "blue")(g,ui)
      this.renderBoxLine({ x: w * .7, y: 0 }, { x: w * .7, y: Cy }, this.d.ratios.lowerJoinRatioNum, "blue", "lightblue", false)(g,ui)
      this.renderBoxLine({ x: w * .8, y: 0 }, { x: w * .8, y: h }, this.d.ratios.lowerJoinRatioDen, "blue", "lightblue", true)(g,ui)
      this.renderDashLine({ x: 3 * w, y: Cy }, { x: -3 * w, y: Cy })(g, ui)

      let vesicaiRatios = [this.d.ratios.lowerRadiiPart, this.d.ratios.lowerGapPart, this.d.ratios.lowerRadiiPart]
      this.renderBoxLine({ x: -w/2, y: -25 }, { x: w/2, y: -25 }, vesicaiRatios, "blue", "lightblue", true, { labelMode: "segmentWeight" })(g,ui)
    }


  }

  renderUpperVesica = (guides: boolean = false) => (g: any, ui: any) => {
    const h = Math.max(1, this.d.ratios.heightMm);
    let w = h * this.d.ratios.widthPart / this.d.ratios.heightPart;
    w = this.d.ratios.upperBoutReductionDenom <= 0 ? w : w - w * (1 / this.d.ratios.upperBoutReductionDenom);

    // this is the arc of our compass for the joining angle
    let Cy = h - h * this.d.ratios.upperJoinRatioNum / this.d.ratios.upperJoinRatioDen
    let C: Circle = {x: 0, y: Cy, r: h - Cy}  

    // right vesica
    let Vr = w / (2 + this.d.ratios.upperGapPart / this.d.ratios.upperRadiiPart)
    let Vx = w / 2 - Vr
    let Vy;
    try {
      Vy = solveYOnCircleInset(C, Vx, Vr, true)
    }
    catch {
      this.upperBoutError = "Join arc length too small"
      return;
    }
    let VR: Circle = {x: Vx, y: Vy, r: Vr} 
    let VL: Circle = {x: -Vx, y: Vy, r: Vr} 
    
    // line Cy to center of vesica, find intersections, I know its [0] but one normally checks
    let intR = lineCircleIntersection(C, VR, VR)[0]
    let intL = {x: - intR.x, y: intR.y}
    let joinPath = arcPathFrom3Points(C, intR, intL)

    this.renderCircle(VR, "green")(g,ui)
    this.renderCircle(VL, "green")(g,ui)
    this.renderPath(joinPath, "red")(g,ui)

    if (guides) {
      this.renderLine(C, intR, "green")(g,ui)
      this.renderLine(C, intL, "green")(g,ui)
      this.renderBoxLine({ x: w * .7, y: h }, { x: w * .7, y: Cy }, this.d.ratios.lowerJoinRatioNum, "green", "lightgreen", false)(g,ui)
      this.renderBoxLine({ x: w * .8, y: 0 }, { x: w * .8, y: h }, this.d.ratios.lowerJoinRatioDen, "green", "lightgreen", true)(g,ui)
      this.renderDashLine({ x: 3 * w, y: Cy }, { x: -3 * w, y: Cy })(g, ui)

      let vesicaiRatios = [this.d.ratios.lowerRadiiPart, this.d.ratios.lowerGapPart, this.d.ratios.lowerRadiiPart]
      this.renderBoxLine({ x: -w/2, y: h +25 }, { x: w/2, y: h + 25 }, vesicaiRatios, "green", "lightgreen", true, { labelMode: "segmentWeight" })(g,ui)
    }
  }

  renderCenterBout = (guides: boolean = false) => (g: any, ui: any): void => {
    const h = Math.max(1, this.d.ratios.heightMm);
    let waistHeight = h * this.d.ratios.waistCenterNum / this.d.ratios.waistCenterDen 

    if (guides) {
      this.renderDashLine({ x: -1000, y: waistHeight }, { x: 1000, y: waistHeight })(g,ui)
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
