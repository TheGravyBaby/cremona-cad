import { Component, ElementRef, HostListener, inject, Input } from '@angular/core';
import { DraftTool } from '../tools/draft-tool';
import { ToolboxStore } from '../tools/toolbox-store';
import { SelectionStore } from '../tools/selection-store';
import { ImageAssetStore } from '../tools/image-asset-store';
import {
  DraftShape, LineShape, DimensionShape, RectShape, TextShape, PointShape, CircleShape, ArcShape, SectionShape, TicksShape,
  FreehandShape, PathShape, PathSource, ImageShape, CurveTicksShape, DEFAULT_IMAGE_OPACITY, DEFAULT_SHAPE_COLOR, DEFAULT_FREEHAND_WIDTH,
  DEFAULT_TEXT_SIZE_MM, angleSweep, applyImageCrop, applyImageSize, isCropped, pathFromSource,
} from '../tools/toolbox-shape';
import { ImageCrop } from '../../models/types';
import { clamp, normalizeDegrees, pointAtDistanceToward } from '../../helpers/math/simpleGeometry';
import { shapeBounds, unionBounds } from '../tools/shape-hit-test';
import { translateShape } from '../tools/shape-transform';

/**
 * The Inkscape-style contextual settings strip along the bottom bar: color, then whichever
 * shape-type panel's numeric fields apply (based on the active tool or the current selection),
 * then simple toggles (Dashed, Compass, Equal segments). Everything here is a thin wrapper
 * around ToolboxStore, reading the selection straight from SelectionStore — draft-canvas.ts only
 * needs to pass down activeTool.
 */
@Component({
  selector: 'app-settings-bar',
  standalone: true,
  imports: [],
  templateUrl: './settings-bar.html',
  styleUrls: ['./settings-bar.css'],
})
export class SettingsBarComponent {
  private toolbox = inject(ToolboxStore);
  private imageAssets = inject(ImageAssetStore);
  private selection = inject(SelectionStore);

  @Input() activeTool: DraftTool | null = null;

  /** Set only for exactly one selected, editable shape — what the per-type numeric panels edit. */
  public get selectedShape(): DraftShape | undefined { return this.selection.toolboxShape; }
  /** The editable selection, however many shapes — drives group-editable settings like color
   * that apply across a multi-selection. Recipe geometry is left out: nothing here can change it. */
  public get selectedShapes(): DraftShape[] { return this.selection.toolboxShapes; }
  /** Selected pieces of the recipe's own geometry — described, never edited. */
  private get sceneShapes(): DraftShape[] { return this.selection.sceneShapes; }

  /** Narrows the current selection to one shape type, for a settings panel's own `selectedXShape` getter. */
  private selectedShapeOfType<T extends DraftShape['type']>(type: T): Extract<DraftShape, { type: T }> | undefined {
    const s = this.selectedShape;
    return s?.type === type ? (s as Extract<DraftShape, { type: T }>) : undefined;
  }

  /** Display-only rounding for X/Y coordinate fields — shown to 2 decimal places so the paired
   * boxes stay narrow; the underlying shape data keeps its full precision, this only affects
   * what's rendered into the input. */
  private round2(v: number): number {
    return Math.round(v * 100) / 100;
  }

  /** Shared by every settings-panel numeric field: parse, reject non-finite/invalid, patch. */
  private patchNumberField<S extends DraftShape>(
    shape: S | undefined,
    key: keyof S,
    raw: number,
    opts?: { transform?: (v: number) => number; validate?: (v: number) => boolean },
  ): void {
    if (!shape) return;
    const v = Number(raw);
    if (!Number.isFinite(v) || (opts?.validate && !opts.validate(v))) return;
    const value = opts?.transform ? opts.transform(v) : v;
    this.toolbox.updateShape(shape.id, { [key]: value } as Partial<DraftShape>);
  }

  /** Shared by every settings-panel Pt field (start/end, p1/p2, center, position): patch one axis in place. */
  private patchPointField<S extends DraftShape>(shape: S | undefined, key: keyof S, axis: 'x' | 'y', raw: number): void {
    if (!shape) return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const current = shape[key] as { x: number; y: number };
    this.toolbox.updateShape(shape.id, { [key]: { ...current, [axis]: v } } as Partial<DraftShape>);
  }

  /** Nothing to tint if there's neither an active drawing tool nor a selection. */
  public get showColorSwatch(): boolean {
    return !!this.activeTool || this.selectedShapes.length > 0;
  }

  /** Whether the bar has anything at all to show — used to hide the whole strip (rather than
   * render an empty, oddly-backgrounded box) when there's no active tool and no selection. */
  public get hasContent(): boolean {
    return this.showColorSwatch || this.sceneShapes.length > 0;
  }

