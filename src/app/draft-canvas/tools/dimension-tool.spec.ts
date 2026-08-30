import { Pt } from '../../models/types';
import { DraftToolHost } from './draft-tool';
import { DimensionTool } from './dimension-tool';
import { DimensionShape, DraftShape, dimensionGeometry } from './toolbox-shape';
import { endpointGrabbers, moveGrabberPosition, withEndpoint } from './shape-grabbers';

/** Only the handful of host calls DimensionTool actually makes — the rest of DraftToolHost is
 * stubbed to the shape of "nothing snapped, no modifier held". pxPerMm is 1 so the click-vs-drag
 * threshold is readable in mm. */
function makeHost(): DraftToolHost & { added: DraftShape[] } {
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
    selectShape: () => { },
    removeShape: () => { },
    returnToSelect: () => { },
  };
}

const at = (x: number, y: number): Pt => ({ x, y });

/** Press and release at the same spot — the click half of the click-click gesture. */
function click(tool: DimensionTool, host: DraftToolHost, pt: Pt): void {
  tool.onPointerDown(pt, host);
  tool.onPointerUp(pt, host);
}

describe('DimensionTool', () => {
  it('needs a third click before it commits anything', () => {
    const tool = new DimensionTool();
    const host = makeHost();

    click(tool, host, at(0, 0));
    click(tool, host, at(100, 0));

    expect(host.added).toEqual([]);
  });

  it('stores the third click as a perpendicular offset', () => {
    const tool = new DimensionTool();
    const host = makeHost();

    click(tool, host, at(0, 0));
    click(tool, host, at(100, 0));
    // Well off the far end of the measurement: only the perpendicular part survives, so the 40mm
    // slide along the line is dropped and the 25mm across it is kept.
    tool.onPointerDown(at(140, 25), host);

    expect(host.added.length).toBe(1);
    const shape = host.added[0] as DimensionShape;
    expect(shape.type).toBe('dimension');
    expect(shape.start).toEqual(at(0, 0));
    expect(shape.end).toEqual(at(100, 0));
    expect(shape.offset).toBeCloseTo(25, 9);
  });

  it('signs the offset by which side of the measurement the click lands on', () => {
    const tool = new DimensionTool();
    const host = makeHost();

    click(tool, host, at(0, 0));
    click(tool, host, at(100, 0));
    tool.onPointerDown(at(50, -25), host);

    expect((host.added[0] as DimensionShape).offset).toBeCloseTo(-25, 9);
  });

  // The field is absent, not zero, so a flat dimension serializes exactly as it did before the
  // third click existed — see DimensionShape.offset.
  it('omits the offset entirely when the line lands back on the measurement', () => {
    const tool = new DimensionTool();
    const host = makeHost();

    click(tool, host, at(0, 0));
    click(tool, host, at(100, 0));
    tool.onPointerDown(at(50, 0), host);

    expect(Object.hasOwn(host.added[0], 'offset')).toBe(false);
  });

  it('takes the measurement from a press-drag-release too, then still waits for the click', () => {
    const tool = new DimensionTool();
    const host = makeHost();

    tool.onPointerDown(at(0, 0), host);
    tool.onPointerMove(at(60, 80), host);
    tool.onPointerUp(at(60, 80), host);
    expect(host.added).toEqual([]);

    tool.onPointerDown(at(0, 0), host);

    expect(host.added.length).toBe(1);
    const shape = host.added[0] as DimensionShape;
    expect(shape.end).toEqual(at(60, 80));
    // (0,0) is on the measurement's line, so the offset is zero however far the drag went.
    expect(Object.hasOwn(shape, 'offset')).toBe(false);
  });

  it('cancels the whole dimension on Escape, at either stage', () => {
    const tool = new DimensionTool();
    const host = makeHost();

    click(tool, host, at(0, 0));
    click(tool, host, at(100, 0));
    expect(tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);

    // Nothing planted any more: the next click starts a fresh measurement rather than placing a
    // line for the abandoned one.
    tool.onPointerDown(at(10, 10), host);
    expect(host.added).toEqual([]);
  });
});

describe('dimension handles', () => {
  const shape: DimensionShape = {
    id: 'd1', type: 'dimension', start: at(0, 0), end: at(100, 0), offset: 20,
  };

  it('puts the offset handle on the dimension line, not on the measurement', () => {
    const grabbers = endpointGrabbers(shape, 1)!;
    const offsetGrabber = grabbers.find(g => g.key === 'offset')!;
    expect(offsetGrabber.pos).toEqual(at(50, 20));
  });

  // Two handles can't share a spot, and at zero offset the move square and the offset handle
  // would land on each other exactly — so the dimension line itself is the move target.
  it('has no move square, leaving its middle to the offset handle', () => {
    expect(moveGrabberPosition(shape)).toBeNull();
    expect(moveGrabberPosition({ ...shape, offset: 0 })).toBeNull();
  });

  it('keeps the measurement fixed when the offset handle is dragged', () => {
    const moved = withEndpoint(shape, 'offset', at(-30, -12)) as DimensionShape;
    expect(moved.start).toEqual(shape.start);
    expect(moved.end).toEqual(shape.end);
    expect(moved.offset).toBeCloseTo(-12, 9);
  });

  it('leaves the offset alone when an endpoint is dragged', () => {
    const moved = withEndpoint(shape, 'end', at(100, 40)) as DimensionShape;
    expect(moved.offset).toBe(20);
    // The line follows the measurement round, staying parallel to it.
    const geo = dimensionGeometry(moved.start, moved.end, moved.offset)!;
    const along = (geo.p2.x - geo.p1.x) * (moved.end.y - moved.start.y)
      - (geo.p2.y - geo.p1.y) * (moved.end.x - moved.start.x);
    expect(along).toBeCloseTo(0, 9);
  });
});
