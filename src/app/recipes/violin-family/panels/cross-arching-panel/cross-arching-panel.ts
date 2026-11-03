import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { clamp, normalizeDegrees, smoothstep } from '../../../../helpers/math/simpleGeometry';
import {
  buildPolylineIndex, buildProjection, calcHalfChord, closestPointToPolylineIndexed, isInsideCrossings, isOnOrInsideCrossings, makeMonotoneSpline,
  polylineCrossingsAtY, projectedBounds,
} from '../../../../helpers/math/vibeMath';
import {
  buildCrownProfile, calcChannelHalfWidth, calcChordTrust, calcCrownKnotHeight, calcCrownOffsetTrust, catenarySideZAt, channelProfileZAt,
  cornerSmoothZAt, CrownEnd, CrownFrame, cycloidZAt, solveArchTakeoff,
} from '../../../../helpers/math/archMath';
import { projectedPath, samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildContourRings, buildWireframe, buildWireframeStrip, RowSampledField, WireframeGeometry, WireframeStrip } from '../../../../helpers/math/pathVibes';
import {
  renderCircle, renderDashedLine, renderDragFrame, renderGuideBaseline, renderGuideKnot, renderGuideMeasure, renderPath, renderPointHalo, renderRect,
  renderSegment, renderSolveFailures, renderTranslatedLayers,
} from '../../../../helpers/renderFuncs';
import { buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { readWorkingState, writeWorkingState } from '../../../../helpers/workingStorage';
import { TooltipDirective } from '../../../../docs/tooltips';
import { Circle, Pt, Pt3D, Rectangle } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { applyRowMove, RowMove, RowReorderDirective, rowsWithMarker } from '../../../../shared/row-reorder';
import { DASH, STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  CrossArchParams,
  CrossShapeParams,
  CrossStationParams,
  RenderLayer,
  ViolinFamilyParams,
  ViolinFamilyToggleKey,
} from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import {
  ArchTakeoff,
  CrossArchingFailure,
  CrossArchingSolve,
  CrossArchKnot,
  CrossArchRow,
  CrossArchSection,
  LongArchingSolve,
  PlateContourSolve,
  Plate,
  PlateSurface,
  SurfaceGouge,
  SurfaceRow,
} from '../../violin-family-solves';
import { renderFluting, solveFluting } from '../fluting-panel/fluting-panel';
import { definePurflingPath, renderPlateContour, solvePlateContour, PLATE_LAYOUT_GAP } from '../plate-contour-panel/plate-contour-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout, solveRibArcs } from '../center-bout-panel/center-bout-panel';
import {
  BACK_ARCH_INK, calcSideViewOffsetX, CHANNEL_INK, longArchHeightAt, renderBodySideProfile, ribHeightAt, solveLongArching, TOP_ARCH_INK,
} from '../long-arching-panel/long-arching-panel';

// The crown across the plate, and the surface the whole arching comes to. The maker authors only
// the crown; where it stops, the run-out into the channel, is solved the way the long arch's ends
// are. A plate's crown is one shape everywhere unless stations are set, which it then ramps
// through. The surface is a height field z(x, y): the channel cut first at the gouge's own section,
// measured by true distance to its centreline so it is one gouge wide the whole way round, the
// arch inboard of where it lands, the corners smoothed down by hand to meet the channel.
//
// Panel and renders, then the crown (knots, the ramp between stations, the section at a station),
// then the surface (rows, heights, sampling), then the solve.

// a range thumb's width in the px the browser draws it, so a tick sits over the value it names
const TICK_THUMB_PX = 14;
const PLATE_DEG_PER_PX = 0.4;
const VIEW_KEY = 'violinFamilyCrossArchingView';

export type OverlayMode = 'none' | 'contours' | 'wireframe';

// where the panel is looking: the station, which plate shows which overlay, and the overlay's
// rotation. The panel's own, kept for the session, never on the file
interface CrossArchingView {
  cursorY: number | null;
  overlay: Record<Plate, OverlayMode>;
  rotX: number;
  rotY: number;
  rotZ: number;
}

export interface ContourLevel { level: number; rings: Pt3D[][] }
export interface SurfaceContours { levels: ContourLevel[]; outline: Pt3D[] }

// what has been sampled off one plate's surface, kept while that surface object stands
interface Sampled {
  surface: PlateSurface;
  contours: SurfaceContours | null;
  wireframe: WireframeGeometry | null;
}

@Component({
  selector: 'app-vf-cross-arching-panel',
  imports: [FormsModule, NumberStepperDirective, RowReorderDirective, TooltipDirective],
  templateUrl: './cross-arching-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class CrossArchingPanel extends PanelComponentBase<{ plate: Plate; index: number }> implements OnDestroy {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('iceAndFire');
  protected readonly plates: readonly Plate[] = ['top', 'back'];
  protected readonly rows = rowsWithMarker;

  // what the last draw solved; the template's readouts and reportSolveFailures() read it
  s!: CrossArchingSolve;
  section: Record<Plate, CrossArchSection | null> = { top: null, back: null };

  view: CrossArchingView = { cursorY: null, overlay: { top: 'none', back: 'none' }, rotX: -30, rotY: -10, rotZ: 0 };
  private sampled: Record<Plate, Sampled | null> = { top: null, back: null };
  // the rib outline the section's box is cut from, sampled once per plate contour solve
  private ribOutline: { for: PlateContourSolve; poly: Pt[] | null } | null = null;
  dragging = false;
  private dragLast = { x: 0, y: 0 };

  override ngOnInit(): void {
    try {
      this.view = { ...this.view, ...JSON.parse(readWorkingState(VIEW_KEY) ?? '{}') };
    } catch { /* a fresh tab */ }
    // first open sights the waist
    this.view.cursorY ??= Math.round(this.params.bouts!.C0Y);
    super.ngOnInit();
  }

  ngOnDestroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  reportSolveFailures(): void {
    reportFailures(this.s.failures, 'Cross arching');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let o = solvePlateContour(p)!;
    let f = solveFluting(p)!;
    let a = solveLongArching(p)!;
    let sideX = calcSideViewOffsetX(p);
    let s = this.s = solveCrossArching(p)!;
    let y = this.cursorY;
    for (let plate of this.plates) {
      let surface = s[plate];
      this.section[plate] = surface ? sectionAt(surface, y) : null;
      if (surface && this.sampled[plate]?.surface !== surface) this.sampled[plate] = { surface, contours: null, wireframe: null };
      if (!surface) this.sampled[plate] = null;
    }
    if (this.ribOutline?.for !== o) {
      let rib = solveRibArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
      let path = rib ? definePurflingPath(p, rib, 0) : null;
      this.ribOutline = { for: o, poly: path ? samplePathToPolyline(path) : null };
    }
    let dx = -p.body.width * PLATE_LAYOUT_GAP;
    let sideReach = sideX + Math.max(a.ribs!.zLower, a.ribs!.zUpper) + p.arching!.top.thickness + p.arching!.top.long.height + STATION_LINE_OVERRUN_MM;
    let stationLine = renderDashedLine(new Pt(dx - p.body.width / 2 - STATION_LINE_OVERRUN_MM, y), new Pt(sideReach, y), this.pal.neutral, DASH.guide, STROKE_WEIGHT.section, 0.7);
    let side = renderBodySideProfile(p, a, o, this.pal, false, { ground: true, fluting: true });
    let shown = { top: this.shown('top'), back: this.shown('back') };
    let section = renderCrossSection(p, s, a, this.ribOutline.poly, y, this.pal, {
      highlight: this.highlightedPart?.key ?? null, showGuides: this.flags.showModuleGuides, shown, sections: this.section,
    });

    let layers = [
      renderPlateContour(p, o, this.pal, this.flags, false),
      renderFluting(p, f, this.pal, false),
      renderFholes(p, this.pal),
      renderTranslatedLayers([side], sideX),
      stationLine,
      section,
    ];
    for (let plate of this.plates) {
      let mode = this.view.overlay[plate];
      let c = this.sampled[plate];
      if (mode === 'none' || !c) continue;
      let geometry = mode === 'contours' ? this.contoursOf(plate, c) : this.wireframeOf(c);
      layers.push(renderSurfaceOverlay(p, plate, c.surface, geometry, this.view, y, this.pal, this.dragging, this.onPointerDown));
    }
    layers.push(renderSolveFailures(s.failures, this.pal.alert));
    return layers;
  }

  // sampled once per surface and kept, which is what makes a rotation drag cheap
  private contoursOf(plate: Plate, c: Sampled): SurfaceContours {
    if (!c.contours) {
      let { stepMm, gridMm } = calcContourSampleSteps(this.params, this.params.arching![plate].long.height);
      c.contours = buildSurfaceContours(this.params, c.surface, stepMm, gridMm);
    }
    return c.contours;
  }

  private wireframeOf(c: Sampled): WireframeGeometry {
    if (!c.wireframe) {
      let { stationStepMm, sampleStepMm } = calcWireframeSampleSteps(this.params);
      c.wireframe = buildWireframe(buildSurfaceField(c.surface), this.params.body.height, stationStepMm, sampleStepMm);
    }
    return c.wireframe;
  }

  // the cursor runs the whole body, both ends included: there is no plate at either end, so those
  // two positions draw nothing rather than a section a millimetre wide
  get cursorY(): number {
    return clamp(this.view.cursorY ?? 0, 0, this.params.body.height);
  }

  // moving the cursor changes no params: the surfaces stand and only the section re-slices
  setCursor(mm: number): void {
    if (!Number.isFinite(mm)) return;
    this.view.cursorY = clamp(mm, 0, this.params.body.height);
    this.saveView();
    this.drawCanvas();
  }

  jumpTo(y: number): void {
    this.setCursor(Math.round(y));
  }

  // a station at the very ends would be outside the body's interior knots
  get stationable(): boolean {
    return this.cursorY >= STATION_MARGIN_MM && this.cursorY <= this.params.body.height - STATION_MARGIN_MM;
  }

  // the body's landmarks under the slider, the same five the sections are sighted against
  get landmarks(): { label: string; title: string; y: number; left: string }[] {
    return calcBodyLandmarks(this.params).map(m => ({ label: m.code, title: `${m.name}, ${m.y}mm`, y: m.y, left: this.trackOffset(m.y) }));
  }

  // the stations already set, a chevron per plate in that plate's ink, stacked where both plates
  // carry one at the same height
  get stationMarks(): { key: string; y: number; title: string; left: string; inks: string[] }[] {
    let byY = new Map<string, { y: number; names: string[]; inks: string[] }>();
    for (let plate of this.plates) {
      for (let st of this.params.arching![plate].cross.stations) {
        let key = st.y.toFixed(2);
        let entry = byY.get(key) ?? { y: st.y, names: [], inks: [] };
        entry.names.push(plate === 'top' ? 'Top Plate' : 'Back Plate');
        entry.inks.push(this.pal.ink(plate === 'top' ? TOP_ARCH_INK : BACK_ARCH_INK));
        byY.set(key, entry);
      }
    }
    return [...byY].sort((a, b) => a[1].y - b[1].y).map(([key, e]) => ({
      key, y: e.y, inks: e.inks, title: `${e.names.join(' + ')} station, ${+e.y.toFixed(1)}mm`, left: this.trackOffset(e.y),
    }));
  }

  // the thumb's centre never reaches either end of the track, so a plain percentage drifts at both
  private trackOffset(y: number): string {
    let t = clamp(y, 0, this.params.body.height) / this.params.body.height;
    return `calc(${TICK_THUMB_PX / 2}px + (100% - ${TICK_THUMB_PX}px) * ${t})`;
  }

  stationAt(plate: Plate): CrossStationParams | undefined {
    return this.params.arching![plate].cross.stations.find(st => Math.abs(st.y - this.cursorY) <= STATION_MERGE_EPS_MM);
  }

  // the shape the plate's fields edit: the station under the cursor, or the base shape while the
  // plate has none, which is then the shape everywhere. Between stations the fields are readouts
  // of the nearest shape until one is set here
  active(plate: Plate): CrossShapeParams | null {
    let cross = this.params.arching![plate].cross;
    return this.stationAt(plate) ?? (cross.stations.length ? null : cross);
  }

  shown(plate: Plate): CrossShapeParams {
    return this.active(plate) ?? calcNearestCrossArchShape(this.params.arching![plate].cross, this.cursorY, this.params.body.height);
  }

  shownLabel(plate: Plate): string {
    let y = (this.shown(plate) as CrossStationParams).y;
    return y === undefined ? 'the base shape' : `station ${y}mm`;
  }

  // pins the shape shown here as a station, so later edits to the base leave it alone
  setStation(plate: Plate): void {
    let cross = this.params.arching![plate].cross;
    let shape = this.shown(plate);
    cross.stations.push({ y: this.cursorY, d: shape.d, pct: shape.pct, peak: shape.peak, peakRow: shape.peakRow, points: shape.points.map(pt => ({ ...pt })) });
    cross.stations.sort((a, b) => a.y - b.y);
    this.recordEditAndRedraw();
  }

  removeStation(plate: Plate, index: number): void {
    this.params.arching![plate].cross.stations.splice(index, 1);
    this.recordEditAndRedraw();
  }

  // partway from the outermost point toward the channel, half its height, mirrored
  addPoint(plate: Plate): void {
    let shape = this.active(plate);
    if (!shape) return;
    let outermost = shape.points.reduce((m, pt) => Math.max(m, Math.abs(pt.x - 50)), 0);
    let outer = shape.points.find(pt => Math.abs(pt.x - 50) === outermost);
    let x = outermost > 0 ? (outermost + 50) / 2 : 25;
    shape.points.push({ x: +(50 + x).toFixed(0), z: +((outer?.z ?? 100) / 2).toFixed(0), mirror: true });
    this.recordEditAndRedraw();
  }

  // the crown keeps its place between the same points
  removePoint(plate: Plate, index: number): void {
    let shape = this.active(plate);
    if (!shape) return;
    if (index < (shape.peakRow ?? 0)) shape.peakRow!--;
    shape.points.splice(index, 1);
    this.recordEditAndRedraw();
  }

  // bass side first
  sortPoints(plate: Plate): void {
    let shape = this.active(plate);
    if (!shape) return;
    shape.points.sort((a, b) => a.x - b.x);
    shape.peakRow = shape.points.filter(pt => pt.x < shape.peak).length;
    this.recordEditAndRedraw();
  }

  moveRow(plate: Plate, move: RowMove): void {
    let shape = this.active(plate);
    if (!shape) return;
    shape.peakRow = applyRowMove(shape.points, shape.peakRow ?? 0, move);
    this.recordEditAndRedraw();
  }

  zFloor(plate: Plate): number {
    let pa = this.params.arching![plate];
    return calcCrownFloor(pa.thickness, pa.long.height);
  }

  pctMax(plate: Plate): number {
    return calcCycloidPctMax(this.params.arching![plate].thickness, this.params.arching![plate].long.height);
  }

  // one overlay at a time across both plates: the sampling is the costly part
  toggleOverlay(plate: Plate, mode: OverlayMode): void {
    let other: Plate = plate === 'top' ? 'back' : 'top';
    let next = this.view.overlay[plate] === mode ? 'none' : mode;
    this.view.overlay[plate] = next;
    if (next !== 'none') this.view.overlay[other] = 'none';
    this.saveView();
    this.drawCanvas();
  }

  highlightArchPoint(plate: Plate, index: number): void {
    this.highlightPart({ plate, index });
  }

  private saveView(): void {
    writeWorkingState(VIEW_KEY, JSON.stringify(this.view));
  }

  // the drag-to-rotate frame around an overlay: horizontal drag yaws, vertical pitches. The canvas
  // rebuilds the frame every tick, so the move and up listeners live on the window
  onPointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    event.preventDefault();
    this.dragging = true;
    this.dragLast = { x: event.clientX, y: event.clientY };
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  private onPointerMove = (event: PointerEvent): void => {
    let dx = event.clientX - this.dragLast.x, dy = event.clientY - this.dragLast.y;
    this.dragLast = { x: event.clientX, y: event.clientY };
    this.view.rotY = normalizeDegrees(this.view.rotY + dx * PLATE_DEG_PER_PX);
    this.view.rotX = clamp(this.view.rotX - dy * PLATE_DEG_PER_PX, -90, 90);
    this.drawCanvas();
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.saveView();
    this.drawCanvas();
  };
}

// the surface above the body, as a contour map or a wireframe, the cursor's station drawn across
// it; projected on every draw from geometry sampled once. The back's height field folds downward
export const renderSurfaceOverlay = (
  p: ViolinFamilyParams, plate: Plate, surface: PlateSurface, geometry: SurfaceContours | WireframeGeometry,
  view: { rotX: number; rotY: number; rotZ: number }, y: number, pal: PanelPalette, dragging: boolean, onPointerDown: (event: PointerEvent) => void,
) => (g: any, ui: any): void => {
  // above the plan, over the plate it is the surface of
  let yOffset = p.body.height + 40;
  let xOffset = plate === 'top' ? 0 : -p.body.width * PLATE_LAYOUT_GAP;
  let proj = buildProjection(yOffset, p.body.height / 2, view.rotX, view.rotY, view.rotZ, plate === 'top' ? 1 : -1, xOffset);
  let color = pal.ink(plate === 'top' ? TOP_ARCH_INK : BACK_ARCH_INK);
  let { sampleStepMm } = calcWireframeSampleSteps(p);
  let bounds;

  if ('levels' in geometry) {
    let { levels, outline } = geometry;
    renderPath(projectedPath(proj, outline, true), pal.neutral, STROKE_WEIGHT.guide, 0.6)(g, ui);
    for (let { level, rings } of levels) {
      let d = rings.map(ring => projectedPath(proj, ring, true)).join(' ');
      renderPath(d, level <= 0 ? pal.ink(CHANNEL_INK) : color, STROKE_WEIGHT.guide, level <= 0 ? 0.9 : 0.7)(g, ui);
    }
    bounds = projectedBounds(proj, levels.flatMap(l => l.rings.flat()));
  } else {
    let { strips, ribs } = geometry;
    for (let rib of ribs) renderPath(projectedPath(proj, rib), pal.neutral, STROKE_WEIGHT.guide * 0.6, 0.45)(g, ui);
    for (let strip of strips) {
      let channel = strip.maxZ < -0.01;
      renderPath(projectedPath(proj, strip.pts), channel ? pal.ink(CHANNEL_INK) : color, STROKE_WEIGHT.guide * 0.75, channel ? 0.5 : 0.65)(g, ui);
    }
    bounds = projectedBounds(proj, [...strips.flatMap(st => st.pts), ...ribs.flat()]);
  }

  let cursor = wireframeStripAt(surface, y, sampleStepMm);
  if (cursor) renderPath(projectedPath(proj, cursor.pts), pal.neutral, STROKE_WEIGHT.section)(g, ui);
  renderDragFrame(bounds, 4, pal.neutral, dragging, onPointerDown)(g);
};

export interface CrossSectionOpts {
  highlight: { plate: Plate; index: number } | null;
  showGuides: boolean;
  shown: Record<Plate, CrossShapeParams>;
  sections: Record<Plate, CrossArchSection | null>;
}

// the transverse section at the cursor, both plates on the one rib box, drawn under the top
// plate. Widths come off the sampled outlines, not the arcs: at the corners the plate edge rounds
// on a cubic no arc query finds, and the back's button is in the loop. Split by what carved each
// run: the land neutral, the channel in the channel's ink, the arch in the plate's own. One
// continuous surface; the pen changes at the contact
export const renderCrossSection = (
  p: ViolinFamilyParams, s: CrossArchingSolve, a: LongArchingSolve, ribPoly: Pt[] | null, y: number, pal: PanelPalette, opts: CrossSectionOpts,
) => (g: any, ui: any): void => {
  let arching = p.arching!;
  let ribs = a.ribs;
  let ribHalf = ribPoly ? plateHalfChordAtY(ribPoly, y) : null;
  let halves = { top: s.top ? plateHalfChordAtY(s.top.outline, y) : null, back: s.back ? plateHalfChordAtY(s.back.outline, y) : null };
  if (!ribs || (halves.top === null && halves.back === null)) return;
  let ribZ = ribHeightAt(p, y, ribs);
  // held still as the cursor scrubs, its top clearing the plate by the tallest the section can stand
  let dy = -(Math.max(ribs.zLower, ribs.zUpper) + arching.top.thickness + arching.top.long.height + 20);

  let parts: RenderLayer[] = [];
  if (ribHalf !== null) {
    parts.push(renderRect(new Rectangle(new Pt(-ribHalf, 0), new Pt(ribHalf, ribZ)), pal.neutral, 'none', STROKE_WEIGHT.guide));
    for (let sx of [-1, 1]) parts.push(renderSegment(new Pt(sx * (ribHalf - p.body.rib), 0), new Pt(sx * (ribHalf - p.body.rib), ribZ), pal.neutral, STROKE_WEIGHT.guide));
  }
  for (let plate of ['top', 'back'] as const) {
    let half = halves[plate];
    let surface = s[plate];
    if (half === null || !surface) continue;
    let isTop = plate === 'top';
    let sign: 1 | -1 = isTop ? 1 : -1;
    let innerZ = isTop ? ribZ : 0;
    let zBase = innerZ + sign * arching[plate].thickness;
    let color = pal.ink(isTop ? TOP_ARCH_INK : BACK_ARCH_INK);
    parts.push(renderSegment(new Pt(-half, innerZ), new Pt(half, innerZ), pal.neutral, STROKE_WEIGHT.guide));
    for (let side of [1, -1]) parts.push(renderSegment(new Pt(side * half, innerZ), new Pt(side * half, zBase), pal.neutral, STROKE_WEIGHT.guide));

    for (let run of calcSectionRuns(surface, y)) {
      let d = run.pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${zBase + sign * pt.y}`).join(' ');
      if (run.part === 'land') parts.push(renderPath(d, pal.neutral, STROKE_WEIGHT.guide));
      else if (run.part === 'channel') parts.push(renderPath(d, pal.ink(CHANNEL_INK), STROKE_WEIGHT.section));
      else parts.push(renderPath(d, color, STROKE_WEIGHT.section));
    }
    let section = opts.sections[plate];
    if (!section) continue;

    let shape = opts.shown[plate];
    let type = arching[plate].cross.type;
    if (opts.highlight?.plate === plate && type === 'spline') {
      let pt = shape.points[opts.highlight.index];
      if (pt) {
        let side: 1 | -1 = pt.x < 50 ? -1 : 1;
        let xs = pt.mirror ? [1, -1] as const : [side];
        for (let sd of xs) {
          let x = crossArchKnotX(section, sd, Math.abs(pt.x - 50) / 50);
          parts.push(renderPointHalo(new Pt(x, zBase + sign * section.zAt(x)), color));
        }
      }
    }
    if (opts.showGuides) {
      // what the crown was built from, points or the cycloid's generating circle, measured up
      // from plate level, the level the percentages count from
      let guide = buildCrossArchGuide(calcCrossArchShape(shape, type), section);
      let toEdge = type === 'spline';
      for (let b of guide.baselines) {
        let z = zBase + sign * b.z;
        parts.push(renderGuideBaseline(new Pt(toEdge ? Math.sign(b.fromX) * half : b.fromX, z), new Pt(b.toX, z), color));
      }
      for (let circle of guide.circles) parts.push(renderCircle(new Circle(0, zBase + sign * circle.centerZ, circle.radius), color));
      for (let k of guide.knots) {
        let at = new Pt(k.x, zBase + sign * k.z);
        parts.push(renderGuideMeasure(new Pt(k.x, zBase + sign * k.base), at, color));
        parts.push(renderGuideKnot(at, color));
      }
      parts.push(renderCircle(new Circle(section.xPeak, zBase + sign * guide.peakZ, 1), color));
      for (let t of guide.takeoffs) parts.push(renderCircle(new Circle(t.x, zBase + sign * t.y, 0.6), color));
    }
  }
  renderTranslatedLayers(parts, 0, dy)(g, ui);
};

// two stations closer than this are the same station; stations are held this far inside the ends
export const STATION_MERGE_EPS_MM = 0.5;
export const STATION_MARGIN_MM = 1;
const STATION_LINE_OVERRUN_MM = 10;

// the lowest a point may dip, % of the arch height: the plate's thickness
export function calcCrownFloor(thickness: number, archHeight: number): number {
  return -100 * thickness / Math.max(archHeight, thickness);
}

// past 1 the window runs beyond the cusp, so the ends curl under the takeoff; 1.5 dips a full rise
export const CYCLOID_MAX_PCT = 1.5;

// past 100% the ends dip by tan²(q·π/2) of the rise for q = pct - 1; held where that dip reaches the
// plate's thickness, like a point's height floor
export function calcCycloidPctMax(thickness: number, archHeight: number): number {
  let dip = thickness / Math.max(archHeight, thickness);
  return Math.round(100 * Math.min(1 + (2 / Math.PI) * Math.atan(Math.sqrt(dip)), CYCLOID_MAX_PCT));
}

// a named position along the body a maker sights a section against: the two widest points, the
// two corners and the waist, all already in the recipe rather than read back off the outline.
// One outside the body is dropped, not clamped
export interface BodyLandmark { code: 'LB' | 'LC' | 'C' | 'UC' | 'UB'; name: string; y: number }

export function calcBodyLandmarks(p: ViolinFamilyParams): BodyLandmark[] {
  let m = solveMainBouts(p);
  let marks: { code: BodyLandmark['code']; name: string; y: number | undefined }[] = [
    { code: 'LB', name: 'Widest point of the lower bout', y: m?.L1?.y },
    { code: 'LC', name: 'Lower corner', y: p.corners?.LCr.y },
    { code: 'C', name: 'Narrowest point of the center bout', y: p.bouts?.C0Y },
    { code: 'UC', name: 'Upper corner', y: p.corners?.UCr.y },
    { code: 'UB', name: 'Widest point of the upper bout', y: m?.U1?.y },
  ];
  let lo = 1, hi = p.body.height - 1;
  if (hi <= lo) return [];
  return marks
    .filter((k): k is BodyLandmark => Number.isFinite(k.y) && k.y! > lo && k.y! < hi)
    .map(k => ({ code: k.code, name: k.name, y: Math.round(k.y) }));
}

// a crown shape in the solver's terms: fractions, a point's x signed by the side it sits on
export type CrossArchShape =
  | { type: 'catenary'; y?: number }
  | { type: 'cycloid'; d: number; pct: number; y?: number }
  | { type: 'spline'; points: { x: number; z: number; mirror: boolean }[]; peak: number; y?: number };

export function calcCrossArchShape(c: CrossShapeParams, type: CrossArchParams['type'], y?: number): CrossArchShape {
  switch (type) {
    case 'catenary': return { type, y };
    case 'cycloid': return { type, d: c.d / 100, pct: c.pct / 100, y };
    case 'spline': return { type, peak: c.peak / 100, points: c.points.map(pt => ({ x: (pt.x - 50) / 50, z: pt.z / 100, mirror: pt.mirror })), y };
  }
}

// how many knots a cycloid crown is sampled into; the last sits at N/(N+1) of the way to the
// takeoff, leaving the final stretch into the channel to the solve
const CYCLOID_CROWN_KNOTS = 24;

// a shape's knots on one side, unsigned and sorted outward. Fractions of the station's own half
// width and arch height, so the shape means the same wherever it is carried; two at one position
// collapse to the first
export function calcCrossArchKnots(shape: CrossArchShape, side: 1 | -1): CrossArchKnot[] {
  if (shape.type === 'cycloid') return calcCycloidCrownKnots(shape.d, shape.pct);
  if (shape.type === 'catenary') return [];
  let out: CrossArchKnot[] = [];
  for (let pt of shape.points) {
    if (Math.sign(pt.x) !== side && !pt.mirror) continue;
    let x = Math.abs(pt.x);
    if (x <= 1e-6) continue;
    out.push({ x, z: pt.z });
  }
  out.sort((a, b) => a.x - b.x);
  return out.filter((k, i) => i === 0 || k.x - out[i - 1].x > 1e-6);
}

// half a cycloid sampled into the knots an authored crown carries, crown outward, so everything
// downstream works from one knot list whatever curve made it. The spline through these cannot
// overshoot, where a true d = 1 cusp has an infinite edge slope for the solve to run into
function calcCycloidCrownKnots(d: number, pct: number): CrossArchKnot[] {
  let n = CYCLOID_CROWN_KNOTS;
  let out: CrossArchKnot[] = [];
  for (let i = 1; i <= n; i++) {
    let x = i / (n + 1);
    out.push({ x, z: clamp(cycloidZAt(1, 1, d, 0.5 * (1 - x), pct), -1, 1) });
  }
  return out;
}

// the shape nearest a body position: the base, which anchors both ends, or the closest station.
// For the panel's readout between stations; the surface there is a ramp of its neighbours
export function calcNearestCrossArchShape(cross: CrossArchParams, y: number, bodyHeight: number): CrossShapeParams {
  let best: CrossShapeParams = cross;
  let bestDist = Math.min(y, bodyHeight - y);
  for (let st of cross.stations) {
    let d = Math.abs(st.y - y);
    if (d < bestDist) { bestDist = d; best = st; }
  }
  return best;
}

// a shape's height fraction as a function of position fraction, anchored at the crown (0, 1) and
// at the channel's inner edge (1, 0): descending toward the channel past its outermost knot, which
// is what the shape does out there, rather than holding flat and inventing a plateau
function buildKnotCurve(knots: CrossArchKnot[]): (x: number) => number {
  let f = makeMonotoneSpline([0, ...knots.map(k => k.x), 1], [1, ...knots.map(k => k.z), 0]);
  return x => f(clamp(x, 0, 1));
}

interface CrownTracks { xs: number[]; tracks: ((y: number) => number)[] }

// one side's knot heights along the body. Two stations can carry different knot lists, so the
// union of their positions gives the correspondence: each shape contributes its own curve's value
// at a column it has no knot at. The base anchors both ends
function buildCrownSideTracks(shapes: CrossArchShape[], stations: CrossStationParams[], bodyHeight: number, side: 1 | -1): CrownTracks {
  let perShape = shapes.map(sh => calcCrossArchKnots(sh, side));
  let xs = [...new Set(perShape.flat().map(k => +k.x.toFixed(4)))].sort((a, b) => a - b);
  if (!stations.length || bodyHeight <= 0) {
    let base = buildKnotCurve(perShape[0]);
    return { xs, tracks: xs.map(x => { let v = base(x); return () => v; }) };
  }
  let ys = [0, ...stations.map(st => st.y), bodyHeight];
  let fns = perShape.map(buildKnotCurve);
  return { xs, tracks: xs.map(x => { let baseZ = fns[0](x); return makeMonotoneSpline(ys, [baseZ, ...fns.slice(1).map(f => f(x)), baseZ]); }) };
}

function crownKnotsAt(tracks: CrownTracks, y: number): CrossArchKnot[] {
  return tracks.xs.map((x, i) => ({ x, z: Math.min(tracks.tracks[i](y), 1) }));
}

function calcCrownPeak(shape: CrossArchShape): number {
  return shape.type === 'spline' ? shape.peak : 0.5;
}

// ramps a plate's crown along the body: the knots each side through their tracks, and the crown
// position alongside as a scalar, it being the origin the fractions are measured from
export function buildCrossArchResolver(cross: CrossArchParams, bodyHeight: number): (y: number) => CrossArchRow {
  if (cross.type === 'catenary') return () => ({ kind: 'catenary' });
  let stations = [...cross.stations].sort((a, b) => a.y - b.y);
  let shapes = [calcCrossArchShape(cross, cross.type), ...stations.map(st => calcCrossArchShape(st, cross.type, st.y))];
  let right = buildCrownSideTracks(shapes, stations, bodyHeight, 1);
  let left = buildCrownSideTracks(shapes, stations, bodyHeight, -1);
  let peakTrack = stations.length && bodyHeight > 0
    ? makeMonotoneSpline([0, ...stations.map(st => st.y), bodyHeight], [calcCrownPeak(shapes[0]), ...shapes.slice(1).map(calcCrownPeak), calcCrownPeak(shapes[0])])
    : () => calcCrownPeak(shapes[0]);
  let fromTakeoff = cross.type === 'cycloid';
  return (y: number) => ({ kind: 'knots', left: crownKnotsAt(left, y), right: crownKnotsAt(right, y), peak: peakTrack(y), fromTakeoff });
}

// which channel is cut at a station: the C bout's between the corners, else the bouts', eased
// across each corner over one channel width. A hard switch would be a step in width at an
// arbitrary station, a seam in the surface exactly at the corner
export function gougeAtY(g: SurfaceGouge, y: number): { width: number; halfWidth: number } {
  let lo = Math.min(g.lowerCornerY, g.upperCornerY), hi = Math.max(g.lowerCornerY, g.upperCornerY);
  let band = Math.max(calcChannelHalfWidth(g.width, g.depth), calcChannelHalfWidth(g.cBoutWidth, g.depth));
  let wC = smoothstep(y, lo - band, lo + band) * (1 - smoothstep(y, hi - band, hi + band));
  let width = g.width + wC * (g.cBoutWidth - g.width);
  return { width, halfWidth: calcChannelHalfWidth(width, g.depth) };
}

// where a point fraction lands across the plate, measured from the joint rather than the crown so
// moving the crown doesn't drag the points along. The one place the fraction becomes a position
export function crossArchKnotX(section: CrossArchSection, side: 1 | -1, frac: number): number {
  return side * frac * section.innerEdge;
}

// how far above plate level the crown must climb, in gouge depths, before the ridge may sit fully
// where it was asked to: below that the section is mostly channel with a rumour of arch on top
const PEAK_TAPER_DEPTHS = 2;

function calcCrownEndAt(centerHalf: number, width: number, depth: number, s: number): CrownEnd {
  return { xEnd: centerHalf - s, zEnd: channelProfileZAt(s, width, depth) };
}

// the slope the crown arrives with on one side if it lands at contactS up that side's flank,
// takeoffDepth deep there. The landing fixes the profile: this side's end is the trial landing,
// the other side's is wherever it last landed (or the same landing, for a symmetric crown), and the
// crown sits at its typed height between them, so the whole spline is known and its slope read a
// hair in from the end, measured inward to match the channel's own slope convention
function calcCrownArrivalSlope(
  archH: number, xPeak: number, frame: CrownFrame, row: CrossArchRow, centerHalf: number, side: 1 | -1,
  endL: CrownEnd, endR: CrownEnd, symmetric: boolean, takeoffDepth: number, contactS: number,
): number {
  let mine: CrownEnd = { xEnd: centerHalf - contactS, zEnd: -takeoffDepth };
  if (mine.xEnd <= 1e-3) return 0;
  let eps = Math.max(mine.xEnd * 1e-4, 1e-6);
  if (row.kind === 'catenary') return (catenarySideZAt(archH, mine.zEnd, mine.xEnd, side * (mine.xEnd - eps)) - mine.zEnd) / eps;
  let f = symmetric ? buildCrownProfile(archH, xPeak, frame, row.left, row.right, mine, mine)
    : side === 1 ? buildCrownProfile(archH, xPeak, frame, row.left, row.right, endL, mine)
    : buildCrownProfile(archH, xPeak, frame, row.left, row.right, mine, endR);
  return (f(side * (mine.xEnd - eps)) - mine.zEnd) / eps;
}

// where one side of the crown lands tangent on the channel, the other side held where it is
function solveCrownSideTakeoff(
  archH: number, xPeak: number, frame: CrownFrame, row: CrossArchRow, centerHalf: number, width: number, depth: number, side: 1 | -1,
  endL: CrownEnd, endR: CrownEnd, symmetric: boolean,
): ArchTakeoff | null {
  return solveArchTakeoff(width, depth, (takeoffDepth, contactS) =>
    calcCrownArrivalSlope(archH, xPeak, frame, row, centerHalf, side, endL, endR, symmetric, takeoffDepth, contactS));
}

// solves a station: the crown runs out from the peak until it meets the channel tangentially, once
// on each side, the same landing solve the long arch uses. The two sides are coupled, since both
// sit on one spline through the crown, so a centred crown on mirrored points is solved once for
// both sides and any other by alternating right and left until neither contact moves. The crown may
// sit below plate level (the recurve bands near the caps) and even below the trough, where both
// sides meet the outer flank. Its offset is tapered by how much crown there is and by how much the
// chord describes, smoothstepped so the ridge line carries no kink
export function solveCrossArchSection(archH: number, centerHalf: number, width: number, depth: number, row: CrossArchRow, chordFrac = 1): CrossArchSection | null {
  let halfWidth = calcChannelHalfWidth(width, depth);
  if (halfWidth <= 0 || centerHalf <= halfWidth) return null;
  let isCatenary = row.kind === 'catenary';

  let t = clamp(archH / (PEAK_TAPER_DEPTHS * depth), 0, 1);
  let lift = t * t * (3 - 2 * t);
  let taper = lift * calcCrownOffsetTrust(chordFrac);
  let frame: CrownFrame = { innerEdge: centerHalf - halfWidth, lift, trough: -depth, fromTakeoff: row.kind === 'knots' ? row.fromTakeoff : true };
  // the crown stays a strictly interior knot, well inside the innermost a takeoff can land
  let peakLimit = 0.9 * Math.max(centerHalf - halfWidth, 0);
  let peak = row.kind === 'knots' ? row.peak : 0.5;
  let xPeak = clamp((peak - 0.5) * 2 * centerHalf * taper, -peakLimit, peakLimit);

  // the seed the sweeps start from; overwritten on the first pass in every case that draws
  let endL = calcCrownEndAt(centerHalf, width, depth, halfWidth * (1 - 1e-3));
  let endR = endL;
  let takeL: ArchTakeoff | null = null;
  let takeR: ArchTakeoff | null = null;

  // a centred crown on mirrored points lands alike on both sides: one solve, both ends together
  let symmetric = Math.abs(xPeak) < 1e-9 && (row.kind === 'catenary' || (row.left.length === row.right.length
    && row.left.every((k, i) => k.x === row.right[i].x && k.z === row.right[i].z)));

  // each landing nudges the other side's arrival slope; the coupling decays along the knots, so a
  // few rounds settle it
  if (symmetric) {
    takeR = takeL = solveCrownSideTakeoff(archH, xPeak, frame, row, centerHalf, width, depth, 1, endL, endR, true);
    if (takeR) endR = endL = calcCrownEndAt(centerHalf, width, depth, takeR.contactS);
  } else for (let i = 0; i < 4; i++) {
    let before = [takeR?.contactS, takeL?.contactS];
    takeR = solveCrownSideTakeoff(archH, xPeak, frame, row, centerHalf, width, depth, 1, endL, endR, false);
    if (takeR) endR = calcCrownEndAt(centerHalf, width, depth, takeR.contactS);
    takeL = solveCrownSideTakeoff(archH, xPeak, frame, row, centerHalf, width, depth, -1, endL, endR, false);
    if (takeL) endL = calcCrownEndAt(centerHalf, width, depth, takeL.contactS);
    if (before[0] === takeR?.contactS && before[1] === takeL?.contactS) break;
  }

  let profile = row.kind === 'knots' ? buildCrownProfile(archH, xPeak, frame, row.left, row.right, endL, endR) : null;
  let zAt = (x: number): number => {
    if (x >= -endL.xEnd && x <= endR.xEnd) {
      return isCatenary ? catenarySideZAt(archH, x < 0 ? endL.zEnd : endR.zEnd, x < 0 ? endL.xEnd : endR.xEnd, x) : profile!(x);
    }
    // past the arch's reach the channel is the surface, and past that the flat land
    return channelProfileZAt(centerHalf - Math.abs(x), width, depth);
  };

  return {
    centerHalf, halfWidth, width, archH, xPeak,
    left: takeL, right: takeR,
    xEndLeft: endL.xEnd, xEndRight: endR.xEnd,
    innerEdge: frame.innerEdge,
    datumLeft: calcCrownKnotHeight(archH, frame, endL, 0), datumRight: calcCrownKnotHeight(archH, frame, endR, 0),
    zAt,
  };
}

// the module guide for a station's crown: what it was built from rather than what it came out as.
// Authored points are marked where they land on the fixed frame; a cycloid draws its generating
// circle instead; every type gets the datums, the takeoffs and the crown
export interface CrossArchGuide {
  knots: { x: number; z: number; base: number }[];
  circles: { centerZ: number; radius: number }[];
  baselines: { fromX: number; toX: number; z: number }[];
  takeoffs: Pt[];
  peakZ: number;
}

export function buildCrossArchGuide(shape: CrossArchShape, section: CrossArchSection): CrossArchGuide {
  let out: CrossArchGuide = { knots: [], circles: [], baselines: [], takeoffs: [], peakZ: section.archH };
  for (let side of [-1, 1] as const) {
    let xEnd = side < 0 ? section.xEndLeft : section.xEndRight;
    let base = side < 0 ? section.datumLeft : section.datumRight;
    let hEff = section.archH - base;
    let frameEnd = shape.type === 'spline' ? section.innerEdge : xEnd;
    out.baselines.push({ fromX: side * frameEnd, toX: section.xPeak, z: base });
    out.takeoffs.push(new Pt(side * xEnd, section.zAt(side * xEnd)));
    if (shape.type === 'cycloid') {
      // a cycloid of rise hEff and factor d is traced by a circle of radius hEff/(2d) rolling at
      // half that rise; under 0.01 it has flattened to a raised cosine and the circle runs off
      if (shape.d > 0.01) out.circles.push({ centerZ: base + hEff / 2, radius: hEff / (2 * shape.d) });
    } else if (shape.type === 'spline') {
      for (let k of calcCrossArchKnots(shape, side)) out.knots.push({ x: crossArchKnotX(section, side, k.x), z: base + k.z * hEff, base });
    }
  }
  return out;
}

// outermost |x| where a station line crosses a loop; only ever asked of the channel centreline,
// which is inset far enough that it is a single span at every station
export function loopHalfChordAtY(poly: Pt[], y: number): number | null {
  let xs = polylineCrossingsAtY(poly, y);
  return xs.length ? Math.max(...xs.map(Math.abs)) : null;
}

// the solved transverse section at a station, or null where the plate has no channel to land on
export function sectionAt(surface: PlateSurface, y: number): CrossArchSection | null {
  let centerHalf = loopHalfChordAtY(surface.centerPoly, y);
  if (centerHalf === null) return null;
  let { width } = gougeAtY(surface.gouge, y);
  // measured at the joint, where the sign-of-x ambiguity lives: the half chord through the body,
  // falling away as the channel wraps round each cap
  let chordFrac = centerHalf > 1e-9 ? closestPointToPolylineIndexed({ x: 0, y }, surface.centerIdx).dist / centerHalf : 1;
  // the crown the cross shape hangs from: the long arch's height, or the channel's depth past it
  let archH = surface.longArch ? longArchHeightAt(surface.longArch, y) : 0;
  return solveCrossArchSection(archH, centerHalf, width, surface.gouge.depth, surface.resolveCross(y), chordFrac);
}

// half width of the run of plate the centreline sits in at a station
export function plateHalfChordAtY(poly: Pt[], y: number): number | null {
  return calcHalfChord(polylineCrossingsAtY(poly, y));
}

// what one station row shares between every sample on it: the chords, and the section, which
// runs a root-find per side
export function rowAt(surface: PlateSurface, y: number): SurfaceRow {
  let outerCrossings = polylineCrossingsAtY(surface.outline, y);
  return {
    outerCrossings,
    outerHalf: calcHalfChord(outerCrossings),
    landCrossings: polylineCrossingsAtY(surface.flutingEdge, y),
    section: sectionAt(surface, y),
    centerCrossings: polylineCrossingsAtY(surface.centerPoly, y),
  };
}

// signed distance from the channel centreline, the s the channel section reads, positive toward
// the plate's centre. By true distance, so a station cutting the channel obliquely still reads it
// one gouge wide
function channelDistanceAt(surface: PlateSurface, row: SurfaceRow, x: number, y: number): number {
  let d = closestPointToPolylineIndexed({ x, y }, surface.centerIdx).dist;
  return isInsideCrossings(x, row.centerCrossings) ? d : -d;
}

// the s the arch landed at on this side of the joint
function archContactDistanceAt(section: CrossArchSection, x: number): number {
  return (x < 0 ? section.left : section.right)?.contactS ?? section.halfWidth;
}

// the corner smoothing over whatever the channel left, only ever outboard of where the arch
// landed, so a minimum here can only deepen and the arch and the gouge's arc against it stay as
// cut. Outside the fluting edge is the flat land, untouched
function applyCornerPass(surface: PlateSurface, row: SurfaceRow, x: number, y: number, s: number, z: number, from = 0): number {
  if (s >= from || !surface.gouge.cornerGouge) return z;
  if (!isInsideCrossings(x, row.landCrossings)) return z;
  let edgeDist = closestPointToPolylineIndexed({ x, y }, surface.flutingEdgeIdx).dist;
  return Math.min(z, cornerSmoothZAt(s, edgeDist, gougeAtY(surface.gouge, y).width, surface.gouge.depth, from));
}

// the height at (x, y) relative to the plate's outer surface, null off the plate. The channel goes
// by true distance to the centreline, the arch by station chord, blended across the handover: by
// distance the handover is exact, but a distance field carries a medial axis that would stamp
// creases into the dome, so it is chord by a third of the way in. Scheduled on the distance, since
// near the caps the handover happens at the joint where the chord reads all the way in; the crown
// is centred wherever this leans on distance, so the sign of x picking a flank is harmless there
export function surfaceZAt(surface: PlateSurface, x: number, y: number, row = rowAt(surface, y)): number | null {
  if (!isOnOrInsideCrossings(x, row.outerCrossings)) return null;
  let s = channelDistanceAt(surface, row, x, y);
  let section = row.section;
  if (section) {
    let contact = archContactDistanceAt(section, x);
    if (s >= contact) {
      let xEnd = x < 0 ? section.xEndLeft : section.xEndRight;
      let span = section.centerHalf - contact;
      let tDist = span > 1e-9 ? clamp((s - contact) / span, 0, 1) : 1;
      let tChord = xEnd > 1e-9 ? clamp(1 - Math.abs(x) / xEnd, 0, 1) : 1;
      let w = calcChordTrust(tDist);
      let t = (1 - w) * tDist + w * tChord;
      return section.zAt((x < 0 ? -1 : 1) * xEnd * (1 - t));
    }
    return applyCornerPass(surface, row, x, y, s, channelProfileZAt(s, section.width, surface.gouge.depth), Math.min(contact, 0));
  }
  // past the long arch's reach there is no crown, but the channel still runs through the caps
  return applyCornerPass(surface, row, x, y, s, channelProfileZAt(s, gougeAtY(surface.gouge, y).width, surface.gouge.depth));
}

export type SurfacePart = 'arch' | 'channel' | 'land';

// the surface at a station edge to edge, split into runs by what carved each: the same height
// field the overlays slice, so the section can't disagree with them at the corners
export function calcSectionRuns(surface: PlateSurface, y: number, stepMm = 0.25): { part: SurfacePart; pts: Pt[] }[] {
  let row = rowAt(surface, y);
  let half = row.outerHalf;
  if (half === null) return [];
  let section = row.section;
  let n = Math.max(8, Math.ceil((2 * half) / stepMm));
  let runs: { part: SurfacePart; pts: Pt[] }[] = [];
  for (let i = 0; i <= n; i++) {
    let x = -half + (2 * half * i) / n;
    let z = surfaceZAt(surface, x, y, row)!;
    let part: SurfacePart = !isInsideCrossings(x, row.landCrossings) ? 'land'
      : section && channelDistanceAt(surface, row, x, y) >= archContactDistanceAt(section, x) ? 'arch' : 'channel';
    let pt = new Pt(x, z);
    let last = runs[runs.length - 1];
    if (last?.part === part) last.pts.push(pt);
    else runs.push({ part, pts: last ? [last.pts[last.pts.length - 1], pt] : [pt] });
  }
  return runs;
}

// the surface as the samplers read it, one row's crossings and section shared down the row
export function buildSurfaceField(surface: PlateSurface): RowSampledField<SurfaceRow> {
  return {
    rowAt: y => rowAt(surface, y),
    halfAt: row => row.outerHalf,
    zAt: (x, y, row) => surfaceZAt(surface, x, y, row),
  };
}

// sampling steps scaled against a standard violin so the rendered density holds across the size
// range. The contour grid is held against the level spacing: finer costs time without changing
// the map
const REFERENCE_BODY_HEIGHT = 350;
const REFERENCE_BODY_WIDTH = 200;
const REFERENCE_ARCH_HEIGHT = 15;

export function calcWireframeSampleSteps(p: ViolinFamilyParams): { stationStepMm: number; sampleStepMm: number } {
  return {
    stationStepMm: clamp(4 * (p.body.height / REFERENCE_BODY_HEIGHT), 2, 15),
    sampleStepMm: clamp(1.5 * (p.body.width / REFERENCE_BODY_WIDTH), 0.75, 5),
  };
}

export function calcContourSampleSteps(p: ViolinFamilyParams, archHeight: number): { stepMm: number; gridMm: number } {
  let areaScale = Math.sqrt((p.body.width * p.body.height) / (REFERENCE_BODY_WIDTH * REFERENCE_BODY_HEIGHT));
  return { stepMm: clamp(archHeight / REFERENCE_ARCH_HEIGHT, 0.5, 6), gridMm: clamp(2 * areaScale, 0.75, 4) };
}

// the contour map over the whole plate, both halves evaluated since the outline is symmetric but
// the surface need not be, each ring lifted to its level for the projection
export function buildSurfaceContours(p: ViolinFamilyParams, surface: PlateSurface, stepMm: number, gridMm: number): SurfaceContours {
  let box = { xMax: p.body.width / 2 + p.body.overhang + p.body.rib + 2, yMin: -1, yMax: p.body.height + 1 };
  let levels = buildContourRings(buildSurfaceField(surface), surface.outline, box, stepMm, gridMm)
    .map(({ level, rings }) => ({ level, rings: rings.map(ring => ring.map(([x, ry]) => new Pt3D(x, ry, level))) }));
  return { levels, outline: surface.outline.map(pt => new Pt3D(pt.x, pt.y, 0)) };
}

export function wireframeStripAt(surface: PlateSurface, y: number, sampleStep: number): WireframeStrip | null {
  return buildWireframeStrip(buildSurfaceField(surface), y, rowAt(surface, y), sampleStep);
}

// a later panel reads the surfaces by calling this; it returns and never writes to the params.
// Each plate's last surface is kept against the params it reads (~90ms a plate, asked for on every
// cursor move); nothing of it reaches the file
let last: Record<Plate, { key: string; surface: PlateSurface | null; failures: CrossArchingFailure[] } | null> = { top: null, back: null };

export function solveCrossArching(p: ViolinFamilyParams): CrossArchingSolve | null {
  if (!p.arching || !p.fluting) return null;
  let s: CrossArchingSolve = { top: null, back: null, failures: [] };
  for (let plate of ['top', 'back'] as const) {
    let key = JSON.stringify([p.body, p.bouts, p.corners, p.plateContour, p.fluting, p.arching[plate]]);
    if (last[plate]?.key !== key) last[plate] = { key, ...solvePlateSurface(p, plate) };
    s[plate] = last[plate]!.surface;
    s.failures.push(...last[plate]!.failures);
  }
  return s;
}

// one plate's surface from the loops the earlier stages solved, the gouge and the crown; a plate
// whose crown fields don't make a shape has no surface and says why. A plate whose long arch
// failed still has its channel, cut before any arching exists
function solvePlateSurface(p: ViolinFamilyParams, plate: Plate): { surface: PlateSurface | null; failures: CrossArchingFailure[] } {
  let failures: CrossArchingFailure[] = [];
  let surface: PlateSurface | null = null;
  let label = plate === 'top' ? 'Top plate' : 'Back plate';
  solveSection(failures, label, [plate], () => {
    let pa = p.arching![plate];
    let cross = pa.cross;
    let f = solveFluting(p)!;
    let o = solvePlateContour(p)!;
    let channel = f[plate];
    let outline = plate === 'top' ? o.top : o.back;
    if (!channel || !outline || !f.flutingEdge) return buildMiss(`${label}: the fluting channel has to solve first.`, [plate]);
    if (!(pa.thickness > 0 && pa.long.height > 0)) return buildMiss(`${label}: the long arch has to solve first.`, [plate]);

    let shapes: CrossShapeParams[] = [cross, ...cross.stations];
    let zFloor = calcCrownFloor(pa.thickness, pa.long.height);
    for (let shape of shapes) {
      // a cleared field reads as 0 against a range, so it is asked for first
      let typed = [shape.d, shape.pct, shape.peak, ...shape.points.flatMap(pt => [pt.x, pt.z])];
      if (!typed.every(Number.isFinite)) return buildMiss(`${label}: every crown field needs a value.`, [plate]);
      if (cross.type === 'cycloid') {
        if (!(shape.d >= 0 && shape.d <= 100)) return buildMiss(`${label}: the cycloid factor has to sit between 0 and 100.`, [plate]);
        if (!(shape.pct >= 5 && shape.pct <= calcCycloidPctMax(pa.thickness, pa.long.height)))
          return buildMiss(`${label}: the cycloid's percent has to sit between 5 and ${calcCycloidPctMax(pa.thickness, pa.long.height)}; past that its ends dip deeper than the plate is thick.`, [plate]);
      }
      if (cross.type === 'spline') {
        if (!(shape.peak >= 30 && shape.peak <= 70)) return buildMiss(`${label}: the crown has to sit between 30% and 70% of the width.`, [plate]);
        for (let pt of shape.points) {
          if (!(pt.x >= 0 && pt.x <= 100) || Math.abs(pt.x - 50) < 1) return buildMiss(`${label}: every point has to sit between 0% and 100% of the width, and at least 1% off the joint.`, [plate]);
          if (!(pt.z <= 100)) return buildMiss(`${label}: a point stands above the crown. 100% is its ceiling.`, [plate]);
          if (!(pt.z >= zFloor)) return buildMiss(`${label}: a point dips deeper than the plate is thick.`, [plate]);
        }
      }
    }
    for (let [i, st] of cross.stations.entries()) {
      if (!Number.isFinite(st.y)) return buildMiss(`${label}: every station needs a position.`, [plate]);
      if (!(st.y >= STATION_MARGIN_MM && st.y <= p.body.height - STATION_MARGIN_MM)) return buildMiss(`${label}: a station sits outside the body.`, [plate]);
      if (cross.stations.some((other, j) => j !== i && Math.abs(other.y - st.y) <= STATION_MERGE_EPS_MM)) return buildMiss(`${label}: two stations sit on top of each other at ${st.y}mm.`, [plate]);
    }

    let g = p.fluting![plate];
    let gouge: SurfaceGouge = {
      width: g.width, depth: g.depth, cBoutWidth: g.useCBoutGouge ? g.cBoutWidth : g.width,
      cornerGouge: p.fluting!.cornerGouge, lowerCornerY: p.corners!.LCr.y, upperCornerY: p.corners!.UCr.y,
    };
    let flutingEdge = samplePathToPolyline(f.flutingEdge);
    let centerPoly = samplePathToPolyline(channel.center, 1);
    surface = {
      outline: samplePathToPolyline(outline),
      flutingEdge,
      flutingEdgeIdx: buildPolylineIndex(flutingEdge),
      centerPoly,
      centerIdx: buildPolylineIndex(centerPoly),
      gouge,
      resolveCross: buildCrossArchResolver(cross, p.body.height),
      longArch: solveLongArching(p)![plate],
    };
    return null;
  });
  return { surface, failures };
}