  /** One line of numbers for a selected piece of the recipe, or a count for several — the
   * measuring-without-drawing that makes recipe geometry worth selecting at all. Editing and
   * duplicating it are the top bar's job. */
  public get sceneReadout(): string | undefined {
    const scene = this.sceneShapes;
    if (scene.length === 0) return undefined;
    if (scene.length > 1) return `${scene.length} recipe shapes`;
    return describeShape(scene[0]);
  }

  /** Friendly name for each shape type, used by groupTitle when the settings reflect a selection. */
  private static readonly SHAPE_TYPE_LABELS: Record<DraftShape['type'], string> = {
    line: 'Line', arc: 'Arc', circle: 'Circle', dimension: 'Distance', angle: 'Angle',
    'curve-length': 'Curve Length', 'curve-ticks': 'Curve Ticks', rect: 'Rectangle', section: 'Section', ticks: 'Ticks', text: 'Text', point: 'Point',
    freehand: 'Drawing', path: 'Path', image: 'Reference Image',
  };

  /** Heading shown above the settings strip so it's clear what "Color"/"Dashed"/etc. apply to —
   * the selection's shape type when something's selected (uniform type, or "Selection" when
   * mixed), otherwise the active drawing tool's own label. Undefined exactly when hasContent is
   * false, so there's never a heading over an empty bar. */
  public get groupTitle(): string | undefined {
    const all = this.selection.shapes;
    if (all.length > 0) {
      const types = new Set(all.map(s => s.type));
      const groupId = this.selectedShapes[0]?.groupId;
      const isGroup = all.length > 1 && groupId !== undefined && all.every(s => s.groupId === groupId);
      const label = isGroup ? 'Group'
        : sourceLabel(all) ?? (types.size === 1 ? SettingsBarComponent.SHAPE_TYPE_LABELS[all[0].type] : 'Selection');
      // a recipe piece has no settings to speak of — the title says what it is instead
      return this.selectedShapes.length === 0 ? `Recipe ${label}` : `${label} Settings`;
    }
    return this.activeTool ? `${this.activeTool.label} Settings` : undefined;
  }

  /** Shows the selection's color when something's selected (the first shape's, when the
   * selection has mixed colors — a native color <input> can't represent "mixed"), otherwise
   * the pen color new shapes will use. */
  public get displayedColor(): string {
    return this.selectedShapes[0]?.color ?? this.toolbox.currentColor;
  }

  /** Applies to every selected shape at once (one history step via updateShapes), so recoloring
   * a group is a single undo — not one step per shape. */
  setColor(color: string): void {
    this.toolbox.currentColor = color;
    if (this.selectedShapes.length === 0) return;
    const patches = new Map<string, Partial<DraftShape>>(this.selectedShapes.map(s => [s.id, { color }]));
    this.toolbox.updateShapes(patches);
  }

  /** Dashed applies to Line, Rect, Circle and Path — a shared pen setting (like currentColor), not
   * a per-tool one, so it's one common control rather than several near-identical toggles. */
  private static readonly DASHABLE_TOOL_IDS = new Set([
    'line', 'polyline', 'line-tangent', 'line-perpendicular', 'rect', 'right-triangle', 'circle', 'polygon-3', 'polygon-4', 'polygon-5', 'polygon-6', 'polygon-8',
    'batten', 'catenary', 'cycloid',
  ]);

  private get selectedDashableShapes(): (LineShape | RectShape | CircleShape | PathShape)[] {
    return this.selectedShapes.filter(
      (s): s is LineShape | RectShape | CircleShape | PathShape =>
        s.type === 'line' || s.type === 'rect' || s.type === 'circle' || s.type === 'path');
  }

  public get showDashedToggle(): boolean {
    return (!!this.activeTool && SettingsBarComponent.DASHABLE_TOOL_IDS.has(this.activeTool.id))
      || this.selectedDashableShapes.length > 0;
  }

  /** First selected dashable shape's value (same "first wins" convention as displayedColor when
   * the group is mixed), otherwise the pen default new shapes will use. */
  public get dashed(): boolean {
    return this.selectedDashableShapes[0]?.dashed ?? this.toolbox.currentDashed;
  }

  /** Applies to every selected Line/Rect/Circle at once (one history step via updateShapes). */
  setDashed(value: boolean): void {
    this.toolbox.currentDashed = value;
    const shapes = this.selectedDashableShapes;
    if (shapes.length === 0) return;
    const patches = new Map<string, Partial<DraftShape>>(shapes.map(s => [s.id, { dashed: value }]));
    this.toolbox.updateShapes(patches);
  }

  /** Where the selection is when nothing else says: the centre of its bounding box, editable.
   * Only for a selection with no position fields of its own — several shapes, a group, a drawing
   * or a path — so a lone arc isn't described twice. Recipe pieces in a mixed selection are left
   * out, since typing a new X can't move them. */
  private get selectionBox() {
    return unionBounds(this.selectedShapes.map(shapeBounds));
  }

  public get showBoundsPanel(): boolean {
    const shapes = this.selectedShapes;
    return shapes.length > 1 || shapes[0]?.type === 'freehand' || shapes[0]?.type === 'path';
  }

