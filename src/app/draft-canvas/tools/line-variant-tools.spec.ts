import { Pt } from '../../models/types';
import { dist } from '../../helpers/math/simpleGeometry';
import { commonTangents } from '../../helpers/math/draftMath';
import { DraftToolHost } from './draft-tool';
import { fakeToolHost } from './fake-tool-host';
import { DraftShape, LineShape, PathShape } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { createPolylineTool, perpendicularLine, tangentLine } from './line-variant-tools';
import { angleLockModifier } from './two-point-tool';
import { shapeCurves } from './curve-tools';

const makeHost = (mods: { shift?: boolean; ctrl?: boolean } = {}) =>
  fakeToolHost({ isAngleLockHeld: () => !!mods.shift, isTangentLockHeld: () => !!mods.ctrl });

const at = (x: number, y: number): Pt => ({ x, y });
const toolbox = { currentDashed: false } as ToolboxStore;
const key = (k: string) => new KeyboardEvent('keydown', { key: k });

describe('commonTangents', () => {
  it('gives two outer and two crossing tangents for separate circles, each square to both radii', () => {
    const c1 = { x: 0, y: 0, r: 5 }, c2 = { x: 30, y: 0, r: 10 };
    const pairs = commonTangents(c1, c2);
    expect(pairs).toHaveLength(4);
    for (const [a, b] of pairs) {
      expect(dist(a, c1)).toBeCloseTo(5, 9);
      expect(dist(b, c2)).toBeCloseTo(10, 9);
      const dir = { x: b.x - a.x, y: b.y - a.y };
      expect((a.x - c1.x) * dir.x + (a.y - c1.y) * dir.y).toBeCloseTo(0, 9);
      expect((b.x - c2.x) * dir.x + (b.y - c2.y) * dir.y).toBeCloseTo(0, 9);
    }
  });

  it('has only the outer pair when the circles overlap', () => {
    expect(commonTangents({ x: 0, y: 0, r: 10 }, { x: 15, y: 0, r: 10 })).toHaveLength(2);
  });
});

describe('tangentLine', () => {
  const circle = { x: 0, y: 0, r: 10 };

  it('touches the circle at the tangent point on the clicked side', () => {
    const [start, end] = tangentLine({ pt: at(30, 0) }, { pt: at(0, 10), circle })!;
    expect(start).toEqual(at(30, 0));
    expect(end.y).toBeGreaterThan(0);
    expect(dist(end, circle)).toBeCloseTo(10, 9);
  });

  it('picks the outer tangent above two circles when both are clicked on top', () => {
    const [a, b] = tangentLine({ pt: at(0, 10), circle }, { pt: at(40, 10), circle: { x: 40, y: 0, r: 10 } })!;
    expect(a.y).toBeCloseTo(10, 9);
    expect(b.y).toBeCloseTo(10, 9);
  });

  it('has no answer from inside the circle', () => {
    expect(tangentLine({ pt: at(1, 1) }, { pt: at(0, 10), circle })).toBeNull();
  });
});

describe('tangentLine on paths', () => {
  // a circle written as a path, so it goes through the sampled solve rather than the exact one
  const ring = (cx: number, r: number) =>
    `M ${cx - r} 0 A ${r} ${r} 0 0 0 ${cx + r} 0 A ${r} ${r} 0 0 0 ${cx - r} 0 Z`;
  const pieces = (d: string) => shapeCurves({ id: 'p', type: 'path', d }).map(c => c.points);

  it('touches a path from a point, square to the radius', () => {
    const [curve] = pieces(ring(0, 10));
    const [, t] = tangentLine({ pt: at(30, 0) }, { pt: at(0, 10), curve })!;
    expect(dist(t, at(0, 0))).toBeCloseTo(10, 2);
    expect(t.x * (30 - t.x) + t.y * (0 - t.y)).toBeCloseTo(0, 1);
    expect(t.y).toBeGreaterThan(0);
  });

  it('finds the outer tangent between a path and a circle', () => {
    const [curve] = pieces(ring(0, 10));
    const [a, b] = tangentLine({ pt: at(0, 10), curve }, { pt: at(40, 10), circle: { x: 40, y: 0, r: 10 } })!;
    expect(a.y).toBeCloseTo(10, 2);
    expect(b.y).toBeCloseTo(10, 2);
  });

  it('bridges two pieces of one path, each end on the piece it was clicked on', () => {
    const [left, right] = pieces(`${ring(0, 10)} ${ring(40, 5)}`);
    const [a, b] = tangentLine({ pt: at(0, 10), curve: left }, { pt: at(40, 5), curve: right })!;
    expect(dist(a, at(0, 0))).toBeCloseTo(10, 2);
    expect(dist(b, at(40, 0))).toBeCloseTo(5, 2);
    expect(a.y).toBeGreaterThan(0);
    expect(b.y).toBeGreaterThan(0);
  });
});

