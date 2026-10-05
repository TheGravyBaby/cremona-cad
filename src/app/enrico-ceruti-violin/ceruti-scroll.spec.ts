import { calculateScroll, calculateScrollWidths, defaultVoluteParams, duckTailRadius, pegboxCavity, pegboxTaperStart, scrollBackWidths, scrollFrontWidths, ScrollKey, scrollLines, scrollNeckHalfWidth, scrollWidthStations, spiralArcs, TO_FRONT, VoluteSpec, VOLUTE_STYLE_LABELS } from './ceruti-scroll';
import { scrollWidthLedges, voluteConstruction } from './renders/scroll.render';
import { defaultNeckParams, defaultStringSetup } from './ceruti-neck';
import { defaultViolin } from './ceruti-fixtures';
import { EnricoCerutiParams, ScrollParams, VoluteStyle } from './ceruti-types';
import { angleWithinSweep, dist, normalizeRadians } from '../helpers/math/simpleGeometry';
import { Arc, Circle, Pt, Pt3D } from '../models/types';
import { defineSideScrollPath } from './ceruti-paths';
import { samplePathToPolyline, splitPathStrings } from '../helpers/math/pathMath';

const at = ({ x, y, r }: Arc, angle: number) => [x + r * Math.cos(angle), y + r * Math.sin(angle)];
const EYE_Y = 90;
// the default arc radii unrounded, so they scale exactly with the eye
const arcRadii = (eyeRadius: number, count = TO_FRONT) => Array.from({ length: count }, (_, i) => (Math.SQRT2 + i / 2) * eyeRadius);
const spec = (style: VoluteStyle, eyeRadius: number, radii = arcRadii(eyeRadius)): VoluteSpec =>
  ({ style, eye: new Circle(0, 0, eyeRadius), arcRadii: radii, pitch: 2 * eyeRadius, seedLength: eyeRadius });
const arc = (r: number, start: number, end: number) => new Arc(0, 0, r, start, end);

// a violin with its scroll solved in `style`, the eye flush with the neck's front at EYE_Y and the
// neck's back at x = 0 unless a test moves it
const scrolled = (style: VoluteStyle, eyeRadius: number, over: Partial<ScrollParams> = {}, radii?: number[]) => {
  const p = defaultViolin();
  p.neck = defaultNeckParams(p);
  p.stringSetup = defaultStringSetup(p);
  p.neck.thickness = 0;
  p.scroll = { ...defaultVoluteParams(p), ...spec(style, eyeRadius, radii), flushWithNeck: true, ...over };
  p.scroll.eye = new Circle(p.scroll.eye.x, over.eye?.y ?? EYE_Y, eyeRadius);
  const failures = calculateScroll(p);
  return { p, v: p.scroll, failures };
};
const unsolved = (p: EnricoCerutiParams): ScrollKey[] => [...new Set(calculateScroll(p).flatMap(f => f.unsolved))].sort();
const sweep = (arcs: Arc[]) => arcs.reduce((sum, a) => sum + a.end - a.start, 0);

const STYLES = Object.keys(VOLUTE_STYLE_LABELS) as VoluteStyle[];
const HISTORICAL = STYLES.filter(s => s !== 'fourPoint' && s !== 'archimedean');
// arcs out to the front, two turns: the Archimedean is set out in eighths
const FRONT: Record<VoluteStyle, number> = { fourPoint: 8, archimedean: 16, serlio: 8, salviati: 8, goldmann: 8, kelly: 8 };

