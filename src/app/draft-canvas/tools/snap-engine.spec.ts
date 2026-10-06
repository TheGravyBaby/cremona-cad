import * as d3 from 'd3';
import { SnapEngine } from './snap-engine';

// jsdom has no path geometry, so each element is given the arc-length functions of a known curve
function pathElement(total: number, at: (s: number) => { x: number; y: number }): SVGGeometryElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGGeometryElement;
  el.setAttribute('d', 'M0 0');
  Object.assign(el, { getTotalLength: () => total, getPointAtLength: at });
  return el;
}

describe('SnapEngine', () => {
  const layer = () => d3.select(document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement);

  it('snaps onto the exact closest point of a curve, not the nearest sample', () => {
    const g = layer();
    g.node()!.appendChild(pathElement(100, s => ({ x: s, y: 0 })));
    const engine = new SnapEngine();
    engine.rebuild(g);
    const hit = engine.nearest({ x: 37.3, y: 0.2 }, 1)!;
    expect(hit.kind).toBe('path');
    expect(hit.pt.x).toBeCloseTo(37.3, 4);
    expect(hit.pt.y).toBeCloseTo(0, 6);
  });

  it('finds a curve that passes within tolerance between two samples that miss it', () => {
    const r = 10;
    const g = layer();
    g.node()!.appendChild(pathElement(2 * Math.PI * r, s => ({ x: r * Math.cos(s / r), y: r * Math.sin(s / r) })));
    const engine = new SnapEngine();
    engine.rebuild(g);
    // 0.1 mm outside the circle, half-way between two samples that are each about 1 mm away
    const angle = 0.912;
    const hit = engine.nearest({ x: 10.1 * Math.cos(angle), y: 10.1 * Math.sin(angle) }, 0.5)!;
    expect(hit).not.toBeNull();
    expect(Math.hypot(hit.pt.x, hit.pt.y)).toBeCloseTo(r, 5);
    expect(Math.atan2(hit.pt.y, hit.pt.x)).toBeCloseTo(angle, 5);
  });

  it('keeps preferring an endpoint within tolerance over the curve beside it', () => {
    const g = layer();
    g.node()!.appendChild(pathElement(100, s => ({ x: s, y: 0 })));
    const engine = new SnapEngine();
    engine.rebuild(g);
    expect(engine.nearest({ x: 0.4, y: 0.1 }, 1)!.kind).toBe('endpoint');
    expect(engine.nearest({ x: 50, y: 3 }, 1)).toBeNull();
  });

  it('snaps to where a path inside transformed groups is drawn, not to its local coordinates', () => {
    const g = layer();
    const moved = g.append('g').attr('transform', 'translate(-200,0)');
    const turned = moved.append('g').attr('transform', 'rotate(90)');
    turned.node()!.appendChild(pathElement(100, s => ({ x: s, y: 0 })));
    const engine = new SnapEngine();
    engine.rebuild(g);

    expect(engine.nearest({ x: 30, y: 0 }, 1)).toBeNull();
    const end = engine.nearest({ x: -200.3, y: 100.2 }, 1)!;
    expect(end.kind).toBe('endpoint');
    expect(end.pt.x).toBeCloseTo(-200, 6);
    expect(end.pt.y).toBeCloseTo(100, 6);
    const on = engine.nearest({ x: -199.6, y: 42.5 }, 1)!;
    expect(on.kind).toBe('path');
    expect(on.pt.x).toBeCloseTo(-200, 4);
    expect(on.pt.y).toBeCloseTo(42.5, 4);
    expect(on.tangent).toBeCloseTo(Math.PI / 2, 4);
  });
});
