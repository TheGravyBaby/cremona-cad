import { Pt } from '../../models/types';
import { fakeToolHost } from './fake-tool-host';
import { OffsetTool } from './offset-tool';
import { DraftShape, LineShape, PathShape, RectShape } from './toolbox-shape';
import { samplePathToPolyline } from '../../helpers/math/pathMath';

const makeHost = (selected: DraftShape[]) => fakeToolHost({ getSelectedShapes: () => selected });

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

describe('OffsetTool on paths', () => {
  const square: DraftShape = { id: 'p1', type: 'path', d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z' };
  const bounds = (s: DraftShape) => {
    const pts = samplePathToPolyline((s as PathShape).d, 0.5, true);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(v => +v.toFixed(6));
  };

  it('grows a closed path from a click outside and shrinks it from one inside', () => {
    const host = makeHost([square]);
    const tool = new OffsetTool();
    tool.onPointerDown(at(-3, 5), host);
    tool.onPointerDown(at(2, 5), host);
    expect(bounds(host.added[0])).toEqual([-3, -3, 13, 13]);
    expect(bounds(host.added[1])).toEqual([2, 2, 8, 8]);
  });

  it('offers nothing where the offset would fold', () => {
    const host = makeHost([square]);
    new OffsetTool().onPointerDown(at(5, 5), host);
    expect(host.added).toEqual([]);
  });

  it('carries a line joined to the end of an open path round with it', () => {
    const path: DraftShape = { id: 'p2', type: 'path', d: 'M 0 0 L 10 0 L 10 10' };
    // drawn back towards the joint, so it only follows if its side is read from its slope
    const line: DraftShape = { id: 'l1', type: 'line', start: at(10, 30), end: at(10, 10) };
    const host = makeHost([path, line]);
    new OffsetTool().onPointerDown(at(5, -2), host);
    const moved = host.added.find(s => s.type === 'line') as LineShape;
    expect(moved.start.x).toBeCloseTo(12, 6);
    expect(bounds(host.added.find(s => s.type === 'path')!)).toEqual([0, -2, 12, 10]);
  });

  it('keeps an arc and the line leaving it leftward together', () => {
    const arc: DraftShape = { id: 'a1', type: 'arc', center: at(0, 0), radius: 10, startAngle: 0, endAngle: Math.PI / 2 };
    const line: DraftShape = { id: 'l2', type: 'line', start: at(0, 10), end: at(-20, 10) };
    const host = makeHost([arc, line]);
    new OffsetTool().onPointerDown(at(12, 0), host);
    expect((host.added.find(s => s.type === 'line') as LineShape).start.y).toBeCloseTo(12, 6);
  });
});
