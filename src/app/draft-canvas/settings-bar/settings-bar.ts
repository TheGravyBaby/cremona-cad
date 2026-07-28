import { Component, Input } from '@angular/core';
import { inject } from '@angular/core';
import { DraftTool } from '../tools/draft-tool';
import { ToolboxStore } from '../tools/toolbox-store';
import {
  DraftShape, LineShape, DimensionShape, RectShape, TextShape, PointShape, CircleShape, ArcShape, BoxLineShape,
} from '../tools/toolbox-shape';

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
    line: 'Line', arc: 'Arc', circle: 'Circle', dimension: 'Distance', rect: 'Box', boxline: 'Box Line', text: 'Text', point: 'Point',
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

  /** Line/Dimension both share start+end geometry — editable numerically once a shape is selected. */
  private get selectedLineLikeShape(): LineShape | DimensionShape | undefined {
    const s = this.selectedShape;
    return (s?.type === 'line' || s?.type === 'dimension') ? s : undefined;
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

  /** Angle fields are edited in degrees for readability; stored in radians, matching arc-geometry.ts's convention. */
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
   * showArcPanel), same reasoning as showBoxLineColor2. */
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

  /** Box Line has extra per-shape settings (a second color + segment weights) that don't fit the single color swatch. */
  public get showBoxLinePanel(): boolean {
    return this.activeTool?.id === 'boxline' || this.selectedShape?.type === 'boxline';
  }

  private get selectedBoxLineShape(): BoxLineShape | undefined {
    return this.selectedShapeOfType('boxline');
  }

  /** Every Box Line in the current selection, however many — unlike selectedBoxLineShape (only
   * set for exactly one), this drives Color2 so it stays group-editable across a multi-selection,
   * the same way the primary color swatch is. */
  private get selectedBoxLineShapes(): BoxLineShape[] {
    return this.selectedShapes.filter((s): s is BoxLineShape => s.type === 'boxline');
  }

  /** Broader than showBoxLinePanel: Color2 also shows for a multi-selection of Box Lines (whose
   * individual X/Y/weights controls don't make sense as a group and stay gated behind
   * showBoxLinePanel), same reasoning as the primary color swatch's showColorSwatch. */
  public get showBoxLineColor2(): boolean {
    return this.activeTool?.id === 'boxline' || this.selectedBoxLineShapes.length > 0;
  }

  /** Unlike showBoxLinePanel, the endpoints only make sense for an actual selected shape —
   * there's no "pen position" the way there's a pen color/weights default. */
  public get showBoxLinePointsPanel(): boolean {
    return !!this.selectedBoxLineShape;
  }

  public get boxLineStartX(): number { return this.round2(this.selectedBoxLineShape?.start.x ?? 0); }
  public get boxLineStartY(): number { return this.round2(this.selectedBoxLineShape?.start.y ?? 0); }
  public get boxLineEndX(): number { return this.round2(this.selectedBoxLineShape?.end.x ?? 0); }
  public get boxLineEndY(): number { return this.round2(this.selectedBoxLineShape?.end.y ?? 0); }

  setBoxLinePoint(which: 'start' | 'end', axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedBoxLineShape, which, axis, value);
  }

  /** First selected Box Line's color2 (same "first wins" convention as displayedColor when the
   * group has mixed values — a native color <input> can't show "mixed"), otherwise the pen default. */
  public get displayedBoxLineColor2(): string {
    return this.selectedBoxLineShapes[0]?.color2 ?? this.toolbox.currentBoxLineColor2;
  }

  public get displayedBoxLineWeightsText(): string {
    const shape = this.selectedShape;
    const weights = (shape?.type === 'boxline' ? shape.weights : undefined) ?? this.toolbox.currentBoxLineWeights;
    return weights.join(',');
  }

  /** Segment count when using the "equal segments" input mode — just the number of weights,
   * since that mode only ever produces equal (all-1) weights; see setBoxLineSegmentCount. */
  public get displayedBoxLineSegmentCount(): number {
    const shape = this.selectedShape;
    const weights = (shape?.type === 'boxline' ? shape.weights : undefined) ?? this.toolbox.currentBoxLineWeights;
    return weights.length;
  }

  /** Toggles the Weights row between a free-form comma list and a simple equal-segment count —
   * pure UI/input-mode state, not persisted per-shape, so switching shapes doesn't reset it. */
  public boxLineUseSegmentCount = false;

  /** Applies to every selected Box Line at once (one history step via updateShapes), same as setColor. */
  setBoxLineColor2(color: string): void {
    this.toolbox.currentBoxLineColor2 = color;
    const shapes = this.selectedBoxLineShapes;
    if (shapes.length === 0) return;
    const patches = new Map<string, Partial<DraftShape>>(shapes.map(s => [s.id, { color2: color }]));
    this.toolbox.updateShapes(patches);
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

  /** Equal-segments mode: N segments all weighted 1 — e.g. 16 for showing sixteenths, without
   * typing out "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1" by hand. */
  setBoxLineSegmentCount(count: number): void {
    const n = Math.round(count);
    if (!Number.isFinite(n) || n < 1) return;
    const weights = new Array(n).fill(1);
    this.toolbox.currentBoxLineWeights = weights;
    const shape = this.selectedShape;
    if (shape?.type === 'boxline') {
      this.toolbox.updateShape(shape.id, { weights });
    }
  }
}
