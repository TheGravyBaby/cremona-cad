// @vitest-environment node
import { calculateScroll, calculateScrollWidths, defaultVoluteParams, duckTailRadius, duckTailRoundTop, pegboxCavity, pegboxHipHeight, pegboxWidth, scrollBackStrip, scrollBackWidths, scrollCompassWalk, scrollExtent, scrollPathStretches, scrollFrontWidths, ScrollKey, scrollLines, scrollWidthStations, spiralArcs, TO_FRONT, VoluteSpec, VOLUTE_STYLE_LABELS, voluteConstruction } from './ceruti-scroll';
import { defaultNeckParams, defaultStringSetup } from './ceruti-neck';
import { defaultViolin } from '../../ceruti-fixtures';
import { EnricoCerutiParams, ScrollParams, VoluteStyle } from '../../ceruti-types';
import { angleWithinSweep, dist, normalizeRadians, pointOnCircle } from '../../../helpers/math/simpleGeometry';
import { Arc, Circle, Pt } from '../../../models/types';
import { defineSideScrollPath } from '../outline/ceruti-paths';
import { samplePathToPolyline, splitPathStrings } from '../../../helpers/math/pathMath';

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

const BACK: Partial<ScrollParams> = {
  S0: arc(30, 0, Math.PI / 2), S1: arc(20, 0, Math.PI), S2: arc(15, 0, 4), backStraight: 6, S3: arc(55, 0, 0), nape: arc(3, 0, 0),
};

// the panel's default proportions, up from the top of the nut to the spiral's bottom
const withFront = (p: EnricoCerutiParams) => {
  const v = p.scroll!;
  const rise = Math.min(...v.spiral!.map(a => a.y - a.r)) - p.neck!.nutHeight;
  v.flat = 0.45 * rise;
  v.F0 = arc(0.4 * rise, 0, Math.PI / 6);
  v.frontStraight = 0.3 * rise;
  v.F1 = arc(0.15 * rise, 0, 0);
  return rise;
};

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

  it('runs the front up from the nut, F0 turning back, the straight on, and F1 curving up into the spiral', () => {
    const { p, v } = scrolled(style, 4, BACK);
    const nutTop = p.neck!.nutHeight;
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

  it('brings the spiral\'s front flush with the neck at any height', () => {
    for (const eyeY of [70, 85]) {
      const { v } = scrolled(style, 4, { eye: new Circle(0, eyeY, 4) });
      expect(v.eye.y).toBe(eyeY);
      const right = Math.max(...v.spiral!.flatMap(a =>
        [a.start, a.end, 0, 2 * Math.PI, 4 * Math.PI, 6 * Math.PI].filter(t => t === a.start || t === a.end || angleWithinSweep(t, a.start, a.end)).map(t => at(a, t)[0])));
      expect(Math.abs(right), `at ${eyeY}`).toBeLessThanOrEqual(FLUSH);
    }
  });
});

