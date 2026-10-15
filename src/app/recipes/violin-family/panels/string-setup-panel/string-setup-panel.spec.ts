// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyMatrix } from '../../../../helpers/math/pathMath';
import { TURN, vectorFromSlope } from '../../../../helpers/math/simpleGeometry';
import { Pt } from '../../../../models/types';
import { fingerboardCrown, fingerboardCrownLine, solveStringSetup, StringSetupPanel } from './string-setup-panel';
import { NeckPanel, neckHalfWidthAt, scrollOnNeck } from '../neck-panel/neck-panel';
import { nutThickness, VolutePanel } from '../volute-panel/volute-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { StringSetupKey, StringSetupSolve, ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, familyStandards } from '../../violin-family-seed';

// what a maker would check with a ruler on the set-up instrument: the bridge stands its height off
// the arch the stop down from the neck end, the nut its thickness off the neck, the board its length
// down the neck and its crown rising with its width

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  OuterContourPanel.seed(p);
  FlutingPanel.seed(p);
  LongArchingPanel.seed(p);
  NeckPanel.seed(p);
  StringSetupPanel.seed(p);
  return p;
};

const solved = (p: ViolinFamilyParams): StringSetupSolve => {
  const s = solveStringSetup(p)!;
  expect(s.failures).toEqual([]);
  return s;
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const normalOf = (p: ViolinFamilyParams) => vectorFromSlope(p.neck!.angle * TURN.degree);
const unsolved = (s: StringSetupSolve, key: StringSetupKey) => s.failures.some(f => f.unsolved.includes(key));
// how far a point stands off the fingerboard plane, along its normal
const off = (p: ViolinFamilyParams, s: StringSetupSolve, pt: Pt) => {
  const normal = normalOf(p);
  return (pt.x - s.neck.root!.x) * normal.a + (pt.y - s.neck.root!.y) * normal.b;
};

describe('the string setup solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveStringSetup(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('seeds once the neck is there, once only, with a longer board for a cello', () => {
    const q = blank();
    MainBoutsPanel.seed(q);
    StringSetupPanel.seed(q);
    expect(q.stringSetup).toBeUndefined();

    const p = seeded();
    const first = JSON.stringify(p.stringSetup);
    p.stringSetup!.bodyStop += 7;
    StringSetupPanel.seed(p);
    expect(p.stringSetup!.bodyStop).toBe(JSON.parse(first).bodyStop + 7);

    const cello = blank();
    cello.body.height = 2.1 * cello.body.height;
    cello.body.width = 2.1 * cello.body.width;
    seeded(cello);
    expect(cello.stringSetup!.fingerboardLength).toBeGreaterThan(p.stringSetup!.fingerboardLength);
    expect(cello.stringSetup!.bridgeHeight).toBeGreaterThan(p.stringSetup!.bridgeHeight);
  });

  it('stands the bridge its height off the arch, the stop down from the neck end', () => {
    const p = seeded();
    const s = solved(p);
    const [neckFoot, tailFoot, tailTop, neckTop] = s.bridge!;
    expect(dist(s.bridgeFoot!, s.bridgeTop!)).toBeCloseTo(p.stringSetup!.bridgeHeight, 9);
    // plumb, the string over the middle of the top and the top over the middle of the feet
    expect(s.bridgeTop!.y).toBeCloseTo(s.bridgeFoot!.y, 9);
    expect(dist(s.bridgeTop!, tailTop)).toBeCloseTo(dist(s.bridgeTop!, neckTop), 9);
    expect(dist(s.bridgeFoot!, neckFoot)).toBeCloseTo(dist(s.bridgeFoot!, tailFoot), 1);
    const blank = familyStandards(p.body.height).bridge;
    expect(dist(neckTop, tailTop)).toBeCloseTo(blank.topThickness, 9);
    expect(Math.abs(neckFoot.y - tailFoot.y)).toBeCloseTo(blank.footThickness, 1);
    // the rib taper tilts the plate by a fraction of a degree, which moves the foot a hair along the body
    expect(Math.abs(s.bridgeFoot!.y - (p.body.height - p.stringSetup!.bodyStop))).toBeLessThan(0.5);
  });

  it('stands the nut its thickness square off the neck, and runs the board its length down the neck', () => {
    const p = seeded();
    const s = solved(p);
    const ss = p.stringSetup!;
    expect(dist(s.neck.neckTop!, s.nutTop!)).toBeCloseTo(ss.nutThickness, 9);
    expect(off(p, s, s.nutTop!)).toBeCloseTo(ss.nutThickness, 9);
    expect(dist(s.neck.neckTop!, s.fingerboardEnd!)).toBeCloseTo(ss.fingerboardLength, 9);
    expect(off(p, s, s.fingerboardEnd!)).toBeCloseTo(0, 9);
  });

  it('raises the crown with the board\'s width, from its edges at either end', () => {
    const p = seeded();
    const s = solved(p);
    const crown = fingerboardCrownLine(p, s)!;
    const t = p.stringSetup!.fingerboardThickness;
    expect(off(p, s, crown[0])).toBeCloseTo(t, 9);
    expect(off(p, s, crown.at(-1)!)).toBeCloseTo(t, 9);
    const rises = crown.slice(1, -1).map(pt => off(p, s, pt) - t);
    for (let i = 1; i < rises.length; i++) expect(rises[i]).toBeGreaterThan(rises[i - 1]);
    // a cylinder's sagitta over the half width
    const r = p.stringSetup!.fingerboardRadius;
    const half = neckHalfWidthAt(p, s.neck, s.neck.neckTop!.y);
    expect(fingerboardCrown(p, s, s.neck.neckTop!.y)).toBeCloseTo(r - Math.sqrt(r * r - half * half), 9);
  });

  it('runs the seeded string clear of the board and its crown', () => {
    const p = seeded();
    const s = solved(p);
    const nut = off(p, s, s.nutTop!);
    const bridge = off(p, s, s.bridgeTop!);
    const along = (pt: Pt) => dist(s.neck.neckTop!, pt) / dist(s.neck.neckTop!, s.bridgeTop!);
    for (const pt of fingerboardCrownLine(p, s)!) expect(nut + (bridge - nut) * along(pt)).toBeGreaterThan(off(p, s, pt));
  });

  it('reports a cleared field rather than drawing it', () => {
    for (const key of ['bodyStop', 'bridgeHeight', 'nutThickness', 'fingerboardLength', 'fingerboardThickness', 'fingerboardRadius'] as const) {
      const p = seeded();
      (p.stringSetup as any)[key] = null;
      const s = solveStringSetup(p)!;
      expect(s.failures.length, key).toBeGreaterThan(0);
    }
  });

  it('reports a stop off the body and a flat bridge, and leaves the rest standing', () => {
    for (const edit of [(p: ViolinFamilyParams) => { p.stringSetup!.bodyStop = p.body.height + 5; }, (p: ViolinFamilyParams) => { p.stringSetup!.bridgeHeight = 0; }]) {
      const p = seeded();
      edit(p);
      const s = solveStringSetup(p)!;
      expect(unsolved(s, 'bridge')).toBe(true);
      expect(s.bridgeFoot).toBeNull();
      expect(s.nutTop).not.toBeNull();
      expect(s.fingerboardEnd).not.toBeNull();
    }
  });

  it('reports a radius tighter than the board\'s half width, keeping the board but not its crown', () => {
    const p = seeded();
    p.stringSetup!.fingerboardRadius = p.neck!.topWidth / 2;
    const s = solveStringSetup(p)!;
    expect(unsolved(s, 'fingerboard')).toBe(true);
    expect(s.fingerboardEnd).not.toBeNull();
    expect(fingerboardCrownLine(p, s)).toBeNull();
  });

  it('reports a nut sunk below the crown, and still stands it', () => {
    const p = seeded();
    p.stringSetup!.nutThickness = p.stringSetup!.fingerboardThickness;
    const s = solveStringSetup(p)!;
    expect(s.failures.map(f => f.message.split(':')[0])).toEqual(['Nut']);
    expect(s.nutTop).not.toBeNull();
  });

  it('stands nothing on a neck that doesn\'t solve', () => {
    const p = seeded();
    p.neck!.length = null as any;
    const s = solveStringSetup(p)!;
    for (const key of ['bridge', 'nut', 'fingerboard'] as const) expect(unsolved(s, key), key).toBe(true);
    expect([s.bridgeFoot, s.nutTop, s.fingerboardEnd]).toEqual([null, null, null]);
  });
});

