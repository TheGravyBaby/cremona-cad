// @vitest-environment node
import { Circle, Pt } from '../../models/types';
import { dist } from '../../helpers/math/simpleGeometry';
import { filletBetween } from '../../helpers/math/draftMath';
import { fakeToolHost } from './fake-tool-host';
import { ArcShape, DraftShape, LineShape } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { createFilletTool } from './fillet-tool';

const at = (x: number, y: number): Pt => ({ x, y });
const circle = (x: number, y: number, r: number) => ({ x, y, r }) as Circle;

describe('filletBetween', () => {
  const xAxis = { line: [at(-10, 0), at(10, 0)] as [Pt, Pt] };
  const yAxis = { line: [at(0, -10), at(0, 10)] as [Pt, Pt] };

  it('rounds the corner between the parts clicked', () => {
    const f = filletBetween(xAxis, yAxis, 2, at(5, 0), at(0, 5))!;
    expect(f.center.x).toBeCloseTo(2, 9);
    expect(f.center.y).toBeCloseTo(2, 9);
    expect(f.sweep).toBeCloseTo(Math.PI / 2, 9);
    const other = filletBetween(xAxis, yAxis, 2, at(-5, 0), at(0, 5))!;
    expect([other.center.x, other.center.y].map(v => +v.toFixed(9))).toEqual([-2, 2]);
  });

  it('rounds a line into a circle from outside it', () => {
    const f = filletBetween({ line: [at(-30, 12), at(30, 12)] }, { circle: circle(0, 0, 10) }, 3, at(20, 12), at(8.66, 5))!;
    expect(f.center.x).toBeCloseTo(Math.sqrt(88), 9);
    expect(f.center.y).toBeCloseTo(9, 9);
    expect(dist(f.atB, at(0, 0))).toBeCloseTo(10, 9);
  });

  it('bridges two circles', () => {
    const f = filletBetween({ circle: circle(0, 0, 10) }, { circle: circle(30, 0, 10) }, 10,
      at(10 * Math.SQRT1_2, 10 * Math.SQRT1_2), at(30 - 10 * Math.SQRT1_2, 10 * Math.SQRT1_2))!;
    expect(f.center.x).toBeCloseTo(15, 9);
    expect(f.center.y).toBeCloseTo(Math.sqrt(175), 9);
  });

  it('finds nothing between parallel lines wider apart than the round', () => {
    expect(filletBetween({ line: [at(0, 0), at(10, 0)] }, { line: [at(0, 4), at(10, 4)] }, 1, at(5, 0), at(5, 4))).toBeNull();
  });
});

describe('Fillet tool', () => {
  const toolbox = { currentFilletRadius: 5 } as ToolboxStore;

  it('rounds two lines that fall short of each other, running each on to meet the round', () => {
    const a: LineShape = { id: 'a', type: 'line', start: at(0, 0), end: at(20, 0) };
    const b: LineShape = { id: 'b', type: 'line', start: at(30, 5), end: at(30, 30) };
    const under = (pt: Pt): DraftShape | null => pt.y < 1 ? a : b;
    const host = fakeToolHost({ curveAt: under });
    const tool = createFilletTool(toolbox);
    tool.onPointerDown(at(5, 0), host);
    tool.onPointerDown(at(30, 20), host);

    const [trimA, trimB] = host.replaced as LineShape[];
    expect(trimA).toMatchObject({ id: 'a', start: at(0, 0) });
    expect(trimA.end.x).toBeCloseTo(25, 9);
    expect(trimB.start.y).toBeCloseTo(5, 9);
    const round = host.added[0] as ArcShape;
    expect(round.center.x).toBeCloseTo(25, 9);
    expect(round.center.y).toBeCloseTo(5, 9);
    expect(round.startAngle).toBeCloseTo(-Math.PI / 2, 9);
    expect(round.endAngle).toBeCloseTo(0, 9);
  });

  it('draws the round in the colour of the first piece clicked', () => {
    const a: LineShape = { id: 'a', type: 'line', start: at(0, 0), end: at(20, 0), color: '#c04020' };
    const b: LineShape = { id: 'b', type: 'line', start: at(30, 5), end: at(30, 30), color: '#2040c0' };
    const host = fakeToolHost({ curveAt: pt => pt.y < 1 ? a : b });
    const tool = createFilletTool(toolbox);
    tool.onPointerDown(at(5, 0), host);
    tool.onPointerDown(at(30, 20), host);
    expect(host.added[0].color).toBe('#c04020');
  });

  it('cuts an arc back to the round but leaves a circle whole', () => {
    const line: LineShape = { id: 'l', type: 'line', start: at(-30, 12), end: at(30, 12) };
    const ring: DraftShape = { id: 'c', type: 'circle', center: at(0, 0), radius: 10 };
    const host = fakeToolHost({ curveAt: pt => pt.y > 11 ? line : ring });
    const tool = createFilletTool({ currentFilletRadius: 3 } as ToolboxStore);
    tool.onPointerDown(at(20, 12), host);
    tool.onPointerDown(at(8.66, 5), host);
    expect(host.replaced[1]).toBe(ring);
    expect((host.replaced[0] as LineShape).start.x).toBeCloseTo(Math.sqrt(88), 9);
  });

  it('cuts an arc back from the clicked side, keeping the rest of its sweep', () => {
    const arc: ArcShape = { id: 'a', type: 'arc', center: at(0, 0), radius: 10, startAngle: 0, endAngle: Math.PI };
    const wall: LineShape = { id: 'w', type: 'line', start: at(15, -20), end: at(15, 20) };
    const host = fakeToolHost({ curveAt: pt => pt.x > 14 ? wall : arc });
    const tool = createFilletTool({ currentFilletRadius: 3 } as ToolboxStore);
    tool.onPointerDown(at(10 * Math.SQRT1_2, 10 * Math.SQRT1_2), host);
    tool.onPointerDown(at(15, 10), host);
    const cut = host.replaced[0] as ArcShape;
    expect(cut.startAngle).toBeCloseTo(Math.atan2(5, 12), 9);
    expect(cut.endAngle).toBe(Math.PI);
  });
});
