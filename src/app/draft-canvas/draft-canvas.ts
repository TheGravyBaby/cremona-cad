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
import { Pt } from '../models/types';
import { Bounds, Camera } from './camera';
import { unionRenderedBounds } from './scene-bounds';
import { AxisGridController, AxisGridPreferences, CanvasViewport } from './axis-grid-controller';
import { DraftTool, DraftToolHost } from './tools/draft-tool';
import { ToolRegistryService } from './tools/tool-registry';
import { ToolboxStore } from './tools/toolbox-store';
import { ImageAssetStore } from './tools/image-asset-store';
import {
  drawShape, drawImageShape, drawSelectionHalo, drawMoveGrabber, drawEndpointGrabber, drawAreaSelectBox,
} from './tools/shape-renderer';
import { SnapCandidate, SnapEngine } from './tools/snap-engine';
import { drawSnapMarker } from './tools/snap-marker-renderer';
import { distanceToShape, shapeBounds } from './tools/shape-hit-test';
import { translateShape } from './tools/shape-transform';
import { moveGrabberPosition, endpointGrabbers, withEndpoint, EndpointKey } from './tools/shape-grabbers';
import { snapToLockedAngle } from './tools/angle-lock';
import { copyDebugDump, isLocalHost } from '../helpers/debugDump';
import { DraftShape, TextShape } from './tools/toolbox-shape';
import { HOTKEY_TOOL_CYCLE } from './tools/tool-hotkeys';
import { ToolPaletteComponent } from './tool-palette/tool-palette';
import { SettingsBarComponent } from './settings-bar/settings-bar';

@Component({
  selector: 'app-draft-canvas',
  standalone: true,
  imports: [FormsModule, ToolPaletteComponent, SettingsBarComponent],
  templateUrl: './draft-canvas.html',
  styleUrls: ['./draft-canvas.css'],
})

export class DraftCanvasComponent implements AfterViewInit, OnDestroy {
  private static readonly DISPLAY_PREFS_KEY = 'draft-canvas-display-preferences';
  /** `event.ctrlKey` reflects only the physical Control key on every platform, including Mac —
   * it never includes Command. On Mac, Command is the conventional "hold to modify" key for
   * drawing tools (Ctrl carries secondary-click baggage there instead), so isTangentLockHeld
   * below accepts either on Mac while staying Ctrl-only on Windows/Linux. */
  private static readonly IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  private initialized = false;
  private canvas!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private gRoot!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private gUI!: d3.Selection<SVGGElement, unknown, null, undefined>;
  /** The reference-image layer from the most recent draw. Kept, like `snapLayer` below, because
   * the camera fit is measured off the rendered SVG — see fitCamera(). */
  private imageLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private resizeObs?: ResizeObserver;
  private draftFuncs: Array<(canvas: any, uiCan: any) => void> = [];
  private camera = new Camera();
  private axisGrid = new AxisGridController(DraftCanvasComponent.DISPLAY_PREFS_KEY, () => this.draw());
  private imageAssets = inject(ImageAssetStore);
  private imageAssetsUnsub?: () => void;
  private toolbox = inject(ToolboxStore);
  private toolboxUnsub?: () => void;
  private toolRegistry = inject(ToolRegistryService);
  private toolRegistryUnsub?: () => void;
  public get activeTool(): DraftTool | null { return this.toolRegistry.activeTool; }
  private isAngleLockHeld = false;
  /** True while the tangent-lock modifier (Ctrl, or ⌘ on Mac — see IS_MAC) is held — see
   * two-point-tool.ts's angleLockModifier. Separate from isAngleLockHeld/Shift so the two can be
   * reached for independently: Shift always means the 30/45/90° grid, this always means "tangent
   * to whatever the start point snapped onto", regardless of what the other key is doing. */
  private isTangentLockHeld = false;
  private toolHost: DraftToolHost = {
    // Images are deliberately not stamped with a layer: they aren't layer members (see
    // ImageShape), and giving them one would make deleting that layer delete them.
    addShape: (shape) => this.toolbox.addShape(shape.type === 'image' ? shape : {
      ...shape,
      color: shape.color ?? this.toolbox.currentColor,
      layerId: shape.layerId ?? this.toolbox.activeLayerId,
    }),
    requestDraw: () => this.draw(),
    getSnapTangent: () => this.activeSnap?.tangent,
    isAngleLockHeld: () => this.isAngleLockHeld,
    isTangentLockHeld: () => this.isTangentLockHeld,
    getSelectedShapes: () => this.selectedShapes,
    getPxPerMm: () => this.pxPerMm,
    hitTestShape: (pt) => this.hitTestToolboxShape(pt),
    selectShape: (id) => this.setSelectedShape(id),
    returnToSelect: (selectShapeId) => {
      this.toolRegistry.selectTool(null);
      if (selectShapeId) this.setSelectedShape(selectShapeId);
      this.draw();
    },
    requestImageFile: () => this.requestImageFile(),
    getDesignBounds: () => this.designBounds(),
  };

