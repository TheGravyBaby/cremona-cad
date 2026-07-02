// Binary STL export of a height-field solid: a top surface z(x, y) sampled on
// a regular grid, a flat base plane, and vertical skirt walls where the field
// ends. Cells are solid only when all four corners have a height, so the
// outline is a grid staircase eroded by at most one cell — fine for CNC
// roughing and 3D preview; finishing detail comes from the 2D exports.

export interface HeightFieldStlOptions {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  gridMm: number;
  /** Z of the flat base plane (the blank's bottom face). */
  baseZ: number;
  /**
   * When provided, side walls follow this closed polygon (x/y in the same mm
   * coordinate space as the height field) instead of the grid staircase.
   * Eliminates jagged staircase edges on curved outlines.
   */
  outline?: [number, number][];
  /** Z height of the top edge of each outline wall segment (typically the plate thickness). */
  outlineTopZ?: number;
}

/**
 * Sample `zAt` (null = outside the solid) over the grid and triangulate.
 * Returns a binary STL buffer in the same mm units as the inputs.
 */
export function buildHeightFieldStl(zAt: (x: number, y: number) => number | null, opts: HeightFieldStlOptions): ArrayBuffer {
  const { xMin, yMin, gridMm, baseZ } = opts;
  const nx = Math.floor((opts.xMax - xMin) / gridMm) + 1;
  const ny = Math.floor((opts.yMax - yMin) / gridMm) + 1;

  const z = new Float64Array(nx * ny).fill(NaN);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = zAt(xMin + i * gridMm, yMin + j * gridMm);
      if (v !== null) z[j * nx + i] = v;
    }
  }

  const X = (i: number) => xMin + i * gridMm;
  const Y = (j: number) => yMin + j * gridMm;
  const zOf = (i: number, j: number) => z[j * nx + i];
  const solidCell = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < nx - 1 && j < ny - 1 &&
    !Number.isNaN(zOf(i, j)) && !Number.isNaN(zOf(i + 1, j)) &&
    !Number.isNaN(zOf(i, j + 1)) && !Number.isNaN(zOf(i + 1, j + 1));

  // 9 numbers per triangle; winding chosen so computed normals face outward.
  const tris: number[] = [];
  const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) =>
    tris.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  const quad = (
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
  ) => { tri(ax, ay, az, bx, by, bz, cx, cy, cz); tri(ax, ay, az, cx, cy, cz, dx, dy, dz); };

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (!solidCell(i, j)) continue;
      const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1);
      const z00 = zOf(i, j), z10 = zOf(i + 1, j), z01 = zOf(i, j + 1), z11 = zOf(i + 1, j + 1);

      // Top (CCW from +z) and base (CW from +z).
      quad(x0, y0, z00, x1, y0, z10, x1, y1, z11, x0, y1, z01);
      quad(x0, y0, baseZ, x0, y1, baseZ, x1, y1, baseZ, x1, y0, baseZ);

      // Skirts on edges shared with non-solid neighbours, wound to face away from the cell.
      // Omitted when an explicit outline polygon is provided (outline walls replace staircase skirts).
      if (!opts.outline) {
        if (!solidCell(i, j - 1)) quad(x0, y0, baseZ, x1, y0, baseZ, x1, y0, z10, x0, y0, z00);
        if (!solidCell(i, j + 1)) quad(x1, y1, baseZ, x0, y1, baseZ, x0, y1, z01, x1, y1, z11);
        if (!solidCell(i - 1, j)) quad(x0, y1, baseZ, x0, y0, baseZ, x0, y0, z00, x0, y1, z01);
        if (!solidCell(i + 1, j)) quad(x1, y0, baseZ, x1, y1, baseZ, x1, y1, z11, x1, y0, z10);
      }
    }
  }

  // True outline walls: walk the boundary polygon and emit vertical wall quads.
  // These replace the staircase skirts and follow the exact instrument shape.
  if (opts.outline) {
    const poly = opts.outline;
    const topZ = opts.outlineTopZ ?? baseZ + 1;
    const n = poly.length;
    // Determine polygon orientation via signed shoelace area (positive = CCW in standard coords).
    let area = 0;
    for (let k = 0; k < n; k++) {
      const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % n];
      area += ax * by - bx * ay;
    }
    // CCW polygon: winding (p0,baseZ),(p1,baseZ),(p1,topZ),(p0,topZ) → outward normal.
    // CW polygon:  reversed winding.
    const ccw = area > 0;
    for (let k = 0; k < n; k++) {
      const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % n];
      if (ccw) {
        quad(ax, ay, baseZ, bx, by, baseZ, bx, by, topZ, ax, ay, topZ);
      } else {
        quad(ax, ay, topZ, bx, by, topZ, bx, by, baseZ, ax, ay, baseZ);
      }
    }
  }

  return writeBinaryStl(tris);
}

function writeBinaryStl(tris: number[]): ArrayBuffer {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  let off = 84;
  for (let t = 0; t < n; t++) {
    const b = t * 9;
    const ux = tris[b + 3] - tris[b], uy = tris[b + 4] - tris[b + 1], uz = tris[b + 5] - tris[b + 2];
    const vx = tris[b + 6] - tris[b], vy = tris[b + 7] - tris[b + 1], vz = tris[b + 8] - tris[b + 2];
    let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const len = Math.hypot(cx, cy, cz) || 1;
    dv.setFloat32(off, cx / len, true);
    dv.setFloat32(off + 4, cy / len, true);
    dv.setFloat32(off + 8, cz / len, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(off + 12 + k * 4, tris[b + k], true);
    dv.setUint16(off + 48, 0, true);
    off += 50;
  }
  return buf;
}

export function downloadStlFile(filename: string, buffer: ArrayBuffer): void {
  const blob = new Blob([buffer], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
