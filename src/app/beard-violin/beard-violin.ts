import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections, interceptCirclesAndPoint, intersectLines, lineCircleIntersection, pointOnCircle, solveYOnCircleInset } from '../helpers/helpers';
import { RecipeInterface } from '../models/recipe';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { arcPathFrom3Points } from '../helpers/helpers';
import { Circle, Fraction, Pt } from '../models/types';


interface BeardViolinParams {
  h: 356, // in mm, the only numerical measurement in this system
  htoW: Fraction,
  hiToLowW: Fraction,
  lowJoinArcToH: Fraction,
  lowVesRadToGap: Fraction,   // the ratio of the vesica radii to the gap between their centers
  hiJoinArcToH: Fraction,
  hiVesRadToGap: Fraction,
  cenSecToH: Fraction,
  cenSecParts: number,
  hiCornPart: number,
  lowCornPart: number,
  lowOutCornerRadiToW: Fraction,
  hiOutCornerRadiToHiW: Fraction
}

interface BeardViolinRecipe extends RecipeInterface {
  params: BeardViolinParams;
}

@Component({
  selector: 'app-beard-violin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './beard-violin.html',
  styleUrls: ['../sidebar.css', './beard-violin.css'],
})

export class BeardViolinComponent extends RecipeComponentBase {
  override openPanel = 'cornerPlacement'

  override d: BeardViolinRecipe = {
    recipeName: 'Beard Violin',
    fileName: "defaultBeard",
    version: ".1",
    params: {
      h: 356,
      htoW: { n: 7, d: 4 },
      hiToLowW: { n: 7, d: 9 },
      lowJoinArcToH: { n: 2, d: 3 },
      lowVesRadToGap: { n: 1, d: 1 },
      hiJoinArcToH: { n: 1, d: 3 },
      hiVesRadToGap: { n: 2, d: 1 },
      cenSecToH: { n: 1, d: 3 },
      cenSecParts: 5,
      hiCornPart: 0,
      lowCornPart: 1,
      lowOutCornerRadiToW: { n: 1, d: 8 },
      hiOutCornerRadiToHiW: { n: 1, d: 8 }
    },
    calcs: []
  }

  lowerBoutError = ""
  upperBoutError = ""
  cornerPlacementError = ""
  outerCornerError = ""
  innerBoutError = ""


  override firstRender = (g: any, ui: any): void => {
    this.renderBounds(g, ui)
    this.renderBoutBounds(g, ui)
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
      else if (panel == 'cornerPlacement') this.changeCornerPosition();
      else if (panel == 'outerCorners') this.changeOuterCorners();
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
    this.draftChange.emit([this.renderBoutBounds, this.renderLowerVesica(true)])
  }

  changeUpperVesica(): void {
    this.draftChange.emit([this.renderBoutBounds, this.renderLowerVesica(false), this.renderUpperVesica(true)]);
  }

  changeCornerPosition(): void {
    this.draftChange.emit([this.renderBoutBounds, this.renderLowerVesica(false), this.renderUpperVesica(false), this.renderCornerPositions(true)]);
  }

  changeOuterCorners(): void {
    this.draftChange.emit([this.renderBoutBounds, this.renderLowerVesica(false), this.renderUpperVesica(false), this.renderCornerPositions(false), this.renderOuterCorners(true)]);
  }

