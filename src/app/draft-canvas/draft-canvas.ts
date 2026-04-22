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
import { Camera } from './camera';
import { ReferenceImageController } from './reference-image-controller';

@Component({
  selector: 'app-draft-canvas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './draft-canvas.html',
  styleUrls: ['./draft-canvas.css'],
})

export class DraftCanvasComponent implements AfterViewInit, OnDestroy {
  private static readonly DISPLAY_PREFS_KEY = 'draft-canvas-display-preferences';
  private initialized = false;
  private canvas!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private gRoot!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private gUI!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private resizeObs?: ResizeObserver;
  private draftFuncs: Array<(canvas: any, uiCan: any) => void> = [];
  private camera = new Camera();
  private refController: ReferenceImageController;

  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  @Output() referenceImageChange = new EventEmitter<ReferenceImage | null>();
  @Input() set draftFunctions(value: Array<(canvas: any, uiCan: any) => void>) {
    this.draftFuncs = value
    this.draw();
  }
  @Input() set referenceImageParams(value: ReferenceImage | null | undefined) {
    if (value === undefined) return;
    if (value === null) {
      this.referenceImage = null as any;
      this.refController?.setImage(null as any);
      this.draw();
      return;
    }
    this.referenceImage = value;
    this.refController?.setImage(this.referenceImage);
    this.draw();
  }
  @Input() set setCameraBounds(bounds: { pt1: Pt, pt2: Pt } | null) {
    let firstSet = !this.bounds;
    this.bounds = bounds;
    if (bounds && firstSet)
      this.fitCamera();
  }
  // expose pxPerMm for the template/readouts while keeping camera as source of truth
  public get pxPerMm() {
    return this.camera.pxPerMm;
  }
  public set pxPerMm(v: number) {
    this.camera.pxPerMm = v;
  }

  private lastPxX = 0;
  private lastPxY = 0;
  public showGrid = true;
  public showAxes = true;
  public showReferenceImage = true;
  public isDarkMode = false;
  private isDragging = false;
  public referenceModeEnabled = false; // UI toggle ("Align Reference")
  public alignPopupOpen = false;
  public lockAspect = true;
  private refAspect = 1;
  private bounds: { pt1: Pt, pt2: Pt } | null = null;
  private oldReferenceImageParams?: ReferenceImage;

  referenceImage: ReferenceImage = {
    "href": "/DelGesuBaltic.png",
    "xlink:href": "/DelGesuBaltic.png",
    "x": -107,
    "y": -11.7,
    "width": 214,
    "height": 587,
  }

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
    // wire reference image controller (keeps component in sync via callback)
    this.refController = new ReferenceImageController(
      this.referenceImage,
      (img) => {
        this.referenceImage = img as any;
        this.referenceImageChange.emit(this.referenceImage ?? null);
      },
      () => this.draw()
    );

    // White suppression tuning for reference images (dark mode friendly)
    // Adjust these values in code as desired.
    this.refController.setWhiteSuppressionOptions({
      enabled: true,
      threshold: 0.9,
      softness: 0.08,
      saturationGate: 0.18,
    });

    this.loadDisplayPreferences();

