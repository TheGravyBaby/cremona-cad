import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { widthFromRatio } from '../helpers/helpers';

@Component({
  selector: 'app-beard-violin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './beard-violin.html',
  styleUrls: ['./beard-violin.css'],
})

export class BeardViolinComponent {
  @Output() draftChange = new EventEmitter<Array<(arg: any) => void>>();

  public recipeState = {
    heightMm: 356,
    ratioHeight: 7,
    ratioWidth: 4,
    upperBoutReduction: 6,
  }

  ngOnInit() {
    this.draftChange.emit([this.drawBoundingBoxes]);
  }

  changeBase(): void {
    console.log("Fired Event")
    this.draftChange.emit([this.drawBoundingBoxes]);
  }

  drawBoundingBoxes = (g: any): void =>{
    const h = Math.max(1, this.recipeState.heightMm);
    const w = widthFromRatio(h, this.recipeState.ratioHeight, this.recipeState.ratioWidth);
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

    // bottom square
    g.append('rect')
      .attr('x', xLeft)
      .attr('y', 0)
      .attr('width', w)
      .attr('height', w)
      .attr('fill', 'blue')
      .attr('opacity', 0.25);

    // top square using reduction
    const upperBoutW = this.recipeState.upperBoutReduction <= 0 ? w : w - w * (1 / this.recipeState.upperBoutReduction);
    const upperBoutLeft = -upperBoutW / 2;

    g.append('rect')
      .attr('x', upperBoutLeft)
      .attr('y', h - upperBoutW)
      .attr('width', upperBoutW)
      .attr('height', upperBoutW)
      .attr('fill', 'green')
      .attr('opacity', 0.25);
  }

}
