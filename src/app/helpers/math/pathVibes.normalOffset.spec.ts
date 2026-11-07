// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalOffsetZAt } from './pathVibes';

describe('a height field carried in along its normal', () => {
  it('moves a tilted plane square to itself, not straight down', () => {
    const tilt = 0.4, depth = 3;
    const plane = (x: number, _y: number) => Math.tan(tilt) * x;
    for (const [x, y] of [[0, 0], [12, -5], [-30, 40]]) {
      expect(normalOffsetZAt(plane, () => depth, x, y)!).toBeCloseTo(plane(x, y) - depth / Math.cos(tilt), 6);
    }
  });

  it('carries a dome in to the dome a depth smaller', () => {
    const r = 120, depth = 4;
    const dome = (x: number, y: number) => {
      const q = r * r - x * x - y * y;
      return q > 0 ? Math.sqrt(q) : null;
    };
    for (const [x, y] of [[0, 0], [30, 10], [-50, 60], [80, -20]]) {
      const inner = Math.sqrt((r - depth) ** 2 - x * x - y * y);
      expect(normalOffsetZAt(dome, () => depth, x, y)!).toBeCloseTo(inner, 3);
    }
  });

  it('reads the depth where it is carried from, not where it lands', () => {
    const tilt = 0.5;
    const plane = (x: number, _y: number) => Math.tan(tilt) * x;
    // a depth that grows across the slope: read at the landing point it would come out thinner
    const depthAt = (x: number, _y: number) => 2 + 0.05 * x;
    const z = normalOffsetZAt(plane, depthAt, 10, 0)!;
    const n = { x: -Math.sin(tilt), z: Math.cos(tilt) };
    // the outer point it came from: the one whose own depth, carried along the normal, lands on x = 10
    let u = 10;
    for (let i = 0; i < 50; i++) u = 10 + depthAt(u, 0) * n.x;
    expect(z).toBeCloseTo(plane(u, 0) - depthAt(u, 0) * n.z, 3);
  });

  it('is nothing off the field', () => {
    const disc = (x: number, y: number) => (x * x + y * y < 100 ? 0 : null);
    expect(normalOffsetZAt(disc, () => 1, 20, 0)).toBeNull();
  });
});