describe.each(STYLES)('the %s volute', style => {
  it('draws arcs that scale with the eye radius', () => {
    const small = spiralArcs(spec(style, 3));
    const large = spiralArcs(spec(style, 6));
    small.forEach((s, i) => {
      expect(large[i].r).toBeCloseTo(2 * s.r, 9);
      expect(large[i].x).toBeCloseTo(2 * s.x, 9);
      expect(large[i].y).toBeCloseTo(2 * s.y, 9);
    });
  });

  it('meets each arc to its inner neighbour, tangent, at a point on the line between their centres', () => {
    const arcs = spiralArcs(spec(style, 4));
    for (let i = 0; i < arcs.length - 1; i++) {
      const [outer, inner] = [arcs[i], arcs[i + 1]];
      const [x, y] = at(outer, outer.start);
      const [ix, iy] = at(inner, inner.end);
      expect(Math.hypot(x - ix, y - iy), `arcs ${i} and ${i + 1} share no point`).toBeLessThan(1e-9);
      const cross = (x - outer.x) * (inner.y - outer.y) - (y - outer.y) * (inner.x - outer.x);
      expect(Math.abs(cross), `arcs ${i} and ${i + 1} are not tangent`).toBeLessThan(1e-9);
    }
  });

  it('winds outward, every arc at least as wide as the one inside it and turning the same way, for at least two turns', () => {
    const arcs = spiralArcs(spec(style, 4));
    for (let i = 0; i < arcs.length - 1; i++) expect(arcs[i].r, `arc ${i}`).toBeGreaterThanOrEqual(arcs[i + 1].r);
    for (const a of arcs) expect(a.end - a.start).toBeGreaterThan(0);
    expect(sweep(arcs) / (2 * Math.PI)).toBeGreaterThanOrEqual(2 - 1e-9);
  });

  // the Archimedean has a pitch at the eye, so its heading there is a little off vertical
  it('leaves the eye at its front, heading up', () => {
    const arcs = spiralArcs(spec(style, 4));
    const inner = arcs[arcs.length - 1];
    expect(at(inner, inner.start)).toEqual([expect.closeTo(4, 9), expect.closeTo(0, 9)]);
    expect(Math.cos(inner.start)).toBeGreaterThan(0.95);
  });

  it('draws guides that scale with the eye radius', () => {
    const small = voluteConstruction(scrolled(style, 3).v);
    const large = voluteConstruction(scrolled(style, 6).v);
    expect(small.length).toBeGreaterThan(0);
    small.forEach((line, i) => line.forEach((p, j) => {
      expect(large[i][j].x).toBeCloseTo(2 * p.x, 9);
      expect(large[i][j].y).toBeCloseTo(2 * p.y, 9);
    }));
  });

  // flush to the hundredth, the precision Eye X is written to
  const FLUSH = 0.005 + 1e-9;

  it('ends the spiral at its front heading straight up, flush with the neck, with nothing in front of it', () => {
    const spiral = scrolled(style, 4).v.spiral!;
    const outer = spiral[0];
    expect(spiral).toHaveLength(FRONT[style]);
    expect(Math.abs(at(outer, outer.end)[0])).toBeLessThanOrEqual(FLUSH);
    expect(Math.sin(outer.end)).toBeCloseTo(0, 9);
    expect(Math.cos(outer.end)).toBeCloseTo(1, 9);
    for (const a of spiral) {
      const right = Math.max(...[a.start, a.end, 0].filter(t => angleWithinSweep(t, a.start, a.end)).map(t => at(a, t)[0]));
      expect(right).toBeLessThanOrEqual(FLUSH);
    }
  });

  const tangentAt = (last: Arc, a: Arc, angle: number) => {
    const [dx, dy] = [a.x - last.x, a.y - last.y];
    expect(dx * Math.sin(angle) - dy * Math.cos(angle)).toBeCloseTo(0, 9);
  };
  const BACK: Partial<ScrollParams> = {
    S0: arc(30, 0, Math.PI / 2), S1: arc(20, 0, Math.PI), S2: arc(15, 0, 4), backStraight: 6, S3: arc(12, 0.2, 0), nape: arc(3, 0, 0),
  };

  it('runs S0 to S2 on from the spiral\'s front, each tangent to the last and ending at its own angle', () => {
    const { v, failures } = scrolled(style, 4, { ...BACK, backStraight: NaN });
    const outer = v.spiral![0];
    const arcs = [v.S0, v.S1, v.S2];
    expect(at(arcs[0], arcs[0].start)).toEqual(at(outer, outer.end).map(c => expect.closeTo(c, 9)));
    expect(arcs[0].y).toBeCloseTo(outer.y, 9);
    expect(arcs.flatMap(a => [a.start, a.end])).toEqual([0, Math.PI / 2, Math.PI / 2, Math.PI, Math.PI, 4]);
    arcs.slice(1).forEach((a, i) => {
      expect(at(a, a.start)).toEqual(at(arcs[i], arcs[i].end).map(c => expect.closeTo(c, 9)));
      tangentAt(arcs[i], a, a.start);
    });
    expect(arcs.map(a => a.r)).toEqual([30, 20, 15]);
    expect(failures.flatMap(f => f.unsolved)).toEqual(['S3', 'nape', 'backStraight']);
  });

  it('runs the straight on along S2\'s heading, then S3 curving back the other way to its end', () => {
    const { p, v } = scrolled(style, 4, BACK);
    const [s2, s3] = [v.S2, v.S3];
    const [top, foot] = scrollLines(p).backStraight;
    expect([top.x, top.y]).toEqual(at(s2, 4).map(c => expect.closeTo(c, 9)));
    expect(dist(top, foot)).toBeCloseTo(6, 9);
    expect((foot.x - top.x) * Math.cos(4) + (foot.y - top.y) * Math.sin(4)).toBeCloseTo(0, 9);
    expect(-(foot.x - top.x) * Math.sin(4) + (foot.y - top.y) * Math.cos(4)).toBeCloseTo(6, 9);
    expect([s3.start, s3.end]).toEqual([0.2, 4 - Math.PI]);
    expect(at(s3, s3.end)).toEqual([foot.x, foot.y].map(c => expect.closeTo(c, 9)));
    // curving the other way: S3's centre is on the far side of the line from S2's
    const side = (c: Pt) => (foot.x - top.x) * (c.y - top.y) - (foot.y - top.y) * (c.x - top.x);
    expect(Math.sign(side(s3))).toBe(-Math.sign(side(s2)));
    expect(s3.r).toBe(12);
  });

  it('puts S3 straight on S2 with no straight between', () => {
    const { p, v } = scrolled(style, 4, { ...BACK, backStraight: 0 });
    const [top, foot] = scrollLines(p).backStraight;
    expect(dist(top, foot)).toBeCloseTo(0, 9);
    expect(at(v.S3, v.S3.end)).toEqual(at(v.S2, v.S2.end).map(c => expect.closeTo(c, 9)));
    tangentAt(v.S2, v.S3, v.S2.end);
  });

  it('runs square to the neck from the duck tail, the nape filleting it into the neck\'s back', () => {
    const { p, v } = scrolled(style, 4, BACK);
    const [x, y] = at(v.S3, v.S3.start);
    const neckBack = x + 10;
    p.neck!.thickness = -neckBack;
    expect(unsolved(p)).toEqual([]);
    expect(scrollLines(p).square.map(q => [q.x, q.y])).toEqual([[x, y], [neckBack - 3, y]].map(q => q.map(c => expect.closeTo(c, 9))));
    expect(v.nape.r).toBe(3);
    expect([v.nape.start, v.nape.end]).toEqual([0, Math.PI / 2]);
    expect(at(v.nape, Math.PI / 2)).toEqual([neckBack - 3, y].map(c => expect.closeTo(c, 9)));
    expect(at(v.nape, 0)).toEqual([neckBack, y - 3].map(c => expect.closeTo(c, 9)));

    p.neck!.thickness = -(x + 3);
    expect(unsolved(p)).toEqual([]);
    expect(dist(...scrollLines(p).square)).toBeCloseTo(0, 9);
    expect(at(v.nape, Math.PI / 2)).toEqual([x, y].map(c => expect.closeTo(c, 9)));

    p.neck!.thickness = -(x + 2);
    expect(unsolved(p)).toEqual(['nape']);
    p.neck!.thickness = -neckBack;
    v.nape.r = 0;
    expect(unsolved(p)).toEqual(['nape']);
    expect([v.S3.start, v.S3.end]).toEqual([0.2, 4 - Math.PI]);
  });

  // the panel's default proportions, up from the top of the nut to the spiral's bottom
  const withFront = (p: EnricoCerutiParams) => {
    const v = p.scroll!;
    const rise = Math.min(...v.spiral!.map(a => a.y - a.r)) - p.stringSetup!.nutHeight;
    v.flat = 0.45 * rise;
    v.F0 = arc(0.4 * rise, 0, Math.PI / 6);
    v.frontStraight = 0.3 * rise;
    v.F1 = arc(0.15 * rise, 0, 0);
    return rise;
  };

  it('runs the front up from the nut, F0 turning back, the straight on, and F1 curving up into the spiral', () => {
    const { p, v } = scrolled(style, 4, BACK);
    const nutTop = p.stringSetup!.nutHeight;
    const rise = withFront(p);
    expect(unsolved(p).filter(k => k !== 'nape')).toEqual([]);
    const [f0, f1] = [v.F0, v.F1];
    expect(scrollLines(p).flat.map(q => [q.x, q.y])).toEqual([[0, nutTop], [0, nutTop + 0.45 * rise]].map(q => q.map(c => expect.closeTo(c, 9))));
    expect(at(f0, 0)).toEqual([0, nutTop + 0.45 * rise].map(c => expect.closeTo(c, 9)));
    expect(f0.x).toBeLessThan(0);
    expect([f0.start, f0.end, f0.r]).toEqual([0, Math.PI / 6, 0.4 * rise]);
    const [top, foot] = scrollLines(p).frontStraight;
    expect([top.x, top.y]).toEqual(at(f0, f0.end).map(c => expect.closeTo(c, 9)));
    expect(dist(top, foot)).toBeCloseTo(0.3 * rise, 9);
    expect(foot.x).toBeLessThan(top.x);
    expect(at(f1, f1.end)).toEqual([foot.x, foot.y].map(c => expect.closeTo(c, 9)));
    expect(f1.end).toBeCloseTo(f0.end + Math.PI, 12);
    expect(Math.sign(f1.x - foot.x)).toBe(-Math.sign(f0.x - top.x));
    // F1 ends on a drawn arc of the spiral, and crosses none of it before
    const end = at(f1, f1.start);
    const onSpiral = (q: number[], tol: number) => v.spiral!.some(a =>
      Math.abs(Math.hypot(q[0] - a.x, q[1] - a.y) - a.r) < tol && angleWithinSweep(Math.atan2(q[1] - a.y, q[0] - a.x), a.start, a.end));
    expect(onSpiral(end, 1e-6)).toBe(true);
    for (let k = 1; k < 50; k++) expect(onSpiral(at(f1, f1.end - (f1.end - f1.start) * k / 50), 1e-3)).toBe(false);
    expect(f1.end - f1.start).toBeGreaterThan(0);
    expect(f1.end - f1.start).toBeLessThan(Math.PI);
  });

  it('leaves F1 unsolved when it never reaches the spiral, and stops the front at the first part that is no radius or length', () => {
    const { p, v } = scrolled(style, 4, BACK);
    const rise = withFront(p);
    const front = (over: Partial<ScrollParams>) => {
      withFront(p);
      Object.assign(v, over);
      return unsolved(p).filter(k => k !== 'nape');
    };
    expect(front({ flat: 0.01 })).toEqual(['F1']);
    expect(front({ flat: 0 })).not.toContain('flat');
    expect(dist(...scrollLines(p).flat)).toBeCloseTo(0, 9);
    expect(front({ flat: -1 })).toEqual(['F0', 'F1', 'flat', 'frontStraight']);
    for (const f0 of [arc(0, 0, 1), arc(10, 0, 0), arc(10, 0, 7)]) {
      expect(front({ F0: f0 })).toEqual(['F0', 'F1', 'frontStraight']);
      expect(dist(...scrollLines(p).flat)).toBeCloseTo(0.45 * rise, 9);
    }
    expect(front({ frontStraight: -1 })).toEqual(['F1', 'frontStraight']);
    expect(v.F0.r).toBe(0.4 * rise);
    expect(front({ F1: arc(0, 0, 0) })).toEqual(['F1']);
  });

  it('ends the back at the first part that is no radius, no forward sweep or no length', () => {
    const { p, v } = scrolled(style, 4, BACK);
    const back = (over: Partial<ScrollParams>) => {
      Object.assign(v, JSON.parse(JSON.stringify(BACK)), over);
      return unsolved(p);
    };
    for (const bad of [arc(0, 0, Math.PI), arc(20, 0, Math.PI / 2), arc(20, 0, Math.PI / 2 + 7), arc(20, 0, NaN)]) {
      expect(back({ S1: bad })).toEqual(['S1', 'S2', 'S3', 'backStraight', 'nape']);
      expect([v.S0.r, v.S0.end]).toEqual([30, Math.PI / 2]);
    }
    expect(back({ backStraight: -1 })).toEqual(['S3', 'backStraight', 'nape']);
    expect(v.S2.end).toBe(4);
    for (const hollow of [arc(0, 0, 0), arc(12, 4 - Math.PI, 0), arc(12, 4 - 3 * Math.PI - 0.1, 0)]) {
      expect(back({ S3: hollow })).toEqual(['S3', 'nape']);
      expect(dist(...scrollLines(p).backStraight)).toBeCloseTo(6, 9);
    }
  });

  it('draws nothing for an eye that is not a positive radius', () => {
    for (const bad of [0, -1, NaN]) {
      const { v, failures } = scrolled(style, bad);
      expect(v.spiral).toBeNull();
      expect(failures[0].unsolved).toContain('spiral');
      expect(failures[0].unsolved).toContain('F1');
    }
  });

  it('brings the spiral\'s front flush with the neck at any height', () => {
    for (const eyeY of [70, 85]) {
      const { v } = scrolled(style, 4, { eye: new Circle(0, eyeY, 4) });
      expect(v.eye.y).toBe(eyeY);
      const right = Math.max(...v.spiral!.flatMap(a =>
        [a.start, a.end, 0, 2 * Math.PI, 4 * Math.PI, 6 * Math.PI].filter(t => t === a.start || t === a.end || angleWithinSweep(t, a.start, a.end)).map(t => at(a, t)[0])));
      expect(Math.abs(right), `at ${eyeY}`).toBeLessThanOrEqual(FLUSH);
    }
  });

  it('goes wherever the eye is put, unchanged', () => {
    const fitted = scrolled(style, 4).v;
    const { v } = scrolled(style, 4, { flushWithNeck: false, eye: new Circle(fitted.eye.x - 5, fitted.eye.y - 7, 4) });
    expect([v.eye.x, v.eye.y]).toEqual([fitted.eye.x - 5, fitted.eye.y - 7]);
    v.spiral!.forEach((a, i) => {
      expect(a.x).toBeCloseTo(fitted.spiral![i].x - 5, 9);
      expect(a.y).toBeCloseTo(fitted.spiral![i].y - 7, 9);
      expect([a.r, a.start, a.end]).toEqual([fitted.spiral![i].r, fitted.spiral![i].start, fitted.spiral![i].end]);
    });
  });

  it('draws nothing for an eye that has no place yet', () => {
    expect(scrolled(style, 4, { flushWithNeck: false, eye: new Circle(NaN, 50, 4) }).v.spiral).toBeNull();
    expect(scrolled(style, 4, { flushWithNeck: false, eye: new Circle(-20, NaN, 4) }).v.spiral).toBeNull();
  });
});