  renderBounds = (g: any, ui: any): void => {
    const h = this.d.params.h;
    const w = h * this.d.params.htoW.d / this.d.params.htoW.n;
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
    const h = this.d.params.h;
    const w = h * this.d.params.htoW.d / this.d.params.htoW.n;
    const xLeft = -w / 2;

    // top square using reduction
    const upperBoutW = w * this.d.params.hiToLowW.n / this.d.params.hiToLowW.d;
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
    this.lowerBoutError = ""
    const h = this.d.params.h;
    const w = h * this.d.params.htoW.d / this.d.params.htoW.n;

    // this is the arc of our compass for the joining angle
    let Cy = h * this.d.params.lowJoinArcToH.n / this.d.params.lowJoinArcToH.d
    let C: Circle = { x: 0, y: Cy, r: Cy }

    // right vesica
    let Vr = w / (2 + this.d.params.lowVesRadToGap.d / this.d.params.lowVesRadToGap.n)
    let Vx = w / 2 - Vr
    let Vy;
    try {
      Vy = solveYOnCircleInset(C, Vx, Vr, false)
    }
    catch {
      this.lowerBoutError = "Join arc length too small"
      return;
    }
    let VR: Circle = { x: Vx, y: Vy, r: Vr }
    let VL: Circle = { x: -Vx, y: Vy, r: Vr }

    // line Cy to center of vesica, find intersections, I know its [0] but one normally checks
    let intR = lineCircleIntersection(C, VR, VR)[0]
    let intL = { x: - intR.x, y: intR.y }
    let joinPath = arcPathFrom3Points(C, intL, intR)
    let leftBout = arcPathFrom3Points(VL, { x: -w / 2, y: VL.y }, intL)
    let rightBout = arcPathFrom3Points(VR, intR, { x: w / 2, y: VR.y })

    this.renderCircle(VR, "blue")(g, ui)
    this.renderCircle(VL, "blue")(g, ui)
    this.renderPath(joinPath, "red")(g, ui)
    this.renderPath(leftBout, "red")(g, ui)
    this.renderPath(rightBout, "red")(g, ui)

    if (guides) {
      this.renderLine(C, intR, "blue")(g, ui)
      this.renderLine(C, intL, "blue")(g, ui)
      this.renderBoxLine({ x: w * .7, y: 0 }, { x: w * .7, y: Cy }, this.d.params.lowJoinArcToH.n, "blue", "lightblue", false)(g, ui)
      this.renderBoxLine({ x: w * .8, y: 0 }, { x: w * .8, y: h }, this.d.params.lowJoinArcToH.d, "blue", "lightblue", true)(g, ui)
      this.renderDashLine({ x: 3 * w, y: Cy }, { x: -3 * w, y: Cy })(g, ui)

      let vesicaiRatios = [this.d.params.lowVesRadToGap.n, this.d.params.lowVesRadToGap.d, this.d.params.lowVesRadToGap.n]
      this.renderBoxLine({ x: -w / 2, y: -25 }, { x: w / 2, y: -25 }, vesicaiRatios, "blue", "lightblue", true, { labelMode: "segmentWeight" })(g, ui)

      // little Circle to indicate our vesica centers
      let vl: Circle = { x: VR.x, y: VR.y, r: 1 }
      let vr: Circle = { x: VL.x, y: VL.y, r: 1 }
      this.renderCircle(vl, "blue")(g, ui)
      this.renderCircle(vr, "blue")(g, ui)
    }

    this.addCalcs([
      { name: "lowerRightBoutEndPt", d: { x: w / 2, y: VR.y } },
      { name: "lowerLeftBoutEndPt", d: { x: -w / 2, y: VL.y } },
      { name: "lowerRightVesica", d: VR },
      { name: "lowerLeftVesica", d: VL }
    ])
  }

