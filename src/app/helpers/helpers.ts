export function widthFromRatio(heightMm: number, ratioHeight: number, ratioWidth: number): number {
  const h = Math.max(1, heightMm);
  const a = Math.max(1, ratioHeight);
  const b = Math.max(1, ratioWidth);
  return h * (b / a);
}

type Pt = { x: number; y: number };

export function polarAngle(c: Pt, p: Pt) {
  return Math.atan2(p.y - c.y, p.x - c.x);
}

export function arcPathFrom3Points(
  c: Pt,
  start: Pt,
  end: Pt,
  opts?: { clockwise?: boolean; useLargeArc?: boolean }
) {
  const r = Math.hypot(start.x - c.x, start.y - c.y);

  // If your points are slightly off-radius, you can either trust start radius (compass)
  // or clamp end onto the circle:
  const endOnCircle = (() => {
    const ex = end.x - c.x, ey = end.y - c.y;
    const len = Math.hypot(ex, ey) || 1;
    return { x: c.x + (ex / len) * r, y: c.y + (ey / len) * r };
  })();

  const a0 = polarAngle(c, start);
  const a1 = polarAngle(c, endOnCircle);

  // Normalize delta to [0, 2π)
  let delta = a1 - a0;
  while (delta < 0) delta += Math.PI * 2;
  while (delta >= Math.PI * 2) delta -= Math.PI * 2;

  // Decide sweep + large-arc:
  // sweepFlag: 1 = "positive-angle direction" in SVG's coordinate system (y down), which appears clockwise.
  const clockwise = opts?.clockwise ?? true;

  // For a given direction, choose largeArc based on delta
  // (if clockwise, the swept angle is delta; if counterclockwise, it's 2π - delta)
  const swept = clockwise ? delta : (Math.PI * 2 - delta);
  const largeArc = opts?.useLargeArc ?? (swept > Math.PI);

  const sweepFlag = clockwise ? 1 : 0;
  const largeArcFlag = largeArc ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endOnCircle.x} ${endOnCircle.y}`;
}

export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function solveForQyByCompassLength(opts: {
  h: number;
  targetLen: number;   // L = ratio * h
  Cx: number;
  Cy: number;
  r: number;
  pickRoot?: "plus" | "minus";
}) {
  const { h, targetLen, Cx, Cy, r } = opts;

  const compassDistForQy = (Qy: number) => {
    const Qx = 0;
    const m = (Cy - Qy) / (Cx - Qx); // Cx should be > 0
    const yofX = (x: number) => m * x + Qy;

    // Line-circle intersection quadratic 
    const a = m*m + 1;
    const b = 2 * (m * (Qy - Cy) - Cx);
    const c = (Qy - Cy) ** 2 + Cx ** 2 - r * r;

    const disc = b*b - 4*a*c;
    if (disc < 0) return NaN;

    const sqrtDisc = Math.sqrt(disc);
    const xPlus  = (-b + sqrtDisc) / (2 * a);
    const xMinus = (-b - sqrtDisc) / (2 * a);

    // Choose the intersection on the right side of the right circle.
    // Usually that means "the larger x" (but keep it explicit).
    const Px = Math.max(xPlus, xMinus);
    const Py = yofX(Px);

    return dist({ x: Qx, y: Qy }, { x: Px, y: Py });
  };

  // Bracket the root
  // You can tune these bounds based on your geometry.
  let lo = 0;
  let hi = h;

  let fLo = compassDistForQy(lo) - targetLen;
  let fHi = compassDistForQy(hi) - targetLen;

  // If we failed to bracket (can happen with weird ratios), expand search a bit.
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) {
    lo = -h;
    hi =  2*h;
    fLo = compassDistForQy(lo) - targetLen;
    fHi = compassDistForQy(hi) - targetLen;
  }

  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) {
    throw new Error("Could not bracket a solution for Qy (compass length target may be impossible).");
  }

  // Bisection
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const fMid = compassDistForQy(mid) - targetLen;

    if (!Number.isFinite(fMid)) {
      // Nudge if we hit a NaN region
      hi = mid;
      continue;
    }

    if (Math.abs(fMid) < 1e-6) return mid;

    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return (lo + hi) / 2;
}