// @vitest-environment node
import { Arc, Circle, Rectangle } from '../../models/types';
import {
  renderArcFromArc, renderArcHalo, renderBoxLine, renderCircle, renderCrosshair, renderRect, renderSegment,
  renderText,
} from '../../helpers/renderFuncs';
import { RecordableLayer } from '../../helpers/layer-recorder';
import { pointOnCircle } from '../../helpers/math/simpleGeometry';
import { sceneShapesFromLayers } from './scene-index';
import { ArcShape, DraftShape } from './toolbox-shape';
import { distanceToShape } from './shape-hit-test';

describe('sceneShapesFromLayers', () => {
  const only = <T extends DraftShape['type']>(shapes: DraftShape[], type: T) =>
    shapes.filter((s): s is Extract<DraftShape, { type: T }> => s.type === type);

  it('reads lines, circles, rects and arcs off a render, leaving labels out', () => {
    const arc = new Arc(0, 0, 50, 0, Math.PI / 2);
    const shapes = sceneShapesFromLayers([
      renderSegment({ x: 0, y: 0 }, { x: 10, y: 5 }, '#000'),
      renderCircle(new Circle(3, 4, 5), '#000'),
      renderRect(new Rectangle({ x: 1, y: 2 }, { x: 11, y: 22 }), '#000'),
      renderArcFromArc(arc, '#000'),
      renderText({ x: 0, y: 0 }, 'label', '#000'),
    ]);
    expect(shapes.map(s => s.type)).toEqual(['line', 'circle', 'rect', 'arc']);
    expect(only(shapes, 'circle')[0]).toMatchObject({ center: { x: 3, y: 4 }, radius: 5 });
    expect(only(shapes, 'rect')[0]).toMatchObject({ p1: { x: 1, y: 2 }, p2: { x: 11, y: 22 } });
    const read = only(shapes, 'arc')[0];
    expect(read.center.x).toBeCloseTo(0, 6);
    expect(read.center.y).toBeCloseTo(0, 6);
    expect(read.radius).toBeCloseTo(50, 6);
    expect(read.startAngle).toBeCloseTo(0, 6);
    expect(read.endAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(shapes.every(s => s.color === '#000')).toBe(true);
  });

  it('carries the weight a piece is drawn at, when it is drawn in screen px', () => {
    const [heavy, plain] = sceneShapesFromLayers([
      renderSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, '#000', 2),
      renderSegment({ x: 0, y: 5 }, { x: 10, y: 5 }, '#000'),
    ]);
    expect(heavy.strokeWidth).toBe(2);
    expect(plain.strokeWidth).toBe(1);
  });

  it('keeps an arc\'s direction whichever way the path walks it', () => {
    // renderArcFromArc draws the minor arc, so a start past the end walks clockwise (sweep 0)
    const clockwise = new Arc(10, 10, 20, Math.PI / 2, 0);
    const [read] = sceneShapesFromLayers([renderArcFromArc(clockwise, '#000')]) as ArcShape[];
    const mid = pointOnCircle({ x: 10, y: 10, r: 20 }, Math.PI / 4);
    expect(distanceToShape(mid, read)).toBeLessThan(1e-6);
    const away = pointOnCircle({ x: 10, y: 10, r: 20 }, Math.PI);
    expect(distanceToShape(away, read)).toBeGreaterThan(1);
  });

  it('skips halos, crosshairs and section banding', () => {
    const shapes = sceneShapesFromLayers([
      renderArcHalo(new Arc(0, 0, 50, 0, 1), '#000'),
      renderCrosshair({ x: 5, y: 5 }, '#000'),
      renderBoxLine({ x: 0, y: 0 }, { x: 30, y: 0 }, [1, 1, 1], '#000', '#fff', false),
    ]);
    expect(shapes).toEqual([]);
  });

  it('composes an enclosing group\'s transform into the geometry', () => {
    const turned: RecordableLayer = (g, ui) => {
      const inner = g.append('g').attr('transform', 'translate(100,0) rotate(90)');
      renderSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, '#000')(inner, ui);
      renderArcFromArc(new Arc(0, 0, 10, 0, Math.PI / 2), '#000')(inner, ui);
    };
    const shapes = sceneShapesFromLayers([turned]);
    const line = only(shapes, 'line')[0];
    const ys = [line.start.y, line.end.y].sort((a, b) => a - b);
    expect(line.start.x).toBeCloseTo(100, 6);
    expect(line.end.x).toBeCloseTo(100, 6);
    expect(ys[0]).toBeCloseTo(0, 6);
    expect(ys[1]).toBeCloseTo(10, 6);
    const arc = only(shapes, 'arc')[0];
    expect(arc.center.x).toBeCloseTo(100, 6);
    expect(arc.radius).toBeCloseTo(10, 6);
    expect(arc.startAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(arc.endAngle).toBeCloseTo(Math.PI, 6);
  });

  it('keeps an id across re-renders of the same geometry and tells duplicates apart', () => {
    const layer = renderSegment({ x: 0, y: 0 }, { x: 10, y: 5 }, '#000');
    const [first] = sceneShapesFromLayers([layer]);
    const [again] = sceneShapesFromLayers([renderSegment({ x: 0, y: 0 }, { x: 10, y: 5.00000001 }, '#000')]);
    expect(again.id).toBe(first.id);
    const [moved] = sceneShapesFromLayers([renderSegment({ x: 0, y: 0 }, { x: 10, y: 6 }, '#000')]);
    expect(moved.id).not.toBe(first.id);
    const twice = sceneShapesFromLayers([layer, layer]);
    expect(twice[0].id).toBe(first.id);
    expect(twice[1].id).not.toBe(first.id);
  });

  it('survives a layer that throws', () => {
    const broken: RecordableLayer = () => { throw new Error('solve failed'); };
    const shapes = sceneShapesFromLayers([broken, renderSegment({ x: 0, y: 0 }, { x: 1, y: 1 }, '#000')]);
    expect(shapes.map(s => s.type)).toEqual(['line']);
  });
});
