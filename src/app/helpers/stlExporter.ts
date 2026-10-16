// Binary STL export of a height-field solid: a top surface z(x, y) sampled on a regular grid, a
// flat base plane, and vertical walls where the field ends. With no outline, a cell is solid only
// when all four corners have a height, so the edge is a grid staircase eroded by at most one cell
// and the walls follow it. With an outline, the cells it crosses are clipped to it, so the top and
// the base meet the walls on the outline itself and the solid closes.

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
   * coordinate space as the height field) instead of the grid staircase, and
   * the top and base are clipped to it.
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
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && !Number.isNaN(zOf(i, j));
  const solidCell = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < nx - 1 && j < ny - 1 &&
    inside(i, j) && inside(i + 1, j) && inside(i, j + 1) && inside(i + 1, j + 1);

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

  if (opts.outline) {
    const poly = opts.outline;
    const topZ = opts.outlineTopZ ?? baseZ + 1;
    const n = poly.length;

    // the outline's segments bucketed by the grid cells their boxes cover, so a cell edge only
    // asks the segments near it where the outline crosses
    const buckets = new Map<number, number[]>();
    for (let k = 0; k < n; k++) {
      const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % n];
      const i0 = Math.floor((Math.min(ax, bx) - xMin) / gridMm), i1 = Math.floor((Math.max(ax, bx) - xMin) / gridMm);
      const j0 = Math.floor((Math.min(ay, by) - yMin) / gridMm), j1 = Math.floor((Math.max(ay, by) - yMin) / gridMm);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const key = j * nx + i;
        const list = buckets.get(key);
        if (list) list.push(k); else buckets.set(key, [k]);
      }
    }

    // where the outline crosses the cell edge from the inside corner `a` to the outside corner
    // `b`, the nearest crossing to `a`; the edge's midpoint when the samples and the outline
    // disagree about which side of it the plate ends on
    const crossing = (i: number, j: number, a: [number, number], b: [number, number]): [number, number] => {
      let best: [number, number] | null = null, bestT = Infinity;
      const horizontal = a[1] === b[1];
      for (const k of buckets.get(j * nx + i) ?? []) {
        const [px, py] = poly[k], [qx, qy] = poly[(k + 1) % n];
        let pt: [number, number] | null = null;
        if (horizontal) {
          if ((py <= a[1]) === (qy <= a[1])) continue;
          pt = [px + ((a[1] - py) / (qy - py)) * (qx - px), a[1]];
        } else {
          if ((px <= a[0]) === (qx <= a[0])) continue;
          pt = [a[0], py + ((a[0] - px) / (qx - px)) * (qy - py)];
        }
        const t = horizontal ? (pt[0] - a[0]) / (b[0] - a[0]) : (pt[1] - a[1]) / (b[1] - a[1]);
        if (t >= 0 && t <= 1 && t < bestT) { bestT = t; best = pt; }
      }
      return best ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    };

    // a cell the outline crosses: the corners on the plate and the crossings between them, walked
    // round the cell, make the plate's piece of it, fanned from its first corner. A crossing's
    // height is read a hair inside the outline, where the field still answers
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (solidCell(i, j)) continue;
        const corners: [number, number][] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        const on = corners.map(([ci, cj]) => inside(ci, cj));
        if (!on.some(Boolean)) continue;
        const ring: number[][] = [];
        for (let c = 0; c < 4; c++) {
          const [ci, cj] = corners[c], [di, dj] = corners[(c + 1) % 4];
          const here: [number, number] = [X(ci), Y(cj)], next: [number, number] = [X(di), Y(dj)];
          if (on[c]) ring.push([here[0], here[1], zOf(ci, cj)]);
          if (on[c] !== on[(c + 1) % 4]) {
            const pt = on[c] ? crossing(i, j, here, next) : crossing(i, j, next, here);
            const from = on[c] ? here : next;
            const zc = zAt(pt[0] + (from[0] - pt[0]) * 1e-3, pt[1] + (from[1] - pt[1]) * 1e-3) ?? topZ;
            ring.push([pt[0], pt[1], zc]);
          }
        }
        const [a, ...rest] = ring;
        for (let k = 0; k + 1 < rest.length; k++) {
          const b = rest[k], c = rest[k + 1];
          tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
          tri(a[0], a[1], baseZ, c[0], c[1], baseZ, b[0], b[1], baseZ);
        }
      }
    }

    // True outline walls: walk the boundary polygon and emit vertical wall quads.
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
