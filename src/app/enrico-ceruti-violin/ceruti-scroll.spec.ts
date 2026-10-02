import { flushVolute, layoutBack, layoutFront, layoutVolute, naturalArcRadii, TO_FRONT, VoluteArc, VoluteSpec, VOLUTE_STYLES } from './ceruti-scroll';
import { VoluteStyle } from './ceruti-types';
import { angleWithinSweep, dist, normalizeRadians } from '../helpers/math/simpleGeometry';
import { Pt } from '../models/types';

const at = ({ center, r }: VoluteArc, angle: number) => [center.x + r * Math.cos(angle), center.y + r * Math.sin(angle)];
const EYE_Y = 90;
// the default arc radii unrounded, so they scale exactly with the eye
const arcRadii = (eyeRadius: number, count = TO_FRONT) => Array.from({ length: count }, (_, i) => (Math.SQRT2 + i / 2) * eyeRadius);
const spec = (style: VoluteStyle, eyeRadius: number, radii = arcRadii(eyeRadius)): VoluteSpec =>
  ({ style, eyeRadius, arcRadii: radii, pitch: 2 * eyeRadius });

// flush with the neck's front, the way the panel lays a new volute out
const place = (v: VoluteSpec) => {
  const eyeX = flushVolute(v);
  if (eyeX === null) return null;
  const eye = new Pt(eyeX, EYE_Y);
  const placed = layoutVolute(v, eye);
  return placed && { eye, ...placed };
};
const layout = (style: VoluteStyle, eyeRadius: number) => place(spec(style, eyeRadius));
const sweep = (arcs: VoluteArc[]) => arcs.reduce((sum, a) => sum + a.to - a.from, 0);

const STYLES = Object.keys(VOLUTE_STYLES) as VoluteStyle[];
const HISTORICAL = STYLES.filter(s => !VOLUTE_STYLES[s].custom && s !== 'archimedean');

