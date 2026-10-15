// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { lineFromTwoPoints, pointOnCircle, shortestDistanceFromPtToLine, vectorFromSlope, TURN } from '../../../../helpers/math/simpleGeometry';
import { Pt } from '../../../../models/types';
import { mortiseFloorY, NeckPanel, neckHalfWidthAt, solveNeck } from './neck-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { NeckSolve, ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

// the properties a maker would check with a ruler on the finished neck: its length places the
// nut, the heel is one cove tangent to the back reaching the button, the wood is the thickness typed

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const arched = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  OuterContourPanel.seed(p);
  FlutingPanel.seed(p);
  LongArchingPanel.seed(p);
  return p;
};

const seeded = (p = blank()): ViolinFamilyParams => {
  arched(p);
  NeckPanel.seed(p);
  return p;
};

const solved = (p: ViolinFamilyParams): NeckSolve => {
  const s = solveNeck(p)!;
  expect(s.failures).toEqual([]);
  return s;
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const normalOf = (p: ViolinFamilyParams) => vectorFromSlope(p.neck!.angle * TURN.degree);
const directionOf = (p: ViolinFamilyParams) => vectorFromSlope(p.neck!.angle * TURN.degree + TURN.quarter);
// how far under the fingerboard plane a point sits
const under = (p: ViolinFamilyParams, s: NeckSolve, pt: Pt) => {
  const normal = normalOf(p);
  return (pt.x - s.root!.x) * -normal.a + (pt.y - s.root!.y) * -normal.b;
};

describe('the neck solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveNeck(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('seeds once the arching is there, once only, larger for a cello', () => {
    const q = blank();
    MainBoutsPanel.seed(q);
    NeckPanel.seed(q);
    expect(q.neck).toBeUndefined();

    const p = seeded();
    p.neck!.length += 1;
    const edited = JSON.stringify(p);
    NeckPanel.seed(p);
    expect(JSON.stringify(p)).toBe(edited);

    const cello = blank();
    cello.body.height = 750;
    cello.body.width = 440;
    seeded(cello);
    expect(cello.neck!.length).toBeGreaterThan(p.neck!.length);
    expect(cello.neck!.angle).toBe(p.neck!.angle);
  });

  it('fails a cleared field and a negative mortise rather than drawing, naming the neck', () => {
    for (const edit of [
      (p: ViolinFamilyParams) => { (p.neck as any).length = null; },
      (p: ViolinFamilyParams) => { p.neck!.mortiseDepth = -1; },
      (p: ViolinFamilyParams) => { (p.outerContour!.button as any).height = null; },
    ]) {
      const p = seeded();
      edit(p);
      const s = solveNeck(p)!;
      expect(s.root).toBeNull();
      expect(s.failures.map(f => f.unsolved)).toEqual([['neck', 'heel']]);
    }
  });
});

describe('the nut', () => {
  it('sits `length` mm from the mortise floor, along the fingerboard plane', () => {
    const p = seeded();
    const s = solved(p);
    expect(dist(s.bottomFront!, s.neckTop!)).toBeCloseTo(p.neck!.length, 9);
    expect(s.bottomFront!.y).toBeCloseTo(mortiseFloorY(p), 9);
    expect(shortestDistanceFromPtToLine(s.bottomFront!, lineFromTwoPoints(s.root!, s.neckTop!))).toBeLessThan(1e-9);
  });

  it('sits in the same place whether or not the heel can stand', () => {
    const p = seeded();
    const before = solved(p).neckTop!;
    p.neck!.heelRadius = 0;
    const s = solveNeck(p)!;
    expect(s.heel).toBeNull();
    expect(s.failures.map(f => f.unsolved)).toEqual([['heel']]);
    expect(dist(s.neckTop!, before)).toBeLessThan(1e-9);
  });

  it('tapers the neck in plan from the top width at the nut to the root width at the mortise floor', () => {
    const p = seeded();
    const s = solved(p);
    expect(2 * neckHalfWidthAt(p, s, s.neckTop!.y)).toBeCloseTo(p.neck!.topWidth, 9);
    expect(2 * neckHalfWidthAt(p, s, mortiseFloorY(p))).toBeCloseTo(p.neck!.rootWidth, 9);
  });
});

describe('the root', () => {
  it('ends the foot at the button tip, the button height beyond the plate', () => {
    const p = seeded();
    p.outerContour!.button.height = 13;
    const s = solved(p);
    expect(s.tip!.y).toBeCloseTo(p.body.height + 13, 9);
    expect(s.tip!.x).toBe(0);
  });

  it('brings the foot out of the plate at the mortise floor, on the arch\'s own surface', () => {
    const p = seeded();
    const s = solved(p);
    expect(s.plateAtMortise!.y).toBe(mortiseFloorY(p));
    // the plate's surface is under the fingerboard plane there, and over the rib
    expect(s.plateAtMortise!.x).toBeLessThan(s.bottomFront!.x);
    expect(s.plateAtMortise!.x).toBeGreaterThan(p.arching!.ribHeightUpper);
  });
});

