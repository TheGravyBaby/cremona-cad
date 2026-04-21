import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Circle, Pt, Rectangle } from '../models/types';
import { renderCircle, renderCrosshair, renderDashedLine, renderDashLine, renderDistanceMeasurementLine, renderLine, renderPath, renderRect } from '../helpers/renderFuncs';
import { combinePathStrings } from '../helpers/draftMath';
import { KellyViolinData, KellyViolinRecipe } from './kellyTypes';
import { calculatePrimaryOutline, calculateMainPathsSegmented, calculateMainPathsUnified, calculateMouldPath, calculateOffsetPathsSegments, calculateTopPath } from './kellyCals';

@Component({
  selector: 'app-kelly-violin',
  imports: [FormsModule],
  templateUrl: './kelly-violin.html',
  styleUrls: ['../sidebar.css', './kelly-violin.css']
})

export class KellyViolin extends RecipeComponentBase {
  
  override openPanel = 'base';

  showGuideLines = true;
  showAllCircles = true;
  showModuleCircles = false;
  viewOuterPathExport = true;
  viewInnerPathExport = false;
  viewMouldExport = false;
  viewSegmentedOuter = false;
  viewSegmentedInnerPartial = false;
  
  override d: KellyViolinData = new KellyViolinRecipe();

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
    calculatePrimaryOutline(this.d);
    this.draftChange.emit([this.renderBounds]);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  changeMainBouts() {
    calculatePrimaryOutline(this.d);
    this.draftChange.emit([this.renderBounds, this.renderMainBouts(true)]);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  changeMinorBouts() {
    calculatePrimaryOutline(this.d);
    this.draftChange.emit([this.renderBounds, this.renderMainBouts(false), this.renderMinorBouts(true), this.renderMainPathCornerless]);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  changeCornerPlacement() {
    calculatePrimaryOutline(this.d);
    this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(true), this.renderMainPathCornerless]);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  changeCornerCircles() {
    calculatePrimaryOutline(this.d);
    this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(false), this.renderCornerCircles(true), this.renderMainPath]);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  changeMouldPattern(calcChange = true) {
    calcChange && calculatePrimaryOutline(this.d);
    calcChange && calculateMouldPath(this.d);
    this.draftChange.emit([this.renderMainBouts(false), this.renderMinorBouts(false), this.renderCornerPlacements(false), this.renderCornerCircles(false), this.renderBlocks(true), this.renderMainPathWithBlocks]);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  changeTopAndBottom() {
    calculatePrimaryOutline(this.d);
    calculateMainPathsSegmented(this.d);
    calculateOffsetPathsSegments(this.d);
    calculateTopPath(this.d);
    this.draftChange.emit([this.renderFinalCorners(true), this.renderMainPath, this.renderTopPath]);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  renderExports() {
    calculatePrimaryOutline(this.d);
    calculateMouldPath(this.d);
    calculateMainPathsSegmented(this.d);
    calculateOffsetPathsSegments(this.d);
    calculateTopPath(this.d);
    let emitArray = [];
    this.viewOuterPathExport && emitArray.push(this.renderTopPath);
    this.viewInnerPathExport && emitArray.push(this.renderMainPath);
    this.viewMouldExport && emitArray.push(this.renderMainPathWithBlocks);

    this.viewSegmentedOuter && emitArray.push((g: any, ui: any) => {
      this.d.paths.find(c => c.name === 'offsetSegmentedPath')?.paths.forEach(p => renderPath(p, 'purple')(g, ui));
    });
    this.viewSegmentedInnerPartial && emitArray.push((g: any, ui: any) => {
      this.d.paths.find(c => c.name === 'innerPath')?.paths.forEach(p => renderPath(p, 'orange')(g, ui));
    });

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
    let pathObj = this.d.paths.find(c => c.name === "innerPath");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, "red")(g, ui));
    }
  }

  renderMainPathCornerless = (g: any, ui: any): void => {
    let pathObj = this.d.paths.find(c => c.name === "innerPathCornerless");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, "red")(g, ui));
    }
  }

  renderUnifiedPath = (g: any, ui: any): void => {
    let pathObj = this.d.paths.find(c => c.name === "unifiedTrace");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, "blue", 2, 0.7)(g, ui));
    }
  }

  renderMainPathWithBlocks = (g: any, ui: any): void => {
    let mouldPath = this.d.paths.find(c => c.name === "mouldPath");
    if (mouldPath) {
      mouldPath.paths.forEach((p: any) => renderPath(p, "green", 2, 0.7)(g, ui));
    }
  }

  renderTopPath = (g: any, ui: any): void => {
    let pathObj = this.d.paths.find(c => c.name === "outerPath");
    if (pathObj) {
      pathObj.paths.forEach((p: any) => renderPath(p, "blue", 2)(g, ui));
    }
  }

  downloadInnerPath = (): void => {
    calculateMainPathsUnified(this.d);
    const pathObj = this.d.paths.find(c => c.name === 'innerPathUnified');
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
    calculateMouldPath(this.d);
    const pathObj = this.d.paths.find(c => c.name === 'mouldPath');
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

  downloadInnerSegmentedPaths = (): void => {
    calculateMainPathsSegmented(this.d);
    const pathObj = this.d.paths.find(c => c.name === 'segmentedPartialPath');
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

  downloadOuterSegmentedPaths = (): void => {
    calculateMainPathsSegmented(this.d);
    calculateOffsetPathsSegments(this.d);
    const pathObj = this.d.paths.find(c => c.name === 'offsetSegmentedPath');
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
    calculateMainPathsUnified(this.d);
    calculateMainPathsSegmented(this.d);
    calculateOffsetPathsSegments(this.d);
    calculateTopPath(this.d);
    const pathObj = this.d.paths.find(c => c.name === 'outerPath');
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