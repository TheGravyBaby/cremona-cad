// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Pt } from '../../../models/types';
import { samplePathToPolyline, splitPathStrings } from '../../../helpers/math/pathMath';
import { archedViolin } from '../../ceruti-fixtures';
import { EnricoCerutiParams } from '../../ceruti-types';
import { calculateNeck, defaultNeckParams, defaultStringSetup } from './ceruti-neck';
import { defaultFlutingParams, solveLongArch } from '../arching/ceruti-arch-geometry';
import { defaultVoluteParams } from './ceruti-scroll';
import { solveNeckForProfile } from '../outline/ceruti-calcs';
import { defaultNeckTemplateSpec, defineNeckTemplate, NeckTemplateSpec } from './ceruti-neck-template';
import { scrollOnNeck } from '../outline/ceruti-paths';
import { applyMatrix } from '../../../helpers/math/pathMath';
import { pointOnCircle } from '../../../helpers/math/simpleGeometry';

// set as the neck panel would have set it, then re-solved as the export does
function scrolledViolin(): EnricoCerutiParams {
  const p = archedViolin();
  p.neck = defaultNeckParams(p);
  p.stringSetup = defaultStringSetup(p);
  const gouge = (p.arching!.top.fluting ??= defaultFlutingParams(p));
  calculateNeck(p, solveLongArch(p, p.arching!.top.arch, gouge), gouge);
  p.scroll = defaultVoluteParams(p);
  expect(solveNeckForProfile(p)).toEqual({ neck: true, scroll: true });
  return p;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const ends = (d: string) => {
  const pts = samplePathToPolyline(d, 0.5, true);
  return [pts[0], pts.at(-1)!];
};

describe('the neck and scroll template', () => {
  it('closes the outline into one loop from the neck foot round the scroll and back', () => {
    const p = scrolledViolin();
    const t = defineNeckTemplate(p);
    expect(splitPathStrings(t.outline)).toHaveLength(1);
    const [first, last] = ends(t.outline);
    expect(dist(first, last)).toBeLessThan(1e-6);
    // the loop passes the nut on the neck's front and the eye lies inside it
    const m = scrollOnNeck(p);
    const pts = samplePathToPolyline(t.outline, 0.5);
    expect(Math.min(...pts.map(pt => dist(pt, p.neck!.neckTop!)))).toBeLessThan(0.5);
    const eye = applyMatrix(m, p.scroll!.eye);
    const crossings = pts.filter((pt, i) => i > 0 && (pts[i - 1].y > eye.y) !== (pt.y > eye.y) && pt.x < eye.x).length;
    expect(crossings % 2).toBe(1);
  });

  it('cuts the volute as slots one wall on the curve, the width taken in toward the eye', () => {
    const p = scrolledViolin();
    const spec = defaultNeckTemplateSpec(p);
    const t = defineNeckTemplate(p, spec);
    expect(t.slots.length).toBeGreaterThan(4);
    const m = scrollOnNeck(p);
    const centres = p.scroll!.spiral!.map(a => ({ c: applyMatrix(m, a), r: a.r }));
    for (const d of t.slots) {
      const pts = samplePathToPolyline(d, 0.25, true);
      // every point of the slot sits between some arc's radius and that radius less the slot width
      for (const pt of pts) {
        const inside = centres.some(({ c, r }) => dist(c, pt) <= r + 1e-3 && dist(c, pt) >= r - spec.slotWidth - 1e-3);
        expect(inside).toBe(true);
      }
    }
  });

  it('leaves a bridge between slots and ends them short of the front', () => {
    const p = scrolledViolin();
    const spec = defaultNeckTemplateSpec(p);
    const t = defineNeckTemplate(p, spec);
    const slotPts = t.slots.map(d => samplePathToPolyline(d, 0.25, true));
    for (let i = 0; i < slotPts.length; i++) {
      for (let j = i + 1; j < slotPts.length; j++) {
        let nearest = Infinity;
        for (const a of slotPts[i]) for (const b of slotPts[j]) nearest = Math.min(nearest, dist(a, b));
        expect(nearest).toBeGreaterThan(Math.min(spec.bridgeWidth, spec.minWeb) - 0.3);
      }
    }
    const edge = samplePathToPolyline(t.outline, 0.5);
    for (const pts of slotPts) {
      for (const pt of pts) expect(Math.min(...edge.map(e => dist(e, pt)))).toBeGreaterThan(spec.minWeb - 0.3);
    }
  });

  it('slots the innermost turn when its only neighbour stands outward, the web short of the slot width', () => {
    const p = scrolledViolin();
    const spiral = [...p.scroll!.spiral!].reverse();
    const inner = spiral[0], next = spiral[4];
    const gap = Math.min(...[0, 0.5, 1].map(f => Math.abs(dist(next, pointOnCircle(inner, inner.start + (inner.end - inner.start) * f)) - next.r)));
    const spec: NeckTemplateSpec = { ...defaultNeckTemplateSpec(p), minWeb: gap - 0.2 };
    expect(gap - spec.slotWidth).toBeLessThan(spec.minWeb);
    const t = defineNeckTemplate(p, spec);
    const mid = applyMatrix(scrollOnNeck(p), pointOnCircle(inner, (inner.start + inner.end) / 2));
    const onInner = t.slots.some(d => samplePathToPolyline(d, 0.25, true).some(pt => dist(pt, mid) < 0.3));
    expect(onInner).toBe(true);
  });

  it('pricks dots where two turns run too close for a slot, and the eye at its centre', () => {
    const p = scrolledViolin();
    const tight: NeckTemplateSpec = { ...defaultNeckTemplateSpec(p), minWeb: 100 };
    const t = defineNeckTemplate(p, tight);
    expect(t.slots).toHaveLength(0);
    expect(t.dots.length).toBeGreaterThan(10);
    const m = scrollOnNeck(p);
    const eye = applyMatrix(m, p.scroll!.eye);
    const [a] = ends(t.eye);
    expect(dist(a, eye)).toBeCloseTo(tight.dotRadius, 6);
  });
});