  public get boundsX(): number { const b = this.selectionBox; return b ? this.round2((b.x0 + b.x1) / 2) : 0; }
  public get boundsY(): number { const b = this.selectionBox; return b ? this.round2((b.y0 + b.y1) / 2) : 0; }

  /** Moves the whole selection so its box is centred on the typed coordinate — one history step. */
  setBoundsCentre(axis: 'x' | 'y', value: number): void {
    const b = this.selectionBox;
    const v = Number(value);
    if (!b || !Number.isFinite(v)) return;
    const shift = v - (axis === 'x' ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2);
    if (shift === 0) return;
    this.toolbox.replaceShapes(this.selectedShapes.map(s => axis === 'x' ? translateShape(s, shift, 0) : translateShape(s, 0, shift)));
  }

  /** Line, Dimension, Section and Ticks all carry the same start+end geometry, so one panel edits
   * any of them numerically once a shape is selected — the weights panel further down adds only
   * the controls unique to Section and Ticks (weights/count). Unlike the pen color there's no
   * "pen position" default, so none of this shows for a merely-active tool. */
  private get selectedLineLikeShape(): LineShape | DimensionShape | SectionShape | TicksShape | undefined {
    const s = this.selectedShape;
    return (s?.type === 'line' || s?.type === 'dimension' || s?.type === 'section' || s?.type === 'ticks') ? s : undefined;
  }

  public get showLinePanel(): boolean {
    return !!this.selectedLineLikeShape;
  }

  public get lineStartX(): number { return this.round2(this.selectedLineLikeShape?.start.x ?? 0); }
  public get lineStartY(): number { return this.round2(this.selectedLineLikeShape?.start.y ?? 0); }
  public get lineEndX(): number { return this.round2(this.selectedLineLikeShape?.end.x ?? 0); }
  public get lineEndY(): number { return this.round2(this.selectedLineLikeShape?.end.y ?? 0); }

