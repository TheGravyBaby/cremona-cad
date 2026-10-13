import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as d3 from 'd3';
import * as polygonClipping from 'polygon-clipping';
import { clamp, normalizeDegrees, smoothstep } from '../../../../helpers/math/simpleGeometry';
import {
  buildPolylineIndex, buildProjection, closestPointToPolylineIndexed, cycloidZAt, catenaryZAt, makeC2SplineWithFlatKnot, makeMonotoneSpline,
  projectedBounds,
} from '../../../../helpers/math/vibeMath';
import { projectedPath, samplePathToPolyline } from '../../../../helpers/math/pathMath';
import {
  renderCircle, renderDashedLine, renderGuideBaseline, renderGuideKnot, renderGuideMeasure, renderPath, renderPointHalo, renderRect, renderSegment,
  renderSolveFailures,
} from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { readWorkingState, writeWorkingState } from '../../../../helpers/workingStorage';
import { showFieldHelp } from '../../../../docs/field-help';
import { Circle, Pt, Pt3D, Rectangle } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { DASH, STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  ArchTakeoff, CrossArchingFailure, CrossArchingSolve, CrossArchKnot, CrossArchParams, CrossArchRow, CrossArchSection, CrossShapeParams,
  CrossStationParams, Plate, PlateSurface, RenderLayer, SurfaceGouge, SurfaceRow, ViolinFamilyPanel, ViolinFamilyParams,
  ViolinFamilyToggleKey, ViolinFamilyViewFlags,
} from '../../violin-family-types';
import { gougeHalfWidth, gougeProfileZ, renderFluting, solveFluting } from '../fluting-panel/fluting-panel';
import { purflingPath, renderOuterContour, ribArcs, solveOuterContour, PLATE_LAYOUT_GAP } from '../outer-contour-panel/outer-contour-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import {
  archZAt, BACK_ARCH_INK, CHANNEL_INK, ribHeightAt, solveArchTakeoff, solveLongArching, TOP_ARCH_INK,
} from '../long-arching-panel/long-arching-panel';

// The crown across the plate, and the surface the whole arching comes to. The maker authors only
// the crown; where it stops, the run-out into the channel, is solved the way the long arch's ends
// are. A plate's crown is one shape everywhere unless stations are set, which it then ramps
// through. The surface is a height field z(x, y): the channel cut first at the gouge's own section,
// measured by true distance to its centreline so it is one gouge wide the whole way round, the
// arch inboard of where it lands, the corners smoothed down by hand to meet the channel.
//
// Panel and renders, then the crown (knots, the ramp between stations, the section at a station),
// then the surface (rows, heights, contours, wireframe), then the solve.

const polyClipper: any = (polygonClipping as any).default ?? polygonClipping;

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

interface ContourLevel { level: number; rings: Pt3D[][] }

// what has been sampled off one plate's surface, kept while that surface object stands
interface Sampled {
  surface: PlateSurface;
  contours: { levels: ContourLevel[]; outline: Pt3D[] } | null;
  wireframe: WireframeGeometry | null;
}

