import { Component, Input } from '@angular/core';
import { inject } from '@angular/core';
import { DraftTool } from '../tools/draft-tool';
import { ToolboxStore } from '../tools/toolbox-store';
import {
  DraftShape, LineShape, DimensionShape, RectShape, TextShape, PointShape, CircleShape, ArcShape, SectionShape,
  FreehandShape, ImageShape, DEFAULT_IMAGE_OPACITY, DEFAULT_SHAPE_COLOR, DEFAULT_FREEHAND_WIDTH,
} from '../tools/toolbox-shape';
import { normalizeDegrees, pointAtDistanceToward } from '../../helpers/draftMath';

/**
 * The Inkscape-style contextual settings strip along the bottom bar: color, then whichever
 * shape-type panel's numeric fields apply (based on the active tool or the current selection),
 * then simple toggles (Dashed, Compass, Equal segments). Everything here is a thin wrapper
 * around ToolboxStore — draft-canvas.ts only needs to pass down activeTool/selectedShape.
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

  @Input() activeTool: DraftTool | null = null;
  @Input() selectedShape: DraftShape | undefined = undefined;
  /** The full selection, however many shapes — unlike `selectedShape` (only set for exactly
   * one), this drives group-editable settings like color that apply across a multi-selection. */
  @Input() selectedShapes: DraftShape[] = [];

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
    return this.showColorSwatch;
  }

  /** Friendly name for each shape type, used by groupTitle when the settings reflect a selection. */
  private static readonly SHAPE_TYPE_LABELS: Record<DraftShape['type'], string> = {
    line: 'Line', arc: 'Arc', circle: 'Circle', dimension: 'Distance', rect: 'Box', section: 'Section', text: 'Text', point: 'Point',
    freehand: 'Drawing', image: 'Reference Image',
  };

  /** Heading shown above the settings strip so it's clear what "Color"/"Dashed"/etc. apply to —
   * the selection's shape type when something's selected (uniform type, or "Selection" when
   * mixed), otherwise the active drawing tool's own label. Undefined exactly when hasContent is
   * false, so there's never a heading over an empty bar. */
  public get groupTitle(): string | undefined {
    if (this.selectedShapes.length > 0) {
      const types = new Set(this.selectedShapes.map(s => s.type));
      const label = types.size === 1
        ? SettingsBarComponent.SHAPE_TYPE_LABELS[this.selectedShapes[0].type]
        : 'Selection';
      return `${label} Settings`;
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

  /** Dashed applies to Line, Rect and Circle — a shared pen setting (like currentColor), not a
   * per-tool one, so it's one common control rather than three near-identical toggles. */
  private static readonly DASHABLE_TOOL_IDS = new Set(['line', 'rect', 'circle']);

  private get selectedDashableShapes(): (LineShape | RectShape | CircleShape)[] {
    return this.selectedShapes.filter(
      (s): s is LineShape | RectShape | CircleShape => s.type === 'line' || s.type === 'rect' || s.type === 'circle');
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

  /** Line, Dimension and Section all carry the same start+end geometry, so one panel edits any of
   * them numerically once a shape is selected — Section's own panel further down adds only the
   * controls unique to it (weights/count). Unlike the pen color there's no "pen position" default,
   * so none of this shows for a merely-active tool. */
  private get selectedLineLikeShape(): LineShape | DimensionShape | SectionShape | undefined {
    const s = this.selectedShape;
    return (s?.type === 'line' || s?.type === 'dimension' || s?.type === 'section') ? s : undefined;
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

  public get showTextPanel(): boolean {
    return !!this.selectedTextShape;
  }

  public get textPositionX(): number { return this.round2(this.selectedTextShape?.position.x ?? 0); }
  public get textPositionY(): number { return this.round2(this.selectedTextShape?.position.y ?? 0); }
  public get textContent(): string { return this.selectedTextShape?.text ?? ''; }

  setTextPosition(axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedTextShape, 'position', axis, value);
  }

  setTextContent(text: string): void {
    const shape = this.selectedTextShape;
    if (!shape) return;
    this.toolbox.updateShape(shape.id, { text });
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
   * Freehand selection — same condition shape as showSectionPanel. */
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

  /** Angle fields are edited in degrees for readability; stored in radians, matching arcPathData's convention in helpers/draftMath.ts. */
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

  /** Section has extra per-shape settings (a second color + segment weights) that don't fit the single color swatch. */
  public get showSectionPanel(): boolean {
    return this.activeTool?.id === 'section' || this.selectedShape?.type === 'section';
  }

  /** Every Section in the current selection, however many — this drives Color2 so it stays
   * group-editable across a multi-selection, the same way the primary color swatch is. */
  private get selectedSectionShapes(): SectionShape[] {
    return this.selectedShapes.filter((s): s is SectionShape => s.type === 'section');
  }

  /** Broader than showSectionPanel: Color2 also shows for a multi-selection of Sections (whose
   * individual X/Y/weights controls don't make sense as a group and stay gated behind
   * showSectionPanel), same reasoning as the primary color swatch's showColorSwatch. */
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

  public get displayedSectionWeightsText(): string {
    const shape = this.selectedShape;
    const weights = (shape?.type === 'section' ? shape.weights : undefined) ?? this.toolbox.currentSectionWeights;
    return weights.join(',');
  }

  /** Segment count when using the "equal segments" input mode — just the number of weights,
   * since that mode only ever produces equal (all-1) weights; see setSectionSegmentCount. */
  public get displayedSectionSegmentCount(): number {
    const shape = this.selectedShape;
    const weights = (shape?.type === 'section' ? shape.weights : undefined) ?? this.toolbox.currentSectionWeights;
    return weights.length;
  }

  /** Toggles the Weights row between a free-form comma list and a simple equal-segment count —
   * pure UI/input-mode state, not persisted per-shape, so switching shapes doesn't reset it. */
  public sectionUseSegmentCount = false;

  /** Applies to every selected Section at once (one history step via updateShapes), same as setColor. */
  setSectionColor2(color: string): void {
    this.toolbox.currentSectionColor2 = color;
    const shapes = this.selectedSectionShapes;
    if (shapes.length === 0) return;
    const patches = new Map<string, Partial<DraftShape>>(shapes.map(s => [s.id, { color2: color }]));
    this.toolbox.updateShapes(patches);
  }

  setSectionWeightsText(text: string): void {
    const weights = text.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
    if (weights.length === 0) return;
    this.toolbox.currentSectionWeights = weights;
    const shape = this.selectedShape;
    if (shape?.type === 'section') {
      this.toolbox.updateShape(shape.id, { weights });
    }
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

  /** Width and height are independent here, unlike a corner-handle drag — typing an exact
   * dimension is how you scale a photo to a real measurement, which is the whole point of a
   * reference image and would be defeated by silently correcting the other axis. */
  setImageSize(key: 'width' | 'height', value: number): void {
    this.patchNumberField(this.selectedImageShape, key, value, { validate: v => v > 0 });
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
  setSectionSegmentCount(count: number): void {
    const n = Math.round(count);
    if (!Number.isFinite(n) || n < 1) return;
    const weights = new Array(n).fill(1);
    this.toolbox.currentSectionWeights = weights;
    const shape = this.selectedShape;
    if (shape?.type === 'section') {
      this.toolbox.updateShape(shape.id, { weights });
    }
  }
}
