import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ArchingParams, ArchPlate, CerutiColors, CerutiViewFlags,
  CrossArchCycloidParams, CrossArchCycloidShape, CrossArchParams, CrossArchShape,
  CrossArchSplineParams, CrossArchSplinePoint, CrossArchSplineShape, CrossArchStation,
  EnricoCerutiParams, FlutingChannelParams, PlateViewMode,
} from '../../ceruti-types';
import {
  archContoursInfo, asymmetricCrossArchInfo, crossArchCurveTypeInfo, crossArchCycloidControlsInfo, crossArchEdgeDepthInfo,
  crossArchSplinePointInfo, crossSectionStationInfo, crossStationInfo, flatPlatformInfo,
} from '../../ceruti-helpers';
import {
  defaultArchingParams, defaultCrossArchParams, defaultCrossArchSplineParams, defaultFlutingChannelParams,
  nearestCrossArchSplineShape, resolveCrossArchSidesAt, STATION_MERGE_EPS_MM,
} from '../../ceruti-arching';
import { clamp } from '../../../helpers/draftMath';
import { archSplineKnots } from '../../../helpers/svgPathMath';
import { CrossArchingSceneBuilder } from './cross-arching-scene';
import { CrossArchingRotationController } from './cross-arching-rotation-controller';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