describe('the default scroll', () => {
  it('solves whole, nothing unsolved, from the neck\'s own thickness', () => {
    const p = defaultViolin();
    p.neck = defaultNeckParams(p);
    p.stringSetup = defaultStringSetup(p);
    expect(unsolved(p)).toEqual([]);
    const v = p.scroll!;
    expect(v.spiral).toHaveLength(TO_FRONT);
    expect(v.nape.x).toBeCloseTo(-p.neck.thickness - v.nape.r, 9);
    expect(v.F1.end - v.F1.start).toBeGreaterThan(0);
  });
});

describe.each(STYLES)('the scroll widths with a %s volute', style => {
  const widths = () => {
    const { p, failures } = scrolled(style, 4);
    expect(failures).toEqual([]);
    calculateScrollWidths(p);
    return p;
  };

  it('runs the path from the top of the duck tail\'s round in to the eye', () => {
    const p = widths();
    const v = p.scroll!;
    const back = scrollBackWidths(p);
    expect(back[0].y).toBeCloseTo(at(v.S3, v.S3.start)[1] + duckTailRadius(p), 6);
    expect(back.at(-1)!.z).toBeCloseTo(v.eye.x + v.eye.r, 6);
    expect(back.at(-1)!.y).toBeCloseTo(v.eye.y, 6);
  });

  it('sets a width at the nut, the throat, the crown, the bottom and top of each turn, and the eye', () => {
    const p = widths();
    const v = p.scroll!;
    const stations = scrollWidthStations(p);
    expect(stations.map(st => st.key)).toEqual(['nut', 'throat', 'crown', 'turn1Bottom', 'turn2Top', 'turn2Bottom', 'turn3Top', 'eye']);
    const [nut, throat, crown, bottom1, top2, bottom2, top3, eye] = stations.map(st => st.at);
    expect([nut.x, nut.y]).toEqual([0, p.stringSetup!.nutHeight]);
    expect([throat.x, throat.y]).toEqual(at(v.F1, v.F1.start));
    const back = scrollBackWidths(p);
    expect(crown.y).toBeCloseTo(Math.max(...back.map(pt => pt.y)), 9);
    expect(bottom1.y).toBeLessThan(bottom2.y);
    expect(bottom2.y).toBeLessThan(eye.y);
    expect(eye.y).toBeLessThan(top3.y);
    expect(top3.y).toBeLessThan(top2.y);
    expect(top2.y).toBeLessThan(crown.y);

    // each turn is a point of the contour, level there, and as wide as its field says
    for (const st of stations.slice(2)) {
      const k = back.findIndex(pt => Math.hypot(pt.z - st.at.x, pt.y - st.at.y) < 1e-9);
      expect(k).toBeGreaterThan(0);
      expect(back[k].x).toBeCloseTo(st.width / 2, 9);
      if (st.key !== 'eye') expect((back[k].y - back[k - 1].y) * (back[k + 1].y - back[k].y)).toBeLessThan(0);
    }
  });

  it('runs the front from the nut up to where F1 meets the spiral, tapering from the nut\'s width to the throat\'s', () => {
    const p = widths();
    const front = scrollFrontWidths(p);
    expect(front[0].z).toBeCloseTo(0, 9);
    expect(front[0].y).toBeCloseTo(p.stringSetup!.nutHeight, 9);
    expect(front[0].x).toBeCloseTo(p.stringSetup!.nutWidth / 2, 9);
    const [x, y] = at(p.scroll!.F1, p.scroll!.F1.start);
    expect(front.at(-1)!.z).toBeCloseTo(x, 6);
    expect(front.at(-1)!.y).toBeCloseTo(y, 6);
    expect(front.at(-1)!.x).toBeCloseTo(p.scroll!.widths.throat / 2, 6);
  });
});

