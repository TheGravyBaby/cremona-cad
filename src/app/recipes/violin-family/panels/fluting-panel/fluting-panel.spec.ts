// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, pointInPolygon } from '../../../../helpers/math/simpleGeometry';
import { samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed } from '../../../../helpers/math/vibeMath';
import { Pt } from '../../../../models/types';
import { FlutingPanel, gougeHalfWidth, solveFluting } from './fluting-panel';
import { OuterContourPanel, solveOuterContour } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { ChannelSolve, ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const withPlates = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  OuterContourPanel.seed(p);
  return p;
};

const seeded = (p = blank()): ViolinFamilyParams => {
  withPlates(p);
  FlutingPanel.seed(p);
  return p;
};

const points = (d: string, step = 0.25): Pt[] => samplePathToPolyline(d, step, true);
const subpaths = (d: string): number => (d.match(/M/g) ?? []).length;
const closed = (d: string): boolean => {
  const q = points(d);
  // to within the join's rounding: the S is found to the square root of the precision
  return dist(q[0], q[q.length - 1]) < 1e-5;
};
const offTheLine = (q: Pt[], line: Pt[]): number[] => {
  const idx = buildPolylineIndex(line);
  return q.map(pt => distPointToPolylineIndexed(pt, idx));
};
const edges = (c: ChannelSolve) => [c.outer, c.center, c.inner];

// the seed's viol neck is a tenth of the upper bout wide, and what that does to the channel moves
// with the seed: too narrow and the plate edge itself fails, wide enough and the channel closes.
// A scenario names the neck it wants by predicate and takes the narrowest that satisfies it
const violNecked = (wanted: (p: ViolinFamilyParams) => boolean): ViolinFamilyParams => {
  for (const fraction of [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6]) {
    const p = seeded();
    p.bouts!.useViolNeck = true;
    MainBoutsPanel.seed(p);
    p.bouts!.viol!.width = Math.round(p.bouts!.UBW * fraction);
    if (wanted(p)) return p;
  }
  throw new Error('no viol neck width gives this seed the scenario');
};

describe('the fluting solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveFluting(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('has no channel until the stage is seeded', () => {
    expect(solveFluting(blank())).toBeNull();
    expect(solveFluting(withPlates())).toBeNull();
  });

  it('seeds once: a channel a gouge cuts, a narrower one for the waist, and a larger pair for a cello', () => {
    const p = seeded();
    const g = { ...p.fluting!.top };
    expect(gougeHalfWidth(g.width, g.depth)).toBeGreaterThan(0);
    expect(g.cBoutWidth).toBeLessThan(g.width);
    expect(g.useCBoutGouge).toBe(true);
    expect(p.fluting!.flutingEdge).toBeGreaterThan(0);
    expect(p.fluting!.back).toEqual(g);

    p.fluting!.top.depth += 1;
    const edited = JSON.stringify(p);
    FlutingPanel.seed(p);
    expect(JSON.stringify(p)).toBe(edited);

    const cello = blank();
    cello.body.height = 750;
    cello.body.width = 440;
    seeded(cello);
    expect(cello.fluting!.top.width).toBeGreaterThan(g.width);
    expect(cello.fluting!.top.depth).toBeGreaterThan(g.depth);
  });
});

