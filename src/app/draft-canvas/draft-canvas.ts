import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';

@Component({
  selector: 'app-draft-canvas',
  standalone: true,
  template: `
    <div #host class="host"
      (wheel)="onScrollWheel($event)"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointerleave)="onPointerUp($event)"
    ></div>
  `,
  styles: [`
    .host { width: 100%; height: 100%; cursor: grab; }
    .host.dragging { cursor: grabbing; }
    svg { display: block; }
  `],
})
export class DraftCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;

  private canvas!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private gRoot!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private resizeObs?: ResizeObserver;
  private pxPerMm = 10;

  // camera (top-left of viewBox in mm-space)
  private offsetMmX = 0;
  private offsetMmY = 0;

  // drag state
  private isDragging = false;
  private lastPxX = 0;
  private lastPxY = 0;

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;

    this.canvas = d3.select(el)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%');

    this.gRoot = this.canvas.append('g').attr('class', 'root');

    this.draw();
    this.resizeObs = new ResizeObserver(() => this.draw());
    this.resizeObs.observe(el);
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
  }

  private draw(): void {
    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);

    const mmW = pxW / this.pxPerMm;
    const mmH = pxH / this.pxPerMm;

    const spacing = 10; // mm
    const marginPx = 12;
    const marginMm = marginPx / this.pxPerMm;
    const leftBound = this.offsetMmX - marginMm;
    const topBound = this.offsetMmY - marginMm;
    const rightBound = mmW + 2 * marginMm;
    const bottomBound = mmH + 2 * marginMm;

    // Center of *current view* in world mm coords
    const yAxis = mmW / 2;
    const xAxis = mmH / 2;

    const cv = { el, pxW, pxH, mmW, mmH, xAxis, yAxis, spacing, marginPx, marginMm, topBound, leftBound, rightBound, bottomBound };

    // console.log(cv)

    this.gRoot.selectAll('*').remove();

    // ViewBox is the camera window in mm coords
    this.canvas.attr(
      'viewBox',
      `${leftBound} ${topBound} ${rightBound} ${bottomBound}`
    );

    this.drawCanvas(cv);
    this.drawDots(cv, '#b4b4b4ff');
    this.drawAxisLabels(cv);
  }

  drawDots(cv: any, dotColor: string): void {
    const dots: Array<{ x: number; y: number }> = [];

    // build symmetric dots around the *view center* in world coords
    for (let x = cv.yAxis; x <= cv.yAxis + cv.mmW; x += cv.spacing) {
      for (let y = cv.xAxis; y <= cv.xAxis + cv.mmH; y += cv.spacing) {
        if (x === cv.yAxis || y === cv.xAxis) continue;
        dots.push({ x, y });
        dots.push({ x: cv.yAxis - (x - cv.yAxis), y });
        dots.push({ x, y: cv.xAxis - (y - cv.xAxis) });
        dots.push({ x: cv.yAxis - (x - cv.yAxis), y: cv.xAxis - (y - cv.xAxis) });
      }
    }

    const dotR = 2 / this.pxPerMm; // keep roughly constant in pixels

    this.gRoot
      .append('g')
      .attr('class', 'grid-dots')
      .selectAll('circle')
      .data(dots)
      .enter()
      .append('circle')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', dotR)
      .attr('fill', dotColor);
  }

  drawCanvas(cv: any): void {
    const lineColor = '#c0c0c0ff';

    // "paper" rect in world coords covering the *current view* (not global paper yet)
    this.gRoot
      .append('rect')
      .attr('x', this.offsetMmX)
      .attr('y', this.offsetMmY)
      .attr('width', cv.mmW)
      .attr('height', cv.mmH)
      .attr('fill', '#fbfbfb')
      .attr('stroke', lineColor)
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke')
      .style("user-select", "none");

    // crosshair centerlines of the view
    this.gRoot
      .append('line')
      .attr('x1', cv.yAxis)
      .attr('y1', this.offsetMmY)
      .attr('x2', cv.yAxis)
      .attr('y2', this.offsetMmY + cv.mmH)
      .attr('stroke', lineColor)
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke')
      .style("user-select", "none")

    this.gRoot
      .append('line')
      .attr('x1', this.offsetMmX)
      .attr('y1', cv.xAxis)
      .attr('x2', this.offsetMmX + cv.mmW)
      .attr('y2', cv.xAxis)
      .attr('stroke', lineColor)
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke')
      .style("user-select", "none")
  }

  drawAxisLabels(cv: any): void {
    const labelOffsetMm = 0.5; // spacing from axis (in mm)
    const fontSizePx = .2 * this.pxPerMm; // keep roughly constant in pixels

    let rightXBound = Math.round(cv.mmW / 2 + this.offsetMmX)
    let leftXBound = Math.round(cv.mmW / 2 - this.offsetMmX)
    let topYBound = Math.round(cv.mmW / 2 - this.offsetMmY)
    let bottomYBound = Math.round(cv.mmH / 2 + this.offsetMmY)

    // X axis label (to the right)
    if (rightXBound > 0) {
    this.gRoot
      .append('text')
      .attr('x', this.offsetMmX + cv.mmW - labelOffsetMm)
      .attr('y', cv.xAxis - labelOffsetMm)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'ideographic')
      .attr('fill', '#666')
      .attr('font-size', fontSizePx)
      .attr('vector-effect', 'non-scaling-stroke')
      .text(`${rightXBound} mm`)
      .style("user-select", "none")

    }

    // X axis label (to the left)
    if (leftXBound > 0) {
      this.gRoot
        .append('text')
        .attr('x', this.offsetMmX + labelOffsetMm)
        .attr('y', cv.xAxis - labelOffsetMm)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'ideographic')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${leftXBound} mm`)     
        .style("user-select", "none")
    }

    // Y axis label (bottom)
    if (bottomYBound > 0) {
      this.gRoot
        .append('text')
        .attr('x', cv.yAxis + labelOffsetMm)
        .attr('y', this.offsetMmY + cv.mmH - labelOffsetMm)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'auto')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${bottomYBound} mm`)
        .style("user-select", "none")
    }


    // Y axis label (top)
    if (topYBound > 0) {
    this.gRoot
      .append('text')
      .attr('x', cv.yAxis + labelOffsetMm)
      .attr('y', this.offsetMmY + labelOffsetMm + fontSizePx / this.pxPerMm)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'hanging')
      .attr('fill', '#666')
      .attr('font-size', fontSizePx)
      .attr('vector-effect', 'non-scaling-stroke')
      .text(`${topYBound} mm`)
      .style("user-select", "none");
    }

  }


  // camera controls
  onPointerDown = (event: PointerEvent) => {
    // left mouse / primary touch only
    if (event.button !== 0) return;

    this.isDragging = true;
    this.lastPxX = event.clientX;
    this.lastPxY = event.clientY;

    this.host.nativeElement.classList.add('dragging');
    this.host.nativeElement.setPointerCapture(event.pointerId);
  };

  onPointerMove = (event: PointerEvent) => {
    if (!this.isDragging) return;

    const dxPx = event.clientX - this.lastPxX;
    const dyPx = event.clientY - this.lastPxY;

    this.lastPxX = event.clientX;
    this.lastPxY = event.clientY;

    // Dragging right should move the "camera" left (like grabbing paper)
    const dxMm = dxPx / this.pxPerMm;
    const dyMm = dyPx / this.pxPerMm;

    this.offsetMmX -= dxMm;
    this.offsetMmY -= dyMm;

    this.draw();
  };

  onPointerUp = (event: PointerEvent) => {
    if (!this.isDragging) return;
    this.isDragging = false;

    this.host.nativeElement.classList.remove('dragging');
    try {
      this.host.nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      // ignore (can throw if not captured)
    }
  };

  onScrollWheel = (event: WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY;

    const oldPxPerMm = this.pxPerMm;

    if (delta < 0 && this.pxPerMm <= 20) this.pxPerMm *= 1.1;
    else if (delta > 0 && this.pxPerMm >= 4) this.pxPerMm /= 1.1;

    // Optional: keep zoom centered on current view center (not mouse yet)
    // Maintain center mm position while changing scale:
    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);

    const oldMmW = pxW / oldPxPerMm;
    const oldMmH = pxH / oldPxPerMm;
    const yAxis = this.offsetMmX + oldMmW / 2;
    const xAxis = this.offsetMmY + oldMmH / 2;

    const newMmW = pxW / this.pxPerMm;
    const newMmH = pxH / this.pxPerMm;

    this.offsetMmX = yAxis - newMmW / 2;
    this.offsetMmY = xAxis - newMmH / 2;

    this.draw();
  };
}