  // Snapping: candidates are re-indexed from the rendered scene only when the
  // underlying geometry changes (draftFunctions/toolbox shapes), not on every
  // hover redraw — see `snapDirty` below.
  private static readonly SNAP_TOLERANCE_PX = 10;
  private snapEngine = new SnapEngine();
  private snapDirty = true;
  private activeSnap: SnapCandidate | null = null;
  /** The group holding everything in world space — the recipe's layers and the toolbox's shapes,
   * and nothing else (the grid, reference images, halos and snap markers are all siblings of it).
   * Named once because the debug dump finds this group by class: a rename at only one of the two
   * sites would leave it silently reporting an empty drawing. */
  private static readonly SCENE_GROUP_CLASS = 'snappable';

  // The most recently drawn scene layer — kept so an endpoint-drag (which happens in
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

  // Area-select (marquee): pointerdown on empty canvas in Select mode arms a potential
  // rubber-band box, same threshold-gated arm/commit pattern as the drags above, so a plain
  // click on empty space still just (de)selects — see onPointerDown/onPointerMove/onPointerUp.
  // Shapes fully contained within the box become the selection, or are added to whatever was
  // already selected if Shift was held when the drag started.
  private areaSelectAnchor: Pt | null = null;
  private areaSelectCurrent: Pt | null = null;
  private areaSelectAdditive = false;
  private isAreaSelecting = false;