describe('the heel', () => {
  const expectTangentToBack = (s: NeckSolve): void => {
    const h = s.heel!;
    const start = pointOnCircle(h, h.start);
    const len = dist(s.backRoot!, s.backNut!);
    const ub = new Pt((s.backNut!.x - s.backRoot!.x) / len, (s.backNut!.y - s.backRoot!.y) / len);
    expect(Math.abs((start.x - s.backRoot!.x) * ub.y - (start.y - s.backRoot!.y) * ub.x)).toBeLessThan(1e-9);
    expect(Math.abs((start.x - h.x) * ub.x + (start.y - h.y) * ub.y)).toBeLessThan(1e-9);
  };

  it('reaches the button tip on its own when the radius is wide', () => {
    const p = seeded();
    p.neck!.heelRadius = 40;
    const s = solved(p);
    expect(s.heel!.r).toBe(40);
    expect(s.heelFace).toBeNull();
    expect(dist(pointOnCircle(s.heel!, s.heel!.end), s.tip!)).toBeLessThan(1e-9);
    expectTangentToBack(s);
  });

  it('fillets onto a flat foot square to the neck when the radius is tight', () => {
    const p = seeded();
    p.neck!.heelRadius = 8;
    const s = solved(p);
    const [end, tip] = s.heelFace!;
    expect(tip).toEqual(s.tip);
    expect(dist(end, pointOnCircle(s.heel!, s.heel!.end))).toBeLessThan(1e-9);
    expect(Math.atan2(end.y - tip.y, end.x - tip.x)).toBeCloseTo(p.neck!.angle * TURN.degree, 9);
    const normal = normalOf(p);
    expect(Math.abs((end.x - s.heel!.x) * normal.a + (end.y - s.heel!.y) * normal.b)).toBeLessThan(1e-9);
    expectTangentToBack(s);
  });

  it('never pockets: no point of the cove dips below the foot line', () => {
    for (const radius of [3, 8, 15, 20, 25, 40, 80]) {
      const p = seeded();
      p.neck!.heelRadius = radius;
      const s = solved(p);
      const h = s.heel!;
      const direction = directionOf(p);
      let a1 = h.end;
      while (a1 - h.start > Math.PI) a1 -= 2 * Math.PI;
      while (a1 - h.start < -Math.PI) a1 += 2 * Math.PI;
      for (let i = 0; i <= 64; i++) {
        const a = h.start + (a1 - h.start) * i / 64;
        const x = h.x + h.r * Math.cos(a) - s.tip!.x;
        const y = h.y + h.r * Math.sin(a) - s.tip!.y;
        expect(x * direction.a + y * direction.b, `r=${radius}`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('reports a back run out past the button tip, where no cove reaches, and draws the back straight', () => {
    const p = seeded();
    p.neck!.lowerThickness = 60;
    const s = solveNeck(p)!;
    expect(s.heel).toBeNull();
    expect(s.backRoot).not.toBeNull();
    expect(s.failures.map(f => f.unsolved)).toEqual([['heel']]);
  });
});

describe('the neck wood', () => {
  it('is the upper thickness under the nut and the lower under the heel', () => {
    const p = seeded();
    const s = solved(p);
    expect(under(p, s, s.backNut!)).toBeCloseTo(p.neck!.upperThickness, 9);
    const [front, back] = s.lowerThickness!;
    expect(under(p, s, back)).toBeCloseTo(p.neck!.lowerThickness, 9);
    expect(under(p, s, front)).toBeCloseTo(0, 9);
  });

  it('measures the lower thickness on the line the foot is cut along, through the button tip', () => {
    const p = seeded();
    const s = solved(p);
    const along = directionOf(p);
    for (const end of s.lowerThickness!) expect((s.tip!.x - end.x) * along.a + (s.tip!.y - end.y) * along.b).toBeCloseTo(0, 9);
  });

  it('tapers the back in one straight line from the nut through the heel to the root', () => {
    const p = seeded();
    p.neck!.upperThickness = 12;
    p.neck!.lowerThickness = 16;
    const s = solved(p);
    const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    expect(cross(s.backNut!, s.lowerThickness![1], s.backRoot!)).toBeCloseTo(0, 9);
    expect(under(p, s, s.backRoot!)).toBeGreaterThan(16);
  });
});