describe.each(STYLES)('the %s volute', style => {
  const def = VOLUTE_STYLES[style];
  it('draws arcs that scale with the eye radius', () => {
    const small = def.arcs(spec(style, 3));
    const large = def.arcs(spec(style, 6));
    small.forEach((s, i) => {
      expect(large[i].r).toBeCloseTo(2 * s.r, 9);
      expect(large[i].center.x).toBeCloseTo(2 * s.center.x, 9);
      expect(large[i].center.y).toBeCloseTo(2 * s.center.y, 9);
    });
  });

  it('meets each arc to its inner neighbour, tangent, at a point on the line between their centres', () => {
    const arcs = def.arcs(spec(style, 4));
    for (let i = 0; i < arcs.length - 1; i++) {
      const [outer, inner] = [arcs[i], arcs[i + 1]];
      const [x, y] = at(outer, outer.from);
      const [ix, iy] = at(inner, inner.to);
      expect(Math.hypot(x - ix, y - iy), `arcs ${i} and ${i + 1} share no point`).toBeLessThan(1e-9);
      const cross = (x - outer.center.x) * (inner.center.y - outer.center.y) - (y - outer.center.y) * (inner.center.x - outer.center.x);
      expect(Math.abs(cross), `arcs ${i} and ${i + 1} are not tangent`).toBeLessThan(1e-9);
    }
  });

  it('winds outward, every arc at least as wide as the one inside it and turning the same way, for at least two turns', () => {
    const arcs = def.arcs(spec(style, 4));
    for (let i = 0; i < arcs.length - 1; i++) expect(arcs[i].r, `arc ${i}`).toBeGreaterThanOrEqual(arcs[i + 1].r);
    for (const a of arcs) expect(a.to - a.from).toBeGreaterThan(0);
    expect(sweep(arcs) / (2 * Math.PI)).toBeGreaterThanOrEqual(2 - 1e-9);
  });

  // the Archimedean has a pitch at the eye, so its heading there is a little off vertical
  it('leaves the eye at its front, heading up', () => {
    const arcs = def.arcs(spec(style, 4));
    const inner = arcs[arcs.length - 1];
    expect(at(inner, inner.from)).toEqual([expect.closeTo(4, 9), expect.closeTo(0, 9)]);
    expect(Math.cos(inner.from)).toBeGreaterThan(0.95);
  });

  it('draws guides that scale with the eye radius', () => {
    const small = def.guides(spec(style, 3));
    const large = def.guides(spec(style, 6));
    expect(small.length).toBeGreaterThan(0);
    small.forEach((line, i) => line.forEach((p, j) => {
      expect(large[i][j].x).toBeCloseTo(2 * p.x, 9);
      expect(large[i][j].y).toBeCloseTo(2 * p.y, 9);
    }));
  });

  it('ends the spiral at its front heading straight up, flush with the neck, with nothing in front of it', () => {
    const { spiral } = layout(style, 4)!;
    const outer = spiral[0];
    expect(spiral).toHaveLength(def.front);
    expect(at(outer, outer.to)[0]).toBeCloseTo(0, 9);
    expect(Math.sin(outer.to)).toBeCloseTo(0, 9);
    expect(Math.cos(outer.to)).toBeCloseTo(1, 9);
    for (const a of spiral) {
      const right = Math.max(...[a.from, a.to, 0].filter(t => angleWithinSweep(t, a.from, a.to)).map(t => at(a, t)[0]));
      expect(right).toBeLessThanOrEqual(1e-9);
    }
  });

  const tangentAt = (last: VoluteArc, a: VoluteArc, angle: number) => {
    const [dx, dy] = [a.center.x - last.center.x, a.center.y - last.center.y];
    expect(dx * Math.sin(angle) - dy * Math.cos(angle)).toBeCloseTo(0, 9);
  };
  const back = { back: [{ r: 30, end: Math.PI / 2 }, { r: 20, end: Math.PI }, { r: 15, end: 4 }], straight: 6, hollow: { r: 12, end: 0.2 }, nape: 3 };
  const NECK_BACK = 0;

  it('runs S0 to S2 on from the spiral\'s front, each tangent to the last and ending at its own angle', () => {
    const { spiral } = layout(style, 4)!;
    const arcs = layoutBack(spiral, { ...back, straight: NaN }, NECK_BACK).arcs;
    const outer = spiral[0];
    expect(at(arcs[0], arcs[0].from)).toEqual(at(outer, outer.to).map(c => expect.closeTo(c, 9)));
    expect(arcs[0].center.y).toBeCloseTo(outer.center.y, 9);
    expect(arcs.flatMap(a => [a.from, a.to])).toEqual([0, Math.PI / 2, Math.PI / 2, Math.PI, Math.PI, 4]);
    arcs.slice(1).forEach((a, i) => {
      expect(at(a, a.from)).toEqual(at(arcs[i], arcs[i].to).map(c => expect.closeTo(c, 9)));
      tangentAt(arcs[i], a, a.from);
    });
    expect(arcs.map(a => a.r)).toEqual([30, 20, 15]);
  });

  it('runs the straight on along S2\'s heading, then S3 curving back the other way to its end', () => {
    const { spiral } = layout(style, 4)!;
    const { arcs, straight } = layoutBack(spiral, back, NECK_BACK);
    const [s2, s3] = arcs.slice(2);
    const [top, foot] = straight!;
    expect([top.x, top.y]).toEqual(at(s2, 4).map(c => expect.closeTo(c, 9)));
    expect(dist(top, foot)).toBeCloseTo(6, 9);
    expect((foot.x - top.x) * Math.cos(4) + (foot.y - top.y) * Math.sin(4)).toBeCloseTo(0, 9);
    expect(-(foot.x - top.x) * Math.sin(4) + (foot.y - top.y) * Math.cos(4)).toBeCloseTo(6, 9);
    expect([s3.from, s3.to]).toEqual([0.2, 4 - Math.PI]);
    expect(at(s3, s3.to)).toEqual([foot.x, foot.y].map(c => expect.closeTo(c, 9)));
    // curving the other way: S3's centre is on the far side of the line from S2's
    const side = (c: Pt) => (foot.x - top.x) * (c.y - top.y) - (foot.y - top.y) * (c.x - top.x);
    expect(Math.sign(side(s3.center))).toBe(-Math.sign(side(s2.center)));
    expect(s3.r).toBe(12);
  });

  it('puts S3 straight on S2 with no straight between', () => {
    const { spiral } = layout(style, 4)!;
    const { arcs, straight } = layoutBack(spiral, { ...back, straight: 0 }, NECK_BACK);
    const [s2, s3] = arcs.slice(2);
    expect(straight).toBeNull();
    expect(at(s3, s3.to)).toEqual(at(s2, s2.to).map(c => expect.closeTo(c, 9)));
    tangentAt(s2, s3, s2.to);
  });

  it('runs square to the neck from the duck tail, the nape filleting it into the neck\'s back', () => {
    const { spiral } = layout(style, 4)!;
    const s3 = layoutBack(spiral, back, NECK_BACK).arcs[3];
    const [x, y] = at(s3, s3.from);
    const neckBack = x + 10;
    const { square, nape } = layoutBack(spiral, back, neckBack);
    expect(square!.map(p => [p.x, p.y])).toEqual([[x, y], [neckBack - 3, y]].map(p => p.map(c => expect.closeTo(c, 9))));
    expect(nape!.r).toBe(3);
    expect([nape!.from, nape!.to]).toEqual([0, Math.PI / 2]);
    expect(at(nape!, Math.PI / 2)).toEqual([neckBack - 3, y].map(c => expect.closeTo(c, 9)));
    expect(at(nape!, 0)).toEqual([neckBack, y - 3].map(c => expect.closeTo(c, 9)));

    const flush = layoutBack(spiral, back, x + 3);
    expect(flush.square).toBeNull();
    expect(at(flush.nape!, Math.PI / 2)).toEqual([x, y].map(c => expect.closeTo(c, 9)));
    for (const tooNear of [layoutBack(spiral, back, x + 2), layoutBack(spiral, { ...back, nape: 0 }, neckBack)]) {
      expect([tooNear.square, tooNear.nape, tooNear.arcs.length]).toEqual([null, null, 4]);
    }
  });

  // the panel's default proportions, up from a nut 6 mm long to the spiral's bottom
  const NUT_TOP = new Pt(0, 6);
  const front = (spiral: VoluteArc[]) => {
    const rise = Math.min(...spiral.map(a => a.center.y - a.r)) - NUT_TOP.y;
    return { flat: 0.45 * rise, f0: { r: 0.4 * rise, end: Math.PI / 6 }, straight: 0.3 * rise, f1: { r: 0.15 * rise } };
  };

  it('runs the front up from the nut, F0 turning back, the straight on, and F1 curving up into the spiral', () => {
    const { spiral } = layout(style, 4)!;
    const spec = front(spiral);
    const { flat, arcs: [f0, f1], straight } = layoutFront(spiral, spec, NUT_TOP);
    expect(flat!.map(p => [p.x, p.y])).toEqual([[0, 6], [0, 6 + spec.flat]].map(p => p.map(c => expect.closeTo(c, 9))));
    expect(at(f0, 0)).toEqual([0, 6 + spec.flat].map(c => expect.closeTo(c, 9)));
    expect(f0.center.x).toBeLessThan(0);
    expect([f0.from, f0.to, f0.r]).toEqual([0, Math.PI / 6, spec.f0.r]);
    const [top, foot] = straight!;
    expect([top.x, top.y]).toEqual(at(f0, f0.to).map(c => expect.closeTo(c, 9)));
    expect(dist(top, foot)).toBeCloseTo(spec.straight, 9);
    expect(foot.x).toBeLessThan(top.x);
    expect(at(f1, f1.to)).toEqual([foot.x, foot.y].map(c => expect.closeTo(c, 9)));
    expect(f1.to).toBeCloseTo(f0.to + Math.PI, 12);
    expect(Math.sign(f1.center.x - foot.x)).toBe(-Math.sign(f0.center.x - top.x));
    // F1 ends on a drawn arc of the spiral, and crosses none of it before
    const end = at(f1, f1.from);
    const onSpiral = (q: number[], tol: number) => spiral.some(a =>
      Math.abs(Math.hypot(q[0] - a.center.x, q[1] - a.center.y) - a.r) < tol && angleWithinSweep(Math.atan2(q[1] - a.center.y, q[0] - a.center.x), a.from, a.to));
    expect(onSpiral(end, 1e-6)).toBe(true);
    for (let k = 1; k < 50; k++) expect(onSpiral(at(f1, f1.to - (f1.to - f1.from) * k / 50), 1e-3)).toBe(false);
    expect(f1.to - f1.from).toBeGreaterThan(0);
    expect(f1.to - f1.from).toBeLessThan(Math.PI);
  });

  it('draws no F1 that never reaches the spiral, and stops the front at the first part that is no radius or length', () => {
    const { spiral } = layout(style, 4)!;
    const spec = front(spiral);
    expect(layoutFront(spiral, { ...spec, flat: 0.01 }, NUT_TOP).arcs).toHaveLength(1);
    expect(layoutFront([], spec, NUT_TOP).arcs).toHaveLength(1);
    expect(layoutFront(spiral, { ...spec, flat: 0 }, NUT_TOP).flat).toBeNull();
    expect(layoutFront(spiral, { ...spec, flat: -1 }, NUT_TOP)).toEqual({ flat: null, arcs: [], straight: null });
    for (const f0 of [{ r: 0, end: 1 }, { r: 10, end: 0 }, { r: 10, end: 7 }]) {
      expect(layoutFront(spiral, { ...spec, f0 }, NUT_TOP).arcs).toEqual([]);
    }
    expect(layoutFront(spiral, { ...spec, straight: -1 }, NUT_TOP)).toMatchObject({ arcs: [{ r: spec.f0.r }], straight: null });
    expect(layoutFront(spiral, { ...spec, f1: { r: 0 } }, NUT_TOP).arcs).toHaveLength(1);
  });

  it('ends the run at the first part that is no radius, no forward sweep or no length', () => {
    const { spiral } = layout(style, 4)!;
    const [front, , tail] = back.back;
    for (const bad of [{ r: 0, end: Math.PI }, { r: 20, end: Math.PI / 2 }, { r: 20, end: Math.PI / 2 + 7 }, { r: 20, end: NaN }]) {
      expect(layoutBack(spiral, { ...back, back: [front, bad, tail] }, NECK_BACK)).toMatchObject({ arcs: [{ r: 30, to: Math.PI / 2 }], straight: null });
    }
    const unbent = layoutBack(spiral, { ...back, straight: -1 }, NECK_BACK);
    expect([unbent.arcs.length, unbent.straight]).toEqual([3, null]);
    for (const hollow of [{ r: 0, end: 0 }, { r: 12, end: 4 - Math.PI }, { r: 12, end: 4 - 3 * Math.PI - 0.1 }]) {
      const placed = layoutBack(spiral, { ...back, hollow }, NECK_BACK);
      expect([placed.arcs.length, placed.straight === null]).toEqual([3, false]);
    }
  });

  it('carries the guides along with the spiral, rigidly', () => {
    const { eye, spiral, guides } = layout(style, 4)!;
    const drawn = def.guides(spec(style, 4));
    drawn.forEach((line, i) => line.forEach((p, j) => {
      expect(guides[i][j].x).toBeCloseTo(eye.x + p.x, 9);
      expect(guides[i][j].y).toBeCloseTo(eye.y + p.y, 9);
    }));
    const arcs = def.arcs(spec(style, 4));
    const inner = spiral.at(-1)!;
    expect(inner.center.x).toBeCloseTo(eye.x + arcs[arcs.length - 1].center.x, 9);
  });

  it('draws nothing for an eye that is not a positive radius', () => {
    for (const bad of [0, -1, NaN]) expect(layout(style, bad)).toBeNull();
  });

  it('brings the spiral\'s front flush with the neck at any height', () => {
    for (const eyeY of [70, 85]) {
      const v = spec(style, 4);
      const { spiral } = layoutVolute(v, new Pt(flushVolute(v)!, eyeY))!;
      const right = Math.max(...spiral.flatMap(a =>
        [a.from, a.to, 0, 2 * Math.PI, 4 * Math.PI, 6 * Math.PI].filter(t => t === a.from || t === a.to || angleWithinSweep(t, a.from, a.to)).map(t => at(a, t)[0])));
      expect(right, `at ${eyeY}`).toBeCloseTo(0, 9);
    }
  });

  it('goes wherever the eye is put, unchanged', () => {
    const fitted = layout(style, 4)!;
    const eye = new Pt(fitted.eye.x - 5, fitted.eye.y - 7);
    const { spiral, guides } = layoutVolute(spec(style, 4), eye)!;
    spiral.forEach((a, i) => {
      expect(a.center.x).toBeCloseTo(fitted.spiral[i].center.x - 5, 9);
      expect(a.center.y).toBeCloseTo(fitted.spiral[i].center.y - 7, 9);
      expect([a.r, a.from, a.to]).toEqual([fitted.spiral[i].r, fitted.spiral[i].from, fitted.spiral[i].to]);
    });
    guides.forEach((line, i) => line.forEach((p, j) => {
      expect(p.x).toBeCloseTo(fitted.guides[i][j].x - 5, 9);
      expect(p.y).toBeCloseTo(fitted.guides[i][j].y - 7, 9);
    }));
  });

  it('draws nothing for an eye that has no place yet', () => {
    expect(layoutVolute(spec(style, 4), new Pt(NaN, 50))).toBeNull();
    expect(layoutVolute(spec(style, 4), new Pt(-20, NaN))).toBeNull();
  });
});

