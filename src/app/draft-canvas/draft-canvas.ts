import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';
import { FormsModule } from '@angular/forms';
import { Input } from '@angular/core';

@Component({
  selector: 'app-draft-canvas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './draft-canvas.html',
  styleUrls: ['./draft-canvas.css'],
})

export class DraftCanvasComponent implements AfterViewInit, OnDestroy {
  private initialized = false;
  
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  
  @Input() set draftFunctions(value: Array<(arg: any) => void>) {
    this.draftFuncs = value
    this.draw();
    console.log("Saw the event")
  }

  public pxPerMm = 2;
  public showGrid = true;
  public showAxes = true;

  private canvas!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private gRoot!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private gUI!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private resizeObs?: ResizeObserver;
  private draftFuncs: Array<(arg: any) => void> = [];


  private offsetMmX?: number;
  private offsetMmY?: number;
  private defaultPxPerMm = 2;

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
    this.gUI = this.canvas.append('g').attr('class', 'ui');

    this.draw();
    this.resizeObs = new ResizeObserver(() => this.draw());
    this.resizeObs.observe(el);

    this.initialized = true;
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
  }


  // render canvas
  draw(): void {
    if (!this.initialized)
      return

    this.gRoot.selectAll('*').remove();
    this.gUI.selectAll('*').remove();

    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);
    const mmW = pxW / this.pxPerMm;
    const mmH = pxH / this.pxPerMm;

    if (this.offsetMmX === undefined || this.offsetMmY === undefined) {
      this.initDefaultCamera(mmW, mmH)
    }

    // Camera window (top-left in world mm coords)
    const leftBound = this.offsetMmX;
    const rightBound = leftBound! + mmW;
    const topBound = this.offsetMmY;
    const bottomBound = mmH + topBound!;

    this.canvas.attr('viewBox', `${leftBound} ${topBound} ${mmW} ${mmH}`);
    this.gRoot.attr('transform', 'scale(1,-1)');

    const cv = {
      leftBound, rightBound, topBound, bottomBound, mmW, mmH
    };

    // console.log(cv)

    this.showAxes && this.drawAxis(cv);
    this.showAxes && this.drawAxisLabels(cv);
    this.showGrid && this.drawDots(cv, '#b4b4b4ff');

    this.draftFuncs.map(f => {
      f(this.gRoot)
    })
  }

  drawAxis(cv: any): void {
    const lineColor = '#adadadff';

    // crosshair centerlines of the view
    // y axis
    this.gRoot
      .append('line')
      .attr('x1', 0)
      .attr('y1', -cv.topBound)
      .attr('x2', 0)
      .attr('y2', -cv.bottomBound)
      .attr('stroke', lineColor)
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke')

    // x axis
    this.gRoot
      .append('line')
      .attr('x1', cv.leftBound)
      .attr('y1', 0)
      .attr('x2', cv.rightBound)
      .attr('y2', 0)
      .attr('stroke', lineColor)
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke')
  }

  drawAxisLabels(cv: any): void {
    const fontSizePx = 20 / this.pxPerMm; // keep roughly constant in pixels
    const xBelow = (cv.bottomBound > 0 && cv.topBound > 0)
    const xAbove = (cv.bottomBound < 0 && cv.topBound < 0)
    const yLeft = (cv.leftBound < 0 && cv.rightBound < 0)
    const yRight = (cv.leftBound > 0 && cv.rightBound > 0)

    let renderXAxisAt = null;
    let renderYAxisAt = null;

    if (xBelow) renderXAxisAt = cv.topBound;
    else if (xAbove) renderXAxisAt = cv.bottomBound;

    if (yLeft) renderYAxisAt = cv.rightBound;
    else if (yRight) renderYAxisAt = cv.leftBound;

    let invertXText = renderXAxisAt > 0;
    let invertYText = renderYAxisAt < 0;
    if (invertXText) renderXAxisAt += 20 / this.pxPerMm;
    if (invertYText) renderYAxisAt -= 80 / this.pxPerMm;

    // X axis label (to the right)
    if (cv.rightBound > 0) {
      this.gUI
        .append('text')
        .attr('x', cv.rightBound)
        .attr('y', renderXAxisAt || - 1 / this.pxPerMm)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'ideographic')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${Math.round(cv.rightBound)} mm`)
        .style("user-select", "none")
    }

    // X axis label (to the left)
    if (cv.leftBound < 0) {
      this.gUI
        .append('text')
        .attr('x', cv.leftBound)
        .attr('y', renderXAxisAt || - 1 / this.pxPerMm)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'ideographic')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${Math.round(cv.leftBound)} mm`)
        .style("user-select", "none")
    }

    // Y axis label (bottom)
    if (cv.topBound < 0) {
      this.gUI
        .append('text')
        .attr('x', renderYAxisAt || 0 + 2 / this.pxPerMm)
        .attr('y', cv.topBound + 20 / this.pxPerMm)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'auto')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${Math.round(-cv.topBound)} mm`)
        .style("user-select", "none")
    }

    // Y axis label (top)
    if (cv.bottomBound > 0) {
      this.gUI
        .append('text')
        .attr('x', renderYAxisAt || 0 + 2 / this.pxPerMm)
        .attr('y', cv.bottomBound - 20 / this.pxPerMm)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'hanging')
        .attr('fill', '#666')
        .attr('font-size', fontSizePx)
        .attr('vector-effect', 'non-scaling-stroke')
        .text(`${Math.round(-cv.bottomBound)} mm`)
        .style("user-select", "none");
    }

  }

  drawDots(cv: any, dotColor: string): void {
    let xMax = Math.max(Math.abs(cv.rightBound), Math.abs(cv.leftBound));
    let yMax = Math.max(Math.abs(cv.topBound), Math.abs(cv.bottomBound));
    let dotSpacing = 50;

    const dots: Array<{ x: number; y: number }> = [];

    // build symmetric dots around the *view center* in world coords
    for (let x = 0; x <= xMax; x += dotSpacing) {
      for (let y = 0; y <= yMax; y += dotSpacing) {
        if (this.showAxes && (x === 0 || y === 0)) continue;

        if (cv.leftBound <= x && x <= cv.rightBound)
          dots.push({ x: x, y: y });
        if (cv.leftBound <= -x && -x <= cv.rightBound)
          dots.push({ x: -x, y: y });
        if (cv.leftBound <= x && x <= cv.rightBound)
          dots.push({ x: x, y: -y });
        if (cv.leftBound <= -x && -x <= cv.rightBound)
          dots.push({ x: -x, y: -y });

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




  // camera controls
  initDefaultCamera(mmW: number, mmH: number) {
    // match your current initial framing
    this.offsetMmX = -mmW / 2;
    this.offsetMmY = -mmH * .95;
    this.defaultPxPerMm = this.pxPerMm;
  }

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

    // console.log('Offsets before drag:', this.offsetMmX, this.offsetMmY);

    this.offsetMmX! -= dxMm;
    this.offsetMmY! -= dyMm;


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

    if (delta < 0) this.pxPerMm *= 1.1;
    else if (delta > 0) this.pxPerMm /= 1.1;

    this.applyZoom(this.pxPerMm)
  };

  resetView(): void {
    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);
    const mmW = pxW / this.defaultPxPerMm;
    const mmH = pxH / this.defaultPxPerMm;

    // reset zoom first
    this.pxPerMm = this.defaultPxPerMm;

    // ensure defaults exist
    if (this.offsetMmX === undefined || this.offsetMmY === undefined) {
      this.initDefaultCamera(mmW, mmH);
    }

    this.offsetMmX = this.offsetMmX!;
    this.offsetMmY = this.offsetMmY!;
    this.draw();
  }

  fitView(): void {
    // placeholder for later “fit to violin outline”
    this.resetView();
  }

  zoomIn(): void {
    this.applyZoom(this.pxPerMm * 1.1);
  }

  zoomOut(): void {
    this.applyZoom(this.pxPerMm / 1.1);
  }

  applyZoom(newPxPerMm: number): void {
    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);

    const oldPxPerMm = this.pxPerMm;

    // keep zoom centered on view center (your current wheel behavior)
    const oldMmW = pxW / oldPxPerMm;
    const oldMmH = pxH / oldPxPerMm;

    const centerX = this.offsetMmX! + oldMmW / 2;
    const centerY = this.offsetMmY! + oldMmH / 2;

    this.pxPerMm = newPxPerMm;

    const newMmW = pxW / this.pxPerMm;
    const newMmH = pxH / this.pxPerMm;

    this.offsetMmX = centerX - newMmW / 2;
    this.offsetMmY = centerY - newMmH / 2;

    this.draw();
  }
}