  renderUpperVesica = (guides: boolean = false) => (g: any, ui: any) => {
    this.upperBoutError = ""
    const h = this.d.params.h;
    let w = h * this.d.params.htoW.d / this.d.params.htoW.n;
    w = w * this.d.params.hiToLowW.n / this.d.params.hiToLowW.d;

    // this is the arc of our compass for the joining angle
    let Cy = h - h * this.d.params.hiJoinArcToH.n / this.d.params.hiJoinArcToH.d
    let C: Circle = { x: 0, y: Cy, r: h - Cy }

    // right vesica
    let Vr = w / (2 + this.d.params.hiVesRadToGap.d / this.d.params.hiVesRadToGap.n)
    let Vx = w / 2 - Vr
    let Vy;
    try {
      Vy = solveYOnCircleInset(C, Vx, Vr, true)
    }
    catch {
      this.upperBoutError = "Join arc length too small"
      return;
    }
    let VR: Circle = { x: Vx, y: Vy, r: Vr }
    let VL: Circle = { x: -Vx, y: Vy, r: Vr }

    // line Cy to center of vesica, find intersections, I know its [0] but one normally checks
    let intR = lineCircleIntersection(C, VR, VR)[0]
    let intL = { x: - intR.x, y: intR.y }
    let joinPath = arcPathFrom3Points(C, intR, intL)
    let leftBout = arcPathFrom3Points(VL, intL, { x: -w / 2, y: VL.y })
    let rightBout = arcPathFrom3Points(VR, { x: w / 2, y: VR.y }, intR)

    this.renderCircle(VR, "green")(g, ui)
    this.renderCircle(VL, "green")(g, ui)
    this.renderPath(joinPath, "red")(g, ui)
    this.renderPath(leftBout, "red")(g, ui)
    this.renderPath(rightBout, "red")(g, ui)

    if (guides) {
      this.renderLine(C, intR, "green")(g, ui)
      this.renderLine(C, intL, "green")(g, ui)
      this.renderBoxLine({ x: w * .7, y: h }, { x: w * .7, y: Cy }, this.d.params.hiJoinArcToH.n, "green", "lightgreen", false)(g, ui)
      this.renderBoxLine({ x: w * .8, y: 0 }, { x: w * .8, y: h }, this.d.params.hiJoinArcToH.d, "green", "lightgreen", true)(g, ui)
      this.renderDashLine({ x: 3 * w, y: Cy }, { x: -3 * w, y: Cy })(g, ui)

      let vesicaiRatios = [this.d.params.hiVesRadToGap.n, this.d.params.hiVesRadToGap.d, this.d.params.hiVesRadToGap.n]
      this.renderBoxLine({ x: -w / 2, y: h + 25 }, { x: w / 2, y: h + 25 }, vesicaiRatios, "green", "lightgreen", true, { labelMode: "segmentWeight" })(g, ui)

      // little Circle to indicate our vesica centers
      let vl: Circle = { x: VR.x, y: VR.y, r: 1 }
      let vr: Circle = { x: VL.x, y: VL.y, r: 1 }
      this.renderCircle(vl, "green")(g, ui)
      this.renderCircle(vr, "green")(g, ui)
    }

    this.addCalcs([
      { name: "upperRightBoutEndPt", d: { x: w / 2, y: VR.y } },
      { name: "upperLeftBoutEndPt", d: { x: -w / 2, y: VL.y } },
      { name: "upperRightVesica", d: VR },
      { name: "upperLeftVesica", d: VL }
    ])

  }

