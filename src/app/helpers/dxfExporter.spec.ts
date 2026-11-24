import { bezierSplineKnots, downloadDxfFile, pathToDxfEntities } from './dxfExporter';

/**
 * DXF output — the format that goes to a CNC or a CAD package.
 *
 * Untested until now, and the least forgiving of the three exporters: a wrong
 * group code or a mis-parsed command does not throw here, it produces a file
 * that another program opens as empty, or as the right shape with one curve
 * replaced by a chord. Nothing in this app would show it.
 *
 * The load-bearing claim is that arcs stay arcs. Flattening an outline to line
 * segments would still cut roughly the right shape, which is exactly why it
 * would go unnoticed on screen and show up as faceting on the wood.
 */

/** Captures what a download helper would have written, without navigating. */
async function captured(run: () => void): Promise<{ text: string }> {
  let blob: Blob | undefined;
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b: any) => { blob = b; return 'blob:test'; });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  try {
    run();
  } finally {
    create.mockRestore(); revoke.mockRestore(); click.mockRestore();
  }
  // Not `blob.text()` — this environment's Blob does not carry it.
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob!);
  });
  return { text };
}

describe('pathToDxfEntities', () => {
  it('carries coordinates through unflipped', () => {
    // Draft space is already Y-up and so is DXF, so an export that "helpfully"
    // flipped Y would mirror every template top to bottom.
    const [line] = pathToDxfEntities('M 1 2 L 3 4') as any[];
    expect([line.x0, line.y0, line.x1, line.y1]).toEqual([1, 2, 3, 4]);
  });

  it('joins a run of segments into one polyline through every point in order', () => {
    const entities = pathToDxfEntities('M 0 0 L 1 0 L 1 1 L 0 1') as any[];
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe('LWPOLYLINE');
    expect(entities[0].closed).toBe(false);
    expect(entities[0].points.map((pt: any) => [pt.x, pt.y])).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
  });

  it('breaks a run where a curve comes between, and closes after a curve with a segment', () => {
    const entities = pathToDxfEntities('M 0 0 L 10 0 L 10 10 A 10 10 0 0 1 0 20 L -5 20 L -5 10 Z') as any[];
    expect(entities.map(e => e.type)).toEqual(['LWPOLYLINE', 'ARC', 'LWPOLYLINE']);
    const last = entities[2];
    expect(last.closed).toBe(false);
    expect(last.points.at(-1)).toEqual({ x: 0, y: 0 });
  });

  it('keeps an arc as an arc rather than flattening it', () => {
    const entities = pathToDxfEntities('M 10 0 A 10 10 0 0 1 0 10');
    expect(entities).toHaveLength(1);
    const arc = entities[0] as any;
    expect(arc.type).toBe('ARC');
    expect(arc.cx).toBeCloseTo(0, 6);
    expect(arc.cy).toBeCloseTo(0, 6);
    expect(arc.r).toBeCloseTo(10, 6);
  });

  it('reorders a clockwise arc into the counter-clockwise sweep DXF requires', () => {
    // DXF ARC always sweeps CCW from start to end, so a clockwise SVG arc is
    // represented by swapping the bounds. Getting this wrong keeps both
    // endpoints and draws the complementary arc — the shape inverted between
    // the two points, not an obviously broken file.
    const ccw = pathToDxfEntities('M 10 0 A 10 10 0 0 1 0 10')[0] as any;
    const cw = pathToDxfEntities('M 0 10 A 10 10 0 0 0 10 0')[0] as any;
    expect(cw.startAngleDeg).toBeCloseTo(ccw.startAngleDeg, 6);
    expect(cw.endAngleDeg).toBeCloseTo(ccw.endAngleDeg, 6);
  });

  it('reports angles in degrees, normalized to a positive turn', () => {
    for (const d of ['M 10 0 A 10 10 0 0 1 0 10', 'M 0 -10 A 10 10 0 0 1 10 0']) {
      const arc = pathToDxfEntities(d)[0] as any;
      for (const a of [arc.startAngleDeg, arc.endAngleDeg]) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(360);
      }
    }
  });

  it('keeps a run of beziers as one spline through their own control points, broken by a line', () => {
    const entities = pathToDxfEntities('M 0 0 C 0 5 10 5 10 0 C 10 -5 20 -5 20 0 L 30 0 C 30 5 40 5 40 0') as any[];
    expect(entities.map(e => e.type)).toEqual(['SPLINE', 'LINE', 'SPLINE']);
    expect(entities[0].points).toHaveLength(7);
    expect(entities[0].points[0]).toEqual({ x: 0, y: 0 });
    expect(entities[0].points[6]).toEqual({ x: 20, y: 0 });
    expect(entities[2].points[0]).toEqual({ x: 30, y: 0 });
  });

  it('raises a quadratic to the cubic it equals', () => {
    const [spline] = pathToDxfEntities('M 0 0 Q 5 10 10 0') as any[];
    const [p0, c1, c2, p1] = spline.points;
    for (const t of [0.1, 0.3, 0.5, 0.8]) {
      const v = 1 - t;
      const quad = { x: 2 * v * t * 5 + t * t * 10, y: 2 * v * t * 10 };
      const cubic = {
        x: v ** 3 * p0.x + 3 * v * v * t * c1.x + 3 * v * t * t * c2.x + t ** 3 * p1.x,
        y: v ** 3 * p0.y + 3 * v * v * t * c1.y + 3 * v * t * t * c2.y + t ** 3 * p1.y,
      };
      expect(cubic.x).toBeCloseTo(quad.x, 12);
      expect(cubic.y).toBeCloseTo(quad.y, 12);
    }
  });

  it('knots bezier spans clamped at both ends and thrice at every join', () => {
    for (const spans of [1, 2, 5]) {
      const knots = bezierSplineKnots(spans);
      // control points + degree + 1
      expect(knots).toHaveLength(3 * spans + 1 + 4);
      for (let i = 1; i < knots.length; i++) expect(knots[i]).toBeGreaterThanOrEqual(knots[i - 1]);
      for (let j = 1; j < spans; j++) expect(knots.filter(k => k === j)).toHaveLength(3);
    }
  });

  it('closes a subpath back to where it began as a closed polyline', () => {
    const [poly] = pathToDxfEntities('M 0 0 L 10 0 L 10 10 Z') as any[];
    expect(poly.closed).toBe(true);
    expect(poly.points.map((pt: any) => [pt.x, pt.y])).toEqual([[0, 0], [10, 0], [10, 10]]);
  });

  it('repeats no point when the path already arrived home before closing', () => {
    const entities = pathToDxfEntities('M 0 0 L 10 0 L 10 10 L 0 0 Z') as any[];
    expect(entities).toHaveLength(1);
    expect(entities[0].closed).toBe(true);
    expect(entities[0].points).toHaveLength(3);
  });

  it('reads scientific notation as a number, not as a new command', () => {
    // Near-zero coordinates come out of JS as "6.12e-15", and the exponent
    // letter sits in the middle of a coordinate. A command matcher that
    // accepted every letter would split there and silently drop the rest of
    // the outline — the reason the matcher is restricted to this app's own
    // command set.
    const entities = pathToDxfEntities('M 6.12e-15 0 L 10 3.5e-8') as any[];
    expect(entities).toHaveLength(1);
    expect(entities[0].x0).toBeCloseTo(0, 12);
    expect(entities[0].y1).toBeCloseTo(0, 6);
  });
});

