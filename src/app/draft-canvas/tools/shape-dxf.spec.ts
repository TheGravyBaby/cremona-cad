// @vitest-environment node
import { DraftShape } from './toolbox-shape';
import { dxfToShapes, shapesToDxf } from './shape-dxf';
import { distanceToShape, shapeBounds } from './shape-hit-test';

type Entity = { type: string; codes: Map<number, string[]> };

function parse(dxf: string): { layers: string[]; entities: Entity[] } {
  const raw = dxf.trim().split('\n');
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([Number(raw[i]), raw[i + 1]]);
  const layers: string[] = [];
  const entities: Entity[] = [];
  let section = '';
  let current: Entity | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code === 2 && pairs[i - 1]?.[1] === 'SECTION') section = value;
    if (code === 0) {
      current = null;
      if (value === 'ENDSEC') section = '';
      else if (section === 'ENTITIES') entities.push(current = { type: value, codes: new Map() });
      if (section === 'TABLES' && value === 'LAYER' && pairs[i + 1]?.[0] === 2) layers.push(pairs[i + 1][1]);
      continue;
    }
    if (current) current.codes.set(code, [...(current.codes.get(code) ?? []), value]);
  }
  return { layers, entities };
}

const num = (e: Entity, code: number): number => Number(e.codes.get(code)![0]);

describe('shapesToDxf', () => {
  const sample: DraftShape[] = [
    { id: 'l', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 5 } },
    { id: 'a', type: 'arc', center: { x: 5, y: 5 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2 },
    { id: 'c', type: 'circle', center: { x: -3, y: 4 }, radius: 2 },
    { id: 'r', type: 'rect', p1: { x: 1, y: 2 }, p2: { x: 11, y: 22 } },
    { id: 'p', type: 'path', d: 'M 0 0 L 10 0 A 5 5 0 0 1 10 10 Z' },
    { id: 't', type: 'text', position: { x: 3, y: 7 }, text: 'one\ntwo', fontSize: 4 },
    { id: 'd', type: 'dimension', start: { x: 0, y: 0 }, end: { x: 30, y: 0 }, offset: 5 },
    { id: 's', type: 'section', start: { x: 0, y: 0 }, end: { x: 30, y: 0 }, weights: [1, 2], color2: '#000', label: true },
    { id: 'k', type: 'ticks', start: { x: 0, y: 0 }, end: { x: 30, y: 0 }, weights: [1, 1, 1] },
    { id: 'pt', type: 'point', position: { x: 9, y: 9 } },
    { id: 'f', type: 'freehand', points: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 1 }] },
  ];

  it('keeps arcs and circles as true curves', () => {
    const arc = parse(shapesToDxf([sample[1]])).entities;
    expect(arc.map(e => e.type)).toEqual(['ARC']);
    expect(num(arc[0], 40)).toBeCloseTo(10);
    expect(parse(shapesToDxf([sample[2]])).entities.map(e => e.type)).toEqual(['CIRCLE']);
  });

  it('sweeps an arc counterclockwise from its start angle to its end, as DXF reads it', () => {
    const shape: DraftShape = { id: 'a', type: 'arc', center: { x: 0, y: 0 }, radius: 4, startAngle: 3, endAngle: 1 };
    const [arc] = parse(shapesToDxf([shape])).entities;
    expect(num(arc, 50)).toBeCloseTo(3 * 180 / Math.PI, 3);
    expect(num(arc, 51)).toBeCloseTo(1 * 180 / Math.PI, 3);
  });

  it('writes world coordinates unflipped, so each shape lands inside its own bounds', () => {
    for (const shape of sample.filter(s => s.type !== 'text' && s.type !== 'dimension')) {
      const b = shapeBounds(shape);
      const slack = 3;
      for (const e of parse(shapesToDxf([shape])).entities) {
        for (const [xc, yc] of [[10, 20], [11, 21]]) {
          if (!e.codes.has(xc)) continue;
          expect(num(e, xc)).toBeGreaterThanOrEqual(b.x0 - slack);
          expect(num(e, xc)).toBeLessThanOrEqual(b.x1 + slack);
          expect(num(e, yc)).toBeGreaterThanOrEqual(b.y0 - slack);
          expect(num(e, yc)).toBeLessThanOrEqual(b.y1 + slack);
        }
      }
    }
  });

  it('closes a rect as four lines meeting end to end', () => {
    const lines = parse(shapesToDxf([sample[3]])).entities;
    expect(lines.every(e => e.type === 'LINE')).toBe(true);
    for (let i = 0; i < lines.length; i++) {
      const next = lines[(i + 1) % lines.length];
      expect(num(lines[i], 11)).toBeCloseTo(num(next, 10));
      expect(num(lines[i], 21)).toBeCloseTo(num(next, 20));
    }
  });

  it('writes one TEXT per line of a multi-line text', () => {
    const texts = parse(shapesToDxf([sample[5]])).entities.filter(e => e.type === 'TEXT');
    expect(texts.map(e => e.codes.get(1)![0])).toEqual(['one', 'two']);
    expect(num(texts[0], 20)).toBeGreaterThan(num(texts[1], 20));
  });

  it('puts each shape on its layer, declared in the table under a name R12 accepts', () => {
    const dxf = shapesToDxf(sample, s => s.id === 'c' ? 'Purfling channel: outer' : s.id === 'pt' ? undefined : 'Outline');
    const { layers, entities } = parse(dxf);
    expect(entities.length).toBeGreaterThan(sample.length);
    for (const e of entities) expect(layers).toContain(e.codes.get(8)![0]);
    for (const name of layers) expect(name).toMatch(/^[A-Za-z0-9$_-]{1,31}$/);
    const layerOf = (type: string) => entities.find(e => e.type === type)!.codes.get(8)![0];
    expect(layerOf('CIRCLE')).not.toBe(layerOf('ARC'));
    expect(layerOf('POINT')).toBe('0');
  });
});

