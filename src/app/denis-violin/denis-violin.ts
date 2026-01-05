import { Component } from '@angular/core';
import { RecipeInterface } from '../models/recipe';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';

@Component({
  selector: 'app-denis-violin',
  imports: [FormsModule],
  templateUrl: './denis-violin.html',
  styleUrls: ['../sidebar.css', './denis-violin.css']
})

export class DenisViolin extends RecipeComponentBase{

  override d: RecipeInterface = {
    recipeName: 'Denis-Violin',
    fileName: "defaultDenis",
    version: ".1",
    ratios: {
      heightMm: 356,
    },
    paths: {}
  }

  changeBase(): void {
    console.log("Fired Event")
    this.draftChange.emit([this.drawBoundingBoxes]);
  }

  drawBoundingBoxes = (g: any): void => {
    const h = Math.max(1, this.d.ratios.heightMm);
    const w = h * this.d.ratios.heightPart / this.d.ratios.widthPart;
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

}

