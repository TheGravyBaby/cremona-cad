import { Circle, Rectangle } from '../../models/types';
import { renderCircle, renderCrosshair, renderLine, renderPath, renderRect } from '../../helpers/renderFuncs';
import { ArchCurve, ArchSplinePoint, ArchingParams, CerutiColors, EnricoCerutiParams } from '../ceruti-types';

function buildCycloidPath(
  hEff: number,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  d: number,
  N = 80,
): string {
  if (hEff <= 0 || span <= 0) return '';
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI;
    // Trochoid family scaled to fit (span, hEff).
    // x: (t - d*sin(t)) / (2π) * span  →  d=0: linear/cosine arch; d=1: standard cycloid
    // z: (1 - cos(t)) / 2 * hEff       →  independent of d after normalisation
    const yLocal = ((t - d * Math.sin(t)) / (2 * Math.PI)) * span;
    const z      = ((1 - Math.cos(t))     / 2)             * hEff;
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * z} ${yStart + yLocal}`);
  }
  return pts.join(' ');
}

// 1-D natural cubic spline: given strictly-increasing ys[] and values zs[],
// returns a function z(y).  Natural BC: M[0] = M[n] = 0 (zero curvature at ends).
function makeNaturalSpline(ys: number[], zs: number[]): (y: number) => number {
  const n = ys.length - 1;
  const h: number[] = ys.slice(0, n).map((v, i) => ys[i + 1] - v);

  // Solve for interior second derivatives M[1..n-1] only.
  // Interior equation i (1..n-1):
  //   h[i-1]*M[i-1] + 2*(h[i-1]+h[i])*M[i] + h[i]*M[i+1] = 6*((z[i+1]-z[i])/h[i] - (z[i]-z[i-1])/h[i-1])
  // M[0] = M[n] = 0 by natural BC.
  const m = n - 1;
  const bd: number[] = []; // main diagonal
  const up: number[] = []; // upper diagonal (coefficient of M[i+2] in interior row i)
  const rhs: number[] = [];
  for (let i = 0; i < m; i++) {
    const r = i + 1;
    bd.push(2 * (h[r - 1] + h[r]));
    up.push(i < m - 1 ? h[r] : 0);
    rhs.push(6 * ((zs[r + 1] - zs[r]) / h[r] - (zs[r] - zs[r - 1]) / h[r - 1]));
  }
  // Thomas forward elimination (lower diagonal = upper diagonal of previous row, symmetric)
  for (let i = 1; i < m; i++) {
    const f = up[i - 1] / bd[i - 1];
    bd[i]  -= f * up[i - 1];
    rhs[i] -= f * rhs[i - 1];
  }
  // Back substitution
  const Mi: number[] = new Array(m).fill(0);
  if (m > 0) {
    Mi[m - 1] = rhs[m - 1] / bd[m - 1];
    for (let i = m - 2; i >= 0; i--) Mi[i] = (rhs[i] - up[i] * Mi[i + 1]) / bd[i];
  }
  const M = [0, ...Mi, 0];

  return (y: number): number => {
    let i = 0;
    while (i < n - 1 && ys[i + 1] <= y) i++;
    const hi = h[i];
    const s  = ys[i + 1] - y;
    const t  = y - ys[i];
    return (M[i] * s * s * s + M[i + 1] * t * t * t) / (6 * hi)
         + (zs[i]     / hi - M[i]     * hi / 6) * s
         + (zs[i + 1] / hi - M[i + 1] * hi / 6) * t;
  };
}

function buildSplinePath(
  hEff: number,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  points: ArchSplinePoint[],
  N = 120,
): string {
  if (hEff <= 0 || span <= 0) return '';
  const sorted = [...points].sort((a, b) => a.t - b.t);
  // Full symmetric knot list along y (always single-valued)
  const ys: number[] = [0];
  const zs: number[] = [0];
  for (const p of sorted)               { ys.push(p.t * span / 2);       zs.push(p.z); }
  ys.push(span / 2);                      zs.push(hEff);
  for (const p of sorted.slice().reverse()) { ys.push(span - p.t * span / 2); zs.push(p.z); }
  ys.push(span);                           zs.push(0);

  const zOf = makeNaturalSpline(ys, zs);
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * span;
    const z = zOf(y);
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * z} ${yStart + y}`);
  }
  return pts.join(' ');
}

function buildArchPath(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
): string {
  // archHeight is measured from the plate outer edge — the luthier-standard measurement.
  // No plate thickness subtraction: the arch curve starts at xBase (plate outer edge) and
  // peaks at xBase + sign * archHeight.
  const h = arch.archHeight;
  switch (arch.type) {
    case 'catenary': return buildCatenaryPath(h, span, yStart, xBase, sign);
    case 'cycloid':  return buildCycloidPath(h, span, yStart, xBase, sign, arch.d);
    case 'spline':   return buildSplinePath(h, span, yStart, xBase, sign, arch.points);
  }
}

// ===== Guide overlays =====

