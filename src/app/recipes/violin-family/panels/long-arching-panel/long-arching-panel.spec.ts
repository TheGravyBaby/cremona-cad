// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist } from '../../../../helpers/math/simpleGeometry';
import { Pt } from '../../../../models/types';
import {
  archZAt, LongArchingPanel, longArchCurve, maxRibTaper, placeOnTopPlate, ribHeightAt, solveLongArch, solveLongArching, solveRibTaper,
  topPlatePlacement,
} from './long-arching-panel';
import { FlutingPanel, gougeProfileSlope, gougeProfileZ } from '../fluting-panel/fluting-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const fluted = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  OuterContourPanel.seed(p);
  FlutingPanel.seed(p);
  return p;
};

const seeded = (p = blank()): ViolinFamilyParams => {
  fluted(p);
  LongArchingPanel.seed(p);
  return p;
};

describe('the long arching solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveLongArching(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('has no arching until the stage is seeded, which needs the channel', () => {
    expect(solveLongArching(blank())).toBeNull();
    const p = blank();
    MainBoutsPanel.seed(p);
    CornersPanel.seed(p);
    LongArchingPanel.seed(p);
    expect(p.arching).toBeUndefined();
    expect(solveLongArching(fluted())).toBeNull();
  });

  it('seeds once: tapered ribs, an arch and a crown on each plate with every curve type filled in, larger for a cello', () => {
    const p = seeded();
    const a = p.arching!;
    expect(a.ribHeightLower).toBeGreaterThan(a.ribHeightUpper);
    for (const plate of ['top', 'back'] as const) {
      expect(a[plate].arch.type).toBe('catenary');
      expect(a[plate].arch.height).toBeGreaterThan(0);
      expect(a[plate].arch.points.length).toBeGreaterThan(0);
      expect(a[plate].arch.points.every(pt => pt.z > 0 && pt.z < a[plate].arch.height)).toBe(true);
      expect(a[plate].cross.type).toBe('cycloid');
      expect(a[plate].cross.points.length).toBeGreaterThan(0);
      expect(a[plate].cross.stations).toEqual([]);
    }
    a.top.arch.height += 1;
    const edited = JSON.stringify(p);
    LongArchingPanel.seed(p);
    expect(JSON.stringify(p)).toBe(edited);

    const cello = blank();
    cello.body.height = 750;
    cello.body.width = 440;
    seeded(cello);
    expect(cello.arching!.ribHeightLower).toBeGreaterThan(a.ribHeightLower);
    expect(cello.arching!.top.arch.height).toBeGreaterThan(a.top.arch.height);
    expect(cello.arching!.top.thickness).toBeGreaterThan(a.top.thickness);
  });
});

describe('the rib taper', () => {
  it('reads the entered heights as perpendicular, so the vertical rise is fractionally more', () => {
    const p = seeded();
    p.arching!.ribHeightLower = 32;
    p.arching!.ribHeightUpper = 30;
    const t = solveRibTaper(p)!;
    expect(Math.sin(t.angle)).toBeCloseTo(2 / (p.body.height - p.body.overhang), 12);
    expect(t.zLower).toBeGreaterThan(32);
    expect(t.zLower - 32).toBeLessThan(0.001);
    expect(ribHeightAt(p, 0, t)).toBeCloseTo(t.zLower, 12);
    expect(ribHeightAt(p, p.body.height - p.body.overhang, t)).toBeCloseTo(t.zUpper, 12);
  });

  it('lies flat when the ribs do not taper', () => {
    const p = seeded();
    p.arching!.ribHeightUpper = p.arching!.ribHeightLower;
    const t = solveRibTaper(p)!;
    expect(t.angle).toBe(0);
    expect(ribHeightAt(p, 100, t)).toBe(t.zLower);
  });

  it('is a plane: linear in y and running on past both anchors', () => {
    const p = seeded();
    const t = solveRibTaper(p)!;
    const step = (a: number, b: number) => (ribHeightAt(p, b, t) - ribHeightAt(p, a, t)) / (b - a);
    expect(step(0, 50)).toBeCloseTo(step(200, 300), 12);
    expect(step(-20, 0)).toBeCloseTo(step(0, 50), 12);
  });

  it('fails past the taper the body can carry, and on a cleared height, rather than rolling back', () => {
    const p = seeded();
    p.arching!.ribHeightLower = p.arching!.ribHeightUpper + maxRibTaper(p) + 0.1;
    let s = solveLongArching(p)!;
    expect(s.ribs).toBeNull();
    expect(s.failures.some(f => f.unsolved.includes('ribs'))).toBe(true);
    expect(s.top).not.toBeNull();

    p.arching!.ribHeightLower = p.arching!.ribHeightUpper + maxRibTaper(p) - 0.1;
    expect(solveLongArching(p)!.ribs).not.toBeNull();

    (p.arching as any).ribHeightLower = null;
    s = solveLongArching(p)!;
    expect(s.ribs).toBeNull();
    expect(s.failures.some(f => f.unsolved.includes('ribs'))).toBe(true);
  });

  it('tilts the top plate as one rigid piece and leaves the back alone', () => {
    const p = seeded();
    const pl = topPlatePlacement(p, solveRibTaper(p)!);
    const a = new Pt(3.5, 20), b = new Pt(18, 300);
    expect(dist(placeOnTopPlate(pl, a), placeOnTopPlate(pl, b))).toBeCloseTo(dist(a, b), 9);
    expect(pl.angleDeg).not.toBe(0);
  });
});

