/**
 * Orthographic wireframe of the top-plate arch surface.
 *
 * The surface is sliced into cross-section strips every `stationStepMm` of
 * body length. Each strip is projected with a true orthographic transform
 * after applying independent rotations around the X, Y, and Z axes:
 *
 *   Violin axes: X = width (0 = centre-line), Y = body length, Z = arch height.
 *
 *   At (rotX=0, rotY=0, rotZ=0) the view looks straight down the Z axis,
 *   showing the XY plan view. Rotating around X tilts the body length to
 *   reveal the arch profile; rotating around Y rolls the body on its length
 *   axis; rotating around Z spins the plan view.
 *
 * zAmp amplifies the arch height visually and is applied inside the
 * projection so all three rotation sliders remain geometrically coherent.
 *
 * The pipeline is split so rotation stays cheap:
 *   computeWireframeGeometry — samples the surface (stationChordsAt +
 *     topSurfaceZAt per point). Depends only on params; cache the result
 *     against `JSON.stringify(params)`.
 *   projectWireframe — turns cached geometry into SVG paths for one set of
 *     rotation angles. A few thousand multiply-adds; run it every redraw.
 */

import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';
import { TopSurfaceModel, StationChords, stationChordsAt, topSurfaceZAt } from '../ceruti-surface';

const DEG = Math.PI / 180;

// ===== Projection =====

/**
 * Pre-multiply the three rotation matrices (Ry * Rx * Rz) into a single 2-row
 * matrix and return a lightweight per-point projection closure.
 *
 * Trig is computed **once** here; the returned function executes only
 * 6 multiplications and 5 additions per point.
 *
 * Rotation order (extrinsic / fixed-frame): Z → X → Y.
 * At (rotXDeg=0, rotYDeg=0, rotZDeg=0) the view looks straight down the
 * Z axis: screen X = violin X, screen Y = violin Y (plan view).
 *
 * @param yOffset   - canvas world origin for the violin body
 * @param heightMid - p.height / 2 — centres Y before rotation
 * @param rotXDeg   - rotation around X axis (degrees)
 * @param rotYDeg   - rotation around Y axis (degrees)
 * @param rotZDeg   - rotation around Z axis (degrees)
 * @param zAmp      - visual amplification of arch height
 */
function buildProjection(
  yOffset: number, heightMid: number,
  rotXDeg: number, rotYDeg: number, rotZDeg: number,
  zAmp = 1,
): (x: number, y: number, z: number) => [number, number] {
  const rx = rotXDeg * DEG, ry = rotYDeg * DEG, rz = rotZDeg * DEG;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // Rows 0 and 1 of the combined matrix R = Ry * Rx * Rz.
  // Row 2 (depth after projection) is discarded — orthographic onto XY plane.
  const m00 =  cy * cz + sy * sz * sx;
  const m01 = -cy * sz + sy * cz * sx;
  const m02 =  sy * cx * zAmp;   // zAmp pre-multiplied: caller passes z raw
  const m10 =  sz * cx;
  const m11 =  cz * cx;
  const m12 = -sx * zAmp;

  const yCenter = yOffset + heightMid;

  return (x: number, y: number, z: number): [number, number] => {
    const py = y - heightMid;
    return [
      m00 * x + m01 * py + m02 * z,
      yCenter + m10 * x + m11 * py + m12 * z,
    ];
  };
}

// ===== Data types =====

