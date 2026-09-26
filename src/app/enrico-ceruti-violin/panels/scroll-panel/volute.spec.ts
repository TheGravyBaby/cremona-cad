import { fitVolute, layoutVolute, naturalArcRadii, pointArcCount, pointTurns, setTurnRadius, VoluteArc, VoluteSpec, VOLUTE_STYLES } from './volute';
import { VoluteStyle } from '../../ceruti-types';
import { angleWithinSweep } from '../../../helpers/math/simpleGeometry';
import { Pt } from '../../../models/types';

const at = ({ center, r }: VoluteArc, angle: number) => [center.x + r * Math.cos(angle), center.y + r * Math.sin(angle)];
const [LENGTH, DEPTH] = [110, 50];
// the default arc radii unrounded, so they scale exactly with the eye
const arcRadii = (eyeRadius: number) => Array.from({ length: 12 }, (_, i) => (Math.SQRT2 + i / 2) * eyeRadius);
const spec = (style: VoluteStyle, eyeRadius: number, radii = arcRadii(eyeRadius)): VoluteSpec => ({ style, eyeRadius, arcRadii: radii });

// fitted to the box's front at the fit's own height, the way the panel lays it out with the fit
// on and Eye Y untouched
const layout = (style: VoluteStyle, eyeRadius: number, depth = DEPTH) => {
  const v = spec(style, eyeRadius);
  const eye = fitVolute(v, LENGTH);
  if (!eye) return null;
  const placed = layoutVolute(v, eye, LENGTH, depth);
  return placed && { eye, ...placed };
};
const sweep = (arcs: VoluteArc[]) => arcs.reduce((sum, a) => sum + a.to - a.from, 0);