  setLinePoint(which: 'start' | 'end', axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedLineLikeShape, which, axis, value);
  }

  public get lineLength(): number {
    const s = this.selectedLineLikeShape;
    return s ? this.round2(Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y)) : 0;
  }

  /** Moves `end` to the given distance from `start`, along the shape's existing angle — the
   * numeric equivalent of dragging the end handle without changing direction. On a Section the
   * segments follow along, since its weights are relative to whatever the total length is. */
  setLineLength(value: number): void {
    const shape = this.selectedLineLikeShape;
    if (!shape) return;
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    const end = pointAtDistanceToward(shape.start, shape.end, v);
    this.toolbox.updateShape(shape.id, { end });
  }

  /** How far a Distance's dimension line sits off the two points it measures, the third click's
   * value made numeric — which is how you stack several measurements at even steps (10, 20, 30)
   * rather than eyeballing each one. Signed, so the sign flips it to the other side. */
  private get selectedDimensionShape(): DimensionShape | undefined {
    return this.selectedShapeOfType('dimension');
  }

  public get showDimensionOffset(): boolean {
    return !!this.selectedDimensionShape;
  }

  public get dimensionOffset(): number {
    return this.round2(this.selectedDimensionShape?.offset ?? 0);
  }

  setDimensionOffset(value: number): void {
    const shape = this.selectedDimensionShape;
    if (!shape) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    this.toolbox.updateShape(shape.id, { offset: v });
  }

  /** Rect and Square both commit as a 'rect' shape (p1/p2 corners) — same panel edits either. */
  private get selectedRectShape(): RectShape | undefined {
    return this.selectedShapeOfType('rect');
  }

  public get showRectPanel(): boolean {
    return !!this.selectedRectShape;
  }

  public get rectP1X(): number { return this.round2(this.selectedRectShape?.p1.x ?? 0); }
  public get rectP1Y(): number { return this.round2(this.selectedRectShape?.p1.y ?? 0); }
  public get rectP2X(): number { return this.round2(this.selectedRectShape?.p2.x ?? 0); }
  public get rectP2Y(): number { return this.round2(this.selectedRectShape?.p2.y ?? 0); }

  setRectPoint(which: 'p1' | 'p2', axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedRectShape, which, axis, value);
  }

  private get selectedTextShape(): TextShape | undefined {
    return this.selectedShapeOfType('text');
  }

  private selectedSources<K extends PathSource['kind']>(...kinds: K[]): (PathShape & { source: Extract<PathSource, { kind: K }> })[] {
    return this.selectedShapes.filter((s): s is PathShape & { source: Extract<PathSource, { kind: K }> } =>
      s.type === 'path' && !!s.source && (kinds as string[]).includes(s.source.kind));
  }

  public get showFilletPanel(): boolean {
    return this.activeTool?.id === 'fillet';
  }

  public get filletRadius(): number { return this.round2(this.toolbox.currentFilletRadius); }

  setFilletRadius(value: number): void {
    if (Number.isFinite(value) && value > 0) this.toolbox.currentFilletRadius = value;
  }

  public get showCycloidPanel(): boolean {
    return this.activeTool?.id === 'cycloid' || this.selectedSources('cycloid').length > 0;
  }

  public get cycloidFactorPct(): number {
    return Math.round((this.selectedSources('cycloid')[0]?.source.factor ?? this.toolbox.currentCycloidFactor) * 100);
  }

  public get cycloidPct(): number {
    return Math.round((this.selectedSources('cycloid')[0]?.source.pct ?? this.toolbox.currentCycloidPct) * 100);
  }

  // like Text's size: reshapes what is selected and becomes the setting for the next one
  setCycloidFactorPct(value: number): void {
    if (!Number.isFinite(value)) return;
    this.toolbox.currentCycloidFactor = clamp(value, 0, 100) / 100;
    this.reshape(this.selectedSources('cycloid'), s => ({ ...s, factor: this.toolbox.currentCycloidFactor }));
  }

  setCycloidPct(value: number): void {
    if (!Number.isFinite(value)) return;
    this.toolbox.currentCycloidPct = clamp(value, 5, 150) / 100;
    this.reshape(this.selectedSources('cycloid'), s => ({ ...s, pct: this.toolbox.currentCycloidPct }));
  }

  // depth is set by the third click, so there is no pen setting to show before one is placed
  public get showCurveDepth(): boolean {
    return this.selectedSources('catenary', 'cycloid').length > 0;
  }

  public get curveDepth(): number {
    return this.round2(Math.abs(this.selectedSources('catenary', 'cycloid')[0]?.source.depth ?? 0));
  }

  // typed as a size; each curve keeps the side it bows to
  setCurveDepth(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.reshape(this.selectedSources('catenary', 'cycloid'), s => ({ ...s, depth: (Math.sign(s.depth) || 1) * value }));
  }

  private reshape<S extends PathSource>(shapes: (PathShape & { source: S })[], change: (source: S) => S): void {
    const patches = new Map<string, Partial<DraftShape>>();
    for (const shape of shapes) {
      const source = change(shape.source);
      patches.set(shape.id, { source, d: pathFromSource(source) });
    }
    this.toolbox.updateShapes(patches);
  }

  /** Open for an armed Text tool as well as a selected label, so the size can be set *before*
   * placing — same shape as Section's and Freehand's panels. Only Size is meaningful in the armed
   * case, since it is a pen setting the store carries; everything else needs a shape to edit. */
  public get showTextPanel(): boolean {
    return this.activeTool?.id === 'text' || !!this.selectedTextShape;
  }

  /** The fields that describe one label rather than the pen — hidden while the tool is merely
   * armed, when there is nothing for them to read or write. */
  public get showTextShapeFields(): boolean {
    return !!this.selectedTextShape;
  }

  public get textPositionX(): number { return this.round2(this.selectedTextShape?.position.x ?? 0); }
  public get textPositionY(): number { return this.round2(this.selectedTextShape?.position.y ?? 0); }
  public get textContent(): string { return this.selectedTextShape?.text ?? ''; }

  /** Falls back to the size new labels are being stamped with, so the field reads the same
   * number whether a label is selected or the Text tool is simply armed. */
  public get textFontSize(): number {
    const shape = this.selectedTextShape;
    // An older label carries no size of its own and renders at the default — report that, not
    // the pen setting, or the field would claim a size the canvas isn't using.
    return this.round2(shape ? shape.fontSize ?? DEFAULT_TEXT_SIZE_MM : this.toolbox.currentTextSize);
  }

  public get textRotation(): number {
    return this.round2(this.selectedTextShape?.rotationDeg ?? 0);
  }

  setTextPosition(axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedTextShape, 'position', axis, value);
  }

  setTextContent(text: string): void {
    const shape = this.selectedTextShape;
    if (!shape) return;
    this.toolbox.updateShape(shape.id, { text });
  }

  /** Sizes the selected label *and* becomes the size the next one is placed at — settling on a
   * size that reads against this drawing is a decision about the drawing, not about one label.
   * With the tool merely armed there is no label to patch and only the pen setting moves, which
   * is what makes the field usable before the first click. */
  setTextFontSize(value: number): void {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    this.toolbox.currentTextSize = v;
    this.patchNumberField(this.selectedTextShape, 'fontSize', v);
  }

  setTextRotation(value: number): void {
    this.patchNumberField(this.selectedTextShape, 'rotationDeg', value, { transform: normalizeDegrees });
  }

  private get selectedPointShape(): PointShape | undefined {
    return this.selectedShapeOfType('point');
  }

  public get showPointPanel(): boolean {
    return !!this.selectedPointShape;
  }

  public get pointPositionX(): number { return this.round2(this.selectedPointShape?.position.x ?? 0); }
  public get pointPositionY(): number { return this.round2(this.selectedPointShape?.position.y ?? 0); }

  setPointPosition(axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedPointShape, 'position', axis, value);
  }

  /** Every Freehand in the current selection, however many — same "group-editable" shape as
   * selectedArcShapes/selectedSectionShapes above. */
  private get selectedFreehandShapes(): FreehandShape[] {
    return this.selectedShapes.filter((s): s is FreehandShape => s.type === 'freehand');
  }

  /** Shown for the active Freehand tool (so you can dial in a pen setting before drawing) or any
   * Freehand selection — same condition shape as showWeightsPanel. */
  public get showFreehandPanel(): boolean {
    return this.activeTool?.id === 'freehand' || this.selectedFreehandShapes.length > 0;
  }

  /** First selected stroke's width (same "first wins" convention as displayedColor), otherwise
   * the pen default new strokes will use. */
  public get freehandWidth(): number {
    return this.selectedFreehandShapes[0]?.strokeWidth ?? this.toolbox.currentStrokeWidth;
  }

  /** Applies to every selected stroke at once (one history step via updateShapes), same as setColor. */
  setFreehandWidth(value: number): void {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    this.toolbox.currentStrokeWidth = v;
    const shapes = this.selectedFreehandShapes;
    if (shapes.length === 0) return;
    const patches = new Map<string, Partial<DraftShape>>(shapes.map(s => [s.id, { strokeWidth: v }]));
    this.toolbox.updateShapes(patches);
  }

  public get freehandOpacity(): number {
    return this.selectedFreehandShapes[0]?.opacity ?? this.toolbox.currentOpacity;
  }

  setFreehandOpacity(value: number): void {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    const clamped = Math.min(1, Math.max(0, v));
    this.toolbox.currentOpacity = clamped;
    const shapes = this.selectedFreehandShapes;
    if (shapes.length === 0) return;
    const patches = new Map<string, Partial<DraftShape>>(shapes.map(s => [s.id, { opacity: clamped }]));
    this.toolbox.updateShapes(patches);
  }

  /** Shared by the Pen/Highlighter presets below: sets the pen defaults (for the next stroke)
   * and, same as Color/Width/Opacity's own setters above, applies the same values to any
   * Freehand already selected. */
  private applyFreehandPreset(color: string, strokeWidth: number, opacity: number): void {
    this.toolbox.currentColor = color;
    this.toolbox.currentStrokeWidth = strokeWidth;
    this.toolbox.currentOpacity = opacity;
    const shapes = this.selectedFreehandShapes;
    if (shapes.length === 0) return;
    const patches = new Map<string, Partial<DraftShape>>(shapes.map(s => [s.id, { color, strokeWidth, opacity }]));
    this.toolbox.updateShapes(patches);
  }

  // Back to an ordinary opaque line — the quick way out of Highlighter (or any manually-dialed-in
  // look) without hand-resetting Color/Width/Opacity one field at a time.
  private static readonly PEN_COLOR = DEFAULT_SHAPE_COLOR;
  private static readonly PEN_WIDTH = DEFAULT_FREEHAND_WIDTH;
  private static readonly PEN_OPACITY = 1;

  applyPenPreset(): void {
    this.applyFreehandPreset(SettingsBarComponent.PEN_COLOR, SettingsBarComponent.PEN_WIDTH, SettingsBarComponent.PEN_OPACITY);
  }

  // A wide, translucent yellow stroke — the look someone reaches for on every highlighter pass,
  // so it's a shortcut for a Color+Width+Opacity combination rather than a fourth pen setting.
  private static readonly HIGHLIGHTER_COLOR = '#fde047';
  private static readonly HIGHLIGHTER_WIDTH = 14;
  private static readonly HIGHLIGHTER_OPACITY = 0.35;

  applyHighlighterPreset(): void {
    this.applyFreehandPreset(
      SettingsBarComponent.HIGHLIGHTER_COLOR, SettingsBarComponent.HIGHLIGHTER_WIDTH, SettingsBarComponent.HIGHLIGHTER_OPACITY);
  }

  private get selectedCircleShape(): CircleShape | undefined {
    return this.selectedShapeOfType('circle');
  }

  public get showCirclePanel(): boolean {
    return !!this.selectedCircleShape;
  }

  public get circleCenterX(): number { return this.round2(this.selectedCircleShape?.center.x ?? 0); }
  public get circleCenterY(): number { return this.round2(this.selectedCircleShape?.center.y ?? 0); }
  public get circleRadius(): number { return this.round2(this.selectedCircleShape?.radius ?? 0); }

  setCircleCenter(axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedCircleShape, 'center', axis, value);
  }

  setCircleRadius(value: number): void {
    this.patchNumberField(this.selectedCircleShape, 'radius', value, { validate: v => v > 0 });
  }

  private get selectedArcShape(): ArcShape | undefined {
    return this.selectedShapeOfType('arc');
  }

  public get showArcPanel(): boolean {
    return !!this.selectedArcShape;
  }

  public get arcCenterX(): number { return this.round2(this.selectedArcShape?.center.x ?? 0); }
  public get arcCenterY(): number { return this.round2(this.selectedArcShape?.center.y ?? 0); }
  public get arcRadius(): number { return this.round2(this.selectedArcShape?.radius ?? 0); }
  public get arcStartDeg(): number { return this.round2((this.selectedArcShape?.startAngle ?? 0) * 180 / Math.PI); }
  public get arcEndDeg(): number { return this.round2((this.selectedArcShape?.endAngle ?? 0) * 180 / Math.PI); }

  setArcCenter(axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedArcShape, 'center', axis, value);
  }

  setArcRadius(value: number): void {
    this.patchNumberField(this.selectedArcShape, 'radius', value, { validate: v => v > 0 });
  }

  /** Angle fields are edited in degrees for readability; stored in radians, matching arcPathData's convention in helpers/math/pathMath.ts. */
  setArcAngle(which: 'start' | 'end', valueDeg: number): void {
    const key = which === 'start' ? 'startAngle' : 'endAngle';
    this.patchNumberField(this.selectedArcShape, key, valueDeg, { transform: v => v * Math.PI / 180 });
  }

  /** Every Arc in the current selection, however many — lets Compass stay group-editable
   * across a multi-selection, the same way Color and Dashed already are. */
  private get selectedArcShapes(): ArcShape[] {
    return this.selectedShapes.filter((s): s is ArcShape => s.type === 'arc');
  }

  /** Broader than showArcPanel: Compass also shows for a multi-selection of Arcs (whose
   * individual X/Y/R/Start/End controls don't make sense as a group and stay gated behind
   * showArcPanel), same reasoning as showSectionColor2. */
  public get showArcCenterGuidesToggle(): boolean {
    return this.selectedArcShapes.length > 0;
  }

  /** "Compass": keeps the center point and dashed radius guides permanently visible on the committed arc. */
  public get arcShowCenterGuides(): boolean {
    return this.selectedArcShapes[0]?.showCenterGuides ?? false;
  }

  /** Applies to every selected arc at once, so toggling Compass on a group is a single undo. */
  setArcShowCenterGuides(value: boolean): void {
    const shapes = this.selectedArcShapes;
    if (shapes.length === 0) return;
    const patches = new Map<string, Partial<DraftShape>>(shapes.map(s => [s.id, { showCenterGuides: value }]));
    this.toolbox.updateShapes(patches);
  }

  /** Section and Ticks share the weights/count controls, each with its own pen default; Curve
   * Ticks shares Ticks' default, being the same marks laid along a curve. */
  private get weightsShape(): SectionShape | TicksShape | CurveTicksShape | undefined {
    const s = this.selectedShape;
    return (s?.type === 'section' || s?.type === 'ticks' || s?.type === 'curve-ticks') ? s : undefined;
  }

  private get weightsKind(): 'section' | 'ticks' | undefined {
    const id = this.weightsShape?.type ?? this.activeTool?.id;
    if (id === 'section') return 'section';
    return (id === 'ticks' || id === 'curve-ticks') ? 'ticks' : undefined;
  }

  public get showWeightsPanel(): boolean {
    return !!this.weightsKind;
  }

  private get displayedWeights(): number[] {
    return this.weightsShape?.weights
      ?? (this.weightsKind === 'ticks' ? this.toolbox.currentTickWeights : this.toolbox.currentSectionWeights);
  }

  private applyWeights(weights: number[]): void {
    if (this.weightsKind === 'ticks') this.toolbox.currentTickWeights = weights;
    else this.toolbox.currentSectionWeights = weights;
    const shape = this.weightsShape;
    if (shape) this.toolbox.updateShape(shape.id, { weights });
  }

  /** Every Section in the current selection, however many — this drives Color2 so it stays
   * group-editable across a multi-selection, the same way the primary color swatch is. */
  private get selectedSectionShapes(): SectionShape[] {
    return this.selectedShapes.filter((s): s is SectionShape => s.type === 'section');
  }

  /** Broader than showSectionPanel: Color2 also shows for a multi-selection of Sections (whose
   * individual X/Y/weights controls don't make sense as a group and stay gated behind
   * showWeightsPanel), same reasoning as the primary color swatch's showColorSwatch. */
  public get showSectionColor2(): boolean {
    return this.activeTool?.id === 'section' || this.selectedSectionShapes.length > 0;
  }

  // A Section's endpoints and length are edited by the shared line-like panel above, since they're
  // the same start/end fields Line and Dimension have — only the controls below are Section's own.

  /** First selected Section's color2 (same "first wins" convention as displayedColor when the
   * group has mixed values — a native color <input> can't show "mixed"), otherwise the pen default. */
  public get displayedSectionColor2(): string {
    return this.selectedSectionShapes[0]?.color2 ?? this.toolbox.currentSectionColor2;
  }

  public get displayedWeightsText(): string {
    return this.displayedWeights.join(',');
  }

  /** Segment count when using the "equal segments" input mode — just the number of weights,
   * since that mode only ever produces equal (all-1) weights; see setWeightsCount. */
  public get displayedWeightsCount(): number {
    return this.displayedWeights.length;
  }

  /** Toggles the Weights row between a free-form comma list and a simple equal-segment count —
   * pure UI/input-mode state, not persisted per-shape, so switching shapes doesn't reset it. */
  public weightsUseCount = false;

  /** Applies to every selected Section at once (one history step via updateShapes), same as setColor. */
  setSectionColor2(color: string): void {
    this.toolbox.currentSectionColor2 = color;
    const shapes = this.selectedSectionShapes;
    if (shapes.length === 0) return;
    const patches = new Map<string, Partial<DraftShape>>(shapes.map(s => [s.id, { color2: color }]));
    this.toolbox.updateShapes(patches);
  }

  setWeightsText(text: string): void {
    const weights = text.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
    if (weights.length === 0) return;
    this.applyWeights(weights);
  }

  // ===== Reference image =====
  // The replacement for the old reference-image popup's X/Y/W/H/°/opacity grid. It lives here
  // now for the same reason every other shape's numeric fields do: the controls belong to the
  // selected object, not to a mode.

  private get selectedImageShape(): ImageShape | undefined {
    return this.selectedShapeOfType('image');
  }

  public get showImagePanel(): boolean {
    return !!this.selectedImageShape;
  }

  public get imageLabel(): string { return this.selectedImageShape?.label ?? ''; }
  public get imageX(): number { return this.round2(this.selectedImageShape?.x ?? 0); }
  public get imageY(): number { return this.round2(this.selectedImageShape?.y ?? 0); }
  public get imageWidth(): number { return this.round2(this.selectedImageShape?.width ?? 0); }
  public get imageHeight(): number { return this.round2(this.selectedImageShape?.height ?? 0); }
  public get imageRotationDeg(): number { return this.round2(this.selectedImageShape?.rotationDeg ?? 0); }

  public get imageOpacity(): number {
    return this.round2(this.selectedImageShape?.opacity ?? DEFAULT_IMAGE_OPACITY);
  }

  setImageLabel(label: string): void {
    const shape = this.selectedImageShape;
    if (!shape) return;
    // An empty name would leave nothing to identify the image by; keep the old one.
    const trimmed = label.trim();
    if (trimmed) this.toolbox.updateShape(shape.id, { label: trimmed });
  }

  setImagePosition(axis: 'x' | 'y', value: number): void {
    this.patchNumberField(this.selectedImageShape, axis, value);
  }

  /** W and H are one control: a reference image is never skewed, so setting either takes the
   * other from the box's proportions. See applyImageSize. */
  setImageSize(key: 'width' | 'height', value: number): void {
    const shape = this.selectedImageShape;
    if (!shape || !Number.isFinite(value) || value <= 0) return;
    this.toolbox.updateShape(shape.id, applyImageSize(shape, key, value) as Partial<DraftShape>);
  }

  setImageRotation(valueDeg: number): void {
    this.patchNumberField(this.selectedImageShape, 'rotationDeg', valueDeg, { transform: normalizeDegrees });
  }

  setImageOpacity(value: number): void {
    this.patchNumberField(this.selectedImageShape, 'opacity', value, {
      transform: v => Math.max(0, Math.min(1, v)),
    });
  }

  /** Whether near-white pixels are faded to transparent, so a scan on white paper reads against
   * a dark canvas. Was unconditional; now per-image, since it ruins a photo whose subject really
   * is white (a plaster cast, a light-varnished front). */
  public get imageSuppressWhite(): boolean {
    return this.selectedImageShape?.suppressWhite ?? true;
  }

  /** True once a suppression attempt on this image has actually failed — a host with no CORS
   * header refuses to hand its pixels back to the browser at all. The toggle disables itself
   * rather than offering a setting that can never take visible effect. */
  public get imageSuppressionUnavailable(): boolean {
    const shape = this.selectedImageShape;
    return !!shape && !this.imageAssets.isSuppressible(shape.imageRef);
  }

  setImageSuppressWhite(value: boolean): void {
    const shape = this.selectedImageShape;
    if (!shape) return;
    this.toolbox.updateShape(shape.id, { suppressWhite: value });
  }

  /** Mirrors the image content left-right about its own center — for a scan that came out
   * reversed, or to compare a traced half against its opposite. Purely a content flag: the box
   * itself (position/size/rotation) is untouched, so handles don't move. No separate vertical
   * mirror: combined with Rot°, this one axis reaches every orientation a second would — see
   * ImageShape.mirrored. */
  public get imageMirrored(): boolean { return this.selectedImageShape?.mirrored ?? false; }

  toggleImageMirrored(): void {
    const shape = this.selectedImageShape;
    if (!shape) return;
    this.toolbox.updateShape(shape.id, { mirrored: !this.imageMirrored });
  }

  // behind a popup button rather than inline, since it isn't a value nudged while watching the
  // canvas the way X or Opacity is. Which panels an image shows on is set from its row in the
  // bottom bar's image list, beside the same control for layers (layer-controls.ts).

  public cropOpen = false;
  private elRef = inject(ElementRef<HTMLElement>);

  toggleCropPopup(): void {
    this.cropOpen = !this.cropOpen;
  }

  // a press anywhere outside the bar — the canvas above all — takes the popup down, as every popup
  // in the app does
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (this.cropOpen && !this.elRef.nativeElement.contains(event.target as Node)) this.cropOpen = false;
  }

  public get imageCropped(): boolean { return isCropped(this.selectedImageShape?.crop); }

  /** Shown as a percentage of the picture rather than the stored fraction. */
  public imageCropPercent(edge: keyof ImageCrop): number {
    return this.round2((this.selectedImageShape?.crop?.[edge] ?? 0) * 100);
  }

  // goes through applyImageCrop, not a plain patch, so the box moves/resizes to keep the
  // retained picture where it was, at the scale it was already set to.
  setImageCropPercent(edge: keyof ImageCrop, percent: number): void {
    const shape = this.selectedImageShape;
    if (!shape || !Number.isFinite(percent)) return;
    const current: ImageCrop = shape.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const next: ImageCrop = { ...current, [edge]: Math.max(0, Math.min(100, percent)) / 100 };
    this.toolbox.updateShape(shape.id, applyImageCrop(shape, next) as Partial<DraftShape>);
  }

  // uncrops without rescaling: the box grows back outward from what was showing.
  clearImageCrop(): void {
    const shape = this.selectedImageShape;
    if (!shape) return;
    this.toolbox.updateShape(shape.id, applyImageCrop(shape, undefined) as Partial<DraftShape>);
  }

  /**
   * Re-locking right where you've been adjusting the image, so protecting it again doesn't mean
   * going back to the palette's image list. Locking immediately deselects it (a locked image
   * isn't editable), which is the intended "done with that" gesture.
   *
   * Goes through setImageLocked rather than updateShape because unlocking has to bypass the very
   * guard updateShape applies.
   */
  lockImage(): void {
    const shape = this.selectedImageShape;
    if (!shape) return;
    this.toolbox.setImageLocked(shape.id, true);
  }

  /** Equal-segments mode: N segments all weighted 1 — e.g. 16 for showing sixteenths, without
   * typing out "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1" by hand. */
  setWeightsCount(count: number): void {
    const n = Math.round(count);
    if (!Number.isFinite(n) || n < 1) return;
    this.applyWeights(new Array(n).fill(1));
  }
}