function renderSplineGuide(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'spline') return;
    for (const pt of arch.points) {
      const cx  = xBase + sign * pt.z;
      const yHi = yStart + pt.t * span / 2;
      const yLo = yStart + span - pt.t * span / 2;
      renderCrosshair({ x: cx, y: yHi }, color, 2, 1.5, 1)(g, ui);
      renderCrosshair({ x: cx, y: yLo }, color, 2, 1.5, 1)(g, ui);
    }
  };
}

function renderCycloidGuide(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'cycloid' || arch.d <= 0.01 || arch.archHeight <= 0) return;
    const h  = arch.archHeight;
    // Rolling circle at arch midpoint (t=π):
    //   centre sits at h/2 above the plate-edge baseline (independent of d)
    //   radius r = h / (2d)  →  for d=1 the top of the circle touches the arch peak
    const r  = h / (2 * arch.d);
    const cx = xBase + sign * (h / 2);
    const cy = yStart + span / 2;
    renderCircle(new Circle(cx, cy, r), color)(g, ui);
    renderCircle(new Circle(xBase + sign * h, cy, .5), color)(g, ui);
  };
}

/**
 * Coordinate mapping for all long-arching renders:
 *   canvas X  =  Z (depth): back plate → negative, rib 0→ribHeight, top plate → positive
 *   canvas Y  =  violin Y (length): 0 at button end, params.height at neck
 */

// ===== Catenary math =====

function solveCatenaryA(H: number, L: number): number {
  // Solve a * (cosh(L / (2a)) - 1) = H via bisection.
  // f is large-positive for small a, large-negative for large a.
  const f = (a: number): number => a * (Math.cosh(L / (2 * a)) - 1) - H;
  let lo = L * 1e-4;
  let hi = L * 1e4;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    f(mid) > 0 ? (lo = mid) : (hi = mid);
  }
  return (lo + hi) / 2;
}

/**
 * Build an SVG polyline path for a catenary arch curve.
 *
 * @param hEff    Effective arch height above the plate-edge reference level (archHeight - plateThickness).
 * @param span    Length of the arch span along canvas Y (height − 2 × overhang).
 * @param yStart  Canvas Y at the bottom end of the span (= params.overhang).
 * @param xBase   Canvas X at zero arch contribution (plate edge at the rib ends).
 * @param sign    +1 for top plate (arches right), −1 for back plate (arches left).
 */
function buildCatenaryPath(
  hEff: number,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  N = 80,
): string {
  if (hEff <= 0 || span <= 0) return '';
  const a = solveCatenaryA(hEff, span);
  const peak = hEff + a;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const yLocal = (i / N) * span;
    const z = peak - a * Math.cosh((yLocal - span / 2) / a);
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * z} ${yStart + yLocal}`);
  }
  return pts.join(' ');
}

// ===== Render =====

export const renderLongArchBoxes = (
  p: EnricoCerutiParams,
  a: ArchingParams,
  colors: CerutiColors,
  showGuides = false,
) => (g: any, ui: any): void => {
  const ribBox = new Rectangle(
    { x: 0, y: p.overhang },
    { x: a.ribHeight, y: p.height - p.overhang },
  );
  const topPlateBox = new Rectangle(
    { x: a.ribHeight, y: 0 },
    { x: a.ribHeight + a.top.thickness, y: p.height },
  );
  const backPlateBox = new Rectangle(
    { x: -a.bottom.thickness, y: 0 },
    { x: 0, y: p.height },
  );
  


  const span    = p.height - 2 * (p.overhang + p.flutingWidth);
  const yStart  = p.overhang + p.flutingWidth;

  const topPath  = buildArchPath(a.top.arch,    span, yStart, a.ribHeight + a.top.thickness, 1);
  const backPath = buildArchPath(a.bottom.arch, span, yStart, -a.bottom.thickness,           -1);

  if (topPath)  renderPath(topPath,  colors.archTop,  1.5)(g, ui);
  if (backPath) renderPath(backPath, colors.archBack, 1.5)(g, ui);

  renderRect(ribBox, colors.mouldTrace)(g, ui);
  renderRect(topPlateBox, colors.outerTrace)(g, ui);
  renderRect(backPlateBox, colors.mouldTrace)(g, ui);
  renderLine({x:0, y: p.bouts.UCr.y}, {x:a.ribHeight, y: p.bouts.UCr.y}, colors.mouldTrace)(g, ui);
  renderLine({x:0, y: p.bouts.LCr.y}, {x:a.ribHeight, y: p.bouts.LCr.y}, colors.mouldTrace)(g, ui);



  if (showGuides) {
    renderCycloidGuide(a.top.arch,    span, yStart, a.ribHeight + a.top.thickness, 1,  colors.archTop)(g, ui);
    renderCycloidGuide(a.bottom.arch, span, yStart, -a.bottom.thickness,           -1, colors.archBack)(g, ui);
    renderSplineGuide(a.top.arch,    span, yStart, a.ribHeight + a.top.thickness, 1,  colors.archTop)(g, ui);
    renderSplineGuide(a.bottom.arch, span, yStart, -a.bottom.thickness,           -1, colors.archBack)(g, ui);
  } 


};