describe('the channel', () => {
  const p = seeded();
  const f = p.fluting!;
  const s = solveFluting(p)!;
  const edge = points(solveOuterContour(p)!.top!, 0.1);

  it('closes each of its three edges into one loop, on both plates', () => {
    expect(s.failures).toEqual([]);
    for (const channel of [s.top!, s.back!]) {
      for (const d of edges(channel)) {
        expect(subpaths(d)).toBe(1);
        expect(closed(d)).toBe(true);
        expect(d).not.toMatch(/NaN/);
      }
    }
  });

  it('runs its outer edge the fluting edge\'s width inside the plate edge, and never outside it', () => {
    const flat = points(s.outerEdge!, 0.1);
    expect(closed(s.outerEdge!)).toBe(true);
    expect(Math.min(...offTheLine(flat, edge))).toBeCloseTo(f.flutingEdge, 3);
    for (const channel of [s.top!, s.back!]) {
      const outer = points(channel.outer, 0.5);
      expect(Math.min(...offTheLine(outer, edge))).toBeCloseTo(f.flutingEdge, 3);
      // the fluting edge follows the corners and the channel bypasses them, so the two part there,
      // the channel on the inside
      const strays = offTheLine(outer.filter(q => !pointInPolygon(q, flat)), flat);
      expect(Math.max(0, ...strays)).toBeLessThan(0.1);
    }
  });

  it('runs its inner edge the channel\'s width inside its outer, along the bouts', () => {
    for (const plate of ['top', 'back'] as const) {
      const channel = s[plate]!;
      const width = p.fluting![plate].width;
      const outer = points(channel.outer);
      const alongTheBouts = points(channel.inner, 0.5).filter(q => q.y < 60 || q.y > p.body.height - 60);
      expect(alongTheBouts.length).toBeGreaterThan(100);
      for (const d of offTheLine(alongTheBouts, outer)) expect(d).toBeCloseTo(width, 3);
      expect(channel.innerEdgeOffset).toBeCloseTo(f.flutingEdge + width, 9);
    }
  });

  // the path's own vertices rather than samples along it, as the plates' spec does
  it('is symmetric about the centreline', () => {
    const vertices = (d: string): Pt[] => (d.match(/[MLAC][^MLAC]*/g) ?? []).map(cmd => {
      const n = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
      return { x: n[n.length - 2], y: n[n.length - 1] };
    });
    for (const d of edges(s.top!)) {
      const v = vertices(d);
      for (const q of v) {
        const mirrored = { x: -q.x, y: q.y };
        expect(Math.min(...v.map(w => dist(w, mirrored)))).toBeLessThan(1e-5);
      }
    }
  });

  it('reads the gouge\'s sweep: tighter for a deeper cut, flatter for a wider one, tighter through the waist', () => {
    const deeper = seeded();
    deeper.fluting!.top.depth *= 1.5;
    const wider = seeded();
    wider.fluting!.top.width *= 1.5;
    expect(solveFluting(deeper)!.top!.sweep).toBeLessThan(s.top!.sweep);
    expect(solveFluting(wider)!.top!.sweep).toBeGreaterThan(s.top!.sweep);
    expect(s.top!.cBoutSweep).toBeLessThan(s.top!.sweep);
    // the sweep's circle passes through the chord's ends and the trough
    const g = p.fluting!.top;
    expect(Math.hypot(g.width / 2, s.top!.sweep - g.depth)).toBeCloseTo(s.top!.sweep, 9);

    const one = seeded();
    one.fluting!.top.useCBoutGouge = false;
    const single = solveFluting(one)!.top!;
    expect(single.cBoutSweep).toBe(single.sweep);
    expect(single.innerEdgeOffset_cBout).toBe(single.innerEdgeOffset);
  });

  it('narrows through the waist with the second gouge, and nowhere else', () => {
    const one = seeded();
    one.fluting!.top.useCBoutGouge = false;
    const single = solveFluting(one)!.top!;
    const C0 = solveCenterBout(p)!.C0!;
    const waist = (d: string) => Math.min(...points(d).filter(q => Math.abs(q.y - C0.y) < 5).map(q => Math.abs(q.x)));
    const lowerBout = (d: string) => points(d).filter(q => q.y < 60);

    expect(s.top!.innerEdgeOffset_cBout).toBeLessThan(s.top!.innerEdgeOffset);
    // the narrower channel leaves the inner edge nearer the plate edge through the waist
    expect(waist(s.top!.inner)).toBeCloseTo(waist(single.inner) + (p.fluting!.top.width - p.fluting!.top.cBoutWidth), 2);
    expect(waist(s.top!.outer)).toBeCloseTo(waist(single.outer), 3);
    // and the lower bout's inner edge is the same line with either gouge
    expect(Math.max(...offTheLine(lowerBout(s.top!.inner), points(single.inner, 0.1)))).toBeLessThan(1e-3);
  });

  it('closes past viol corners at both ends, every corner compound, and across a viol neck', () => {
    const viol = seeded();
    viol.corners!.useViolCornerUC = true;
    viol.corners!.useViolCornerLC = true;
    const compound = seeded();
    for (const key of ['U31DoubleArc', 'L31DoubleArc', 'C21DoubleArc', 'C11DoubleArc'] as const) compound.corners![key] = true;
    // a neck wide enough to carry the channel; the seed's narrow one is the failure below
    const neck = violNecked(width => solveFluting(width)!.failures.length === 0);
    for (const [label, q] of [['viol corners', viol], ['compound corners', compound], ['viol neck', neck]] as const) {
      const t = solveFluting(q)!;
      expect(t.failures, label).toEqual([]);
      for (const d of [...edges(t.top!), ...edges(t.back!)]) {
        expect(subpaths(d), label).toBe(1);
        expect(closed(d), label).toBe(true);
      }
    }
  });
});