@Component({
  selector: 'app-vf-cross-arching-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './cross-arching-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class CrossArchingPanel implements ViolinFamilyPanel, OnInit, OnDestroy {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('iceAndFire');
  protected readonly help = showFieldHelp;
  protected readonly plates: readonly Plate[] = ['top', 'back'];

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the template's readouts and report() read it
  s!: CrossArchingSolve;
  section: Record<Plate, CrossArchSection | null> = { top: null, back: null };

  view: CrossArchingView = { cursorY: null, overlay: { top: 'none', back: 'none' }, rotX: -30, rotY: -10, rotZ: 0 };
  private sampled: Record<Plate, Sampled | null> = { top: null, back: null };
  highlighted: { plate: Plate; index: number } | null = null;
  dragging = false;
  private dragLast = { x: 0, y: 0 };

  ngOnInit(): void {
    try {
      this.view = { ...this.view, ...JSON.parse(readWorkingState(VIEW_KEY) ?? '{}') };
    } catch { /* a fresh tab */ }
    // first open sights the waist
    this.view.cursorY ??= Math.round(this.params.bouts!.C0Y);
    this.draw();
  }

  ngOnDestroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  report(): void {
    reportFailures(this.s.failures, 'Cross arching');
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let o = solveOuterContour(p)!;
      let f = solveFluting(p)!;
      let s = this.s = solveCrossArching(p)!;
      let y = this.cursorY;
      for (let plate of this.plates) {
        let surface = s[plate];
        this.section[plate] = surface ? sectionAt(surface, y) : null;
        if (surface && this.sampled[plate]?.surface !== surface) this.sampled[plate] = { surface, contours: null, wireframe: null };
        if (!surface) this.sampled[plate] = null;
      }
      let dx = -p.body.width * PLATE_LAYOUT_GAP;
      let stationLine = renderDashedLine(new Pt(dx - p.body.width / 2 - 10, y), new Pt(p.body.width / 2 + 10, y), this.pal.neutral, DASH.guide, STROKE_WEIGHT.guide, 0.7);
      this.drawn.emit([
        renderOuterContour(p, o, this.pal, this.flags, false),
        renderFluting(p, f, this.pal, false),
        renderFholes(p, this.pal),
        stationLine,
        this.sectionView(y),
        ...this.overlayLayers(y),
        renderSolveFailures(s.failures, this.pal.alert),
      ]);
    });
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
    this.draw();
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
    return bodyLandmarks(this.params).map(m => ({ label: m.code, title: `${m.name}, ${m.y}mm`, y: m.y, left: this.trackOffset(m.y) }));
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
    return this.active(plate) ?? nearestCrossArchShape(this.params.arching![plate].cross, this.cursorY, this.params.body.height);
  }

  shownLabel(plate: Plate): string {
    let y = (this.shown(plate) as CrossStationParams).y;
    return y === undefined ? 'the base shape' : `station ${y}mm`;
  }

  // pins the shape shown here as a station, so later edits to the base leave it alone
  setStation(plate: Plate): void {
    let cross = this.params.arching![plate].cross;
    let shape = this.shown(plate);
    cross.stations.push({ y: this.cursorY, d: shape.d, pct: shape.pct, peak: shape.peak, points: shape.points.map(pt => ({ ...pt })) });
    cross.stations.sort((a, b) => a.y - b.y);
    this.edited();
  }

  removeStation(plate: Plate, index: number): void {
    this.params.arching![plate].cross.stations.splice(index, 1);
    this.edited();
  }

  // partway from the outermost point toward the channel, half its height, mirrored
  addPoint(plate: Plate): void {
    let shape = this.active(plate);
    if (!shape) return;
    let outermost = shape.points.reduce((m, pt) => Math.max(m, Math.abs(pt.x - 50)), 0);
    let outer = shape.points.find(pt => Math.abs(pt.x - 50) === outermost);
    let x = outermost > 0 ? (outermost + 50) / 2 : 25;
    shape.points.push({ x: +(50 + x).toFixed(0), z: +((outer?.z ?? 100) / 2).toFixed(0), mirror: true });
    this.edited();
  }

  removePoint(plate: Plate, index: number): void {
    this.active(plate)?.points.splice(index, 1);
    this.edited();
  }

  // the lowest a point may dip, % of the arch height: the plate's thickness
  zFloor(plate: Plate): number {
    let pa = this.params.arching![plate];
    return -100 * pa.thickness / Math.max(pa.arch.height, pa.thickness);
  }

  pctMax(plate: Plate): number {
    return cycloidPctMax(this.params.arching![plate].thickness, this.params.arching![plate].arch.height);
  }

  // one overlay at a time across both plates: the sampling is the costly part
  toggleOverlay(plate: Plate, mode: OverlayMode): void {
    let other: Plate = plate === 'top' ? 'back' : 'top';
    let next = this.view.overlay[plate] === mode ? 'none' : mode;
    this.view.overlay[plate] = next;
    if (next !== 'none') this.view.overlay[other] = 'none';
    this.saveView();
    this.draw();
  }

  focus(plate: Plate, index: number): void {
    this.highlighted = { plate, index };
    this.draw();
  }

  blur(): void {
    this.highlighted = null;
    this.draw();
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
    this.draw();
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.saveView();
    this.draw();
  };

  // the surface above the body, as a contour map or a wireframe, the cursor's station drawn across
  // it. Sampled once per surface and projected on every draw, which is what makes a rotation drag
  // cheap. The back's height field folds downward
  private overlayLayers(y: number): RenderLayer[] {
    let p = this.params;
    let a = p.arching!;
    let pal = this.pal;
    let layers: RenderLayer[] = [];
    // above the plan, over the plate it is the surface of
    let yOffset = p.body.height + 40;
    for (let plate of this.plates) {
      let mode = this.view.overlay[plate];
      let c = this.sampled[plate];
      if (mode === 'none' || !c) continue;
      let surface = c.surface;
      let xOffset = plate === 'top' ? 0 : -p.body.width * PLATE_LAYOUT_GAP;
      let proj = buildProjection(yOffset, p.body.height / 2, this.view.rotX, this.view.rotY, this.view.rotZ, plate === 'top' ? 1 : -1, xOffset);
      let color = pal.ink(plate === 'top' ? TOP_ARCH_INK : BACK_ARCH_INK);
      let { stationStepMm, sampleStepMm } = wireframeSampleSteps(p);
      let bounds;

      if (mode === 'contours') {
        if (!c.contours) {
          let { stepMm, gridMm } = contourSampleSteps(p, a[plate].arch.height);
          c.contours = {
            levels: contourRings(p, surface, stepMm, gridMm).map(({ level, rings }) => ({ level, rings: rings.map(ring => ring.map(([x, ry]) => new Pt3D(x, ry, level))) })),
            outline: surface.outline.map(pt => new Pt3D(pt.x, pt.y, 0)),
          };
        }
        let { levels, outline } = c.contours;
        layers.push(renderPath(projectedPath(proj, outline, true), pal.neutral, STROKE_WEIGHT.guide, 0.6));
        for (let { level, rings } of levels) {
          let d = rings.map(ring => projectedPath(proj, ring, true)).join(' ');
          layers.push(renderPath(d, level <= 0 ? pal.ink(CHANNEL_INK) : color, STROKE_WEIGHT.guide, level <= 0 ? 0.9 : 0.7));
        }
        bounds = projectedBounds(proj, levels.flatMap(l => l.rings.flat()));
      } else {
        c.wireframe ??= wireframeGeometry(surface, p.body.height, stationStepMm, sampleStepMm);
        let { strips, ribs } = c.wireframe;
        for (let rib of ribs) layers.push(renderPath(projectedPath(proj, rib), pal.neutral, STROKE_WEIGHT.guide * 0.6, 0.45));
        for (let strip of strips) {
          let channel = strip.maxZ < -0.01;
          layers.push(renderPath(projectedPath(proj, strip.pts), channel ? pal.ink(CHANNEL_INK) : color, STROKE_WEIGHT.guide * 0.75, channel ? 0.5 : 0.65));
        }
        bounds = projectedBounds(proj, [...strips.flatMap(st => st.pts), ...ribs.flat()]);
      }

      let cursor = wireframeStripAt(surface, y, sampleStepMm);
      if (cursor) layers.push(renderPath(projectedPath(proj, cursor.pts), pal.neutral, STROKE_WEIGHT.section));
      let pad = 4;
      let dragging = this.dragging, onPointerDown = this.onPointerDown;
      layers.push((g: any) => {
        g.append('rect')
          .attr('x', bounds.minX - pad).attr('y', bounds.minY - pad)
          .attr('width', bounds.maxX - bounds.minX + 2 * pad).attr('height', bounds.maxY - bounds.minY + 2 * pad)
          .attr('fill', 'transparent').attr('stroke', pal.neutral).attr('stroke-width', STROKE_WEIGHT.guide)
          .attr('stroke-dasharray', DASH.preview).attr('vector-effect', 'non-scaling-stroke')
          .style('pointer-events', 'all').style('cursor', dragging ? 'grabbing' : 'grab')
          .on('pointerdown', onPointerDown);
      });
    }
    return layers;
  }

  // the transverse section at the cursor, both plates on the one rib box, drawn under the top
  // plate. Widths come off the sampled outlines, not the arcs: at the corners the plate edge rounds
  // on a cubic no arc query finds, and the back's button is in the loop
  private sectionView(y: number): RenderLayer {
    let p = this.params;
    let a = p.arching!;
    let s = this.s;
    let ribs = solveLongArching(p)!.ribs;
    let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
    let ribOutline = rib ? purflingPath(p, rib, 0) : null;
    let ribHalf = ribOutline ? plateHalfChordAtY(samplePathToPolyline(ribOutline), y) : null;
    let halves = { top: s.top ? plateHalfChordAtY(s.top.outline, y) : null, back: s.back ? plateHalfChordAtY(s.back.outline, y) : null };
    if (!ribs || (halves.top === null && halves.back === null)) return () => {};
    let ribZ = ribHeightAt(p, y, ribs);
    // held still as the cursor scrubs, its top clearing the plate by the tallest the section can stand
    let dy = -(Math.max(ribs.zLower, ribs.zUpper) + a.top.thickness + a.top.arch.height + 20);

    let parts: RenderLayer[] = [];
    if (ribHalf !== null) {
      parts.push(renderRect(new Rectangle(new Pt(-ribHalf, 0), new Pt(ribHalf, ribZ)), this.pal.neutral, 'none', STROKE_WEIGHT.guide));
      for (let sx of [-1, 1]) parts.push(renderSegment(new Pt(sx * (ribHalf - p.body.rib), 0), new Pt(sx * (ribHalf - p.body.rib), ribZ), this.pal.neutral, STROKE_WEIGHT.guide));
    }
    for (let plate of this.plates) {
      let half = halves[plate];
      let surface = s[plate];
      if (half === null || !surface) continue;
      let isTop = plate === 'top';
      let sign: 1 | -1 = isTop ? 1 : -1;
      let innerZ = isTop ? ribZ : 0;
      let zBase = innerZ + sign * a[plate].thickness;
      let color = this.pal.ink(isTop ? TOP_ARCH_INK : BACK_ARCH_INK);
      parts.push(renderSegment(new Pt(-half, innerZ), new Pt(half, innerZ), this.pal.neutral, STROKE_WEIGHT.guide));
      for (let side of [1, -1]) parts.push(renderSegment(new Pt(side * half, innerZ), new Pt(side * half, zBase), this.pal.neutral, STROKE_WEIGHT.guide));

      // split by what carved it: the land neutral, the channel in the channel's ink, the arch in
      // the plate's own. One continuous surface; the pen changes at the contact
      let pen = { land: [this.pal.neutral, STROKE_WEIGHT.guide], channel: [this.pal.ink(CHANNEL_INK), STROKE_WEIGHT.section], arch: [color, STROKE_WEIGHT.section] } as const;
      for (let run of sectionRuns(surface, y)) {
        parts.push(renderPath(run.pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${zBase + sign * pt.y}`).join(' '), pen[run.part][0], pen[run.part][1]));
      }
      let section = this.section[plate];
      if (!section) continue;

      let shape = this.shown(plate);
      let type = a[plate].cross.type;
      if (this.highlighted?.plate === plate && type === 'spline') {
        let pt = shape.points[this.highlighted.index];
        if (pt) {
          let side: 1 | -1 = pt.x < 50 ? -1 : 1;
          let xs = pt.mirror ? [1, -1] as const : [side];
          for (let sd of xs) {
            let x = crossArchKnotX(section, sd, Math.abs(pt.x - 50) / 50);
            parts.push(renderPointHalo(new Pt(x, zBase + sign * section.zAt(x)), color));
          }
        }
      }
      if (this.flags.showModuleGuides) {
        // what the crown was built from, points or the cycloid's generating circle, measured up
        // from plate level, the level the percentages count from
        let guide = crossArchGuide(crossShape(shape, type), section);
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
    return (g: any, ui: any): void => {
      let frame = { g: g.append('g').attr('transform', `translate(0,${dy})`), ui: ui.append('g').attr('transform', `translate(0,${-dy})`) };
      for (let part of parts) part(frame.g, frame.ui);
    };
  }
}

// two stations closer than this are the same station; stations are held this far inside the ends
export const STATION_MERGE_EPS_MM = 0.5;
export const STATION_MARGIN_MM = 1;

// past 1 the window runs beyond the cusp, so the ends curl under the takeoff; 1.5 dips a full rise
export const CYCLOID_MAX_PCT = 1.5;

// past 100% the ends dip by tan²(q·π/2) of the rise for q = pct - 1; held where that dip reaches the
// plate's thickness, like a point's height floor
export function cycloidPctMax(thickness: number, archHeight: number): number {
  let dip = thickness / Math.max(archHeight, thickness);
  return Math.round(100 * Math.min(1 + (2 / Math.PI) * Math.atan(Math.sqrt(dip)), CYCLOID_MAX_PCT));
}

// a named position along the body a maker sights a section against: the two widest points, the
// two corners and the waist, all already in the recipe rather than read back off the outline.
// One outside the body is dropped, not clamped
export interface BodyLandmark { code: 'LB' | 'LC' | 'C' | 'UC' | 'UB'; name: string; y: number }

export function bodyLandmarks(p: ViolinFamilyParams): BodyLandmark[] {
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

export function crossShape(c: CrossShapeParams, type: CrossArchParams['type'], y?: number): CrossArchShape {
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
export function crossArchKnots(shape: CrossArchShape, side: 1 | -1): CrossArchKnot[] {
  if (shape.type === 'cycloid') return cycloidCrownKnots(shape.d, shape.pct);
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
function cycloidCrownKnots(d: number, pct: number): CrossArchKnot[] {
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
export function nearestCrossArchShape(cross: CrossArchParams, y: number, bodyHeight: number): CrossShapeParams {
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
function knotFunction(knots: CrossArchKnot[]): (x: number) => number {
  let f = makeMonotoneSpline([0, ...knots.map(k => k.x), 1], [1, ...knots.map(k => k.z), 0]);
  return x => f(clamp(x, 0, 1));
}

// ramps a plate's crown along the body. Two stations can carry different knot lists, so the union
// of their positions gives the correspondence: each shape contributes its own curve's value at a
// column it has no knot at. The base anchors both ends. The crown position ramps alongside as a
// scalar; it is the origin the fractions are measured from
export function makeCrossArchResolver(cross: CrossArchParams, bodyHeight: number): (y: number) => CrossArchRow {
  if (cross.type === 'catenary') return () => ({ left: [], right: [], catenary: true });
  let stations = [...cross.stations].sort((a, b) => a.y - b.y);
  let shapes = [crossShape(cross, cross.type), ...stations.map(st => crossShape(st, cross.type, st.y))];

  let sideTracks = (side: 1 | -1) => {
    let perShape = shapes.map(sh => crossArchKnots(sh, side));
    let xs = [...new Set(perShape.flat().map(k => +k.x.toFixed(4)))].sort((a, b) => a - b);
    if (!stations.length || bodyHeight <= 0) {
      let base = knotFunction(perShape[0]);
      return { xs, tracks: xs.map(x => { let v = base(x); return () => v; }) };
    }
    let ys = [0, ...stations.map(st => st.y), bodyHeight];
    let fns = perShape.map(knotFunction);
    return { xs, tracks: xs.map(x => { let baseZ = fns[0](x); return makeMonotoneSpline(ys, [baseZ, ...fns.slice(1).map(f => f(x)), baseZ]); }) };
  };
  let right = sideTracks(1);
  let left = sideTracks(-1);
  let read = (s: { xs: number[]; tracks: ((y: number) => number)[] }, y: number): CrossArchKnot[] => s.xs.map((x, i) => ({ x, z: Math.min(s.tracks[i](y), 1) }));

  let peakOf = (sh: CrossArchShape) => (sh.type === 'spline' ? sh.peak : 0.5);
  let peakTrack = stations.length && bodyHeight > 0
    ? makeMonotoneSpline([0, ...stations.map(st => st.y), bodyHeight], [peakOf(shapes[0]), ...shapes.slice(1).map(peakOf), peakOf(shapes[0])])
    : () => peakOf(shapes[0]);
  let fromTakeoff = cross.type === 'cycloid';
  return (y: number) => ({ left: read(left, y), right: read(right, y), peak: peakTrack(y), fromTakeoff });
}

// which gouge is cutting at a station: the C bout tool between the corners, else the main one,
// eased across each corner over one gouge width. A hard switch would be a step in sweep at an
// arbitrary station, a seam in the surface exactly at the corner
export function gougeAtY(g: SurfaceGouge, y: number): { sweepRadius: number; halfWidth: number } {
  let lo = Math.min(g.lowerCornerY, g.upperCornerY), hi = Math.max(g.lowerCornerY, g.upperCornerY);
  let band = Math.max(gougeHalfWidth(g.sweepRadius, g.depth), gougeHalfWidth(g.cBoutSweep, g.depth));
  let wC = smoothstep(y, lo - band, lo + band) * (1 - smoothstep(y, hi - band, hi + band));
  let sweepRadius = g.sweepRadius + wC * (g.cBoutSweep - g.sweepRadius);
  return { sweepRadius, halfWidth: gougeHalfWidth(sweepRadius, g.depth) };
}

// how far up the outer flank a landing must sit, in half widths, before the corner stretch eases out
const CORNER_EASE_BAND = 0.25;

// the corner smoothing as a height field: the wedge of flat wood the bypassing channel leaves at
// each corner, taken down by hand. The channel's outer flank stretched from `from` (the arch's
// contact when it lands past the trough, else the trough) out to the fluting edge, however far the
// corner has pulled it. Along the flanks the stretch is 1 and this is the channel itself. From a
// landing up the flank the stretch eases out, leaving at the flank's grade and flattening toward
// the edge, so the arch's climb runs out flat across the wedge instead of creasing. Never above
// the flank, so composing by minimum only removes wood
export function cornerSmoothZ(s: number, edgeDist: number, sweepRadius: number, depth: number, from = 0): number {
  let w = gougeHalfWidth(sweepRadius, depth);
  if (w <= 0 || s >= from || edgeDist <= 0) return 0;
  let left = w + from;
  let run = Math.max(edgeDist - s + from, left);
  let u = (from - s) / run;
  let stretch = run / left;
  let ease = 1 + (stretch - 1) * smoothstep(-from, 0, CORNER_EASE_BAND * w);
  return gougeProfileZ(from - left * (1 - Math.pow(1 - u, ease)), sweepRadius, depth);
}

interface SideEnd { xEnd: number; zEnd: number }

// what a crown's knots are measured against at one station: the wood before the cross arch is
// carved, so the frame never moves when a knot does. Across, from the joint to the channel's inner
// edge; every takeoff lands outboard of it. Up, from plate level as a fraction of the crown's
// height; where the crown hasn't climbed a couple of gouge depths clear (the cap recurve bands)
// the datum eases down onto each side's takeoff, `lift` 1 at plate level. A cycloid or catenary
// is a generated curve whose end is the takeoff, so with fromTakeoff both axes run to it
interface KnotFrame { innerEdge: number; lift: number; fromTakeoff: boolean; trough: number }

function knotHeight(archH: number, frame: KnotFrame, end: SideEnd, z: number): number {
  let datum = frame.fromTakeoff ? end.zEnd : (1 - frame.lift) * end.zEnd;
  return datum + z * (archH - datum);
}

// where a point fraction lands across the plate, measured from the joint rather than the crown so
// moving the crown doesn't drag the points along. The one place the fraction becomes a position
export function crossArchKnotX(section: CrossArchSection, side: 1 | -1, frac: number): number {
  return side * frac * section.innerEdge;
}

// the whole transverse profile as one spline: left takeoff, left knots, the crown, right knots,
// right takeoff. Built across the full width so the crown is an interior knot between secants of
// opposite sign, which the monotone filter zeroes into a smooth maximum; as an endpoint of a
// one-sided spline it would carry a slope and peak in a ridge. The transition is this spline's
// outermost segment, curvature-continuous with the rest for free. A point landing on the crown is
// held a hair clear rather than dropped, since a dropped point is a step in the arrival slope
function crossProfile(archH: number, xPeak: number, frame: KnotFrame, left: CrossArchKnot[], right: CrossArchKnot[], endL: SideEnd, endR: SideEnd): (x: number) => number {
  let place = (knots: CrossArchKnot[], end: SideEnd, side: 1 | -1) => knots
    .map(k => ({ x: side * k.x * (frame.fromTakeoff ? end.xEnd : frame.innerEdge), z: knotHeight(archH, frame, end, k.z) }))
    .filter(k => k.x > -endL.xEnd + 1e-6 && k.x < endR.xEnd - 1e-6);
  let inner = [...place(left, endL, -1), ...place(right, endR, 1)].sort((a, b) => a.x - b.x);

  const CROWN_GAP = 1e-4;
  let xs: number[] = [-endL.xEnd], zs: number[] = [endL.zEnd];
  for (let k of inner) if (k.x < xPeak) { xs.push(Math.min(k.x, xPeak - CROWN_GAP)); zs.push(k.z); }
  let crown = xs.length;
  xs.push(xPeak); zs.push(archH);
  for (let k of inner) if (k.x >= xPeak) { xs.push(Math.max(k.x, xPeak + CROWN_GAP)); zs.push(k.z); }
  xs.push(endR.xEnd); zs.push(endR.zEnd);

  // a centred crown is already curvature-continuous, its two flanks mirroring each other
  if (Math.abs(xPeak) < 1e-9) return makeMonotoneSpline(xs, zs);
  let smooth = makeC2SplineWithFlatKnot(xs, zs, crown);
  if (smooth && !breaksSpec(smooth, xs, zs, frame.trough)) return smooth;
  return makeMonotoneSpline(xs, zs);
}

// whether a smooth profile carves outside what was asked: above the highest height or below the
// channel's trough (a point set below it lowers the floor). Sampled about every millimetre, since
// a sag through the trough fits between quarter points of a long run into the channel
function breaksSpec(f: (x: number) => number, xs: number[], zs: number[], trough: number): boolean {
  let ceiling = Math.max(...zs) + 1e-4;
  let floor = Math.min(...zs, trough) - 1e-4;
  for (let i = 0; i < xs.length - 1; i++) {
    let n = Math.max(4, Math.ceil(xs[i + 1] - xs[i]));
    for (let j = 1; j < n; j++) {
      let v = f(xs[i] + (j / n) * (xs[i + 1] - xs[i]));
      if (v > ceiling || v < floor) return true;
    }
  }
  return false;
}

// a one-sided catenary from the crown out to xEnd, where it meets the channel at zEnd. Evaluated
// afresh at each xEnd the tangency search tries, since a catenary's shape depends on its
// height-to-span ratio; each side stands alone
function catenarySideZAt(archH: number, zEnd: number, xEnd: number, x: number): number {
  if (xEnd <= 0) return archH;
  let rise = archH - zEnd;
  return rise >= 0 ? zEnd + catenaryZAt(rise, 2 * xEnd, xEnd - Math.abs(x)) : zEnd - catenaryZAt(-rise, 2 * xEnd, xEnd - Math.abs(x));
}

// how much of a station its chord describes, from the distance from the joint to the nearest
// channel over the station's half chord. Through the body that is 1; approaching a cap the channel
// wraps across and the nearest one is ahead, not beside. The surface reads position by distance
// exactly where the chord stops describing the plate, and distance can't tell the two sides of the
// joint apart, so the crown's offset has to be gone wherever distance is leaned on: one curve for
// both, the offset only beginning once the blend has finished
const CHORD_TRUST_LO = 0.15;
const CHORD_TRUST_FULL = 0.5;
const CROWN_OFFSET_BAND = 0.2;

export function chordTrust(chordFrac: number): number {
  return smoothstep(chordFrac, CHORD_TRUST_LO, CHORD_TRUST_FULL);
}

export function crownOffsetTrust(chordFrac: number): number {
  return smoothstep(chordFrac, CHORD_TRUST_FULL, CHORD_TRUST_FULL + CROWN_OFFSET_BAND);
}

// how far above plate level the crown must climb, in gouge depths, before the ridge may sit fully
// where it was asked to: below that the section is mostly channel with a rumour of arch on top
const PEAK_TAPER_DEPTHS = 2;

// solves a station: the crown runs out from the peak until it meets the channel tangentially, once
// on each side. Both sides are solved even though the channel is symmetric, since an unmirrored
// point makes the crown asymmetric and the two contacts wander while the channel's outer edge
// stays put. The crown may sit below plate level (the recurve bands near the caps) and even below
// the trough, where both sides meet the outer flank. Its offset is tapered by how much crown there
// is and by how much the chord describes, smoothstepped so the ridge line carries no kink
export function solveCrossArchSection(archH: number, centerHalf: number, sweepRadius: number, depth: number, row: CrossArchRow, chordFrac = 1): CrossArchSection | null {
  let halfWidth = gougeHalfWidth(sweepRadius, depth);
  if (halfWidth <= 0 || centerHalf <= halfWidth) return null;
  let isCatenary = !!row.catenary;

  let t = clamp(archH / (PEAK_TAPER_DEPTHS * depth), 0, 1);
  let lift = t * t * (3 - 2 * t);
  let taper = lift * crownOffsetTrust(chordFrac);
  let frame: KnotFrame = { innerEdge: centerHalf - halfWidth, lift, trough: -depth, fromTakeoff: !!row.fromTakeoff || isCatenary };
  // the crown stays a strictly interior knot, well inside the innermost a takeoff can land
  let peakLimit = 0.9 * Math.max(centerHalf - halfWidth, 0);
  let xPeak = clamp(((row.peak ?? 0.5) - 0.5) * 2 * centerHalf * taper, -peakLimit, peakLimit);

  let endAt = (s: number): SideEnd => ({ xEnd: centerHalf - s, zEnd: gougeProfileZ(s, sweepRadius, depth) });
  // the seed the sweeps start from; overwritten on the first pass in every case that draws
  let endL = endAt(halfWidth * (1 - 1e-3));
  let endR = endL;
  let takeL: ArchTakeoff | null = null;
  let takeR: ArchTakeoff | null = null;

  // a centred crown on mirrored points lands alike on both sides: one solve, both ends together
  let symmetric = Math.abs(xPeak) < 1e-9 && row.left.length === row.right.length
    && row.left.every((k, i) => k.x === row.right[i].x && k.z === row.right[i].z);

  let solveSide = (side: 1 | -1): ArchTakeoff | null => {
    let slopeAt = (takeoffDepth: number, contactS: number): number => {
      let mine: SideEnd = { xEnd: centerHalf - contactS, zEnd: -takeoffDepth };
      if (mine.xEnd <= 1e-3) return 0;
      let eps = Math.max(mine.xEnd * 1e-4, 1e-6);
      // measured inward, matching the channel's own slope convention
      if (isCatenary) return (catenarySideZAt(archH, mine.zEnd, mine.xEnd, side * (mine.xEnd - eps)) - mine.zEnd) / eps;
      let f = symmetric ? crossProfile(archH, xPeak, frame, row.left, row.right, mine, mine)
        : side === 1 ? crossProfile(archH, xPeak, frame, row.left, row.right, endL, mine)
        : crossProfile(archH, xPeak, frame, row.left, row.right, mine, endR);
      return (f(side * (mine.xEnd - eps)) - mine.zEnd) / eps;
    };
    return solveArchTakeoff(sweepRadius, depth, slopeAt);
  };

  // both sides live on one spline, so each landing nudges the other's arrival slope; the coupling
  // decays along the knots, so a few sweeps settle it
  if (symmetric) {
    takeR = takeL = solveSide(1);
    if (takeR) endR = endL = endAt(takeR.contactS);
  } else for (let i = 0; i < 4; i++) {
    let before = [takeR?.contactS, takeL?.contactS];
    takeR = solveSide(1);
    if (takeR) endR = endAt(takeR.contactS);
    takeL = solveSide(-1);
    if (takeL) endL = endAt(takeL.contactS);
    if (before[0] === takeR?.contactS && before[1] === takeL?.contactS) break;
  }

  let profile = isCatenary ? null : crossProfile(archH, xPeak, frame, row.left, row.right, endL, endR);
  let zAt = (x: number): number => {
    if (x >= -endL.xEnd && x <= endR.xEnd) {
      return isCatenary ? catenarySideZAt(archH, x < 0 ? endL.zEnd : endR.zEnd, x < 0 ? endL.xEnd : endR.xEnd, x) : profile!(x);
    }
    // past the arch's reach the channel is the surface, and past that the flat land
    return gougeProfileZ(centerHalf - Math.abs(x), sweepRadius, depth);
  };

  return {
    centerHalf, halfWidth, sweepRadius, archH, xPeak,
    left: takeL, right: takeR,
    xEndLeft: endL.xEnd, xEndRight: endR.xEnd,
    innerEdge: frame.innerEdge,
    datumLeft: knotHeight(archH, frame, endL, 0), datumRight: knotHeight(archH, frame, endR, 0),
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

export function crossArchGuide(shape: CrossArchShape, section: CrossArchSection): CrossArchGuide {
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
      for (let k of crossArchKnots(shape, side)) out.knots.push({ x: crossArchKnotX(section, side, k.x), z: base + k.z * hEff, base });
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

// the long arch's height at a station, off the solved arch: the crown the cross shape hangs from
export function solvedLongArchHeightAt(surface: PlateSurface, y: number): number {
  let la = surface.longArch;
  if (!la) return 0;
  let s = y - la.yStart;
  if (s <= 0) return -la.takeoff.takeoffDepth;
  if (s >= la.span) return -la.farTakeoff.takeoffDepth;
  return archZAt(la.lowered, la.span, s, la.farZ) - la.takeoff.takeoffDepth;
}

// the solved transverse section at a station, or null where the plate has no channel to land on
export function sectionAt(surface: PlateSurface, y: number): CrossArchSection | null {
  let centerHalf = loopHalfChordAtY(surface.centerPoly, y);
  if (centerHalf === null) return null;
  let { sweepRadius } = gougeAtY(surface.gouge, y);
  // measured at the joint, where the sign-of-x ambiguity lives: the half chord through the body,
  // falling away as the channel wraps round each cap
  let chordFrac = centerHalf > 1e-9 ? closestPointToPolylineIndexed({ x: 0, y }, surface.centerIdx).dist / centerHalf : 1;
  return solveCrossArchSection(solvedLongArchHeightAt(surface, y), centerHalf, sweepRadius, surface.gouge.depth, surface.resolveCross(y), chordFrac);
}

// half width of the run of plate the centreline sits in at a station, bounded by the crossings
// either side of x = 0: where the outline turns a corner it runs nearly flat and a station line
// clips it more than once, leaving a sliver out at the tip that isn't wood across the gap
export function plateHalfChordAtY(poly: Pt[], y: number): number | null {
  let xs = polylineCrossingsAtY(poly, y);
  if (!xs.length) return null;
  let right = xs.find(x => x >= 0);
  let left = xs.filter(x => x <= 0).pop();
  return right === undefined || left === undefined ? Math.max(Math.abs(xs[0]), Math.abs(xs[xs.length - 1])) : Math.max(-left, right);
}

function polylineCrossingsAtY(poly: Pt[], y: number): number[] {
  let xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    let a = poly[i], b = poly[(i + 1) % poly.length];
    // half-open, so a vertex exactly on the station line counts once
    if ((a.y <= y) !== (b.y <= y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  return xs.sort((m, n) => m - n);
}

function insideCrossings(x: number, xs: number[]): boolean {
  let count = 0;
  for (let c of xs) if (c > x) count++;
  return count % 2 === 1;
}

// what one station row shares between every sample on it: the chords, and the section, which
// runs a root-find per side
export function rowAt(surface: PlateSurface, y: number): SurfaceRow {
  return {
    outerHalf: plateHalfChordAtY(surface.outline, y),
    landCrossings: polylineCrossingsAtY(surface.flutingEdge, y),
    section: sectionAt(surface, y),
    centerCrossings: polylineCrossingsAtY(surface.centerPoly, y),
  };
}

// signed distance from the channel centreline, positive toward the plate's centre
function channelS(surface: PlateSurface, row: SurfaceRow, x: number, y: number): number {
  let d = closestPointToPolylineIndexed({ x, y }, surface.centerIdx).dist;
  return insideCrossings(x, row.centerCrossings) ? d : -d;
}

function archContactS(section: CrossArchSection, x: number): number {
  return (x < 0 ? section.left : section.right)?.contactS ?? section.halfWidth;
}

// the corner smoothing over whatever the channel left, only ever outboard of where the arch
// landed, so a minimum here can only deepen and the arch and the gouge's arc against it stay as
// cut. Outside the fluting edge is the flat land, untouched
function withCornerPass(surface: PlateSurface, row: SurfaceRow, x: number, y: number, s: number, z: number, from = 0): number {
  if (s >= from || !surface.gouge.cornerGouge) return z;
  if (!insideCrossings(x, row.landCrossings)) return z;
  let edgeDist = closestPointToPolylineIndexed({ x, y }, surface.flutingEdgeIdx).dist;
  return Math.min(z, cornerSmoothZ(s, edgeDist, gougeAtY(surface.gouge, y).sweepRadius, surface.gouge.depth, from));
}

// the height at (x, y) relative to the plate's outer surface, null off the plate. The channel goes
// by true distance to the centreline, the arch by station chord, blended across the handover: by
// distance the handover is exact, but a distance field carries a medial axis that would stamp
// creases into the dome, so it is chord by a third of the way in. Scheduled on the distance, since
// near the caps the handover happens at the joint where the chord reads all the way in; the crown
// is centred wherever this leans on distance, so the sign of x picking a flank is harmless there
export function surfaceZAt(surface: PlateSurface, x: number, y: number, row = rowAt(surface, y)): number | null {
  if (row.outerHalf === null || Math.abs(x) > row.outerHalf) return null;
  let s = channelS(surface, row, x, y);
  let section = row.section;
  if (section) {
    let contact = archContactS(section, x);
    if (s >= contact) {
      let xEnd = x < 0 ? section.xEndLeft : section.xEndRight;
      let span = section.centerHalf - contact;
      let tDist = span > 1e-9 ? clamp((s - contact) / span, 0, 1) : 1;
      let tChord = xEnd > 1e-9 ? clamp(1 - Math.abs(x) / xEnd, 0, 1) : 1;
      let w = chordTrust(tDist);
      let t = (1 - w) * tDist + w * tChord;
      return section.zAt((x < 0 ? -1 : 1) * xEnd * (1 - t));
    }
    return withCornerPass(surface, row, x, y, s, gougeProfileZ(s, section.sweepRadius, surface.gouge.depth), Math.min(contact, 0));
  }
  // past the long arch's reach there is no crown, but the channel still runs through the caps
  return withCornerPass(surface, row, x, y, s, gougeProfileZ(s, gougeAtY(surface.gouge, y).sweepRadius, surface.gouge.depth));
}

export type SurfacePart = 'arch' | 'channel' | 'land';

// the surface at a station edge to edge, split into runs by what carved each: the same height
// field the overlays slice, so the section can't disagree with them at the corners
export function sectionRuns(surface: PlateSurface, y: number, stepMm = 0.25): { part: SurfacePart; pts: Pt[] }[] {
  let row = rowAt(surface, y);
  let half = row.outerHalf;
  if (half === null) return [];
  let section = row.section;
  let n = Math.max(8, Math.ceil((2 * half) / stepMm));
  let runs: { part: SurfacePart; pts: Pt[] }[] = [];
  for (let i = 0; i <= n; i++) {
    let x = -half + (2 * half * i) / n;
    let z = surfaceZAt(surface, x, y, row)!;
    let part: SurfacePart = !insideCrossings(x, row.landCrossings) ? 'land'
      : section && channelS(surface, row, x, y) >= archContactS(section, x) ? 'arch' : 'channel';
    let pt = new Pt(x, z);
    let last = runs[runs.length - 1];
    if (last?.part === part) last.pts.push(pt);
    else runs.push({ part, pts: last ? [last.pts[last.pts.length - 1], pt] : [pt] });
  }
  return runs;
}

// sampling steps scaled against a standard violin so the rendered density holds across the size
// range. The contour grid is held against the level spacing: finer costs time without changing
// the map
const REFERENCE_BODY_HEIGHT = 350;
const REFERENCE_BODY_WIDTH = 200;
const REFERENCE_ARCH_HEIGHT = 15;

export function wireframeSampleSteps(p: ViolinFamilyParams): { stationStepMm: number; sampleStepMm: number } {
  return {
    stationStepMm: clamp(4 * (p.body.height / REFERENCE_BODY_HEIGHT), 2, 15),
    sampleStepMm: clamp(1.5 * (p.body.width / REFERENCE_BODY_WIDTH), 0.75, 5),
  };
}

export function contourSampleSteps(p: ViolinFamilyParams, archHeight: number): { stepMm: number; gridMm: number } {
  let areaScale = Math.sqrt((p.body.width * p.body.height) / (REFERENCE_BODY_WIDTH * REFERENCE_BODY_HEIGHT));
  return { stepMm: clamp(archHeight / REFERENCE_ARCH_HEIGHT, 0.5, 6), gridMm: clamp(2 * areaScale, 0.75, 4) };
}

// the contour map: the height field on a grid, marching squares, every ring clipped to the plate's
// outline. Both halves evaluated, since the outline is symmetric but the surface need not be
export function contourRings(p: ViolinFamilyParams, surface: PlateSurface, stepMm: number, gridMm: number): { level: number; rings: [number, number][][] }[] {
  let xMax = p.body.width / 2 + p.body.overhang + p.body.rib + 2;
  let yMin = -1, yMax = p.body.height + 1;
  let nx = Math.floor((2 * xMax) / gridMm) + 1;
  let ny = Math.floor((yMax - yMin) / gridMm) + 1;
  let posVals = new Float64Array(nx * ny);
  let negVals = new Float64Array(nx * ny);
  let zMin = 0, zMax = 0;
  for (let j = 0; j < ny; j++) {
    let y = yMin + j * gridMm;
    let row = rowAt(surface, y);
    for (let i = 0; i < nx; i++) {
      let z = surfaceZAt(surface, -xMax + i * gridMm, y, row);
      posVals[j * nx + i] = z ?? -1e6;
      negVals[j * nx + i] = z ?? 1e6;
      if (z !== null) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
    }
  }
  let levelVals: number[] = [];
  for (let k = Math.ceil(zMin / stepMm); k * stepMm <= zMax; k++) levelVals.push(k * stepMm);

  let generator = d3.contours().size([nx, ny]).smooth(true);
  let toLocal = (rings: number[][][][]): [number, number][][] =>
    rings.flat().map(ring => ring.map(([cx, cy]) => [-xMax + cx * gridMm, yMin + cy * gridMm] as [number, number]));
  let outlineRing: [number, number][] = surface.outline.map(pt => [(pt.x + xMax) / gridMm, (pt.y - yMin) / gridMm] as [number, number]);
  outlineRing.push(outlineRing[0]);
  let outlineClip: [number, number][][][] = [[outlineRing]];

  let levels: { level: number; rings: [number, number][][] }[] = [];
  for (let level of levelVals) {
    let multi = generator.contour(level > 0 ? (posVals as any) : (negVals as any), level);
    // positive levels never reach the outline, the flat land always separating the dome from the edge
    let raw: number[][][][] = level > 0 ? (multi.coordinates as any) : ((polyClipper.intersection(multi.coordinates as any, outlineClip) ?? []) as any);
    let rings = toLocal(raw);
    if (rings.length > 0) levels.push({ level, rings });
  }
  return levels;
}

// the surface as cross-section strips with ribs running lengthwise down the joint and both edges
export interface WireframeStrip { y: number; pts: Pt3D[]; maxZ: number }
export interface WireframeGeometry { strips: WireframeStrip[]; ribs: Pt3D[][] }

function stripFromRow(surface: PlateSurface, y: number, row: SurfaceRow, sampleStep: number): WireframeStrip | null {
  if (row.outerHalf === null) return null;
  let hw = row.outerHalf;
  let steps = Math.max(2, Math.ceil(hw * 2 / sampleStep));
  let pts: Pt3D[] = [];
  let maxZ = -Infinity;
  for (let i = 0; i <= steps; i++) {
    let x = -hw + (i / steps) * hw * 2;
    let z = surfaceZAt(surface, x, y, row) ?? 0;
    if (z > maxZ) maxZ = z;
    pts.push(new Pt3D(x, y, z));
  }
  return { y, pts, maxZ };
}

export function wireframeStripAt(surface: PlateSurface, y: number, sampleStep: number): WireframeStrip | null {
  return stripFromRow(surface, y, rowAt(surface, y), sampleStep);
}

export function wireframeGeometry(surface: PlateSurface, bodyHeight: number, stationStepMm: number, sampleStep: number): WireframeGeometry {
  let strips: WireframeStrip[] = [];
  let ribSides = [0, -1, 1];
  let ribs: Pt3D[][] = ribSides.map(() => []);
  for (let y = 0; y <= bodyHeight; y += stationStepMm) {
    let row = rowAt(surface, y);
    if (row.outerHalf === null) {
      // a gap station restarts every rib run, matching the strip coverage
      for (let rib of ribs) rib.length = 0;
      continue;
    }
    let strip = stripFromRow(surface, y, row, sampleStep);
    if (strip) strips.push(strip);
    ribSides.forEach((side, k) => {
      let x = side * row.outerHalf!;
      ribs[k].push(new Pt3D(x, y, surfaceZAt(surface, x, y, row) ?? 0));
    });
  }
  return { strips, ribs: ribs.filter(rib => rib.length > 1) };
}

// a later panel reads the surfaces by calling this; it returns and never writes to the params.
// Each plate's last surface is kept against the params it reads (~90ms a plate, asked for on every
// cursor move); nothing of it reaches the file
let last: Record<Plate, { key: string; surface: PlateSurface | null; failures: CrossArchingFailure[] } | null> = { top: null, back: null };

export function solveCrossArching(p: ViolinFamilyParams): CrossArchingSolve | null {
  if (!p.arching || !p.fluting) return null;
  let s: CrossArchingSolve = { top: null, back: null, failures: [] };
  for (let plate of ['top', 'back'] as const) {
    let key = JSON.stringify([p.body, p.bouts, p.corners, p.outerContour, p.fluting, p.arching[plate]]);
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
  let fail = (message: string): CrossArchingFailure => ({ message, unsolved: [plate], circles: [], segments: [] });
  solveSection(failures, label, [plate], () => {
    let pa = p.arching![plate];
    let cross = pa.cross;
    let f = solveFluting(p)!;
    let o = solveOuterContour(p)!;
    let channel = f[plate];
    let outline = plate === 'top' ? o.top : o.back;
    if (!channel || !outline || !f.outerEdge) return fail(`${label}: the fluting channel has to solve first.`);
    if (!(pa.thickness > 0 && pa.arch.height > 0)) return fail(`${label}: the long arch has to solve first.`);

    let shapes: CrossShapeParams[] = [cross, ...cross.stations];
    let zFloor = -100 * pa.thickness / Math.max(pa.arch.height, pa.thickness);
    for (let shape of shapes) {
      // a cleared field reads as 0 against a range, so it is asked for first
      let typed = [shape.d, shape.pct, shape.peak, ...shape.points.flatMap(pt => [pt.x, pt.z])];
      if (!typed.every(Number.isFinite)) return fail(`${label}: every crown field needs a value.`);
      if (cross.type === 'cycloid') {
        if (!(shape.d >= 0 && shape.d <= 100)) return fail(`${label}: the cycloid factor has to sit between 0 and 100.`);
        if (!(shape.pct >= 5 && shape.pct <= cycloidPctMax(pa.thickness, pa.arch.height)))
          return fail(`${label}: the cycloid's percent has to sit between 5 and ${cycloidPctMax(pa.thickness, pa.arch.height)}; past that its ends dip deeper than the plate is thick.`);
      }
      if (cross.type === 'spline') {
        if (!(shape.peak >= 30 && shape.peak <= 70)) return fail(`${label}: the crown has to sit between 30% and 70% of the width.`);
        for (let pt of shape.points) {
          if (!(pt.x >= 0 && pt.x <= 100) || Math.abs(pt.x - 50) < 1) return fail(`${label}: every point has to sit between 0% and 100% of the width, and at least 1% off the joint.`);
          if (!(pt.z <= 100)) return fail(`${label}: a point stands above the crown. 100% is its ceiling.`);
          if (!(pt.z >= zFloor)) return fail(`${label}: a point dips deeper than the plate is thick.`);
        }
      }
    }
    for (let [i, st] of cross.stations.entries()) {
      if (!Number.isFinite(st.y)) return fail(`${label}: every station needs a position.`);
      if (!(st.y >= STATION_MARGIN_MM && st.y <= p.body.height - STATION_MARGIN_MM)) return fail(`${label}: a station sits outside the body.`);
      if (cross.stations.some((other, j) => j !== i && Math.abs(other.y - st.y) <= STATION_MERGE_EPS_MM)) return fail(`${label}: two stations sit on top of each other at ${st.y}mm.`);
    }

    let g = p.fluting![plate];
    let gouge: SurfaceGouge = {
      sweepRadius: g.sweepRadius, depth: g.depth, cBoutSweep: g.useCBoutGouge ? g.cBoutSweep : g.sweepRadius,
      cornerGouge: p.fluting!.cornerGouge, lowerCornerY: p.corners!.LCr.y, upperCornerY: p.corners!.UCr.y,
    };
    let flutingEdge = samplePathToPolyline(f.outerEdge);
    let centerPoly = samplePathToPolyline(channel.center, 1);
    surface = {
      outline: samplePathToPolyline(outline),
      flutingEdge,
      flutingEdgeIdx: buildPolylineIndex(flutingEdge),
      centerPoly,
      centerIdx: buildPolylineIndex(centerPoly),
      gouge,
      resolveCross: makeCrossArchResolver(cross, p.body.height),
      longArch: solveLongArching(p)![plate],
    };
    return null;
  });
  return { surface, failures };
}
