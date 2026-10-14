// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { angleFromCenter, arcReach, pointOnCircle } from '../../../../helpers/math/simpleGeometry';
import { Arc } from '../../../../models/types';
import { solveVolute, spiralArcs, TO_FRONT, VolutePanel, voluteConstruction } from './volute-panel';
import { NeckPanel } from '../neck-panel/neck-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { ScrollSolve, ViolinFamilyParams, VoluteStyle } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const necked = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  OuterContourPanel.seed(p);
  FlutingPanel.seed(p);
  LongArchingPanel.seed(p);
  NeckPanel.seed(p);
  return p;
};

const seeded = (p = blank()): ViolinFamilyParams => {
  necked(p);
  VolutePanel.seed(p);
  return p;
};

const STYLES: VoluteStyle[] = ['salviati', 'fourPoint', 'archimedean', 'serlio', 'goldmann', 'kelly'];

const solved = (p: ViolinFamilyParams): ScrollSolve => {
  const s = solveVolute(p)!;
  expect(s.failures).toEqual([]);
  return s;
};

const end = (a: Arc) => pointOnCircle(a, a.end);
const start = (a: Arc) => pointOnCircle(a, a.start);

describe('the volute solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveVolute(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('seeds the whole scroll once the neck is there, once only, the eye flush and larger for a cello', () => {
    const q = blank();
    MainBoutsPanel.seed(q);
    VolutePanel.seed(q);
    expect(q.scroll).toBeUndefined();

    const p = seeded();
    const v = p.scroll!;
    expect(v.fitToNeck).toBe(true);
    expect(v.eye.x).toBe(solved(p).eye!.x);
    expect(v.arcRadii.length).toBe(TO_FRONT);
    v.S0R += 1;
    const edited = JSON.stringify(p);
    VolutePanel.seed(p);
    expect(JSON.stringify(p)).toBe(edited);

    const cello = blank();
    cello.body.height = 750;
    cello.body.width = 440;
    seeded(cello);
    expect(cello.scroll!.eye.r).toBeGreaterThan(v.eye.r);
    expect(cello.scroll!.widths.eye).toBeGreaterThan(v.widths.eye);
  });
});

describe.each(STYLES)('the %s volute', style => {
  const p = seeded();
  p.scroll!.style = style;
  const s = solved(p);
  const spiral = s.spiral!;

  it('meets each arc to the one inside it, tangent, on the line between their centres', () => {
    for (let i = 0; i + 1 < spiral.length; i++) {
      const outer = spiral[i], inner = spiral[i + 1];
      const joint = end(inner);
      expect(Math.hypot(start(outer).x - joint.x, start(outer).y - joint.y), `joint ${i}`).toBeLessThan(1e-6);
      const along = (a: Arc) => angleFromCenter(a, joint);
      expect(Math.abs(Math.sin(along(outer) - along(inner))), `tangent ${i}`).toBeLessThan(1e-6);
    }
  });

  it('winds outward, every arc at least as wide as the one inside it', () => {
    for (let i = 0; i + 1 < spiral.length; i++) expect(spiral[i].r).toBeGreaterThanOrEqual(spiral[i + 1].r - 1e-9);
  });

  it('ends at its front heading straight up, flush with the neck\'s front, nothing in front of it', () => {
    const front = end(spiral[0]);
    expect(Math.abs(Math.sin(spiral[0].end))).toBeLessThan(1e-9);
    expect(Math.abs(front.x)).toBeLessThan(0.01);
    const furthest = Math.max(...spiral.flatMap(a => arcReach(a, 0)).map(pt => pt.x));
    expect(furthest).toBeLessThan(front.x + 1e-9);
  });

  it('runs the crown on from the front, S0 then S1, each tangent to the last and turning through its own sweep', () => {
    const joint = end(spiral[0]);
    expect(Math.hypot(start(s.S0!).x - joint.x, start(s.S0!).y - joint.y)).toBeLessThan(1e-9);
    expect(Math.hypot(start(s.S1!).x - end(s.S0!).x, start(s.S1!).y - end(s.S0!).y)).toBeLessThan(1e-9);
    expect(s.S0!.end - s.S0!.start).toBeCloseTo(p.scroll!.S0Sweep * Math.PI / 180, 12);
    expect(s.S1!.end - s.S1!.start).toBeCloseTo(p.scroll!.S1Sweep * Math.PI / 180, 12);
  });

  it('marks the figure its centres are found on', () => {
    expect(voluteConstruction(p, s).length).toBeGreaterThan(0);
  });
});

describe('the volute\'s failures', () => {
  it('fails every part for an eye with no radius or no place, and a four point whose radii close in', () => {
    for (const edit of [
      (p: ViolinFamilyParams) => { p.scroll!.eye.r = 0; },
      (p: ViolinFamilyParams) => { p.scroll!.fitToNeck = false; (p.scroll!.eye as any).x = null; },
      (p: ViolinFamilyParams) => { p.scroll!.style = 'fourPoint'; p.scroll!.arcRadii[3] = 1; },
      (p: ViolinFamilyParams) => { p.scroll!.style = 'kelly'; p.scroll!.seedLength = 0; },
    ]) {
      const p = seeded();
      edit(p);
      const s = solveVolute(p)!;
      expect(s.spiral).toBeNull();
      expect(s.failures).toHaveLength(1);
      expect(s.failures[0].unsolved).toContain('spiral');
    }
  });

  it('leaves the eye where it was typed with the fit off', () => {
    const p = seeded();
    p.scroll!.fitToNeck = false;
    p.scroll!.eye.x = -40;
    expect(solved(p).eye!.x).toBe(-40);
  });

  it('stops the crown at S1 when it doesn\'t sweep on past S0', () => {
    const p = seeded();
    p.scroll!.S1Sweep = -5;
    const s = solveVolute(p)!;
    expect(s.S0).not.toBeNull();
    expect(s.S1).toBeNull();
    expect(s.failures.map(f => f.unsolved[0])).toEqual(['S1']);
  });

  it('draws the same spiral whatever the four point\'s radii, for every other style', () => {
    const p = seeded();
    const before = spiralArcs(p.scroll!);
    p.scroll!.arcRadii = p.scroll!.arcRadii.map(r => r * 2);
    expect(spiralArcs(p.scroll!)).toEqual(before);
  });
});
