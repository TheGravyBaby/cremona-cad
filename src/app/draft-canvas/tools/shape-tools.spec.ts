import { Pt } from '../../models/types';
import { DraftToolHost } from './draft-tool';
import { fakeToolHost } from './fake-tool-host';
import { CircleShape, DraftShape, LineShape, PathShape, RectShape } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { createCircleTool, createRegularPolygonTools } from './polygon-tool';
import { createRectTool, createRightTriangleTool } from './box-tool';
import { createLineTool } from './line-tool';

const makeHost = (shift = false) => fakeToolHost({ isAngleLockHeld: () => shift });

const toolbox = { currentDashed: false } as ToolboxStore;
const at = (x: number, y: number): Pt => ({ x, y });

function drag(tool: { onPointerDown: Function; onPointerUp: Function }, a: Pt, b: Pt, host: DraftToolHost): void {
  tool.onPointerDown(a, host);
  tool.onPointerUp(b, host);
}

function cornersOf(shape: DraftShape): Pt[] {
  const d = (shape as PathShape).d;
  expect(d.endsWith('Z')).toBe(true);
  return [...d.matchAll(/[ML] (\S+) (\S+)/g)].map(m => at(Number(m[1]), Number(m[2])));
}

describe('regular polygon tools', () => {
  it('puts every corner on the circle through the second point, starting at it', () => {
    for (const tool of createRegularPolygonTools(toolbox)) {
      const sides = Number(tool.id.replace('polygon-', ''));
      const host = makeHost();
      drag(tool, at(5, 5), at(15, 5), host);

      const corners = cornersOf(host.added[0]);
      expect(corners).toHaveLength(sides);
      expect(corners[0].x).toBeCloseTo(15, 9);
      expect(corners[0].y).toBeCloseTo(5, 9);
      for (const c of corners) expect(Math.hypot(c.x - 5, c.y - 5)).toBeCloseTo(10, 9);
    }
  });
});

describe('right triangle tool', () => {
  it('puts the right angle on the first click, legs along the box edges', () => {
    const host = makeHost();
    drag(createRightTriangleTool(toolbox), at(0, 0), at(30, -20), host);
    expect(cornersOf(host.added[0])).toEqual([at(0, 0), at(30, 0), at(0, -20)]);
  });

  it('forces an isosceles triangle with the angle-lock modifier held', () => {
    const host = makeHost(true);
    drag(createRightTriangleTool(toolbox), at(0, 0), at(30, -20), host);
    expect(cornersOf(host.added[0])).toEqual([at(0, 0), at(30, 0), at(0, -30)]);
  });
});

describe('typed placement', () => {
  const type = (tool: { onKeyDown(e: KeyboardEvent, h: DraftToolHost): boolean }, keys: string, host: DraftToolHost) =>
    [...keys].forEach(k => tool.onKeyDown(new KeyboardEvent('keydown', { key: k === '\n' ? 'Enter' : k === '<' ? 'Backspace' : k }), host));

  // first point clicked, pointer moved off towards `toward`, then the keys
  function place(tool: ReturnType<typeof createLineTool>, toward: Pt, keys: string) {
    const host = makeHost();
    tool.onPointerDown(at(10, 10), host);
    tool.onPointerUp(at(10, 10), host);
    tool.onPointerMove(toward, host);
    type(tool, keys, host);
    return host.added;
  }

  it('runs a line the typed length the way the pointer points', () => {
    const [line] = place(createLineTool(toolbox), at(10, 50), '25\n') as LineShape[];
    expect(line.end.x).toBeCloseTo(10, 9);
    expect(line.end.y).toBeCloseTo(35, 9);
  });

  it('takes an angle after the length, whatever the pointer says', () => {
    const [line] = place(createLineTool(toolbox), at(50, 10), '20,90\n') as LineShape[];
    expect(line.end.x).toBeCloseTo(10, 9);
    expect(line.end.y).toBeCloseTo(30, 9);
  });

  it('sizes a box by width and height on the pointer\'s side, and a square from one number', () => {
    expect((place(createRectTool(toolbox), at(0, 0), '30,12\n')[0] as RectShape).p2).toEqual(at(-20, -2));
    expect((place(createRectTool(toolbox), at(20, 20), '5\n')[0] as RectShape).p2).toEqual(at(15, 15));
  });

  it('reads a circle\'s number as its radius', () => {
    expect((place(createCircleTool(toolbox), at(40, 10), '7.5\n')[0] as CircleShape).radius).toBeCloseTo(7.5, 9);
  });

  it('edits with Backspace, and Escape clears the number before it drops the shape', () => {
    const tool = createLineTool(toolbox);
    const host = makeHost();
    tool.onPointerDown(at(0, 0), host);
    tool.onPointerUp(at(0, 0), host);
    tool.onPointerMove(at(10, 0), host);
    type(tool, '99<<4', host);
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }), host);
    type(tool, '6\n', host);
    expect((host.added[0] as LineShape).end).toEqual(at(6, 0));
  });
});