describe('what cannot be cut', () => {
  it('fails the plate whose channel no gouge cuts, deeper than half its width, and leaves the other', () => {
    const p = seeded();
    p.fluting!.top.depth = p.fluting!.top.width;
    const s = solveFluting(p)!;
    expect(s.failures.map(f => f.unsolved)).toEqual([['top']]);
    expect(s.failures[0].message).toContain('half its width');
    expect(s.top).toBeNull();
    expect(s.back).not.toBeNull();
  });

  // a narrow viol neck pulls the upper bout in until no S can take the channel round the upper
  // corner from the C bout
  it('fails both plates when the C bout can\'t be joined round a corner', () => {
    const p = violNecked(q => solveFluting(q)!.failures.some(f => f.message.includes('joined')));
    const s = solveFluting(p)!;
    expect(s.failures.map(f => f.unsolved)).toEqual([['top'], ['back']]);
    expect(s.failures[0].message).toContain('joined');
    expect(s.outerEdge).not.toBeNull();
  });

  it('fails the plate whose C bout channel no gouge cuts this deep, until that channel is turned off', () => {
    const p = seeded();
    p.fluting!.back.cBoutWidth = p.fluting!.back.depth;
    expect(solveFluting(p)!.failures.map(f => f.unsolved)).toEqual([['back']]);
    p.fluting!.back.useCBoutGouge = false;
    expect(solveFluting(p)!.failures).toEqual([]);
  });

  it('fails a plate while one of its gouge fields is cleared, and both while the fluting edge is', () => {
    const p = seeded();
    (p.fluting!.top as any).width = null;
    let s = solveFluting(p)!;
    expect(s.failures.map(f => f.unsolved)).toEqual([['top']]);
    expect(s.failures[0].message).toContain('needs a value');
    expect(s.back).not.toBeNull();

    const q = seeded();
    (q.fluting as any).flutingEdge = null;
    s = solveFluting(q)!;
    expect(s.failures.map(f => f.unsolved)).toEqual([['top', 'back']]);
    expect(s.outerEdge).toBeNull();
    q.fluting!.flutingEdge = -1;
    expect(solveFluting(q)!.failures.map(f => f.unsolved)).toEqual([['top', 'back']]);
  });

  it('fails everything, once, while the plate edge has not solved', () => {
    const p = seeded();
    p.corners!.U3R = 1;
    const s = solveFluting(p)!;
    expect(s.failures).toHaveLength(1);
    expect(s.failures[0].message).toContain('plate edge');
    expect(s.outerEdge).toBeNull();
    expect(s.top).toBeNull();
  });
});