describe.each(HISTORICAL)('the %s volute, as its author drew it', style => {
  const def = VOLUTE_STYLES[style];

  // Salviati's ring change only comes close to the front by itself, so his last arc is rolled a
  // little on to end there
  it('stops at the front two turns out, the arcs inside it as he drew them', () => {
    const full = def.arcs(spec(style, 4));
    const { spiral } = place(spec(style, 4))!;
    expect(spiral).toHaveLength(def.front);
    expect(full.length).toBeGreaterThan(def.front);
    const inner = full.slice(-spiral.length + 1);
    spiral.slice(1).forEach((a, i) => expect([a.r, a.from, a.to]).toEqual([inner[i].r, inner[i].from, inner[i].to]));
  });

  it('draws the same whatever the arc radii say', () => {
    expect(def.arcs(spec(style, 4, [9, 17, 30]))).toEqual(def.arcs(spec(style, 4)));
  });
});

describe('the Archimedean volute', () => {
  const [r, pitch] = [4, 6];
  const v = { ...spec('archimedean', r), pitch };
  const arcs = VOLUTE_STYLES.archimedean.arcs(v);
  const inward = [...arcs].reverse();

  it('passes through a point every eighth of a turn, the radius growing a pitch a turn from the eye\'s edge', () => {
    expect(arcs).toHaveLength(16);
    inward.forEach((a, k) => {
      const [x, y] = at(a, a.from);
      expect(Math.hypot(x, y)).toBeCloseTo(r + pitch * k / 8, 9);
      expect(Math.cos(Math.atan2(y, x) - k * Math.PI / 4)).toBeCloseTo(1, 9);
    });
  });

  it('stays within a hundredth of the pitch of the true spiral between its points', () => {
    inward.forEach((a, k) => {
      for (const f of [0.25, 0.5, 0.75]) {
        const [x, y] = at(a, a.from + f * (a.to - a.from));
        const turned = normalizeRadians(Math.atan2(y, x) - k * Math.PI / 4 + Math.PI) - Math.PI;
        const spiral = r + pitch * (k / 8 + turned / (2 * Math.PI));
        expect(Math.abs(Math.hypot(x, y) - spiral), `arc ${k} at ${f}`).toBeLessThan(pitch / 100);
      }
    });
  });

  it('draws nothing without a pitch', () => {
    for (const bad of [0, -1, NaN]) expect(VOLUTE_STYLES.archimedean.arcs({ ...v, pitch: bad })).toEqual([]);
  });

  it('rays out to the outermost drawn point on each of the eight lines', () => {
    const rays = VOLUTE_STYLES.archimedean.guides(v);
    expect(rays.map(([, to]) => Math.hypot(to.x, to.y))).toEqual([16, 9, 10, 11, 12, 13, 14, 15].map(k => expect.closeTo(r + pitch * k / 8, 9)));
  });
});

