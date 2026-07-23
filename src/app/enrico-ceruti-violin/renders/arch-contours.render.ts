/**
 * Contour (topo) map of one plate's surface, viewed through the same oblique
 * projection as the 3D wireframe (see oblique-projection.ts). At rotation
 * (0,0,0) this is exactly the flat plan-view map this feature replaces: the
 * projection's zero-rotation case reduces to a plain (x, y) → (x, y) plan
 * view, since z only enters through the rotated terms.
 *
 * Each contour ring sits at z = its level by construction (that's what a
 * contour ring is), so projecting it is exactly like projecting a wireframe
 * rib. The outline context line doesn't have a natural z of its own — it's
 * projected flat, at z = 0 (the plate-surface reference plane), which keeps
 * it as simple, cheap context rather than a second surface to sample.
 *
 * The pipeline mirrors the wireframe's cache/reproject split:
 *   computeArchContourRings (ceruti-surface.ts) — expensive marching-squares
 *     grid + outline clip. Depends only on params; cache against paramsKey.
 *   projectArchContourRings / projectFlatPolyline — cheap per-rotation
 *     reprojection, run every redraw.
 */
import { Pt } from '../../models/types';
import { CerutiColors } from '../ceruti-types';
import { ArchContourLevel } from '../ceruti-surface';
import { buildProjection } from './oblique-projection';

export interface ProjectedContourLevel {
  level: number;
  path: string;
}

/** Projects raw contour rings through the shared oblique projection; z = each ring's level. */
export function projectArchContourRings(
  levels: ArchContourLevel[],
  bodyHeight: number,
  yOffset: number,
  rotXDeg = 0,
  rotYDeg = 0,
  rotZDeg = 0,
  zAmp    = 1,
  xOffset = 0,
  signZ: 1 | -1 = 1,
): ProjectedContourLevel[] {
  const proj = buildProjection(yOffset, bodyHeight / 2, rotXDeg, rotYDeg, rotZDeg, zAmp * signZ, xOffset);
  return levels.map(({ level, rings }) => ({
    level,
    path: rings.map(ring =>
      ring.map(([x, y], idx) => {
        const [sx, sy] = proj(x, y, level);
        return `${idx === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`;
      }).join(' ') + ' Z'
    ).join(' '),
  }));
}

/** Projects a flat (z = 0) polyline — used for the outline context line. */
export function projectFlatPolyline(
  pts: Pt[],
  bodyHeight: number,
  yOffset: number,
  rotXDeg = 0,
  rotYDeg = 0,
  rotZDeg = 0,
  zAmp    = 1,
  xOffset = 0,
  signZ: 1 | -1 = 1,
): string {
  if (pts.length === 0) return '';
  const proj = buildProjection(yOffset, bodyHeight / 2, rotXDeg, rotYDeg, rotZDeg, zAmp * signZ, xOffset);
  return pts.map((pt, idx) => {
    const [sx, sy] = proj(pt.x, pt.y, 0);
    return `${idx === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`;
  }).join(' ') + ' Z';
}

/**
 * Axis-aligned bounding box of the projected contour rings, in the same
 * world coordinates the render function draws in. Mirrors
 * computeWireframeBounds so the drag-to-rotate hit frame can size itself
 * identically for either plate view.
 */
export function computeArchContourBounds(
  levels: ArchContourLevel[],
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
  for (const { level, rings } of levels) {
    for (const ring of rings) {
      for (const [x, y] of ring) {
        const [sx, sy] = proj(x, y, level);
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Render the (already-projected) contour map. Channel levels (z ≤ 0) draw
 * fainter than the arch levels, matching the flat map's convention.
 */
export function renderArchContours3d(
  colors: CerutiColors,
  levels: ProjectedContourLevel[],
  outlinePath: string | null,
  domeColor: string = colors.archTop,
): (g: any, ui: any) => void {
  return (g: any, ui: any): void => {
    if (outlinePath) {
      g.append('path')
        .attr('d', outlinePath)
        .attr('stroke', colors.outerTrace)
        .attr('stroke-width', 1)
        .attr('fill', 'none')
        .attr('opacity', 0.6)
        .attr('vector-effect', 'non-scaling-stroke');
    }
    for (const { level, path } of levels) {
      const isChannel = level <= 0;
      g.append('path')
        .attr('d', path)
        .attr('stroke', isChannel ? colors.fluting : domeColor)
        .attr('stroke-width', 1)
        .attr('fill', 'none')
        .attr('opacity', isChannel ? 0.9 : 0.7)
        .attr('vector-effect', 'non-scaling-stroke');
    }
  };
}
