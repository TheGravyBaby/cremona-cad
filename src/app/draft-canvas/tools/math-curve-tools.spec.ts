import { Pt } from '../../models/types';
import { battenPath, catenaryBetween, cycloidBetween } from '../../helpers/math/pathVibes';
import { samplePathToPolyline } from '../../helpers/math/pathMath';
import { trochoidNorm, battenBeziers, polylineCumulativeLengths, projectOntoPolyline } from '../../helpers/math/vibeMath';
import { fakeToolHost } from './fake-tool-host';
import { PathShape, PathSource, pathFromSource } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { createBattenTool, createCatenaryTool, createCycloidTool } from './math-curve-tools';
import { endpointGrabbers, withBattenPinAdded, withBattenPinRemoved, withEndpoint } from './shape-grabbers';
import { reflectAcross, rotateAbout, transformShape, translateShape } from './shape-transform';

const at = (x: number, y: number): Pt => ({ x, y });
const toolbox = { currentDashed: false } as ToolboxStore;

describe('catenaryBetween', () => {
  it('runs end to end, reaching the depth at the middle and hanging as a chain does', () => {
    const pts = samplePathToPolyline(catenaryBetween(at(0, 0), at(100, 0), 30), 0.25, true);
    expect(pts[0]).toEqual(at(0, 0));
    expect(pts[pts.length - 1].x).toBeCloseTo(100, 9);
    expect(pts[pts.length - 1].y).toBeCloseTo(0, 9);
    expect(Math.max(...pts.map(p => p.y))).toBeCloseTo(30, 2);

    // y = a(cosh(50/a) − cosh((x − 50)/a)), with a fixed by the depth
    const bottom = pts.reduce((b, p) => p.y > b.y ? p : b);
    expect(bottom.x).toBeCloseTo(50, 1);
    let lo = 1, hi = 1e4;
    for (let i = 0; i < 80; i++) {
      const a = (lo + hi) / 2;
      a * (Math.cosh(50 / a) - 1) > 30 ? (lo = a) : (hi = a);
    }
    const a = lo;
    for (const p of pts) expect(p.y).toBeCloseTo(a * (Math.cosh(50 / a) - Math.cosh((p.x - 50) / a)), 2);
  });

  it('bows to the right of start→end for a negative depth, measured square to a slanted chord', () => {
    const pts = samplePathToPolyline(catenaryBetween(at(0, 0), at(30, 40), -10), 0.25, true);
    // the right of (0,0)→(30,40) is along (0.8, −0.6)
    const off = (p: Pt) => (p.x * 0.8 - p.y * 0.6);
    expect(Math.max(...pts.map(off))).toBeCloseTo(10, 2);
    expect(Math.min(...pts.map(off))).toBeGreaterThan(-1e-6);
  });

  it('is a straight line at no depth', () => {
    expect(catenaryBetween(at(0, 0), at(10, 0), 0)).toBe('M 0 0 L 10 0');
  });
});

describe('Catenary tool', () => {
  it('takes the ends, then the depth from how far the third click stands off the chord', () => {
    const host = fakeToolHost();
    const tool = createCatenaryTool(toolbox);
    tool.onPointerDown(at(0, 0), host);
    tool.onPointerUp(at(0, 0), host);
    tool.onPointerDown(at(100, 0), host);
    expect(host.added).toHaveLength(0);
    tool.onPointerDown(at(80, 25), host);
    expect((host.added[0] as PathShape).d).toBe(catenaryBetween(at(0, 0), at(100, 0), 25));
  });
});

describe('cycloidBetween', () => {
  // the curve the cross arch panel draws, stood on a chord from (0, 0) to (100, 0) and 30 high
  function expectOnTrochoid(factor: number, pct: number) {
    const pts = samplePathToPolyline(cycloidBetween(at(0, 0), at(100, 0), 30, factor, pct), 0.05, true);
    const cum = polylineCumulativeLengths(pts);
    for (let i = 0; i <= 200; i++) {
      const { x, z } = trochoidNorm(i / 200, factor, pct);
      expect(projectOntoPolyline(at(x * 100, z * 30), pts, cum).dist).toBeLessThan(2e-3);
    }
    expect(pts[pts.length - 1].x).toBeCloseTo(100, 9);
  }

  it('follows a full cycloid, cusps and all', () => expectOnTrochoid(1, 1));
  it('follows one whose ends curl under the chord', () => expectOnTrochoid(0.8, 1.3));

  it('crowns at the depth, on the side it is given', () => {
    const pts = samplePathToPolyline(cycloidBetween(at(0, 0), at(0, 100), -20, 1, 1), 0.1, true);
    // the right of (0,0)→(0,100) is +x
    expect(Math.max(...pts.map(p => p.x))).toBeCloseTo(20, 3);
  });
});