const mm = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);
const pt = (p: { x: number; y: number }): string => `${mm(p.x)}, ${mm(p.y)}`;
const deg = (rad: number): string => normalizeDegrees(rad * 180 / Math.PI).toFixed(1);

const SOURCE_LABELS: Record<PathSource['kind'], string> = { catenary: 'Catenary', cycloid: 'Cycloid', batten: 'Batten' };

// the curve tool that drew every shape selected, when they were all drawn by the same one
function sourceLabel(shapes: DraftShape[]): string | undefined {
  const kinds = new Set(shapes.map(s => s.type === 'path' ? s.source?.kind : undefined));
  const [kind] = kinds;
  return kinds.size === 1 && kind ? SOURCE_LABELS[kind] : undefined;
}

function describeShape(shape: DraftShape): string {
  switch (shape.type) {
    case 'line':
    case 'section':
    case 'ticks':
    case 'dimension':
      return `${pt(shape.start)} → ${pt(shape.end)} · ${mm(Math.hypot(shape.end.x - shape.start.x, shape.end.y - shape.start.y))} mm`;
    case 'arc':
      return `Center ${pt(shape.center)} · R ${mm(shape.radius)} · ${deg(shape.startAngle)}° → ${deg(shape.endAngle)}°`;
    case 'circle':
      return `Center ${pt(shape.center)} · R ${mm(shape.radius)}`;
    case 'curve-length':
      return `${mm(shape.length)} mm along the curve`;
    case 'angle': {
      const { sweep } = angleSweep(shape.vertex, shape.start, shape.end);
      return `Vertex ${pt(shape.vertex)} · ${(sweep * 180 / Math.PI).toFixed(1)}°`;
    }
    case 'rect':
      return `${pt(shape.p1)} → ${pt(shape.p2)} · ${mm(Math.abs(shape.p2.x - shape.p1.x))} × ${mm(Math.abs(shape.p2.y - shape.p1.y))} mm`;
    case 'point':
    case 'text':
      return pt(shape.position);
    default: {
      const b = shapeBounds(shape);
      return `${pt({ x: b.x0, y: b.y0 })} → ${pt({ x: b.x1, y: b.y1 })} · ${mm(b.x1 - b.x0)} × ${mm(b.y1 - b.y0)} mm`;
    }
  }
}
