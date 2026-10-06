// @vitest-environment node
import { clampSplinePointHeights } from './ceruti-arching';
import { ArchSpline } from '../../ceruti-types';
import { splineZAt } from '../../../helpers/math/pathMath';

const HEIGHT = 15;
const SPAN = 356;

describe('clampSplinePointHeights', () => {
  it('floors at the given level instead of zero', () => {
    const points = [{ z: -0.4 }, { z: -9 }];
    clampSplinePointHeights(points, HEIGHT, -3.5);
    expect(points.map(p => p.z)).toEqual([-0.4, -3.5]);
  });

  // The invariant this exists to protect: the peak is what pins the arch's
  // height, so a taller control point would quietly become the real high spot
  // and the entered Arch Height would stop describing the curve.
  it('keeps the curve\'s true maximum equal to the entered arch height', () => {
    const arch = {
      type: 'spline', archHeight: HEIGHT, peak: 0.5,
      points: [{ t: 0.3, z: 22, mirror: true }],
    } as ArchSpline;

    const maxOf = (a: ArchSpline): number => {
      let max = 0;
      for (let i = 0; i <= 2000; i++) max = Math.max(max, splineZAt(a.archHeight, SPAN, a.points, a.peak!, SPAN * i / 2000));
      return max;
    };
    expect(maxOf(arch)).toBeGreaterThan(HEIGHT);

    clampSplinePointHeights(arch.points, arch.archHeight);
    expect(maxOf(arch)).toBeCloseTo(HEIGHT, 9);
  });
});
