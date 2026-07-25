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
import { NgTemplateOutlet } from '@angular/common';
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
import { createArcTool, createFancyArcTool } from './tools/arc-tool';
import { createTangentArcTool } from './tools/tangent-arc-tool';
import { createCircleTool, createDottedCircleTool } from './tools/circle-tool';
import { createDimensionTool } from './tools/dimension-tool';
import { createRectTool, createSquareTool } from './tools/rect-tool';
import { createBoxLineTool } from './tools/box-line-tool';
import { createTextTool } from './tools/text-tool';
import { ToolSlot, single, flyout } from './tools/tool-slot';
import { ToolboxStore } from './tools/toolbox-store';
import { drawShape, drawSelectionHalo } from './tools/shape-renderer';
import { SnapCandidate, SnapEngine } from './tools/snap-engine';
import { drawSnapMarker } from './tools/snap-marker-renderer';
import { distanceToShape } from './tools/shape-hit-test';
import { DraftShape, LineShape, DimensionShape, CircleShape, ArcShape, RectShape, TextShape } from './tools/toolbox-shape';
import { Layer } from './tools/layer';

@Component({
  selector: 'app-draft-canvas',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './draft-canvas.html',
  styleUrls: ['./draft-canvas.css'],
})

export class DraftCanvasComponent implements AfterViewInit, OnDestroy {
  private static readonly DISPLAY_PREFS_KEY = 'draft-canvas-display-preferences';
  // Tool mnemonics (see onKeyDown): pressing the key activates the group's first
  // variant, or advances to the next one in the list on repeated presses. Order
  // here should match each tool's flyout order in toolRows.
  private static readonly HOTKEY_TOOL_CYCLE: Record<string, string[]> = {
    KeyL: ['line', 'line-dashed', 'dimension'],
    KeyA: ['arc', 'arc-tangent', 'arc-fancy'],
    KeyC: ['circle', 'circle-dashed'],
    KeyR: ['rect', 'square'],
    KeyB: ['boxline'],
    KeyT: ['text'],
  };
  // Reverse of the above (tool id -> its group's letter), for tooltip hints.
  private static readonly HOTKEY_LETTER_BY_TOOL: Record<string, string> = Object.fromEntries(
    Object.entries(DraftCanvasComponent.HOTKEY_TOOL_CYCLE)
      .flatMap(([code, ids]) => ids.map(id => [id, code.replace('Key', '')])),
  );
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
      flyout([createArcTool(), createTangentArcTool(), createFancyArcTool()]),
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
  ];
  public activeTool: DraftTool | null = null;
  public openFlyout: ToolSlot | null = null;
  public settingsOpen = false;
  public layersOpen = false;
  public editingLayerId: string | null = null;
  public toolPaletteCollapsed = false;
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

  // Selection (Select tool, i.e. activeTool === null): which toolbox shape, if any, is picked.
  private static readonly SELECT_HIT_TOLERANCE_PX = 6;
  private selectedShapeId: string | null = null;

  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
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
      if (this.selectedShapeId && !this.toolbox.getEditableShapes().some(s => s.id === this.selectedShapeId)) {
        this.selectedShapeId = null;
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

    const selectedShape = this.selectedShapeId
      ? this.toolbox.getEditableShapes().find(s => s.id === this.selectedShapeId)
      : undefined;
    if (selectedShape) drawSelectionHalo(this.gRoot, this.gUI, selectedShape, this.pxPerMm);

    const snapLayer = this.gRoot.append('g').attr('class', 'snappable');
    this.draftFuncs.map(f => {
      f(snapLayer, this.gUI)
    })
    this.toolbox.getVisibleShapes().forEach(s => drawShape(snapLayer, this.gUI, s, this.pxPerMm));

    // Candidates are only ever read from resolveToolPoint(), which is a no-op
    // with no active tool (e.g. while editing a selected shape's properties in
    // Select mode) — so skip the (potentially large, whole-scene) rebuild
    // until a tool is actually active to consume it. `snapDirty` stays set,
    // so activating a tool later still rebuilds first.
    if (this.snapDirty && this.activeTool) {
      this.snapEngine.rebuild(snapLayer);
      this.snapDirty = false;
    }

    this.activeTool?.renderPreview(this.gRoot, this.gUI, this.pxPerMm);
    if (this.activeTool && this.activeSnap) {
      drawSnapMarker(this.gRoot, this.activeSnap, this.pxPerMm);
    }
  }

  /** Pass null to switch to the default select tool (no active drafting tool). */
  selectTool(tool: DraftTool | null): void {
    this.activeTool?.reset();
    this.activeTool = tool;
    this.activeSnap = null;
    this.openFlyout = null;
    if (tool) this.selectedShapeId = null; // selection only applies in Select mode
    this.draw();
  }

  /** Activates a slot's current tool — its only tool if single, its selected variant if a flyout. */
  activateSlot(slot: ToolSlot): void {
    this.selectTool(slot.kind === 'single' ? slot.tool : slot.variants[slot.selectedIndex]);
  }

  toggleFlyout(slot: ToolSlot): void {
    this.openFlyout = this.openFlyout === slot ? null : slot;
    this.settingsOpen = false;
    this.layersOpen = false;
  }

  /** The hotkey letter for a tool id, formatted for a tooltip (e.g. " (L)"), or '' if it has none. */
  public hotkeyHint(toolId: string): string {
    const letter = DraftCanvasComponent.HOTKEY_LETTER_BY_TOOL[toolId];
    return letter ? ` (${letter})` : '';
  }

  /** Activates a tool by id from anywhere in toolRows — used by the hotkey mnemonics. */
  private activateToolById(id: string): void {
    for (const row of this.toolRows) {
      for (const slot of row) {
        if (slot.kind === 'single') {
          if (slot.tool.id === id) { this.selectTool(slot.tool); return; }
        } else {
          const idx = slot.variants.findIndex(v => v.id === id);
          if (idx >= 0) { this.chooseFlyoutVariant(slot, idx); return; }
        }
      }
    }
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.openFlyout = null;
    this.layersOpen = false;
  }

  toggleLayers(): void {
    this.layersOpen = !this.layersOpen;
    this.openFlyout = null;
    this.settingsOpen = false;
  }

  public get toolboxLayers(): Layer[] { return this.toolbox.layers; }
  public get activeLayerId(): string { return this.toolbox.activeLayerId; }

  /** The active-layer switch itself goes through the same onChange path as any other
   * toolbox mutation (see ngAfterViewInit's toolboxUnsub), which already re-filters the
   * current selection against the new layer and redraws — no need to duplicate that here. */
  selectLayer(id: string): void {
    this.toolbox.setActiveLayer(id);
  }

  addLayer(): void {
    const id = this.toolbox.addLayer();
    this.startRenameLayer(id);
  }

  startRenameLayer(id: string): void {
    this.editingLayerId = id;
    // The rename <input> is created by this state change; focus it next tick.
    setTimeout(() => {
      const el = this.host.nativeElement
        .closest('.canvas-shell')
        ?.querySelector('.layer-tab-edit') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  commitRenameLayer(id: string, name: string): void {
    this.toolbox.renameLayer(id, name);
    this.editingLayerId = null;
  }

  deleteLayer(id: string): void {
    this.toolbox.removeLayer(id);
    if (this.editingLayerId === id) this.editingLayerId = null;
  }

  toggleLayerVisible(id: string): void {
    this.toolbox.toggleLayerVisible(id);
  }

  /** Locking the layer you're actively drawing on would make the active tool a silent no-op — bail back to Select instead. */
  toggleLayerLocked(id: string): void {
    this.toolbox.toggleLayerLocked(id);
    if (this.activeTool && this.toolbox.activeLayerId === id && this.toolboxLayers.find(l => l.id === id)?.locked) {
      this.selectTool(null);
    }
  }

  /** Clear is now scoped to the active layer only — see toolbox-store.ts's clearActiveLayer. */
  clearActiveLayer(): void {
    this.toolbox.clearActiveLayer();
  }

  /** Picking a variant from the flyout both activates it and becomes the slot's new default face. */
  chooseFlyoutVariant(slot: Extract<ToolSlot, { kind: 'flyout' }>, index: number): void {
    slot.selectedIndex = index;
    this.selectTool(slot.variants[index]);
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

  private setSelectedShape(id: string | null): void {
    if (this.selectedShapeId === id) return;
    this.selectedShapeId = id;
    this.draw();
  }

  private get selectedShape(): DraftShape | undefined {
    return this.selectedShapeId
      ? this.toolbox.getEditableShapes().find(s => s.id === this.selectedShapeId)
      : undefined;
  }

  /** Shows the selected shape's color when something's selected, otherwise the pen color new shapes will use. */
  public get displayedColor(): string {
    return this.selectedShape?.color ?? this.toolbox.currentColor;
  }

  setColor(color: string): void {
    this.toolbox.currentColor = color;
    if (this.selectedShapeId) {
      this.toolbox.updateShape(this.selectedShapeId, { color });
    }
  }

  /** Line/Dotted Line/Dimension all share start+end geometry — editable numerically once a shape is selected. */
  private get selectedLineLikeShape(): LineShape | DimensionShape | undefined {
    const s = this.selectedShape;
    return (s?.type === 'line' || s?.type === 'dimension') ? s : undefined;
  }

  public get showLinePanel(): boolean {
    return !!this.selectedLineLikeShape;
  }

  public get lineStartX(): number { return this.selectedLineLikeShape?.start.x ?? 0; }
  public get lineStartY(): number { return this.selectedLineLikeShape?.start.y ?? 0; }
  public get lineEndX(): number { return this.selectedLineLikeShape?.end.x ?? 0; }
  public get lineEndY(): number { return this.selectedLineLikeShape?.end.y ?? 0; }

  setLinePoint(which: 'start' | 'end', axis: 'x' | 'y', value: number): void {
    const shape = this.selectedLineLikeShape;
    if (!shape) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    const point = { ...shape[which], [axis]: v };
    this.toolbox.updateShape(shape.id, { [which]: point } as Partial<DraftShape>);
  }

  /** Rect and Square both commit as a 'rect' shape (p1/p2 corners) — same panel edits either. */
  private get selectedRectShape(): RectShape | undefined {
    const s = this.selectedShape;
    return s?.type === 'rect' ? s : undefined;
  }

  public get showRectPanel(): boolean {
    return !!this.selectedRectShape;
  }

  public get rectP1X(): number { return this.selectedRectShape?.p1.x ?? 0; }
  public get rectP1Y(): number { return this.selectedRectShape?.p1.y ?? 0; }
  public get rectP2X(): number { return this.selectedRectShape?.p2.x ?? 0; }
  public get rectP2Y(): number { return this.selectedRectShape?.p2.y ?? 0; }

  setRectPoint(which: 'p1' | 'p2', axis: 'x' | 'y', value: number): void {
    const shape = this.selectedRectShape;
    if (!shape) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    const point = { ...shape[which], [axis]: v };
    this.toolbox.updateShape(shape.id, { [which]: point } as Partial<DraftShape>);
  }

  private get selectedTextShape(): TextShape | undefined {
    const s = this.selectedShape;
    return s?.type === 'text' ? s : undefined;
  }

  public get showTextPanel(): boolean {
    return !!this.selectedTextShape;
  }

  public get textPositionX(): number { return this.selectedTextShape?.position.x ?? 0; }
  public get textPositionY(): number { return this.selectedTextShape?.position.y ?? 0; }
  public get textContent(): string { return this.selectedTextShape?.text ?? ''; }

  setTextPosition(axis: 'x' | 'y', value: number): void {
    const shape = this.selectedTextShape;
    if (!shape) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    this.toolbox.updateShape(shape.id, { position: { ...shape.position, [axis]: v } });
  }

  setTextContent(text: string): void {
    const shape = this.selectedTextShape;
    if (!shape) return;
    this.toolbox.updateShape(shape.id, { text });
  }

  /** Focuses+selects the text-content field once its settings panel has just been opened
   * (e.g. right after placing a new Text shape) so typing the real content needs no extra click. */
  private focusTextContentInput(): void {
    setTimeout(() => {
      const el = this.host.nativeElement
        .closest('.canvas-shell')
        ?.querySelector('.text-content-input') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  private get selectedCircleShape(): CircleShape | undefined {
    const s = this.selectedShape;
    return s?.type === 'circle' ? s : undefined;
  }

  public get showCirclePanel(): boolean {
    return !!this.selectedCircleShape;
  }

  public get circleCenterX(): number { return this.selectedCircleShape?.center.x ?? 0; }
  public get circleCenterY(): number { return this.selectedCircleShape?.center.y ?? 0; }
  public get circleRadius(): number { return this.selectedCircleShape?.radius ?? 0; }

  setCircleCenter(axis: 'x' | 'y', value: number): void {
    const shape = this.selectedCircleShape;
    if (!shape) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    this.toolbox.updateShape(shape.id, { center: { ...shape.center, [axis]: v } });
  }

  setCircleRadius(value: number): void {
    const shape = this.selectedCircleShape;
    if (!shape) return;
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    this.toolbox.updateShape(shape.id, { radius: v });
  }

  private get selectedArcShape(): ArcShape | undefined {
    const s = this.selectedShape;
    return s?.type === 'arc' ? s : undefined;
  }

  public get showArcPanel(): boolean {
    return !!this.selectedArcShape;
  }

  public get arcCenterX(): number { return this.selectedArcShape?.center.x ?? 0; }
  public get arcCenterY(): number { return this.selectedArcShape?.center.y ?? 0; }
  public get arcRadius(): number { return this.selectedArcShape?.radius ?? 0; }
  public get arcStartDeg(): number { return (this.selectedArcShape?.startAngle ?? 0) * 180 / Math.PI; }
  public get arcEndDeg(): number { return (this.selectedArcShape?.endAngle ?? 0) * 180 / Math.PI; }

  setArcCenter(axis: 'x' | 'y', value: number): void {
    const shape = this.selectedArcShape;
    if (!shape) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    this.toolbox.updateShape(shape.id, { center: { ...shape.center, [axis]: v } });
  }

  setArcRadius(value: number): void {
    const shape = this.selectedArcShape;
    if (!shape) return;
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    this.toolbox.updateShape(shape.id, { radius: v });
  }

  /** Angle fields are edited in degrees for readability; stored in radians, matching arc-geometry.ts's convention. */
  setArcAngle(which: 'start' | 'end', valueDeg: number): void {
    const shape = this.selectedArcShape;
    if (!shape) return;
    const v = Number(valueDeg);
    if (!Number.isFinite(v)) return;
    const rad = v * Math.PI / 180;
    this.toolbox.updateShape(shape.id, which === 'start' ? { startAngle: rad } : { endAngle: rad });
  }

  /** Box Line has extra per-shape settings (a second color + segment weights) that don't fit the single color swatch. */
  public get showBoxLinePanel(): boolean {
    return this.activeTool?.id === 'boxline' || this.selectedShape?.type === 'boxline';
  }

  public get displayedBoxLineColor2(): string {
    const shape = this.selectedShape;
    return (shape?.type === 'boxline' ? shape.color2 : undefined) ?? this.toolbox.currentBoxLineColor2;
  }

  public get displayedBoxLineWeightsText(): string {
    const shape = this.selectedShape;
    const weights = (shape?.type === 'boxline' ? shape.weights : undefined) ?? this.toolbox.currentBoxLineWeights;
    return weights.join(',');
  }

  setBoxLineColor2(color: string): void {
    this.toolbox.currentBoxLineColor2 = color;
    const shape = this.selectedShape;
    if (shape?.type === 'boxline') {
      this.toolbox.updateShape(shape.id, { color2: color });
    }
  }

  setBoxLineWeightsText(text: string): void {
    const weights = text.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
    if (weights.length === 0) return;
    this.toolbox.currentBoxLineWeights = weights;
    const shape = this.selectedShape;
    if (shape?.type === 'boxline') {
      this.toolbox.updateShape(shape.id, { weights });
    }
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
          toolPaletteCollapsed: this.toolPaletteCollapsed,
        })
      );
    } catch {
      // ignore storage errors
    }
    this.draw();
  }

  toggleToolPalette(): void {
    this.toolPaletteCollapsed = !this.toolPaletteCollapsed;
    this.onDisplayPreferenceChange();
  }

  private loadDisplayPreferences(): void {
    try {
      const raw = sessionStorage.getItem(DraftCanvasComponent.DISPLAY_PREFS_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        showReferenceImage?: boolean;
        toolPaletteCollapsed?: boolean;
      };

      if (typeof parsed.showReferenceImage === 'boolean') {
        this.showReferenceImage = parsed.showReferenceImage;
      }
      if (typeof parsed.toolPaletteCollapsed === 'boolean') {
        this.toolPaletteCollapsed = parsed.toolPaletteCollapsed;
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
      } else if (this.selectedShapeId) {
        this.setSelectedShape(null);
      }
      event.preventDefault();
      return;
    }

    // Select mode: Delete/Backspace removes the current selection
    if (!this.activeTool && this.selectedShapeId) {
      if (event.code === 'Delete' || event.code === 'Backspace') {
        this.toolbox.removeShape(this.selectedShapeId);
        this.selectedShapeId = null;
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
    const cycle = DraftCanvasComponent.HOTKEY_TOOL_CYCLE[event.code];
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
        // Commits immediately (e.g. Text) — return to Select, select what was just
        // placed, and open its settings so the user can edit it right away.
        const shapes = this.toolbox.getEditableShapes();
        const newest = shapes[shapes.length - 1];
        if (newest) this.selectedShapeId = newest.id;
        this.selectTool(null);
        this.settingsOpen = true;
        this.focusTextContentInput();
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

    // Select tool: pick (or clear) the toolbox shape under the click
    if (!this.activeTool && isPrimary && !modifierHeld && !this.isSpaceDown && !canRefOps) {
      const pt = this.worldFromPointer(event);
      this.setSelectedShape(this.hitTestToolboxShape(pt));
    }

    // Pan: middle mouse always; primary when Space is held; or any single touch finger
    const isTouch = event.pointerType === 'touch';
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