describe('perpendicularLine', () => {
  const pieces = (d: string) => shapeCurves({ id: 'p', type: 'path', d }).map(c => c.points);

  it('drops onto a line, past its end if that is where the foot is', () => {
    const [from, foot] = perpendicularLine({ pt: at(30, 12) }, { pt: at(5, 0), line: [at(0, 0), at(10, 0)] })!;
    expect(from).toEqual(at(30, 12));
    expect(foot.x).toBeCloseTo(30, 9);
    expect(foot.y).toBeCloseTo(0, 9);
  });

  it('meets a circle along the radius, on the side clicked', () => {
    const circle = { x: 0, y: 0, r: 10 };
    const [, near] = perpendicularLine({ pt: at(30, 0) }, { pt: at(10, 0), circle })!;
    const [, far] = perpendicularLine({ pt: at(30, 0) }, { pt: at(-10, 0), circle })!;
    expect(near.x).toBeCloseTo(10, 9);
    expect(far.x).toBeCloseTo(-10, 9);
  });

  it('meets a path square, which for an arc is along the radius', () => {
    // a half circle about (20, 0) through (20, -20)
    const [curve] = pieces('M 0 0 A 20 20 0 0 1 40 0');
    const [, foot] = perpendicularLine({ pt: at(20, -5) }, { pt: at(18, -19), curve })!;
    expect(foot.x).toBeCloseTo(20, 1);
    expect(foot.y).toBeCloseTo(-20, 1);
  });

  it('meets a rectangle edge square', () => {
    const [curve] = shapeCurves({ id: 'r', type: 'rect', p1: at(0, 0), p2: at(20, 10) }).map(c => c.points);
    const [, foot] = perpendicularLine({ pt: at(7, 30) }, { pt: at(12, 10), curve })!;
    expect(foot.x).toBeCloseTo(7, 9);
    expect(foot.y).toBeCloseTo(10, 9);
  });

  it('spans two parallel lines square to both, at the first click', () => {
    const [a, b] = perpendicularLine(
      { pt: at(4, 0), line: [at(0, 0), at(10, 0)] }, { pt: at(9, 8), line: [at(0, 8), at(10, 8)] })!;
    expect(a).toEqual(at(4, 0));
    expect(b.x).toBeCloseTo(4, 9);
    expect(b.y).toBeCloseTo(8, 9);
  });

  it('collapses onto the crossing of two lines that meet', () => {
    const [a, b] = perpendicularLine(
      { pt: at(5, 0), line: [at(0, 0), at(10, 0)] }, { pt: at(3, 3), line: [at(0, 0), at(10, 10)] })!;
    expect(dist(a, b)).toBeLessThan(1e-3);
  });
});

describe('Polyline', () => {
  function place(points: Pt[], host: DraftToolHost) {
    const tool = createPolylineTool(toolbox);
    for (const p of points) tool.onPointerDown(p, host);
    return tool;
  }

  it('finishes on Enter as one path through every corner', () => {
    const host = makeHost();
    const tool = place([at(0, 0), at(10, 0), at(10, 10)], host);
    tool.onKeyDown(key('Enter'), host);
    expect((host.added[0] as PathShape).d).toBe('M 0 0 L 10 0 L 10 10');
  });

  it('closes when the first corner is clicked again', () => {
    const host = makeHost();
    place([at(0, 0), at(10, 0), at(10, 10), at(0, 0)], host);
    expect((host.added[0] as PathShape).d).toBe('M 0 0 L 10 0 L 10 10 Z');
  });

  it('finishes on a second click at the last corner, and two corners make a line', () => {
    const host = makeHost();
    place([at(0, 0), at(10, 0), at(10, 0)], host);
    expect(host.added[0] as LineShape).toMatchObject({ type: 'line', start: at(0, 0), end: at(10, 0) });
  });

  it('takes back a corner on Backspace', () => {
    const host = makeHost();
    const tool = place([at(0, 0), at(10, 0), at(10, 10)], host);
    tool.onKeyDown(key('Backspace'), host);
    tool.onKeyDown(key('Enter'), host);
    expect(host.added[0].type).toBe('line');
  });
});

describe('Ctrl+Shift', () => {
  it('runs square to the curve the line started on', () => {
    const p = angleLockModifier(at(0, 0), at(3, 10), makeHost({ shift: true, ctrl: true }), 0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(Math.hypot(3, 10), 9);
  });
});
