// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TURN, vectorFromSlope } from '../../../../helpers/math/simpleGeometry';
import { Pt } from '../../../../models/types';
import { calcScoopedEdgeLine, calcScoopGuideGeometry, defaultPositionMarks, fingerboardScoopAt, PositionMarker, solvePositionMarks, solveScoop } from './dev-fingerboard-panel';
import { calcSemitoneStop, solveStringSetup, StringSetupPanel } from '../string-setup-panel/string-setup-panel';
import { NeckPanel, neckHalfWidthAt } from '../neck-panel/neck-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { PlateContourPanel } from '../plate-contour-panel/plate-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { StringSetupSolve } from '../../violin-family-solves';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

// the position marks, laid out as a maker would with a ruler: each interval its equal-tempered share
// of the string from the nut, dropped square onto the board, the dot across it at a share of its width

const seeded = (): ViolinFamilyParams => {
  const p: ViolinFamilyParams = JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  PlateContourPanel.seed(p);
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
// how far a point stands off the fingerboard plane, along its normal
const off = (p: ViolinFamilyParams, s: StringSetupSolve, pt: Pt) => {
  const normal = normalOf(p);
  return (pt.x - s.neck.root!.x) * normal.a + (pt.y - s.neck.root!.y) * normal.b;
};
// one marker per semitone, each the family's default dot unless edited
const settings = (p: ViolinFamilyParams, semitones: number[], edit: Partial<PositionMarker> = {}): PositionMarker[] =>
  semitones.map(semitone => ({ ...defaultPositionMarks(p)[0], semitone, ...edit }));
const unsolved = (p: ViolinFamilyParams, semitones: number[], edit: Partial<PositionMarker> = {}) =>
  solvePositionMarks(p, solveStringSetup(p)!, settings(p, semitones, edit)).failures.some(f => f.unsolved.includes('marks'));

describe('the position marks', () => {
  it('are kept off the file: neither the params nor the string setup solve carry them', () => {
    const p = seeded();
    expect(p.stringSetup).not.toHaveProperty('marks');
    expect(solveStringSetup(p)).not.toHaveProperty('marks');
  });

  it('stop the octave at half the string, the fifth near a third, each semitone further than the last', () => {
    expect(calcSemitoneStop(12, 300)).toBeCloseTo(150, 9);
    expect(calcSemitoneStop(24, 300)).toBeCloseTo(225, 9);
    expect(calcSemitoneStop(7, 300)).toBeCloseTo(100, 0);
    for (let n = 1; n <= 24; n++) expect(calcSemitoneStop(n, 300)).toBeGreaterThan(calcSemitoneStop(n - 1, 300));
  });

  it('stop the string a share of its length from the nut, and drop the station square onto the board', () => {
    const p = seeded();
    const s = solved(p);
    const { marks, failures } = solvePositionMarks(p, s, settings(p, [12, 5, 7]));
    expect(failures).toEqual([]);
    const stringLength = dist(s.nutTop!, s.bridgeTop!);
    expect(marks.map(m => m.semitone)).toEqual([5, 7, 12]);
    for (const m of marks) {
      expect(m.alongString).toBeCloseTo(calcSemitoneStop(m.semitone, stringLength), 9);
      expect(off(p, s, m.station)).toBeCloseTo(0, 9);
      const onString = new Pt(
        s.nutTop!.x + (s.bridgeTop!.x - s.nutTop!.x) * m.alongString / stringLength,
        s.nutTop!.y + (s.bridgeTop!.y - s.nutTop!.y) * m.alongString / stringLength);
      // the drop runs along the plane's normal
      const normal = normalOf(p);
      const drop = { x: onString.x - m.station.x, y: onString.y - m.station.y };
      expect(drop.x * normal.b - drop.y * normal.a).toBeCloseTo(0, 9);
    }
    expect(marks.find(m => m.semitone === 12)!.alongString).toBeCloseTo(stringLength / 2, 9);
    // down the board in order, each nearer the end than the last
    for (let i = 1; i < marks.length; i++) expect(dist(s.neck.neckTop!, marks[i].station)).toBeGreaterThan(dist(s.neck.neckTop!, marks[i - 1].station));
  });

  it('carry the offset down the board as a share of its width, mirrored by its sign, on the axis at 0', () => {
    const p = seeded();
    const s = solved(p);
    const dotFor = (offset: number) => solvePositionMarks(p, s, settings(p, [7], { offset })).marks[0].dots[0];
    const station = solvePositionMarks(p, s, settings(p, [7])).marks[0].station;
    const halfAtNut = neckHalfWidthAt(p, s.neck, s.neck.neckTop!.y);
    const halfHere = neckHalfWidthAt(p, s.neck, station.y);
    const treble = dotFor(6);
    expect(treble.x).toBeCloseTo(6 * halfHere / halfAtNut, 9);
    expect(treble.x).toBeGreaterThan(6);
    expect(halfHere - treble.x).toBeGreaterThan(halfAtNut - 6);
    expect(treble.y).toBeCloseTo(station.y, 9);
    expect(treble.r).toBeCloseTo(defaultPositionMarks(p)[0].diameter / 2, 9);
    expect(dotFor(-6).x).toBeCloseTo(-treble.x, 9);
    expect(dotFor(0).x).toBe(0);
  });

  it('gather every marker at one interval onto its station, each keeping its own size and offset', () => {
    const p = seeded();
    const s = solved(p);
    const markers: PositionMarker[] = [
      { semitone: 12, offset: 5, diameter: 2, shape: 'circle' },
      { semitone: 7, offset: 0, diameter: 3, shape: 'circle' },
      { semitone: 12, offset: -5, diameter: 2.5, shape: 'circle' },
    ];
    const { marks, failures } = solvePositionMarks(p, s, markers);
    expect(failures).toEqual([]);
    expect(marks.map(m => m.semitone)).toEqual([7, 12]);
    const octave = marks[1];
    expect(octave.markers).toEqual([0, 2]);
    expect(octave.dots.map(d => d.y)).toEqual([octave.station.y, octave.station.y]);
    expect(octave.dots[0].x).toBeGreaterThan(0);
    expect(octave.dots[1].x).toBeLessThan(0);
    expect(octave.dots.map(d => d.r)).toEqual([1, 1.25]);
    // the dots match a lone marker at the same settings: the others don't move it
    const alone = solvePositionMarks(p, s, [markers[2]]).marks[0].dots[0];
    expect(octave.dots[1].x).toBeCloseTo(alone.x, 9);
    expect(solvePositionMarks(p, s, []).marks).toEqual([]);
  });

  it('leave a mark past the board\'s end out and say so, drawing the rest', () => {
    const p = seeded();
    const m = solvePositionMarks(p, solved(p), settings(p, [7, 60]));
    expect(m.marks.map(mark => mark.semitone)).toEqual([7]);
    expect(m.failures.some(f => f.message.includes('60') && !f.unsolved.length)).toBe(true);
  });

  it('let a dot hang over the edge as a half circle, but refuse one that misses the board or a fractional interval', () => {
    const p = seeded();
    const s = solved(p);
    const halfAtNut = neckHalfWidthAt(p, s.neck, s.neck.neckTop!.y);
    expect(unsolved(p, [7.5])).toBe(true);
    expect(unsolved(p, [7], { diameter: 0 })).toBe(true);
    // centred on the edge, and most of the way off it
    for (const offset of [halfAtNut, -halfAtNut, halfAtNut + 0.9, -(halfAtNut + 0.9)]) {
      expect(unsolved(p, [7], { diameter: 2, offset })).toBe(false);
    }
    for (const offset of [halfAtNut + 1, -(halfAtNut + 1), halfAtNut + 5]) {
      expect(unsolved(p, [7], { diameter: 2, offset })).toBe(true);
    }
    expect(unsolved(p, [7], { diameter: 2, offset: 0 })).toBe(false);
  });

  it('wait for the board, and say so', () => {
    const p = seeded();
    p.stringSetup!.fingerboardLength = null as any;
    expect(unsolved(p, [7])).toBe(true);
  });
});

describe('the scoop', () => {
  const at = (s: StringSetupSolve, d: number) => {
    const top = s.neck.neckTop!, end = s.fingerboardEnd!;
    return new Pt(top.x + (end.x - top.x) * d / dist(top, end), top.y + (end.y - top.y) * d / dist(top, end));
  };

  it('scoops each edge to its own depth at the one station, nothing at the ends, and runs the depth across linearly', () => {
    const p = seeded();
    const ss = p.stringSetup!;
    ss.scoopAt = 100;
    ss.scoopBass = 1;
    ss.scoopTreble = 0.5;
    const s = solved(p);
    expect(solveScoop(p, s).failures).toEqual([]);
    for (const side of [-1, 0, 1] as const) {
      expect(fingerboardScoopAt(p, s, s.neck.neckTop!.y, side)).toBeCloseTo(0, 9);
      expect(fingerboardScoopAt(p, s, s.fingerboardEnd!.y, side)).toBeCloseTo(0, 9);
    }
    expect(fingerboardScoopAt(p, s, at(s, 100).y, -1)).toBeCloseTo(1, 9);
    expect(fingerboardScoopAt(p, s, at(s, 100).y, 1)).toBeCloseTo(0.5, 9);
    expect(fingerboardScoopAt(p, s, at(s, 100).y, 0)).toBeCloseTo(0.75, 9);
    // deepening toward the station from either end, never past the typed depth
    let last = 0;
    for (let d = 0; d <= 100; d += 5) {
      const scoop = fingerboardScoopAt(p, s, at(s, d).y, -1);
      expect(scoop).toBeGreaterThanOrEqual(last);
      expect(scoop).toBeLessThanOrEqual(1 + 1e-9);
      last = scoop;
    }
    for (let d = 100; d <= ss.fingerboardLength; d += 5) {
      const scoop = fingerboardScoopAt(p, s, at(s, d).y, -1);
      expect(scoop).toBeLessThanOrEqual(last + 1e-9);
      last = scoop;
    }
    // the two arcs meet level at the station
    const step = 0.5;
    expect(Math.abs(fingerboardScoopAt(p, s, at(s, 100 + step).y, -1) - fingerboardScoopAt(p, s, at(s, 100 - step).y, -1)) / step).toBeLessThan(1e-3);
  });

  it('planes the scoop into the edges, and leaves them straight with none', () => {
    const scooped = seeded();
    const flat = seeded();
    flat.stringSetup!.scoopBass = flat.stringSetup!.scoopTreble = 0;
    const sScooped = solved(scooped), sFlat = solved(flat);
    const t = scooped.stringSetup!.fingerboardThickness;
    for (const pt of calcScoopedEdgeLine(flat, sFlat, -1)) expect(off(flat, sFlat, pt)).toBeCloseTo(t, 9);
    const edge = calcScoopedEdgeLine(scooped, sScooped, -1);
    expect(off(scooped, sScooped, edge[0])).toBeCloseTo(t, 9);
    expect(off(scooped, sScooped, edge.at(-1)!)).toBeCloseTo(t, 9);
    for (const pt of edge.slice(1, -1)) expect(off(scooped, sScooped, pt)).toBeLessThan(t);
  });

  it('lays the guide at scale: the edges their depths beneath the straight top at the station', () => {
    const p = seeded();
    const ss = p.stringSetup!;
    const s = solved(p);
    const guide = calcScoopGuideGeometry(p, s, solveScoop(p, s))!;
    const top = s.neck.neckTop!, end = s.fingerboardEnd!;
    const t = ss.fingerboardThickness;
    const along = (pt: Pt) => ((pt.x - top.x) * (end.x - top.x) + (pt.y - top.y) * (end.y - top.y)) / dist(top, end);
    const [deepestBass, onStraightedge] = guide.station;
    expect(off(p, s, onStraightedge)).toBeCloseTo(t, 9);
    expect(along(deepestBass)).toBeCloseTo(ss.scoopAt, 9);
    expect(along(onStraightedge)).toBeCloseTo(ss.scoopAt, 9);
    expect(off(p, s, onStraightedge) - off(p, s, deepestBass)).toBeCloseTo(ss.scoopBass, 9);
    expect(off(p, s, onStraightedge) - off(p, s, guide.deepestTreble)).toBeCloseTo(ss.scoopTreble, 9);
    // the edges never rise above the top nor fall past their depth
    for (const [edge, depth] of [[guide.bass, ss.scoopBass], [guide.treble, ss.scoopTreble]] as const) {
      for (const pt of edge) {
        expect(off(p, s, pt)).toBeLessThanOrEqual(t + 1e-9);
        expect(off(p, s, pt)).toBeGreaterThanOrEqual(t - depth - 1e-9);
      }
    }
  });

  it('reports a scoop off the board, below zero or cleared, and withholds the guide, leaving the string setup solved', () => {
    const edits = [
      (p: ViolinFamilyParams) => { p.stringSetup!.scoopAt = p.stringSetup!.fingerboardLength; },
      (p: ViolinFamilyParams) => { p.stringSetup!.scoopAt = 0; },
      (p: ViolinFamilyParams) => { p.stringSetup!.scoopTreble = -0.5; },
      (p: ViolinFamilyParams) => { p.stringSetup!.scoopBass = null as any; },
    ];
    for (const edit of edits) {
      const p = seeded();
      edit(p);
      const s = solved(p);
      const k = solveScoop(p, s);
      expect(k.failures.some(f => f.unsolved.includes('scoop'))).toBe(true);
      expect(calcScoopGuideGeometry(p, s, k)).toBeNull();
    }
  });
});
