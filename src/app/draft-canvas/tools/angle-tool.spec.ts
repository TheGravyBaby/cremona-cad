// @vitest-environment node
import { Pt } from '../../models/types';
import { fakeToolHost } from './fake-tool-host';
import { AngleShape, DraftShape, angleSweep } from './toolbox-shape';
import { createAngleTool } from './angle-tool';
import { withEndpoint } from './shape-grabbers';
import { transformShape } from './shape-transform';

const at = (x: number, y: number): Pt => ({ x, y });
const degrees = (s: AngleShape) => angleSweep(s.vertex, s.start, s.end).sweep * 180 / Math.PI;

function measure(place: Pt): AngleShape {
  const tool = createAngleTool();
  const host = fakeToolHost();
  for (const p of [at(0, 0), at(10, 0), at(0, 10)]) {
    tool.onPointerDown(p, host);
    tool.onPointerUp(p, host);
  }
  expect(host.added).toHaveLength(0);
  tool.onPointerDown(place, host);
  return host.added[0] as AngleShape;
}

describe('Angle tool', () => {
  it('reads the inside angle when the arc is placed between the arms', () => {
    const shape = measure(at(5, 5));
    expect(degrees(shape)).toBeCloseTo(90, 9);
    expect(shape.radius).toBeCloseTo(Math.hypot(5, 5), 9);
  });

  it('reads the reflex angle when the arc is placed outside them', () => {
    expect(degrees(measure(at(-5, -5)))).toBeCloseTo(270, 9);
  });

  it('lets the arc handle move the measurement to the other side', () => {
    const shape = withEndpoint(measure(at(5, 5)), 'radius', at(-3, -3)) as AngleShape;
    expect(degrees(shape)).toBeCloseTo(270, 9);
    expect(shape.radius).toBeCloseTo(Math.hypot(3, 3), 9);
  });

  it('keeps measuring the same angle through a mirror', () => {
    const shape = measure(at(5, 5));
    const mirrored = transformShape(shape, [-1, 0, 0, 1, 0, 0]) as AngleShape;
    expect(degrees(mirrored)).toBeCloseTo(90, 9);
  });
});
