import * as d3 from 'd3';
import { TestBed } from '@angular/core/testing';
import { Pt } from '../../models/types';
import { DraftToolHost } from './draft-tool';
import { TicksShape } from './toolbox-shape';
import { drawTicks, tickLengthMm } from './shape-renderer';
import { distanceToShape, shapeBounds } from './shape-hit-test';
import { withEndpoint } from './shape-grabbers';
import { createTicksTool } from './ticks-tool';
import { ToolboxStore } from './toolbox-store';

const at = (x: number, y: number): Pt => ({ x, y });

function render(start: Pt, end: Pt, weights: number[]) {
  const svg = d3.create('svg:g') as d3.Selection<SVGGElement, unknown, null, undefined>;
  drawTicks(svg, start, end, weights, '#000');
  return svg;
}

describe('drawTicks', () => {
  it('draws a tick at every division including both ends, across the line', () => {
    const svg = render(at(0, 0), at(100, 0), [1, 1, 2]);
    const ticks = svg.selectAll<SVGLineElement, unknown>('line[data-no-snap]').nodes();

    expect(ticks.length).toBe(4);
    ticks.map(t => Number(t.getAttribute('x1')))
      .forEach((x, i) => expect(x).toBeCloseTo([0, 25, 50, 100][i], 6));
    const [y1, y2] = [Number(ticks[1].getAttribute('y1')), Number(ticks[1].getAttribute('y2'))];
    expect(Math.abs(y1 - y2)).toBeCloseTo(tickLengthMm(100), 6);
  });

  it('scales ticks with the line up to a cap', () => {
    const tickSpan = (len: number) => {
      const t = render(at(0, 0), at(len, 0), [1, 1]).select<SVGLineElement>('line[data-no-snap]').node()!;
      return Math.abs(Number(t.getAttribute('y1')) - Number(t.getAttribute('y2')));
    };

    expect(tickSpan(20)).toBeCloseTo(1, 6);
    expect(tickSpan(20)).toBeLessThan(tickSpan(60));
    expect(tickSpan(100)).toBe(tickSpan(600));
  });

  it('adds an exact snap point for interior ticks only', () => {
    const svg = render(at(0, 0), at(90, 0), [1, 1, 1]);
    const points = svg.selectAll<SVGCircleElement, unknown>('circle').nodes()
      .map(c => Number(c.getAttribute('cx')));

    expect(points.length).toBe(2);
    expect(points[0]).toBeCloseTo(30, 6);
    expect(points[1]).toBeCloseTo(60, 6);
  });

  it('follows the line at an angle', () => {
    const svg = render(at(0, 0), at(0, 60), [1, 1]);
    const points = svg.selectAll<SVGCircleElement, unknown>('circle').nodes();

    expect(Number(points[0].getAttribute('cx'))).toBeCloseTo(0, 6);
    expect(Number(points[0].getAttribute('cy'))).toBeCloseTo(30, 6);
  });

  it('draws nothing for a zero-length line', () => {
    expect(render(at(5, 5), at(5, 5), [1, 1]).selectAll('*').size()).toBe(0);
  });
});

describe('Ticks shape', () => {
  const shape: TicksShape = { id: 't1', type: 'ticks', start: at(0, 0), end: at(100, 0), weights: [1, 1] };

  it('is hit along its line and nowhere off it', () => {
    expect(distanceToShape(at(50, 0), shape)).toBe(0);
    expect(distanceToShape(at(50, 8), shape)).toBe(8);
  });

  it('bounds include the tick overhang', () => {
    const b = shapeBounds(shape);
    expect(b.y0).toBe(-tickLengthMm(100) / 2);
    expect(b.y1).toBe(tickLengthMm(100) / 2);
    expect(b.x0).toBe(-tickLengthMm(100) / 2);
  });

  it('moves an endpoint without touching the weights', () => {
    const moved = withEndpoint(shape, 'end', at(200, 0)) as TicksShape;
    expect(moved.end).toEqual(at(200, 0));
    expect(moved.weights).toEqual([1, 1]);
  });
});

describe('createTicksTool', () => {
  it('commits a shape carrying the pen weights', () => {
    const toolbox = TestBed.inject(ToolboxStore);
    toolbox.currentTickWeights = [3, 4, 3];
    const added: TicksShape[] = [];
    const host = {
      addShape: (s: TicksShape) => { added.push(s); },
      requestDraw: () => { },
      getSnapTangent: () => undefined,
      isAngleLockHeld: () => false,
      isTangentLockHeld: () => false,
      getPxPerMm: () => 1,
      returnToSelect: () => { },
    } as unknown as DraftToolHost;

    const tool = createTicksTool(toolbox);
    tool.onPointerDown(at(0, 0), host);
    tool.onPointerMove(at(100, 0), host);
    tool.onPointerUp(at(100, 0), host);

    expect(added.length).toBe(1);
    expect(added[0].type).toBe('ticks');
    expect(added[0].weights).toEqual([3, 4, 3]);
    expect(added[0].end).toEqual(at(100, 0));
  });
});
