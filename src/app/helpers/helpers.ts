import { Pt, Fraction } from "../models/types";

export function widthFromRatio(heightMm: number, ratioHeight: number, ratioWidth: number): number {
  const h = Math.max(1, heightMm);
  const a = Math.max(1, ratioHeight);
  const b = Math.max(1, ratioWidth);
  return h * (b / a);
}

export function polarAngle(c: Pt, p: Pt) {
  return Math.atan2(p.y - c.y, p.x - c.x);
}

export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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


export function safeFraction(n: number, d: number):
  { ok: true; value: Fraction } | { ok: false; error: string } {

  if (!Number.isFinite(n) || !Number.isFinite(d)) return { ok: false, error: 'Ratios must be numbers.' };

  // If you want integers only:
  if (!Number.isInteger(n) || !Number.isInteger(d)) return { ok: false, error: 'Ratio parts must be whole numbers.' };

  if (n <= 0 || d <= 0) return { ok: false, error: 'Ratio parts must be > 0.' };

  // Optional: clamp silly values (prevents “1:999999” footguns)
  if (n > 10_000 || d > 10_000) return { ok: false, error: 'Ratio parts are too large.' };

  return { ok: true, value: { n, d } };
}