describe('the Kelly volute', () => {
  // his own drawing: a 4 mm eye on a 4 mm column of 1 mm squares
  const v = spec('kelly', 4);
  const inward = [...VOLUTE_STYLES.kelly.arcs(v)].reverse();

  it('draws his nine exact quarter turns, radii as in his drawing', () => {
    expect(inward.map(a => a.r)).toEqual([4.5, 5.5, 6.5, 8.5, 9.5, 12.5, 13.5, 17.5, 18.5].map(r => expect.closeTo(r, 9)));
    for (const a of inward) expect(a.to - a.from).toBeCloseTo(Math.PI / 2, 9);
  });

  it('strikes the first from the left end of the seed\'s middle line, then round the middle squares\' corners and the seed\'s own, lower left round to upper left', () => {
    expect(inward.map(a => [a.center.x, a.center.y])).toEqual(
      [[-0.5, 0], [-0.5, -1], [0.5, -1], [0.5, 1], [-0.5, 1], [-0.5, -2], [0.5, -2], [0.5, 2], [-0.5, 2]].map(([x, y]) => [expect.closeTo(x, 9), expect.closeTo(y, 9)]));
  });

  it('draws two full turns, the eighth ending at its own front where the ninth would carry on', () => {
    const { spiral } = place(v)!;
    expect(spiral).toHaveLength(8);
    expect([spiral[0].r, spiral[0].from, spiral[0].to]).toEqual([inward[7].r, inward[7].from, inward[7].to]);
  });

  it('guides with the seed\'s four squares and the eye\'s two axes', () => {
    const [outline, ...rest] = VOLUTE_STYLES.kelly.guides(v);
    expect(outline.map(p => [p.x, p.y])).toEqual([[-0.5, -2], [0.5, -2], [0.5, 2], [-0.5, 2], [-0.5, -2]]);
    expect(rest).toHaveLength(5);
  });
});