describe('the long arch', () => {
  it('meets the channel tangentially at both ends, taking off below the plate edge', () => {
    const p = seeded();
    const s = solveLongArching(p)!;
    expect(s.failures).toEqual([]);
    for (const plate of ['top', 'back'] as const) {
      const la = s[plate]!;
      const g = p.fluting![plate];
      for (const end of [la.takeoff, la.farTakeoff]) {
        expect(end.tangent).toBe(true);
        expect(end.contactS).toBeGreaterThan(0);
        expect(end.contactS).toBeLessThan(la.halfWidth);
        expect(end.takeoffDepth).toBeGreaterThan(0);
        expect(gougeProfileSlope(end.contactS, g.width, g.depth)).toBeCloseTo(end.slope, 9);
        expect(-gougeProfileZ(end.contactS, g.width, g.depth)).toBeCloseTo(end.takeoffDepth, 9);
      }
      // the arch runs from its takeoff to the far one, the span inside the channel's centrelines
      expect(la.yStart).toBeCloseTo(la.centerY + la.takeoff.contactS, 9);
      expect(la.yEnd).toBeCloseTo(p.body.height - la.centerY - la.farTakeoff.contactS, 9);
      expect(archZAt(la.lowered, la.span, 0)).toBe(0);
      expect(archZAt(la.lowered, la.span, la.span)).toBeCloseTo(la.farZ, 9);
      // the peak stands the typed height above the plate edge
      let peak = 0;
      for (let y = 0; y <= la.span; y += 0.5) peak = Math.max(peak, archZAt(la.lowered, la.span, y, la.farZ) - la.takeoff.takeoffDepth);
      expect(peak).toBeCloseTo(p.arching![plate].arch.height, 3);
    }
  });

  it('lands both ends alike on a symmetric arch and differently on one that is not', () => {
    const p = seeded();
    const sym = solveLongArching(p)!.top!;
    expect(sym.farTakeoff.contactS).toBe(sym.takeoff.contactS);
    expect(sym.farZ).toBe(0);

    p.arching!.top.arch.type = 'spline';
    p.arching!.top.arch.points = [{ t: 97, z: -1.9, mirror: false }];
    const one = solveLongArching(p)!.top!;
    expect(one.farTakeoff.contactS).not.toBeCloseTo(one.takeoff.contactS, 1);
    // the knot dips under the channel, so that end lands on the outer flank, past the trough
    expect(one.farTakeoff.contactS).toBeLessThan(0);
  });

  it('keeps the closest landing and reports it where no tangent exists', () => {
    const p = seeded();
    p.arching!.top.arch.type = 'spline';
    p.arching!.top.arch.points = [{ t: 99, z: -1.9, mirror: false }];
    const s = solveLongArching(p)!;
    expect(s.top).not.toBeNull();
    expect(s.top!.farTakeoff.tangent).toBe(false);
    expect(s.failures.some(f => f.unsolved.length === 0 && f.message.includes('corner'))).toBe(true);
  });

  it('is the same arch whichever end it is solved from', () => {
    const p = seeded();
    const g = p.fluting!.top;
    const arch = longArchCurve({ ...p.arching!.top.arch, type: 'spline', points: [{ t: 25, z: 9, mirror: false }, { t: 80, z: 11, mirror: false }] });
    const la = solveLongArch(p, arch, g)!;
    const flipped = solveLongArch(p, { ...arch, peak: 1 - arch.peak, points: arch.points.map(pt => ({ ...pt, t: 1 - pt.t })) }, g)!;
    expect(la.takeoff.contactS).toBeCloseTo(flipped.farTakeoff.contactS, 6);
    expect(la.farTakeoff.contactS).toBeCloseTo(flipped.takeoff.contactS, 6);
    expect(la.span).toBeCloseTo(flipped.span, 6);
  });

  it('fails a point above the peak, one deeper than the plate, a position off the body, and a cleared height, each naming its plate', () => {
    const bad = (edit: (p: ViolinFamilyParams) => void): string[] => {
      const p = seeded();
      p.arching!.back.arch.type = 'spline';
      edit(p);
      const s = solveLongArching(p)!;
      expect(s.back).toBeNull();
      expect(s.top).not.toBeNull();
      return s.failures.map(f => f.unsolved.join());
    };
    expect(bad(p => { p.arching!.back.arch.points[0].z = p.arching!.back.arch.height + 1; })).toEqual(['back']);
    expect(bad(p => { p.arching!.back.arch.points[0].z = -p.arching!.back.thickness - 1; })).toEqual(['back']);
    expect(bad(p => { p.arching!.back.arch.points[0].t = 100; })).toEqual(['back']);
    expect(bad(p => { (p.arching!.back.arch as any).height = null; })).toEqual(['back']);
    expect(bad(p => { p.arching!.back.arch.peak = 3; })).toEqual(['back']);
  });
});
