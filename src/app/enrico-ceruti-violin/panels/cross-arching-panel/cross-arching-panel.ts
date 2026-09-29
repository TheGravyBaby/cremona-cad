import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Circle, Pt, Rectangle } from '../../../models/types';
import {
  renderCircle, renderSegment, renderPath, renderPointHalo, renderRect,
} from '../../../helpers/renderFuncs';
import { clamp } from '../../../helpers/math/simpleGeometry';
import { samplePathToPolyline } from '../../../helpers/math/pathMath';
import {
  ArchingParams, ArchPlate, CerutiColors, CerutiViewFlags, EnricoCerutiParams, CrossArchCycloidShape,
  CrossArchCycloidStation, CrossArchParams, CrossArchPoint, CrossArchShape, CrossArchSplineShape,
  CrossArchSplineStation, CrossArchStation, FlutingParams, PlateViewMode, RenderToggleKey,
} from '../../ceruti-types';
import {
  bodyLandmarks, contourSampleSteps, defaultArchingParams, ribHeightAt, solveRibTaper,
  splinePeakRow, STATION_MARGIN_MM, STATION_MERGE_EPS_MM, wireframeSampleSteps,
} from '../../ceruti-arching';
import {
  defaultCrossArchCatenaryShape, defaultCrossArchCycloidParams, defaultCrossArchParams,
  defaultCrossArchSplineParams, defaultFlutingParams, CrossArchSection, CYCLOID_MAX_PCT,
  crossArchGuide, crossArchKnotX, crossArchSectionAt, nearestCrossArchShape,
} from '../../ceruti-arch-geometry';
import {
  ArchContourLevel, buildPlateSurfaceModel, buildPlateStl, computeArchContourRings, plateHalfChordAtY,
  PlateSurfaceModel, sampleArchSectionRuns,
} from '../../ceruti-surface';
import { downloadStlFile } from '../../../helpers/stlExporter';
import { STROKE_WEIGHT } from '../../renders/render-constants';
import {
  computeArchContourBounds, projectArchContourRings, projectFlatPolyline, renderArchContours3d,
} from '../../renders/arch-contours.render';
import {
  computeSingleWireframeStrip, computeWireframeBounds, computeWireframeGeometry, projectWireframe,
  renderArch3dWireframe, WireframeGeometry,
} from '../../renders/arch-3d-wireframe.render';
import { renderGuideBaseline, renderGuideKnot, renderGuideMeasure } from '../../renders/module-guide.render';
import { renderWireframeDragFrame } from '../../renders/wireframe-drag-frame.render';
import { calculateOuterArcs } from '../../ceruti-calcs';
import { defineInnerPath, defineOuterPath } from '../../ceruti-paths';
import { transitionError } from '../../ceruti-helpers';
import { CrossArchingRotationController } from './cross-arching-rotation-controller';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { applyRowMove, RowMove, RowReorderDirective } from '../../../shared/row-reorder';

/** Range-thumb width, in the px the browser actually draws it — see `stationLandmarks`. */
const TICK_THUMB_PX = 14;

/** One plate's cached geometry, held until something that plate can see changes. */
interface PlateCache {
  key: string;
  /** The params the model was built from — the recipe plus any open preview. */
  params: EnricoCerutiParams;
  model: PlateSurfaceModel | null;
  /** The mould outline, sampled. What the rib box in the section view is measured off. */
  mouldPoly: Pt[];
  contours: { levels: ArchContourLevel[]; outline: Pt[] | null } | null;
  wireframe: WireframeGeometry | null;
}

/**
 * A cache key covering everything one plate's geometry depends on, and nothing
 * else.
 *
 * The other plate's arching block is dropped rather than nulled, so its absence
 * is what the key records: two plates that differ only in each other's settings
 * hash the same, which is exactly the sharing being claimed. Everything else —
 * the outline, the rib height, the surface method, this plate's own arch, gouge
 * and crown — stays in, because any of it moves this plate's surface.
 *
 * Stringified rather than compared field by field for the same reason it always
 * was: the shapes are small, deeply nested, and rebuilt by spread on every
 * preview, so identity comparison would miss nothing and match nothing.
 */
function plateCacheKey(p: EnricoCerutiParams, plate: 'top' | 'bottom'): string {
  const { top, bottom, ...shared } = p.arching!;
  return JSON.stringify({ ...p, arching: { ...shared, plate: p.arching![plate] } });
}

/**
 * Whether a number field handed back something worth acting on.
 *
 * An `<input type="number">` reports an empty or half-typed box as NaN, and
 * every field here fires on each keystroke. Coercing that to 0 — which is what
 * `value || 0` does — means clearing a box to retype it *commits* zero, and the
 * zero is written straight back over what is being typed. A maker who selects
 * "0.4" and types "1" gets the field rewritten to "0" under the cursor between
 * the two keystrokes, and the value they were reaching for never lands.
 *
 * Nothing is the right answer to "the box is empty": leave the value alone and
 * wait for a number.
 */
function entered(v: number): boolean {
  return Number.isFinite(v);
}

/**
 * How close to the joint a knot may sit, as a fraction of its side's crown.
 *
 * A knot's sign is which flank it belongs to, so there is no such thing as a
 * knot *at* the joint — and one arriving there would land on a centred crown
 * and hand the profile spline a zero-width interval. At a violin's half-width
 * this is under a millimetre, so nothing a maker would want to place is out of
 * reach.
 */
const KNOT_MIN_FRAC = 0.02;

/** One row of a plate's cross-arch table: a knot, or the crown among them. */
interface CrossSplineRow {
  pt: CrossArchPoint | null;
  /** The knot's index in `points`, or −1 for the crown. */
  index: number;
}

