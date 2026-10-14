// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { angleFromCenter, angleWithinSweep, dist, pointOnCircle } from '../../../../helpers/math/simpleGeometry';
import { Arc, Pt } from '../../../../models/types';
import { defineSideScrollPath, scrollExtent, scrollLines, solveScroll } from './scroll-panel';
import { VolutePanel } from '../volute-panel/volute-panel';
import { NeckPanel } from '../neck-panel/neck-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { ScrollSolve, ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (p = blank()): ViolinFamilyParams => {
  for (const panel of [MainBoutsPanel, CornersPanel, OuterContourPanel, FlutingPanel, LongArchingPanel, NeckPanel, VolutePanel]) panel.seed(p);
  return p;
};

const solved = (p: ViolinFamilyParams): ScrollSolve => {
  const s = solveScroll(p)!;
  expect(s.failures).toEqual([]);
  return s;
};

const end = (a: Arc) => pointOnCircle(a, a.end);
const start = (a: Arc) => pointOnCircle(a, a.start);
const meets = (a: Pt, b: Pt) => expect(dist(a, b)).toBeLessThan(1e-9);
// the heading of an arc at an angle, counterclockwise
const heading = (angle: number) => new Pt(-Math.sin(angle), Math.cos(angle));

describe('the scroll solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveScroll(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('solves the seeded scroll whole, F0 sharing S3\'s centre as on the Betts', () => {
    const p = seeded();
    const s = solved(p);
    expect(Math.abs(s.F0!.x - s.S3!.x)).toBeLessThan(0.5);
    expect(scrollExtent(s).height).toBeGreaterThan(scrollExtent(s).width);
    expect(defineSideScrollPath(p, s)).toContain(' A ');
  });
});

describe('the back', () => {
  const p = seeded();
  const v = p.scroll!;
  const s = solved(p);

  it('runs S2 on tangent from S1 through its own sweep, then the straight on along S2\'s heading', () => {
    meets(start(s.S2!), end(s.S1!));
    expect(s.S2!.end - s.S2!.start).toBeCloseTo(v.S2Sweep * Math.PI / 180, 12);
    const [a, b] = scrollLines(p, s).backStraight;
    meets(a, end(s.S2!));
    expect(dist(a, b)).toBeCloseTo(v.backStraight, 9);
    const h = heading(s.S2!.end);
    expect(((b.x - a.x) * h.x + (b.y - a.y) * h.y) / v.backStraight).toBeCloseTo(1, 9);
  });

  it('turns S3 back the other way from the straight\'s foot, down to the hang below the nut', () => {
    meets(end(s.S3!), scrollLines(p, s).backStraight[1]);
    expect(start(s.S3!).y).toBeCloseTo(-v.hang, 9);
  });

  it('lets a negative hang lift the duck tail above the nut', () => {
    const q = seeded();
    q.scroll!.hang = -3;
    expect(start(solved(q).S3!).y).toBeCloseTo(3, 9);
  });

  it('runs square from the duck tail to the neck\'s back, the nape filleting it in', () => {
    const [a, b] = scrollLines(p, s).square;
    meets(a, start(s.S3!));
    expect(b.y).toBeCloseTo(a.y, 9);
    meets(b, end(s.nape!));
    expect(s.nape!.x + s.nape!.r).toBeCloseTo(-p.neck!.upperThickness, 9);
  });

  it('fits the nape as one circle through the duck tail, tangent to the neck\'s back', () => {
    const q = seeded();
    q.scroll!.napeCircle = true;
    q.scroll!.napeR = 20;
    const t = solved(q);
    meets(end(t.nape!), start(t.S3!));
    expect(t.nape!.x + t.nape!.r).toBeCloseTo(-q.neck!.upperThickness, 9);
  });

  it('reports an S3 that never comes down to the hang, and stops the back there', () => {
    const q = seeded();
    q.scroll!.hang = 200;
    const t = solveScroll(q)!;
    expect(t.S3).toBeNull();
    expect(t.nape).toBeNull();
    expect(t.failures.map(f => f.unsolved)).toEqual([['S3', 'nape']]);
  });
});

describe('the front', () => {
  const p = seeded();
  const v = p.scroll!;
  const s = solved(p);

  it('runs up the flat from the nut\'s top, F0 turning back, the straight on, and F1 up into the spiral', () => {
    const [a, b] = scrollLines(p, s).flat;
    expect(a.y).toBe(p.neck!.nutHeight);
    expect(b.y - a.y).toBe(v.flat);
    meets(start(s.F0!), b);
    const [c, d] = scrollLines(p, s).frontStraight;
    meets(c, end(s.F0!));
    meets(end(s.F1!), d);
    // F1 stops on a drawn arc of the spiral
    const top = start(s.F1!);
    const on = s.spiral!.some(arc => Math.abs(dist(arc, top) - arc.r) < 1e-6 && angleWithinSweep(angleFromCenter(arc, top), arc.start, arc.end));
    expect(on).toBe(true);
  });

  it('reports an F1 that never meets the spiral, the back untouched', () => {
    const q = seeded();
    q.scroll!.F1R = 0.5;
    q.scroll!.F0Sweep = 10;
    const t = solveScroll(q)!;
    expect(t.F1).toBeNull();
    expect(t.nape).not.toBeNull();
    expect(t.failures.map(f => f.unsolved)).toEqual([['F1']]);
  });

  it('stops the front at a cleared flat', () => {
    const q = seeded();
    (q.scroll as any).flat = null;
    const t = solveScroll(q)!;
    expect(t.F0).toBeNull();
    expect(t.failures.map(f => f.unsolved)).toEqual([['F0', 'F1', 'flat', 'frontStraight']]);
  });
});