describe('Cycloid tool', () => {
  it('draws with the factor and percent set in the toolbox', () => {
    const host = fakeToolHost();
    const pen = { currentDashed: false, currentCycloidFactor: 0.5, currentCycloidPct: 0.8 } as ToolboxStore;
    const tool = createCycloidTool(pen);
    tool.onPointerDown(at(0, 0), host);
    tool.onPointerUp(at(100, 0), host);
    tool.onPointerDown(at(40, 25), host);
    const placed = host.added[0] as PathShape;
    expect(placed.d).toBe(cycloidBetween(at(0, 0), at(100, 0), 25, 0.5, 0.8));
    expect(placed.source).toEqual({ kind: 'cycloid', start: at(0, 0), end: at(100, 0), depth: 25, factor: 0.5, pct: 0.8 });
  });
});

describe('battenBeziers', () => {
  const pins = [at(0, 0), at(30, 12), at(60, 5), at(100, 20)];
  const unit = (v: Pt) => { const l = Math.hypot(v.x, v.y); return { x: v.x / l, y: v.y / l }; };

  it('runs through every pin without a kink', () => {
    const spans = battenBeziers(pins, false);
    expect(spans.map(s => s[0])).toEqual(pins.slice(0, -1));
    expect(spans[spans.length - 1][3]).toEqual(pins[pins.length - 1]);
    for (let i = 1; i < spans.length; i++) {
      const into = unit({ x: spans[i - 1][3].x - spans[i - 1][2].x, y: spans[i - 1][3].y - spans[i - 1][2].y });
      const out = unit({ x: spans[i][1].x - spans[i][0].x, y: spans[i][1].y - spans[i][0].y });
      expect(into.x).toBeCloseTo(out.x, 9);
      expect(into.y).toBeCloseTo(out.y, 9);
    }
  });

  it('carries no bend at a free end, as a strip running on past its last pin', () => {
    const spans = battenBeziers(pins, false);
    const [a, c1, c2] = spans[0];
    expect(a.x - 2 * c1.x + c2.x).toBeCloseTo(0, 9);
    expect(a.y - 2 * c1.y + c2.y).toBeCloseTo(0, 9);
  });

  it('lies straight through pins in a row, and round through pins on a circle', () => {
    for (const p of samplePathToPolyline(battenPath([at(0, 0), at(10, 10), at(35, 35)], false), 0.5, true)) {
      expect(p.x).toBeCloseTo(p.y, 9);
    }
    const ring = Array.from({ length: 8 }, (_, i) => at(50 * Math.cos(i * Math.PI / 4), 50 * Math.sin(i * Math.PI / 4)));
    for (const p of samplePathToPolyline(battenPath(ring, true), 0.5)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(50, 0);
  });

  it('bends the same both sides of a symmetric set of pins', () => {
    const pts = samplePathToPolyline(battenPath([at(-40, 0), at(-15, 10), at(15, 10), at(40, 0)], false), 0.1, true);
    const cum = polylineCumulativeLengths(pts);
    for (const p of pts) expect(projectOntoPolyline(at(-p.x, p.y), pts, cum).dist).toBeLessThan(1e-3);
  });
});

describe('Batten tool', () => {
  const place = (points: Pt[]) => {
    const host = fakeToolHost();
    const tool = createBattenTool(toolbox);
    for (const p of points) tool.onPointerDown(p, host);
    return { host, tool };
  };

  it('finishes on Enter as a fair curve through its pins, keeping them', () => {
    const { host, tool } = place([at(0, 0), at(30, 12), at(60, 5)]);
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }), host);
    const shape = host.added[0] as PathShape;
    expect(shape.source).toEqual({ kind: 'batten', pins: [at(0, 0), at(30, 12), at(60, 5)], closed: false });
    expect(shape.d).toBe(battenPath([at(0, 0), at(30, 12), at(60, 5)], false));
  });

  it('closes into a loop when the first pin is clicked again', () => {
    const { host } = place([at(0, 0), at(30, 0), at(15, 20), at(0, 0)]);
    expect((host.added[0] as PathShape).source).toMatchObject({ kind: 'batten', closed: true });
    expect((host.added[0] as PathShape).d).toMatch(/Z$/);
  });

  it('re-fairs through a pin dragged to a new place', () => {
    const { host, tool } = place([at(0, 0), at(30, 12), at(60, 5)]);
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }), host);
    const shape = host.added[0] as PathShape;
    expect(endpointGrabbers(shape, 1)!.map(g => g.pos)).toEqual([at(0, 0), at(30, 12), at(60, 5)]);
    const moved = withEndpoint(shape, 'pin-1', at(30, 25)) as PathShape;
    expect(moved.source).toMatchObject({ pins: [at(0, 0), at(30, 25), at(60, 5)] });
    expect(moved.d).toBe(battenPath([at(0, 0), at(30, 25), at(60, 5)], false));
  });

  const batten = (pins: Pt[], closed = false): PathShape =>
    ({ id: 'b', type: 'path', d: battenPath(pins, closed), source: { kind: 'batten', pins, closed } });

  it('takes a new pin on the curve, in the span it was put in', () => {
    const shape = batten([at(0, 0), at(30, 12), at(60, 5)]);
    const added = withBattenPinAdded(shape, at(45, 11));
    const pins = (added.source as { pins: Pt[] }).pins;
    expect(pins).toHaveLength(4);
    expect([pins[0], pins[1], pins[3]]).toEqual([at(0, 0), at(30, 12), at(60, 5)]);
    const onCurve = samplePathToPolyline(shape.d, 0.05, true);
    expect(projectOntoPolyline(pins[2], onCurve, polylineCumulativeLengths(onCurve)).dist).toBeLessThan(0.05);
    expect(added.d).toBe(battenPath(pins, false));
  });

  it('gives up a pin, but never below two, or three for a loop', () => {
    const removed = withBattenPinRemoved(batten([at(0, 0), at(30, 12), at(60, 5)]), 1)!;
    expect(removed.source).toMatchObject({ pins: [at(0, 0), at(60, 5)] });
    expect(removed.d).toBe(battenPath([at(0, 0), at(60, 5)], false));
    expect(withBattenPinRemoved(batten([at(0, 0), at(60, 5)]), 0)).toBeNull();
    expect(withBattenPinRemoved(batten([at(0, 0), at(30, 0), at(15, 20)], true), 0)).toBeNull();
  });
});

describe('curve sources', () => {
  const sources: PathSource[] = [
    { kind: 'catenary', start: at(0, 0), end: at(100, 0), depth: 25 },
    { kind: 'cycloid', start: at(0, 0), end: at(100, 0), depth: 25, factor: 0.7, pct: 0.9 },
    { kind: 'batten', pins: [at(0, 0), at(30, 12), at(60, 5)], closed: false },
  ];

  // redrawn from what it carries, a moved, turned or flipped curve lands on itself
  it('stay true to their curve through a move, a turn and a flip', () => {
    for (const source of sources) {
      const shape: PathShape = { id: 's', type: 'path', d: pathFromSource(source), source };
      const moved = [
        translateShape(shape, 5, -3),
        transformShape(shape, rotateAbout(at(10, 20), 0.6)),
        transformShape(shape, reflectAcross(at(0, 50), 0.3)),
      ] as PathShape[];
      for (const m of moved) {
        const a = samplePathToPolyline(m.d, 1, true), b = samplePathToPolyline(pathFromSource(m.source!), 1, true);
        a.forEach((p, i) => {
          expect(p.x).toBeCloseTo(b[i].x, 6);
          expect(p.y).toBeCloseTo(b[i].y, 6);
        });
      }
    }
  });
});