describe('dxfToShapes', () => {
  // a DXF as another program writes one: group code and value on alternating lines, CRLF, indented codes
  const dxf = (header: string, entities: string) =>
    ['0', 'SECTION', '2', 'HEADER', header, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', entities, '0', 'ENDSEC', '0', 'EOF']
      .filter(Boolean).join('\r\n').replace(/^(\d+)$/gm, '  $1');
  const lines = (...pairs: (string | number)[]) => pairs.map(String).join('\n');

  it('refuses text that is not DXF', () => {
    expect(dxfToShapes('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBeNull();
    expect(dxfToShapes('hello\nworld')).toBeNull();
  });

  it('reads back what shapesToDxf writes, on the same geometry', () => {
    const shapes: DraftShape[] = [
      { id: 'l', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 5 } },
      { id: 'a', type: 'arc', center: { x: 5, y: 5 }, radius: 10, startAngle: 5.5, endAngle: 1 },
      { id: 'c', type: 'circle', center: { x: -3, y: 4 }, radius: 2 },
      { id: 'pt', type: 'point', position: { x: 9, y: 9 } },
    ];
    const back = dxfToShapes(shapesToDxf(shapes))!;
    expect(back.map(s => s.type)).toEqual(shapes.map(s => s.type));
    back.forEach((b, i) => {
      const bb = shapeBounds(b), ob = shapeBounds(shapes[i]);
      for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(bb[k]).toBeCloseTo(ob[k], 3);
    });
  });

  it('brings a text back as one shape per line, in place and with DXF\'s degree sign as °', () => {
    const shape: DraftShape = { id: 't', type: 'text', position: { x: 3, y: 7 }, text: '30°', fontSize: 4, rotationDeg: 20 };
    const back = dxfToShapes(shapesToDxf([shape]))!;
    expect(back).toHaveLength(1);
    const t = back[0] as Extract<DraftShape, { type: 'text' }>;
    expect(t.text).toBe('30°');
    expect(t.position.x).toBeCloseTo(3, 3);
    expect(t.position.y).toBeCloseTo(7, 3);
    expect(t.rotationDeg).toBeCloseTo(20, 3);
  });

  it('scales by $INSUNITS', () => {
    const [line] = dxfToShapes(dxf(lines(9, '$INSUNITS', 70, 1), lines(0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 1, 21, 0)))! as any[];
    expect(line.end.x).toBeCloseTo(25.4);
  });

  it('turns a bulged polyline into one closed path through its vertices, the bulge as a true arc', () => {
    // a 10 x 10 square whose right side bulges out into a semicircle: bulge 1 is a half turn
    const text = dxf('', lines(0, 'LWPOLYLINE', 8, '0', 90, 4, 70, 1,
      10, 0, 20, 0, 10, 10, 20, 0, 42, 1, 10, 10, 20, 10, 10, 0, 20, 10));
    const [path] = dxfToShapes(text)! as any[];
    expect(path.type).toBe('path');
    const arcs = [...path.d.matchAll(/A ([\d.]+) /g)];
    expect(arcs).toHaveLength(1);
    expect(Number(arcs[0][1])).toBeCloseTo(5);
    expect(path.d.trim().endsWith('Z')).toBe(true);
    const ends = (path.d as string).split(/(?=[MLA])/).map(c => c.replace('Z', '').trim().split(' ').slice(-2).map(Number));
    expect(ends).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
    // the bulge swings out to the right, away from the square
    expect(distanceToShape({ x: 15, y: 5 }, path)).toBeLessThan(0.05);
    expect(distanceToShape({ x: 5, y: 5 }, path)).toBeGreaterThan(4);
  });

  it('samples a spline from its end control point to its end control point when the knots are clamped', () => {
    const text = dxf('', lines(0, 'SPLINE', 8, '0', 70, 8, 71, 3, 72, 8, 73, 4,
      40, 0, 40, 0, 40, 0, 40, 0, 40, 1, 40, 1, 40, 1, 40, 1,
      10, 0, 20, 0, 10, 5, 20, 10, 10, 15, 20, 10, 10, 20, 20, 0));
    const [path] = dxfToShapes(text)! as any[];
    expect(path.d.startsWith('M 0 0 ')).toBe(true);
    expect(path.d.trim().endsWith('L 20 0')).toBe(true);
    // a cubic Bézier's midpoint is (P0 + 3P1 + 3P2 + P3) / 8
    expect(distanceToShape({ x: 10, y: 7.5 }, path)).toBeLessThan(0.05);
  });

  it('runs a spline given only by fit points smoothly through every one of them', () => {
    const fit = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }];
    const text = dxf('', lines(0, 'SPLINE', 8, '0', 70, 8, 71, 3, 74, 4, ...fit.flatMap(p => [11, p.x, 21, p.y])));
    const [path] = dxfToShapes(text)! as any[];
    const vertices = (path.d as string).split(/(?=[ML])/).map(c => c.trim().split(' ').slice(1).map(Number));
    for (const p of fit) expect(vertices.some(([x, y]) => Math.hypot(x - p.x, y - p.y) < 1e-9)).toBe(true);
    // more than the fit points themselves: a curve, not their polygon
    expect(vertices.length).toBeGreaterThan(fit.length * 4);
  });

  it('draws a full ellipse as a closed path within its axes', () => {
    const text = dxf('', lines(0, 'ELLIPSE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0, 40, 0.5, 41, 0, 42, 6.283185307179586));
    const [path] = dxfToShapes(text)! as any[];
    const b = shapeBounds(path);
    expect(b.x1 - b.x0).toBeCloseTo(20, 1);
    expect(b.y1 - b.y0).toBeCloseTo(10, 1);
    expect(path.d.trim().endsWith('Z')).toBe(true);
  });
});