describe('the scroll widths', () => {
  const solved = () => {
    const p = defaultViolin();
    p.neck = defaultNeckParams(p);
    p.stringSetup = defaultStringSetup(p);
    calculateScroll(p);
    calculateScrollWidths(p);
    return { p, v: p.scroll! };
  };

  it('keeps the widths the user set as the scroll moves under them', () => {
    const { p, v } = solved();
    v.widths.crown = 9;
    const crown = () => scrollWidthStations(p).find(st => st.key === 'crown')!;
    const before = crown().at;
    v.S2.r += 5;
    calculateScroll(p);
    calculateScrollWidths(p);
    expect(crown().width).toBe(9);
    expect(crown().at).not.toEqual(before);
  });

  it('seeds a scroll saved without widths', () => {
    const { p, v } = solved();
    const fields = () => ({ widths: { ...v.widths }, pegboxStraight: v.pegboxStraight, pegboxWall: v.pegboxWall, pegboxFloor: v.pegboxFloor });
    const seeded = fields();
    for (const key of Object.keys(seeded)) delete (v as any)[key];
    calculateScrollWidths(p);
    expect(fields()).toEqual(seeded);
  });

  it('keeps the front down to the nut, the nape hung below the nut or not', () => {
    const { p, v } = solved();
    for (const drop of [0, 8]) {
      v.eye = new Circle(v.eye.x, v.eye.y - drop, v.eye.r);
      expect(calculateScroll(p)).toEqual([]);
      expect(scrollFrontWidths(p)[0].y).toBeCloseTo(p.stringSetup!.nutHeight, 6);
    }
    expect(v.nape.y + v.nape.r).toBeLessThan(0);
  });

  it('starts the path as wide as the nut, at the top of a duck tail round as wide as the neck there', () => {
    const { p, v } = solved();
    const duckTail = at(v.S3, v.S3.start)[1];
    const startsAtTop = () => expect(scrollBackWidths(p)[0].y).toBeCloseTo(duckTail + duckTailRadius(p), 6);
    // the default straight clears the round, so the path starts as wide as the nut
    expect(pegboxTaperStart(p)).toBeGreaterThan(scrollBackWidths(p)[0].y);
    expect(scrollBackWidths(p)[0].x).toBe(p.stringSetup!.nutWidth / 2);
    // the default duck tail sits on the nut line, where the neck is its top width
    expect(duckTailRadius(p)).toBeCloseTo(p.neck!.topWidth / 2, 2);
    startsAtTop();
    // the nut sets the path's start and the neck the round, each on its own
    p.stringSetup!.nutWidth = 30;
    p.neck!.topWidth = 20;
    expect(scrollBackWidths(p)[0].x).toBe(15);
    expect(duckTailRadius(p)).toBeCloseTo(scrollNeckHalfWidth(p, duckTail), 9);
    expect(duckTailRadius(p)).toBeCloseTo(10, 2);
    startsAtTop();
  });

  it.each([0, 8, 30])('keeps the pegbox as wide as the nut for a straight of %d, then tapers it by height to the throat, back and front alike', straight => {
    const { p, v } = solved();
    v.pegboxStraight = straight;
    const { nutWidth, nutHeight } = p.stringSetup!;
    const throat = at(v.F1, v.F1.start)[1];
    const from = nutHeight + straight;
    const taper = (y: number) => (nutWidth + (v.widths.throat - nutWidth) * Math.min(Math.max((y - from) / (throat - from), 0), 1)) / 2;
    const back = scrollBackWidths(p);
    const leaves = back.findIndex(pt => pt.y > throat);
    expect(leaves).toBeGreaterThan(10);
    for (const pt of back.slice(0, leaves)) expect(pt.x).toBeCloseTo(taper(pt.y), 9);
    for (const pt of scrollFrontWidths(p)) expect(pt.x).toBeCloseTo(taper(pt.y), 9);
    expect(back.some(pt => pt.y > from && pt.x < nutWidth / 2)).toBe(true);
  });

  it('hollows the pegbox from the nut\'s top to the end of the front\'s straight, its floor the back carried in by its thickness', () => {
    const { p, v } = solved();
    const cavity = pegboxCavity(p)!;
    expect([cavity[0].x, cavity[0].y]).toEqual([0, p.stringSetup!.nutHeight]);
    const frontEnd = scrollLines(p).frontStraight[1];
    expect([cavity.at(-1)!.x, cavity.at(-1)!.y]).toEqual([frontEnd.x, frontEnd.y]);
    // the wall under the nut drops back and toward the scroll
    expect(cavity[1].x).toBeLessThan(0);
    expect(cavity[1].y).toBeGreaterThan(cavity[0].y);

    const back = scrollBackWidths(p);
    const duckTail = at(v.S3, v.S3.start);
    const toBack = (pt: Pt) => Math.min(Math.hypot(pt.x - duckTail[0], pt.y - duckTail[1]), ...back.map(b => Math.hypot(pt.x - b.z, pt.y - b.y)));
    const floor = cavity.slice(2, -2);
    expect(floor.length).toBeGreaterThan(50);
    for (const pt of floor) expect(toBack(pt)).toBeCloseTo(v.pegboxFloor, 1);

    v.pegboxFloor = 200;
    expect(pegboxCavity(p)).toBeNull();
  });

  it('holds the crown to the throat\'s width, and each turn to at least the one before', () => {
    const { p, v } = solved();
    Object.assign(v.widths, { throat: 18, crown: 22, turn1Bottom: 15, turn2Top: 30, turn2Bottom: 28, turn3Top: 35, eye: 10 });
    calculateScrollWidths(p);
    expect(v.widths).toEqual({ throat: 18, crown: 18, turn1Bottom: 18, turn2Top: 30, turn2Bottom: 30, turn3Top: 35, eye: 35 });
    const settled = { ...v.widths };
    calculateScrollWidths(p);
    expect(v.widths).toEqual(settled);
  });

  it('leaves the taper for the curve without a step or a corner', () => {
    const { p, v } = solved();
    const throat = at(v.F1, v.F1.start)[1];
    const back = scrollBackWidths(p);
    const leaves = back.findIndex(pt => pt.y > throat);
    const along = (k: number) => Math.hypot(back[k].z - back[k - 1].z, back[k].y - back[k - 1].y);
    const slope = (k: number) => (back[k].x - back[k - 1].x) / along(k);
    // a millimetre either side, so the curve's own bend is in the difference
    expect(slope(leaves + 1)).toBeCloseTo(slope(leaves - 1), 1);
    for (let k = 1; k < back.length; k++) expect(Math.abs(back[k].x - back[k - 1].x)).toBeLessThan(0.5);
  });
});