describe('the scroll set on the neck', () => {
  it('stands the nut at the scroll\'s origin, up the neck its +y and the fingerboard\'s normal its +x', () => {
    const p = seeded();
    const n = solved(p).neck;
    const m = scrollOnNeck(p, n);
    const angle = p.neck!.angle * TURN.degree;
    expect(dist(applyMatrix(m, new Pt(0, 0)), n.neckTop!)).toBeLessThan(1e-9);
    const up = applyMatrix(m, new Pt(0, 1));
    expect(Math.atan2(up.y - n.neckTop!.y, up.x - n.neckTop!.x)).toBeCloseTo(angle + TURN.quarter, 9);
    const back = applyMatrix(m, new Pt(-p.neck!.upperThickness, 0));
    expect(dist(back, n.backNut!)).toBeLessThan(1e-9);
  });

  it('draws the scroll\'s nut at the string setup\'s thickness, and its own while that\'s cleared', () => {
    const p = seeded();
    VolutePanel.seed(p);
    const seededThickness = nutThickness(p);
    p.stringSetup!.nutThickness = seededThickness + 2;
    expect(nutThickness(p)).toBe(seededThickness + 2);
    p.stringSetup!.nutThickness = null as any;
    expect(nutThickness(p)).toBe(seededThickness);
  });
});
