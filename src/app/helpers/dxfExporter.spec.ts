import { downloadDxfFile, pathToDxfEntities } from './dxfExporter';

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
async function captured(run: () => void): Promise<{ name: string; text: string }> {
  let blob: Blob | undefined;
  let name = '';
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b: any) => { blob = b; return 'blob:test'; });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    name = this.download;
  });
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
  return { name, text };
}

describe('pathToDxfEntities', () => {
  it('turns a move-and-line into one segment between the two points', () => {
    expect(pathToDxfEntities('M 0 0 L 10 20')).toEqual([
      { type: 'LINE', x0: 0, y0: 0, x1: 10, y1: 20 },
    ]);
  });

  it('carries coordinates through unflipped', () => {
    // Draft space is already Y-up and so is DXF, so an export that "helpfully"
    // flipped Y would mirror every template top to bottom.
    const [line] = pathToDxfEntities('M 1 2 L 3 4') as any[];
    expect([line.x0, line.y0, line.x1, line.y1]).toEqual([1, 2, 3, 4]);
  });

  it('chains a multi-point line, each segment starting where the last ended', () => {
    const entities = pathToDxfEntities('M 0 0 L 1 0 L 1 1 L 0 1') as any[];
    expect(entities).toHaveLength(3);
    for (let i = 1; i < entities.length; i++) {
      expect([entities[i].x0, entities[i].y0]).toEqual([entities[i - 1].x1, entities[i - 1].y1]);
    }
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

  it('flattens the bezier commands, which DXF has no equivalent for', () => {
    expect(pathToDxfEntities('M 0 0 Q 5 10 10 0').every(e => e.type === 'LINE')).toBe(true);
    expect(pathToDxfEntities('M 0 0 C 0 5 10 5 10 0').every(e => e.type === 'LINE')).toBe(true);
    // A cubic gets the finer flattening of the two — it can carry an inflection
    // a quadratic cannot, so the same segment count would read as a crease.
    expect(pathToDxfEntities('M 0 0 C 0 5 10 5 10 0').length)
      .toBeGreaterThan(pathToDxfEntities('M 0 0 Q 5 10 10 0').length);
  });

  it('closes a subpath back to where it began', () => {
    const entities = pathToDxfEntities('M 0 0 L 10 0 L 10 10 Z') as any[];
    const last = entities[entities.length - 1];
    expect([last.x1, last.y1]).toEqual([0, 0]);
  });

  it('adds no closing segment when the path already arrived home', () => {
    expect(pathToDxfEntities('M 0 0 L 10 0 L 0 0 Z')).toHaveLength(2);
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

  it('ignores a path with nothing in it', () => {
    expect(pathToDxfEntities('')).toEqual([]);
  });
});

describe('the DXF file', () => {
  const SQUARE = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';

  it('is a complete R12 drawing in millimetres', async () => {
    // $INSUNITS 4 is millimetres. Without it a CAD package assumes its own
    // default, and a 355mm plate arrives 355 inches long.
    const { text } = await captured(() => downloadDxfFile('t.dxf', SQUARE));
    expect(text).toContain('SECTION');
    expect(text).toContain('HEADER');
    expect(text).toContain('ENTITIES');
    expect(text.trimEnd().endsWith('EOF')).toBe(true);
    expect(text).toMatch(/\$INSUNITS\n\s*70\n4/);
    expect(text).toMatch(/\$ACADVER\n\s*1\nAC1009/);
  });

  it('writes one LINE per segment', async () => {
    const { text } = await captured(() => downloadDxfFile('t.dxf', SQUARE));
    const lines = text.split('\n');
    const count = lines.filter((l, i) => l === 'LINE' && lines[i - 1] === '0').length;
    expect(count).toBe(4);
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

  it('downloads under the name it was given', async () => {
    const { name } = await captured(() => downloadDxfFile('violin-mould.dxf', SQUARE));
    expect(name).toBe('violin-mould.dxf');
  });
});