describe('the scroll widths\' ledges', () => {
  // the path and the level lines off a back view drawn by hand over the app's own, in half-widths;
  // the one drawn at the eye was later dropped, the cylinder closing the eye on its own
  const ys = [0, 22.996631, 43.440314, 63.312816, 86.419489, 103.098382, 102.236413, 82.373266, 67.705312, 82.667968, 91.884532, 76.254874, 83];
  const xs = [13, 11.5, 10, 8.5, 6.5, 6, 6, 8.5, 11, 13, 14, 15, 16];
  const widths = ys.map((y, k) => new Pt3D(xs[k], y, 0));

  it('runs level from each turn of the path in to the next contour inside it, and across the crown', () => {
    const ledges = scrollWidthLedges(widths);
    expect(ledges.map(l => [l.y, l.from])).toEqual([[103.098382, 6], [67.705312, 11], [91.884532, 14], [76.254874, 15]]);
    expect(ledges[0].to).toBeNull();
    const drawn = [8.107, 7.319, 12.119];
    ledges.slice(1).forEach((l, i) => expect(l.to).toBeCloseTo(drawn[i], 1));
  });
});

describe.each(HISTORICAL)('the %s volute, as its author drew it', style => {
  it('draws the same whatever the arc radii say', () => {
    expect(spiralArcs(spec(style, 4, [9, 17, 30]))).toEqual(spiralArcs(spec(style, 4)));
  });
});

