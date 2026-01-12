import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';
import { FormsModule } from '@angular/forms';
import { Input } from '@angular/core';
import { Pt, ReferenceImage } from '../models/types';

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
  @Output() referenceImageChange = new EventEmitter<ReferenceImage | null>();
  @Input() set draftFunctions(value: Array<(canvas: any, uiCan: any) => void>) {
    this.draftFuncs = value
    this.draw();
  }
  @Input() set referenceImageParams(value: ReferenceImage | null | undefined) {
    if (!value) return;
    this.referenceImage = value;
    this.referenceImageChange.emit(this.referenceImage);
    this.draw();
  }
  @Input() set setCameraBounds(bounds: {pt1: Pt, pt2: Pt} | null) {
    let firstSet = !this.bounds;
    this.bounds = bounds;
    if (bounds && firstSet)
      this.fitCamera();
  }

  public pxPerMm = 1.5;
  private offsetMmX?: number = -360;
  private offsetMmY?: number = -400;
  public showGrid = true;
  public showAxes = true;
  public showReferenceImage = true;
  public isDarkMode = false;

  private canvas!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private gRoot!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private gUI!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private resizeObs?: ResizeObserver;
  private draftFuncs: Array<(canvas: any, uiCan: any) => void> = [];
  referenceImage: ReferenceImage = {
    "href": "/DelGesuBaltic.png",
    "xlink:href": "/DelGesuBaltic.png",
    "x": -108,
    "y": -12,
    "width": 216,
    "height": 593,
  }

  private oldReferenceImageParams?: ReferenceImage;

  // drag state
  private isDragging = false;
  private lastPxX = 0;
  private lastPxY = 0;

  public referenceModeEnabled = false; // UI toggle ("Align Reference")
  public alignPopupOpen = false;
  public lockAspect = true;
  private refAspect = 1;
  private bounds: {pt1: Pt, pt2: Pt} | null = null;

  // private currentImageBounds: {a: Pt, b: Pt, c: Pt, d: Pt} = {}

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;

    this.canvas = d3.select(el)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%');

    this.gRoot = this.canvas.append('g').attr('class', 'root');
    this.gUI = this.canvas.append('g').attr('class', 'ui');

    this.resizeObs = new ResizeObserver(() => this.draw());
    this.resizeObs.observe(el);
    this.referenceImageChange.emit(this.referenceImage);    // sets our default gesu
    this.initialized = true;
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
  }

  fitCamera(draw: boolean = true): void {
    if (!this.bounds) return;

    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);

    // Calculate bounds in world coords
    const minX = Math.min(this.bounds!.pt1.x, this.bounds!.pt2.x);
    const maxX = Math.max(this.bounds!.pt1.x, this.bounds!.pt2.x);
    const minY = Math.min(-this.bounds!.pt1.y, -this.bounds!.pt2.y);
    const maxY = Math.max(-this.bounds!.pt1.y, -this.bounds!.pt2.y);

    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;

    // Add padding (10% on each side)
    const padding = 0.2;
    const paddedWidth = boundsWidth * (1 + padding * 2);
    const paddedHeight = boundsHeight * (1 + padding * 2);

    // Fit to view with correct aspect ratio
    const zoomX = pxW / paddedWidth;
    const zoomY = pxH / paddedHeight;
    this.pxPerMm = Math.min(zoomX, zoomY);

    // Center the bounds in view
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const mmW = pxW / this.pxPerMm;
    const mmH = pxH / this.pxPerMm;

    this.offsetMmX = centerX - mmW / 2;
    this.offsetMmY = centerY - mmH / 2;

    draw && this.draw();
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

    this.showAxes && this.drawAxis(cv);
    this.showAxes && this.drawAxisLabels(cv);
    this.showGrid && this.drawDots(cv, '#b4b4b4ff');
    this.showReferenceImage && this.drawReferenceImage()
    this.referenceModeEnabled && this.showReferenceImage && this.drawReferenceImageControls();

    this.draftFuncs.map(f => {
      f(this.gRoot, this.gUI)
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

  drawReferenceImage = () => {
    if (!this.referenceImage?.href) return;

    const { href, x, y, width, height } = this.referenceImage;

    const img = this.gRoot.append("image")
      .attr("class", "reference-image")
      .attr("href", href)
      .attr("xlink:href", href) // harmless; optional in modern SVG
      .attr("transform", `translate(0 ${height}) scale(1 -1)`)
      .attr("x", x)
      .attr("y", -y)
      .attr("width", width)
      .attr("height", height)
      .attr("opacity", 0.25)
      .attr("preserveAspectRatio", "xMidYMid meet");

    img.lower();
  };

  // unified pointer controls: camera pan + reference image drag/scale
  onPointerDown = (event: PointerEvent) => {
    // record last pixel position for potential camera pan
    this.lastPxX = event.clientX;
    this.lastPxY = event.clientY;

    const isPrimary = event.button === 0 || event.button === undefined; // left mouse / touch
    const isMiddle = event.button === 1; // middle mouse

    const canRefOps = this.referenceModeEnabled && this.showReferenceImage && !!this.referenceImage?.href;

    if (canRefOps && isPrimary) {
      const pt = this.worldFromPointer(event);
      const h = this.hitTestHandle(pt, this.referenceImage);

      if (h) {
        this.startScale(pt, h);
        this.host.nativeElement.setPointerCapture(event.pointerId);
        return;
      }

      if (this.pointInImage(pt, this.referenceImage)) {
        this.startDrag(pt);
        this.host.nativeElement.setPointerCapture(event.pointerId);
        return;
      }
      // fall through to pan if click not on image/handles
    }

    // camera pan (middle mouse always; primary when not interacting with reference image)
    if (isMiddle || isPrimary) {
      this.isDragging = true;
      this.host.nativeElement.classList.add('dragging');
      this.host.nativeElement.setPointerCapture(event.pointerId);
    }
  };

  onPointerMove = (event: PointerEvent) => {
    // reference-image interaction takes precedence
    if (this.isInteracting) {
      if (!this.referenceImage || !this.startImage) return;
      const pt = this.worldFromPointer(event);
      if (this.activeHandle) this.updateScale(pt);
      else this.updateDrag(pt);
      event.preventDefault();
      return;
    }

    // camera pan
    if (!this.isDragging) return;

    const dxPx = event.clientX - this.lastPxX;
    const dyPx = event.clientY - this.lastPxY;

    this.lastPxX = event.clientX;
    this.lastPxY = event.clientY;

    const dxMm = dxPx / this.pxPerMm;
    const dyMm = dyPx / this.pxPerMm;

    this.offsetMmX! -= dxMm;
    this.offsetMmY! -= dyMm;

    this.draw();
  };

  onPointerUp = (event: PointerEvent) => {
    // end reference-image interaction if active
    if (this.isInteracting) {
      this.isInteracting = false;
      this.activeHandle = null;
      this.dragStartPt = undefined;
      this.anchorPt = undefined;
      this.startImage = undefined;
      this.referenceImageChange.emit(this.referenceImage ?? null);
    }

    // end camera pan if active
    if (this.isDragging) {
      this.isDragging = false;
      this.host.nativeElement.classList.remove('dragging');
    }

    try {
      this.host.nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      // ignore (can throw if not captured)
    }
  };

  onKeyDown = (event: KeyboardEvent) => {
    if (!this.referenceModeEnabled) return;
    if (!this.showReferenceImage) return;
    if (!this.referenceImage?.href) return;

    const stepMm = 1;
    const scaleStep = 1.05;
    let dx = 0;
    let dy = 0;
    let scale: number | null = null;

    switch (event.key) {
      case 'ArrowUp':
        if (event.ctrlKey) scale = scaleStep; // scale up
        else dy += stepMm; // Y-up world
        break;
      case 'ArrowDown':
        if (event.ctrlKey) scale = 1 / scaleStep; // scale down
        else dy -= stepMm;
        break;
      case 'ArrowLeft':
        dx -= stepMm;
        break;
      case 'ArrowRight':
        dx += stepMm;
        break;
      default:
        return;
    }

    if (scale !== null) {
      const img = this.referenceImage;
      const minMm = 1;
      const cx = img.x + img.width / 2;
      const cy = img.y + img.height / 2;

      let newW = Math.max(minMm, img.width * scale);
      let newH = Math.max(minMm, img.height * scale);

      // keep aspect ratio on scale; uses current aspect if available
      const aspect = Math.abs(img.width / img.height) || 1;
      newH = Math.max(minMm, newW / aspect);

      const newX = cx - newW / 2;
      const newY = cy - newH / 2;

      this.referenceImage = {
        ...img,
        x: newX,
        y: newY,
        width: newW,
        height: newH,
      };
    } else {
      this.referenceImage = {
        ...this.referenceImage,
        x: this.referenceImage.x + dx,
        y: this.referenceImage.y + dy,
      };
    }

    this.referenceImageChange.emit(this.referenceImage);
    this.draw();

    event.preventDefault();
    event.stopPropagation();
  };

  startDrag(pt: Pt): void {
    if (!this.referenceImage) return;
    this.isInteracting = true;
    this.activeHandle = null;
    this.dragStartPt = pt;
    this.startImage = { ...this.referenceImage };
  }

  updateDrag(pt: Pt): void {
    if (!this.referenceImage || !this.startImage || !this.dragStartPt) return;

    const dx = pt.x - this.dragStartPt.x;
    const dy = pt.y - this.dragStartPt.y;

    this.referenceImage = {
      ...this.referenceImage,
      x: this.startImage.x + dx,
      y: this.startImage.y + dy,
    };

    this.draw();
  }



























  onScrollWheel = (event: WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY;

    const oldPxPerMm = this.pxPerMm;

    if (delta < 0) this.pxPerMm *= 1.1;
    else if (delta > 0) this.pxPerMm /= 1.1;

    this.applyZoom(this.pxPerMm)
  };

  // UI: Align Reference popup controls
  toggleAlignPopup(): void {
    this.referenceModeEnabled = !this.referenceModeEnabled;
    this.alignPopupOpen = this.referenceModeEnabled;
    this.oldReferenceImageParams = this.referenceImage
    const img = this.referenceImage;
    if (img && img.height) this.refAspect = Math.abs(img.width / img.height) || 1;
    this.draw();
  }

  closeAlignPopup(): void {
    this.alignPopupOpen = false;
  }

  onRefParamChange(key: keyof ReferenceImage, val: number): void {
    if (!this.referenceImage) return;
    const v = Number(val) || 0;
    const minMm = 1;

    let next: ReferenceImage = { ...this.referenceImage } as ReferenceImage;

    if (key === 'x' || key === 'y') {
      (next as any)[key] = v;
    } else if (key === 'width') {
      next.width = Math.max(minMm, v);
      if (this.lockAspect) {
        next.height = Math.max(minMm, Math.round(next.width / (this.refAspect || 1)));
      }
    } else if (key === 'height') {
      next.height = Math.max(minMm, v);
      if (this.lockAspect) {
        next.width = Math.max(minMm, Math.round(next.height * (this.refAspect || 1)));
      }
    }

    this.referenceImage = next;
    this.referenceImageChange.emit(this.referenceImage);
    this.draw();
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

  // reference image controls
  async onReferenceFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const dataUrl = await this.readFileAsDataUrl(file);

    // Load it once to get natural dimensions
    const { w, h } = await this.getImageSize(dataUrl);

    // Simple, predictable default:
    // - size in "mm units" = natural px (same as your current approach)
    // - place centered on X, start near Y=0
    const width = w;
    const height = h;

    this.referenceImage = {
      href: dataUrl,
      "xlink:href": dataUrl,
      x: -width / 2,
      y: 0,
      width,
      height,
    };

    this.referenceImageChange.emit(this.referenceImage);

    // Optional: auto-enable showing it when user uploads
    this.showReferenceImage = true;

    this.draw();

    // optional: allow re-uploading same file by clearing the input
    input.value = '';
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private getImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  clearReferenceImage(): void {
    this.referenceImage = undefined as any; // or make it nullable
    this.referenceImageChange.emit(null);
    this.draw();
  }

  resetReferenceImage(): void {
    if (this.oldReferenceImageParams) {
      this.referenceImage = { ...this.oldReferenceImageParams };
      this.referenceImageChange.emit(this.referenceImage);
      this.draw();
    }
  }

  // handle + interaction state
  private activeHandle: 'nw' | 'ne' | 'sw' | 'se' | null = null;
  private dragStartPt?: Pt;
  private startImage?: ReferenceImage;
  private anchorPt?: Pt;
  private isInteracting = false;

  // tuning
  private handlePx = 12;   // corner handle radius in screen px
  private hitSlopPx = 10;  // extra hit area in px


  private worldFromPointer(e: PointerEvent): Pt {
    // d3.pointer gives SVG user units (your viewBox units)
    const [sx, sy] = d3.pointer(e, this.gRoot.node() as any);
    // Your world is Y-up because gRoot is scale(1,-1)
    return { x: sx, y: sy };
  }

  private handleRmm(): number {
    return this.handlePx / this.pxPerMm;
  }

  private hitSlopMm(): number {
    return this.hitSlopPx / this.pxPerMm;
  }

  private imageBounds(img: ReferenceImage) {
    const x0 = Math.min(img.x, img.x + img.width);
    const x1 = Math.max(img.x, img.x + img.width);
    const y0 = Math.min(img.y, img.y + img.height);
    const y1 = Math.max(img.y, img.y + img.height);
    return { x0, x1, y0, y1 };
  }

  private pointInImage(pt: Pt, img: ReferenceImage): boolean {
    const b = this.imageBounds(img);
    const s = this.hitSlopMm();
    return pt.x >= b.x0 - s && pt.x <= b.x1 + s && pt.y >= b.y0 - s && pt.y <= b.y1 + s;
  }

  private cornerPts(img: ReferenceImage) {
    const x0 = img.x;
    const y0 = img.y;
    const x1 = img.x + img.width;
    const y1 = img.y + img.height;

    return {
      sw: { x: x0, y: y0 },
      se: { x: x1, y: y0 },
      nw: { x: x0, y: y1 },
      ne: { x: x1, y: y1 },
    };
  }

  private hitTestHandle(pt: Pt, img: ReferenceImage): 'nw' | 'ne' | 'sw' | 'se' | null {
    const corners = this.cornerPts(img);
    const r = this.handleRmm() + this.hitSlopMm();

    const dist2 = (a: Pt, b: Pt) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy;
    };

    const r2 = r * r;

    // Check handles first; prioritize nearer if multiple overlap
    let best: { h: any; d2: number } | null = null;
    (['nw', 'ne', 'sw', 'se'] as const).forEach(h => {
      const d2 = dist2(pt, corners[h]);
      if (d2 <= r2 && (!best || d2 < best.d2)) best = { h, d2 };
    });

    return (best?.h ?? null);
  }

  private startScale(pt: Pt, handle: 'nw' | 'ne' | 'sw' | 'se'): void {
    if (!this.referenceImage) return;
    this.isInteracting = true;
    this.activeHandle = handle;
    this.dragStartPt = pt;
    this.startImage = { ...this.referenceImage };

    // anchor is opposite corner
    const corners = this.cornerPts(this.startImage);
    const anchorKey =
      handle === 'nw' ? 'se' :
        handle === 'ne' ? 'sw' :
          handle === 'sw' ? 'ne' : 'nw';

    this.anchorPt = corners[anchorKey];
  }

  private updateScale(pt: Pt): void {
    if (!this.referenceImage || !this.startImage || !this.anchorPt || !this.activeHandle) return;

    const startW = this.startImage.width;
    const startH = this.startImage.height;

    // Keep aspect ratio based on starting image
    const aspect = Math.abs(startW / startH) || 1;

    // vector from anchor to pointer
    const dx = pt.x - this.anchorPt.x;
    const dy = pt.y - this.anchorPt.y;

    let targetW = Math.abs(dx);
    let targetH = Math.abs(dy);

    // maintain aspect ratio, constrain by whichever axis is limiting
    if (targetW / Math.max(targetH, 1e-6) > aspect) {
      // width too big relative to height; clamp width by height
      targetW = targetH * aspect;
    } else {
      // height too big relative to width; clamp height by width
      targetH = targetW / aspect;
    }

    // minimum size so it can't collapse to nothing
    const minMm = 10;
    targetW = Math.max(minMm, targetW);
    targetH = Math.max(minMm, targetH);

    // Recompute x,y so anchor stays fixed
    // Determine whether anchor is west/east and south/north relative to new rect
    const anchorIsWest = (this.activeHandle === 'ne' || this.activeHandle === 'se'); // handle on east => anchor west
    const anchorIsSouth = (this.activeHandle === 'ne' || this.activeHandle === 'nw'); // handle on north => anchor south

    const newX = anchorIsWest ? this.anchorPt.x : this.anchorPt.x - targetW;
    const newY = anchorIsSouth ? this.anchorPt.y : this.anchorPt.y - targetH;

    this.referenceImage = {
      ...this.referenceImage,
      x: newX,
      y: newY,
      width: targetW,
      height: targetH,
    };

    this.draw();
  }

  private drawReferenceImageControls(): void {
    if (!this.referenceImage?.href) return;

    const img = this.referenceImage;
    const corners = this.cornerPts(img);
    const r = this.handleRmm();

    // bounding box
    this.gRoot.append('rect')
      .attr('x', img.x)
      .attr('y', img.y)
      .attr('width', img.width)
      .attr('height', img.height)
      .attr('fill', 'none')
      .attr('stroke', '#bb1212ff')
      .attr('stroke-width', 2 / this.pxPerMm)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');

    // corner handles
    const handles = (['nw', 'ne', 'sw', 'se'] as const).map(h => ({ h, ...corners[h] }));

    this.gRoot.append('g')
      .attr('class', 'ref-handles')
      .selectAll('circle')
      .data(handles)
      .enter()
      .append('circle')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', r)
      .attr('fill', '#fff')
      .attr('stroke', '#bb1212ff')
      .attr('stroke-width', 2 / this.pxPerMm)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
  }

}
