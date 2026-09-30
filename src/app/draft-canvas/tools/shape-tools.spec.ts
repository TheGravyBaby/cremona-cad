import { Pt } from '../../models/types';
import { DraftToolHost } from './draft-tool';
import { DraftShape, PathShape } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { createRegularPolygonTools } from './polygon-tool';
import { createRightTriangleTool } from './box-tool';

function makeHost(shift = false): DraftToolHost & { added: DraftShape[] } {
  const added: DraftShape[] = [];
  return {
    added,
    addShape: (s: DraftShape) => { added.push(s); },
    requestDraw: () => { },
    getSnapTangent: () => undefined,
    isAngleLockHeld: () => shift,
    isTangentLockHeld: () => false,
    getSelectedShapes: () => [],
    getPxPerMm: () => 1,
    hitTestShape: () => null,
    curveAt: () => null,
    selectShape: () => { },
    removeShape: () => { },
    returnToSelect: () => { },
  };
}

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
