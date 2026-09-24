import { layoutVolute, VoluteArc, VOLUTE_STYLES } from './volute';
import { VoluteStyle } from '../../ceruti-types';
import { angleWithinSweep } from '../../../helpers/math/simpleGeometry';

const at = ({ center, r }: VoluteArc, angle: number) => [center.x + r * Math.cos(angle), center.y + r * Math.sin(angle)];
const [LENGTH, DEPTH] = [110, 50];

// every style is held to the same contract at whatever rotation it is turned to
const ROTATIONS = [0, 0.3, -0.3, Math.PI / 2 + 0.2, -Math.PI / 2 - 0.2, Math.PI, 4];
const layout = (style: VoluteStyle, eyeRadius: number, rotation: number, depth = DEPTH) => layoutVolute(style, eyeRadius, rotation, LENGTH, depth);

describe.each(Object.keys(VOLUTE_STYLES) as VoluteStyle[])('the %s volute', style => {
  const def = VOLUTE_STYLES[style];
  it('draws arcs that scale with the eye radius', () => {
    const small = def.arcs(3);
    const large = def.arcs(6);
    small.forEach((s, i) => {
      expect(large[i].r).toBeCloseTo(2 * s.r, 9);
      expect(large[i].center.x).toBeCloseTo(2 * s.center.x, 9);
      expect(large[i].center.y).toBeCloseTo(2 * s.center.y, 9);
    });
  });

  it('meets each arc to its inner neighbour, tangent, at a point on the line between their centres', () => {
    const arcs = def.arcs(4);
    for (let i = 0; i < arcs.length - 1; i++) {
      const [outer, inner] = [arcs[i], arcs[i + 1]];
      const [x, y] = at(outer, outer.from);
      const [ix, iy] = at(inner, inner.to);
      expect(Math.hypot(x - ix, y - iy), `arcs ${i} and ${i + 1} share no point`).toBeLessThan(1e-9);
      const cross = (x - outer.center.x) * (inner.center.y - outer.center.y) - (y - outer.center.y) * (inner.center.x - outer.center.x);
      expect(Math.abs(cross), `arcs ${i} and ${i + 1} are not tangent`).toBeLessThan(1e-9);
    }
  });

  describe.each(ROTATIONS)('turned a further %f rad', rotation => {
    it('ends the spiral at its top heading left, on the box top, with nothing above it', () => {
      const { spiral } = layout(style, 4, rotation)!;
      const outer = spiral[0];
      const [, topY] = at(outer, outer.to);
      expect(topY).toBeCloseTo(LENGTH, 9);
      expect(Math.cos(outer.to)).toBeCloseTo(0, 9);
      expect(Math.sin(outer.to)).toBeCloseTo(1, 9);
      for (const a of spiral) expect(a.center.y + a.r).toBeLessThanOrEqual(LENGTH + 1e-9);
    });

    it('keeps the arcs joined and puts the right side on the box front', () => {
      const { spiral } = layout(style, 4, rotation)!;
      for (let i = 0; i < spiral.length - 1; i++) {
        const [x, y] = at(spiral[i], spiral[i].from);
        const [ix, iy] = at(spiral[i + 1], spiral[i + 1].to);
        expect(Math.hypot(x - ix, y - iy)).toBeLessThan(1e-9);
      }
      const right = Math.max(...spiral.flatMap(a => [a.from, a.to, 0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]
        .filter(t => angleWithinSweep(t, a.from, a.to))
        .map(t => at(a, t)[0])));
      expect(right).toBeCloseTo(0, 9);
    });

    it('joins from the outermost arc\'s top to the box\'s back edge, tangent to the arc and the box', () => {
      const { spiral, join } = layout(style, 4, rotation)!;
      const [x, y] = at(spiral[0], spiral[0].to);
      expect(at(join!, join!.from)).toEqual([expect.closeTo(x, 9), expect.closeTo(y, 9)]);
      expect(at(join!, join!.to)).toEqual([expect.closeTo(-DEPTH, 9), expect.closeTo(y - join!.r, 9)]);
      expect(join!.center.x).toBeCloseTo(spiral[0].center.x, 9);
    });

    it('draws nothing for an eye that is not a positive radius', () => {
      for (const bad of [0, -1, NaN]) expect(layout(style, bad, rotation)).toBeNull();
    });
  });

  it('has no join when the outermost arc\'s centre lies past the back edge', () => {
    expect(layout(style, 4, 0, 1)!.join).toBeNull();
  });
});

describe('the Serlio volute', () => {
  it('winds out from the eye in his radii, in eye diameters', () => {
    const d = 8;
    expect(VOLUTE_STYLES.serlio.arcs(4).map(a => a.r / d)).toEqual([4, 3, 13 / 6, 3 / 2, 1, 2 / 3].map(v => expect.closeTo(v, 9)));
  });

  it('stops at the top of its 3-diameter arc when unturned, without the 4-diameter arc', () => {
    expect(layout('serlio', 4, 0)!.spiral.map(a => a.r / 8)).toEqual([3, 13 / 6, 3 / 2, 1, 2 / 3].map(v => expect.closeTo(v, 9)));
  });

  it('reaches out to its 4-diameter arc once turned more than a quarter either way', () => {
    const arcCount = (rotation: number) => layout('serlio', 4, rotation)!.spiral.length;
    expect([0.2, -0.2].map(arcCount)).toEqual([5, 5]);
    expect([Math.PI / 2 + 0.2, -Math.PI / 2 - 0.2].map(arcCount)).toEqual([6, 6]);
  });
});

describe('the Salviati volute', () => {
  const d = 8;
  const arcs = VOLUTE_STYLES.salviati.arcs(4);

  it('draws twelve arcs, sweeping a quarter turn except where a ring meets the next', () => {
    expect(arcs).toHaveLength(12);
    const sweeps = arcs.map(a => (a.to - a.from) * 180 / Math.PI);
    sweeps.forEach((s, i) => {
      if ([3, 4, 7, 8].includes(i)) expect(s).not.toBeCloseTo(90, 0);
      else expect(s).toBeCloseTo(90, 9);
    });
    expect(sweeps.reduce((a, b) => a + b)).toBeCloseTo(1080, 9);
  });

  it('steps the radius in by 1/2, 1/3 and 1/6 of an eye diameter a quarter turn on each ring', () => {
    const steps = arcs.slice(0, 11).map((a, i) => (a.r - arcs[i + 1].r) / d);
    expect([0, 1, 2].map(i => steps[i])).toEqual([1 / 2, 1 / 2, 1 / 2].map(v => expect.closeTo(v, 9)));
    expect([4, 5, 6].map(i => steps[i])).toEqual([1 / 3, 1 / 3, 1 / 3].map(v => expect.closeTo(v, 9)));
    expect([8, 9, 10].map(i => steps[i])).toEqual([1 / 6, 1 / 6, 1 / 6].map(v => expect.closeTo(v, 9)));
  });

  it('starts on the eye\'s edge', () => {
    const inner = arcs[11];
    const [x, y] = at(inner, inner.from);
    expect(Math.hypot(x, y)).toBeCloseTo(4, 9);
  });

  it('draws all twelve when unturned or turned a little the other way, nine when turned a little back', () => {
    const arcCount = (rotation: number) => layout('salviati', 4, rotation)!.spiral.length;
    expect([0, 0.2].map(arcCount)).toEqual([12, 12]);
    expect(arcCount(-0.2)).toBe(9);
  });
});
