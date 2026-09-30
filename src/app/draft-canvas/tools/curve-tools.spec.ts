import { Pt } from '../../models/types';
import { DraftToolHost } from './draft-tool';
import { CurveLengthShape, CurveTicksShape, DraftShape } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { createCurveLengthTool, createCurveTicksTool } from './curve-tools';
import { curveDivisions } from './shape-renderer';

function makeHost(curve: DraftShape | null): DraftToolHost & { added: DraftShape[] } {
  const added: DraftShape[] = [];
  return {
    added,
    addShape: (s: DraftShape) => { added.push(s); },
    requestDraw: () => { },
    getSnapTangent: () => undefined,
    isAngleLockHeld: () => false,
    isTangentLockHeld: () => false,
    getSelectedShapes: () => [],
    getPxPerMm: () => 1,
    hitTestShape: () => null,
    curveAt: () => curve,
    selectShape: () => { },
    removeShape: () => { },
    returnToSelect: () => { },
  };
}

const circle: DraftShape = { id: 'c', type: 'circle', center: { x: 0, y: 0 }, radius: 10 };
const onCircle = (deg: number): Pt => ({ x: 10 * Math.cos(deg * Math.PI / 180), y: 10 * Math.sin(deg * Math.PI / 180) });

// press at the first angle, drag through the rest in 45° steps, release on the last
function walk(host: DraftToolHost, degrees: number[]): void {
  const tool = createCurveLengthTool();
  tool.onPointerDown(onCircle(degrees[0]), host);
  for (const d of degrees.slice(1)) tool.onPointerMove(onCircle(d), host);
  tool.onPointerUp(onCircle(degrees[degrees.length - 1]), host);
}

describe('Curve Length', () => {
  const quarter = 2 * Math.PI * 10 / 4;

  it('measures along the circle the way the pointer went', () => {
    const host = makeHost(circle);
    walk(host, [0, 45, 90]);
    expect((host.added[0] as CurveLengthShape).length).toBeCloseTo(quarter, 2);
  });

  it('goes the long way round when the pointer sets off that way', () => {
    const host = makeHost(circle);
    walk(host, [0, -45, -90, -135, -180, -225, -270]);
    expect((host.added[0] as CurveLengthShape).length).toBeCloseTo(3 * quarter, 2);
  });

  it('stops at one full turn', () => {
    const host = makeHost(circle);
    walk(host, [0, 45, 90, 135, 180, 225, 270, 315, 360, 405, 450]);
    expect((host.added[0] as CurveLengthShape).length).toBeCloseTo(4 * quarter, 2);
  });

  it('keeps to the piece of a path that was clicked', () => {
    const path: DraftShape = { id: 'p', type: 'path', d: 'M 0 0 L 100 0 M 0 20 L 30 20' };
    const host = makeHost(path);
    const tool = createCurveLengthTool();
    tool.onPointerDown({ x: 5, y: 20 }, host);
    tool.onPointerUp({ x: 25, y: 20 }, host);
    expect((host.added[0] as CurveLengthShape).length).toBeCloseTo(20, 6);
  });

  it('does nothing off a curve', () => {
    const host = makeHost(null);
    walk(host, [0, 90]);
    expect(host.added).toHaveLength(0);
  });
});

describe('Curve Ticks', () => {
  it('divides the stretch by the Ticks weights, measured along it', () => {
    const toolbox = { currentTickWeights: [1, 1, 3] } as ToolboxStore;
    const line: DraftShape = { id: 'l', type: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const host = makeHost(line);
    const tool = createCurveTicksTool(toolbox);
    tool.onPointerDown({ x: 0, y: 0 }, host);
    tool.onPointerUp({ x: 50, y: 0 }, host);

    const shape = host.added[0] as CurveTicksShape;
    expect(shape.weights).toEqual([1, 1, 3]);
    expect(curveDivisions(shape.points, shape.weights).map(d => d.at.x)).toEqual([0, 10, 20, 50]);
  });
});
