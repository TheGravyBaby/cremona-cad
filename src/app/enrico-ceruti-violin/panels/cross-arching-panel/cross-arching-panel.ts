import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchingParams, ArchPlate, CerutiColors, CerutiViewFlags, CrossArchParams, CrossArchShape, CrossArchStation, EnricoCerutiParams, FlutingChannelParams, PlateViewMode } from '../../ceruti-types';
import { archContoursInfo, asymmetricCrossArchInfo, crossArchCycloidControlsInfo, crossArchEdgeDepthInfo, crossSectionStationInfo, crossStationInfo, flatPlatformInfo } from '../../ceruti-helpers';
import {
  defaultArchingParams, defaultCrossArchParams, defaultFlutingChannelParams,
  resolveCrossArchSidesAt, STATION_MERGE_EPS_MM,
} from '../../ceruti-arching';
import { clamp } from '../../../helpers/draftMath';
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



  get arching(): ArchingParams { return this.params.arching!; }
  get topCross(): CrossArchParams { return this.arching.top.cross!; }
  get topFluting(): FlutingChannelParams { return this.arching.top.fluting!; }
  get backCross(): CrossArchParams { return this.arching.bottom.cross!; }
  get backFluting(): FlutingChannelParams { return this.arching.bottom.fluting!; }

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
   * What a plate's Factor/Percent fields display: always the cross-section shape
   * at the cursor, whatever is supplying it —
   *   • a station sitting under the cursor,
   *   • an uncommitted draft the maker is dialling in there,
   *   • the base shape, when the plate has no stations at all (it applies
   *     everywhere then), or
   *   • otherwise a snapshot of the interpolated shape at this position, so the
   *     readout matches the real geometry while simply browsing the body.
   *
   * That last case returns a throwaway object, so this is read-only — every
   * write goes through {@link editTarget}.
   */
  private activeShape(plate: 'top' | 'bottom'): CrossArchShape {
    return this.stationAtCursor(plate)
      ?? this.draftFor(plate)
      ?? (this.crossFor(plate).stations?.length
        ? this.effectiveShapeAt(plate, this.cursorY)
        : this.crossFor(plate));
  }

  get activeTopShape(): CrossArchShape { return this.activeShape('top'); }
  get activeBackShape(): CrossArchShape { return this.activeShape('bottom'); }

  get topCrossPercent(): number { return Math.round(this.activeTopShape.pct * 100); }
  get backCrossPercent(): number { return Math.round(this.activeBackShape.pct * 100); }

  /** The interpolated shape at `y`, as a detached copy safe to seed a draft from. */
  private effectiveShapeAt(plate: 'top' | 'bottom', y: number): CrossArchShape {
    const cross = this.crossFor(plate);
    const sides = resolveCrossArchSidesAt(cross, y, this.params.height);
    // Factors are entered in 0.05 steps; keep an interpolated one to that grain
    // rather than showing a maker 0.1034 in a field they are about to nudge.
    const shape: CrossArchShape = { d: round2(sides.left.d), pct: sides.left.pct };
    if (cross.asymmetric) {
      shape.left = { d: round2(sides.left.d), pct: sides.left.pct };
      shape.right = { d: round2(sides.right.d), pct: sides.right.pct };
    }
    return shape;
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
      draft = { y: this.cursorY, ...this.effectiveShapeAt(plate, this.cursorY) };
      this.draft[plate] = draft;
    }
    return draft;
  }

  setActiveD(plate: 'top' | 'bottom', d: number): void {
    this.editTarget(plate).d = clamp(d, 0, 1);
    this.onChange();
  }

  setActivePct(plate: 'top' | 'bottom', pct: number): void {
    this.editTarget(plate).pct = clamp(pct, 5, 100) / 100;
    this.onChange();
  }

  setActiveSideD(plate: 'top' | 'bottom', side: 'left' | 'right', d: number): void {
    this.editTarget(plate)[side]!.d = clamp(d, 0, 1);
    this.onChange();
  }

  setActiveSidePct(plate: 'top' | 'bottom', side: 'left' | 'right', pct: number): void {
    this.editTarget(plate)[side]!.pct = clamp(pct, 5, 100) / 100;
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
   */
  toggleAsymmetricCross(plate: 'top' | 'bottom'): void {
    const cross = plate === 'top' ? this.topCross : this.backCross;
    cross.asymmetric = !cross.asymmetric;
    if (cross.asymmetric) {
      seedCrossArchSides(cross);
      // An open preview isn't in cross.stations, so seed it alongside them.
      const draft = this.draft[plate];
      if (draft) seedShapeSides(draft);
    }
    this.onChange();
  }

  // ===== Cross-arch stations =====
  // The plate's base d/pct anchor both body ends; stations are interior
  // overrides the shape ramps through in between. The section-height control at
  // the top of the panel doubles as the cursor these are placed at.

  // Read-only views: these must not write `stations` back into params, or merely
  // opening the panel would change JSON.stringify(params) — the recipe's own
  // unsaved-changes check and the scene's render cache key both read that.
  get topStations(): CrossArchStation[] { return this.topCross.stations ?? []; }
  get backStations(): CrossArchStation[] { return this.backCross.stations ?? []; }

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
   * nothing, the interpolated shape already there (which pins it against later
   * edits without moving the surface).
   *
   * Only reachable with the cursor off every existing station: once one is
   * there the fields edit it directly, so there is nothing left to commit.
   */
  setStationHere(plate: 'top' | 'bottom'): void {
    const cross = this.crossFor(plate);
    const source = this.activeShape(plate);
    const shape: CrossArchShape = { d: source.d, pct: source.pct };
    if (cross.asymmetric) {
      shape.left = { ...source.left! };
      shape.right = { ...source.right! };
    }
    const existing = this.stationAtCursor(plate);
    if (existing) {
      Object.assign(existing, shape);
    } else {
      (cross.stations ??= []).push({ y: this.cursorY, ...shape });
      cross.stations.sort((a, b) => a.y - b.y);
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
      // Older recipes carry a cross block without the cycloid window; backfill it.
      plate.cross.pct ??= defaultCrossArchParams().pct;
      plate.fluting ??= defaultFlutingChannelParams();
      // The asymmetric rows bind straight to left/right, so an asymmetric plate
      // must always have both — on the base shape and on every station.
      if (plate.cross.asymmetric) seedCrossArchSides(plate.cross);
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
        ? { ...plate, cross: { ...plate.cross!, stations: [...(plate.cross!.stations ?? []), draft] } }
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
function seedShapeSides(shape: CrossArchShape): void {
  shape.left ??= { d: shape.d, pct: shape.pct };
  shape.right ??= { d: shape.d, pct: shape.pct };
}

/**
 * Gives a plate's base shape and every one of its stations a left/right pair,
 * seeded from that shape's own symmetric d/pct where one is missing. Existing
 * pairs are left alone, so this is safe to re-run — flipping asymmetric off and
 * back on returns the sides the maker had set, rather than resetting them.
 */
function seedCrossArchSides(cross: CrossArchParams): void {
  for (const shape of [cross as CrossArchShape, ...(cross.stations ?? [])]) seedShapeSides(shape);
}
