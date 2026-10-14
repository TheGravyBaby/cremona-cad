// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { solveSineSum, TURN } from './simpleGeometry';

describe('solveSineSum', () => {
  const sum = (terms: { a: number; c: number }[], phi: number) => terms.reduce((acc, { a, c }) => acc + a * Math.sin(phi + c), 0);
  const terms = [{ a: 30, c: 0 }, { a: 12, c: TURN.half - 2 }, { a: 5, c: 1.1 }];

  it('finds the two angles the sum reaches a target at', () => {
    for (const target of [0, 7, -15, 20]) {
      const roots = solveSineSum(terms, target);
      expect(roots).toHaveLength(2);
      for (const phi of roots) expect(sum(terms, phi)).toBeCloseTo(target, 9);
      expect(Math.abs(roots[0] - roots[1])).toBeGreaterThan(1e-6);
    }
  });

  it('finds one angle at the peak and none beyond it', () => {
    const peak = Math.max(...Array.from({ length: 3600 }, (_, i) => sum(terms, i * TURN.degree / 10)));
    expect(solveSineSum(terms, peak * 1.001)).toEqual([]);
    const roots = solveSineSum([{ a: 4, c: 0.3 }], 4);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(TURN.quarter - 0.3, 9);
  });
});