const STYLES = Object.keys(VOLUTE_STYLES) as VoluteStyle[];
const HISTORICAL = STYLES.filter(s => !VOLUTE_STYLES[s].points);

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

  it('winds outward, every arc wider than the one inside it and turning the same way, for at least two turns', () => {
    const arcs = def.arcs(spec(style, 4));
    for (let i = 0; i < arcs.length - 1; i++) expect(arcs[i].r, `arc ${i}`).toBeGreaterThan(arcs[i + 1].r);
    for (const a of arcs) expect(a.to - a.from).toBeGreaterThan(0);
    expect(sweep(arcs) / (2 * Math.PI)).toBeGreaterThanOrEqual(2 - 1e-9);
  });

  // Philandrier's curve has a pitch at the eye, so its heading there is 15° off horizontal
  it('leaves the eye at its top, heading left, the way its author drew it', () => {
    const arcs = def.arcs(spec(style, 4));
    const inner = arcs[arcs.length - 1];
    expect(at(inner, inner.from)).toEqual([expect.closeTo(0, 9), expect.closeTo(4, 9)]);
    expect(Math.sin(inner.from)).toBeGreaterThan(0.95);
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

  it('ends the spiral at its front heading up, on the box front, with nothing right of it', () => {
    const { spiral } = layout(style, 4)!;
    const outer = spiral[0];
    const [frontX] = at(outer, outer.to);
    expect(frontX).toBeCloseTo(0, 9);
    expect(Math.cos(outer.to)).toBeCloseTo(1, 9);
    expect(Math.sin(outer.to)).toBeCloseTo(0, 9);
    for (const a of spiral) {
      const right = Math.max(...[a.from, a.to, 0].filter(t => angleWithinSweep(t, a.from, a.to)).map(t => at(a, t)[0]));
      expect(right).toBeLessThanOrEqual(1e-9);
    }
  });

  it('leaves the eye, on its edge, at its top, once placed', () => {
    const { eye, spiral } = layout(style, 4)!;
    const [x, y] = at(spiral.at(-1)!, spiral.at(-1)!.from);
    expect([x, y]).toEqual([expect.closeTo(eye.x, 9), expect.closeTo(eye.y + 4, 9)]);
  });

  it('keeps the arcs joined', () => {
    const { spiral } = layout(style, 4)!;
    for (let i = 0; i < spiral.length - 1; i++) {
      const [x, y] = at(spiral[i], spiral[i].from);
      const [ix, iy] = at(spiral[i + 1], spiral[i + 1].to);
      expect(Math.hypot(x - ix, y - iy)).toBeLessThan(1e-9);
    }
  });

  it('crowns the spiral from its front to the box top, carrying its outermost arc on unchanged at the fit\'s height', () => {
    const { spiral, crown } = layout(style, 4)!;
    const outer = spiral[0];
    expect(crown!.center.x).toBeCloseTo(outer.center.x, 9);
    expect(crown!.center.y).toBeCloseTo(outer.center.y, 9);
    expect(crown!.r).toBeCloseTo(outer.r, 9);
    expect(at(crown!, crown!.from)).toEqual([expect.closeTo(0, 9), expect.closeTo(outer.center.y, 9)]);
    expect(at(crown!, crown!.to)).toEqual([expect.closeTo(outer.center.x, 9), expect.closeTo(LENGTH, 9)]);
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

  it('runs the throat from the crown\'s top to the box\'s back edge, tangent to both', () => {
    const { crown, throat } = layout(style, 4)!;
    const [x, y] = at(crown!, crown!.to);
    expect(at(throat!, throat!.from)).toEqual([expect.closeTo(x, 9), expect.closeTo(y, 9)]);
    expect(at(throat!, throat!.to)).toEqual([expect.closeTo(-DEPTH, 9), expect.closeTo(y - throat!.r, 9)]);
    expect(throat!.center.x).toBeCloseTo(crown!.center.x, 9);
  });

  it('draws nothing for an eye that is not a positive radius', () => {
    for (const bad of [0, -1, NaN]) expect(layout(style, bad)).toBeNull();
  });

  it('goes wherever the eye is put, unchanged, the crown filling out as the eye drops', () => {
    const fitted = layout(style, 4)!;
    const eye = new Pt(fitted.eye.x - 5, fitted.eye.y - 7);
    const { spiral, crown, throat, guides } = layoutVolute(spec(style, 4), eye, LENGTH, DEPTH)!;
    spiral.forEach((a, i) => {
      expect(a.center.x).toBeCloseTo(fitted.spiral[i].center.x - 5, 9);
      expect(a.center.y).toBeCloseTo(fitted.spiral[i].center.y - 7, 9);
      expect([a.r, a.from, a.to]).toEqual([fitted.spiral[i].r, fitted.spiral[i].from, fitted.spiral[i].to]);
    });
    guides.forEach((line, i) => line.forEach((p, j) => {
      expect(p.x).toBeCloseTo(fitted.guides[i][j].x - 5, 9);
      expect(p.y).toBeCloseTo(fitted.guides[i][j].y - 7, 9);
    }));
    const [x, y] = at(spiral[0], spiral[0].to);
    expect(x).toBeCloseTo(-5, 9);
    expect(crown!.r).toBeCloseTo(fitted.crown!.r + 7, 9);
    expect(at(crown!, crown!.from)).toEqual([expect.closeTo(x, 9), expect.closeTo(y, 9)]);
    expect(at(crown!, crown!.to)).toEqual([expect.closeTo(x - crown!.r, 9), expect.closeTo(LENGTH, 9)]);
    expect(at(throat!, throat!.from)).toEqual([expect.closeTo(x - crown!.r, 9), expect.closeTo(LENGTH, 9)]);
    expect(at(throat!, throat!.to)).toEqual([expect.closeTo(-DEPTH, 9), expect.closeTo(LENGTH - throat!.r, 9)]);
  });

  it('has no crown or throat once the eye is raised until the spiral\'s front clears the top', () => {
    const fitted = layout(style, 4)!;
    const eye = new Pt(fitted.eye.x, fitted.eye.y + fitted.crown!.r);
    const { spiral, crown, throat } = layoutVolute(spec(style, 4), eye, LENGTH, DEPTH)!;
    expect(spiral.length).toBe(fitted.spiral.length);
    expect(crown).toBeNull();
    expect(throat).toBeNull();
  });

  it('draws nothing for an eye that has no place yet', () => {
    expect(layoutVolute(spec(style, 4), new Pt(NaN, 50), LENGTH, DEPTH)).toBeNull();
    expect(layoutVolute(spec(style, 4), new Pt(-20, NaN), LENGTH, DEPTH)).toBeNull();
  });

  it('has a crown but no throat when the crown\'s centre lies past the back edge', () => {
    const { crown, throat } = layout(style, 4, 1)!;
    expect(crown).not.toBeNull();
    expect(throat).toBeNull();
  });
});

describe.each(HISTORICAL)('the %s volute, as its author drew it', style => {
  const def = VOLUTE_STYLES[style];

  it('ends above the eye heading left, a whole number of turns out', () => {
    const arcs = def.arcs(spec(style, 4));
    const [, y] = at(arcs[0], arcs[0].to);
    expect(y).toBeGreaterThan(4);
    expect(Math.sin(arcs[0].to)).toBeGreaterThan(0.98);
    expect(sweep(arcs) / (2 * Math.PI)).toBeCloseTo(Math.round(sweep(arcs) / (2 * Math.PI)), 1);
  });

  it('is cut a quarter turn short of that end, dropping only the outermost arc\'s last quarter', () => {
    const arcs = def.arcs(spec(style, 4));
    const { spiral } = layout(style, 4)!;
    expect(Math.abs(sweep(spiral) - (sweep(arcs) - Math.PI / 2))).toBeLessThan(0.1);
    expect(spiral.length).toBeGreaterThanOrEqual(arcs.length - 2);
  });

  it('draws the same whatever the arc radii say', () => {
    expect(def.arcs(spec(style, 4, [9, 17, 30]))).toEqual(def.arcs(spec(style, 4)));
  });
});

describe('the Alberti volute', () => {
  it('winds two even turns out from the eye, a diameter a semicircle, about the two ends of the eye\'s vertical diameter', () => {
    const arcs = VOLUTE_STYLES.alberti.arcs(spec('alberti', 4));
    expect(arcs.map(a => a.r / 8)).toEqual([4, 3, 2, 1].map(v => expect.closeTo(v, 9)));
    expect(arcs.map(a => a.center.x)).toEqual([0, 0, 0, 0].map(v => expect.closeTo(v, 9)));
    expect(arcs.map(a => Math.abs(a.center.y))).toEqual([4, 4, 4, 4].map(v => expect.closeTo(v, 9)));
    expect(sweep(arcs)).toBeCloseTo(4 * Math.PI, 9);
  });
});

describe('the Philandrier volute', () => {
  const d = 8;
  const arcs = VOLUTE_STYLES.philandrier.arcs(spec('philandrier', 4));
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

  it('rays out to its outermost point on each of the eight lines', () => {
    const rays = VOLUTE_STYLES.philandrier.guides(spec('philandrier', 4));
    expect(rays).toHaveLength(8);
    rays.forEach(([from, to], k) => {
      expect(from).toEqual(expect.objectContaining({ x: 0, y: 0 }));
      expect(Math.cos(Math.atan2(to.y, to.x) - Math.PI / 2 - k * Math.PI / 4)).toBeCloseTo(1, 9);
    });
    expect(Math.hypot(rays[0][1].x, rays[0][1].y) / d).toBeCloseTo(4.5, 9);
  });
});

describe('the Goldmann volute', () => {
  const r = 4;
  const arcs = VOLUTE_STYLES.goldmann.arcs(spec('goldmann', r));

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
    const arcs = VOLUTE_STYLES.serlio.arcs(spec('serlio', 4));
    expect(arcs.map(a => a.r / 8)).toEqual([4, 3, 13 / 6, 3 / 2, 1, 2 / 3].map(v => expect.closeTo(v, 9)));
    expect(arcs.map(a => a.center.x)).toEqual([0, 0, 0, 0, 0, 0].map(v => expect.closeTo(v, 9)));
    expect(arcs.map(a => a.center.y / 8)).toEqual([3 / 6, -3 / 6, 2 / 6, -2 / 6, 1 / 6, -1 / 6].map(v => expect.closeTo(v, 9)));
  });

  it('draws his 4-diameter arc only to the front, three quarters of it', () => {
    const { spiral } = layout('serlio', 4)!;
    expect(spiral.map(a => a.r / 8)).toEqual([4, 3, 13 / 6, 3 / 2, 1, 2 / 3].map(v => expect.closeTo(v, 9)));
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

  it('draws eleven to the front, the last quarter of the twelfth left to the crown', () => {
    expect(layout('salviati', 4)!.spiral).toHaveLength(11);
  });
});

// each seed figure at a unit side, first corner first: one side on the eye's vertical diameter,
// centred on the eye's centre, and how large a side the eye holds
describe.each([
  { style: 'twoPoint', points: 2, count: 6, turns: [[0, 1], [2, 3], [4, 5]], unit: [[0, -1 / 2], [0, 1 / 2]], fits: 2 },
  { style: 'threePoint', points: 3, count: 9, turns: [[0, 1, 2], [3, 4, 5], [6, 7, 8]], unit: [[0, -1 / 2], [Math.sqrt(3) / 2, 0], [0, 1 / 2]], fits: 2 / Math.sqrt(3) },
  { style: 'fourPoint', points: 4, count: 11, turns: [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10]], unit: [[0, -1 / 2], [1, -1 / 2], [1, 1 / 2], [0, 1 / 2]], fits: 2 / Math.sqrt(5) },
] as const)('the $style volute', ({ style, points, count, turns, unit, fits }) => {
  const def = VOLUTE_STYLES[style];
  const r = 4;
  const radii = [5, 6, 8, 9, 12, 13, 15, 18, 20, 23, 24].slice(0, count);
  const arcs = def.arcs(spec(style, r, radii));
  const inward = [...arcs].reverse();
  const step = 2 * Math.PI / points;
  const side = fits * r;
  const figure = unit.map(([x, y]) => [x * side, y * side]);

  it('draws one exact 1/points of a turn per radius, innermost first, about a first centre straight below the top of the eye', () => {
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

  it('seeds from a figure inside the eye, a side on its vertical diameter centred on its centre, its far corners on the edge', () => {
    const [seed] = def.guides(spec(style, r, radii));
    expect(seed).toEqual([...figure, figure[0]].map(([x, y]) => expect.objectContaining({ x: expect.closeTo(x, 9), y: expect.closeTo(y, 9) })));
    const reach = figure.map(([x, y]) => Math.hypot(x, y));
    for (const d of reach) expect(d).toBeLessThanOrEqual(r + 1e-9);
    expect(Math.max(...reach)).toBeCloseTo(r, 9);
  });

  it('grown a side an arc from the first corner, centres every arc on the figure\'s corners, the first inside the eye below its centre', () => {
    const natural = def.arcs(spec(style, r, Array.from({ length: count }, (_, i) => r + side / 2 + i * side))).reverse();
    natural.forEach((a, i) => expect([a.center.x, a.center.y]).toEqual(figure[i % points].map(v => expect.closeTo(v, 9))));
    if (points > 2) expect(Math.hypot(natural[0].center.x, natural[0].center.y)).toBeLessThan(r);
    expect(natural[0].center.y).toBeLessThan(0);
  });

  it(`draws ${count} arcs, the last reaching the front heading up, so the cut keeps every one and the crown carries on from it`, () => {
    expect(pointArcCount(points)).toBe(count);
    const v = spec(style, r, radii);
    const placed = layoutVolute(v, fitVolute(v, LENGTH)!, LENGTH, DEPTH)!;
    expect(placed.spiral).toHaveLength(count);
    expect(placed.spiral[0].r).toBe(radii.at(-1));
    expect(placed.crown!.r).toBeCloseTo(placed.spiral[0].r, 9);
  });

  it('draws nothing unless every radius is more than the last', () => {
    for (const bad of [[], [5, 5, 8], [5, 8, 7], [0, 5, 8], [5, NaN, 8]]) {
      expect(def.arcs(spec(style, r, bad))).toEqual([]);
      expect(fitVolute(spec(style, r, bad), LENGTH)).toBeNull();
    }
  });

  it('guides with the seed figure and the walk of centres', () => {
    const guides = def.guides(spec(style, r, radii));
    expect(guides).toHaveLength(2);
    expect(guides[1]).toEqual(inward.map(a => expect.objectContaining({ x: expect.closeTo(a.center.x, 9), y: expect.closeTo(a.center.y, 9) })));
  });

  it('groups its arcs by turn', () => {
    expect(pointTurns(points, count)).toEqual(turns);
  });

  it('grows naturally from the top of the eye down to the figure\'s first corner, each arc a side longer', () => {
    const natural = naturalArcRadii(r, points);
    expect(natural).toHaveLength(count);
    natural.forEach((n, i) => expect(Math.abs(n - (r + side / 2 + i * side))).toBeLessThanOrEqual(0.005));
    expect(def.arcs(spec(style, r, natural))).toHaveLength(count);
    expect(naturalArcRadii(2 * r, points)[count - 1]).toBeCloseTo(2 * natural[count - 1], 1);
  });
});

describe('the two point volute', () => {
  it('grows naturally into Alberti\'s figure, carried on past his two turns', () => {
    const alberti = VOLUTE_STYLES.alberti.arcs(spec('alberti', 4)).reverse();
    const natural = VOLUTE_STYLES.twoPoint.arcs(spec('twoPoint', 4, naturalArcRadii(4, 2))).reverse();
    alberti.forEach((a, i) => {
      const n = natural[i];
      expect([n.center.x, n.center.y, n.r]).toEqual([a.center.x, a.center.y, a.r].map(v => expect.closeTo(v, 9)));
      expect(Math.cos(n.from - a.from)).toBeCloseTo(1, 9);
    });
  });
});

describe('the four point volute', () => {
  describe('set by the turn', () => {
    const base = [2, 3, 4, 6, 7, 8, 10, 12, 13, 15, 18];

    it('ends the turn where asked, its quarters keeping their share of its growth', () => {
      const radii = [...base];
      setTurnRadius(radii, 4, 1, 16);
      expect(radii[7]).toBe(16);
      // turn 2 ran 6 to 12 in steps of 1, 1, 2, 2; now 6 to 16, the same shares
      expect(radii.slice(4, 8)).toEqual([7 + 2 / 3, 9 + 1 / 3, 12 + 2 / 3, 16].map(v => expect.closeTo(v, 2)));
      expect(radii.slice(0, 4)).toEqual(base.slice(0, 4));
    });

    it('keeps the next turn\'s end, its quarters stretched from the new start', () => {
      const radii = [...base];
      setTurnRadius(radii, 4, 1, 14);
      expect(radii[10]).toBe(18);
      // turn 3 ran 12 to 18 in 1, 2, 3; now 14 to 18, the same shares
      expect(radii.slice(8, 11)).toEqual([14 + 4 / 6, 14 + 2, 18].map(v => expect.closeTo(v, 2)));
    });

    it('scales the first turn whole, since it starts from nothing', () => {
      const radii = [...base];
      setTurnRadius(radii, 4, 0, 9);
      expect(radii.slice(0, 4)).toEqual([3, 4.5, 6, 9]);
      expect(radii[7]).toBe(12);
    });

    it('moves only the last turn when that is the one set', () => {
      const radii = [...base];
      setTurnRadius(radii, 4, 2, 24);
      expect(radii.slice(0, 8)).toEqual(base.slice(0, 8));
      expect(radii[10]).toBe(24);
    });

    it('leaves the radii alone for a field left empty', () => {
      const radii = [...base];
      setTurnRadius(radii, 4, 1, NaN);
      expect(radii).toEqual(base);
    });

    it('keeps a spiral that was drawable drawable, for any end between its neighbours', () => {
      const radii = naturalArcRadii(1.7, 4);
      setTurnRadius(radii, 4, 1, (radii[3] + radii[10]) / 2);
      expect(VOLUTE_STYLES.fourPoint.arcs(spec('fourPoint', 1.7, radii))).toHaveLength(11);
    });

    it('takes a turn as two halves on the two point', () => {
      const radii = [2, 3, 4, 6, 8, 10];
      setTurnRadius(radii, 2, 1, 9);
      expect(radii).toEqual([2, 3, 5, 9, 9.5, 10]);
    });
  });
});
