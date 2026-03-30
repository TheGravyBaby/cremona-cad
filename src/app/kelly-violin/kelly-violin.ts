import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Circle } from '../models/types';
import { renderCircle, renderDashLine, renderDistanceMeasurementLine } from '../helpers/renderFuncs';

@Component({
  selector: 'app-kelly-violin',
  imports: [FormsModule],
  templateUrl: './kelly-violin.html',
  styleUrls: ['../sidebar.css', './kelly-violin.css']
})

export class KellyViolin extends RecipeComponentBase { 

  override d = {
    recipeName: 'Kelly Violin',
    fileName: "Kelly-Baltic",
    version: ".1",
    params: {
      h: 351,
      w: 203,
      inset: 4,
      centerBoutWidth: 100,
      centerBoutHeight: 194,
      centerBoutRadius: 75,
      upperBoutWidth: 164,
      lowerBoutWidth: 203,

      
    },
    shapes: {
      centerBoutLeft: {x: 0, y: 0, r: 0} as Circle,
      centerBoutRight: {x: 0, y: 0, r: 0} as Circle
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
      else if (panel === 'centerBouts') this.changeCenterBout();
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

  changeCenterBout() {
    this.draftChange.emit([this.renderCenterBouts]);
    
  }

  renderCenterBouts = (g: any, ui: any): void => {
    let leftCircleCenter = -this.d.params.centerBoutWidth / 2 - this.d.params.centerBoutRadius;
    let rightCircleCenter = this.d.params.centerBoutWidth / 2 + this.d.params.centerBoutRadius;

    this.d.shapes.centerBoutLeft = { x: leftCircleCenter, y: this.d.params.centerBoutHeight, r: this.d.params.centerBoutRadius };
    this.d.shapes.centerBoutRight = { x: rightCircleCenter, y: this.d.params.centerBoutHeight, r: this.d.params.centerBoutRadius };


    renderDistanceMeasurementLine({ x: - this.d.params.centerBoutWidth / 2, y: this.d.params.centerBoutHeight }, { x: this.d.params.centerBoutWidth / 2, y: this.d.params.centerBoutHeight }, this.d.params.centerBoutWidth.toString() + " mm", "blue")(g, ui);
    renderDashLine({x: -1000, y: this.d.params.centerBoutHeight}, {x: 1000, y: this.d.params.centerBoutHeight}, "blue")(g, ui);
    renderCircle(this.d.shapes.centerBoutLeft, "blue")(g, ui);
    renderCircle(this.d.shapes.centerBoutRight, "blue")(g, ui);
  
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
