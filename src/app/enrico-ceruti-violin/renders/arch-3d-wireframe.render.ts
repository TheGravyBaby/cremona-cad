/**
 * Orthographic wireframe of the top-plate arch surface, sliced into cross-section strips
 * every `stationStepMm` and projected via the shared oblique projection (oblique-projection.ts).
 *
 * Split so rotation stays cheap: computeWireframeGeometry samples the surface and depends
 * only on params, so cache it against `JSON.stringify(params)`; projectWireframe turns
 * cached geometry into SVG paths for one set of rotation angles and is cheap enough to run
 * every redraw.
 */

import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';
import { PlateSurfaceModel, StationChords, stationChordsAt, topSurfaceZAt } from '../ceruti-surface';
import { buildProjection } from './oblique-projection';
import { STROKE_WEIGHT } from './render-constants';

export interface WireframeStrip {
  /** pre-projected SVG path for this strip. */
  path: string;
  /** max z across the strip — used to pick channel vs. dome colour. */
  maxZ: number;
  /** body-y of this station. */
  y: number;
}

/** Unprojected cross-section strip: surface samples in violin coordinates. */
export interface WireframeStripGeom {
  y: number;
  xs: number[];
  zs: number[];
  maxZ: number;
}

/** One longitudinal rib vertex in violin coordinates. */
interface RibPt { x: number; y: number; z: number; }

/** Rotation-independent wireframe geometry — the cacheable, expensive part. */
export interface WireframeGeometry {
  strips: WireframeStripGeom[];
  ribs: RibPt[][];
}

function stripGeomFromChords(
  p: EnricoCerutiParams,
  model: PlateSurfaceModel,
  y: number,
  chords: StationChords,
  sampleStep: number,
): WireframeStripGeom | null {
  if (chords.outerHalf === null) return null;

  const hw    = chords.outerHalf;
  const steps = Math.max(2, Math.ceil(hw * 2 / sampleStep));

  const xs: number[] = [];
  const zs: number[] = [];
  let maxZ = -Infinity;

  for (let i = 0; i <= steps; i++) {
    const x = -hw + (i / steps) * hw * 2;
    const z = topSurfaceZAt(p, model, x, y, chords) ?? 0;
    if (z > maxZ) maxZ = z;
    xs.push(x);
    zs.push(z);
  }

  return { y, xs, zs, maxZ };
}

// strips and ribs share one stationChordsAt call per station, rather than each sampling it separately.
export function computeWireframeGeometry(
  p: EnricoCerutiParams,
  model: PlateSurfaceModel,
  stationStepMm = 4,
  sampleStep    = 1.5,
  ribFractions  = [0, 1.0],
): WireframeGeometry {
  const strips: WireframeStripGeom[] = [];

  const ribSpecs: { frac: number; sign: number }[] = [];
  for (const frac of ribFractions) {
    for (const sign of frac === 0 ? [1] : [-1, 1]) ribSpecs.push({ frac, sign });
  }
  const ribs: RibPt[][] = ribSpecs.map(() => []);

  for (let y = 0; y <= p.height; y += stationStepMm) {
    const chords = stationChordsAt(p, model, y);
    if (chords.outerHalf === null) {
      // A gap station restarts every rib run, matching the strip coverage.
      for (const rib of ribs) rib.length = 0;
      continue;
    }

    const strip = stripGeomFromChords(p, model, y, chords, sampleStep);
    if (strip) strips.push(strip);

    for (let k = 0; k < ribSpecs.length; k++) {
      const x = ribSpecs[k].sign * ribSpecs[k].frac * chords.outerHalf;
      const z = topSurfaceZAt(p, model, x, y, chords) ?? 0;
      ribs[k].push({ x, y, z });
    }
  }

  return { strips, ribs: ribs.filter(rib => rib.length > 1) };
}

function projectStripGeom(
  strip: WireframeStripGeom,
  proj: (x: number, y: number, z: number) => [number, number],
): WireframeStrip {
  const pts: string[] = [];
  for (let i = 0; i < strip.xs.length; i++) {
    const [sx, sy] = proj(strip.xs[i], strip.y, strip.zs[i]);
    pts.push(`${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`);
  }
  return { path: pts.join(' '), maxZ: strip.maxZ, y: strip.y };
}

