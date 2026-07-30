import { normalizeArchCurve, normalizeArchingParams } from './ceruti-arching';
import { ArchCatenary, ArchSpline, EnricoCerutiParams } from './ceruti-types';
import { splineZAt } from '../helpers/svgPathMath';

/**
 * Guards the load-time migration of spline arches. The format changed with
 * asymmetric arches: `t` used to be a half-span position (0 = plate edge,
 * 1 = peak) and every point was implicitly mirrored, where now `t` spans the
 * whole plate and `mirror` is explicit.
 *
 * The reason this is tested at the params level rather than the curve level is
 * the bug it exists to prevent: the migration used to run in the Long Arching
 * panel's ngOnInit, so a recipe taken straight to Export or the 3D preview was
 * interpolated from legacy coordinates and silently cut wrong.
 */

const HEIGHT = 15;
const SPAN = 356;

function legacySpline(): ArchSpline {
  // One point at half-span 0.53 — i.e. a bit past halfway from edge to peak.
  return { type: 'spline', archHeight: HEIGHT, points: [{ t: 0.53, z: 9 }] } as ArchSpline;
}

function paramsWith(top: ArchSpline): EnricoCerutiParams {
  return {
    arching: {
      top: { arch: top, thickness: 3, edgeDepth: 0, cross: { d: 0.4, pct: 0.9 } },
      bottom: { arch: legacySpline(), thickness: 4, edgeDepth: 0, cross: { d: 0.4, pct: 0.9 } },
      ribHeight: 30,
    },
  } as unknown as EnricoCerutiParams;
}

describe('normalizeArchCurve', () => {
  it('rewrites a legacy half-span point as a mirrored full-span one', () => {
    const arch = legacySpline();
    normalizeArchCurve(arch);
    expect(arch.points[0].t).toBeCloseTo(0.265, 9);
    expect(arch.points[0].mirror).toBe(true);
    expect(arch.points[0].z).toBe(9);
  });

  it('defaults the peak to mid-length', () => {
    const arch = legacySpline();
    normalizeArchCurve(arch);
    expect(arch.peak).toBe(0.5);
  });

  it('is idempotent — a second pass must not halve t again', () => {
    const arch = legacySpline();
    normalizeArchCurve(arch);
    const once = JSON.parse(JSON.stringify(arch));
    normalizeArchCurve(arch);
    expect(arch).toEqual(once);
  });

  it('leaves a current-format unmirrored point alone', () => {
    // The trap: in the current format an absent `mirror` means unmirrored, so the
    // migration can only be driven by an explicit `mirror === undefined` on data
    // that just came off disk — never inferred on read.
    const arch = {
      type: 'spline', archHeight: HEIGHT, peak: 0.5,
      points: [{ t: 0.25, z: 5, mirror: false }],
    } as ArchSpline;
    normalizeArchCurve(arch);
    expect(arch.points[0].t).toBe(0.25);
    expect(arch.points[0].mirror).toBe(false);
  });

  it('preserves the curve the legacy data described', () => {
    const arch = legacySpline();
    const legacyPoint = arch.points[0];
    // Old semantics: the point sat at t * span/2 from the near edge, mirrored.
    const nearY = legacyPoint.t * SPAN / 2;
    normalizeArchCurve(arch);
    expect(splineZAt(HEIGHT, SPAN, arch.points, arch.peak!, nearY)).toBeCloseTo(9, 6);
    expect(splineZAt(HEIGHT, SPAN, arch.points, arch.peak!, SPAN - nearY)).toBeCloseTo(9, 6);
  });

  it('ignores non-spline arches', () => {
    const catenary: ArchCatenary = { type: 'catenary', archHeight: HEIGHT };
    const copy: ArchCatenary = { ...catenary };
    normalizeArchCurve(copy);
    expect(copy).toEqual(catenary);
  });
});

describe('normalizeArchingParams', () => {
  it('migrates both plates, so exports never read legacy coordinates', () => {
    const p = paramsWith(legacySpline());
    normalizeArchingParams(p);
    for (const plate of [p.arching!.top, p.arching!.bottom]) {
      const arch = plate.arch as ArchSpline;
      expect(arch.points[0].t).toBeCloseTo(0.265, 9);
      expect(arch.points[0].mirror).toBe(true);
      expect(arch.peak).toBe(0.5);
    }
  });

  it('tolerates a recipe with no arching block at all', () => {
    expect(() => normalizeArchingParams({} as EnricoCerutiParams)).not.toThrow();
    expect(() => normalizeArchingParams(null)).not.toThrow();
    expect(() => normalizeArchingParams(undefined)).not.toThrow();
  });
});