describe('the Goldmann volute', () => {
  const r = 4;
  const arcs = VOLUTE_STYLES.goldmann.arcs(spec('goldmann', r));

  it('draws twelve exact quarter circles, radii 7/6 to 51/6 of the eye radius, out to 9 radii', () => {
    expect(arcs).toHaveLength(12);
    for (const a of arcs) expect(a.to - a.from).toBeCloseTo(Math.PI / 2, 9);
    expect(arcs.map(a => a.r / r)).toEqual([51, 45, 39, 33, 28, 24, 20, 16, 13, 11, 9, 7].map(v => expect.closeTo(v / 6, 9)));
    expect(at(arcs[0], arcs[0].to)).toEqual([expect.closeTo(9 * r, 9), expect.closeTo(0, 9)]);
  });

  it('finds its centres on three squares sharing a side along the eye\'s horizontal diameter, hanging below it', () => {
    const [on, below] = [arcs.filter(a => Math.abs(a.center.y) < 1e-9), arcs.filter(a => a.center.y < -1e-9)];
    expect(on).toHaveLength(6);
    expect(below.map(a => -a.center.y / r).sort()).toEqual([1 / 3, 1 / 3, 2 / 3, 2 / 3, 1, 1].map(v => expect.closeTo(v, 9)));
  });
});

