import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';
import { FormsModule } from '@angular/forms';
import { Input } from '@angular/core';
import { NamedReferenceImage, Pt, ReferenceImage } from '../models/types';
import { Camera } from './camera';
import { ReferenceImageController } from './reference-image-controller';
import { AxisGridController, AxisGridPreferences, CanvasViewport } from './axis-grid-controller';
import { toNamedReferenceImage } from '../helpers/referenceImages';
import { info } from '../shared/message-emitter';
import { DraftTool, DraftToolHost } from './tools/draft-tool';
import { createLineTool, createDottedLineTool } from './tools/line-tool';
import { createArcTool, createArcStartFirstTool } from './tools/arc-tool';
import { createTangentArcTool } from './tools/tangent-arc-tool';
import { createCircleTool, createDottedCircleTool } from './tools/circle-tool';
import { createDimensionTool } from './tools/dimension-tool';
import { createRectTool, createSquareTool } from './tools/rect-tool';
import { createBoxLineTool } from './tools/box-line-tool';
import { createTextTool } from './tools/text-tool';
import { createPointTool } from './tools/point-tool';
import { ToolSlot, single, flyout } from './tools/tool-slot';
import { ToolboxStore } from './tools/toolbox-store';
import { drawShape, drawSelectionHalo, drawMoveGrabber, drawEndpointGrabber } from './tools/shape-renderer';
import { SnapCandidate, SnapEngine } from './tools/snap-engine';
import { drawSnapMarker } from './tools/snap-marker-renderer';
import { distanceToShape } from './tools/shape-hit-test';
import { translateShape } from './tools/shape-transform';
import { moveGrabberPosition, endpointGrabbers, withEndpoint, EndpointKey } from './tools/shape-grabbers';
import { snapToLockedAngle } from './tools/angle-lock';
import { DraftShape } from './tools/toolbox-shape';
import { HOTKEY_TOOL_CYCLE } from './tools/tool-hotkeys';
import { ToolPaletteComponent } from './tool-palette/tool-palette';

