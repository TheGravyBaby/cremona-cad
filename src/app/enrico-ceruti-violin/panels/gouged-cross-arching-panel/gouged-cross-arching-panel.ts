import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Circle, Pt, Rectangle } from '../../../models/types';
import {
  renderCircle, renderCrosshair, renderLine, renderMeasure, renderPath, renderPointHalo, renderRect,
} from '../../../helpers/renderFuncs';
import { clamp } from '../../../helpers/draftMath';
import { samplePathToPolyline } from '../../../helpers/svgPathMath';
import {
  ArchingParams, CerutiColors, CerutiViewFlags, EnricoCerutiParams, GougedCrossCycloidParams,
  GougedCrossParams, GougedCrossPoint, GougedCrossShape, GougedCrossSplineParams, GougedFlutingParams,
  PlateViewMode,
} from '../../ceruti-types';
import {
  contourSampleSteps, defaultArchingParams, innerHalfWidthAtY, outerHalfWidthAtY, wireframeSampleSteps,
} from '../../ceruti-arching';
import {
  defaultGougedCrossCycloidParams, defaultGougedCrossParams, defaultGougedFlutingParams, GougedCrossSection,
  gougedCrossGuide, gougedCrossSectionAt, gougedCrossSectionPath,
} from '../../ceruti-gouged';
import {
  ArchContourLevel, buildGougedPlateSurfaceModel, buildPlateStl, computeArchContourRings, PlateSurfaceModel,
} from '../../ceruti-surface';
import { downloadStlFile } from '../../../helpers/stlExporter';
import {
  computeArchContourBounds, projectArchContourRings, projectFlatPolyline, renderArchContours3d,
} from '../../renders/arch-contours.render';
import {
  computeSingleWireframeStrip, computeWireframeBounds, computeWireframeGeometry, projectWireframe,
  renderArch3dWireframe, WireframeGeometry,
} from '../../renders/arch-3d-wireframe.render';
import { renderWireframeDragFrame } from '../../renders/wireframe-drag-frame.render';
import { calculateOuterArcs } from '../../ceruti-calcs';
import { defineOuterPath } from '../../ceruti-paths';
import {
  archContoursInfo, crossSectionStationInfo, gougedCrossCurveTypeInfo, gougedCrossCycloidControlsInfo,
  gougedCrossTemplateInfo, gougedTransitionError,
} from '../../ceruti-helpers';
import { CrossArchingRotationController } from '../cross-arching-panel/cross-arching-rotation-controller';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

/**
 * Step three of the gouged model: the crown across the plate, as a trochoid or
 * as control points.
 *
 * The maker authors only the crown, in fractions of it. Where it stops — the
 * run out into the channel — is solved, not entered, which is what keeps this
 * model from costing more parameters than the classic one despite describing a
 * more physical process. The panel therefore *reports* the transition rather
 * than offering it for editing.
 *
 * Stations are deliberately absent for now: one template per plate, applying
 * everywhere. The resolver behind this already ramps between stations when they
 * exist, so adding them later is a panel change rather than a model change.
 */
