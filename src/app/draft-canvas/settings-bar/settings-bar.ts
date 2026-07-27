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

  /** Narrows the current selection to one shape type, for a settings panel's own `selectedXShape` getter. */
  private selectedShapeOfType<T extends DraftShape['type']>(type: T): Extract<DraftShape, { type: T }> | undefined {
    const s = this.selectedShape;
    return s?.type === type ? (s as Extract<DraftShape, { type: T }>) : undefined;
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

  /** Nothing to tint if there's neither an active drawing tool nor a selected shape. */
  public get showColorSwatch(): boolean {
    return !!this.activeTool || !!this.selectedShape;
  }

  /** Whether the bar has anything at all to show — used to hide the whole strip (rather than
   * render an empty, oddly-backgrounded box) when there's no active tool and no selection. */
  public get hasContent(): boolean {
    return this.showColorSwatch;
  }

  /** Shows the selected shape's color when something's selected, otherwise the pen color new shapes will use. */
  public get displayedColor(): string {
    return this.selectedShape?.color ?? this.toolbox.currentColor;
  }

  setColor(color: string): void {
    this.toolbox.currentColor = color;
    if (this.selectedShape) {
      this.toolbox.updateShape(this.selectedShape.id, { color });
    }
  }

  /** Line/Dimension both share start+end geometry — editable numerically once a shape is selected. */
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
    this.patchPointField(this.selectedLineLikeShape, which, axis, value);
  }

  /** Dashed is a pen setting (like currentColor), not a separate tool — Dimension doesn't get
   * one, since only plain Line ever did (there was never a "Dotted Dimension"). */
  private get selectedLineShape(): LineShape | undefined {
    return this.selectedShapeOfType('line');
  }

  public get showLineDashedToggle(): boolean {
    return this.activeTool?.id === 'line' || !!this.selectedLineShape;
  }

  public get lineDashed(): boolean {
    return this.selectedLineShape?.dashed ?? this.toolbox.currentDashed;
  }

  setLineDashed(value: boolean): void {
    this.toolbox.currentDashed = value;
    const shape = this.selectedLineShape;
    if (shape) {
      this.toolbox.updateShape(shape.id, { dashed: value });
    }
  }

  /** Rect and Square both commit as a 'rect' shape (p1/p2 corners) — same panel edits either. */
  private get selectedRectShape(): RectShape | undefined {
    return this.selectedShapeOfType('rect');
  }

  public get showRectPanel(): boolean {
    return !!this.selectedRectShape;
  }

  public get rectP1X(): number { return this.selectedRectShape?.p1.x ?? 0; }
  public get rectP1Y(): number { return this.selectedRectShape?.p1.y ?? 0; }
  public get rectP2X(): number { return this.selectedRectShape?.p2.x ?? 0; }
  public get rectP2Y(): number { return this.selectedRectShape?.p2.y ?? 0; }

  setRectPoint(which: 'p1' | 'p2', axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedRectShape, which, axis, value);
  }

  /** Dashed is a pen setting (like currentColor), not a separate tool — shared with
   * Line/Circle's currentDashed, same as currentColor is shared across every shape type. */
  public get showRectDashedToggle(): boolean {
    return this.activeTool?.id === 'rect' || !!this.selectedRectShape;
  }

  public get rectDashed(): boolean {
    return this.selectedRectShape?.dashed ?? this.toolbox.currentDashed;
  }

  setRectDashed(value: boolean): void {
    this.toolbox.currentDashed = value;
    const shape = this.selectedRectShape;
    if (shape) {
      this.toolbox.updateShape(shape.id, { dashed: value });
    }
  }

  private get selectedTextShape(): TextShape | undefined {
    return this.selectedShapeOfType('text');
  }

  public get showTextPanel(): boolean {
    return !!this.selectedTextShape;
  }

  public get textPositionX(): number { return this.selectedTextShape?.position.x ?? 0; }
  public get textPositionY(): number { return this.selectedTextShape?.position.y ?? 0; }
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

  public get pointPositionX(): number { return this.selectedPointShape?.position.x ?? 0; }
  public get pointPositionY(): number { return this.selectedPointShape?.position.y ?? 0; }

  setPointPosition(axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedPointShape, 'position', axis, value);
  }

  private get selectedCircleShape(): CircleShape | undefined {
    return this.selectedShapeOfType('circle');
  }

  public get showCirclePanel(): boolean {
    return !!this.selectedCircleShape;
  }

  public get circleCenterX(): number { return this.selectedCircleShape?.center.x ?? 0; }
  public get circleCenterY(): number { return this.selectedCircleShape?.center.y ?? 0; }
  public get circleRadius(): number { return this.selectedCircleShape?.radius ?? 0; }

  setCircleCenter(axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedCircleShape, 'center', axis, value);
  }

  setCircleRadius(value: number): void {
    this.patchNumberField(this.selectedCircleShape, 'radius', value, { validate: v => v > 0 });
  }

  /** Dashed is a pen setting (like currentColor), not a separate tool — shared with Line's
   * currentDashed, same as currentColor is shared across every shape type. */
  public get showCircleDashedToggle(): boolean {
    return this.activeTool?.id === 'circle' || !!this.selectedCircleShape;
  }

  public get circleDashed(): boolean {
    return this.selectedCircleShape?.dashed ?? this.toolbox.currentDashed;
  }

  setCircleDashed(value: boolean): void {
    this.toolbox.currentDashed = value;
    const shape = this.selectedCircleShape;
    if (shape) {
      this.toolbox.updateShape(shape.id, { dashed: value });
    }
  }

  private get selectedArcShape(): ArcShape | undefined {
    return this.selectedShapeOfType('arc');
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

  /** "Compass": keeps the center point and dashed radius guides permanently visible on the committed arc. */
  public get arcShowCenterGuides(): boolean {
    return this.selectedArcShape?.showCenterGuides ?? false;
  }

  setArcShowCenterGuides(value: boolean): void {
    const shape = this.selectedArcShape;
    if (!shape) return;
    this.toolbox.updateShape(shape.id, { showCenterGuides: value } as Partial<DraftShape>);
  }

  /** Box Line has extra per-shape settings (a second color + segment weights) that don't fit the single color swatch. */
  public get showBoxLinePanel(): boolean {
    return this.activeTool?.id === 'boxline' || this.selectedShape?.type === 'boxline';
  }

  private get selectedBoxLineShape(): BoxLineShape | undefined {
    return this.selectedShapeOfType('boxline');
  }

  /** Unlike showBoxLinePanel, the endpoints only make sense for an actual selected shape —
   * there's no "pen position" the way there's a pen color/weights default. */
  public get showBoxLinePointsPanel(): boolean {
    return !!this.selectedBoxLineShape;
  }

  public get boxLineStartX(): number { return this.selectedBoxLineShape?.start.x ?? 0; }
  public get boxLineStartY(): number { return this.selectedBoxLineShape?.start.y ?? 0; }
  public get boxLineEndX(): number { return this.selectedBoxLineShape?.end.x ?? 0; }
  public get boxLineEndY(): number { return this.selectedBoxLineShape?.end.y ?? 0; }

  setBoxLinePoint(which: 'start' | 'end', axis: 'x' | 'y', value: number): void {
    this.patchPointField(this.selectedBoxLineShape, which, axis, value);
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