    this.initialized = true;
    this.draw();
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
  }

  draw(): void {
    if (!this.initialized)
      return

    this.gRoot.selectAll('*').remove();
    this.gUI.selectAll('*').remove();

    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);

    const vb = this.camera.getViewBox(pxW, pxH);
    const mmW = vb.mmW;
    const mmH = vb.mmH;

    // Camera window (top-left in world mm coords)
    const leftBound = vb.leftBound;
    const rightBound = vb.rightBound;
    const topBound = vb.topBound;
    const bottomBound = vb.bottomBound;

    this.canvas.attr('viewBox', `${leftBound} ${topBound} ${mmW} ${mmH}`);
    this.gRoot.attr('transform', 'scale(1,-1)');

    const cv = {
      leftBound, rightBound, topBound, bottomBound, mmW, mmH
    };

    this.showAxes && this.drawAxis(cv);
    this.showAxes && this.drawAxisLabels(cv);
    this.showGrid && this.drawDots(cv, '#b4b4b4ff');
    this.showReferenceImage && this.refController.drawImage(this.gRoot)
    this.referenceModeEnabled && this.showReferenceImage && this.refController.drawControls(this.gRoot, this.pxPerMm);

    this.draftFuncs.map(f => {
      f(this.gRoot, this.gUI)
    })
  }

  private loadDisplayPreferences(): void {
    try {
      const raw = sessionStorage.getItem(DraftCanvasComponent.DISPLAY_PREFS_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        showGrid?: boolean;
        showAxes?: boolean;
        showReferenceImage?: boolean;
      };

      if (typeof parsed.showGrid === 'boolean') this.showGrid = parsed.showGrid;
      if (typeof parsed.showAxes === 'boolean') this.showAxes = parsed.showAxes;
      if (typeof parsed.showReferenceImage === 'boolean') this.showReferenceImage = parsed.showReferenceImage;
    } catch {
      // ignore malformed/blocked sessionStorage
    }
  }

  private persistDisplayPreferences(): void {
    try {
      sessionStorage.setItem(
        DraftCanvasComponent.DISPLAY_PREFS_KEY,
        JSON.stringify({
          showGrid: this.showGrid,
          showAxes: this.showAxes,
          showReferenceImage: this.showReferenceImage,
        })
      );
    } catch {
      // ignore storage errors
    }
  }

  onDisplayPreferenceChange(): void {
    this.persistDisplayPreferences();
    this.draw();
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

  // UI controls
  onPointerDown(event: PointerEvent) {
    // record last pixel position for potential camera pan
    this.lastPxX = event.clientX;
    this.lastPxY = event.clientY;

    const isPrimary = event.button === 0 || event.button === undefined; // left mouse / touch
    const isMiddle = event.button === 1; // middle mouse

    const canRefOps = this.referenceModeEnabled && this.showReferenceImage && !!this.referenceImage?.href;

    if (canRefOps && isPrimary) {
      const pt = this.worldFromPointer(event);
      const h = this.refController.hitTestHandle(pt, this.pxPerMm);

      if (h) {
        this.refController.startScale(pt, h);
        this.host.nativeElement.setPointerCapture(event.pointerId);
        return;
      }

      if (this.refController.pointInImage(pt)) {
        this.refController.startDrag(pt);
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
    if (this.refController.isInteracting) {
      const pt = this.worldFromPointer(event);
      this.refController.onPointerMove(pt);
      event.preventDefault();
      this.draw();
      return;
    }

    // camera pan
    if (!this.isDragging) return;

    const dxPx = event.clientX - this.lastPxX;
    const dyPx = event.clientY - this.lastPxY;

    this.lastPxX = event.clientX;
    this.lastPxY = event.clientY;

    // delegate pan to camera (it converts px -> mm internally)
    this.camera.panByPx(dxPx, dyPx);
    this.draw();
  };

  onPointerUp = (event: PointerEvent) => {
    // end reference-image interaction if active
    if (this.refController.isInteracting) {
      this.refController.endInteraction();
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
    // delegate keyboard handling for reference image to controller
    if (this.referenceModeEnabled && this.showReferenceImage && this.referenceImage?.href) {
      const handled = this.refController.handleKeyboard(event, this.lockAspect, this.refAspect);
      if (handled) {
        this.draw();
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  onScrollWheel = (event: WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY;

    if (delta < 0) this.applyZoom(this.pxPerMm* 1.1)
    else if (delta > 0) this.applyZoom(this.pxPerMm / 1.1)
    
  };

  applyZoom(newPxPerMm: number): void {
    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);

    // delegate to camera (keeps zoom centered)
    this.camera.applyZoom(newPxPerMm, pxW, pxH);
    this.draw();
  }


  fitCamera(): void {
    if (!this.bounds) return;
    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);
    this.refController.setImage(this.referenceImage);
    this.camera.fitToBounds(this.bounds, pxW, pxH);
  }


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

  resetReferenceImage(): void {
    if (this.oldReferenceImageParams) {
      this.referenceImage = { ...this.oldReferenceImageParams };
      this.referenceImageChange.emit(this.referenceImage);
      this.refController.setImage(this.referenceImage);
      this.draw();
    }
  }

  worldFromPointer(e: PointerEvent): Pt {
    // d3.pointer gives SVG user units (your viewBox units)
    const [sx, sy] = d3.pointer(e, this.gRoot.node() as any);
    // Your world is Y-up because gRoot is scale(1,-1)
    return { x: sx, y: sy };
  }
}