describe('the Archimedean volute', () => {
  const [r, pitch] = [4, 6];
  const v = { ...spec('archimedean', r), pitch };
  const arcs = spiralArcs(v);
  const inward = [...arcs].reverse();

  it('passes through a point every eighth of a turn, the radius growing a pitch a turn from the eye\'s edge', () => {
    expect(arcs).toHaveLength(16);
    inward.forEach((a, k) => {
      const [x, y] = at(a, a.start);
      expect(Math.hypot(x, y)).toBeCloseTo(r + pitch * k / 8, 9);
      expect(Math.cos(Math.atan2(y, x) - k * Math.PI / 4)).toBeCloseTo(1, 9);
    });
  });

  it('stays within a hundredth of the pitch of the true spiral between its points', () => {
    inward.forEach((a, k) => {
      for (const f of [0.25, 0.5, 0.75]) {
        const [x, y] = at(a, a.start + f * (a.end - a.start));
        const turned = normalizeRadians(Math.atan2(y, x) - k * Math.PI / 4 + Math.PI) - Math.PI;
        const spiral = r + pitch * (k / 8 + turned / (2 * Math.PI));
        expect(Math.abs(Math.hypot(x, y) - spiral), `arc ${k} at ${f}`).toBeLessThan(pitch / 100);
      }
    });
  });

  it('draws nothing without a pitch', () => {
    for (const bad of [0, -1, NaN]) expect(spiralArcs({ ...v, pitch: bad })).toEqual([]);
  });

  it('rays out to the outermost drawn point on each of the eight lines', () => {
    const rays = voluteConstruction(scrolled('archimedean', r, { pitch }).v);
    expect(rays.map(([, to]) => Math.hypot(to.x, to.y))).toEqual([16, 9, 10, 11, 12, 13, 14, 15].map(k => expect.closeTo(r + pitch * k / 8, 9)));
  });
});