  renderCornerPositions = (guides: boolean = false) => (g: any, ui: any): void => {
    this.cornerPlacementError = ""
    let upperRightBoutEndPt = this.d.calcs.find((c: { name: string; }) => c.name == "upperRightBoutEndPt").d as Pt
    let upperLeftBoutEndPt = this.d.calcs.find((c: { name: string; }) => c.name == "upperLeftBoutEndPt").d as Pt
    let lowerRightBoutEndPt = this.d.calcs.find((c: { name: string; }) => c.name == "lowerRightBoutEndPt").d as Pt
    let lowerLeftBoutEndPt = this.d.calcs.find((c: { name: string; }) => c.name == "lowerLeftBoutEndPt").d as Pt

    if (!upperRightBoutEndPt || !upperLeftBoutEndPt || !lowerRightBoutEndPt || !lowerLeftBoutEndPt) {
      this.cornerPlacementError = "Upper and Lower bouts must be defined..."
      return;
    }

    const h = this.d.params.h;
    const w = h * this.d.params.htoW.d / this.d.params.htoW.n;
    let upperW = w * this.d.params.hiToLowW.n / this.d.params.hiToLowW.d;

    let centerSectionStart = h * (this.d.params.cenSecToH.n) / this.d.params.cenSecToH.d
    let centerSectionEnd = h * (this.d.params.cenSecToH.n + 1) / this.d.params.cenSecToH.d
    let centerSectionDivision = (centerSectionEnd - centerSectionStart) / this.d.params.cenSecParts
    let upperCornerHeight = centerSectionEnd - centerSectionDivision * this.d.params.hiCornPart
    let lowerCornerHeight = centerSectionStart + centerSectionDivision * this.d.params.lowCornPart

    if (guides) {
      this.renderBoxLine({ x: w, y: 0 }, { x: w, y: h }, this.d.params.cenSecToH.d, "blue", "green", true)(g, ui)
      this.renderBoxLine(
        { x: w * .9, y: centerSectionStart },
        { x: w * .9, y: centerSectionEnd },
        this.d.params.cenSecParts, "blue", "green", true)(g, ui)

      this.renderDashLine({ x: -1000, y: upperCornerHeight }, { x: 1000, y: upperCornerHeight }, "green")(g, ui)
      this.renderDashLine({ x: -1000, y: lowerCornerHeight }, { x: 1000, y: lowerCornerHeight }, "blue")(g, ui)
    }

    let lowerRightGuideCircle: Circle = { x: lowerLeftBoutEndPt.x, y: lowerLeftBoutEndPt.y, r: w }
    let lowerRightCorner: Pt = lineCircleIntersection({ x: -1000, y: lowerCornerHeight }, { x: 1000, y: lowerCornerHeight }, lowerRightGuideCircle)[0]
    let lowerRightArc = arcPathFrom3Points({ x: lowerLeftBoutEndPt.x, y: lowerLeftBoutEndPt.y }, { x: lowerRightBoutEndPt.x, y: lowerRightBoutEndPt.y }, lowerRightCorner)


    let upperRightGuideCircle: Circle = { x: upperLeftBoutEndPt.x, y: upperLeftBoutEndPt.y, r: upperW }
    let upperRightCorner: Pt = lineCircleIntersection({ x: -1000, y: upperCornerHeight }, { x: 1000, y: upperCornerHeight }, upperRightGuideCircle)[0]
    let upperRightArc = arcPathFrom3Points({ x: upperLeftBoutEndPt.x, y: upperLeftBoutEndPt.y }, { x: upperRightBoutEndPt.x, y: upperRightBoutEndPt.y }, upperRightCorner, { clockwise: false })

    // mirror the two arcs we just made accross the y axis
    let lowerLeftCorner = { x: -lowerRightCorner.x, y: lowerRightCorner.y }
    let upperLeftCorner = { x: -upperRightCorner.x, y: upperRightCorner.y }
    let lowerLeftArc = arcPathFrom3Points({ x: lowerRightBoutEndPt.x, y: lowerRightBoutEndPt.y }, { x: - lowerRightBoutEndPt.x, y: lowerRightBoutEndPt.y }, lowerLeftCorner, { clockwise: false })
    let upperLeftArc = arcPathFrom3Points({ x: upperRightBoutEndPt.x, y: upperRightBoutEndPt.y }, { x: - upperRightBoutEndPt.x, y: upperRightBoutEndPt.y }, upperLeftCorner)

    this.renderCrosshair(lowerRightCorner, "red")(g, ui)
    this.renderCrosshair(lowerLeftCorner, "red")(g, ui)
    this.renderCrosshair(upperRightCorner, "red")(g, ui)
    this.renderCrosshair(upperLeftCorner, "red")(g, ui)

    if (guides) {
      this.renderPath(lowerLeftArc, "orange")(g, ui)
      this.renderPath(lowerRightArc, "orange")(g, ui)
      this.renderPath(upperLeftArc, "orange")(g, ui)
      this.renderPath(upperRightArc, "orange")(g, ui)

      this.renderLine(lowerLeftBoutEndPt, lowerRightCorner, "orange")(g, ui)
      this.renderLine(lowerLeftBoutEndPt, lowerRightBoutEndPt, "orange")(g, ui)

      this.renderLine(upperLeftBoutEndPt, upperRightCorner, "orange")(g, ui)
      this.renderLine(upperLeftBoutEndPt, upperRightBoutEndPt, "orange")(g, ui)
    }

    this.addCalcs([
      { name: "lowerRightCorner", d: lowerRightCorner },
      { name: "lowerLeftCorner", d: lowerLeftCorner },
      { name: "upperRightCorner", d: upperRightCorner },
      { name: "upperLeftCorner", d: upperLeftCorner },
    ])
  }

