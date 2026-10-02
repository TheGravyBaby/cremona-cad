import { flushVolute, layoutVolute, naturalArcRadii, TO_FRONT, VoluteArc, VoluteSpec, VOLUTE_STYLES } from './volute';
import { VoluteStyle } from '../../ceruti-types';
import { angleWithinSweep, normalizeRadians } from '../../../helpers/math/simpleGeometry';
import { Pt } from '../../../models/types';

const at = ({ center, r }: VoluteArc, angle: number) => [center.x + r * Math.cos(angle), center.y + r * Math.sin(angle)];
const EYE_Y = 90;
// the default arc radii unrounded, so they scale exactly with the eye
const arcRadii = (eyeRadius: number, count = TO_FRONT) => Array.from({ length: count }, (_, i) => (Math.SQRT2 + i / 2) * eyeRadius);
const spec = (style: VoluteStyle, eyeRadius: number, radii = arcRadii(eyeRadius)): VoluteSpec =>
  ({ style, eyeRadius, arcRadii: radii, pitch: 2 * eyeRadius, seed: VOLUTE_STYLES[style].seed?.natural(eyeRadius) ?? 0 });
// the whole figure a style draws, out past the front for those its author took further; the four
// point given two whole turns of radii
const whole = (style: VoluteStyle, eyeRadius = 4) => spec(style, eyeRadius, arcRadii(eyeRadius, 8));

// flush with the neck's front, the way the panel lays a new volute out
const place = (v: VoluteSpec) => {
  const eyeX = flushVolute(v);
  if (eyeX === null) return null;
  const eye = new Pt(eyeX, EYE_Y);
  const placed = layoutVolute(v, eye);
  return placed && { eye, ...placed };
};
const layout = (style: VoluteStyle, eyeRadius: number) => place(spec(style, eyeRadius));
// where on the eye the spiral starts: its top, but for Kelly's, which starts a quarter turn earlier
const leaves = (style: VoluteStyle) => style === 'kelly' ? 0 : Math.PI / 2;
const sweep = (arcs: VoluteArc[]) => arcs.reduce((sum, a) => sum + a.to - a.from, 0);

const STYLES = Object.keys(VOLUTE_STYLES) as VoluteStyle[];
const HISTORICAL = STYLES.filter(s => !VOLUTE_STYLES[s].custom && s !== 'archimedean');