describe('the Kelly volute', () => {
  // his own drawing: a 4 mm eye on a 4 mm column of 1 mm squares
  const v = spec('kelly', 4);
  const inward = [...spiralArcs(v)].reverse();

  it('draws his first eight exact quarter turns, radii as in his drawing', () => {
    expect(inward.map(a => a.r)).toEqual([4.5, 5.5, 6.5, 8.5, 9.5, 12.5, 13.5, 17.5].map(r => expect.closeTo(r, 9)));
    for (const a of inward) expect(a.end - a.start).toBeCloseTo(Math.PI / 2, 9);
  });

  it('strikes the first from the left end of the seed\'s middle line, then round the middle squares\' corners and the seed\'s own, lower left round to upper left', () => {
    expect(inward.map(a => [a.x, a.y])).toEqual(
      [[-0.5, 0], [-0.5, -1], [0.5, -1], [0.5, 1], [-0.5, 1], [-0.5, -2], [0.5, -2], [0.5, 2]].map(([x, y]) => [expect.closeTo(x, 9), expect.closeTo(y, 9)]));
  });

  it('draws two full turns, the eighth ending at its own front', () => {
    const spiral = scrolled('kelly', 4).v.spiral!;
    expect(spiral).toHaveLength(8);
    expect([spiral[0].r, spiral[0].start, spiral[0].end]).toEqual([inward[7].r, inward[7].start, inward[7].end]);
  });

  it('guides with the seed\'s four squares and the eye\'s two axes', () => {
    const [outline, ...rest] = voluteConstruction(scrolled('kelly', 4).v);
    expect(outline.map(p => [p.x, p.y])).toEqual([[-0.5, -2], [0.5, -2], [0.5, 2], [-0.5, 2], [-0.5, -2]]);
    expect(rest).toHaveLength(5);
  });

  it('strikes round a seed of any length, top to bottom, the first arc still leaving the eye\'s front', () => {
    const long = { ...v, seedLength: 8 };
    const [outline] = voluteConstruction(scrolled('kelly', 4, { seedLength: 8 }).v);
    expect(outline.map(p => [p.x, p.y])).toEqual([[-1, -4], [1, -4], [1, 4], [-1, 4], [-1, -4]]);
    const centres = [...spiralArcs(long)].reverse().map(a => [a.x, a.y]);
    expect(centres).toEqual(inward.map(a => [2 * a.x, 2 * a.y]).map(([x, y]) => [expect.closeTo(x, 9), expect.closeTo(y, 9)]));
    const first = spiralArcs(long).at(-1)!;
    expect(at(first, first.start)).toEqual([expect.closeTo(4, 9), expect.closeTo(0, 9)]);
    expect(first.r).toBeCloseTo(5, 9);
  });

  it('draws nothing without a seed, and says so', () => {
    for (const bad of [0, -1, NaN]) {
      expect(spiralArcs({ ...v, seedLength: bad })).toEqual([]);
    }
    const { v: solved, failures } = scrolled('kelly', 4, { seedLength: 0 });
    expect(solved.spiral).toBeNull();
    expect(failures[0].message).toContain('seed');
  });
});

describe('the Goldmann volute', () => {
  const r = 4;
  const arcs = spiralArcs(spec('goldmann', r));

  it('draws eight exact quarter circles, radii 7/6 to 28/6 of the eye radius, out to 5 radii', () => {
    expect(arcs).toHaveLength(8);
    for (const a of arcs) expect(a.end - a.start).toBeCloseTo(Math.PI / 2, 9);
    expect(arcs.map(a => a.r / r)).toEqual([28, 24, 20, 16, 13, 11, 9, 7].map(v => expect.closeTo(v / 6, 9)));
    expect(at(arcs[0], arcs[0].end)).toEqual([expect.closeTo(5 * r, 9), expect.closeTo(0, 9)]);
  });

  it('finds its centres on squares sharing a side along the eye\'s horizontal diameter, hanging below it', () => {
    const [on, below] = [arcs.filter(a => Math.abs(a.y) < 1e-9), arcs.filter(a => a.y < -1e-9)];
    expect(on).toHaveLength(4);
    expect(below.map(a => -a.y / r).sort()).toEqual([1 / 3, 1 / 3, 2 / 3, 2 / 3].map(v => expect.closeTo(v, 9)));
  });
});