export interface WireframeStrip {
  /** Pre-projected SVG path string for this cross-section strip. */
  path: string;
  /** Maximum z value across the strip (used for colour selection). */
  maxZ: number;
  /** Body-Y coordinate of this station (mm). */
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

// ===== Geometry computation (expensive — cache the result) =====

/** Sample one cross-section at body-y `y` from precomputed station chords. */
function stripGeomFromChords(
  p: EnricoCerutiParams,
  model: TopSurfaceModel,
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

/**
 * Sample all wireframe geometry: cross-section strips every `stationStepMm`
 * plus longitudinal ribs at fixed fractions of the half-width. Strips and
 * ribs share one `stationChordsAt` per station. Depends only on params —
 * cache the result and re-project on rotation changes.
 *
 * @param ribFractions - fractional half-widths to sample (e.g. [0, 0.5, 1.0])
 */
export function computeWireframeGeometry(
  p: EnricoCerutiParams,
  model: TopSurfaceModel,
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

// ===== Projection to SVG paths (cheap — run every redraw) =====

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

/** Project cached geometry for one set of rotation angles. */
export function projectWireframe(
  geom: WireframeGeometry,
  bodyHeight: number,
  yOffset: number,
  rotXDeg = 0,
  rotYDeg = 0,
  rotZDeg = 0,
  zAmp    = 1,
): { strips: WireframeStrip[]; ribs: string[] } {
  const proj = buildProjection(yOffset, bodyHeight / 2, rotXDeg, rotYDeg, rotZDeg, zAmp);

  const strips = geom.strips.map(strip => projectStripGeom(strip, proj));
  const ribs = geom.ribs.map(rib =>
    rib.map((pt, i) => {
      const [sx, sy] = proj(pt.x, pt.y, pt.z);
      return `${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`;
    }).join(' ')
  );

  return { strips, ribs };
}

/** Build the SVG path for a single cross-section at body-y `y`. */
export function computeSingleWireframeStrip(
  p: EnricoCerutiParams,
  model: TopSurfaceModel,
  y: number,
  yOffset: number,
  rotXDeg    = 0,
  rotYDeg    = 0,
  rotZDeg    = 0,
  zAmp       = 1,
  sampleStep = 1.5,
): WireframeStrip | null {
  const strip = stripGeomFromChords(p, model, y, stationChordsAt(p, model, y), sampleStep);
  if (!strip) return null;
  const proj = buildProjection(yOffset, p.height / 2, rotXDeg, rotYDeg, rotZDeg, zAmp);
  return projectStripGeom(strip, proj);
}

// ===== Render function (cheap — only SVG I/O) =====

/**
 * Render the oblique wireframe.  All geometry is pre-computed; this function
 * only writes SVG path elements so it stays fast for station-slider drags.
 *
 * Draw order: all regular strips first (back-to-front, but without fill the
 * order doesn't matter for a wireframe), then the highlighted station strip
 * on top so it's always visible.
 */
export function renderArch3dWireframe(
  colors: CerutiColors,
  strips: WireframeStrip[],
  ribs: string[],
  highlightedStrip: WireframeStrip | null,
): (g: any, ui: any) => void {
  return (g: any, ui: any): void => {
    // Longitudinal ribs — faint
    for (const rib of ribs) {
      g.append('path')
        .attr('d', rib)
        .attr('stroke', colors.mouldTrace)
        .attr('stroke-width', 0.6)
        .attr('fill', 'none')
        .attr('opacity', 0.45)
        .attr('vector-effect', 'non-scaling-stroke');
    }

    // Cross-section strips
    for (const { path, maxZ } of strips) {
      const isChannel = maxZ < -0.01;
      const color     = isChannel ? colors.fluting : colors.archTop;
      const opacity   = isChannel ? 0.5 : 0.65;
      g.append('path')
        .attr('d', path)
        .attr('stroke', color)
        .attr('stroke-width', 0.75)
        .attr('fill', 'none')
        .attr('opacity', opacity)
        .attr('vector-effect', 'non-scaling-stroke');
    }

    // Highlighted station (current cross-section from the section view below)
    if (highlightedStrip) {
      g.append('path')
        .attr('d', highlightedStrip.path)
        .attr('stroke', colors.mouldTrace)
        .attr('stroke-width', 1.5)
        .attr('fill', 'none')
        .attr('opacity', 1)
        .attr('vector-effect', 'non-scaling-stroke');
    }
  };
}
