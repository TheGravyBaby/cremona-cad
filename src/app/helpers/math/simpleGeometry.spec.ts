// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addVec, angleOfVec, cross, cross3, dot, dot3, lerpVec3, lineDirection, lineFromPointAndSlope, lineFromTwoPoints, lineNormal,
  offsetLineByDistance, perp, scaleVec, shortestDistanceFromPtToLine, solveSineSum, stepAlong, subVec, TURN, unitVec, unitVec3, vecAtAngle,
  vecLength, vecLength3,
} from './simpleGeometry';

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

describe('vectors', () => {
  const vectors = [{ x: 3, y: 4 }, { x: -2.5, y: 0.7 }, { x: 0, y: -9 }, { x: 1e-4, y: 2e3 }];

  it('keep a unit vector at length 1 and leave zero at zero', () => {
    for (const v of vectors) expect(vecLength(unitVec(v))).toBeCloseTo(1, 12);
    expect(unitVec({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(unitVec3({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('turn perp a quarter counterclockwise', () => {
    for (const v of vectors) {
      expect(dot(v, perp(v))).toBeCloseTo(0, 9);
      expect(cross(v, perp(v))).toBeCloseTo(dot(v, v), 9);
    }
  });

  it('flip the sign of cross with the order', () => {
    for (const u of vectors) for (const v of vectors) expect(cross(u, v)).toBeCloseTo(-cross(v, u), 9);
  });

  it('read back the angle a vector was made from', () => {
    for (const theta of [0, 0.3, 2, -1.2, TURN.half - 0.01]) expect(angleOfVec(vecAtAngle(theta))).toBeCloseTo(theta, 12);
  });

  it('step a point by a direction scaled, the same as adding the scaled vector', () => {
    const from = { x: 12, y: -3 };
    for (const v of vectors) expect(stepAlong(from, v, 2.5)).toEqual(addVec(from, scaleVec(v, 2.5)));
    expect(subVec(stepAlong(from, vectors[1], 7), from)).toEqual(scaleVec(vectors[1], 7));
  });

  it('cross two 3D vectors into one square to both, its length their parallelogram', () => {
    const u = { x: 1.5, y: -2, z: 0.5 }, v = { x: 0.3, y: 4, z: -1 };
    const n = cross3(u, v);
    expect(dot3(n, u)).toBeCloseTo(0, 9);
    expect(dot3(n, v)).toBeCloseTo(0, 9);
    const sine = Math.sqrt(1 - (dot3(u, v) / (vecLength3(u) * vecLength3(v))) ** 2);
    expect(vecLength3(n)).toBeCloseTo(vecLength3(u) * vecLength3(v) * sine, 9);
  });

  it('lerp from one end to the other', () => {
    const a = { x: 1, y: 2, z: 3 }, b = { x: -4, y: 0, z: 9 };
    expect(lerpVec3(a, b, 0)).toEqual(a);
    expect(lerpVec3(a, b, 1)).toEqual(b);
  });

  it('give a line a unit direction and a normal square to it on the side the offset moves toward', () => {
    const lines = [lineFromPointAndSlope({ x: 2, y: 5 }, 0.4), lineFromPointAndSlope({ x: -1, y: 0 }, -3), lineFromTwoPoints({ x: 4, y: 1 }, { x: 4, y: 9 })];
    for (const line of lines) {
      const direction = lineDirection(line), normal = lineNormal(line);
      expect(vecLength(direction)).toBeCloseTo(1, 12);
      expect(dot(direction, normal)).toBeCloseTo(0, 12);
      const onLine = Number.isFinite(line.m) ? { x: 0, y: line.y } : { x: line.x, y: 0 };
      const moved = offsetLineByDistance(line, 2);
      expect(shortestDistanceFromPtToLine(stepAlong(onLine, normal, 2), moved)).toBeCloseTo(0, 9);
    }
  });
});
