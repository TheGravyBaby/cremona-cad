import { Pt } from '../../models/types';
import { DraftToolHost } from './draft-tool';
import { OffsetTool } from './offset-tool';
import { DraftShape, RectShape } from './toolbox-shape';

/** Only the handful of host calls OffsetTool actually makes. pxPerMm is 1 so distances read in mm. */
function makeHost(selected: DraftShape[]): DraftToolHost & { added: DraftShape[] } {
  const added: DraftShape[] = [];
  return {
    added,
    addShape: (s: DraftShape) => { added.push(s); },
    requestDraw: () => { },
    getSnapTangent: () => undefined,
    isAngleLockHeld: () => false,
    isTangentLockHeld: () => false,
    getSelectedShapes: () => selected,
    getPxPerMm: () => 1,
    hitTestShape: () => null,
    selectShape: () => { },
    removeShape: () => { },
    returnToSelect: () => { },
  };
}

const at = (x: number, y: number): Pt => ({ x, y });

const rect: RectShape = { id: 'r1', type: 'rect', p1: at(0, 0), p2: at(100, 50) };

describe('OffsetTool on rectangles', () => {
  it('grows the rect outward when clicked outside it', () => {
    const tool = new OffsetTool();
    const host = makeHost([rect]);

    tool.onPointerDown(at(-10, 25), host);

    expect(host.added.length).toBe(1);
    const shape = host.added[0] as RectShape;
    expect(shape.type).toBe('rect');
    expect(shape.p1).toEqual(at(-10, -10));
    expect(shape.p2).toEqual(at(110, 60));
  });

  it('shrinks the rect inward when clicked inside it', () => {
    const tool = new OffsetTool();
    const host = makeHost([rect]);

    tool.onPointerDown(at(10, 25), host);

    expect(host.added.length).toBe(1);
    const shape = host.added[0] as RectShape;
    expect(shape.p1).toEqual(at(10, 10));
    expect(shape.p2).toEqual(at(90, 40));
  });

  it('refuses to shrink past zero width or height', () => {
    const tool = new OffsetTool();
    const host = makeHost([rect]);

    // 25mm in from every edge would flatten the 50mm-tall rect to nothing.
    tool.onPointerDown(at(50, 25), host);
    tool.onKeyDown(new KeyboardEvent('keydown', { key: '-' }), host);
    tool.onKeyDown(new KeyboardEvent('keydown', { key: '3' }), host);
    tool.onKeyDown(new KeyboardEvent('keydown', { key: '0' }), host);
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }), host);

    expect(host.added).toEqual([]);
  });

  it('leaves rect out of a mixed selection\'s joined-chain offset, but still offsets it', () => {
    const tool = new OffsetTool();
    const line: DraftShape = { id: 'l1', type: 'line', start: at(0, 0), end: at(100, 0) };
    const host = makeHost([rect, line]);

    tool.onPointerDown(at(-10, 25), host);

    expect(host.added.map(s => s.type).sort()).toEqual(['line', 'rect']);
  });
});
