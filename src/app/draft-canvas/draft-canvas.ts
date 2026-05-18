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
import { AxisGridController, AxisGridPreferences, CanvasViewport } from './axis-grid-controller';

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
  private axisGrid = new AxisGridController(DraftCanvasComponent.DISPLAY_PREFS_KEY, () => this.draw());
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
    let oldBounds = JSON.parse(JSON.stringify(this.bounds));
    this.bounds = bounds;
    if (bounds && firstSet || bounds != oldBounds) {
      this.fitCamera();
      this.draw();
    }
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
  public showReferenceImage = true;
  public isDarkMode = false;
  private isDragging = false;
  public axisPopupOpen = false;
  public referenceModeEnabled = false; // UI toggle ("Align Reference")
  public alignPopupOpen = false;
  public lockAspect = true;
  private refAspect = 1;
  private bounds: { pt1: Pt, pt2: Pt } | null = null;
  private oldReferenceImageParams?: ReferenceImage;

  referenceImage: ReferenceImage = {
    "href": "",
    "xlink:href": "",
    "x": 0,
    "y": 0,
    "width": 0,
    "height": 0,
    "rotationDeg": 0,
  }

  public get showGrid(): boolean {
    return this.axisGrid.showGrid;
  }

  public set showGrid(value: boolean) {
    this.axisGrid.updatePreferences({ showGrid: value });
  }

  public get showAxes(): boolean {
    return this.axisGrid.showAxes;
  }

  public set showAxes(value: boolean) {
    this.axisGrid.updatePreferences({ showAxes: value });
  }

  public get showGridX(): boolean {
    return this.axisGrid.showGridX;
  }

  public set showGridX(value: boolean) {
    this.axisGrid.updatePreferences({ showGridX: value });
  }

  public get showGridY(): boolean {
    return this.axisGrid.showGridY;
  }

  public set showGridY(value: boolean) {
    this.axisGrid.updatePreferences({ showGridY: value });
  }

  public get gridStepX(): number {
    return this.axisGrid.gridStepX;
  }

  public set gridStepX(value: number) {
    this.axisGrid.updatePreferences({ gridStepX: value });
  }

  public get gridStepY(): number {
    return this.axisGrid.gridStepY;
  }

  public set gridStepY(value: number) {
    this.axisGrid.updatePreferences({ gridStepY: value });
  }

  private normalizeRotationDeg(deg: number): number {
    const v = deg % 360;
    return v < 0 ? v + 360 : v;
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
        // this.referenceImageChange.emit(this.referenceImage ?? null);
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

    this.axisGrid.loadPreferences();
    this.loadReferenceImagePreference();

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

    this.axisGrid.draw(this.gRoot, this.gUI, cv, this.pxPerMm);
    this.showReferenceImage && this.refController.drawImage(this.gRoot)
    this.referenceModeEnabled && this.showReferenceImage && this.refController.drawControls(this.gRoot, this.pxPerMm);

    this.draftFuncs.map(f => {
      f(this.gRoot, this.gUI)
    })
  }

  onDisplayPreferenceChange(): void {
    try {
      const existingRaw = sessionStorage.getItem(DraftCanvasComponent.DISPLAY_PREFS_KEY);
      const existing = existingRaw ? JSON.parse(existingRaw) as Record<string, unknown> : {};

      sessionStorage.setItem(
        DraftCanvasComponent.DISPLAY_PREFS_KEY,
        JSON.stringify({
          ...existing,
          showReferenceImage: this.showReferenceImage,
        })
      );
    } catch {
      // ignore storage errors
    }
    this.draw();
  }

  private loadReferenceImagePreference(): void {
    try {
      const raw = sessionStorage.getItem(DraftCanvasComponent.DISPLAY_PREFS_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        showReferenceImage?: boolean;
      };

      if (typeof parsed.showReferenceImage === 'boolean') {
        this.showReferenceImage = parsed.showReferenceImage;
      }
    } catch {
      // ignore malformed/blocked sessionStorage
    }
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
        this.refController.startScale(pt, h as any);
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

  toggleAxisPopup(): void {
    this.axisPopupOpen = !this.axisPopupOpen;
  }

  onRefParamChange(key: keyof ReferenceImage, val: number): void {
    if (!this.referenceImage) return;
    const v = Number(val) || 0;
    const minMm = 1;

    let next: ReferenceImage = { ...this.referenceImage } as ReferenceImage;

    if (key === 'x' || key === 'y') {
      (next as any)[key] = v;
      } else if (key === 'rotationDeg') {
      next.rotationDeg = this.normalizeRotationDeg(v);
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

  async onReferenceFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const dataUrl = await this.readFileAsDataUrl(file);
    const { w, h } = await this.getImageSize(dataUrl);

    // Scale image to fit within the current camera bounds (preserve aspect ratio)
    const aspect = w / h || 1;
    let imgW: number;
    let imgH: number;
    let imgX: number;
    let imgY: number;

    if (this.bounds) {
      const bW = Math.abs(this.bounds.pt2.x - this.bounds.pt1.x);
      const bH = Math.abs(this.bounds.pt2.y - this.bounds.pt1.y);
      const bCx = (this.bounds.pt1.x + this.bounds.pt2.x) / 2;
      const bCy = (this.bounds.pt1.y + this.bounds.pt2.y) / 2;

      if (bW / bH > aspect) {
        imgH = bH;
        imgW = imgH * aspect;
      } else {
        imgW = bW;
        imgH = imgW / aspect;
      }

      imgX = bCx - imgW / 2;
      imgY = bCy - imgH / 2;
    } else {
      // No bounds set — fall back to a 200 mm wide default
      imgW = 200;
      imgH = imgW / aspect;
      imgX = -imgW / 2;
      imgY = 0;
    }

    const img: ReferenceImage = {
      href: dataUrl,
      'xlink:href': dataUrl,
      x: imgX,
      y: imgY,
      width: imgW,
      height: imgH,
      rotationDeg: 0,
    };

    this.oldReferenceImageParams = { ...img };
    this.refAspect = w / h || 1;
    this.referenceImage = img;
    this.refController.setImage(img);
    this.referenceImageChange.emit(img);
    this.showReferenceImage = true;
    this.draw();

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

  worldFromPointer(e: PointerEvent | MouseEvent): Pt {
    // d3.pointer gives SVG user units (your viewBox units)
    const [sx, sy] = d3.pointer(e as any, this.gRoot.node() as any);
    // Your world is Y-up because gRoot is scale(1,-1)
    return { x: sx, y: sy };
  }

  onDoubleClick(event: MouseEvent): void {
    // double-click zooms in at the clicked point; hold Shift/Ctrl/Alt/Meta to zoom out
    event.preventDefault();

    const pt = this.worldFromPointer(event);
    const el = this.host.nativeElement;
    const pxW = Math.max(1, el.clientWidth);
    const pxH = Math.max(1, el.clientHeight);

    const zoomInFactor = 1.75;
    const zoomFactor = (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) ? (1 / zoomInFactor) : zoomInFactor;

    const newPxPerMm = this.pxPerMm * zoomFactor;

    pt.y = -pt.y; // account for Y-up

    this.camera.applyZoomAt(pt, newPxPerMm, pxW, pxH);
    this.draw();
  }
}