@Component({
  selector: 'app-ceruti-gouged-cross-arching-panel',
  imports: [FormsModule],
  templateUrl: './gouged-cross-arching-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class GougedCrossArchingPanel extends CerutiPanelBase implements OnInit, OnDestroy {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly crossSectionStationInfo = crossSectionStationInfo;
  protected readonly gougedCrossCurveTypeInfo = gougedCrossCurveTypeInfo;
  protected readonly gougedCrossCycloidControlsInfo = gougedCrossCycloidControlsInfo;
  protected readonly gougedCrossTemplateInfo = gougedCrossTemplateInfo;
  protected readonly archContoursInfo = archContoursInfo;

  /** Solved section at the cursor per plate, filled by buildRun for the template to report. */
  private section: { top: GougedCrossSection | null; bottom: GougedCrossSection | null } = { top: null, bottom: null };

  /** Whether each plate's last solved station failed to reach its channel — the edge the warning fires on. */
  private unsolvable = { top: false, bottom: false };

  private highlightedPlate: 'top' | 'bottom' | null = null;
  private highlightedIndex = -1;

  private rotation: CrossArchingRotationController | null = null;

  /**
   * The gouged surface is markedly costlier to sample than the classic one — a
   * root-find per side per station row — so the model, its contour rings and
   * its wireframe strips are each cached against a params snapshot. All three
   * depend only on params, which is what lets a rotation drag re-project
   * without re-solving anything.
   */
  private cache: {
    key: string;
    model: { top: PlateSurfaceModel | null; bottom: PlateSurfaceModel | null };
    contours: { top: { levels: ArchContourLevel[]; outline: Pt[] | null } | null; bottom: { levels: ArchContourLevel[]; outline: Pt[] | null } | null };
    wireframe: { top: WireframeGeometry | null; bottom: WireframeGeometry | null };
  } | null = null;

  ngOnInit(): void {
    // Ephemeral view state; default to the c-bout waist on first open, matching
    // the classic cross-arching panel.
    this.flags.crossSectionY ??= Math.round(this.params.bouts.C0?.y ?? this.params.height / 2);
    this.rotation = new CrossArchingRotationController(this.flags, () => this.emitImmediate(false, false));
    this.emitImmediate();
  }

  ngOnDestroy(): void {
    this.rotation?.dispose();
  }

  /**
   * Toggles a plate's overlay: clicking the active mode turns it off, clicking
   * the other switches to it. Only one plate may show one at a time — the
   * contour and wireframe sampling is one-at-a-time across both plates, not
   * just within one.
   */
  togglePlateView(plate: 'top' | 'back', mode: PlateViewMode): void {
    const key = plate === 'top' ? 'topPlateView' : 'backPlateView';
    const otherKey = plate === 'top' ? 'backPlateView' : 'topPlateView';
    const next = this.flags[key] === mode ? 'none' : mode;
    this.flags[key] = next;
    if (next !== 'none') this.flags[otherKey] = 'none';
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  get arching(): ArchingParams { return this.params.arching!; }

  get cursorY(): number {
    return clamp(this.flags.crossSectionY ?? 0, 1, this.params.height - 1);
  }

  setCursorY(mm: number): void {
    this.flags.crossSectionY = clamp(mm || 0, 1, this.params.height - 1);
    this.onChange();
  }

  gouge(plate: 'top' | 'bottom'): GougedFlutingParams {
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    return (plateParams.gougedFluting ??= defaultGougedFlutingParams(this.params));
  }

  cross(plate: 'top' | 'bottom'): GougedCrossParams {
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    return (plateParams.gougedCross ??= defaultGougedCrossParams());
  }

  /** The plate's template when it is authored from control points, else null — the template editor's guard. */
  crossSpline(plate: 'top' | 'bottom'): GougedCrossSplineParams | null {
    const cross = this.cross(plate);
    return cross.type === 'gouged' ? cross : null;
  }

  /** The plate's template when it is a trochoid, else null. */
  crossCycloid(plate: 'top' | 'bottom'): GougedCrossCycloidParams | null {
    const cross = this.cross(plate);
    return cross.type === 'gouged-cycloid' ? cross : null;
  }

  /**
   * Switches a plate's crown curve type, replacing the shape wholesale with a
   * fresh default — the same thing the classic cross-arching panel's own
   * `setCurveType` does, and for the same reason: `d`/`pct` and a control-point
   * list describe the shape in ways that have no honest conversion between
   * them, so carrying one across would be inventing data. Stations go with it,
   * since a station's shape is tied to its curve type.
   */
  setCurveType(plate: 'top' | 'bottom', type: GougedCrossShape['type']): void {
    if (this.cross(plate).type === type) return;
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    plateParams.gougedCross = type === 'gouged-cycloid'
      ? defaultGougedCrossCycloidParams()
      : defaultGougedCrossParams();
    this.onChange();
  }

  /** The trochoid window as a whole percent, for the panel's input. */
  cycloidPct(plate: 'top' | 'bottom'): number {
    return Math.round((this.crossCycloid(plate)?.pct ?? 0) * 100);
  }

  setCycloidD(plate: 'top' | 'bottom', d: number): void {
    const shape = this.crossCycloid(plate);
    if (!shape) return;
    shape.d = clamp(d || 0, 0, 1);
    this.onChange();
  }

  /**
   * Sets the trochoid window. Held below 100% deliberately, unlike the classic
   * panel: the full curve leaves the baseline tangent-flat, and a crown that
   * runs out flat can only meet the gouge where the gouge is flat too — its
   * trough. The tangency then has nowhere to slide, and the arch drops the full
   * channel depth in one unsupported step. Some grade at the run-out is what
   * gives the solve a contact point to find.
   */
  setCycloidPct(plate: 'top' | 'bottom', pct: number): void {
    const shape = this.crossCycloid(plate);
    if (!shape) return;
    shape.pct = clamp(pct || 0, 5, 98) / 100;
    this.onChange();
  }

  // ===== Template editing =====

  /** A knot's position as a signed whole percent of the local half-width, for the panel's input. */
  pointXPct(pt: GougedCrossPoint): number {
    return Math.round(pt.x * 100);
  }

  /** A knot's height as a whole percent of the local arch height. */
  pointZPct(pt: GougedCrossPoint): number {
    return Math.round(pt.z * 100);
  }

  /**
   * Sets a knot's position across the plate, as a percent of this side's own
   * crown: 0 is the peak, ±100 the takeoff where the crown runs into the
   * channel. Negative is the bass side. Held off both ends — the peak owns the
   * centerline, and the takeoff is solved rather than authored.
   */
  setPointXPct(plate: 'top' | 'bottom', pt: GougedCrossPoint, pct: number): void {
    const v = pct || 0;
    const mag = clamp(Math.abs(v), 2, 99) / 100;
    pt.x = (v < 0 ? -1 : 1) * mag;
    this.crossSpline(plate)?.points.sort((a, b) => a.x - b.x);
    this.onChange();
  }

  /**
   * Sets a knot's height as a percent of the local arch height. 100 is the
   * ceiling because the crown always sits at the full height — a taller knot
   * would quietly become the real high spot and the entered arch height would
   * stop describing the plate, the same invariant the classic spline arches
   * carry.
   */
  setPointZPct(plate: 'top' | 'bottom', pt: GougedCrossPoint, pct: number): void {
    pt.z = clamp(pct || 0, 0, 100) / 100;
    this.onChange();
  }

  toggleMirror(pt: GougedCrossPoint): void {
    pt.mirror = !pt.mirror;
    this.onChange();
  }

  addPoint(plate: 'top' | 'bottom'): void {
    const cross = this.crossSpline(plate);
    if (!cross) return;
    // Partway on toward the channel from the outermost knot, at a fraction of
    // its height — a plausible next knot outward rather than one landing on top
    // of an existing one.
    const outermost = cross.points.reduce((m, p) => Math.max(m, Math.abs(p.x)), 0);
    const outer = cross.points.find(p => Math.abs(p.x) === outermost);
    const x = outermost > 0 ? clamp((outermost + 1) / 2, 0.02, 0.99) : 0.5;
    cross.points.push({ x: +x.toFixed(2), z: +((outer?.z ?? 1) * 0.5).toFixed(2), mirror: true });
    cross.points.sort((a, b) => a.x - b.x);
    this.onChange();
  }

  removePoint(plate: 'top' | 'bottom', index: number): void {
    this.crossSpline(plate)?.points.splice(index, 1);
    this.onChange();
  }

  onPointFocus(plate: 'top' | 'bottom', index: number): void {
    this.highlightedPlate = plate;
    this.highlightedIndex = index;
    this.emitImmediate(false);
  }

  onPointBlur(): void {
    this.highlightedPlate = null;
    this.emitImmediate(false);
  }

  // ===== Render =====

  protected buildRun(): RenderLayer[] {
    this.params.arching ??= defaultArchingParams(this.params.height);
    // The channel offsets and plate slabs chord the outer arcs, which must be current.
    calculateOuterArcs(this.params);

    // Snapshot taken after calculateOuterArcs so the key is deterministic.
    const key = JSON.stringify(this.params);
    if (this.cache?.key !== key) {
      this.cache = {
        key,
        model: { top: buildGougedPlateSurfaceModel(this.params, 'top'), bottom: buildGougedPlateSurfaceModel(this.params, 'bottom') },
        contours: { top: null, bottom: null },
        wireframe: { top: null, bottom: null },
      };
    }

    const y = this.cursorY;
    for (const plate of ['top', 'bottom'] as const) {
      const gouged = this.cache.model[plate]?.gouged;
      this.section[plate] = gouged ? gougedCrossSectionAt(this.params, gouged, y) : null;
      this.reportTransition(plate, y);
    }

    return [this.sectionView(y), ...this.overlayLayers(y)];
  }

  /**
   * Raises the unmeetable-channel warning, once per time the condition arrives.
   *
   * Edge-triggered rather than raised whenever it holds, because `buildRun` runs
   * on every keystroke and on every frame of a rotation drag — a popup re-raised
   * at that rate would keep resetting its own dismissal timer and never clear.
   *
   * The flag resets on a station that solves, so stepping the cursor out of a
   * bad region and back in warns again. That is the behaviour worth having: the
   * message is about the station being looked at, not a standing property of the
   * recipe, and the same plate can be fine at the waist and impossible at the
   * cap.
   */
  private reportTransition(plate: 'top' | 'bottom', y: number): void {
    const section = this.section[plate];
    const unsolvable = !!section && (!section.left || !section.right);
    if (unsolvable === this.unsolvable[plate]) return;
    this.unsolvable[plate] = unsolvable;
    if (unsolvable) gougedTransitionError(plate, y);
  }

  /**
   * Contour map or oblique wireframe above the section, whichever the flags
   * ask for. Every piece of this is the classic panel's — the ring builder, the
   * projection, the renderers and the drag frame all take a
   * {@link PlateSurfaceModel} and never ask which model filled it in.
   */
  private overlayLayers(y: number): RenderLayer[] {
    const p = this.params;
    const a = this.arching;
    const c = this.cache!;
    const layers: RenderLayer[] = [];
    // Lifts the overlay clear of the section view below it.
    const yOffset = a.ribHeight + a.top.thickness + a.top.arch.archHeight + 15;
    const rotX = this.flags.plateRotXDeg ?? 0;
    const rotY = this.flags.plateRotYDeg ?? 0;
    const rotZ = this.flags.plateRotZDeg ?? 0;
    const drag = { active: this.rotation?.isDragging ?? false, onPointerDown: this.rotation?.onPointerDown ?? (() => {}) };

    for (const plate of ['top', 'bottom'] as const) {
      const mode = plate === 'top' ? this.flags.topPlateView : this.flags.backPlateView;
      const model = c.model[plate];
      if (mode === 'none' || !model) continue;
      const zSign: 1 | -1 = plate === 'top' ? 1 : -1;
      const color = plate === 'top' ? this.colors.archTop : this.colors.archBack;
      const arch = plate === 'top' ? a.top.arch : a.bottom.arch;

      if (mode === 'contours') {
        if (!c.contours[plate]) {
          const { stepMm, gridMm } = contourSampleSteps(p, arch.archHeight);
          c.contours[plate] = {
            levels: computeArchContourRings(p, model, stepMm, gridMm),
            outline: samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, plate === 'bottom'), 1),
          };
        }
        const cached = c.contours[plate]!;
        const levels = projectArchContourRings(cached.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, zSign);
        const outline = cached.outline
          ? projectFlatPolyline(cached.outline, p.height, yOffset, rotX, rotY, rotZ, 1, 0, zSign)
          : null;
        layers.push(renderArchContours3d(this.colors, levels, outline, color));
        layers.push(renderWireframeDragFrame(
          computeArchContourBounds(cached.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, zSign),
          this.colors, drag.active, drag.onPointerDown,
        ));
      } else {
        const { stationStepMm, sampleStepMm } = wireframeSampleSteps(p);
        c.wireframe[plate] ??= computeWireframeGeometry(p, model, stationStepMm, sampleStepMm);
        const wf = c.wireframe[plate]!;
        const projected = projectWireframe(wf, p.height, yOffset, rotX, rotY, rotZ, 1, 0, zSign);
        const highlight = computeSingleWireframeStrip(p, model, y, yOffset, rotX, rotY, rotZ, 1, sampleStepMm, 0, zSign);
        layers.push(renderArch3dWireframe(this.colors, projected.strips, projected.ribs, highlight, color));
        layers.push(renderWireframeDragFrame(
          computeWireframeBounds(wf, p.height, yOffset, rotX, rotY, rotZ, 1, 0, zSign),
          this.colors, drag.active, drag.onPointerDown,
        ));
      }
    }
    return layers;
  }

  /**
   * The transverse section at the cursor, both plates in one frame — the same
   * arrangement the classic cross-arching panel uses, since these are two faces
   * of one instrument rather than two things to compare.
   */
  private sectionView(y: number): RenderLayer {
    const p = this.params;
    const a = this.arching;
    const innerHalf = innerHalfWidthAtY(p, y);
    const outerHalf = outerHalfWidthAtY(p, y) ?? 0;

    return (g: any, ui: any): void => {
      if (innerHalf !== null) {
        renderRect(
          new Rectangle({ x: -(innerHalf + p.rib), y: 0 }, { x: innerHalf + p.rib, y: a.ribHeight }),
          this.colors.mouldTrace,
        )(g, ui);
        for (const sx of [-1, 1]) {
          renderLine(new Pt(sx * innerHalf, 0), new Pt(sx * innerHalf, a.ribHeight), this.colors.innerTrace)(g, ui);
        }
      }
      this.platePart(g, ui, 'top', outerHalf);
      this.platePart(g, ui, 'bottom', outerHalf);
    };
  }

  private platePart(g: any, ui: any, plate: 'top' | 'bottom', outerHalf: number): void {
    const a = this.arching;
    const isTop = plate === 'top';
    const sign: 1 | -1 = isTop ? 1 : -1;
    const thickness = isTop ? a.top.thickness : a.bottom.thickness;
    const innerZ = isTop ? a.ribHeight : 0;
    const zBase = innerZ + sign * thickness;
    const color = isTop ? this.colors.archTop : this.colors.archBack;
    const section = this.section[plate];

    // Plate underside, flat across the section, and the thickness at each edge.
    renderLine(new Pt(-outerHalf, innerZ), new Pt(outerHalf, innerZ), this.colors.innerTrace)(g, ui);
    for (const side of [1, -1] as const) {
      renderLine(new Pt(side * outerHalf, innerZ), new Pt(side * outerHalf, zBase), this.colors.innerTrace)(g, ui);
    }
    if (!section) return;

    // Split by what carved it, the way the classic panel does: the flat land
    // and the plate edges in the trace colour, the gouged channel in the
    // fluting colour, the arch in the plate's own. The surface is still one
    // continuous function — the contact is only where the pen changes.
    const landEdge = section.centerHalf + section.halfWidth;
    for (const side of [1, -1] as const) {
      renderLine(new Pt(side * outerHalf, zBase), new Pt(side * Math.min(landEdge, outerHalf), zBase), this.colors.innerTrace)(g, ui);
    }
    renderPath(gougedCrossSectionPath(section, section.xEndRight, landEdge, zBase, sign), this.colors.fluting, 1.5)(g, ui);
    renderPath(gougedCrossSectionPath(section, -landEdge, -section.xEndLeft, zBase, sign), this.colors.fluting, 1.5)(g, ui);
    renderPath(gougedCrossSectionPath(section, -section.xEndLeft, section.xEndRight, zBase, sign), color, 1.5)(g, ui);

    if (this.highlightedPlate === plate) {
      // Knots are fractions of this station's own crown, so they only become
      // screen positions once scaled by where that crown ends.
      for (const x of this.highlightKnots(plate, section)) {
        renderPointHalo(new Pt(x, zBase + sign * section.zAt(x)), color)(g, ui);
      }
    }

    if (this.flags.showModuleGuides) {
      // What the crown was built from — control points, or the circle that
      // generates the trochoid. Heights are measured from each side's own
      // takeoff, which is the level the percentages actually count from, so the
      // measure reads as the number in the box rather than as height above the
      // plate.
      const guide = gougedCrossGuide(this.cross(plate), section);
      for (const c of guide.circles) {
        renderCircle(new Circle(0, zBase + sign * c.centerZ, c.radius), color)(g, ui);
      }
      for (const k of guide.knots) {
        const at = new Pt(k.x, zBase + sign * k.z);
        renderMeasure(new Pt(k.x, zBase + sign * k.base), at, (k.z - k.base).toFixed(1), color, 3, 7)(g, ui);
        renderCrosshair(at, color, 2, 1.5, 1)(g, ui);
      }
      renderCircle(new Circle(0, zBase + sign * guide.peakZ, 1), color)(g, ui);
    }
  }

  // ===== STL export =====
  // Deliberately here rather than in the Export panel: this model is still
  // being settled, and the Export panel's job is to emit the geometry a maker
  // would cut. A plate exported from this button is for looking at.

  /** Milled grid step (mm). Finer than the classic default, since the transition is the thing being judged. */
  stlGridMm = 0.4;

  exporting: 'top' | 'bottom' | null = null;

  /**
   * Exports one plate as a binary STL straight off the gouged surface.
   *
   * Uses {@link buildPlateStl} unchanged — it only ever asks the model for
   * heights, so it neither knows nor cares which model filled them in. That is
   * the payoff of hanging the gouged geometry off a `PlateSurfaceModel` rather
   * than inventing a parallel type for it.
   */
  exportStl(plate: 'top' | 'bottom'): void {
    const model = this.cache?.model[plate];
    if (!model || this.exporting) return;
    this.exporting = plate;
    // Yield first: a full-plate mesh at this grid takes seconds, and the button
    // should show it started rather than freezing mid-click.
    setTimeout(() => {
      try {
        const name = `${this.params.height.toFixed(0)}mm-${plate === 'top' ? 'top' : 'back'}-plate-gouged.stl`;
        downloadStlFile(name, buildPlateStl(this.params, model, plate, this.stlGridMm));
      } finally {
        this.exporting = null;
        this.emitImmediate(false, false);
      }
    }, 0);
  }

  /**
   * Where the focused knot sits across this station — both places when
   * mirrored, one otherwise.
   *
   * Scaled by each side's own takeoff rather than by the half-width, matching
   * how the profile places them. A mirrored knot can therefore land at two
   * positions that are not quite reflections, whenever the two sides meet the
   * channel at different points — which is the asymmetry the model exists to
   * show, so the halos should show it too.
   */
  private highlightKnots(plate: 'top' | 'bottom', section: GougedCrossSection): number[] {
    const pt = this.crossSpline(plate)?.points[this.highlightedIndex];
    if (!pt) return [];
    const at = (side: 1 | -1) => side * Math.abs(pt.x) * (side < 0 ? section.xEndLeft : section.xEndRight);
    if (pt.mirror) return [at(1), at(-1)];
    return [at(pt.x < 0 ? -1 : 1)];
  }
}