  renderOuterCorners = (guides: boolean = false) => (g: any, ui: any): void => {
    let lowerRightCorner = this.d.calcs.find((c: { name: string; }) => c.name == "lowerRightCorner").d as Pt
    let upperRightCorner = this.d.calcs.find((c: { name: string; }) => c.name == "upperRightCorner").d as Pt
    let lowerRightVesica = this.d.calcs.find((c: { name: string; }) => c.name == "lowerRightVesica").d as Circle
    let upperRightVesica = this.d.calcs.find((c: { name: string; }) => c.name == "upperRightVesica").d as Circle
    let lowerRightBoutEndPt = this.d.calcs.find((c: { name: string; }) => c.name == "lowerRightBoutEndPt").d as Pt
    let upperRightBoutEndPt = this.d.calcs.find((c: { name: string; }) => c.name == "upperRightBoutEndPt").d as Pt

    const h = this.d.params.h;
    const w = h * this.d.params.htoW.d / this.d.params.htoW.n;
    let upperW = w * this.d.params.hiToLowW.n / this.d.params.hiToLowW.d;


    let upperCornerRadius = upperW * this.d.params.hiOutCornerRadiToHiW.n / this.d.params.hiOutCornerRadiToHiW.d
    let lowerCornerRadius = w * this.d.params.lowOutCornerRadiToW.n / this.d.params.lowOutCornerRadiToW.d

    let lowerRightCornerCircle = interceptCirclesAndPoint(lowerRightVesica, lowerRightCorner, lowerCornerRadius)![1]
    let lowerRightIntersectPt = circleCircleIntersections(lowerRightCornerCircle,lowerRightVesica)[0]
    let lowerRightCornerToVesicaArc = arcPathFrom3Points(lowerRightCornerCircle, lowerRightCorner, lowerRightIntersectPt)
    let lowerRightVesicaJoinArc = arcPathFrom3Points(lowerRightVesica, lowerRightBoutEndPt, lowerRightIntersectPt)

    let upperRightCornerCircle = interceptCirclesAndPoint(upperRightVesica, upperRightCorner, upperCornerRadius)![1]
    let upperRightIntersectPt = circleCircleIntersections(upperRightCornerCircle, upperRightVesica)[1]
    let upperRightCornerToVesicaArc = arcPathFrom3Points(upperRightCornerCircle, upperRightCorner, upperRightIntersectPt, {clockwise: false})
    let upperRightVesicaJoinArc = arcPathFrom3Points(upperRightVesica, upperRightBoutEndPt, upperRightIntersectPt, {clockwise: false})


    if (guides) {
      this.renderCircle(lowerRightCornerCircle!, "blue")(g,ui)
      this.renderCircle(upperRightCornerCircle!, "green")(g,ui)
    }

    this.renderPath(lowerRightCornerToVesicaArc, "red")(g, ui)
    this.renderPath(lowerRightVesicaJoinArc, "red")(g, ui)
    this.renderPath(upperRightCornerToVesicaArc, "red")(g, ui)
    this.renderPath(upperRightVesicaJoinArc, "red")(g, ui)

  }

  renderInnerBout() {
    // const h = this.d.params.h;
    // const w = h * this.d.params.htoW.d / this.d.params.htoW.n;
    // let upperW = w * this.d.params.hiToLowW.n / this.d.params.hiToLowW.d;
    // let waistHeight = (((h - upperW) - w) / 2) + w // this is midway between the upper and lower bout squares
    // let boutArcCenter = intersectLines(
    //   { x: 0, y: lowerRightBoutEndPt.y },
    //   lowerRightCorner,
    //   { x: -1000, y: waistHeight },
    //   { x: 1000, y: waistHeight }
    //)

    // this.renderDashLine({ x: -1000, y: waistHeight }, { x: 1000, y: waistHeight }, "orange")(g, ui)


  }


}