describe('the back and front off a salviati volute', () => {
  const style: VoluteStyle = 'salviati';
  const tangentAt = (last: Arc, a: Arc, angle: number) => {
    const [dx, dy] = [a.x - last.x, a.y - last.y];
    expect(dx * Math.sin(angle) - dy * Math.cos(angle)).toBeCloseTo(0, 9);
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

  it('runs the straight on along S2\'s heading, then S3 curving back the other way down to the nut', () => {
    const { p, v } = scrolled(style, 4, BACK);
    const [s2, s3] = [v.S2, v.S3];
    const [top, foot] = scrollLines(p).backStraight;
    expect([top.x, top.y]).toEqual(at(s2, 4).map(c => expect.closeTo(c, 9)));
    expect(dist(top, foot)).toBeCloseTo(6, 9);
    expect((foot.x - top.x) * Math.cos(4) + (foot.y - top.y) * Math.sin(4)).toBeCloseTo(0, 9);
    expect(-(foot.x - top.x) * Math.sin(4) + (foot.y - top.y) * Math.cos(4)).toBeCloseTo(6, 9);
    expect(s3.end).toBe(4 - Math.PI);
    expect(at(s3, s3.start)[1]).toBeCloseTo(0, 9);
    expect(at(s3, s3.end)).toEqual([foot.x, foot.y].map(c => expect.closeTo(c, 9)));
    // curving the other way: S3's centre is on the far side of the line from S2's
    const side = (c: Pt) => (foot.x - top.x) * (c.y - top.y) - (foot.y - top.y) * (c.x - top.x);
    expect(Math.sign(side(s3))).toBe(-Math.sign(side(s2)));
    expect(s3.r).toBe(55);
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
    expect(v.S3.end).toBe(4 - Math.PI);
    expect(at(v.S3, v.S3.start)).toEqual([x, y].map(c => expect.closeTo(c, 9)));
  });

  it('fits the nape as one circle through the duck tail, tangent to the neck\'s back, with no straight', () => {
    const { p, v } = scrolled(style, 4, BACK);
    v.napeCircle = true;
    const [x, y] = at(v.S3, v.S3.start);
    const gap = 10;
    p.neck!.thickness = -(x + gap);
    const neckBack = x + gap;
    const fit = (r: number) => {
      v.nape = new Arc(0, 0, r, 0, 0);
      expect(unsolved(p)).toEqual([]);
      expect(v.nape.x).toBeCloseTo(neckBack - r, 9);
      expect(v.nape.start).toBe(0);
      expect(at(v.nape, v.nape.end)).toEqual([x, y].map(c => expect.closeTo(c, 9)));
      expect(dist(...scrollLines(p).square)).toBeCloseTo(0, 9);
    };
    // as wide as the gap: the square line's fillet with no straight, a quarter turn
    fit(gap);
    expect(v.nape.end).toBeCloseTo(Math.PI / 2, 9);
    expect(v.nape.y).toBeCloseTo(y - gap, 9);
    // tighter: rises off the duck tail before coming round, and meets the neck higher
    fit(gap * 0.6);
    expect(v.nape.end).toBeGreaterThan(Math.PI / 2);
    expect(v.nape.y).toBeGreaterThan(y - gap);
    fit(gap / 2);
    expect(v.nape.end).toBeCloseTo(Math.PI, 9);
    expect(v.nape.y).toBeCloseTo(y, 9);
    // wider: meets the duck tail at an angle under a quarter turn, lower on the neck
    fit(gap * 2);
    expect(v.nape.end).toBeLessThan(Math.PI / 2);
    expect(v.nape.y).toBeLessThan(y - gap);
    // too tight to reach the neck's back, or a duck tail forward of it
    v.nape = new Arc(0, 0, gap / 2 - 0.1, 0, 0);
    expect(unsolved(p)).toEqual(['nape']);
    v.nape = new Arc(0, 0, gap, 0, 0);
    p.neck!.thickness = -(x - 1);
    expect(unsolved(p)).toEqual(['nape']);
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
    for (const over of [{ S3: arc(0, 0, 0) }, { hang: NaN }]) {
      expect(back(over)).toEqual(['S3', 'nape']);
      expect(dist(...scrollLines(p).backStraight)).toBeCloseTo(6, 9);
    }
  });

  it('lets a negative hang lift the duck tail above the nut', () => {
    const { p, v } = scrolled(style, 4, BACK);
    v.hang = -1;
    expect(unsolved(p)).toEqual([]);
    expect(pointOnCircle(v.S3, v.S3.start).y).toBeCloseTo(1, 9);
  });

  it('draws nothing for an eye that is not a positive radius', () => {
    for (const bad of [0, -1, NaN]) {
      const { v, failures } = scrolled(style, bad);
      expect(v.spiral).toBeNull();
      expect(failures[0].unsolved).toContain('spiral');
      expect(failures[0].unsolved).toContain('F1');
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

  it('sets the front\'s widths at the nut, the hips and the throat, and the back\'s at the duck tail, the poll, the crown, each turn down to the last, and the eye', () => {
    const p = widths();
    const v = p.scroll!;
    const stations = scrollWidthStations(p);
    expect(stations.map(st => st.key)).toEqual(['nut', 'hip', 'throat', 'duckTail', 'foot', 'backHip', 'poll', 'crown', 'turn1Bottom', 'turn2Top', 'turn2Bottom', 'eye']);
    const [nut, hip, throat, duckTail, foot, backHip, poll, crown, bottom1, top2, bottom2, eye] = stations.map(st => st.at);
    expect(backHip).toEqual(foot);
    expect(hip.y).toBeCloseTo(pegboxHipHeight(p), 6);
    expect(stations[0].width).toBeCloseTo(p.neck!.nutWidth, 6);
    expect(stations[1].width).toBeCloseTo(v.widths.hip, 6);
    expect([nut.x, nut.y]).toEqual([0, p.neck!.nutHeight]);
    expect([throat.x, throat.y]).toEqual(at(v.F1, v.F1.end));
    const back = scrollBackWidths(p);
    // the round's centre, so a circle of the duck tail's width about it is the round below
    expect([duckTail.x, duckTail.y]).toEqual([back[0].z, back[0].y].map(c => expect.closeTo(c, 9)));
    expect(foot).toEqual(duckTail);
    expect(foot.y).toBeCloseTo(at(v.S3, v.S3.start)[1] + v.widths.duckTail / 2, 9);
    expect(back[0].x).toBeCloseTo(v.widths.foot / 2, 9);
    // the poll is the back's furthest reach, and the back is level with the neck there
    expect(poll.x).toBeCloseTo(-scrollExtent(v).width, 6);
    expect(poll.y).toBeGreaterThan(duckTail.y);
    expect(poll.y).toBeLessThan(crown.y);
    expect(crown.y).toBeCloseTo(Math.max(...back.map(pt => pt.y)), 9);
    expect(bottom1.y).toBeLessThan(bottom2.y);
    expect(bottom2.y).toBeLessThan(eye.y);
    expect(eye.y).toBeLessThan(top2.y);
    expect([eye.x, eye.y]).toEqual([v.eye.x, v.eye.y]);
    expect(top2.y).toBeLessThan(crown.y);

    // the crown and each turn are points of the contour, level there, and as wide as their fields say
    for (const st of stations.slice(7, -1)) {
      const k = back.findIndex(pt => Math.hypot(pt.z - st.at.x, pt.y - st.at.y) < 1e-9);
      expect(k).toBeGreaterThan(0);
      expect(back[k].x).toBeCloseTo(st.width / 2, 9);
      expect((back[k].y - back[k - 1].y) * (back[k + 1].y - back[k].y)).toBeLessThan(0);
    }

    // the last turn is as wide as the eye from its top on in
    const after = back.findIndex(pt => pt.y === bottom2.y);
    const lastTop = back.reduce((top, pt, k) => k > after && pt.y > back[top].y ? k : top, back.length - 1);
    expect(lastTop).toBeGreaterThan(after);
    expect(lastTop).toBeLessThan(back.length - 1);
    for (const pt of back.slice(lastTop)) expect(pt.x).toBeCloseTo(v.widths.eye / 2, 9);
  });

  it('cuts the path at the crown and the turns into stretches that only rise or only fall', () => {
    const p = widths();
    const on = scrollPathStretches(p);
    const stretches = [on.back, on.turn1Front, on.turn2Back, on.turn2Front, on.turn3Back, on.turn3Front];
    stretches.forEach((pts, i) => {
      const rising = i % 2 === 0;
      // the last runs level into the eye's front
      const steps = pts.slice(1).map((pt, k) => pt.y - pts[k].y);
      expect(steps.every(step => rising ? step > -1e-9 : step < 1e-9)).toBe(true);
      if (i > 0) expect(pts[0]).toEqual(stretches[i - 1].at(-1));
    });
    expect(scrollBackWidths(p)).toEqual([on.back, ...stretches.slice(1).map(pts => pts.slice(1))].flat());
    for (const pt of on.turn3Front) expect(pt.x).toBeCloseTo(p.scroll!.widths.eye / 2, 9);
  });

  it('runs the front from the nut up to where F1 meets the spiral, out to the hips, tapering to the throat\'s width at the straight\'s foot and on past it at the same slope', () => {
    const p = widths();
    const front = scrollFrontWidths(p);
    expect(front[0].z).toBeCloseTo(0, 9);
    expect(front[0].y).toBeCloseTo(p.neck!.nutHeight, 9);
    expect(front[0].x).toBeCloseTo(p.neck!.nutWidth / 2, 9);
    expect(pegboxWidth(p, pegboxHipHeight(p))).toBeCloseTo(p.scroll!.widths.hip, 9);
    expect(Math.max(...front.map(pt => pt.x))).toBeLessThanOrEqual(p.scroll!.widths.hip / 2);
    const [x, y] = at(p.scroll!.F1, p.scroll!.F1.start);
    expect(front.at(-1)!.z).toBeCloseTo(x, 6);
    expect(front.at(-1)!.y).toBeCloseTo(y, 6);
    const throat = at(p.scroll!.F1, p.scroll!.F1.end)[1];
    expect(pegboxWidth(p, throat)).toBeCloseTo(p.scroll!.widths.throat, 9);
    const slope = (pegboxWidth(p, throat) - pegboxWidth(p, throat - 1)) / 1;
    expect(slope).toBeLessThan(0);
    expect(pegboxWidth(p, throat + 2)).toBeCloseTo(p.scroll!.widths.throat + 2 * slope, 9);
    expect(front.at(-1)!.x).toBeLessThan(p.scroll!.widths.throat / 2);
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
    const fields = () => ({ widths: { ...v.widths }, pegbox: { ...v.pegbox } });
    const seeded = fields();
    for (const key of Object.keys(seeded)) delete (v as any)[key];
    calculateScrollWidths(p);
    expect(fields()).toEqual(seeded);
  });

  it('brings the duck tail down to its hang below the nut\'s lower edge, whatever start angle S3 was saved with', () => {
    const { p, v } = solved();
    for (const hang of [0, 8]) for (const start of [-0.4, 0.3, -2]) {
      v.hang = hang;
      v.S3 = new Arc(v.S3.x, v.S3.y, v.S3.r, start, v.S3.end);
      expect(calculateScroll(p)).toEqual([]);
      expect(at(v.S3, v.S3.start)[1]).toBeCloseTo(-hang, 9);
      expect(v.S3.end - v.S3.start).toBeGreaterThan(0);
      expect(v.S3.end - v.S3.start).toBeLessThanOrEqual(2 * Math.PI);
    }
  });

  it('reports an S3 that never comes down to the hang', () => {
    const { p, v } = solved();
    v.S3 = new Arc(v.S3.x, v.S3.y, 0.5, v.S3.start, v.S3.end);
    expect(unsolved(p)).toEqual(['S3', 'nape']);
  });

  it('keeps the front down to the nut however far the duck tail hangs below it', () => {
    const { p, v } = solved();
    for (const hang of [0, 8]) {
      v.hang = hang;
      expect(calculateScroll(p)).toEqual([]);
      expect(scrollFrontWidths(p)[0].y).toBeCloseTo(p.neck!.nutHeight, 6);
    }
    expect(v.nape.y + v.nape.r).toBeLessThan(0);
  });

  it('starts the path on top of a duck tail round as wide as the back\'s own duck tail width, whatever the neck and the hips', () => {
    const { p, v } = solved();
    const startsOnRound = (radius: number) => {
      const duckTail = at(v.S3, v.S3.start)[1];
      expect(duckTailRadius(p)).toBeCloseTo(radius, 9);
      expect(duckTailRoundTop(p)).toBeCloseTo(duckTail + radius, 9);
      expect(scrollBackWidths(p)[0].y).toBeCloseTo(duckTailRoundTop(p), 6);
      expect(scrollBackWidths(p)[0].x).toBeCloseTo(radius, 9);
    };
    v.widths.duckTail = v.widths.foot = v.widths.backHip = 20;
    v.widths.hip = 30;
    p.neck!.topWidth = 34;
    startsOnRound(10);
    v.widths.duckTail = v.widths.foot = v.widths.backHip = 30;
    p.neck!.topWidth = 20;
    startsOnRound(15);
  });

  it('seeds the hips on the round\'s top, measures them up from the nut\'s top, keeps them where they are put after, and never lets them below the duck tail', () => {
    const { p, v } = solved();
    const { nutHeight } = p.neck!;
    expect(pegboxHipHeight(p)).toBeCloseTo(duckTailRoundTop(p), 9);
    v.widths.duckTail -= 4;
    calculateScrollWidths(p);
    expect(duckTailRoundTop(p)).toBeLessThan(pegboxHipHeight(p));
    v.hipHeight = 3;
    calculateScrollWidths(p);
    expect(pegboxHipHeight(p)).toBe(nutHeight + 3);
    const duckTail = at(v.S3, v.S3.start)[1];
    v.hipHeight = duckTail - nutHeight - 5;
    calculateScrollWidths(p);
    expect(pegboxHipHeight(p)).toBeCloseTo(duckTail, 9);
    delete (v as any).hipHeight;
    calculateScrollWidths(p);
    expect(pegboxHipHeight(p)).toBeCloseTo(duckTailRoundTop(p), 9);
  });

  it('has no hips at 0, the nut\'s width tapering from its top, and holds the hips\' width down to the foot when they sit below the nut\'s top', () => {
    const { p, v } = solved();
    const { nutHeight } = p.neck!;
    v.widths.hip = 46;
    p.neck!.nutWidth = 42;
    v.hipHeight = 0;
    for (const y of [0, nutHeight / 2, nutHeight]) expect(pegboxWidth(p, y)).toBe(42);
    expect(pegboxWidth(p, nutHeight + 1)).toBeLessThan(42);
    v.hipHeight = -1;
    for (const y of [0, (nutHeight - 1) / 2, nutHeight - 1]) expect(pegboxWidth(p, y)).toBe(46);
    expect(pegboxWidth(p, nutHeight)).toBeLessThan(46);
    // hips on the foot taper from there, so the nut's top is already a touch narrower
    v.hipHeight = -nutHeight;
    expect(pegboxWidth(p, 0)).toBe(46);
    expect(pegboxWidth(p, nutHeight)).toBeLessThan(46);
    expect(pegboxWidth(p, nutHeight)).toBeGreaterThan(42);
    v.hipHeight = 4;
    expect(pegboxWidth(p, nutHeight)).toBe(42);
    expect(pegboxWidth(p, nutHeight + 2)).toBe(44);
  });

  it('hangs a cello\'s duck tail below the nut, the round\'s top landing on the pegbox\'s foot when the hang is the round\'s radius', () => {
    const { p, v } = solved();
    v.widths.hip = 46;
    v.widths.duckTail = 33;
    v.hang = 8;
    expect(calculateScroll(p)).toEqual([]);
    expect(at(v.S3, v.S3.start)[1]).toBeCloseTo(-8, 9);
    expect(duckTailRadius(p)).toBeCloseTo(16.5, 9);
    expect(duckTailRoundTop(p)).toBeCloseTo(8.5, 9);
    v.hang = 16.5;
    expect(calculateScroll(p)).toEqual([]);
    expect(duckTailRoundTop(p)).toBeCloseTo(0, 6);
  });

  it('runs the front out from the nut to hips 34 wide at the round\'s top, then tapers it by height to the throat', () => {
    const { p, v } = solved();
    v.widths.hip = 34;
    const { nutWidth, nutHeight } = p.neck!;
    const width = v.widths.hip;
    const throat = at(v.F1, v.F1.end)[1];
    const from = pegboxHipHeight(p);
    expect(from).toBeGreaterThan(nutHeight);
    const between = (a: number, b: number, t: number) => a + (b - a) * Math.min(Math.max(t, 0), 1);
    // the taper past the throat carries on at the same slope
    const taper = (y: number) => (y <= nutHeight ? nutWidth : y <= from ? between(nutWidth, width, (y - nutHeight) / (from - nutHeight)) : width + (v.widths.throat - width) * (y - from) / (throat - from)) / 2;
    for (const pt of scrollFrontWidths(p)) expect(pt.x).toBeCloseTo(taper(pt.y), 9);
    expect(scrollFrontWidths(p).some(pt => pt.y < from && pt.x !== nutWidth / 2)).toBe(true);
  });

  it('runs the back out from its foot on a straight slope by height to the poll, and on from there on the curve, the front untouched', () => {
    const { p, v } = solved();
    const front = scrollFrontWidths(p).map(pt => pt.x);
    v.widths.duckTail = 18;
    v.widths.foot = 20;
    v.widths.poll = 28;
    calculateScrollWidths(p);
    const back = scrollBackWidths(p);
    const poll = scrollWidthStations(p).find(st => st.key === 'poll')!.at;
    const leaves = back.findIndex(pt => pt.y > poll.y);
    expect(leaves).toBeGreaterThan(10);
    const start = back[0].y;
    for (const pt of back.slice(0, leaves)) expect(pt.x).toBeCloseTo((20 + 8 * (pt.y - start) / (poll.y - start)) / 2, 9);
    expect(back.some(pt => pt.y > poll.y && pt.x < v.widths.crown / 2 + 1e-6)).toBe(true);
    expect(scrollFrontWidths(p).map(pt => pt.x)).toEqual(front);
  });

  it('hollows the pegbox from the nut\'s top to a wall square to the neck at the end of the front\'s straight, its floor the back carried in by its thickness', () => {
    const { p, v } = solved();
    const cavity = pegboxCavity(p)!;
    expect([cavity[0].x, cavity[0].y]).toEqual([0, p.neck!.nutHeight]);
    const frontEnd = scrollLines(p).frontStraight[1];
    expect([cavity.at(-1)!.x, cavity.at(-1)!.y]).toEqual([frontEnd.x, frontEnd.y]);
    // the wall under the nut drops back and toward the scroll
    expect(cavity[1].x).toBeLessThan(0);
    expect(cavity[1].y).toBeGreaterThan(cavity[0].y);
    expect(cavity.at(-2)!.y).toBeCloseTo(frontEnd.y, 9);
    expect(cavity.at(-2)!.x).toBeLessThan(frontEnd.x);

    // the path starts at the round's top, so the duck tail below it is sampled off S3 itself
    const back = scrollBackWidths(p).map(b => [b.z, b.y]);
    const duckTail = Array.from({ length: 65 }, (_, i) => at(v.S3, v.S3.start + (v.S3.end - v.S3.start) * i / 64));
    const toBack = (pt: Pt) => Math.min(...[...duckTail, ...back].map(([x, y]) => Math.hypot(pt.x - x, pt.y - y)));
    const floor = cavity.slice(2, -2);
    expect(floor.length).toBeGreaterThan(50);
    for (const pt of floor) expect(toBack(pt)).toBeCloseTo(v.pegbox.wall, 1);

    v.pegbox.wall = 200;
    expect(pegboxCavity(p)).toBeNull();
  });

  it('holds the foot to at least the round, the crown to the poll\'s width, and each turn to at least the one before', () => {
    const { p, v } = solved();
    Object.assign(v.widths, { hip: 26, throat: 18, duckTail: 24, foot: 22, backHip: 24, poll: 20, crown: 22, turn1Bottom: 15, turn2Top: 30, turn2Bottom: 28, eye: 10 });
    calculateScrollWidths(p);
    expect(v.widths).toEqual({ hip: 26, throat: 18, duckTail: 24, foot: 24, backHip: 24, poll: 20, crown: 20, turn1Bottom: 20, turn2Top: 30, turn2Bottom: 30, eye: 30 });
    const settled = { ...v.widths };
    calculateScrollWidths(p);
    expect(v.widths).toEqual(settled);
  });

  it('turns the back\'s slope at a hip measured up from the nut\'s top, none at 0 or on the round, and runs parallel up to a hip as wide as the foot', () => {
    const { p, v } = solved();
    v.widths.duckTail = v.widths.foot = 20;
    v.widths.backHip = 28;
    v.widths.poll = 24;
    calculateScrollWidths(p);
    const { nutHeight } = p.neck!;
    const station = (key: string) => scrollWidthStations(p).find(st => st.key === key)!.at;
    const start = scrollBackWidths(p)[0].y;
    const pollY = station('poll').y;
    expect(start).toBeGreaterThan(nutHeight);
    // none: one slope from the foot to the poll, whatever the hip's width
    const oneSlope = () => {
      for (const pt of scrollPathStretches(p).back.filter(pt => pt.y <= pollY)) expect(pt.x).toBeCloseTo((20 + 4 * (pt.y - start) / (pollY - start)) / 2, 9);
      expect(station('backHip').y).toBeCloseTo(start, 9);
    };
    for (const none of [0, -3, (start - nutHeight) / 2]) {
      v.backHipHeight = none;
      oneSlope();
    }
    // past the poll it is the poll, and the field keeps what was typed
    v.backHipHeight = pollY - nutHeight + 5;
    calculateScrollWidths(p);
    expect(station('backHip').y).toBeCloseTo(pollY, 6);
    expect(v.backHipHeight).toBeCloseTo(pollY - nutHeight + 5, 9);
    const hipY = (start + pollY) / 2;
    v.backHipHeight = hipY - nutHeight;
    calculateScrollWidths(p);
    expect(station('backHip').y).toBeCloseTo(hipY, 6);
    // the back's own stretch, since the turns come back down through these heights
    const back = scrollPathStretches(p).back;
    for (const pt of back.filter(pt => pt.y <= hipY)) expect(pt.x).toBeCloseTo((20 + 8 * (pt.y - start) / (hipY - start)) / 2, 9);
    for (const pt of back.filter(pt => pt.y > hipY && pt.y <= pollY)) expect(pt.x).toBeCloseTo((28 - 4 * (pt.y - hipY) / (pollY - hipY)) / 2, 9);
    v.widths.backHip = 20;
    for (const pt of scrollPathStretches(p).back.filter(pt => pt.y <= hipY)) expect(pt.x).toBeCloseTo(10, 9);
  });

  it('unrolls the back into a strip, closed to a point at the duck tail and mirrored about its centreline, up to the second turn\'s bottom', () => {
    const { p, v } = solved();
    const { outline, length } = scrollBackStrip(p);
    expect(outline[0].x).toBeCloseTo(0, 6);
    expect(outline[0].y).toBeCloseTo(0, 9);
    for (let k = 0; k < outline.length / 2; k++) {
      const [right, left] = [outline[k], outline[outline.length - 1 - k]];
      expect(left.x).toBeCloseTo(-right.x, 9);
      expect(left.y).toBeCloseTo(right.y, 9);
    }
    const right = outline.slice(0, outline.length / 2);
    for (let k = 1; k < right.length; k++) expect(right[k].y).toBeGreaterThanOrEqual(right[k - 1].y - 1e-9);
    expect(right.at(-1)!.y).toBeCloseTo(length, 9);
    expect(right.at(-1)!.x).toBeCloseTo(v.widths.turn2Bottom / 2, 6);

    // up the strip is distance along the side profile: the round's top sits S3's arc from the duck
    // tail above the strip's end, as wide as the back's foot, and below it the strip is the round
    const roundTop = duckTailRoundTop(p);
    let arc = 0;
    for (let a = v.S3.start; at(v.S3, a)[1] < roundTop; a += 1e-5) arc += v.S3.r * 1e-5;
    v.widths.foot = v.widths.duckTail + 6;
    const footed = scrollBackStrip(p).outline;
    const atTop = footed.filter(pt => pt.x > 0 && Math.abs(pt.y - arc) < 1e-2).map(pt => pt.x);
    expect(Math.max(...atTop)).toBeCloseTo(v.widths.foot / 2, 2);
    const round = footed.slice(0, footed.length / 2).filter(pt => pt.y < arc - 1e-2);
    expect(round.length).toBeGreaterThan(10);
    for (let k = 1; k < round.length; k++) expect(round[k].x).toBeGreaterThanOrEqual(round[k - 1].x - 1e-9);
    expect(Math.max(...round.map(pt => pt.x))).toBeLessThanOrEqual(duckTailRadius(p) + 1e-9);

    // a wider poll widens the strip about it and leaves the round alone: only widths change, so the
    // strip is sampled at the same places
    const before = scrollBackStrip(p).outline;
    v.widths.poll += 6;
    const after = scrollBackStrip(p).outline;
    expect(after).toHaveLength(before.length);
    expect(after.some((pt, k) => Math.abs(pt.x) > Math.abs(before[k].x) + 1)).toBe(true);
    after.forEach((pt, k) => { if (pt.y < arc - 1e-2) expect(pt.x).toBeCloseTo(before[k].x, 9); });
  });

  it('sets out a compass walk: the duck tail, then the poll, then equal compass steps landing on the second turn\'s bottom, each station the straight distance from the last along the spine', () => {
    const { p, v } = solved();
    const station = (key: string) => scrollWidthStations(p).find(st => st.key === key)!;
    const { stations, length, step, volute } = scrollCompassWalk(p, 12);
    expect(stations[0].along).toBe(0);
    expect(stations[0].half).toBeCloseTo(v.widths.duckTail / 2, 9);
    expect([stations[0].at.x, stations[0].at.y]).toEqual([station('duckTail').at.x, station('duckTail').at.y].map(c => expect.closeTo(c, 9)));
    // a violin has no foot of its own and no hip, so the poll comes next
    expect([stations[1].at.x, stations[1].at.y]).toEqual([station('poll').at.x, station('poll').at.y].map(c => expect.closeTo(c, 6)));
    expect(stations[1].half).toBeCloseTo(v.widths.poll / 2, 6);
    // along the spine each sits the straight distance from the last, the twelve steps from the poll all the same
    expect(stations).toHaveLength(14);
    for (let k = 1; k < stations.length; k++) {
      expect(stations[k].along - stations[k - 1].along).toBeCloseTo(dist(stations[k].at, stations[k - 1].at), 9);
    }
    for (let k = 2; k < stations.length; k++) expect(dist(stations[k].at, stations[k - 1].at)).toBeCloseTo(step, 6);
    expect(stations.at(-1)!.along).toBeCloseTo(length, 9);
    // the walk ends at the second turn's bottom, as wide as it
    expect(stations.at(-1)!.half).toBeCloseTo(v.widths.turn2Bottom / 2, 6);
    expect(stations.at(-1)!.at.y).toBeCloseTo(station('turn2Bottom').at.y, 6);
    // every station's width is one the back has, so between the narrowest and the widest
    for (const st of stations) {
      expect(st.half).toBeGreaterThanOrEqual(v.widths.crown / 2 - 1e-9);
      expect(st.half).toBeLessThanOrEqual(Math.max(v.widths.turn2Bottom, v.widths.poll, v.widths.foot) / 2 + 1e-9);
    }
    // the stretch divided is the path's own length from the poll, which the chords cut short of: the
    // more steps the less so, a fine walk's chords all but summing to it
    expect(volute).toBeGreaterThan(dist(station('poll').at, station('turn2Bottom').at));
    expect(length - stations[1].along).toBeLessThan(volute);
    expect(volute).toBeGreaterThan(100);
    const fine = scrollCompassWalk(p, 200);
    expect(fine.stations).toHaveLength(202);
    expect(fine.length - fine.stations[1].along).toBeCloseTo(volute, 0);
    // more steps, each shorter; too few and a step spans a bend, so the last comes up short of the
    // rest rather than any arc struck across the turns
    let before = Infinity;
    for (const n of [4, 6, 8, 10, 16, 24]) {
      const walk = scrollCompassWalk(p, n);
      expect(walk.stations).toHaveLength(n + 2);
      expect(walk.step).toBeLessThan(before);
      before = walk.step;
      const chords = walk.stations.slice(2).map((st, k) => dist(st.at, walk.stations[k + 1].at));
      for (const chord of chords.slice(0, -1)) expect(chord).toBeCloseTo(walk.step, 6);
      expect(chords.at(-1)!).toBeLessThanOrEqual(walk.step + 1e-6);
      expect(walk.volute).toBeCloseTo(volute, 9);
    }
    expect(scrollCompassWalk(p, 1).stations).toHaveLength(3);
    // the count is the scroll's own unless given, rounded up from nothing
    expect(scrollCompassWalk(p).stations).toHaveLength(v.compassSteps + 2);
    v.compassSteps = NaN;
    calculateScrollWidths(p);
    expect(v.compassSteps).toBe(10);
    v.compassSteps = 0.4;
    calculateScrollWidths(p);
    expect(v.compassSteps).toBe(1);

    // a wider foot rings the duck tail, and a hip takes a station of its own
    v.widths.foot = v.widths.duckTail + 6;
    v.widths.backHip = v.widths.foot;
    v.backHipHeight = (station('duckTail').at.y + station('poll').at.y) / 2 - p.neck!.nutHeight;
    calculateScrollWidths(p);
    const celloed = scrollCompassWalk(p, 12).stations;
    expect(celloed[1].along).toBe(0);
    expect(celloed[1].half).toBeCloseTo(v.widths.foot / 2, 9);
    expect(celloed[2].at.y).toBeCloseTo(station('backHip').at.y, 6);
    expect(celloed[2].half).toBeCloseTo(v.widths.backHip / 2, 6);
    expect(celloed[3].at.y).toBeCloseTo(station('poll').at.y, 6);
    expect(celloed).toHaveLength(16);
  });

  it('leaves the slope for the curve without a step or a corner', () => {
    const { p, v } = solved();
    v.widths.duckTail = v.widths.foot = v.widths.backHip = 20;
    calculateScrollWidths(p);
    const poll = scrollWidthStations(p).find(st => st.key === 'poll')!.at;
    const back = scrollBackWidths(p);
    const leaves = back.findIndex(pt => pt.y > poll.y);
    const along = (k: number) => Math.hypot(back[k].z - back[k - 1].z, back[k].y - back[k - 1].y);
    const slope = (k: number) => (back[k].x - back[k - 1].x) / along(k);
    // a millimetre either side, so the curve's own bend is in the difference
    expect(slope(leaves + 1)).toBeCloseTo(slope(leaves - 1), 1);
    for (let k = 1; k < back.length; k++) expect(Math.abs(back[k].x - back[k - 1].x)).toBeLessThan(0.5);
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
