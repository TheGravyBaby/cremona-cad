import { buildPolylineIndex, distPointToPolyline, distPointToPolylineIndexed } from './draftMath';

describe('distPointToPolylineIndexed', () => {
  it('matches the brute-force distance for varied loops, cell sizes, and query points', () => {
    // Deterministic LCG so any failure reproduces.
    let seed = 42;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

    for (let trial = 0; trial < 5; trial++) {
      // Lobed closed loop, roughly violin-outline sized (mm).
      const n = 50 + Math.floor(rand() * 400);
      const poly = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 2 * Math.PI;
        const r = 50 + 30 * Math.sin(3 * a) + rand() * 5;
        return { x: 100 + r * Math.cos(a), y: 180 + 1.8 * r * Math.sin(a) };
      });

      for (const cellSize of [2, 6, 25]) {
        const idx = buildPolylineIndex(poly, cellSize);
        for (let q = 0; q < 200; q++) {
          // Spans interior, exterior, and points outside the index grid entirely.
          const pt = { x: rand() * 500 - 150, y: rand() * 700 - 170 };
          expect(distPointToPolylineIndexed(pt, idx)).toBeCloseTo(distPointToPolyline(pt, poly), 9);
        }
      }
    }
  });

  it('returns Infinity for an empty polyline, matching the brute force', () => {
    expect(distPointToPolylineIndexed({ x: 3, y: 4 }, buildPolylineIndex([]))).toBe(Infinity);
  });
});