/**
 * The crown across the plate, as a trochoid or as control points.
 *
 * The maker authors only the crown; where it stops — the run-out into the
 * channel — is solved, not entered, since a more physical model would cost
 * more parameters. The panel therefore reports the transition rather than
 * offering it for editing.
 */
@Component({
  selector: 'app-ceruti-cross-arching-panel',
  imports: [FormsModule, NumberStepperDirective, RowReorderDirective],
  templateUrl: './cross-arching-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CrossArchingPanel extends CerutiPanelBase implements OnInit, OnDestroy {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  /** Solved section at the cursor per plate, filled by buildRun for the template to report. */
  private section: { top: CrossArchSection | null; bottom: CrossArchSection | null } = { top: null, bottom: null };

  /** Whether each plate's last solved station failed to reach its channel — the edge the warning fires on. */
  private unsolvable = { top: false, bottom: false };

  private highlightedPlate: 'top' | 'bottom' | null = null;
  private highlightedIndex = -1;

  private rotation: CrossArchingRotationController | null = null;

  /**
   * Everything expensive, cached — **per plate**, which is the point.
   *
   * The surface is costly to build (~40ms a plate: a root-find per side per
   * station row) and costlier to sample (~380ms for a contour map over one).
   * Caching it against a params snapshot is what lets a rotation drag
   * re-project without re-solving anything, since rotation lives in `flags`.
   *
   * Keyed per plate rather than once for the whole recipe because the two
   * plates are independent geometry that merely sit in one params object. A
   * single whole-params key threw away the back plate's model, contour rings
   * and wireframe every time the top plate's crown was nudged — recomputing, at
   * worst, most of half a second of work to redraw something that had not
   * changed. {@link plateCacheKey} narrows the key to what a plate can actually
   * see.
   */
  private cache: { top: PlateCache | null; bottom: PlateCache | null } = { top: null, bottom: null };

  ngOnInit(): void {
    // Ephemeral view state; default to the c-bout waist on first open.
    this.flags.crossSectionY ??= Math.round(this.params.bouts.C0?.y ?? this.params.height / 2);
    this.rotation = new CrossArchingRotationController(this.flags, () => this.emitImmediate(false, false));
    this.emitImmediate();
  }

  ngOnDestroy(): void {
    this.rotation?.dispose();
  }

  /** Only one plate may show an overlay at a time — the contour/wireframe sampling is one-at-a-time across both plates, not just within one. */
  togglePlateView(plate: 'top' | 'back', mode: PlateViewMode): void {
    const key = plate === 'top' ? 'topPlateView' : 'backPlateView';
    const otherKey = plate === 'top' ? 'backPlateView' : 'topPlateView';
    const next = this.flags[key] === mode ? 'none' : mode;
    this.flags[key] = next;
    if (next !== 'none') this.flags[otherKey] = 'none';
    this.emitImmediate();
  }

  /**
   * How a value edit redraws — and it depends on what is on screen, because the
   * cost of a redraw here spans several times over.
   *
   * Measured on a default violin (2026-09-29), per params change: a plate's
   * surface model is ~65ms (the section view needs it); a wireframe adds ~170ms
   * on top; a contour map adds ~350ms. Only one overlay can be open at a time, so
   * those are the three cases and not a combination of them.
   *
   * Up to a wireframe, the parent's immediate bypass is the right behaviour and
   * the one every other panel gets: an arrow key or a spinner click is a maker
   * saying "show me this move". With the contour map it isn't — key repeat
   * arrives every ~30ms, so each press would queue more work than it takes to
   * arrive. There `emitCoalesced` declines the bypass: a spinner click waits a
   * brief moment so a burst of them costs one recompute (see
   * `DebounceController.clearImmediate`), and typing waits as it always does.
   *
   * Neither path touches focus halos, view toggles or the first draw — those
   * still go through `emitImmediate` and cost nothing extra, since all three
   * caches are keyed on the params and none of them change any.
   */
  onChange(): void {
    if (this.contoursOpen) this.emitCoalesced();
    else this.emitDebounced();
  }

  /** Whether either plate is showing the contour map — the one overlay too costly to redraw per keypress. */
  private get contoursOpen(): boolean {
    return this.flags.topPlateView === 'contours' || this.flags.backPlateView === 'contours';
  }

  get arching(): ArchingParams { return this.params.arching!; }

  /**
   * The cursor runs the whole body, both ends included. There is no plate at
   * either end — the section is a point and the overlay's station line has
   * nowhere to go — so those two positions draw nothing rather than a
   * degenerate figure. That is worth having anyway: it is how you sight the
   * cursor onto the very end of the instrument, and a slider that stops a
   * millimetre short reads as a bug rather than as a rule.
   */
  get cursorY(): number {
    return clamp(this.flags.crossSectionY ?? 0, 0, this.params.height);
  }

  /**
   * Whether a station set at the cursor would stay where it was put.
   * {@link normalizeCrossArchStations} holds stations {@link STATION_MARGIN_MM}
   * inside both ends so they stay interior knots, so the button at 0mm would
   * author a station at 1mm — an affordance that lies about what it does.
   */
  get stationableHere(): boolean {
    const y = this.cursorY;
    return y >= STATION_MARGIN_MM && y <= this.params.height - STATION_MARGIN_MM;
  }

  /**
   * The body landmarks, placed on the station slider so a station can be set
   * *at* one rather than near it. Which positions those are is
   * {@link bodyLandmarks}' business — the same list the cross-arch templates
   * are cut at, so a tick and a template sheet cannot disagree about where the
   * waist is. All this adds is where to draw them.
   */
  get stationLandmarks(): { label: string; title: string; y: number; left: string }[] {
    if (this.params.height <= 0) return [];
    return bodyLandmarks(this.params).map(m => ({
      label: m.code,
      title: `${m.name} — ${m.y}mm`,
      y: m.y,
      left: this.trackOffset(m.y),
    }));
  }

  /**
   * The stations already authored, marked over the same track. The panel edits
   * one plate at a time and a station is invisible from the other plate's
   * fields, so the only standing record of what has been set is the tables
   * further down the panel — which means nothing while dragging, exactly when
   * it is wanted. These say where you have already been.
   *
   * Both plates share the one strip, one chevron per plate in that plate's own
   * arch colour — the same two colours the section view and the overlays already
   * use, so a mark names its plate without a legend. Where both plates carry a
   * station at the same height the chevrons stack, top above back, which is the
   * order the fields below are in.
   */
  get stationMarks(): { key: string; y: number; title: string; left: string; plates: { name: string; color: string }[] }[] {
    if (this.params.height <= 0) return [];
    const plates = [
      ['top', 'Top Plate', this.colors.archTop],
      ['bottom', 'Back Plate', this.colors.archBack],
    ] as const;
    const byY = new Map<string, { y: number; plates: { name: string; color: string }[] }>();
    for (const [plate, name, color] of plates) {
      for (const st of this.cross(plate).stations ?? []) {
        // Keyed on the position rather than merged by {@link STATION_MERGE_EPS_MM}:
        // two stations a hair apart are two marks, since seeing them overlap is
        // the point of drawing them at all.
        const key = st.y.toFixed(2);
        const entry = byY.get(key) ?? { y: st.y, plates: [] };
        entry.plates.push({ name, color });
        byY.set(key, entry);
      }
    }
    return [...byY].sort((a, b) => a[1].y - b[1].y).map(([key, e]) => ({
      key,
      y: e.y,
      plates: e.plates,
      title: `${e.plates.map(x => x.name).join(' + ')} station — ${+e.y.toFixed(1)}mm`,
      left: this.trackOffset(e.y),
    }));
  }

  /**
   * Where a station height sits along the slider's track, as a CSS offset.
   * The thumb's centre never reaches either end of the track, so a plain
   * percentage would drift off the value it marks at both extremes.
   */
  private trackOffset(y: number): string {
    const t = clamp(y, 0, this.params.height) / this.params.height;
    return `calc(${TICK_THUMB_PX / 2}px + (100% - ${TICK_THUMB_PX}px) * ${t})`;
  }

  /** Moving the cursor abandons whatever preview was open at the old position. */
  setCursorY(mm: number): void {
    if (!entered(mm)) return;
    this.flags.crossSectionY = clamp(mm, 0, this.params.height);
    this.onCursorChange();
  }

  /**
   * Never debounced, unlike every other control here: the cursor moves *where we
   * look*, not what the plate is, so it changes no params and all three caches
   * survive it. Dragging the slider only re-slices a model that is already built,
   * which is why it can stay live even with the contour map open.
   */
  onCursorChange(): void {
    this.draft.top = null;
    this.draft.bottom = null;
    this.emitImmediate();
  }

  gouge(plate: 'top' | 'bottom'): FlutingParams {
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    return (plateParams.fluting ??= defaultFlutingParams(this.params));
  }

  cross(plate: 'top' | 'bottom'): CrossArchParams {
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    return (plateParams.cross ??= defaultCrossArchParams());
  }

  /** The plate's stations, for the table. Empty rather than absent, so the template need not guard twice. */
  splineStations(plate: 'top' | 'bottom'): CrossArchSplineStation[] {
    const cross = this.cross(plate);
    return cross.type === 'spline' ? cross.stations ?? [] : [];
  }

  cycloidStations(plate: 'top' | 'bottom'): CrossArchCycloidStation[] {
    const cross = this.cross(plate);
    return cross.type === 'cycloid' ? cross.stations ?? [] : [];
  }

  /**
   * The shape a plate's fields are showing: whatever supplies the crown at the
   * cursor. A station sitting there, an uncommitted draft being dialled in
   * there, or — when the plate has no stations at all, so one shape applies
   * everywhere — the base shape itself. Failing all three, the nearest defined
   * shape, as a readout while browsing between stations.
   *
   * Read-only, and deliberately not consistent about why: that last case hands
   * back the live base shape but a *copy* of a station (normalization clamps
   * and copies). So a write here would silently either edit the body ends or
   * vanish, depending on where the cursor happens to be. Every write goes
   * through {@link editTarget} instead.
   */
  private activeShape(plate: 'top' | 'bottom'): CrossArchShape {
    const cross = this.cross(plate);
    return this.stationAtCursor(plate)
      ?? this.draftFor(plate)
      ?? (cross.stations?.length ? nearestCrossArchShape(cross, this.cursorY, this.params.height) : cross);
  }

  /** The crown at the cursor when it is authored from control points, else null — the point editor's guard. */
  crossSpline(plate: 'top' | 'bottom'): CrossArchSplineShape | null {
    const shape = this.activeShape(plate);
    return shape.type === 'spline' ? shape : null;
  }

  // the crown is a knot at the same kind of position, so it's a row like the rest, listed wherever
  // the maker put it rather than pinned to the top.
  splineRows(shape: CrossArchSplineShape): CrossSplineRow[] {
    const rows: CrossSplineRow[] = shape.points.map((pt, index) => ({ pt, index }));
    rows.splice(splinePeakRow(shape), 0, { pt: null, index: -1 });
    return rows;
  }

  /** The crown at the cursor when it is a trochoid, else null. */
  crossCycloid(plate: 'top' | 'bottom'): CrossArchCycloidShape | null {
    const shape = this.activeShape(plate);
    return shape.type === 'cycloid' ? shape : null;
  }

  /**
   * Where a field edit lands. A station under the cursor is edited directly, and
   * a plate with no stations edits its base shape — which is the shape
   * everywhere anyway. Otherwise the edit opens a draft station here, because
   * writing to the base at that point would only move the body ends and leave
   * the section the maker is looking at unchanged.
   */
  private editTarget(plate: 'top' | 'bottom'): CrossArchShape {
    const station = this.stationAtCursor(plate);
    if (station) return station;
    const cross = this.cross(plate);
    // A catenary always edits its own (stationless) base shape — see activeShape.
    if (cross.type === 'catenary' || !cross.stations?.length) return cross;
    let draft = this.draftFor(plate);
    if (!draft) {
      // cross is spline/cycloid here (catenary returned above), so this is always a
      // real station shape — nearestCrossArchShape's return type just doesn't say so.
      draft = {
        y: this.cursorY,
        ...cloneCrossArchShape(nearestCrossArchShape(cross, this.cursorY, this.params.height)),
      } as CrossArchStation;
      this.draft[plate] = draft;
    }
    return draft;
  }

  /**
   * Switches a plate's crown curve type, replacing the shape wholesale with a
   * fresh default. `d`/`pct` and a control-point list describe the shape in
   * ways that have no honest conversion between them, so carrying one across
   * would be inventing data. Stations go with it,
   * since a station's shape is tied to its curve type, and so does any open
   * draft — it would otherwise be spliced into the render shaped like the type
   * the plate no longer is.
   */
  setCurveType(plate: 'top' | 'bottom', type: CrossArchShape['type']): void {
    if (this.cross(plate).type === type) return;
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    plateParams.cross = type === 'cycloid'
      ? defaultCrossArchCycloidParams()
      : type === 'catenary'
      ? defaultCrossArchCatenaryShape()
      : defaultCrossArchSplineParams();
    this.draft[plate] = null;
    this.onChange();
  }

  /** The trochoid window as a whole percent, for the panel's input. */
  cycloidPct(plate: 'top' | 'bottom'): number {
    return Math.round((this.crossCycloid(plate)?.pct ?? 0) * 100);
  }

  /** The same, for a row of the station table. */
  stationPct(st: CrossArchCycloidStation): number {
    return Math.round(st.pct * 100);
  }

  /** The trochoid blend factor as a whole percent, for the panel's input — 0 = raised cosine,
   * 100 = standard cycloid. */
  cycloidDPct(plate: 'top' | 'bottom'): number {
    return Math.round((this.crossCycloid(plate)?.d ?? 0) * 100);
  }

  setCycloidDPct(plate: 'top' | 'bottom', pct: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'cycloid' || !entered(pct)) return;
    target.d = clamp(pct / 100, 0, 1);
    this.onChange();
  }

  /**
   * Past 100% the ends curl under the takeoff, dipping by tan²(q·π/2) of the rise for q = pct − 1.
   * Held where the deepest station's dip reaches the plate thickness, like a knot's height floor.
   */
  cycloidPctMax(plate: 'top' | 'bottom'): number {
    const dip = -this.pointZFloorPct(plate) / 100;
    return Math.round(100 * Math.min(1 + (2 / Math.PI) * Math.atan(Math.sqrt(dip)), CYCLOID_MAX_PCT));
  }

  setCycloidPct(plate: 'top' | 'bottom', pct: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'cycloid' || !entered(pct)) return;
    target.pct = clamp(pct, 5, this.cycloidPctMax(plate)) / 100;
    this.onChange();
  }

  /** The crown's position across the plate as a whole percent, 50 being the joint. */
  peakPct(plate: 'top' | 'bottom'): number {
    return Math.round((this.crossSpline(plate)?.peak ?? 0.5) * 100);
  }

  /** The same, for a row of the station table. */
  stationPeakPct(st: CrossArchSplineStation): number {
    return Math.round((st.peak ?? 0.5) * 100);
  }

  /**
   * Moves the crown across the plate: 50 is the joint, below it the bass side.
   * Real plates rarely peak dead centre, and a scan traced onto a centred crown
   * has to absorb that error somewhere in the shape instead.
   *
   * Held to 30–70 here rather than at the geometric limit. The crown only has to
   * stay clear of the channel to be a valid knot, but past about this it stops
   * describing an arch: one shoulder becomes a cliff into the channel while the
   * other runs most of the width. The solve clamps further at narrow stations,
   * where the same percent is a much larger share of what is left.
   */
  setPeakPct(plate: 'top' | 'bottom', pct: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'spline' || !entered(pct)) return;
    target.peak = clamp(pct, 30, 70) / 100;
    this.onChange();
  }

  /**
   * A knot's position across the *whole* plate: 0 the bass channel, 100 the
   * treble one, 50 the joint.
   *
   * The same reading the long arch's control points use, and the reason is that
   * it is the only one in which a mirrored pair looks like a mirrored pair — 66
   * and 34 are plainly the same place on opposite flanks, where +66 and −66 in
   * the stored form require knowing that each side counts from the joint
   * outward in its own units. Storage keeps that signed per-side form, which is
   * what the shape means (see {@link CrossArchPoint.x}); this is only the
   * scale the panel speaks in.
   *
   * Half a percent of the full width is one percent of a side, so the field's
   * half-step moves a knot exactly as far as a whole step used to.
   */
  pointXPct(pt: CrossArchPoint): number {
    return +(50 + pt.x * 50).toFixed(1);
  }

  /**
   * Lowest a knot's height may go, as a percent of the arch height: the plate thickness over the
   * tallest crown a station can have, so no station's dip below plate level ever exceeds the thickness.
   */
  pointZFloorPct(plate: 'top' | 'bottom'): number {
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    return -100 * plateParams.thickness / Math.max(plateParams.arch.archHeight, plateParams.thickness);
  }

  /** A knot's height as a whole percent of the local arch height. */
  pointZPct(pt: CrossArchPoint): number {
    return Math.round(pt.z * 100);
  }

  /**
   * The control point a row's fields write to: row `index` of whatever
   * {@link editTarget} resolves to.
   *
   * Routed by index rather than by handing the row's own object to the setter,
   * which is the whole reason drafts work. The rows render {@link activeShape};
   * editTarget returns either that same object or a clone of it that preserves
   * point order, so an index is a valid key into both — whereas the object the
   * row is displaying may belong to a station somewhere else on the body.
   */
  private pointTarget(plate: 'top' | 'bottom', index: number): CrossArchPoint | null {
    const target = this.editTarget(plate);
    return target.type === 'spline' ? target.points[index] ?? null : null;
  }

  /**
   * Sets a knot's position across the whole plate — 0 the bass channel, 50 the
   * joint, 100 the treble one — and stores it back in the signed per-side form.
   *
   * Held off both ends, since the takeoff is solved rather than authored, and
   * off the joint itself, where a knot has no side to belong to and would
   * collide with a centred crown besides.
   *
   * That last band is *stepped through* rather than clamped, and the difference
   * is the whole usability of an asymmetric template. Clamping parks a knot
   * against 51 and then silently refuses every further press — the field shows
   * 50 while the model still reads 51, because a value that comes back
   * unchanged is a value Angular has no reason to write back to the input. So
   * the knot cannot be walked across the joint at all, and the box stops
   * agreeing with the drawing. Continuing in the direction of travel instead
   * lands it at 49: one press, one move, and the number on screen is the number
   * in the model.
   *
   * Note what is deliberately *not* here any more: this used to re-sort the
   * point list. The rows route their edits by index, so a knot passing its
   * neighbour re-seated every input in the table under the maker's cursor —
   * the focused box would jump to some other knot's value and the next press
   * would edit that knot. Order carries no meaning to the geometry, which sorts
   * for itself in {@link crossArchKnots} and again in `crossProfile`, so the
   * table simply keeps the order the points were added in.
   */
  setPointXPct(plate: 'top' | 'bottom', index: number, pct: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'spline') return;
    const pt = target.points[index];
    if (!pt || !entered(pct)) return;
    const want = (clamp(pct, 0, 100) - 50) / 50;
    const frac = Math.abs(want) >= KNOT_MIN_FRAC
      ? want
      : (want < pt.x ? -KNOT_MIN_FRAC : KNOT_MIN_FRAC);
    pt.x = clamp(frac, -0.99, 0.99);
    this.onChange();
  }

  /**
   * Sets a knot's height above plate level as a percent of the local arch height. Below zero the
   * knot dips under the plate, and the section may meet the channel's outer flank instead. 100 is the
   * ceiling because the crown always sits at the full height — a taller knot
   * would quietly become the real high spot and the entered arch height would
   * stop describing the plate — the same invariant the long-arch splines carry.
   */
  setPointZPct(plate: 'top' | 'bottom', index: number, pct: number): void {
    const pt = this.pointTarget(plate, index);
    if (!pt || !entered(pct)) return;
    pt.z = clamp(pct, this.pointZFloorPct(plate), 100) / 100;
    this.onChange();
  }

  toggleMirror(plate: 'top' | 'bottom', index: number): void {
    const pt = this.pointTarget(plate, index);
    if (!pt) return;
    pt.mirror = !pt.mirror;
    this.onChange();
  }

  addPoint(plate: 'top' | 'bottom'): void {
    const target = this.editTarget(plate);
    if (target.type !== 'spline') return;
    // partway toward the channel from the outermost knot, not on top of it.
    const outermost = target.points.reduce((m, p) => Math.max(m, Math.abs(p.x)), 0);
    const outer = target.points.find(p => Math.abs(p.x) === outermost);
    const x = outermost > 0 ? clamp((outermost + 1) / 2, KNOT_MIN_FRAC, 0.99) : 0.5;
    // Appended rather than sorted into place, for the reason given in
    // {@link setPointXPct}: the rows are addressed by index, so a stable order
    // is what keeps a field editing the knot it is showing.
    target.points.push({ x: +x.toFixed(2), z: +((outer?.z ?? 1) * 0.5).toFixed(2), mirror: true });
    this.onChange();
  }

  removePoint(plate: 'top' | 'bottom', index: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'spline') return;
    target.points.splice(index, 1);
    // shift peakRow so the crown stays between the same knots rather than sliding down one.
    const peakRow = splinePeakRow(target);
    if (index < peakRow) target.peakRow = peakRow - 1;
    this.onChange();
  }

  // row order carries nothing to the geometry — crossArchKnots sorts for itself — so dragging is
  // purely for readability, restoring the order the section runs in.
  moveRow(plate: 'top' | 'bottom', move: RowMove): void {
    const target = this.editTarget(plate);
    if (target.type !== 'spline') return;
    target.peakRow = applyRowMove(target.points, splinePeakRow(target), move);
    this.onChange();
  }

  // The base shape anchors both body ends; stations are interior overrides the
  // crown ramps through in between. The Section control at the top of the panel
  // doubles as the cursor they are placed at.

  /**
   * Uncommitted station being previewed at the cursor, per plate. Editing any
   * field where no station exists yet writes here rather than to the base shape,
   * and {@link paramsForRender} feeds it to the renderers as though it were
   * real. Never written into params — Set Station makes it permanent, moving the
   * cursor discards it.
   */
  private draft: { top: CrossArchStation | null; bottom: CrossArchStation | null } = { top: null, bottom: null };

  /** The plate's live preview station, or null once the cursor has moved off it. */
  draftFor(plate: 'top' | 'bottom'): CrossArchStation | null {
    const d = this.draft[plate];
    return d && Math.abs(d.y - this.cursorY) <= STATION_MERGE_EPS_MM ? d : null;
  }

  /** The station the cursor is sitting on, if any — what Set Station would overwrite. */
  stationAtCursor(plate: 'top' | 'bottom'): CrossArchStation | undefined {
    const y = this.cursorY;
    return this.cross(plate).stations?.find(s => Math.abs(s.y - y) <= STATION_MERGE_EPS_MM);
  }

  /** Moves the section cursor onto a station, without touching any values. */
  jumpToStation(y: number): void {
    this.flags.crossSectionY = Math.round(y);
    this.onCursorChange();
  }

  /**
   * Commits the shape the plate's fields are showing as a real station here —
   * the preview the maker has been dialling in, or, if they changed nothing, the
   * shape already at this position, which pins it against later edits without
   * moving the surface.
   */
  setStationHere(plate: 'top' | 'bottom'): void {
    const cross = this.cross(plate);
    const shape = cloneCrossArchShape(this.activeShape(plate));
    const existing = this.stationAtCursor(plate);
    if (existing) {
      // Only reachable defensively — the button is hidden once a station is
      // here, since the fields then edit it directly. Same curve type either
      // way, activeShape having read it off that very station.
      Object.assign(existing, shape);
    } else if (shape.type === 'spline' && cross.type === 'spline') {
      pushStation(cross.stations ??= [], { y: this.cursorY, ...shape });
    } else if (shape.type === 'cycloid' && cross.type === 'cycloid') {
      pushStation(cross.stations ??= [], { y: this.cursorY, ...shape });
    }
    this.draft[plate] = null;
    this.onChange();
  }

  removeStation(plate: 'top' | 'bottom', index: number): void {
    const cross = this.cross(plate);
    cross.stations?.splice(index, 1);
    // Drop the key once the last one goes, so clearing every station leaves the
    // recipe exactly as it was before any were added.
    if (cross.stations && !cross.stations.length) delete cross.stations;
    // The removal reshapes the ramp a preview was seeded against, so it no
    // longer stands for what the maker was looking at.
    this.draft[plate] = null;
    this.onChange();
  }

  /**
   * Params as the renderers should see them: the real ones, plus any open
   * preview folded in as though it were a committed station.
   *
   * Structurally shared apart from the objects that must differ, so the copy is
   * cheap and untouched branches stay identity-equal — which matters because
   * the surface cache is keyed on a stringification of this. Never assigned back to `this.params`: the preview
   * must not reach the recipe.
   */
  private paramsForRender(): EnricoCerutiParams {
    const drafts = { top: this.draftFor('top'), bottom: this.draftFor('bottom') };
    if (!drafts.top && !drafts.bottom) return this.params;
    const a = this.arching;
    const withDraft = (plate: ArchPlate, draft: CrossArchStation | null): ArchPlate =>
      draft
        // The draft always matches the plate's own curve type by construction —
        // setCurveType clears any open draft, and editTarget seeds a new one
        // from the current shape — true at runtime even though the two union
        // arms aren't statically correlated here.
        ? { ...plate, cross: { ...plate.cross!, stations: [...(plate.cross!.stations ?? []), draft] } as CrossArchParams }
        : plate;
    return {
      ...this.params,
      arching: { ...a, top: withDraft(a.top, drafts.top), bottom: withDraft(a.bottom, drafts.bottom) },
    };
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

  public buildRun(): RenderLayer[] {
    this.params.arching ??= defaultArchingParams(this.params.height);
    // The channel offsets and plate slabs chord the outer arcs, which must be current.
    calculateOuterArcs(this.params);

    // Everything downstream reads this one object — section, contours,
    // wireframe and the STL button alike — so an open preview is what the maker
    // sees in every view at once, and never in the recipe.
    const p = this.paramsForRender();

    const y = this.cursorY;
    for (const plate of ['top', 'bottom'] as const) {
      const geometry = this.plateCache(p, plate).model?.geometry;
      this.section[plate] = geometry ? crossArchSectionAt(p, geometry, y) : null;
      this.reportTransition(plate, y);
    }

    return [this.sectionView(y), ...this.overlayLayers(y)];
  }

  /**
   * One plate's cache, rebuilt only if something that plate can see has moved.
   *
   * The model is built eagerly because the section view draws both plates and
   * needs both; the contour rings and wireframe strips hang off it lazily, so a
   * plate whose overlay is closed never pays for one. Dropping them together
   * with the model is what keeps them honest — they are sampled *from* it, so
   * they cannot outlive it.
   */
  private plateCache(p: EnricoCerutiParams, plate: 'top' | 'bottom'): PlateCache {
    const key = plateCacheKey(p, plate);
    const cached = this.cache[plate];
    if (cached?.key === key) return cached;
    return this.cache[plate] = {
      key, params: p, model: buildPlateSurfaceModel(p, plate),
      mouldPoly: samplePathToPolyline(defineInnerPath(p)),
      contours: null, wireframe: null,
    };
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
    // A side that found no tangency still carries a takeoff — its closest
    // approach, so the surface stays whole — and the flag on it is what says so.
    const unsolvable = !!section && (!section.left?.tangent || !section.right?.tangent);
    if (unsolvable === this.unsolvable[plate]) return;
    this.unsolvable[plate] = unsolvable;
    if (unsolvable) transitionError(plate, y);
  }

  // Ring builder, projection, renderers and drag frame all take just a {@link PlateSurfaceModel}.
  private overlayLayers(y: number): RenderLayer[] {
    const a = this.arching;
    const layers: RenderLayer[] = [];
    // off the taller rib end, so this clears at every station without shifting as the cursor scrubs.
    const taper = solveRibTaper(this.params);
    const yOffset = Math.max(taper.zLower, taper.zUpper) + a.top.thickness + a.top.arch.archHeight + 15;
    const rotX = this.flags.plateRotXDeg ?? 0;
    const rotY = this.flags.plateRotYDeg ?? 0;
    const rotZ = this.flags.plateRotZDeg ?? 0;
    const drag = { active: this.rotation?.isDragging ?? false, onPointerDown: this.rotation?.onPointerDown ?? (() => {}) };

    for (const plate of ['top', 'bottom'] as const) {
      const mode = plate === 'top' ? this.flags.topPlateView : this.flags.backPlateView;
      if (mode === 'none') continue;
      const c = this.cache[plate];
      const model = c?.model;
      if (!c || !model) continue;
      // The params the model was built from, so the overlay and the section
      // below it never disagree about whether a preview is in force.
      const p = c.params;
      const zSign: 1 | -1 = plate === 'top' ? 1 : -1;
      const color = plate === 'top' ? this.colors.archTop : this.colors.archBack;
      const arch = plate === 'top' ? a.top.arch : a.bottom.arch;

      if (mode === 'contours') {
        if (!c.contours) {
          const { stepMm, gridMm } = contourSampleSteps(p, arch.archHeight);
          c.contours = {
            levels: computeArchContourRings(p, model, stepMm, gridMm),
            outline: samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, plate === 'bottom'), 1),
          };
        }
        const cached = c.contours;
        const levels = projectArchContourRings(cached.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, zSign);
        const outline = cached.outline
          ? projectFlatPolyline(cached.outline, p.height, yOffset, rotX, rotY, rotZ, 1, 0, zSign)
          : null;
        layers.push(renderArchContours3d(this.colors, levels, outline, color));
        // The cursor station, drawn exactly as the wireframe draws it — same
        // strip, same projection, same grey. A contour map says how deep the
        // plate is everywhere and nothing about where you are on it; this is
        // the one line that answers that, so it belongs in both views. Passing
        // no strips and no ribs leaves the renderer with only its highlight.
        const { sampleStepMm } = wireframeSampleSteps(p);
        const cursorStrip = computeSingleWireframeStrip(p, model, y, yOffset, rotX, rotY, rotZ, 1, sampleStepMm, 0, zSign);
        layers.push(renderArch3dWireframe(this.colors, [], [], cursorStrip, color));
        layers.push(renderWireframeDragFrame(
          computeArchContourBounds(cached.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, zSign),
          this.colors, drag.active, drag.onPointerDown,
        ));
      } else {
        const { stationStepMm, sampleStepMm } = wireframeSampleSteps(p);
        c.wireframe ??= computeWireframeGeometry(p, model, stationStepMm, sampleStepMm);
        const wf = c.wireframe;
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
   * The transverse section at the cursor, both plates in one frame: these are
   * two faces of one instrument rather than two things to compare.
   */
  private sectionView(y: number): RenderLayer {
    const p = this.params;
    const a = this.arching;
    // Both widths come off the sampled outlines, not the arcs those outlines
    // were built from. An arc query is exact along the bouts and wrong at the
    // corners in two ways at once: the plate edge rounds each corner on a cubic,
    // which there is no arc to intersect, so it reports nothing right through
    // the corner band; and the bout arcs it does find run on past the corner
    // they were cut at, so the station either side of the band reads several
    // millimetres too wide. The loops are what the wireframe and the contour map
    // already measure, so the frame now cannot disagree with the overlay above
    // it — and the back plate's button is included, which the arcs never were.
    const outerHalf = (plate: 'top' | 'bottom'): number | null => {
      const model = this.cache[plate]?.model;
      return model ? plateHalfChordAtY(model.outerPlate, y) : null;
    };
    const mould = this.cache.top?.mouldPoly;
    const innerHalf = mould ? plateHalfChordAtY(mould, y) : null;
    const halves = { top: outerHalf('top'), bottom: outerHalf('bottom') };
    // the section is the same shape as always, just lifted or dropped by the rib's taper here.
    const ribZ = ribHeightAt(p, y);

    // At either end of the body the outline has no width to give, so there is
    // no section — not a thin one. Drawing the frame anyway would put a stack
    // of zero-length lines and two thickness ticks on the centreline, which
    // reads as a section of an instrument a millimetre wide. Nothing is the
    // honest picture, and it is what the overlay's station line already does.
    if (halves.top === null && halves.bottom === null) return () => {};

    // everything is computed here, once per build: the canvas replays the returned
    // layer on every pan and zoom, so it must only draw.
    const parts: RenderLayer[] = [];
    if (innerHalf !== null) {
      parts.push(renderRect(
        new Rectangle({ x: -(innerHalf + p.rib), y: 0 }, { x: innerHalf + p.rib, y: ribZ }),
        this.colors.mouldTrace, 'none', STROKE_WEIGHT.guide,
      ));
      for (const sx of [-1, 1]) {
        parts.push(renderSegment(new Pt(sx * innerHalf, 0), new Pt(sx * innerHalf, ribZ), this.colors.innerTrace, STROKE_WEIGHT.guide));
      }
    }
    for (const plate of ['top', 'bottom'] as const) {
      if (halves[plate] !== null) parts.push(...this.platePart(plate, halves[plate]!, ribZ, y));
    }
    return (g: any, ui: any): void => {
      for (const part of parts) part(g, ui);
    };
  }

  private platePart(plate: 'top' | 'bottom', outerHalf: number, ribZ: number, y: number): RenderLayer[] {
    const a = this.arching;
    const isTop = plate === 'top';
    const sign: 1 | -1 = isTop ? 1 : -1;
    const thickness = isTop ? a.top.thickness : a.bottom.thickness;
    const innerZ = isTop ? ribZ : 0;
    const zBase = innerZ + sign * thickness;
    const color = isTop ? this.colors.archTop : this.colors.archBack;
    const section = this.section[plate];
    const parts: RenderLayer[] = [];

    parts.push(renderSegment(new Pt(-outerHalf, innerZ), new Pt(outerHalf, innerZ), this.colors.innerTrace, STROKE_WEIGHT.guide));
    for (const side of [1, -1] as const) {
      parts.push(renderSegment(new Pt(side * outerHalf, innerZ), new Pt(side * outerHalf, zBase), this.colors.innerTrace, STROKE_WEIGHT.guide));
    }
    // Split by what carved it: the flat land
    // and the plate edges in the trace colour, the gouged channel in the
    // fluting colour, the arch in the plate's own. The surface is still one
    // continuous function — the contact is only where the pen changes.
    const c = this.cache[plate];
    if (c?.model) {
      const pen = {
        land: [this.colors.innerTrace, STROKE_WEIGHT.guide],
        channel: [this.colors.fluting, STROKE_WEIGHT.section],
        arch: [color, STROKE_WEIGHT.section],
      } as const;
      for (const run of sampleArchSectionRuns(c.params, c.model, y)) {
        const d = run.pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${zBase + sign * pt.y}`).join(' ');
        parts.push(renderPath(d, pen[run.part][0], pen[run.part][1]));
      }
    }
    if (!section) return parts;

    if (this.highlightedPlate === plate) {
      for (const x of this.highlightKnots(plate, section)) {
        parts.push(renderPointHalo(new Pt(x, zBase + sign * section.zAt(x)), color));
      }
    }

    if (this.flags.showModuleGuides) {
      // What the crown was built from — control points, or the circle that
      // generates the trochoid — measured up from plate level, the level the
      // percentages count from, so each measure reads as the number in its box.
      // The shape at the cursor, not the plate's base — so the crosshairs mark
      // whatever the panel's fields are showing, station or draft included.
      const guide = crossArchGuide(this.activeShape(plate), section);
      // a knot datum is plate level, so it is carried on out to the plate edge; a
      // trochoid's or catenary's is its takeoff, and starts there
      const toEdge = this.activeShape(plate).type === 'spline';
      for (const b of guide.baselines) {
        const z = zBase + sign * b.z;
        const from = toEdge ? Math.sign(b.fromX) * outerHalf : b.fromX;
        parts.push(renderGuideBaseline(new Pt(from, z), new Pt(b.toX, z), color));
      }
      for (const circle of guide.circles) {
        parts.push(renderCircle(new Circle(0, zBase + sign * circle.centerZ, circle.radius), color));
      }
      for (const k of guide.knots) {
        const at = new Pt(k.x, zBase + sign * k.z);
        parts.push(renderGuideMeasure(new Pt(k.x, zBase + sign * k.base), at, color));
        parts.push(renderGuideKnot(at, color));
      }
      parts.push(renderCircle(new Circle(section.xPeak, zBase + sign * guide.peakZ, 1), color));
      for (const t of guide.takeoffs) parts.push(renderCircle(new Circle(t.x, zBase + sign * t.y, 0.6), color));
    }
    return parts;
  }

  // Deliberately here rather than in the Export panel: this model is still
  // being settled, and the Export panel's job is to emit the geometry a maker
  // would cut. A plate exported from this button is for looking at.

  /** Milled grid step (mm). Fine, since the transition is the thing being judged. */
  stlGridMm = 0.4;

  exporting: 'top' | 'bottom' | null = null;

  /**
   * Exports one plate as a binary STL straight off the surface.
   *
   * Uses {@link buildPlateStl}, which only ever asks the model for heights —
   * the payoff of hanging the solved geometry off a `PlateSurfaceModel` rather
   * than inventing a parallel type for it.
   */
  exportStl(plate: 'top' | 'bottom'): void {
    const cache = this.cache[plate];
    const model = cache?.model;
    if (!cache || !model || this.exporting) return;
    this.exporting = plate;
    // Yield first: a full-plate mesh at this grid takes seconds, and the button
    // should show it started rather than freezing mid-click.
    setTimeout(() => {
      try {
        const name = `${this.params.height.toFixed(0)}mm-${plate === 'top' ? 'top' : 'back'}-plate.stl`;
        // Built from the cached params rather than the recipe, so the mesh is
        // the surface on screen — preview station included, if one is open.
        downloadStlFile(name, buildPlateStl(cache.params, model, plate, this.stlGridMm));
      } finally {
        this.exporting = null;
        this.emitImmediate(false, false);
      }
    }, 0);
  }

  /**
   * Where the focused knot sits across this station — both places when
   * mirrored, one otherwise.
   */
  private highlightKnots(plate: 'top' | 'bottom', section: CrossArchSection): number[] {
    const pt = this.crossSpline(plate)?.points[this.highlightedIndex];
    if (!pt) return [];
    const at = (side: 1 | -1) => crossArchKnotX(section, side, Math.abs(pt.x));
    if (pt.mirror) return [at(1), at(-1)];
    return [at(pt.x < 0 ? -1 : 1)];
  }
}

/** Adds a station to a plate's list, sorted by body position — the order the resolver reads them in. */
function pushStation<T extends { y: number }>(stations: T[], station: T): void {
  stations.push(station);
  stations.sort((a, b) => a.y - b.y);
}

/**
 * Detaches a crown shape from wherever it came from.
 *
 * Both places this is used seed something from a shape they must not then
 * mutate — a draft from the nearest station, a new station from the draft or
 * the base. A trochoid is two numbers and copies by spread; a template's points
 * need copying individually, or the new shape would edit the old one's knots.
 *
 * The crown position is part of the shape and has to come across with the
 * points. Dropping it read as the panel undoing the maker's own edit: every
 * station committed here defaulted its crown back to the joint, and since the
 * resolver ramps that position along the body like anything else, a plate with
 * one station pulled its crown off the offset it had been given and back onto
 * the centre through the whole middle of the body.
 */
function cloneCrossArchShape(shape: CrossArchShape): CrossArchShape {
  if (shape.type === 'spline') {
    return { type: 'spline', points: shape.points.map(pt => ({ ...pt })), peak: shape.peak, peakRow: shape.peakRow };
  }
  return shape.type === 'cycloid' ? { type: 'cycloid', d: shape.d, pct: shape.pct } : { type: 'catenary' };
}
