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
 * zAmp amplifies the arch height visually (the ~15 mm arch would be nearly
 * invisible at 1:1 next to the ~356 mm body length) and is applied before
 * rotation so all three sliders remain geometrically coherent.
 *
 * Strip geometry is expensive (stationChordsAt + topSurfaceZAt calls);
 * callers should pre-compute via `computeWireframeStrips` and cache the
 * result against `JSON.stringify(params)`.  The render function itself only
 * does SVG I/O, so it stays cheap for station-slider drags.
 */

import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';
import { TopSurfaceModel, stationChordsAt, topSurfaceZAt } from '../ceruti-surface';

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
 * @param zAmp      - visual amplification of arch height (default 2.5)
 */
function buildProjection(
  yOffset: number, heightMid: number,
  rotXDeg: number, rotYDeg: number, rotZDeg: number,
  zAmp = 2.5,
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

// ===== Geometry computation (expensive — cache the result) =====

/**
 * Inner loop shared by computeSingleWireframeStrip and computeWireframeStrips.
 * Accepts a pre-built projection so the caller controls when trig is computed.
 */
function computeStripWithProj(
  p: EnricoCerutiParams,
  model: TopSurfaceModel,
  y: number,
  proj: (x: number, y: number, z: number) => [number, number],
  sampleStep = 1.5,
): WireframeStrip | null {
  const chords = stationChordsAt(p, model, y);
  if (chords.outerHalf === null) return null;

  const hw    = chords.outerHalf;
  const steps = Math.max(2, Math.ceil(hw * 2 / sampleStep));

  const pts: string[] = [];
  let maxZ = -Infinity;

  for (let i = 0; i <= steps; i++) {
    const x = -hw + (i / steps) * hw * 2;
    const z = topSurfaceZAt(p, model, x, y, chords) ?? 0;
    maxZ = Math.max(maxZ, z);
    const [sx, sy] = proj(x, y, z);
    pts.push(`${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`);
  }

  return { path: pts.join(' '), maxZ, y };
}

/** Build the SVG path for a single cross-section at body-y `y`. */
export function computeSingleWireframeStrip(
  p: EnricoCerutiParams,
  model: TopSurfaceModel,
  y: number,
  yOffset: number,
  rotXDeg   = 0,
  rotYDeg   = 0,
  rotZDeg   = 0,
  zAmp       = 2.5,
  sampleStep = 1.5,
): WireframeStrip | null {
  const proj = buildProjection(yOffset, p.height / 2, rotXDeg, rotYDeg, rotZDeg, zAmp);
  return computeStripWithProj(p, model, y, proj, sampleStep);
}

/**
 * Compute all wireframe strips for the full body, stepping every
 * `stationStepMm` mm. This is the cacheable, expensive part.
 *
 * The projection matrix is built **once** here (6 trig calls total) rather
 * than once per strip.
 */
export function computeWireframeStrips(
  p: EnricoCerutiParams,
  model: TopSurfaceModel,
  yOffset: number,
  stationStepMm = 4,
  rotXDeg       = 0,
  rotYDeg       = 0,
  rotZDeg       = 0,
  zAmp          = 2.5,
): WireframeStrip[] {
  const proj   = buildProjection(yOffset, p.height / 2, rotXDeg, rotYDeg, rotZDeg, zAmp);
  const strips: WireframeStrip[] = [];
  for (let y = 0; y <= p.height; y += stationStepMm) {
    const strip = computeStripWithProj(p, model, y, proj);
    if (strip) strips.push(strip);
  }
  return strips;
}

/**
 * Compute a sparse set of longitudinal rib paths — lines running along the
 * body length at fixed fractional positions of the half-width at each station.
 * These orthogonal lines help the eye read the 3D shape as a mesh.
 *
 * @param ribFractions  - fractional half-widths to sample (e.g. [0, 0.5, 1.0])
 */
export function computeWireframeRibs(
  p: EnricoCerutiParams,
  model: TopSurfaceModel,
  yOffset: number,
  stationStepMm = 4,
  rotXDeg       = 0,
  rotYDeg       = 0,
  rotZDeg       = 0,
  zAmp          = 2.5,
  ribFractions  = [0, 0.35, 0.7, 1.0],
): string[] {
  // Build projection matrix once for all ribs.
  const proj = buildProjection(yOffset, p.height / 2, rotXDeg, rotYDeg, rotZDeg, zAmp);

  const ribPaths: string[] = [];

  for (const frac of ribFractions) {
    for (const sign of frac === 0 ? [1] : [-1, 1]) {
      const pts: string[] = [];

      for (let y = 0; y <= p.height; y += stationStepMm) {
        const chords = stationChordsAt(p, model, y);
        if (chords.outerHalf === null) { pts.length = 0; continue; }
        const x = sign * frac * chords.outerHalf;
        const z = topSurfaceZAt(p, model, x, y, chords) ?? 0;
        const [sx, sy] = proj(x, y, z);
        pts.push(`${pts.length === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`);
      }

      if (pts.length > 1) ribPaths.push(pts.join(' '));
    }
  }

  return ribPaths;
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