@Component({
  selector: 'app-ceruti-cross-arching-panel',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './cross-arching-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CrossArchingPanel extends CerutiPanelBase implements OnInit, OnDestroy {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  private readonly scene = new CrossArchingSceneBuilder();
  private rotation: CrossArchingRotationController | null = null;

  protected readonly crossSectionStationInfo = crossSectionStationInfo;
  protected readonly crossArchCycloidControlsInfo = crossArchCycloidControlsInfo;
  protected readonly crossArchEdgeDepthInfo = crossArchEdgeDepthInfo;
  protected readonly asymmetricCrossArchInfo = asymmetricCrossArchInfo;
  protected readonly crossStationInfo = crossStationInfo;
  protected readonly flatPlatformInfo = flatPlatformInfo;
  protected readonly archContoursInfo = archContoursInfo;
  protected readonly crossArchCurveTypeInfo = crossArchCurveTypeInfo;
  protected readonly crossArchSplinePointInfo = crossArchSplinePointInfo;



  get arching(): ArchingParams { return this.params.arching!; }
  get topCross(): CrossArchParams { return this.arching.top.cross!; }
  get topFluting(): FlutingChannelParams { return this.arching.top.fluting!; }
  get backCross(): CrossArchParams { return this.arching.bottom.cross!; }
  get backFluting(): FlutingChannelParams { return this.arching.bottom.fluting!; }

  get topCrossCycloid(): CrossArchCycloidParams | null { return this.topCross.type === 'cycloid' ? this.topCross : null; }
  get topCrossSpline(): CrossArchSplineParams | null { return this.topCross.type === 'spline' ? this.topCross : null; }
  get backCrossCycloid(): CrossArchCycloidParams | null { return this.backCross.type === 'cycloid' ? this.backCross : null; }
  get backCrossSpline(): CrossArchSplineParams | null { return this.backCross.type === 'spline' ? this.backCross : null; }

  /**
   * Uncommitted station being previewed at the cursor, per plate. Editing
   * Factor/Percent where no station exists yet writes here rather than to the
   * base shape, and {@link paramsForRender} feeds it to the renderers as though
   * it were real. Never written to params — Set Station makes it permanent,
   * moving the cursor discards it.
   */
  private draft: { top: CrossArchStation | null; bottom: CrossArchStation | null } = { top: null, bottom: null };

  /** Cursor position, held to the same interior range a station may occupy. */
  private get cursorY(): number {
    return clamp(this.flags.crossSectionY ?? 0, 1, this.params.height - 1);
  }

  /** The plate's live preview station, or null when the cursor has moved off it. */
  draftFor(plate: 'top' | 'bottom'): CrossArchStation | null {
    const d = this.draft[plate];
    return d && Math.abs(d.y - this.cursorY) <= STATION_MERGE_EPS_MM ? d : null;
  }

  /**
   * What a plate's fields are showing: always the cross-section shape at the
   * cursor, whatever is supplying it —
   *   • a station sitting under the cursor,
   *   • an uncommitted draft the maker is dialling in there,
   *   • the base shape, when the plate has no stations at all (it applies
   *     everywhere then), or
   *   • otherwise a snapshot of the shape at this position, so the readout
   *     matches the real geometry while simply browsing the body: an exact
   *     interpolated snapshot for a cycloid plate ({@link effectiveShapeAt}),
   *     or the nearest defined shape for a spline plate ({@link nearestSplineShapeAt}
   *     — a spline's control-point list has no well-defined "interpolated"
   *     middle ground the way two scalars do).
   *
   * That last case returns a throwaway object, so this is read-only — every
   * write goes through {@link editTarget}.
   */
  private activeShape(plate: 'top' | 'bottom'): CrossArchShape {
    const cross = this.crossFor(plate);
    return this.stationAtCursor(plate)
      ?? this.draftFor(plate)
      ?? (cross.stations?.length
        ? (cross.type === 'spline' ? this.nearestSplineShapeAt(plate, this.cursorY) : this.effectiveShapeAt(plate, this.cursorY))
        : cross);
  }

  get activeTopCycloidShape(): CrossArchCycloidShape | null {
    const s = this.activeShape('top');
    return s.type === 'cycloid' ? s : null;
  }
  get activeTopSplineShape(): CrossArchSplineShape | null {
    const s = this.activeShape('top');
    return s.type === 'spline' ? s : null;
  }
  get activeBackCycloidShape(): CrossArchCycloidShape | null {
    const s = this.activeShape('bottom');
    return s.type === 'cycloid' ? s : null;
  }
  get activeBackSplineShape(): CrossArchSplineShape | null {
    const s = this.activeShape('bottom');
    return s.type === 'spline' ? s : null;
  }

  get topCrossPercent(): number { return Math.round((this.activeTopCycloidShape?.pct ?? 0) * 100); }
  get backCrossPercent(): number { return Math.round((this.activeBackCycloidShape?.pct ?? 0) * 100); }

  /** The interpolated cycloid shape at `y`, as a detached copy safe to seed a draft from. */
  private effectiveShapeAt(plate: 'top' | 'bottom', y: number): CrossArchCycloidShape {
    const cross = this.crossFor(plate) as CrossArchCycloidParams;
    const sides = resolveCrossArchSidesAt(cross, y, this.params.height);
    // Factors are entered in 0.05 steps; keep an interpolated one to that grain
    // rather than showing a maker 0.1034 in a field they are about to nudge.
    const shape: CrossArchCycloidShape = { type: 'cycloid', d: round2(sides.left.d), pct: sides.left.pct };
    if (cross.asymmetric) {
      shape.left = { d: round2(sides.left.d), pct: sides.left.pct };
      shape.right = { d: round2(sides.right.d), pct: sides.right.pct };
    }
    return shape;
  }

  /**
   * The nearest defined spline shape to `y` — the closest station, or the
   * base shape if no station is closer. Unlike {@link effectiveShapeAt}'s
   * exact interpolation, this is an exact copy of a real shape: a spline
   * control-point list has no natural point-by-point "halfway between these
   * two" to reconstruct, since two shapes can differ in point count and
   * position entirely. Shared with the module-guide overlay's own crosshair
   * placement — see {@link nearestCrossArchSplineShape}.
   */
  private nearestSplineShapeAt(plate: 'top' | 'bottom', y: number): CrossArchSplineShape {
    return nearestCrossArchSplineShape(this.crossFor(plate) as CrossArchSplineParams, y, this.params.height);
  }

  /**
   * Where a field edit lands. A station under the cursor is edited directly, and
   * a plate with no stations edits its base shape (which is the shape everywhere
   * anyway). Otherwise the edit opens a draft station at the cursor — writing to
   * the base there would only move the body ends, leaving the section the maker
   * is looking at unchanged.
   */
  private editTarget(plate: 'top' | 'bottom'): CrossArchShape {
    const station = this.stationAtCursor(plate);
    if (station) return station;
    const cross = this.crossFor(plate);
    if (!cross.stations?.length) return cross;
    let draft = this.draftFor(plate);
    if (!draft) {
      const seed = cross.type === 'spline'
        ? cloneSplineShape(this.nearestSplineShapeAt(plate, this.cursorY))
        : this.effectiveShapeAt(plate, this.cursorY);
      draft = { y: this.cursorY, ...seed } as CrossArchStation;
      this.draft[plate] = draft;
    }
    return draft;
  }

  setActiveD(plate: 'top' | 'bottom', d: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'cycloid') return;
    target.d = clamp(d, 0, 1);
    this.onChange();
  }

  setActivePct(plate: 'top' | 'bottom', pct: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'cycloid') return;
    target.pct = clamp(pct, 5, 100) / 100;
    this.onChange();
  }

  setActiveSideD(plate: 'top' | 'bottom', side: 'left' | 'right', d: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'cycloid') return;
    target[side]!.d = clamp(d, 0, 1);
    this.onChange();
  }

  setActiveSidePct(plate: 'top' | 'bottom', side: 'left' | 'right', pct: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'cycloid') return;
    target[side]!.pct = clamp(pct, 5, 100) / 100;
    this.onChange();
  }

  /** The peak's position as a whole percent, for the panel's number input. */
  splinePeakPct(shape: CrossArchSplineShape): number {
    return Math.round((shape.peak ?? 0.5) * 100);
  }

  setSplinePeakPct(plate: 'top' | 'bottom', pct: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'spline') return;
    // Held clear of the takeoff edges: the peak has to stay an interior knot.
    target.peak = clamp(pct, 2, 98) / 100;
    this.onChange();
  }

  addSplinePoint(plate: 'top' | 'bottom'): void {
    const target = this.editTarget(plate);
    if (target.type !== 'spline') return;
    // Fill the widest gap in the curve as it currently stands — mirrored twins
    // and the peak included, since those are the knots actually on screen.
    // hEff=1 here: only the relative (t) spacing of the gaps matters.
    const boundaries: { t: number; z: number }[] = [
      { t: 0, z: 0 },
      ...archSplineKnots(1, target.points, target.peak ?? 0.5),
      { t: 1, z: 0 },
    ];
    let maxGap = 0;
    let gapIdx = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const gap = boundaries[i + 1].t - boundaries[i].t;
      if (gap > maxGap) { maxGap = gap; gapIdx = i; }
    }
    const t = +((boundaries[gapIdx].t + boundaries[gapIdx + 1].t) / 2).toFixed(3);
    const z = +((boundaries[gapIdx].z + boundaries[gapIdx + 1].z) / 2).toFixed(3);
    // Symmetric by default; a point already on the centerline has nothing to mirror to.
    target.points.push({ t, z, mirror: Math.abs(t - 0.5) > 0.01 });
    target.points.sort((a, b) => a.t - b.t);
    this.onChange();
  }

  removeSplinePoint(plate: 'top' | 'bottom', index: number): void {
    const target = this.editTarget(plate);
    if (target.type !== 'spline') return;
    target.points.splice(index, 1);
    this.onChange();
  }

  toggleSplineMirror(pt: CrossArchSplinePoint): void {
    pt.mirror = !pt.mirror;
    this.onChange();
  }

  /**
   * Switches a plate's cross-arch curve type. Fully replaces the shape with a
   * fresh default in the new type — exactly like the long-arch panel's own
   * `setCurveType` discards the old arch object wholesale — and clears every
   * station along with it, since a station's shape is structurally tied to
   * its curve type. An open draft preview is discarded too: it would
   * otherwise be shaped like the old type and get spliced into the render
   * against a base shape of the new one.
   */
  setCurveType(plate: 'top' | 'bottom', type: CrossArchShape['type']): void {
    const cross = this.crossFor(plate);
    if (cross.type === type) return;
    const plateParams = plate === 'top' ? this.arching.top : this.arching.bottom;
    plateParams.cross = type === 'spline' ? defaultCrossArchSplineParams() : defaultCrossArchParams();
    this.draft[plate] = null;
    this.onChange();
  }

  /** Moving the section cursor abandons any preview that was open at the old position. */
  onCursorChange(): void {
    this.draft.top = null;
    this.draft.bottom = null;
    this.onChange();
  }

  /**
   * Flips a plate's cross arch between one shared shape and independent
   * left (x<0) / right (x>0) shapes. Turning asymmetric on seeds both sides
   * of the base shape *and* of every station from their own current d/pct, so
   * the arch keeps its exact prior shape until the maker pulls the sides apart.
   * Cycloid-only — a spline shape's asymmetry comes from its peak position and
   * per-point mirror flags instead, so there is nothing here to toggle.
   */
  toggleAsymmetricCross(plate: 'top' | 'bottom'): void {
    const cross = this.crossFor(plate);
    if (cross.type !== 'cycloid') return;
    cross.asymmetric = !cross.asymmetric;
    if (cross.asymmetric) {
      seedCrossArchSides(cross);
      // An open preview isn't in cross.stations, so seed it alongside them.
      const draft = this.draft[plate];
      if (draft && draft.type === 'cycloid') seedShapeSides(draft);
    }
    this.onChange();
  }

  // ===== Cross-arch stations =====
  // The plate's base shape anchors both body ends; stations are interior
  // overrides the shape ramps through in between. The section-height control at
  // the top of the panel doubles as the cursor these are placed at. The
  // template reads stations straight off topCrossCycloid/topCrossSpline (and
  // their back-plate equivalents) rather than a shared getter here, so each
  // row stays properly typed to its curve type instead of the general union.

  private crossFor(plate: 'top' | 'bottom'): CrossArchParams {
    return plate === 'top' ? this.topCross : this.backCross;
  }

  /** The station the cursor is currently sitting on, if any — what "Set Station" would overwrite. */
  stationAtCursor(plate: 'top' | 'bottom'): CrossArchStation | undefined {
    const y = this.flags.crossSectionY ?? 0;
    return this.crossFor(plate).stations?.find(s => Math.abs(s.y - y) <= STATION_MERGE_EPS_MM);
  }

  /** Moves the section cursor to a station's position, without touching any values. */
  jumpToStation(y: number): void {
    this.flags.crossSectionY = Math.round(y);
    this.onCursorChange();
  }

  /**
   * Commits the shape the plate's fields are showing as a real station at the
   * cursor — the preview the maker has been looking at, or, if they changed
   * nothing, the shape already there (which pins it against later edits
   * without moving the surface).
   *
   * Only reachable with the cursor off every existing station: once one is
   * there the fields edit it directly, so there is nothing left to commit.
   */
  setStationHere(plate: 'top' | 'bottom'): void {
    const cross = this.crossFor(plate);
    const existing = this.stationAtCursor(plate);
    if (cross.type === 'spline') {
      const source = this.activeShape(plate) as CrossArchSplineShape;
      const shape: CrossArchSplineShape = { type: 'spline', peak: source.peak, points: source.points.map(pt => ({ ...pt })) };
      if (existing) {
        Object.assign(existing, shape);
      } else {
        const stations = (cross.stations ??= []);
        stations.push({ y: this.cursorY, ...shape });
        stations.sort((a, b) => a.y - b.y);
      }
    } else {
      const source = this.activeShape(plate) as CrossArchCycloidShape;
      const shape: CrossArchCycloidShape = { type: 'cycloid', d: source.d, pct: source.pct };
      if (cross.asymmetric) {
        shape.left = { ...source.left! };
        shape.right = { ...source.right! };
      }
      if (existing) {
        Object.assign(existing, shape);
      } else {
        const stations = (cross.stations ??= []);
        stations.push({ y: this.cursorY, ...shape });
        stations.sort((a, b) => a.y - b.y);
      }
    }
    this.draft[plate] = null;
    this.onChange();
  }

  removeStation(plate: 'top' | 'bottom', index: number): void {
    const cross = this.crossFor(plate);
    cross.stations?.splice(index, 1);
    // Drop the key once the last one goes, so clearing every station leaves the
    // recipe exactly as it was before any were added.
    if (cross.stations && !cross.stations.length) delete cross.stations;
    // The removal reshapes the track a preview was seeded against, so it no
    // longer represents what the maker was looking at.
    this.draft[plate] = null;
    this.onChange();
  }

  ngOnInit(): void {
    this.rotation = new CrossArchingRotationController(
      this.flags,
      () => this.emitDragRefresh(),
    );
    this.emitImmediate();
  }

  ngOnDestroy(): void {
    this.rotation?.dispose();
  }

  onChange(): void {
    this.emitDebounced();
  }

  /**
   * Toggles a plate's overlay: clicking the active mode turns it off, clicking the
   * other mode switches to it. Only one plate may have an overlay at a time — the
   * costly contour/wireframe render is one-at-a-time across both plates, not just
   * within a single plate — so activating one clears the other plate's overlay.
   */
  togglePlateView(plate: 'top' | 'back', mode: PlateViewMode): void {
    const key = plate === 'top' ? 'topPlateView' : 'backPlateView';
    const otherKey = plate === 'top' ? 'backPlateView' : 'topPlateView';
    const next = this.flags[key] === mode ? 'none' : mode;
    this.flags[key] = next;
    if (next !== 'none') this.flags[otherKey] = 'none';
    this.onChange();
  }

  private emitDragRefresh(): void {
    this.emitImmediate(false, false);
  }

  private ensureCrossArchingState(): void {
    if (!this.params.arching) {
      this.params.arching = defaultArchingParams(this.params.height);
    }
    const a = this.params.arching;
    for (const plate of [a.top, a.bottom]) {
      plate.cross ??= defaultCrossArchParams();
      if (plate.cross.type === 'cycloid') {
        // Older recipes carry a cross block without the cycloid window; backfill it.
        plate.cross.pct ??= defaultCrossArchParams().pct;
        // The asymmetric rows bind straight to left/right, so an asymmetric plate
        // must always have both — on the base shape and on every station.
        if (plate.cross.asymmetric) seedCrossArchSides(plate.cross);
      }
      plate.fluting ??= defaultFlutingChannelParams();
    }

    // Station is ephemeral view state; default to c-bout waist on first open.
    this.flags.crossSectionY ??= Math.round(this.params.bouts.C0?.y ?? this.params.height / 2);
  }

  /**
   * Params as the renderers should see them: the real ones, plus any open
   * preview folded in as though it were a committed station. Structurally
   * shared apart from the two objects that must differ, so the copy is cheap
   * and untouched branches stay identity-equal. Never assigned back to
   * `this.params` — the preview must not reach the recipe.
   */
  private paramsForRender(): EnricoCerutiParams {
    const drafts = { top: this.draftFor('top'), bottom: this.draftFor('bottom') };
    if (!drafts.top && !drafts.bottom) return this.params;
    const a = this.arching;
    const withDraft = (plate: ArchPlate, draft: CrossArchStation | null): ArchPlate =>
      draft
        // The draft always matches plate.cross's own curve type by construction
        // (setCurveType clears any open draft, and editTarget/setStationHere
        // always seed a new one from the current cross) — true at runtime even
        // though the two union arms aren't statically correlated here.
        ? { ...plate, cross: { ...plate.cross!, stations: [...(plate.cross!.stations ?? []), draft] } as CrossArchParams }
        : plate;
    return {
      ...this.params,
      arching: { ...a, top: withDraft(a.top, drafts.top), bottom: withDraft(a.bottom, drafts.bottom) },
    };
  }

  protected buildRun(): RenderLayer[] {
    this.ensureCrossArchingState();
    return this.scene.build(
      {
        params: this.paramsForRender(),
        viewFlags: this.flags,
        colors: this.colors,
      },
      {
        active: this.rotation?.isDragging ?? false,
        onPointerDown: this.rotation?.onPointerDown ?? (() => {}),
      },
    );
  }
}

/** Trochoid factors are entered in 0.05 steps; keep interpolated ones to the same grain. */
function round2(v: number): number {
  return +v.toFixed(2);
}

/** Gives one shape a left/right pair, seeded from its own symmetric d/pct where missing. */
function seedShapeSides(shape: CrossArchCycloidShape): void {
  shape.left ??= { d: shape.d, pct: shape.pct };
  shape.right ??= { d: shape.d, pct: shape.pct };
}

/**
 * Gives a plate's base shape and every one of its stations a left/right pair,
 * seeded from that shape's own symmetric d/pct where one is missing. Existing
 * pairs are left alone, so this is safe to re-run — flipping asymmetric off and
 * back on returns the sides the maker had set, rather than resetting them.
 */
function seedCrossArchSides(cross: CrossArchCycloidParams): void {
  for (const shape of [cross as CrossArchCycloidShape, ...(cross.stations ?? [])]) seedShapeSides(shape);
}

/** Deep-copies a spline shape's points so editing a seeded draft never mutates its source. */
function cloneSplineShape(shape: CrossArchSplineShape): CrossArchSplineShape {
  return { type: 'spline', peak: shape.peak, points: shape.points.map(pt => ({ ...pt })) };
}
