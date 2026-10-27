// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TURN, vectorFromSlope } from '../../../../helpers/math/simpleGeometry';
import { Pt } from '../../../../models/types';
import { defaultPositionMarks, parseSemitones, PositionMarksSettings, semitoneStop, solvePositionMarks } from './dev-fingerboard-panel';
import { solveStringSetup, StringSetupPanel } from '../string-setup-panel/string-setup-panel';
import { NeckPanel, neckHalfWidthAt } from '../neck-panel/neck-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { StringSetupSolve, ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

// the position marks, laid out as a maker would with a ruler: each interval its equal-tempered share
// of the string from the nut, dropped square onto the board, the dot across it at a share of its width

const seeded = (): ViolinFamilyParams => {
  const p: ViolinFamilyParams = JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));
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
// how far a point stands off the fingerboard plane, along its normal
const off = (p: ViolinFamilyParams, s: StringSetupSolve, pt: Pt) => {
  const normal = normalOf(p);
  return (pt.x - s.neck.root!.x) * normal.a + (pt.y - s.neck.root!.y) * normal.b;
};
const settings = (p: ViolinFamilyParams, edit: Partial<PositionMarksSettings>): PositionMarksSettings => ({ ...defaultPositionMarks(p), ...edit });
const unsolved = (p: ViolinFamilyParams, edit: Partial<PositionMarksSettings>) =>
  solvePositionMarks(p, solveStringSetup(p)!, settings(p, edit)).failures.some(f => f.unsolved.includes('marks'));

describe('the position marks', () => {
  it('are kept off the file: neither the params nor the string setup solve carry them', () => {
    const p = seeded();
    expect(p.stringSetup).not.toHaveProperty('marks');
    expect(solveStringSetup(p)).not.toHaveProperty('marks');
  });

  it('stop the octave at half the string, the fifth near a third, each semitone further than the last', () => {
    expect(semitoneStop(12, 300)).toBeCloseTo(150, 9);
    expect(semitoneStop(24, 300)).toBeCloseTo(225, 9);
    expect(semitoneStop(7, 300)).toBeCloseTo(100, 0);
    for (let n = 1; n <= 24; n++) expect(semitoneStop(n, 300)).toBeGreaterThan(semitoneStop(n - 1, 300));
  });

  it('stop the string a share of its length from the nut, and drop the station square onto the board', () => {
    const p = seeded();
    const s = solved(p);
    const { marks, failures } = solvePositionMarks(p, s, settings(p, { semitones: [5, 7, 12] }));
    expect(failures).toEqual([]);
    const stringLength = dist(s.nutTop!, s.bridgeTop!);
    expect(marks.map(m => m.semitone)).toEqual([5, 7, 12]);
    for (const m of marks) {
      expect(m.alongString).toBeCloseTo(semitoneStop(m.semitone, stringLength), 9);
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
    const dotFor = (offset: number) => solvePositionMarks(p, s, settings(p, { semitones: [7], offset })).marks[0].dots[0];
    const station = solvePositionMarks(p, s, settings(p, { semitones: [7] })).marks[0].station;
    const halfAtNut = neckHalfWidthAt(p, s.neck, s.neck.neckTop!.y);
    const halfHere = neckHalfWidthAt(p, s.neck, station.y);
    const treble = dotFor(6);
    expect(treble.x).toBeCloseTo(6 * halfHere / halfAtNut, 9);
    expect(treble.x).toBeGreaterThan(6);
    expect(halfHere - treble.x).toBeGreaterThan(halfAtNut - 6);
    expect(treble.y).toBeCloseTo(station.y, 9);
    expect(treble.r).toBeCloseTo(defaultPositionMarks(p).diameter / 2, 9);
    expect(dotFor(-6).x).toBeCloseTo(-treble.x, 9);
    expect(dotFor(0).x).toBe(0);
  });

  it('leave a mark past the board\'s end out and say so, drawing the rest', () => {
    const p = seeded();
    const m = solvePositionMarks(p, solved(p), settings(p, { semitones: [7, 60] }));
    expect(m.marks.map(mark => mark.semitone)).toEqual([7]);
    expect(m.failures.some(f => f.message.includes('60') && !f.unsolved.length)).toBe(true);
  });

  it('let a dot hang over the edge as a half circle, but refuse one that misses the board or a fractional interval', () => {
    const p = seeded();
    const s = solved(p);
    const halfAtNut = neckHalfWidthAt(p, s.neck, s.neck.neckTop!.y);
    expect(unsolved(p, { semitones: [7.5] })).toBe(true);
    // centred on the edge, and most of the way off it
    for (const offset of [halfAtNut, -halfAtNut, halfAtNut + 0.9, -(halfAtNut + 0.9)]) {
      expect(unsolved(p, { semitones: [7], diameter: 2, offset })).toBe(false);
    }
    for (const offset of [halfAtNut + 1, -(halfAtNut + 1), halfAtNut + 5]) {
      expect(unsolved(p, { semitones: [7], diameter: 2, offset })).toBe(true);
    }
    expect(unsolved(p, { semitones: [7], diameter: 2, offset: 0 })).toBe(false);
  });

  it('wait for the board, and say so', () => {
    const p = seeded();
    p.stringSetup!.fingerboardLength = null as any;
    expect(unsolved(p, {})).toBe(true);
  });

  it('read the typed list however it is separated, keeping what cannot be read for the solve to refuse', () => {
    expect(parseSemitones('5, 7, 12')).toEqual([5, 7, 12]);
    expect(parseSemitones(' 5 7;12 ')).toEqual([5, 7, 12]);
    expect(parseSemitones('')).toEqual([]);
    expect(parseSemitones('5, x')).toEqual([5, NaN]);
  });
});