  /** The in-progress marquee as a normalized box, or null if no drag is armed. Shared by draw()
   * (rendering the rubber band) and onPointerUp (testing containment) so the two can't disagree
   * about which region the user actually swept. */
  private areaSelectBox(): { x0: number; y0: number; x1: number; y1: number } | null {
    const a = this.areaSelectAnchor;
    const b = this.areaSelectCurrent;
    if (!a || !b) return null;
    return {
      x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x),
      y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y),
    };
  }

  // Inline text editing: placing (or later re-editing) a Text shape opens a plain <textarea>
  // positioned directly over its on-canvas location, instead of routing through the settings
  // panel — see startEditingText(). The Text tool stays active throughout, so consecutive
  // clicks place more text boxes without having to reselect the tool each time.
  public editingTextShapeId: string | null = null;
  public editingTextScreenX = 0;
  public editingTextScreenY = 0;
  @ViewChild('textEditArea') textEditAreaRef?: ElementRef<HTMLTextAreaElement>;

  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  @Input() set draftFunctions(value: Array<(canvas: any, uiCan: any) => void>) {
    this.draftFuncs = value
    this.snapDirty = true;
    this.draw();
  }
  /** Bumped by whoever replaced the drawing wholesale — a new file, a loaded template, a recipe
   * switch — to re-arm the auto-fit. It carries no geometry: the camera frames what gets rendered
   * (see fitCamera), and only the caller can tell "the user opened a different design" apart from
   * "the user edited this one", which must not move the camera out from under them. */
  @Input() set fitRequest(_token: number) {
    this.autoFitPending = true;
    this.draw();
  }
  /** Day/night lives beside zoom because it is the same kind of control: it changes how the
   * drawing is looked at, not what the drawing is. The theme itself stays App's — this only
   * asks. */
  @Input() nightMode = true;
  @Output() nightModeChange = new EventEmitter<boolean>();
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
  // trackpad two-finger scroll fires as a rapid burst of wheel events; a real mouse wheel
  // notch fires as an isolated event with deltaX always exactly 0. Classified once per burst
  // (see onScrollWheel) rather than per event.
  private wheelGestureIsPan = false;
  private wheelGestureTimer: ReturnType<typeof setTimeout> | null = null;
  public isDarkMode = false;
  private isDragging = false;
  private isSpaceDown = false;
  public axisPopupOpen = false;
  /** Set while the camera still owes the scene a fit — starts true so the first draw with anything
   * in it frames the drawing, instead of leaving the user at Camera's arbitrary default. Consumed
   * by draw() once there is geometry to measure; re-armed through the `fitRequest` input above. */
  private autoFitPending = true;
  @ViewChild('imageFileInput') imageFileInputRef?: ElementRef<HTMLInputElement>;
  /** Resolver for the picker promise handed to the Image tool — see requestImageFile. */
  private pendingImageFile: ((file: { dataUrl: string; width: number; height: number } | null) => void) | null = null;

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
    // White suppression happens off the main thread of the draw loop (an offscreen canvas pass
    // per image), so the first draw shows the raw image and this redraws once it's ready.
    this.imageAssetsUnsub = this.imageAssets.onChange(() => this.draw());

    this.axisGrid.loadPreferences();

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

    this.toolRegistryUnsub = this.toolRegistry.onChange(() => this.onActiveToolChanged());
    // Lets a tool activated from the palette or a hotkey reach the canvas from its onActivate
    // hook, not just from a pointer event — see ToolRegistryService.selectTool.
    this.toolRegistry.setHost(this.toolHost);

    this.initialized = true;
    this.draw();
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
    this.host.nativeElement.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('keydown', this.onKeyDown);
    this.toolboxUnsub?.();
    this.imageAssetsUnsub?.();
    this.toolRegistryUnsub?.();
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

    // Reference images go down first, before the grid and before anything the recipe draws —
    // you trace on top of a photo, not underneath it. (This replaces the old controller's
    // append-then-`.lower()` trick, which only worked because it ran before everything else too.)
    // They get their own group purely so the camera fit can measure them as a unit.
    const imageLayer = this.gRoot.append('g').attr('class', 'reference-images');
    this.imageLayer = imageLayer;
    this.toolbox.getVisibleImages().forEach(image => {
      // A live drag/resize renders from the uncommitted override, same as any other shape.
      const dragged = this.dragOverrides?.get(image.id);
      const shape = dragged?.type === 'image' ? dragged : image;
      const href = this.imageAssets.displayHref(shape.imageRef, shape.suppressWhite ?? true);
      if (href) drawImageShape(imageLayer, shape, href);
    });

    this.axisGrid.draw(this.gRoot, this.gUI, cv, this.pxPerMm);

    if (this.selectedShapeIds.size) {
      const editable = this.toolbox.getEditableShapes();
      for (const id of this.selectedShapeIds) {
        const shape = this.dragOverrides?.get(id) ?? editable.find(s => s.id === id);
        if (!shape) continue;
        drawSelectionHalo(this.gRoot, this.gUI, shape, this.pxPerMm);
        const grabberPos = moveGrabberPosition(shape);
        if (grabberPos) drawMoveGrabber(this.gRoot, grabberPos, this.pxPerMm);
        const endpoints = endpointGrabbers(shape, this.pxPerMm);
        const rotationDeg = shape.type === 'image' ? (shape.rotationDeg ?? 0) : 0;
        if (endpoints) {
          for (const g of endpoints) drawEndpointGrabber(this.gRoot, g.pos, this.pxPerMm, g.kind, rotationDeg);
        }
      }
    }

    const snapLayer = this.gRoot.append('g').attr('class', DraftCanvasComponent.SCENE_GROUP_CLASS);
    this.snapLayer = snapLayer;
    this.draftFuncs.map(f => {
      f(snapLayer, this.gUI)
    })
    this.toolbox.getVisibleShapes().forEach(s => {
      if (s.id === this.editingTextShapeId) return; // shown via the inline textarea instead
      const shape = this.dragOverrides?.get(s.id) ?? s;
      drawShape(snapLayer, this.gUI, shape, this.pxPerMm);
    });

    // Candidates are only ever read from resolveToolPoint() and (on-demand, via
    // ensureSnapIndex()) an in-progress endpoint-drag — both no-ops the rest of the time
    // (e.g. while editing a selected shape's properties in Select mode, or typing into the
    // inline text editor, which also leaves the Text tool "active" without needing snapping)
    // — so skip the (potentially large, whole-scene) rebuild until something actually needs
    // it. `snapDirty` stays set, so the next thing that does need it still rebuilds first.
    if (this.snapDirty && (this.activeTool || this.dragEndpoint) && !this.editingTextShapeId) {
      this.snapEngine.rebuild(snapLayer);
      this.snapDirty = false;
    }

    this.activeTool?.renderPreview(this.gRoot, this.gUI, this.pxPerMm);
    if ((this.activeTool || this.isDraggingEndpoint) && this.activeSnap) {
      drawSnapMarker(this.gRoot, this.activeSnap, this.pxPerMm);
    }
    const marquee = this.isAreaSelecting ? this.areaSelectBox() : null;
    if (marquee) drawAreaSelectBox(this.gRoot, marquee);

    if (this.editingTextShapeId) this.updateEditingTextPosition();

    // Everything is on screen now, so there is finally something to measure. Fitting changes the
    // viewBox that this pass just laid out against, so it needs a second pass — the flag is
    // cleared first so that pass can't recurse, and stays set while the scene is still empty (a
    // recipe that hasn't emitted its first render yet) so the next draw tries again.
    if (this.autoFitPending && this.fitCamera()) {
      this.autoFitPending = false;
      this.draw();
    }
  }

  /** Pass null to switch to the default select tool (no active drafting tool). Thin wrapper
   * around ToolRegistryService.selectTool — the actual side effects run in
   * onActiveToolChanged() below, via the registry's onChange subscription, so they also fire
   * when tool-palette.ts or a hotkey switch the tool directly through the registry. */
  selectTool(tool: DraftTool | null): void {
    this.toolRegistry.selectTool(tool);
  }

  /** Runs whenever the active tool changes, regardless of what triggered it (a click routed
   * through selectTool() above, tool-palette.ts calling the registry directly, or a hotkey). */
  private onActiveToolChanged(): void {
    if (this.editingTextShapeId) this.editingTextShapeId = null; // e.g. switching tools mid-edit
    this.activeSnap = null;
    // Picking up a tool while the thing it produces is hidden would make it a silent no-op, so
    // activating one turns its master switch back on — the same reasoning as ToolboxStore's
    // setActiveLayer always revealing the layer you switch onto.
    if (this.activeTool?.id === 'image') this.toolbox.setShowImages(true);
    else if (this.activeTool) this.toolbox.setShowShapes(true);
    // Selection-acting tools (e.g. Offset) run against a selection made in Select mode before
    // they were activated, so it must survive activation — every other tool draws fresh shapes
    // and has no use for a stale selection.
    if (this.activeTool && !this.activeTool.actsOnSelection) this.selectedShapeIds.clear();
    this.draw();
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

  /**
   * Nearest toolbox shape to a world-space point within the select tolerance, or null.
   *
   * Images are considered only when nothing else is under the cursor, mirroring the fact that
   * they render underneath everything. Their whole interior hit-tests at distance 0 (you grab a
   * photo by its middle, not its edge), so ranking them by distance alongside real geometry would
   * mean an image always won — making anything traced on top of it unselectable.
   */
  private hitTestToolboxShape(pt: Pt): string | null {
    const toleranceMm = DraftCanvasComponent.SELECT_HIT_TOLERANCE_PX / this.pxPerMm;
    const nearestOf = (shapes: DraftShape[]): string | null => {
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const shape of shapes) {
        const dist = distanceToShape(pt, shape, this.pxPerMm);
        if (dist <= toleranceMm && dist < bestDist) {
          bestId = shape.id;
          bestDist = dist;
        }
      }
      return bestId;
    };

    const editable = this.toolbox.getEditableShapes();
    return nearestOf(editable.filter(s => s.type !== 'image'))
      ?? nearestOf(editable.filter(s => s.type === 'image'));
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
      const grabbers = endpointGrabbers(shape, this.pxPerMm);
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

  // ===== Debug dump =====

  protected readonly debugDumpEnabled = isLocalHost();

  /** Geometry attributes worth carrying per tag. Presentation (stroke width, dash, opacity) is left out. */
  private static readonly DUMP_ATTRS = [
    'd', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y',
    'width', 'height', 'points', 'transform', 'stroke', 'fill',
  ];

  /**
   * Everything drawn in world space, read back off the DOM.
   *
   * Read rather than recomputed: `draftFuncs` holds the recipe's render
   * closures, and re-running them would re-run `firstRender` — which adopts
   * stored recipes and emits, so it is not something a debug button may call.
   * The DOM already has the answer and cannot disagree with what is on screen.
   *
   * Scoped to the scene group, which is where both the recipe's layers and the
   * toolbox's shapes draw. That deliberately excludes the axis grid, reference
   * images, selection halos and snap markers — none of which are the drawing.
   *
   * Coordinates are world millimetres with y positive up, the same frame the
   * recipe works in. (`gRoot` carries a `scale(1,-1)`, so the numbers here need
   * no unflipping — but text drawn into the UI overlay does negate its y.)
   */
  protected copyCanvasDebugDump(): void {
    const host = this.host?.nativeElement;
    const pxW = host?.clientWidth ?? 0;
    const pxH = host?.clientHeight ?? 0;
    const scene = host?.querySelector(`g.${DraftCanvasComponent.SCENE_GROUP_CLASS}`);
    const drawn = scene ? Array.from(scene.querySelectorAll('path,line,circle,ellipse,rect,polyline,polygon,text')) : [];

    copyDebugDump('canvas', {
      viewport: {
        pxPerMm: this.pxPerMm,
        visibleMm: pxW && pxH ? this.camera.getViewBox(pxW, pxH) : null,
      },
      // The authored objects behind whatever the toolbox drew below — an arc's
      // real centre, radius and angles rather than the path it rasterised to.
      toolboxShapes: this.toolbox.getVisibleShapes().map(s => ({ ...s })),
      drawnCount: drawn.length,
      drawn: drawn.map(node => {
        const out: Record<string, string> = { tag: node.tagName };
        for (const name of DraftCanvasComponent.DUMP_ATTRS) {
          const v = node.getAttribute(name);
          if (v !== null) out[name] = v;
        }
        if (node.tagName === 'text' && node.textContent) out['text'] = node.textContent;
        return out;
      }),
    });
  }

  // ===== Inline text editing (see the field comments above editingTextShapeId) =====

  public get editingTextShape(): TextShape | undefined {
    if (!this.editingTextShapeId) return undefined;
    const s = this.toolbox.getEditableShapes().find(sh => sh.id === this.editingTextShapeId);
    return s?.type === 'text' ? s : undefined;
  }

  public get editingTextColor(): string {
    return this.editingTextShape?.color ?? this.toolbox.currentColor;
  }

  /** Grows the textarea by line count so Shift+Enter'd lines are all visible, not scrolled. */
  public get editingTextRows(): number {
    return Math.max(1, this.editingTextShape?.text.split('\n').length ?? 1);
  }

  /** Converts a world-mm point to pixels relative to the host div, via the SVG's own current
   * screen transform — reuses whatever pan/zoom/viewBox math is already in effect instead of
   * duplicating Camera's bookkeeping here. */
  private worldToHostPx(pt: Pt): { x: number; y: number } {
    const svgNode = this.canvas.node();
    const ctm = this.gRoot.node()?.getScreenCTM();
    if (!svgNode || !ctm) return { x: 0, y: 0 };
    const svgPoint = svgNode.createSVGPoint();
    svgPoint.x = pt.x;
    svgPoint.y = pt.y;
    const screenPt = svgPoint.matrixTransform(ctm);
    const hostRect = this.host.nativeElement.getBoundingClientRect();
    return { x: screenPt.x - hostRect.left, y: screenPt.y - hostRect.top };
  }

  /** Keeps the overlay glued to its shape's on-canvas position — called from draw() so it
   * tracks pan/zoom automatically. Closes the editor if the shape vanished (e.g. undo). */
  private updateEditingTextPosition(): void {
    const shape = this.editingTextShape;
    if (!shape) { this.editingTextShapeId = null; return; }
    const pos = this.worldToHostPx(shape.position);
    this.editingTextScreenX = pos.x;
    this.editingTextScreenY = pos.y;
  }

  private startEditingText(id: string): void {
    this.editingTextShapeId = id;
    this.updateEditingTextPosition();
    // The <textarea> is created by this state change; focus (and select its placeholder
    // content, so the first keystroke replaces it) next tick, once it exists in the DOM.
    setTimeout(() => {
      const el = this.textEditAreaRef?.nativeElement;
      if (!el) return;
      el.value = this.editingTextShape?.text ?? '';
      el.focus();
      el.select();
    });
  }

  finishEditingText(): void {
    this.editingTextShapeId = null;
    this.draw();
  }

  onTextEditInput(value: string): void {
    if (!this.editingTextShapeId) return;
    this.toolbox.updateShape(this.editingTextShapeId, { text: value });
  }

  /** Enter finishes editing (Text stays the active tool, ready for the next click); Shift+Enter
   * is left alone so the browser inserts its normal newline in the textarea. */
  onTextEditKeyDown(event: KeyboardEvent): void {
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
      event.preventDefault();
      this.finishEditingText();
    }
  }

  onPointerMove = (event: PointerEvent) => {
    this.isAngleLockHeld = event.shiftKey;
    this.isTangentLockHeld = event.ctrlKey || (DraftCanvasComponent.IS_MAC && event.metaKey);

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

      // Shift-lock to common angles, same as drawing a fresh Line/Section (see
      // two-point-tool.ts) — measured from the *other* end, since that's the segment whose
      // angle is being locked. Dimension is excluded: its drawing tool doesn't angle-lock either.
      const original = this.dragEndpoint.original;
      if ((original.type === 'line' || original.type === 'section') && this.isAngleLockHeld
        && (this.dragEndpoint.key === 'start' || this.dragEndpoint.key === 'end')) {
        const anchor = this.dragEndpoint.key === 'start' ? original.end : original.start;
        pt = snapToLockedAngle(anchor, pt);
      }

      if (!this.isDraggingEndpoint) {
        const origPos = endpointGrabbers(this.dragEndpoint.original, this.pxPerMm)?.find(g => g.key === this.dragEndpoint!.key)?.pos;
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

    // Select mode: an armed area-select (see onPointerDown) becomes a real marquee once the
    // pointer clears the same drag threshold as the drags above — a plain click on empty space
    // still just (de)selects, resolved in onPointerUp once we know it never became a drag.
    if (this.areaSelectAnchor) {
      const pt = this.worldFromPointer(event);
      this.areaSelectCurrent = pt;
      if (!this.isAreaSelecting) {
        const pxDist = Math.hypot(pt.x - this.areaSelectAnchor.x, pt.y - this.areaSelectAnchor.y) * this.pxPerMm;
        if (pxDist < DraftCanvasComponent.DRAG_MOVE_THRESHOLD_PX) {
          event.preventDefault();
          return;
        }
        this.isAreaSelecting = true;
      }
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
    this.isTangentLockHeld = event.ctrlKey || (DraftCanvasComponent.IS_MAC && event.metaKey);
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

    // Resolve an armed area-select (see onPointerDown/onPointerMove): if it never became a
    // real drag, it's a plain click on empty space — clear the selection (unless Shift, which
    // is a no-op there, same as a shift-click on empty space elsewhere). Otherwise select every
    // shape fully contained in the final box, unioned with the prior selection if Shift was
    // held when the drag started.
    if (this.areaSelectAnchor) {
      const box = this.isAreaSelecting ? this.areaSelectBox() : null;
      if (box) {
        const contained = this.toolbox.getEditableShapes().filter(shape => {
          const b = shapeBounds(shape, this.pxPerMm);
          return b.x0 >= box.x0 && b.x1 <= box.x1 && b.y0 >= box.y0 && b.y1 <= box.y1;
        });
        this.selectedShapeIds = this.areaSelectAdditive
          ? new Set([...this.selectedShapeIds, ...contained.map(s => s.id)])
          : new Set(contained.map(s => s.id));
      } else if (!this.areaSelectAdditive) {
        this.selectedShapeIds.clear();
      }
      this.areaSelectAnchor = null;
      this.areaSelectCurrent = null;
      this.isAreaSelecting = false;
      this.draw();
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

    // Tool mnemonics: each letter activates that tool group's first variant, or cycles to
    // the next variant in the group on repeated presses (so there's no need for a separate
    // "alternate" modifier — see HOTKEY_TOOL_CYCLE below). Escape (above) is the way back
    // to Select — there's no dedicated select-tool key, matching AutoCAD/Fusion 360.
    const cycle = HOTKEY_TOOL_CYCLE[event.code];
    if (cycle) {
      const currentIdx = this.activeTool ? cycle.indexOf(this.activeTool.id) : -1;
      const nextId = cycle[(currentIdx + 1) % cycle.length];
      this.toolRegistry.activateById(nextId);
      event.preventDefault();
      return;
    }

    if (event.code === 'Space') {
      this.isSpaceDown = true;
      this.host.nativeElement.classList.add('pan-ready');
      event.preventDefault();
    }

    // Fit the camera to everything on the canvas
    if (event.code === 'KeyF') {
      if (this.fitCamera()) this.draw();
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

    // Arrow key panning. Shift held = 5× larger step. A selected shape — including a placed
    // reference image — takes the arrow keys first, via the nudge block above.
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
    this.isTangentLockHeld = event.ctrlKey || (DraftCanvasComponent.IS_MAC && event.metaKey);
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

    // Shift is reserved as the drafting angle-lock modifier (see isAngleLockHeld), so it
    // must not block tool activation/selection the way Ctrl does. Ctrl doubles as the
    // tangent-lock modifier once a drag is already underway (see isTangentLockHeld), but at
    // click time it's still left alone here — among other things, that's a Mac context-menu
    // gesture, and nobody starts a drag by pressing Ctrl before the mouse button.
    const modifierHeld = event.ctrlKey;

    if (this.activeTool && isPrimary && !modifierHeld && !this.isSpaceDown) {
      const pt = this.resolveToolPoint(this.worldFromPointer(event));
      const tool = this.activeTool;
      tool.onPointerDown(pt, this.toolHost);
      this.host.nativeElement.setPointerCapture(event.pointerId);
      if (tool.oneShot) {
        // Commits immediately (e.g. Text, Point) but stays on its own tool rather than
        // switching to Select, so consecutive clicks keep placing more of them fluidly. Text
        // also opens an inline on-canvas editor right away — see startEditingText.
        const shapes = this.toolbox.getEditableShapes();
        const newest = shapes[shapes.length - 1];
        if (newest?.type === 'text') this.startEditingText(newest.id);
        this.draw();
        return;
      }
      this.draw();
      return;
    }

    // Select tool: grabbing a selected shape's endpoint (triangle) arms an endpoint-only drag —
    // checked first since it's the most specific target. Otherwise grabbing its move handle (the
    // square, or the shape body itself for Text/Point — see hitTestMoveHandle) arms a whole-shape
    // drag. Either way this takes priority over re-selecting, since the handles only exist for
    // shapes already selected. Otherwise a plain click picks (or clears) the shape under it, and
    // shift-click toggles it in/out of the current selection instead, for multi-select. Touch is
    // excluded from arming either drag so single-finger touch keeps its existing "always pans" behavior.
    if (!this.activeTool && isPrimary && !modifierHeld && !this.isSpaceDown) {
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
        if (hitId) {
          if (event.shiftKey) this.toggleSelected(hitId);
          else this.setSelectedShape(hitId);
        } else if (isTouch) {
          // Touch keeps its existing immediate-click behavior — it also falls through to the
          // pan-arming block below, so a marquee drag would conflict with that single-finger pan.
          if (!event.shiftKey) this.setSelectedShape(null);
        } else {
          // Empty space: arm a potential marquee rather than deciding now — onPointerUp
          // resolves it as either a plain click (never dragged) or an area-select (dragged
          // past the threshold), same pattern as the move/endpoint drags above.
          this.areaSelectAnchor = pt;
          this.areaSelectCurrent = pt;
          this.areaSelectAdditive = event.shiftKey;
          this.isAreaSelecting = false;
          this.host.nativeElement.setPointerCapture(event.pointerId);
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

    // Classify once per burst rather than per event: a straight vertical trackpad swipe
    // reports deltaX === 0 on plenty of individual samples, which used to flip those
    // samples over to the mouse-wheel-zoom branch below and make panning jerky. A gap of
    // 150ms with no wheel events ends the burst; the first event of a new burst decides,
    // and any nonzero deltaX seen mid-burst reclassifies it as a pan even if it started
    // out looking like a mouse wheel notch.
    const isNewGesture = this.wheelGestureTimer === null;
    if (this.wheelGestureTimer !== null) clearTimeout(this.wheelGestureTimer);
    this.wheelGestureTimer = setTimeout(() => { this.wheelGestureTimer = null; }, 150);

    if (isNewGesture) {
      this.wheelGestureIsPan = event.deltaX !== 0;
    } else if (event.deltaX !== 0) {
      this.wheelGestureIsPan = true;
    }

    if (!this.wheelGestureIsPan) {
      // Real mouse wheel notch — zoom.
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

  /**
   * Frames everything currently rendered — reference images, recipe output, and visible toolbox
   * shapes alike — measured off the SVG rather than asked of the recipe. The recipe only knows the
   * plate it computed; the canvas is the one place that knows a 3D wireframe, a contour map and a
   * hand-drawn line are all on screen next to it.
   *
   * Deliberately measures neither the grid (which spans the viewport, so including it would make
   * the fit a no-op) nor the selection halos, grabbers and tool previews (sized in screen pixels,
   * so they'd grow the box as the camera zoomed out to contain them). Text drawn into `gUI` is
   * also left out: it lives in the unflipped overlay, and labels sit beside the geometry they
   * annotate anyway.
   *
   * Returns false — leaving the camera untouched — when there is nothing on the canvas to frame,
   * or when the canvas has no size yet to frame it into.
   */
  fitCamera(): boolean {
    // A zero-width host is a real state at startup: the first draw can land before layout has
    // sized this element. Fitting into it would derive a nonsense zoom, and (worse, for the
    // startup auto-fit) claim the frame was done — so report failure and let the ResizeObserver's
    // redraw try again once there's a viewport.
    const el = this.host.nativeElement;
    const pxW = el.clientWidth;
    const pxH = el.clientHeight;
    if (pxW < 1 || pxH < 1) return false;

    const box = unionRenderedBounds([this.imageLayer?.node(), this.snapLayer?.node()]);
    if (!box) return false;

    this.camera.fitToBounds(box, pxW, pxH);
    return true;
  }

  /** The extents a placed reference image is sized against — the drawn design, without the other
   * images. Sizing an image against the union would compound: place one, scale it up to match a
   * photo's real dimensions, and the next one would arrive sized to *that* rather than to the
   * drawing. See image-tool.ts. */
  private designBounds(): Bounds | null {
    return unionRenderedBounds([this.snapLayer?.node()]);
  }

  toggleAxisPopup(): void {
    this.axisPopupOpen = !this.axisPopupOpen;
  }

  /** Selects a shape by id from outside the canvas — the tool palette's image list uses this to
   * hand you a just-unlocked image with its handles already live. Switches to Select first, since
   * a drawing tool being active would hide the selection it just made. */
  selectShapeById(id: string): void {
    this.toolRegistry.selectTool(null);
    this.setSelectedShape(id);
  }

  // ===== Image file picker =====
  // The only image-specific code left in the canvas: a <input type="file"> can't be opened
  // except by a real user gesture on a real element, so it has to live in this component's
  // template. Everything about what happens to the chosen file — sizing, placement, interning —
  // belongs to image-tool.ts, which consumes this through DraftToolHost.requestImageFile.

  /** Opens the hidden file input and resolves once the user picks a file (or dismisses). */
  private requestImageFile(): Promise<{ dataUrl: string; width: number; height: number } | null> {
    const input = this.imageFileInputRef?.nativeElement;
    if (!input) return Promise.resolve(null);

    // Abandon any previous unresolved pick, so a second activation can't leave the first tool
    // waiting on a promise that will never settle.
    this.pendingImageFile?.(null);
    input.value = '';

    return new Promise(resolve => {
      this.pendingImageFile = resolve;
      input.click();
    });
  }

  /** Bound to the hidden input's `change` in the template. Reads the file and measures it, then
   * settles whatever requestImageFile handed out. */
  async onImageFileSelected(evt: Event): Promise<void> {
    const resolve = this.pendingImageFile;
    this.pendingImageFile = null;

    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { resolve?.(null); return; }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { width, height } = await measureImage(dataUrl);
      resolve?.({ dataUrl, width, height });
    } catch {
      resolve?.(null);
    } finally {
      input.value = '';
    }
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}