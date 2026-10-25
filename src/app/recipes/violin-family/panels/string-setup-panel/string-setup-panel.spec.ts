// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyMatrix } from '../../../../helpers/math/pathMath';
import { TURN, vectorFromSlope } from '../../../../helpers/math/simpleGeometry';
import { Pt } from '../../../../models/types';
import {
  fingerboardCrown, fingerboardCrownLine, fingerboardEdgeLine, fingerboardRadiusAt, fingerboardScoopAt, scoopGuideGeometry, solveStringSetup, StringSetupPanel,
} from './string-setup-panel';
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
    // the sagitta over the half width, of the radius at that end
    const topY = s.neck.neckTop!.y, endY = s.fingerboardEnd!.y;
    for (const [r, y] of [[p.stringSetup!.fingerboardNutRadius, topY], [p.stringSetup!.fingerboardEndRadius, endY]]) {
      const half = neckHalfWidthAt(p, s.neck, y);
      expect(fingerboardCrown(p, s, y)).toBeCloseTo(r - Math.sqrt(r * r - half * half), 9);
    }
  });

  it('runs the crown\'s radius from the nut\'s to the end\'s linearly along the board, and holds it past either end', () => {
    const p = seeded();
    p.stringSetup!.fingerboardNutRadius = 40;
    p.stringSetup!.fingerboardEndRadius = 50;
    const s = solved(p);
    const topY = s.neck.neckTop!.y, endY = s.fingerboardEnd!.y;
    expect(fingerboardRadiusAt(p, s, topY)).toBeCloseTo(40, 9);
    expect(fingerboardRadiusAt(p, s, endY)).toBeCloseTo(50, 9);
    expect(fingerboardRadiusAt(p, s, (topY + endY) / 2)).toBeCloseTo(45, 9);
    expect(fingerboardRadiusAt(p, s, topY + (topY - endY))).toBeCloseTo(40, 9);
    expect(fingerboardRadiusAt(p, s, endY - (topY - endY))).toBeCloseTo(50, 9);
    // a tighter nut radius crowns the nut end higher
    const wider: ViolinFamilyParams = JSON.parse(JSON.stringify(p));
    wider.stringSetup!.fingerboardNutRadius = 50;
    expect(fingerboardCrown(wider, solved(wider), topY)).toBeLessThan(fingerboardCrown(p, s, topY));
  });

  it('scoops each edge to its own depth at the one station, nothing at the ends, and runs the depth across linearly', () => {
    const p = seeded();
    const ss = p.stringSetup!;
    ss.scoopAt = 100;
    ss.scoopBass = 1;
    ss.scoopTreble = 0.5;
    const s = solved(p);
    const top = s.neck.neckTop!, end = s.fingerboardEnd!;
    const at = (d: number) => dist(top, end) ? new Pt(top.x + (end.x - top.x) * d / dist(top, end), top.y + (end.y - top.y) * d / dist(top, end)) : top;
    for (const side of [-1, 0, 1] as const) {
      expect(fingerboardScoopAt(p, s, top.y, side)).toBeCloseTo(0, 9);
      expect(fingerboardScoopAt(p, s, end.y, side)).toBeCloseTo(0, 9);
    }
    expect(fingerboardScoopAt(p, s, at(100).y, -1)).toBeCloseTo(1, 9);
    expect(fingerboardScoopAt(p, s, at(100).y, 1)).toBeCloseTo(0.5, 9);
    expect(fingerboardScoopAt(p, s, at(100).y, 0)).toBeCloseTo(0.75, 9);
    // deepening toward the station from either end, never past the typed depth
    let last = 0;
    for (let d = 0; d <= 100; d += 5) {
      const scoop = fingerboardScoopAt(p, s, at(d).y, -1);
      expect(scoop).toBeGreaterThanOrEqual(last);
      expect(scoop).toBeLessThanOrEqual(1 + 1e-9);
      last = scoop;
    }
    for (let d = 100; d <= ss.fingerboardLength; d += 5) {
      const scoop = fingerboardScoopAt(p, s, at(d).y, -1);
      expect(scoop).toBeLessThanOrEqual(last + 1e-9);
      last = scoop;
    }
    // the two arcs meet level at the station
    const step = 0.5;
    expect(Math.abs(fingerboardScoopAt(p, s, at(100 + step).y, -1) - fingerboardScoopAt(p, s, at(100 - step).y, -1)) / step).toBeLessThan(1e-3);
  });

  it('planes the scoop into the edges and the crown line, and leaves them straight with none', () => {
    const scooped = seeded();
    const flat = seeded();
    flat.stringSetup!.scoopBass = flat.stringSetup!.scoopTreble = 0;
    const sScooped = solved(scooped), sFlat = solved(flat);
    const t = scooped.stringSetup!.fingerboardThickness;
    for (const pt of fingerboardEdgeLine(flat, sFlat, -1)) expect(off(flat, sFlat, pt)).toBeCloseTo(t, 9);
    const edge = fingerboardEdgeLine(scooped, sScooped, -1);
    expect(off(scooped, sScooped, edge[0])).toBeCloseTo(t, 9);
    expect(off(scooped, sScooped, edge.at(-1)!)).toBeCloseTo(t, 9);
    for (const pt of edge.slice(1, -1)) expect(off(scooped, sScooped, pt)).toBeLessThan(t);
    const crownScooped = fingerboardCrownLine(scooped, sScooped)!, crownFlat = fingerboardCrownLine(flat, sFlat)!;
    const deepest = Math.max(scooped.stringSetup!.scoopBass, scooped.stringSetup!.scoopTreble);
    // the line's first two and last two points stand at the ends, where the scoop is nothing
    for (let i = 2; i < crownScooped.length - 2; i++) {
      const drop = off(flat, sFlat, crownFlat[i]) - off(scooped, sScooped, crownScooped[i]);
      expect(drop).toBeGreaterThan(0);
      expect(drop).toBeLessThanOrEqual(deepest + 1e-9);
    }
  });

  it('lays the scoop guide at scale: a straightedge along the top, the edges their depths beneath it at the station', () => {
    const p = seeded();
    const ss = p.stringSetup!;
    const s = solved(p);
    const guide = scoopGuideGeometry(p, s)!;
    const top = s.neck.neckTop!, end = s.fingerboardEnd!;
    const t = ss.fingerboardThickness;
    const along = (pt: Pt) => ((pt.x - top.x) * (end.x - top.x) + (pt.y - top.y) * (end.y - top.y)) / dist(top, end);
    for (const pt of guide.straightedge) expect(off(p, s, pt)).toBeCloseTo(t, 9);
    expect(along(guide.straightedge[0])).toBeCloseTo(0, 9);
    expect(along(guide.straightedge[1])).toBeCloseTo(ss.fingerboardLength, 9);
    const [deepestBass, onStraightedge] = guide.station;
    expect(along(deepestBass)).toBeCloseTo(ss.scoopAt, 9);
    expect(along(onStraightedge)).toBeCloseTo(ss.scoopAt, 9);
    expect(off(p, s, onStraightedge) - off(p, s, deepestBass)).toBeCloseTo(ss.scoopBass, 9);
    expect(off(p, s, onStraightedge) - off(p, s, guide.deepestTreble)).toBeCloseTo(ss.scoopTreble, 9);
    // the edges never rise above the straightedge nor fall past their depth
    for (const [edge, depth] of [[guide.bass, ss.scoopBass], [guide.treble, ss.scoopTreble]] as const) {
      for (const pt of edge) {
        expect(off(p, s, pt)).toBeLessThanOrEqual(t + 1e-9);
        expect(off(p, s, pt)).toBeGreaterThanOrEqual(t - depth - 1e-9);
      }
    }
  });

  it('reports a scoop off the board or below zero, flattens the board and withholds the guide, keeping the crown', () => {
    const edits = [
      (p: ViolinFamilyParams) => { p.stringSetup!.scoopAt = p.stringSetup!.fingerboardLength; },
      (p: ViolinFamilyParams) => { p.stringSetup!.scoopAt = 0; },
      (p: ViolinFamilyParams) => { p.stringSetup!.scoopTreble = -0.5; },
    ];
    for (const edit of edits) {
      const p = seeded();
      edit(p);
      const s = solveStringSetup(p)!;
      expect(unsolved(s, 'scoop')).toBe(true);
      expect(unsolved(s, 'fingerboard')).toBe(false);
      expect(scoopGuideGeometry(p, s)).toBeNull();
      const mid = fingerboardCrownLine(p, s)!;
      expect(mid).not.toBeNull();
      for (const pt of fingerboardEdgeLine(p, s, -1)) expect(off(p, s, pt)).toBeCloseTo(p.stringSetup!.fingerboardThickness, 9);
    }
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
    for (const key of ['bodyStop', 'bridgeHeight', 'nutThickness', 'fingerboardLength', 'fingerboardThickness', 'fingerboardNutRadius', 'fingerboardEndRadius', 'scoopAt', 'scoopBass', 'scoopTreble'] as const) {
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

  it('reports a radius tighter than the board\'s half width at its own end, keeping the board but not its crown', () => {
    const nut = (p: ViolinFamilyParams) => { p.stringSetup!.fingerboardNutRadius = p.neck!.topWidth / 2; };
    const end = (p: ViolinFamilyParams) => { p.stringSetup!.fingerboardEndRadius = neckHalfWidthAt(p, solved(p).neck, solved(p).fingerboardEnd!.y); };
    for (const edit of [nut, end]) {
      const p = seeded();
      edit(p);
      const s = solveStringSetup(p)!;
      expect(unsolved(s, 'fingerboard')).toBe(true);
      expect(s.fingerboardEnd).not.toBeNull();
      expect(fingerboardCrownLine(p, s)).toBeNull();
    }
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
