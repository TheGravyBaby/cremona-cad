/**
 * Shared oblique/cavalier projection for every rotatable plate view (the 3D
 * wireframe and the 3D contour map alike).
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
 */

const DEG = Math.PI / 180;

/**
 * Pre-multiply the three rotation matrices (Ry * Rx * Rz) into a single 2-row
 * matrix and return a lightweight per-point projection closure.
 *
 * Trig is computed **once** here; the returned function executes only
 * 6 multiplications and 5 additions per point.
 *
 * Rotation order (extrinsic / fixed-frame): Z → X → Y.
 * At (rotXDeg=0, rotYDeg=0, rotZDeg=0) the view looks straight down the
 * Z axis: screen X = violin X, screen Y = violin Y (plan view) — the flat
 * plan-view rendering used elsewhere is exactly this projection's zero-
 * rotation case.
 *
 * @param yOffset   - canvas world origin for the violin body
 * @param heightMid - p.height / 2 — centres Y before rotation
 * @param rotXDeg   - rotation around X axis (degrees)
 * @param rotYDeg   - rotation around Y axis (degrees)
 * @param rotZDeg   - rotation around Z axis (degrees)
 * @param zAmp      - visual amplification of arch height
 */
export function buildProjection(
  yOffset: number, heightMid: number,
  rotXDeg: number, rotYDeg: number, rotZDeg: number,
  zAmp = 1, xOffset = 0,
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
      xOffset + m00 * x + m01 * py + m02 * z,
      yCenter + m10 * x + m11 * py + m12 * z,
    ];
  };
}