describe('the DXF file', () => {
  const SQUARE = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';

  it('is a complete R2000 drawing in millimetres', async () => {
    // $INSUNITS 4 is millimetres. Without it a CAD package assumes its own
    // default, and a 355mm plate arrives 355 inches long.
    const { text } = await captured(() => downloadDxfFile('t.dxf', SQUARE));
    expect(text).toContain('SECTION');
    expect(text).toContain('HEADER');
    expect(text).toContain('ENTITIES');
    expect(text.trimEnd().endsWith('EOF')).toBe(true);
    expect(text).toMatch(/\$INSUNITS\n\s*70\n4/);
    expect(text).toMatch(/\$ACADVER\n\s*1\nAC1015/);
  });

  it('gives every object its own handle and points every owner at one, the next free handle in the header', async () => {
    // R2000 readers resolve these: a duplicate or dangling handle is what makes a strict reader
    // refuse the file outright
    const { text } = await captured(() => downloadDxfFile('t.dxf', 'M 0 0 L 10 0 A 10 10 0 0 1 0 10 C 0 15 5 20 10 20 Z', [{ text: 'UB', x: 5, y: 5, height: 5 }]));
    const lines = text.split('\n');
    const pairs = Array.from({ length: Math.floor(lines.length / 2) }, (_, i) => [lines[2 * i].trim(), lines[2 * i + 1]]);
    const seed = pairs.findIndex(([code, value]) => code === '9' && value === '$HANDSEED');
    const handles = pairs.filter(([code], i) => (code === '5' || code === '105') && i !== seed + 1).map(([, v]) => parseInt(v, 16));
    expect(new Set(handles).size).toBe(handles.length);
    expect(parseInt(pairs[seed + 1][1], 16)).toBeGreaterThan(Math.max(...handles));
    for (const [code, value] of pairs) if (code === '330' || code === '350') expect(value === '0' || handles.includes(parseInt(value, 16)), `${code} ${value}`).toBe(true);
  });

  it('writes a spline whose knots and control points agree in number', async () => {
    const { text } = await captured(() => downloadDxfFile('t.dxf', 'M 0 0 C 0 5 10 5 10 0 C 10 -5 20 -5 20 0'));
    const lines = text.split('\n');
    const at = lines.findIndex((l, i) => l === 'SPLINE' && lines[i - 1].trim() === '0');
    const group = (code: string) => {
      const out: string[] = [];
      for (let i = at + 1; i < lines.length && lines[i].trim() !== '0'; i += 2) if (lines[i].trim() === code) out.push(lines[i + 1]);
      return out;
    };
    expect(group('71')).toEqual(['3']);
    expect(Number(group('72')[0])).toBe(group('40').length);
    expect(Number(group('73')[0])).toBe(group('10').length);
    expect(group('40').length).toBe(group('10').length + 4);
  });

  it('writes a closed outline as one closed LWPOLYLINE of its corners', async () => {
    const { text } = await captured(() => downloadDxfFile('t.dxf', SQUARE));
    const lines = text.split('\n');
    const count = (type: string) => lines.filter((l, i) => l === type && lines[i - 1] === '0').length;
    expect(count('LWPOLYLINE')).toBe(1);
    expect(count('LINE')).toBe(0);
    const at = lines.findIndex((l, i) => l === 'LWPOLYLINE' && lines[i - 1] === '0');
    const codes = new Map<string, string[]>();
    for (let i = at + 1; i < lines.length && lines[i].trim() !== '0'; i += 2) codes.set(lines[i].trim(), [...(codes.get(lines[i].trim()) ?? []), lines[i + 1]]);
    expect(codes.get('90')).toEqual(['4']);
    expect(codes.get('70')).toEqual(['1']);
    expect(codes.get('10')).toHaveLength(4);
    expect(codes.get('20')).toHaveLength(4);
  });

  it('writes an ARC with its centre, radius and both bounds', async () => {
    const { text } = await captured(() => downloadDxfFile('t.dxf', 'M 10 0 A 10 10 0 0 1 0 10'));
    expect(text).toContain('ARC');
    // 40 = radius, 50/51 = start/end angle — an arc missing either bound is
    // read as a full circle by most importers.
    expect(text).toMatch(/\n40\n10\.0000/);
    expect(text).toMatch(/\n50\n/);
    expect(text).toMatch(/\n51\n/);
  });

  it('writes labels as justified TEXT carrying their own alignment point', async () => {
    const { text } = await captured(() => downloadDxfFile('t.dxf', SQUARE, [
      { text: 'UB', x: 5, y: 5, height: 5, rotationDeg: 90 },
    ]));
    expect(text).toContain('TEXT');
    expect(text).toContain('UB');
    expect(text).toMatch(/\n50\n90\.0000/);
    // Codes 72/73 set middle-centre justification, which only takes effect if
    // the alignment point (11/21) is written too.
    expect(text).toMatch(/\n72\n1/);
    expect(text).toMatch(/\n11\n5\.0000/);
  });

  it('keeps every emitted number finite', async () => {
    const { text } = await captured(() => downloadDxfFile('t.dxf', SQUARE));
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
  });
});