describe('the Serlio volute', () => {
  it('winds out from the eye in his radii, in eye diameters, about centres in sixths of the horizontal diameter', () => {
    const arcs = VOLUTE_STYLES.serlio.arcs(spec('serlio', 4));
    const twice = (v: number[]) => v.flatMap(x => [x, x]);
    expect(arcs.map(a => a.r / 8)).toEqual(twice([4, 3, 13 / 6, 3 / 2, 1, 2 / 3]).map(v => expect.closeTo(v, 9)));
    expect(arcs.map(a => a.center.y)).toEqual(Array(12).fill(expect.closeTo(0, 9)));
    expect(arcs.map(a => a.center.x / 8)).toEqual(twice([3 / 6, -3 / 6, 2 / 6, -2 / 6, 1 / 6, -1 / 6]).map(v => expect.closeTo(v, 9)));
  });

  it('draws his inner two turns, out to the end of his 13/6-diameter semicircle', () => {
    const { spiral } = layout('serlio', 4)!;
    expect(spiral.map(a => a.r / 8)).toEqual([13 / 6, 13 / 6, 3 / 2, 3 / 2, 1, 1, 2 / 3, 2 / 3].map(v => expect.closeTo(v, 9)));
    expect(spiral[0].to - spiral[0].from).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('the Salviati volute', () => {
  const d = 8;
  const arcs = VOLUTE_STYLES.salviati.arcs(spec('salviati', 4));

  it('draws twelve arcs, sweeping a quarter turn except where a ring meets the next and at the eye', () => {
    expect(arcs).toHaveLength(12);
    const sweeps = arcs.map(a => (a.to - a.from) * 180 / Math.PI);
    sweeps.forEach((s, i) => {
      if ([3, 4, 7, 8].includes(i)) expect(s).not.toBeCloseTo(90, 0);
      else if (i < 11) expect(s).toBeCloseTo(90, 9);
    });
    // the last runs on past a quarter to reach the front of the eye from a centre behind it
    expect(sweeps[11]).toBeGreaterThan(90);
    expect(sweeps[11]).toBeLessThan(100);
    expect(sweeps.reduce((a, b) => a + b)).toBeGreaterThan(1080);
  });

  it('steps the radius in by 1/2, 1/3 and 1/6 of an eye diameter a quarter turn on each ring', () => {
    const steps = arcs.slice(0, 11).map((a, i) => (a.r - arcs[i + 1].r) / d);
    expect([0, 1, 2].map(i => steps[i])).toEqual([1 / 2, 1 / 2, 1 / 2].map(v => expect.closeTo(v, 9)));
    expect([4, 5, 6].map(i => steps[i])).toEqual([1 / 3, 1 / 3, 1 / 3].map(v => expect.closeTo(v, 9)));
    expect([8, 9, 10].map(i => steps[i])).toEqual([1 / 6, 1 / 6, 1 / 6].map(v => expect.closeTo(v, 9)));
  });

  it('finds its centres on the diagonals of the eye\'s inscribed square, the outer four at its corners', () => {
    for (const a of arcs) expect(Math.abs(Math.abs(a.center.x) - Math.abs(a.center.y))).toBeLessThan(1e-9);
    for (const a of arcs.slice(0, 4)) expect(Math.abs(a.center.x)).toBeCloseTo(2, 9);
  });
});

// the square the even growth goes round, first corner first: one side on the eye's horizontal
// diameter, centred on the eye's centre, as large as the eye holds
describe('the four point volute', () => {
  const def = VOLUTE_STYLES.fourPoint;
  const r = 4;
  const radii = [5, 6, 8, 9, 12, 13, 15, 16];
  const arcs = def.arcs(spec('fourPoint', r, radii));
  const inward = [...arcs].reverse();
  const step = Math.PI / 2;
  const side = 2 * r / Math.sqrt(5);
  const figure = [[-1 / 2, 0], [-1 / 2, -1], [1 / 2, -1], [1 / 2, 0]].map(([x, y]) => [x * side, y * side]);

  it('draws one exact quarter turn per radius, innermost first, about a first centre straight behind the front of the eye', () => {
    expect(inward.map(a => a.r)).toEqual(radii);
    for (const a of arcs) expect(a.to - a.from).toBeCloseTo(step, 9);
    inward.forEach((a, i) => expect(Math.cos(a.from - i * step)).toBeCloseTo(1, 9));
    expect([inward[0].center.x, inward[0].center.y]).toEqual([expect.closeTo(r - radii[0], 9), expect.closeTo(0, 9)]);
  });

  it('steps each centre back from the last joint by the growth, so the joint sits on the line between them', () => {
    inward.slice(1).forEach((a, i) => {
      const [jx, jy] = at(inward[i], inward[i].to);
      const grow = a.r - inward[i].r;
      expect(Math.hypot(a.center.x - inward[i].center.x, a.center.y - inward[i].center.y)).toBeCloseTo(grow, 9);
      expect(Math.hypot(jx - a.center.x, jy - a.center.y)).toBeCloseTo(a.r, 9);
    });
  });

  it('grown a side an arc from the first corner, centres every arc on the square\'s corners, the first inside the eye behind its centre', () => {
    const even = def.arcs(spec('fourPoint', r, Array.from({ length: 11 }, (_, i) => r + side / 2 + i * side))).reverse();
    even.forEach((a, i) => expect([a.center.x, a.center.y]).toEqual(figure[i % 4].map(v => expect.closeTo(v, 9))));
    expect(Math.hypot(even[0].center.x, even[0].center.y)).toBeLessThan(r);
    expect(even[0].center.x).toBeLessThan(0);
    expect(Math.max(...figure.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(r, 9);
  });

  it('draws its eight radii as eight arcs, two turns to the front, and nothing with fewer', () => {
    const placed = place(spec('fourPoint', r, radii))!;
    expect(placed.spiral).toHaveLength(8);
    expect(placed.spiral[0].r).toBe(radii.at(-1));
    expect(flushVolute(spec('fourPoint', r, radii.slice(0, 7)))).toBeNull();
  });

  it('carries an arc no wider than the last on about the same centre', () => {
    const [first, second, third] = [...def.arcs(spec('fourPoint', r, [5, 5, 8]))].reverse();
    expect(second.center).toEqual(first.center);
    expect(second.r).toBe(first.r);
    expect(second.from).toBeCloseTo(first.to, 9);
    expect(third.r).toBe(8);
  });

  it('draws nothing unless every radius is at least the last', () => {
    for (const bad of [[], [5, 8, 7, 9, 10, 11, 12], [0, 5, 8, 9, 10, 11, 12], [5, NaN, 8, 9, 10, 11, 12]]) {
      expect(def.arcs(spec('fourPoint', r, bad))).toEqual([]);
      expect(flushVolute(spec('fourPoint', r, bad))).toBeNull();
    }
  });

  it('guides with the walk of centres alone', () => {
    const guides = def.guides(spec('fourPoint', r, radii));
    expect(guides).toHaveLength(1);
    expect(guides[0]).toEqual(inward.map(a => expect.objectContaining({ x: expect.closeTo(a.center.x, 9), y: expect.closeTo(a.center.y, 9) })));
  });

  it('seeds its fields with the even growth from the front of the eye back to the square\'s first corner, each arc a side longer', () => {
    const even = naturalArcRadii(r, 11);
    expect(even).toHaveLength(11);
    even.forEach((n, i) => expect(Math.abs(n - (r + side / 2 + i * side))).toBeLessThanOrEqual(0.005));
    expect(def.arcs(spec('fourPoint', r, even))).toHaveLength(11);
    expect(naturalArcRadii(2 * r, 11)[10]).toBeCloseTo(2 * even[10], 1);
  });
});