@Component({
  selector: 'app-draft-canvas',
  standalone: true,
  imports: [FormsModule, ToolPaletteComponent],
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
  private toolbox = inject(ToolboxStore);
  private toolboxUnsub?: () => void;
  // Add new tools here, grouped into rows of up to 2 slots. Use flyout([...])
  // to group every variant of the same kind of shape (styles and construction
  // methods alike) behind one button + caret; use single(...) for a tool with
  // no variants. The toolbar and pointer routing pick both up automatically.
  public toolRows: ToolSlot[][] = [
    [
      flyout([createLineTool(), createDottedLineTool(), createDimensionTool()]),
    ],
    [
      flyout([createArcTool(), createTangentArcTool(), createArcStartFirstTool()]),
    ],
    [
      flyout([createCircleTool(), createDottedCircleTool()]),
    ],
    [
      flyout([createRectTool(), createSquareTool()]),
    ],
    [
      single(createBoxLineTool(this.toolbox)),
    ],
    [
      single(createTextTool()),
    ],
    [
      single(createPointTool()),
    ],
  ];
  public activeTool: DraftTool | null = null;
  private isAngleLockHeld = false;
  private toolHost: DraftToolHost = {
    addShape: (shape) => this.toolbox.addShape({
      ...shape,
      color: shape.color ?? this.toolbox.currentColor,
      layerId: shape.layerId ?? this.toolbox.activeLayerId,
    }),
    requestDraw: () => this.draw(),
    getSnapTangent: () => this.activeSnap?.tangent,
    isAngleLockHeld: () => this.isAngleLockHeld,
  };

  // Snapping: candidates are re-indexed from the rendered scene only when the
  // underlying geometry changes (draftFunctions/toolbox shapes), not on every
  // hover redraw — see `snapDirty` below.
  private static readonly SNAP_TOLERANCE_PX = 10;
  private snapEngine = new SnapEngine();
  private snapDirty = true;
  private activeSnap: SnapCandidate | null = null;
  // The most recently drawn `.snappable` layer — kept so an endpoint-drag (which happens in
  // Select mode, with no active tool) can force an on-demand rebuild; see ensureSnapIndex().
  private snapLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;

  // Selection (Select tool, i.e. activeTool === null): which toolbox shape(s), if any, are
  // picked. Plain click replaces the selection; shift-click toggles a shape in/out of it.
  private static readonly SELECT_HIT_TOLERANCE_PX = 6;
  private static readonly MOVE_GRABBER_HIT_TOLERANCE_PX = 9;
  private static readonly NUDGE_STEP_MM_FINE = 1;
  private static readonly NUDGE_STEP_MM_COARSE = 10;
  private static readonly ARROW_NUDGE_DIRECTION: Record<string, [number, number]> = {
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };
  private selectedShapeIds = new Set<string>();

  // Drag-to-move: pointerdown on an already-selected shape arms a potential move; it only
  // becomes a real drag once the pointer clears a small threshold (so a plain click still just
  // selects). While dragging, the moved shapes are rendered from `dragOverrides` — a live,
  // uncommitted preview — and only written to the store as one batched update on pointerup, so
  // a whole drag is a single undo step instead of one per intermediate pointermove.
  private static readonly DRAG_MOVE_THRESHOLD_PX = 3;
  private dragAnchor: Pt | null = null;
  private dragOriginals: DraftShape[] = [];
  private dragOverrides: Map<string, DraftShape> | null = null;
  private isDraggingSelection = false;

  // Drag-an-endpoint: same live-preview-then-batch-commit approach as drag-to-move, but edits
  // a single (x,y) point on a single shape rather than translating the whole selection. Shares
  // `dragOverrides` with the move-drag above — draw() doesn't care which mechanism produced it.
  private dragEndpoint: { shapeId: string; key: EndpointKey; original: DraftShape } | null = null;
  private isDraggingEndpoint = false;

  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  @ViewChild(ToolPaletteComponent) toolPalette?: ToolPaletteComponent;
  @Output() referenceImagesChange = new EventEmitter<NamedReferenceImage[]>();
  @Input() set draftFunctions(value: Array<(canvas: any, uiCan: any) => void>) {
    this.draftFuncs = value
    this.snapDirty = true;
    this.draw();
  }
  @Input() set referenceImages(value: NamedReferenceImage[] | null | undefined) {
    if (value === undefined) return;
    this._referenceImages = value ?? [];
    // Keep the active tab pointing at a live entry (or the first one).
    if (!this._referenceImages.some(r => r.id === this.activeRefId)) {
      this.activeRefId = this._referenceImages[0]?.id ?? null;
      this.captureResetBaseline();
    }
    this.syncControllerToActive();
    this.draw();
  }
  public get referenceImages(): NamedReferenceImage[] {
    return this._referenceImages;
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
  private activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;
  private lastPinchMid = { x: 0, y: 0 };
  public showReferenceImage = true;
  public isDarkMode = false;
  private isDragging = false;
  private isSpaceDown = false;
  public axisPopupOpen = false;
  public referenceModeEnabled = false; // UI toggle ("Align Reference")
  public alignPopupOpen = false;
  public lockAspect = true;
  private refAspect = 1;
  private bounds: { pt1: Pt, pt2: Pt } | null = null;
  private oldReferenceImageParams?: NamedReferenceImage;

  // The multi-image collection lives here; the controller only ever holds the
  // active entry. Tabs switch which entry is active/editable/drawn.
  private _referenceImages: NamedReferenceImage[] = [];
  public activeRefId: string | null = null;
  public editingRefId: string | null = null;
  private pendingRefUploadMode: 'add' | 'replace' = 'add';

  public get activeReferenceImage(): NamedReferenceImage | null {
    return this._referenceImages.find(r => r.id === this.activeRefId) ?? null;
  }

  public get referenceOpacity(): number {
    return this.refController?.referenceOpacity ?? 0.25;
  }
  public set referenceOpacity(v: number) {
    if (this.refController) {
      this.refController.referenceOpacity = Math.max(0, Math.min(1, v));
      this.draw();
    }
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
    this.host.nativeElement.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('keydown', this.onKeyDown);

    this.canvas = d3.select(el)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%');

    this.gRoot = this.canvas.append('g').attr('class', 'root');
    this.gUI = this.canvas.append('g').attr('class', 'ui');

    // Guarded for test environments (jsdom) that don't implement ResizeObserver.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.draw());
      this.resizeObs.observe(el);
    }
    // wire reference image controller (keeps the active tab in sync via callback)
    this.refController = new ReferenceImageController(
      this.activeReferenceImage ?? undefined,
      (img) => this.applyControllerChange(img),
      () => this.draw()
    );
    this.syncControllerToActive();

    // White suppression tuning for reference images (dark mode friendly)
    // Adjust these values in code as desired.
    this.refController.setWhiteSuppressionOptions({
      enabled: true,
      threshold: 0.9,
      softness: 0.08,
      saturationGate: 0.18,
    });

    this.axisGrid.loadPreferences();
    this.loadDisplayPreferences();

    // redraw when the toolbox shape history changes from outside this component
    // (e.g. recipe-base's undo/redo keyboard handler)
    this.toolboxUnsub = this.toolbox.onChange(() => {
      this.snapDirty = true;
      const editableIds = new Set(this.toolbox.getEditableShapes().map(s => s.id));
      for (const id of this.selectedShapeIds) {
        if (!editableIds.has(id)) this.selectedShapeIds.delete(id);
      }
      this.draw();
    });

    this.initialized = true;
    this.draw();
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
    this.host.nativeElement.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('keydown', this.onKeyDown);
    this.toolboxUnsub?.();
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

    if (this.selectedShapeIds.size) {
      const editable = this.toolbox.getEditableShapes();
      for (const id of this.selectedShapeIds) {
        const shape = this.dragOverrides?.get(id) ?? editable.find(s => s.id === id);
        if (!shape) continue;
        drawSelectionHalo(this.gRoot, this.gUI, shape, this.pxPerMm);
        const grabberPos = moveGrabberPosition(shape);
        if (grabberPos) drawMoveGrabber(this.gRoot, grabberPos, this.pxPerMm);
        const endpoints = endpointGrabbers(shape);
        if (endpoints) for (const g of endpoints) drawEndpointGrabber(this.gRoot, g.pos, this.pxPerMm);
      }
    }

    const snapLayer = this.gRoot.append('g').attr('class', 'snappable');
    this.snapLayer = snapLayer;
    this.draftFuncs.map(f => {
      f(snapLayer, this.gUI)
    })
    this.toolbox.getVisibleShapes().forEach(s => {
      const shape = this.dragOverrides?.get(s.id) ?? s;
      drawShape(snapLayer, this.gUI, shape, this.pxPerMm);
    });

    // Candidates are only ever read from resolveToolPoint() and (on-demand, via
    // ensureSnapIndex()) an in-progress endpoint-drag — both no-ops the rest of the time
    // (e.g. while editing a selected shape's properties in Select mode) — so skip the
    // (potentially large, whole-scene) rebuild until something actually needs it. `snapDirty`
    // stays set, so the next thing that does need it still rebuilds first.
    if (this.snapDirty && (this.activeTool || this.dragEndpoint)) {
      this.snapEngine.rebuild(snapLayer);
      this.snapDirty = false;
    }

    this.activeTool?.renderPreview(this.gRoot, this.gUI, this.pxPerMm);
    if ((this.activeTool || this.isDraggingEndpoint) && this.activeSnap) {
      drawSnapMarker(this.gRoot, this.activeSnap, this.pxPerMm);
    }
  }

  /** Pass null to switch to the default select tool (no active drafting tool). Also used
   * as the (toolActivated) handler for <app-tool-palette> — see tool-palette.ts. */
  selectTool(tool: DraftTool | null): void {
    this.activeTool?.reset();
    this.activeTool = tool;
    this.activeSnap = null;
    if (tool) this.selectedShapeIds.clear(); // selection only applies in Select mode
    this.draw();
  }

  /** Activates a tool by id from anywhere in toolRows — used by the hotkey mnemonics. Mutates
   * the slot's selectedIndex directly (toolRows is shared by reference with the tool palette,
   * which does the same on click) so a flyout's face stays in sync regardless of trigger source. */
  private activateToolById(id: string): void {
    for (const row of this.toolRows) {
      for (const slot of row) {
        if (slot.kind === 'single') {
          if (slot.tool.id === id) { this.selectTool(slot.tool); return; }
        } else {
          const idx = slot.variants.findIndex(v => v.id === id);
          if (idx >= 0) { slot.selectedIndex = idx; this.selectTool(slot.variants[idx]); return; }
        }
      }
    }
  }

  /** Rebuilds the snap index right now if it's stale — used when arming an endpoint-drag,
   * since that starts in Select mode (no active tool), where draw()'s own rebuild would
   * otherwise wait until the next draw() call, one tick too late for that drag's first move. */
  private ensureSnapIndex(): void {
    if (this.snapDirty && this.snapLayer) {
      this.snapEngine.rebuild(this.snapLayer);
      this.snapDirty = false;
    }
  }

  /** Resolves a raw pointer point to a nearby snap candidate when a tool is active. */
  private resolveToolPoint(rawPt: Pt): Pt {
    if (!this.activeTool) {
      this.activeSnap = null;
      return rawPt;
    }
    const toleranceMm = DraftCanvasComponent.SNAP_TOLERANCE_PX / this.pxPerMm;
    const hit = this.snapEngine.nearest(rawPt, toleranceMm);
    this.activeSnap = hit;
    return hit ? hit.pt : rawPt;
  }

  /** Nearest toolbox shape to a world-space point within the select tolerance, or null. */
  private hitTestToolboxShape(pt: Pt): string | null {
    const toleranceMm = DraftCanvasComponent.SELECT_HIT_TOLERANCE_PX / this.pxPerMm;
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const shape of this.toolbox.getEditableShapes()) {
      const dist = distanceToShape(pt, shape, this.pxPerMm);
      if (dist <= toleranceMm && dist < bestDist) {
        bestId = shape.id;
        bestDist = dist;
      }
    }
    return bestId;
  }

  /** True if `pt` (world mm) grabs a move handle of a currently selected shape — the square
   * for shapes that have one, or the shape body itself for Text/Point (see moveGrabberPosition). */
  private hitTestMoveHandle(pt: Pt): boolean {
    const grabberToleranceMm = DraftCanvasComponent.MOVE_GRABBER_HIT_TOLERANCE_PX / this.pxPerMm;
    const grabberTol2 = grabberToleranceMm * grabberToleranceMm;
    const bodyToleranceMm = DraftCanvasComponent.SELECT_HIT_TOLERANCE_PX / this.pxPerMm;
    for (const shape of this.selectedShapes) {
      const pos = moveGrabberPosition(shape);
      if (pos) {
        const dx = pos.x - pt.x;
        const dy = pos.y - pt.y;
        if (dx * dx + dy * dy <= grabberTol2) return true;
      } else if (distanceToShape(pt, shape, this.pxPerMm) <= bodyToleranceMm) {
        return true;
      }
    }
    return false;
  }

  /** True if `pt` (world mm) grabs an endpoint handle of a currently selected shape — checked
   * before hitTestMoveHandle since it's the more specific target. */
  private hitTestEndpointGrabber(pt: Pt): { shapeId: string; key: EndpointKey } | null {
    const toleranceMm = DraftCanvasComponent.MOVE_GRABBER_HIT_TOLERANCE_PX / this.pxPerMm;
    const tol2 = toleranceMm * toleranceMm;
    for (const shape of this.selectedShapes) {
      const grabbers = endpointGrabbers(shape);
      if (!grabbers) continue;
      for (const g of grabbers) {
        const dx = g.pos.x - pt.x;
        const dy = g.pos.y - pt.y;
        if (dx * dx + dy * dy <= tol2) return { shapeId: shape.id, key: g.key };
      }
    }
    return null;
  }

  /** Plain click: replaces the whole selection with just `id` (or clears it if null). */
  private setSelectedShape(id: string | null): void {
    if (this.selectedShapeIds.size === (id ? 1 : 0) && (!id || this.selectedShapeIds.has(id))) return;
    this.selectedShapeIds = id ? new Set([id]) : new Set();
    this.draw();
  }

  /** Shift-click: adds/removes one shape from the selection, leaving the rest untouched.
   * A shift-click on empty space (id === null) is a no-op — it doesn't clear anything. */
  private toggleSelected(id: string | null): void {
    if (!id) return;
    if (this.selectedShapeIds.has(id)) this.selectedShapeIds.delete(id);
    else this.selectedShapeIds.add(id);
    this.draw();
  }

  private clearSelection(): void {
    if (this.selectedShapeIds.size === 0) return;
    this.selectedShapeIds.clear();
    this.draw();
  }

  /** The single selected shape, or undefined when zero or more than one are selected —
   * per-shape-type settings panels only make sense for exactly one shape (see tool-palette.ts). */
  public get selectedShape(): DraftShape | undefined {
    if (this.selectedShapeIds.size !== 1) return undefined;
    const [id] = this.selectedShapeIds;
    return this.toolbox.getEditableShapes().find(s => s.id === id);
  }

  public get selectedShapes(): DraftShape[] {
    if (this.selectedShapeIds.size === 0) return [];
    return this.toolbox.getEditableShapes().filter(s => this.selectedShapeIds.has(s.id));
  }

  public get selectedCount(): number {
    return this.selectedShapeIds.size;
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

  private loadDisplayPreferences(): void {
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

  onPointerMove = (event: PointerEvent) => {
    this.isAngleLockHeld = event.shiftKey;

    // Update tracked position for this pointer
    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    // Two-finger pinch-to-zoom + pan
    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;

      if (this.lastPinchDist > 0) {
        const el = this.host.nativeElement;
        const pxW = Math.max(1, el.clientWidth);
        const pxH = Math.max(1, el.clientHeight);

        // Zoom toward the current midpoint
        const zoomFactor = dist / this.lastPinchDist;
        const newPxPerMm = this.pxPerMm * zoomFactor;
        const fakeEvt = { clientX: midX, clientY: midY } as PointerEvent;
        const zoomPt = this.worldFromPointer(fakeEvt);
        zoomPt.y = -zoomPt.y;
        this.camera.applyZoomAt(zoomPt, newPxPerMm, pxW, pxH);

        // Pan by midpoint delta
        const dxPx = midX - this.lastPinchMid.x;
        const dyPx = midY - this.lastPinchMid.y;
        if (dxPx !== 0 || dyPx !== 0) {
          this.camera.panByPx(dxPx, dyPx);
        }

        this.draw();
      }

      this.lastPinchDist = dist;
      this.lastPinchMid = { x: midX, y: midY };
      event.preventDefault();
      return;
    }

    // reference-image interaction takes precedence
    if (this.refController.isInteracting) {
      const pt = this.worldFromPointer(event);
      this.refController.onPointerMove(pt);
      event.preventDefault();
      this.draw();
      return;
    }

    // Select mode: an armed endpoint-drag (see onPointerDown) becomes a real drag once the
    // pointer clears a small threshold. Unlike the whole-shape move below, the new point is the
    // pointer position directly (no delta/anchor) since only one point on one shape is affected.
    // Snapping uses the same SnapEngine/tolerance as the drafting tools, so an endpoint can land
    // on another shape's endpoint/center/path exactly like a fresh Line/Arc/etc. click would.
    if (this.dragEndpoint) {
      const rawPt = this.worldFromPointer(event);
      const toleranceMm = DraftCanvasComponent.SNAP_TOLERANCE_PX / this.pxPerMm;
      const hit = this.snapEngine.nearest(rawPt, toleranceMm);
      this.activeSnap = hit;
      let pt = hit ? hit.pt : rawPt;

      // Shift-lock to common angles, same as drawing a fresh Line/Box Line (see
      // two-point-tool.ts) — measured from the *other* end, since that's the segment whose
      // angle is being locked. Dimension is excluded: its drawing tool doesn't angle-lock either.
      const original = this.dragEndpoint.original;
      if ((original.type === 'line' || original.type === 'boxline') && this.isAngleLockHeld
        && (this.dragEndpoint.key === 'start' || this.dragEndpoint.key === 'end')) {
        const anchor = this.dragEndpoint.key === 'start' ? original.end : original.start;
        pt = snapToLockedAngle(anchor, pt);
      }

      if (!this.isDraggingEndpoint) {
        const origPos = endpointGrabbers(this.dragEndpoint.original)?.find(g => g.key === this.dragEndpoint!.key)?.pos;
        const pxDist = origPos ? Math.hypot(rawPt.x - origPos.x, rawPt.y - origPos.y) * this.pxPerMm : Infinity;
        if (pxDist < DraftCanvasComponent.DRAG_MOVE_THRESHOLD_PX) {
          event.preventDefault();
          return;
        }
        this.isDraggingEndpoint = true;
      }
      const updated = withEndpoint(this.dragEndpoint.original, this.dragEndpoint.key, pt);
      this.dragOverrides = new Map([[this.dragEndpoint.shapeId, updated]]);
      event.preventDefault();
      this.draw();
      return;
    }

    // Select mode: an armed selection-move (see onPointerDown) becomes a real drag once the
    // pointer clears a small threshold, so a plain click still just selects. While dragging,
    // shapes are translated from their pointerdown-time originals (not accumulated deltas) and
    // rendered via `dragOverrides` in draw() — nothing is written to the store until pointerup.
    if (this.dragAnchor) {
      const pt = this.worldFromPointer(event);
      const dxMm = pt.x - this.dragAnchor.x;
      const dyMm = pt.y - this.dragAnchor.y;
      if (!this.isDraggingSelection) {
        const pxDist = Math.hypot(dxMm, dyMm) * this.pxPerMm;
        if (pxDist < DraftCanvasComponent.DRAG_MOVE_THRESHOLD_PX) {
          event.preventDefault();
          return;
        }
        this.isDraggingSelection = true;
      }
      const overrides = new Map<string, DraftShape>();
      for (const shape of this.dragOriginals) {
        overrides.set(shape.id, translateShape(shape, dxMm, dyMm));
      }
      this.dragOverrides = overrides;
      event.preventDefault();
      this.draw();
      return;
    }

    // active drafting tool takes precedence over camera pan (space-drag still overrides)
    if (this.activeTool && !this.isDragging) {
      const pt = this.resolveToolPoint(this.worldFromPointer(event));
      this.activeTool.onPointerMove(pt, this.toolHost);
      this.draw(); // updates the snap-indicator glyph even before a shape is started
      event.preventDefault();
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
    this.isAngleLockHeld = event.shiftKey;
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size < 2) {
      this.lastPinchDist = 0;
      this.lastPinchMid = { x: 0, y: 0 };
    }

    // commit an in-progress tool shape (e.g. finishing a line drag)
    if (this.activeTool && !this.isDragging) {
      const pt = this.resolveToolPoint(this.worldFromPointer(event));
      this.activeTool.onPointerUp(pt, this.toolHost);
    }

    // finalize (or cancel) an armed/active selection-move or endpoint-drag — see
    // onPointerDown/onPointerMove. Both share `dragOverrides` and commit the same way.
    if (this.dragAnchor || this.dragEndpoint) {
      if ((this.isDraggingSelection || this.isDraggingEndpoint) && this.dragOverrides) {
        const patches = new Map<string, Partial<DraftShape>>();
        for (const [id, shape] of this.dragOverrides) patches.set(id, shape);
        this.toolbox.updateShapes(patches);
      }
      this.dragAnchor = null;
      this.dragOriginals = [];
      this.dragEndpoint = null;
      this.dragOverrides = null;
      this.isDraggingSelection = false;
      this.isDraggingEndpoint = false;
      this.activeSnap = null;
      this.draw();
    }

    // end reference-image interaction if active
    if (this.refController.isInteracting) {
      this.refController.endInteraction();
      this.emitReferenceImages();
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
    // Don't intercept shortcuts when the user is typing in an input field
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // let the active tool handle its own keys first (e.g. Escape cancels a line in progress)
    if (this.activeTool?.onKeyDown?.(event, this.toolHost)) {
      this.draw();
      event.preventDefault();
      return;
    }

    // Escape backs out one level at a time: cancel-in-progress is handled above by the
    // tool itself, so by the time we get here Escape just steps back to Select (matching
    // SketchUp), then — with nothing active — clears the current selection.
    if (event.key === 'Escape') {
      if (this.activeTool) {
        this.selectTool(null);
      } else if (this.selectedShapeIds.size) {
        this.clearSelection();
      }
      event.preventDefault();
      return;
    }

    // Select mode: Delete/Backspace removes the current selection
    if (!this.activeTool && this.selectedShapeIds.size) {
      if (event.code === 'Delete' || event.code === 'Backspace') {
        for (const id of this.selectedShapeIds) this.toolbox.removeShape(id);
        this.selectedShapeIds.clear();
        event.preventDefault();
        return;
      }
    }

    // Select mode: arrow keys nudge every selected shape (in world mm) instead of panning
    // the camera — Shift gives a coarser step, matching the pan/reference-nudge convention.
    if (!this.activeTool && this.selectedShapeIds.size) {
      const dir = DraftCanvasComponent.ARROW_NUDGE_DIRECTION[event.code];
      if (dir) {
        const stepMm = event.shiftKey ? DraftCanvasComponent.NUDGE_STEP_MM_COARSE : DraftCanvasComponent.NUDGE_STEP_MM_FINE;
        const [dx, dy] = [dir[0] * stepMm, dir[1] * stepMm];
        const editable = this.toolbox.getEditableShapes();
        for (const id of this.selectedShapeIds) {
          const shape = editable.find(s => s.id === id);
          if (shape) this.toolbox.updateShape(id, translateShape(shape, dx, dy));
        }
        event.preventDefault();
        return;
      }
    }

    // Tool mnemonics: S selects; each other letter activates that tool group's first
    // variant, or cycles to the next variant in the group on repeated presses (so there's
    // no need for a separate "alternate" modifier — see HOTKEY_TOOL_CYCLE below).
    if (event.code === 'KeyS') {
      this.selectTool(null);
      event.preventDefault();
      return;
    }
    const cycle = HOTKEY_TOOL_CYCLE[event.code];
    if (cycle) {
      const currentIdx = this.activeTool ? cycle.indexOf(this.activeTool.id) : -1;
      const nextId = cycle[(currentIdx + 1) % cycle.length];
      this.activateToolById(nextId);
      event.preventDefault();
      return;
    }

    if (event.code === 'Space') {
      this.isSpaceDown = true;
      this.host.nativeElement.classList.add('pan-ready');
      event.preventDefault();
    }

    // Fit camera to bounds
    if (event.code === 'KeyF') {
      this.fitCamera();
      this.draw();
      event.preventDefault();
    }

    // Zoom in/out with +/- keys, centered on canvas
    if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      this.applyZoom(this.pxPerMm * 1.15);
      event.preventDefault();
    }
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      this.applyZoom(this.pxPerMm / 1.15);
      event.preventDefault();
    }

    // delegate keyboard handling for reference image to controller first (Option B).
    // If it handles the event (e.g. arrow key nudge), skip camera pan.
    if (this.referenceModeEnabled && this.showReferenceImage && this.activeReferenceImage?.href) {
      const handled = this.refController.handleKeyboard(event, this.lockAspect, this.refAspect);
      if (handled) {
        this.emitReferenceImages();
        this.draw();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    // Arrow key panning. Shift held = 5× larger step.
    const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code);
    if (isArrow) {
      const step = event.shiftKey ? 200 : 40; // px
      switch (event.code) {
        case 'ArrowUp': this.camera.panByPx(0, step); break;
        case 'ArrowDown': this.camera.panByPx(0, -step); break;
        case 'ArrowLeft': this.camera.panByPx(step, 0); break;
        case 'ArrowRight': this.camera.panByPx(-step, 0); break;
      }
      this.draw();
      event.preventDefault();
    }
  };

  onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      this.isSpaceDown = false;
      this.host.nativeElement.classList.remove('pan-ready');
      // if dragging was initiated via space, end it
      if (this.isDragging) {
        this.isDragging = false;
        this.host.nativeElement.classList.remove('dragging');
      }
    }
  };

  onPointerDown(event: PointerEvent) {
    this.isAngleLockHeld = event.shiftKey;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Two fingers down — cancel any ongoing pan and enter pinch mode
    if (this.activePointers.size === 2) {
      this.isDragging = false;
      this.host.nativeElement.classList.remove('dragging');
      const [a, b] = [...this.activePointers.values()];
      this.lastPinchDist = Math.hypot(b.x - a.x, b.y - a.y);
      this.lastPinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.host.nativeElement.setPointerCapture(event.pointerId);
      return;
    }

    this.lastPxX = event.clientX;
    this.lastPxY = event.clientY;

    const isPrimary = event.button === 0 || event.button === undefined;
    const isMiddle = event.button === 1;
    const isTouch = event.pointerType === 'touch';

    const canRefOps = this.referenceModeEnabled && this.showReferenceImage && !!this.activeReferenceImage?.href;
    // Shift is reserved as the drafting angle-lock modifier (see isAngleLockHeld), so it
    // must not block tool activation/selection the way Ctrl (kept free for future use) does.
    const modifierHeld = event.ctrlKey;

    if (this.activeTool && isPrimary && !modifierHeld && !this.isSpaceDown) {
      const pt = this.resolveToolPoint(this.worldFromPointer(event));
      const tool = this.activeTool;
      tool.onPointerDown(pt, this.toolHost);
      this.host.nativeElement.setPointerCapture(event.pointerId);
      if (tool.oneShot) {
        // Commits immediately (e.g. Text, Point) — return to Select and select what was
        // just placed. Text also opens its settings and focuses the content field, since
        // typing the real text right away is the point; Point has nothing to type into.
        const shapes = this.toolbox.getEditableShapes();
        const newest = shapes[shapes.length - 1];
        if (newest) this.selectedShapeIds = new Set([newest.id]);
        this.selectTool(null);
        if (newest?.type === 'text') this.toolPalette?.openSettingsForText();
        return;
      }
      this.draw();
      return;
    }

    if (canRefOps && isPrimary && !modifierHeld && !this.isSpaceDown) {
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
    }

    // Select tool: grabbing a selected shape's endpoint (triangle) arms an endpoint-only drag —
    // checked first since it's the most specific target. Otherwise grabbing its move handle (the
    // square, or the shape body itself for Text/Point — see hitTestMoveHandle) arms a whole-shape
    // drag. Either way this takes priority over re-selecting, since the handles only exist for
    // shapes already selected. Otherwise a plain click picks (or clears) the shape under it, and
    // shift-click toggles it in/out of the current selection instead, for multi-select. Touch is
    // excluded from arming either drag so single-finger touch keeps its existing "always pans" behavior.
    if (!this.activeTool && isPrimary && !modifierHeld && !this.isSpaceDown && !canRefOps) {
      const pt = this.worldFromPointer(event);
      const endpointHit = !event.shiftKey && !isTouch && this.selectedShapeIds.size
        ? this.hitTestEndpointGrabber(pt) : null;
      if (endpointHit) {
        const shape = this.selectedShapes.find(s => s.id === endpointHit.shapeId)!;
        this.dragEndpoint = { shapeId: endpointHit.shapeId, key: endpointHit.key, original: shape };
        this.isDraggingEndpoint = false;
        this.activeSnap = null;
        this.ensureSnapIndex();
        this.host.nativeElement.setPointerCapture(event.pointerId);
      } else if (!event.shiftKey && !isTouch && this.selectedShapeIds.size && this.hitTestMoveHandle(pt)) {
        this.dragAnchor = pt;
        this.dragOriginals = this.selectedShapes;
        this.isDraggingSelection = false;
        this.host.nativeElement.setPointerCapture(event.pointerId);
      } else {
        const hitId = this.hitTestToolboxShape(pt);
        if (event.shiftKey) {
          this.toggleSelected(hitId);
        } else {
          this.setSelectedShape(hitId);
        }
      }
    }

    // Pan: middle mouse always; primary when Space is held; or any single touch finger
    if (isMiddle || (isPrimary && this.isSpaceDown) || (isTouch && isPrimary)) {
      this.isDragging = true;
      this.host.nativeElement.classList.add('dragging');
      this.host.nativeElement.setPointerCapture(event.pointerId);
    }
  };

  onScrollWheel = (event: WheelEvent) => {
    event.preventDefault();

    // Pinch-to-zoom: browsers report pinch gestures as wheel events with ctrlKey=true.
    // This is a well-known convention used by both macOS trackpads and touch screens.
    if (event.ctrlKey) {
      const delta = event.deltaY;
      const zoomFactor = Math.pow(0.97, delta);
      const newPxPerMm = this.pxPerMm * zoomFactor;

      // Zoom toward the cursor position instead of canvas center
      const pt = this.worldFromPointer(event as unknown as PointerEvent);
      pt.y = -pt.y; // account for Y-up

      const el = this.host.nativeElement;
      const pxW = Math.max(1, el.clientWidth);
      const pxH = Math.max(1, el.clientHeight);

      this.camera.applyZoomAt(pt, newPxPerMm, pxW, pxH);
      this.draw();
      return;
    }

    // scroll wheels should have a 0 delta x value
    const isMouseWheel = Math.abs(event.deltaX) === 0 //&& Number.isInteger(event.deltaY);
    if (isMouseWheel) {
      const clampedDelta = Math.sign(event.deltaY);
      const zoomFactor = Math.pow(0.85, clampedDelta);
      const newPxPerMm = this.pxPerMm * zoomFactor;


      const pt = this.worldFromPointer(event as unknown as PointerEvent);
      pt.y = -pt.y;

      const el = this.host.nativeElement;
      const pxW = Math.max(1, el.clientWidth);
      const pxH = Math.max(1, el.clientHeight);

      this.camera.applyZoomAt(pt, newPxPerMm, pxW, pxH);
      this.draw();
      return;
    }

    // Trackpad two-finger scroll (DOM_DELTA_PIXEL) — pan the camera.
    const dxPx = event.deltaX;
    const dyPx = event.deltaY;

    if (dxPx !== 0 || dyPx !== 0) {
      this.camera.panByPx(-dxPx, -dyPx);
      this.draw();
    }
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
    this.syncControllerToActive();
    this.camera.fitToBounds(this.bounds, pxW, pxH);
  }

  // UI: Align Reference popup controls
  referenceControlsInfo(): void {
    info(
      "Each tab is a separate reference image, so you can trace different profiles (plan, long arch, cross arch) without losing the others. Only the active tab is shown and editable.\n\n" +
      " - + adds a reference image, double-click a tab to rename it, and × removes it.\n" +
      " - Replace swaps the active tab's image; Reset restores it to the values it had when you last selected this tab.\n\n" +
      "You can upload a reference image using the + or Replace button. It is recommended you scale the image using either the axis or the bounding box on the base measurement panel.\n\n" +
      "X and Y position the image on the canvas.\n" +
      "Width and height set the dimensions of the image in millimetres.\n" +
      "Rotation rotates the image in degrees.\n\n" +
      "Mouse controls:\n" +
      " - Drag the image to reposition it.\n" +
      " - Drag a corner handle to resize proportionally; drag an edge handle to resize just that dimension (it snaps back to proportional once you drag past the image's original size).\n" +
      " - Hold Space and drag (or use the middle mouse button) to pan the camera without moving the image.\n" +
      " - Scroll to zoom; two-finger trackpad scroll pans, pinch zooms.\n\n" +
      "Keyboard controls:\n" +
      " - Arrow keys: nudge the image by 1 mm.\n" +
      " - Ctrl + Up/Down: scale the image; Ctrl + Left/Right: rotate it 1°.\n" +
      " - F: fit the full design back into view.\n" +
      " - +/-: zoom in or out.\n" +
      " - Outside of reference mode, arrow keys pan the camera instead (Shift for larger steps).\n",
      "Reference Image", false
    );
  }

  toggleAlignPopup(): void {
    this.referenceModeEnabled = !this.referenceModeEnabled;
    this.alignPopupOpen = this.referenceModeEnabled;
    this.captureResetBaseline();
    this.draw();
  }

  // ===== Multi-image (tab) state =====

  /** Points the controller at the active tab (or clears it when none). */
  private syncControllerToActive(): void {
    this.refController?.setImage(this.activeReferenceImage ?? undefined);
  }

  /** Snapshots the active tab so Reset can restore it and aspect-lock is seeded. */
  private captureResetBaseline(): void {
    const active = this.activeReferenceImage;
    this.oldReferenceImageParams = active ? { ...active } : undefined;
    if (active && active.height) this.refAspect = Math.abs(active.width / active.height) || 1;
  }

  /** Live write-back from the controller during drag/scale — keeps id/label. */
  private applyControllerChange(img?: ReferenceImage): void {
    if (!img || !this.activeRefId) return;
    const idx = this._referenceImages.findIndex(r => r.id === this.activeRefId);
    if (idx < 0) return;
    this._referenceImages[idx] = { ...this._referenceImages[idx], ...img };
  }

  /** Replaces the active tab's entry and re-points the controller at it. */
  private replaceActive(next: NamedReferenceImage): void {
    const idx = this._referenceImages.findIndex(r => r.id === next.id);
    if (idx < 0) return;
    this._referenceImages[idx] = next;
    this.refController.setImage(next);
  }

  private emitReferenceImages(): void {
    this.referenceImagesChange.emit(this._referenceImages);
  }

  private nextRefLabel(): string {
    return `Img ${this._referenceImages.length + 1}`;
  }

  selectRefTab(id: string): void {
    if (this.activeRefId === id) return;
    this.activeRefId = id;
    this.editingRefId = null;
    this.captureResetBaseline();
    this.syncControllerToActive();
    this.draw();
  }

  requestAddReference(fileInput: HTMLInputElement): void {
    this.pendingRefUploadMode = 'add';
    fileInput.click();
  }

  requestReplaceReference(fileInput: HTMLInputElement): void {
    this.pendingRefUploadMode = this.activeReferenceImage ? 'replace' : 'add';
    fileInput.click();
  }

  deleteRefTab(id: string): void {
    const idx = this._referenceImages.findIndex(r => r.id === id);
    if (idx < 0) return;
    this._referenceImages = this._referenceImages.filter(r => r.id !== id);
    if (this.editingRefId === id) this.editingRefId = null;
    if (this.activeRefId === id) {
      this.activeRefId = this._referenceImages[Math.min(idx, this._referenceImages.length - 1)]?.id ?? null;
      this.captureResetBaseline();
    }
    this.syncControllerToActive();
    this.emitReferenceImages();
    this.draw();
  }

  startRenameRef(id: string): void {
    this.editingRefId = id;
    // The rename <input> is created by this state change; focus it next tick.
    setTimeout(() => {
      const el = this.host.nativeElement
        .closest('.canvas-shell')
        ?.querySelector('.ref-tab-edit') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  commitRenameRef(id: string, label: string): void {
    const tab = this._referenceImages.find(r => r.id === id);
    if (tab) tab.label = (label ?? '').trim() || tab.label;
    this.editingRefId = null;
    this.emitReferenceImages();
  }

  closeAlignPopup(): void {
    this.alignPopupOpen = false;
  }

  toggleAxisPopup(): void {
    this.axisPopupOpen = !this.axisPopupOpen;
  }

  onRefParamChange(key: keyof ReferenceImage, val: number): void {
    const active = this.activeReferenceImage;
    if (!active) return;
    const v = Number(val) || 0;
    const minMm = 1;

    let next: NamedReferenceImage = { ...active };

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

    this.replaceActive(next);
    this.emitReferenceImages();
    this.draw();
  }

  resetReferenceImage(): void {
    const baseline = this.oldReferenceImageParams;
    if (!baseline || baseline.id !== this.activeRefId) return;
    this.replaceActive({ ...baseline });
    this.emitReferenceImages();
    this.draw();
  }

  /** Fits an image of the given pixel size into the current camera bounds (aspect-preserving). */
  private fitImageToBounds(w: number, h: number): { imgW: number; imgH: number; imgX: number; imgY: number } {
    const aspect = w / h || 1;
    if (this.bounds) {
      const bW = Math.abs(this.bounds.pt2.x - this.bounds.pt1.x);
      const bH = Math.abs(this.bounds.pt2.y - this.bounds.pt1.y);
      const bCx = (this.bounds.pt1.x + this.bounds.pt2.x) / 2;
      const bCy = (this.bounds.pt1.y + this.bounds.pt2.y) / 2;
      let imgW: number;
      let imgH: number;
      if (bW / bH > aspect) {
        imgH = bH;
        imgW = imgH * aspect;
      } else {
        imgW = bW;
        imgH = imgW / aspect;
      }
      return { imgW, imgH, imgX: bCx - imgW / 2, imgY: bCy - imgH / 2 };
    }
    // No bounds set — fall back to a 200 mm wide default
    const imgW = 200;
    const imgH = imgW / aspect;
    return { imgW, imgH, imgX: -imgW / 2, imgY: 0 };
  }

  async onReferenceFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const dataUrl = await this.readFileAsDataUrl(file);
    const { w, h } = await this.getImageSize(dataUrl);
    const { imgW, imgH, imgX, imgY } = this.fitImageToBounds(w, h);
    this.refAspect = w / h || 1;

    const geom: ReferenceImage = {
      href: dataUrl,
      'xlink:href': dataUrl,
      x: imgX,
      y: imgY,
      width: imgW,
      height: imgH,
      rotationDeg: 0,
    };

    if (this.pendingRefUploadMode === 'replace' && this.activeReferenceImage) {
      // Keep the tab's id/label; swap in the new image and geometry.
      const next: NamedReferenceImage = { ...this.activeReferenceImage, ...geom };
      this.replaceActive(next);
      this.oldReferenceImageParams = { ...next };
    } else {
      const named = toNamedReferenceImage(geom, this.nextRefLabel());
      this._referenceImages = [...this._referenceImages, named];
      this.activeRefId = named.id;
      this.oldReferenceImageParams = { ...named };
      this.syncControllerToActive();
    }

    this.showReferenceImage = true;
    this.emitReferenceImages();
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