describe.each(STYLES)('the %s volute', style => {
  const def = VOLUTE_STYLES[style];
  it('draws arcs that scale with the eye radius', () => {
    const small = def.arcs(whole(style, 3));
    const large = def.arcs(whole(style, 6));
    small.forEach((s, i) => {
      expect(large[i].r).toBeCloseTo(2 * s.r, 9);
      expect(large[i].center.x).toBeCloseTo(2 * s.center.x, 9);
      expect(large[i].center.y).toBeCloseTo(2 * s.center.y, 9);
    });
  });

  it('meets each arc to its inner neighbour, tangent, at a point on the line between their centres', () => {
    const arcs = def.arcs(whole(style));
    for (let i = 0; i < arcs.length - 1; i++) {
      const [outer, inner] = [arcs[i], arcs[i + 1]];
      const [x, y] = at(outer, outer.from);
      const [ix, iy] = at(inner, inner.to);
      expect(Math.hypot(x - ix, y - iy), `arcs ${i} and ${i + 1} share no point`).toBeLessThan(1e-9);
      const cross = (x - outer.center.x) * (inner.center.y - outer.center.y) - (y - outer.center.y) * (inner.center.x - outer.center.x);
      expect(Math.abs(cross), `arcs ${i} and ${i + 1} are not tangent`).toBeLessThan(1e-9);
    }
  });

  it('winds outward, every arc at least as wide as the one inside it and turning the same way, for at least a turn and three quarters', () => {
    const arcs = def.arcs(whole(style));
    for (let i = 0; i < arcs.length - 1; i++) expect(arcs[i].r, `arc ${i}`).toBeGreaterThanOrEqual(arcs[i + 1].r);
    for (const a of arcs) expect(a.to - a.from).toBeGreaterThan(0);
    expect(sweep(arcs) / (2 * Math.PI)).toBeGreaterThanOrEqual(1.75 - 1e-9);
  });

  // Philandrier's curve has a pitch at the eye, so its heading there is 15° off horizontal
  it('leaves the eye where its author did, at its top heading left or for Kelly\'s at its front heading up', () => {
    const arcs = def.arcs(whole(style));
    const inner = arcs[arcs.length - 1];
    expect(at(inner, inner.from)).toEqual([expect.closeTo(4 * Math.cos(leaves(style)), 9), expect.closeTo(4 * Math.sin(leaves(style)), 9)]);
    expect(Math.cos(inner.from - leaves(style))).toBeGreaterThan(0.95);
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

  it('leaves the eye, on its edge, where its author did, once placed', () => {
    const { eye, spiral } = layout(style, 4)!;
    const [x, y] = at(spiral.at(-1)!, spiral.at(-1)!.from);
    expect([x, y]).toEqual([expect.closeTo(eye.x + 4 * Math.cos(leaves(style)), 9), expect.closeTo(eye.y + 4 * Math.sin(leaves(style)), 9)]);
  });

  it('keeps the arcs joined', () => {
    const { spiral } = layout(style, 4)!;
    for (let i = 0; i < spiral.length - 1; i++) {
      const [x, y] = at(spiral[i], spiral[i].from);
      const [ix, iy] = at(spiral[i + 1], spiral[i + 1].to);
      expect(Math.hypot(x - ix, y - iy)).toBeLessThan(1e-9);
    }
  });

  it('carries the guides along with the spiral, rigidly', () => {
    const { eye, spiral, guides } = layout(style, 4)!;
    const drawn = def.guides(spec(style, 4));
    drawn.forEach((line, i) => line.forEach((p, j) => {
      expect(guides[i][j].x).toBeCloseTo(eye.x + p.x, 9);
      expect(guides[i][j].y).toBeCloseTo(eye.y + p.y, 9);
    }));
    const arcs = def.arcs(whole(style));
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

  it('ends above the eye heading left', () => {
    const arcs = def.arcs(whole(style));
    const [, y] = at(arcs[0], arcs[0].to);
    expect(y).toBeGreaterThan(4);
    expect(Math.sin(arcs[0].to)).toBeGreaterThan(0.98);
  });

  // the curves set out by points only come close to the front by
  // themselves, so their last arc is rolled a little on or back to end there
  it('stops at the front a turn and three quarters out, the arcs inside it as he drew them', () => {
    const full = def.arcs(whole(style));
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

describe('the Philandrier volute', () => {
  const d = 8;
  const arcs = VOLUTE_STYLES.philandrier.arcs(whole('philandrier'));
  const [beta, gamma] = [Math.atan2(0.5, 3.5), Math.atan2(4.5, 3.5)];

  it('passes through his 25 points: an eighth of a turn apart, each 3½ tan(β + k(γ−β)/24) out', () => {
    expect(arcs).toHaveLength(24);
    const points = [...arcs.map(a => at(a, a.to)), at(arcs[23], arcs[23].from)].reverse();
    points.forEach(([x, y], k) => {
      expect(Math.hypot(x, y) / d).toBeCloseTo(3.5 * Math.tan(beta + k * (gamma - beta) / 24), 9);
      expect(Math.cos(Math.atan2(y, x) - Math.PI / 2 - k * Math.PI / 4)).toBeCloseTo(1, 9);
    });
    expect(Math.hypot(...points[0]) / d).toBeCloseTo(0.5, 9);
    expect(Math.hypot(...points[24]) / d).toBeCloseTo(4.5, 9);
  });

  it('sweeps each arc close to an eighth of a turn, none bending back', () => {
    for (const a of arcs) expect((a.to - a.from) * 180 / Math.PI).toBeGreaterThan(30);
    for (const a of arcs) expect((a.to - a.from) * 180 / Math.PI).toBeLessThan(60);
  });

  it('rays out to its outermost drawn point on each of the eight lines, the front\'s the last', () => {
    const rays = VOLUTE_STYLES.philandrier.guides(whole('philandrier'));
    expect(rays).toHaveLength(8);
    rays.forEach(([from, to], k) => {
      expect(from).toEqual(expect.objectContaining({ x: 0, y: 0 }));
      expect(Math.cos(Math.atan2(to.y, to.x) - Math.PI / 2 - k * Math.PI / 4)).toBeCloseTo(1, 9);
    });
    expect(Math.hypot(rays[6][1].x, rays[6][1].y) / d).toBeCloseTo(3.5 * Math.tan(beta + 14 * (gamma - beta) / 24), 9);
  });
});

describe('the Archimedean volute', () => {
  const [r, pitch] = [4, 6];
  const v = { ...spec('archimedean', r), pitch };
  const arcs = VOLUTE_STYLES.archimedean.arcs(v);
  const inward = [...arcs].reverse();

  it('passes through a point every eighth of a turn, the radius growing a pitch a turn from the eye\'s edge', () => {
    expect(arcs).toHaveLength(14);
    inward.forEach((a, k) => {
      const [x, y] = at(a, a.from);
      expect(Math.hypot(x, y)).toBeCloseTo(r + pitch * k / 8, 9);
      expect(Math.cos(Math.atan2(y, x) - Math.PI / 2 - k * Math.PI / 4)).toBeCloseTo(1, 9);
    });
  });

  it('stays within a hundredth of the pitch of the true spiral between its points', () => {
    inward.forEach((a, k) => {
      for (const f of [0.25, 0.5, 0.75]) {
        const [x, y] = at(a, a.from + f * (a.to - a.from));
        const turned = normalizeRadians(Math.atan2(y, x) - Math.PI / 2 - k * Math.PI / 4 + Math.PI) - Math.PI;
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
    expect(rays.map(([, to]) => Math.hypot(to.x, to.y))).toEqual([8, 9, 10, 11, 12, 13, 14, 7].map(k => expect.closeTo(r + pitch * k / 8, 9)));
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

  it('sizes the seed on its own, the eye left where it is', () => {
    const wider = [...VOLUTE_STYLES.kelly.arcs({ ...v, seed: 8 })].reverse();
    expect(at(wider[0], wider[0].from)).toEqual([expect.closeTo(4, 9), expect.closeTo(0, 9)]);
    expect(wider.at(-1)!.r).toBeGreaterThan(inward.at(-1)!.r);
  });

  it('draws nothing without a seed', () => {
    for (const bad of [0, -1, NaN]) {
      expect(VOLUTE_STYLES.kelly.arcs({ ...v, seed: bad })).toEqual([]);
      expect(VOLUTE_STYLES.kelly.guides({ ...v, seed: bad })).toEqual([]);
    }
  });

  it('guides with the seed\'s four squares and the eye\'s two axes', () => {
    const [outline, ...rest] = VOLUTE_STYLES.kelly.guides(v);
    expect(outline.map(p => [p.x, p.y])).toEqual([[-0.5, -2], [0.5, -2], [0.5, 2], [-0.5, 2], [-0.5, -2]]);
    expect(rest).toHaveLength(5);
  });
});

describe('the Goldmann volute', () => {
  const r = 4;
  const arcs = VOLUTE_STYLES.goldmann.arcs(whole('goldmann', r));

  it('draws twelve exact quarter circles, radii 7/6 to 51/6 of the eye radius, out to 9 radii', () => {
    expect(arcs).toHaveLength(12);
    for (const a of arcs) expect(a.to - a.from).toBeCloseTo(Math.PI / 2, 9);
    expect(arcs.map(a => a.r / r)).toEqual([51, 45, 39, 33, 28, 24, 20, 16, 13, 11, 9, 7].map(v => expect.closeTo(v / 6, 9)));
    expect(at(arcs[0], arcs[0].to)).toEqual([expect.closeTo(0, 9), expect.closeTo(9 * r, 9)]);
  });

  it('finds its centres on three squares sharing a side along the eye\'s diameter', () => {
    const [left, right] = [arcs.filter(a => Math.abs(a.center.x) < 1e-9), arcs.filter(a => a.center.x > 1e-9)];
    expect(left).toHaveLength(6);
    expect(right.map(a => a.center.x / r).sort()).toEqual([1 / 3, 1 / 3, 2 / 3, 2 / 3, 1, 1].map(v => expect.closeTo(v, 9)));
  });
});

describe('the Serlio volute', () => {
  it('winds out from the eye in his radii, in eye diameters, about centres in sixths of the vertical diameter', () => {
    const arcs = VOLUTE_STYLES.serlio.arcs(whole('serlio'));
    const twice = (v: number[]) => v.flatMap(x => [x, x]);
    expect(arcs.map(a => a.r / 8)).toEqual(twice([4, 3, 13 / 6, 3 / 2, 1, 2 / 3]).map(v => expect.closeTo(v, 9)));
    expect(arcs.map(a => a.center.x)).toEqual(Array(12).fill(expect.closeTo(0, 9)));
    expect(arcs.map(a => a.center.y / 8)).toEqual(twice([3 / 6, -3 / 6, 2 / 6, -2 / 6, 1 / 6, -1 / 6]).map(v => expect.closeTo(v, 9)));
  });

  it('draws his inner turn and three quarters, only the front half of his 13/6-diameter semicircle', () => {
    const { spiral } = layout('serlio', 4)!;
    expect(spiral.map(a => a.r / 8)).toEqual([13 / 6, 3 / 2, 3 / 2, 1, 1, 2 / 3, 2 / 3].map(v => expect.closeTo(v, 9)));
    expect(spiral[0].to - spiral[0].from).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('the Salviati volute', () => {
  const d = 8;
  const arcs = VOLUTE_STYLES.salviati.arcs(whole('salviati'));

  it('draws twelve arcs, sweeping a quarter turn except where a ring meets the next and at the eye', () => {
    expect(arcs).toHaveLength(12);
    const sweeps = arcs.map(a => (a.to - a.from) * 180 / Math.PI);
    sweeps.forEach((s, i) => {
      if ([3, 4, 7, 8].includes(i)) expect(s).not.toBeCloseTo(90, 0);
      else if (i < 11) expect(s).toBeCloseTo(90, 9);
    });
    // the last runs on past a quarter to reach the top of the eye from a centre left of it
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

  it('reaches the front at his seventh arc', () => {
    expect(layout('salviati', 4)!.spiral).toHaveLength(7);
  });
});

// the square the even growth goes round, first corner first: one side on the eye's vertical
// diameter, centred on the eye's centre, as large as the eye holds
describe('the four point volute', () => {
  const def = VOLUTE_STYLES.fourPoint;
  const r = 4;
  const radii = [5, 6, 8, 9, 12, 13, 15];
  const arcs = def.arcs(spec('fourPoint', r, radii));
  const inward = [...arcs].reverse();
  const step = Math.PI / 2;
  const side = 2 * r / Math.sqrt(5);
  const figure = [[0, -1 / 2], [1, -1 / 2], [1, 1 / 2], [0, 1 / 2]].map(([x, y]) => [x * side, y * side]);

  it('draws one exact quarter turn per radius, innermost first, about a first centre straight below the top of the eye', () => {
    expect(inward.map(a => a.r)).toEqual(radii);
    for (const a of arcs) expect(a.to - a.from).toBeCloseTo(step, 9);
    inward.forEach((a, i) => expect(Math.cos(a.from - Math.PI / 2 - i * step)).toBeCloseTo(1, 9));
    expect([inward[0].center.x, inward[0].center.y]).toEqual([expect.closeTo(0, 9), expect.closeTo(r - radii[0], 9)]);
  });

  it('steps each centre back from the last joint by the growth, so the joint sits on the line between them', () => {
    inward.slice(1).forEach((a, i) => {
      const [jx, jy] = at(inward[i], inward[i].to);
      const grow = a.r - inward[i].r;
      expect(Math.hypot(a.center.x - inward[i].center.x, a.center.y - inward[i].center.y)).toBeCloseTo(grow, 9);
      expect(Math.hypot(jx - a.center.x, jy - a.center.y)).toBeCloseTo(a.r, 9);
    });
  });

  it('grown a side an arc from the first corner, centres every arc on the square\'s corners, the first inside the eye below its centre', () => {
    const even = def.arcs(spec('fourPoint', r, Array.from({ length: 11 }, (_, i) => r + side / 2 + i * side))).reverse();
    even.forEach((a, i) => expect([a.center.x, a.center.y]).toEqual(figure[i % 4].map(v => expect.closeTo(v, 9))));
    expect(Math.hypot(even[0].center.x, even[0].center.y)).toBeLessThan(r);
    expect(even[0].center.y).toBeLessThan(0);
    expect(Math.max(...figure.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(r, 9);
  });

  it('draws its seven radii as seven arcs, a turn and three quarters to the front, and nothing with fewer', () => {
    const placed = place(spec('fourPoint', r, radii))!;
    expect(placed.spiral).toHaveLength(7);
    expect(placed.spiral[0].r).toBe(radii.at(-1));
    expect(flushVolute(spec('fourPoint', r, radii.slice(0, 6)))).toBeNull();
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

  it('has no seed, and guides with the walk of centres alone', () => {
    expect(def.seed).toBeUndefined();
    const guides = def.guides(spec('fourPoint', r, radii));
    expect(guides).toHaveLength(1);
    expect(guides[0]).toEqual(inward.map(a => expect.objectContaining({ x: expect.closeTo(a.center.x, 9), y: expect.closeTo(a.center.y, 9) })));
  });

  it('seeds its fields with the even growth from the top of the eye down to the square\'s first corner, each arc a side longer', () => {
    const even = naturalArcRadii(r, 11);
    expect(even).toHaveLength(11);
    even.forEach((n, i) => expect(Math.abs(n - (r + side / 2 + i * side))).toBeLessThanOrEqual(0.005));
    expect(def.arcs(spec('fourPoint', r, even))).toHaveLength(11);
    expect(naturalArcRadii(2 * r, 11)[10]).toBeCloseTo(2 * even[10], 1);
  });

});

const SEEDED = STYLES.filter(s => VOLUTE_STYLES[s].seed);

describe.each(SEEDED)('the %s volute, its seed sized apart from the eye', style => {
  const def = VOLUTE_STYLES[style];
  const v = whole(style);
  const natural = def.seed!.natural(4);

  it('still leaves the eye where it did, the seed only opening or closing the turns', () => {
    const outerReach = (seed: number) => {
      const arcs = def.arcs({ ...v, seed });
      const inner = arcs.at(-1)!;
      expect(at(inner, inner.from)).toEqual([expect.closeTo(4 * Math.cos(leaves(style)), 9), expect.closeTo(4 * Math.sin(leaves(style)), 9)]);
      return Math.hypot(...at(arcs[0], arcs[0].to));
    };
    expect(outerReach(natural * 1.5)).toBeGreaterThan(outerReach(natural));
    expect(outerReach(natural * 0.6)).toBeLessThan(outerReach(natural));
  });

  it('stays joined and winding outward at other seed sizes', () => {
    for (const seed of [natural * 0.5, natural * 2]) {
      const arcs = def.arcs({ ...v, seed });
      expect(arcs, `seed ${seed}`).toHaveLength(def.arcs(v).length);
      arcs.slice(0, -1).forEach((outer, i) => {
        const [x, y] = at(outer, outer.from);
        const [ix, iy] = at(arcs[i + 1], arcs[i + 1].to);
        expect(Math.hypot(x - ix, y - iy), `seed ${seed}, joint ${i}`).toBeLessThan(1e-9);
        expect(outer.r, `seed ${seed}, arc ${i}`).toBeGreaterThanOrEqual(arcs[i + 1].r);
      });
    }
  });

  it('draws the same with the eye and the seed scaled together', () => {
    const big = def.arcs({ ...v, eyeRadius: 8, seed: 2 * natural });
    def.arcs(v).forEach((a, i) => expect([big[i].center.x, big[i].center.y, big[i].r]).toEqual([2 * a.center.x, 2 * a.center.y, 2 * a.r].map(n => expect.closeTo(n, 9))));
  });

  it('draws nothing without a seed', () => {
    for (const bad of [0, -1, NaN]) expect(def.arcs({ ...v, seed: bad }), String(bad)).toEqual([]);
  });
});