export function projectWireframe(
  geom: WireframeGeometry,
  bodyHeight: number,
  yOffset: number,
  rotXDeg = 0,
  rotYDeg = 0,
  rotZDeg = 0,
  zAmp    = 1,
  xOffset = 0,
  signZ: 1 | -1 = 1,
): { strips: WireframeStrip[]; ribs: string[] } {
  // signZ folds the back plate's height field downward; xOffset sits its
  // wireframe beside the top plate's on the shared canvas.
  const proj = buildProjection(yOffset, bodyHeight / 2, rotXDeg, rotYDeg, rotZDeg, zAmp * signZ, xOffset);

  const strips = geom.strips.map(strip => projectStripGeom(strip, proj));
  const ribs = geom.ribs.map(rib =>
    rib.map((pt, i) => {
      const [sx, sy] = proj(pt.x, pt.y, pt.z);
      return `${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`;
    }).join(' ')
  );

  return { strips, ribs };
}

/**
 * Axis-aligned bounding box of the projected wireframe, in the same world
 * coordinates as `projectWireframe`'s output. Used to size the drag-to-rotate
 * hit frame so it tracks rotation exactly (a tilted wireframe's screen
 * footprint grows/shrinks), without needing a second, approximate estimate.
 */
export function computeWireframeBounds(
  geom: WireframeGeometry,
  bodyHeight: number,
  yOffset: number,
  rotXDeg = 0,
  rotYDeg = 0,
  rotZDeg = 0,
  zAmp    = 1,
  xOffset = 0,
  signZ: 1 | -1 = 1,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const proj = buildProjection(yOffset, bodyHeight / 2, rotXDeg, rotYDeg, rotZDeg, zAmp * signZ, xOffset);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const consider = (x: number, y: number, z: number) => {
    const [sx, sy] = proj(x, y, z);
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  };
  for (const strip of geom.strips) {
    for (let i = 0; i < strip.xs.length; i++) consider(strip.xs[i], strip.y, strip.zs[i]);
  }
  for (const rib of geom.ribs) {
    for (const pt of rib) consider(pt.x, pt.y, pt.z);
  }
  return { minX, minY, maxX, maxY };
}

export function computeSingleWireframeStrip(
  p: EnricoCerutiParams,
  model: PlateSurfaceModel,
  y: number,
  yOffset: number,
  rotXDeg    = 0,
  rotYDeg    = 0,
  rotZDeg    = 0,
  zAmp       = 1,
  sampleStep = 1.5,
  xOffset    = 0,
  signZ: 1 | -1 = 1,
): WireframeStrip | null {
  const strip = stripGeomFromChords(p, model, y, stationChordsAt(p, model, y), sampleStep);
  if (!strip) return null;
  const proj = buildProjection(yOffset, p.height / 2, rotXDeg, rotYDeg, rotZDeg, zAmp * signZ, xOffset);
  return projectStripGeom(strip, proj);
}

// pre-computed geometry only — this just writes SVG paths, kept fast for station-slider drags.
// regular strips draw first; without a fill their order among themselves doesn't matter, but the
// highlighted strip draws last so it's always on top.
export function renderArch3dWireframe(
  colors: CerutiColors,
  strips: WireframeStrip[],
  ribs: string[],
  highlightedStrip: WireframeStrip | null,
  domeColor: string = colors.archTop,
): (g: any, ui: any) => void {
  return (g: any, ui: any): void => {
    // longitudinal ribs — faint background context, thinner than a regular strip.
    for (const rib of ribs) {
      g.append('path')
        .attr('d', rib)
        .attr('stroke', colors.mouldTrace)
        .attr('stroke-width', STROKE_WEIGHT.guide * 0.6)
        .attr('fill', 'none')
        .attr('opacity', 0.45)
        .attr('vector-effect', 'non-scaling-stroke');
    }

    for (const { path, maxZ } of strips) {
      const isChannel = maxZ < -0.01;
      const color     = isChannel ? colors.fluting : domeColor;
      const opacity   = isChannel ? 0.5 : 0.65;
      g.append('path')
        .attr('d', path)
        .attr('stroke', color)
        .attr('stroke-width', STROKE_WEIGHT.guide * 0.75)
        .attr('fill', 'none')
        .attr('opacity', opacity)
        .attr('vector-effect', 'non-scaling-stroke');
    }

    // highlighted station (current cross-section from the section view below) — matches
    // STROKE_WEIGHT.section, the weight the same station is drawn at in the 2D section view.
    if (highlightedStrip) {
      g.append('path')
        .attr('d', highlightedStrip.path)
        .attr('stroke', colors.mouldTrace)
        .attr('stroke-width', STROKE_WEIGHT.section)
        .attr('fill', 'none')
        .attr('opacity', 1)
        .attr('vector-effect', 'non-scaling-stroke');
    }
  };
}