describe('the Serlio volute', () => {
  it('winds out from the eye in his radii, in eye diameters, about centres in sixths of the horizontal diameter', () => {
    const arcs = spiralArcs(spec('serlio', 4));
    const twice = (v: number[]) => v.flatMap(x => [x, x]);
    expect(arcs.map(a => a.r / 8)).toEqual(twice([13 / 6, 3 / 2, 1, 2 / 3]).map(v => expect.closeTo(v, 9)));
    expect(arcs.map(a => a.y)).toEqual(Array(8).fill(expect.closeTo(0, 9)));
    expect(arcs.map(a => a.x / 8)).toEqual(twice([2 / 6, -2 / 6, 1 / 6, -1 / 6]).map(v => expect.closeTo(v, 9)));
  });

  it('draws his inner two turns, out to the end of his 13/6-diameter semicircle', () => {
    const spiral = scrolled('serlio', 4).v.spiral!;
    expect(spiral.map(a => a.r / 8)).toEqual([13 / 6, 13 / 6, 3 / 2, 3 / 2, 1, 1, 2 / 3, 2 / 3].map(v => expect.closeTo(v, 9)));
    expect(spiral[0].end - spiral[0].start).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('the Salviati volute', () => {
  const d = 8;
  const arcs = spiralArcs(spec('salviati', 4));

  it('draws eight arcs, sweeping a quarter turn except where a ring meets the next and at the eye', () => {
    expect(arcs).toHaveLength(8);
    const sweeps = arcs.map(a => (a.end - a.start) * 180 / Math.PI);
    sweeps.forEach((s, i) => {
      if ([3, 4].includes(i)) expect(s).not.toBeCloseTo(90, 0);
      else if (i < 7) expect(s).toBeCloseTo(90, 9);
    });
    // the last runs on past a quarter to reach the front of the eye from a centre behind it
    expect(sweeps[7]).toBeGreaterThan(90);
    expect(sweeps[7]).toBeLessThan(100);
    expect(sweeps.reduce((a, b) => a + b)).toBeGreaterThan(720);
  });

  it('steps the radius in by 1/3 and 1/6 of an eye diameter a quarter turn on the inner two rings', () => {
    const steps = arcs.slice(0, 7).map((a, i) => (a.r - arcs[i + 1].r) / d);
    expect([0, 1, 2].map(i => steps[i])).toEqual([1 / 3, 1 / 3, 1 / 3].map(v => expect.closeTo(v, 9)));
    expect([4, 5, 6].map(i => steps[i])).toEqual([1 / 6, 1 / 6, 1 / 6].map(v => expect.closeTo(v, 9)));
  });

  it('finds its centres on the diagonals of the eye\'s inscribed square, the outer four at the middle ring\'s corners', () => {
    for (const a of arcs) expect(Math.abs(Math.abs(a.x) - Math.abs(a.y))).toBeLessThan(1e-9);
    for (const a of arcs.slice(0, 4)) expect(Math.abs(a.x)).toBeCloseTo(4 / 3, 9);
  });
});

// the square the even growth goes round, first corner first: one side on the eye's horizontal
// diameter, centred on the eye's centre, as large as the eye holds
describe('the four point volute', () => {
  const r = 4;
  const radii = [5, 6, 8, 9, 12, 13, 15, 16];
  const arcs = spiralArcs(spec('fourPoint', r, radii));
  const inward = [...arcs].reverse();
  const step = Math.PI / 2;
  const side = 2 * r / Math.sqrt(5);
  const figure = [[-1 / 2, 0], [-1 / 2, -1], [1 / 2, -1], [1 / 2, 0]].map(([x, y]) => [x * side, y * side]);

  it('draws one exact quarter turn per radius, innermost first, about a first centre straight behind the front of the eye', () => {
    expect(inward.map(a => a.r)).toEqual(radii);
    for (const a of arcs) expect(a.end - a.start).toBeCloseTo(step, 9);
    inward.forEach((a, i) => expect(Math.cos(a.start - i * step)).toBeCloseTo(1, 9));
    expect([inward[0].x, inward[0].y]).toEqual([expect.closeTo(r - radii[0], 9), expect.closeTo(0, 9)]);
  });

  it('steps each centre back from the last joint by the growth, so the joint sits on the line between them', () => {
    inward.slice(1).forEach((a, i) => {
      const [jx, jy] = at(inward[i], inward[i].end);
      const grow = a.r - inward[i].r;
      expect(Math.hypot(a.x - inward[i].x, a.y - inward[i].y)).toBeCloseTo(grow, 9);
      expect(Math.hypot(jx - a.x, jy - a.y)).toBeCloseTo(a.r, 9);
    });
  });

  it('grown a side an arc from the first corner, centres every arc on the square\'s corners, the first inside the eye behind its centre', () => {
    const even = spiralArcs(spec('fourPoint', r, Array.from({ length: TO_FRONT }, (_, i) => r + side / 2 + i * side))).reverse();
    even.forEach((a, i) => expect([a.x, a.y]).toEqual(figure[i % 4].map(v => expect.closeTo(v, 9))));
    expect(Math.hypot(even[0].x, even[0].y)).toBeLessThan(r);
    expect(even[0].x).toBeLessThan(0);
    expect(Math.max(...figure.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(r, 9);
  });

  it('draws its eight radii as eight arcs, two turns to the front, and nothing with fewer', () => {
    const spiral = scrolled('fourPoint', r, {}, radii).v.spiral!;
    expect(spiral).toHaveLength(8);
    expect(spiral[0].r).toBe(radii.at(-1));
    expect(spiralArcs(spec('fourPoint', r, radii.slice(0, 7)))).toEqual([]);
    expect(scrolled('fourPoint', r, {}, radii.slice(0, 7)).v.spiral).toBeNull();
  });

  it('carries an arc no wider than the last on about the same centre', () => {
    const [first, second, third] = [...spiralArcs(spec('fourPoint', r, [5, 5, 8, 9, 10, 11, 12, 13]))].reverse();
    expect([second.x, second.y]).toEqual([first.x, first.y]);
    expect(second.r).toBe(first.r);
    expect(second.start).toBeCloseTo(first.end, 9);
    expect(third.r).toBe(8);
  });

  it('draws nothing unless every radius is at least the last', () => {
    for (const bad of [[], [5, 8, 7, 9, 10, 11, 12, 13], [0, 5, 8, 9, 10, 11, 12, 13], [5, NaN, 8, 9, 10, 11, 12, 13]]) {
      expect(spiralArcs(spec('fourPoint', r, bad))).toEqual([]);
    }
  });

  it('guides with the walk of centres alone', () => {
    const guides = voluteConstruction(scrolled('fourPoint', r, {}, radii).v);
    expect(guides).toHaveLength(1);
    expect(guides[0]).toEqual(inward.map(a => expect.objectContaining({ x: expect.closeTo(a.x, 9), y: expect.closeTo(a.y, 9) })));
  });

  it('seeds its fields with Kelly\'s radii, and from them draws his spiral on his centres, whatever the seed', () => {
    for (const seedLength of [r, 1.5 * r]) {
      const seeded = scrolled('fourPoint', r, { seedLength }, []).v.arcRadii;
      expect(seeded).toHaveLength(TO_FRONT);
      const kelly = [...spiralArcs({ ...spec('kelly', r), seedLength })].reverse().slice(0, TO_FRONT);
      const drawn = [...spiralArcs(spec('fourPoint', r, seeded))].reverse();
      drawn.forEach((a, i) => expect([a.x, a.y, a.r, a.start, a.end], `seed ${seedLength}, arc ${i}`)
        .toEqual([kelly[i].x, kelly[i].y, kelly[i].r, kelly[i].start, kelly[i].end].map(v => expect.closeTo(v, 9))));
    }
    expect(scrolled('fourPoint', r, {}, []).v.arcRadii).toEqual([4.5, 5.5, 6.5, 8.5, 9.5, 12.5, 13.5, 17.5]);
  });
});
