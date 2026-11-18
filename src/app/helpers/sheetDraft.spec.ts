// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Pt } from '../models/types';
import { pageContentSize, PAPER_FORMATS, SvgPathExport, SvgTextExport } from './fileExporter';
import { parseSvgTransform, pathsBounds } from './math/pathMath';
import {
  buildDrawingPage, buildSchematicPage, calcDrawingBounds, drawView, expandMarks, fitView, formatMm, SCHEMATIC_AREA, SCALE_LADDER, SheetMark, SheetView,
} from './sheetDraft';

// A sheet is read at the bench and cut from, so what matters is that a figure says what its
// arrows measure, that annotation stays one size on the paper whatever the view is drawn at, and
// that nothing a page describes lands off the page.

const box = (w: number, h: number): string => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
const heading = { title: 'An instrument', description: 'A description', note: 'A note' };
const footing = { page: 1, of: 2, name: 'A sheet', credit: 'A credit' };

const textBox = (t: SvgTextExport) => calcDrawingBounds({ paths: [], texts: [t] });
const inside = (b: { minX: number; maxX: number; minY: number; maxY: number }, page: { width: number; height: number }) =>
  b.minX >= -page.width / 2 && b.maxX <= page.width / 2 && b.minY >= 0 && b.maxY <= page.height;
const placed = (path: SvgPathExport) => {
  const b = pathsBounds([path.d]);
  const m = parseSvgTransform(path.transform);
  return { minX: b.minX + m[4], maxX: b.maxX + m[4], minY: b.minY + m[5], maxY: b.maxY + m[5] };
};

describe('a dimension', () => {
  const measures: [Pt, Pt][] = [
    [new Pt(0, 0), new Pt(208, 0)],
    [new Pt(12, 7), new Pt(12, 364.5)],
    [new Pt(-3, 4), new Pt(40.25, 71.3)],
    [new Pt(5, 5), new Pt(8.05, 5)],
  ];

  it('prints the length it measures, whatever the view is drawn at and wherever its line is parked', () => {
    for (const [from, to] of measures) {
      const length = formatMm(Math.hypot(to.x - from.x, to.y - from.y));
      for (const scale of SCALE_LADDER) {
        for (const mark of [{ kind: 'dimension', from, to }, { kind: 'dimension', from, to, offset: -6, through: new Pt(100, 100) }] as SheetMark[]) {
          expect(expandMarks([mark], scale).texts.map(t => t.text)).toEqual([length]);
        }
      }
    }
  });

  it('keeps a text of its own', () => {
    const drawn = expandMarks([{ kind: 'dimension', from: new Pt(0, 0), to: new Pt(330.4, 12), text: '~330' }], 5);
    expect(drawn.texts.map(t => t.text)).toEqual(['~330']);
  });

  it('runs its line through the point it is parked on, square off the measurement', () => {
    const drawn = expandMarks([{ kind: 'dimension', from: new Pt(0, 0), to: new Pt(100, 0), through: new Pt(40, 30) }], 2);
    const line = drawn.paths.map(path => pathsBounds([path.d])).find(b => Math.abs(b.width - 50) < 1 && b.height < 1e-6);
    expect(line?.minY).toBeCloseTo(15, 6);
    expect(line?.minX).toBeCloseTo(0, 6);
  });
});

describe('annotation on the paper', () => {
  const marks: SheetMark[] = [
    { kind: 'dimension', from: new Pt(0, 0), to: new Pt(300, 0), offset: 5 },
    { kind: 'station', y: 120, from: -50, to: 250, label: '120', sub: 'C' },
    { kind: 'callout', at: new Pt(40, 40), dx: 10, dy: 4, text: '12', sub: 'throat' },
    { kind: 'ordinates', origin: new Pt(0, 0), axis: new Pt(1, 0), normal: new Pt(0, 1), stations: [{ at: 0, height: 12 }, { at: 100, height: 8 }], values: 'base' },
  ];

  it('holds its size while the view shrinks: text heights and arrowheads are the same at every scale', () => {
    const heads = (scale: number) => expandMarks(marks, scale).paths.filter(path => path.fill !== 'none').map(path => {
      const b = pathsBounds([path.d]);
      return Math.hypot(b.width, b.height).toFixed(6);
    });
    const sizes = (scale: number) => expandMarks(marks, scale).texts.map(t => t.fontSize);
    for (const scale of SCALE_LADDER) {
      expect(sizes(scale)).toEqual(sizes(1));
      expect(heads(scale)).toEqual(heads(1));
    }
  });

  it('writes one height under each ordinate, the height it stands', () => {
    const stations = [{ at: 0, height: 13.04 }, { at: 10, height: 9.96 }, { at: 20, height: -0.31 }];
    const drawn = expandMarks([{ kind: 'ordinates', origin: new Pt(0, 0), axis: new Pt(1, 0), normal: new Pt(0, 1), stations, values: 'base' }], 1);
    expect(drawn.texts.map(t => Number(t.text))).toEqual(stations.map(st => Math.round(st.height * 10) / 10));
  });
});

describe('a view in its cell', () => {
  const square = (side: number): SheetView => ({ strokes: [{ d: box(side, side) }], marks: [] });

  it('is drawn at the largest scale on the ladder that fits', () => {
    expect(fitView(square(100), 100, 100).scale).toBe(1);
    expect(fitView(square(100), 60, 60).scale).toBe(2);
    expect(fitView(square(100), 30, 30).scale).toBe(4);
    expect(fitView(square(100), 100, 20).scale).toBe(5);
  });

  it('counts its marks against the cell, not its paths alone', () => {
    const marked: SheetView = { strokes: [{ d: box(100, 100) }], marks: [{ kind: 'dimension', from: new Pt(0, 0), to: new Pt(0, 100), offset: 8 }] };
    expect(fitView(marked, 100, 100).scale).toBe(2);
    const fitted = fitView(marked, 100, 100);
    expect(fitted.bounds.maxX - fitted.bounds.minX).toBeLessThanOrEqual(100);
  });

  it('is asked for again at each scale it is tried at, and drawn as it was built for the one that fits', () => {
    const asked: number[] = [];
    const fitted = fitView(scale => { asked.push(scale); return square(100); }, 45, 45);
    expect(asked).toEqual([1, 2, 2.5]);
    expect(fitted.scale).toBe(2.5);
  });

  it('draws its paths 1 : scale', () => {
    const b = pathsBounds(drawView(square(100), 4).paths.map(path => path.d));
    expect(b.width).toBeCloseTo(25, 6);
    expect(b.height).toBeCloseTo(25, 6);
  });
});

describe('a page of the schematic', () => {
  const view: SheetView = { strokes: [{ d: box(300, 400) }], marks: [{ kind: 'dimension', from: new Pt(0, 0), to: new Pt(300, 0), offset: -5 }] };
  const rows = [{ label: 'Body length', value: '357.5' }, { label: 'Overhang', value: '3' }];

  it('is A4 upright, everything on it inside the paper', () => {
    const page = buildSchematicPage({ columns: [{ x: 0, w: SCHEMATIC_AREA.width, blocks: [{ view, h: 200 }, { tables: [rows, rows], w: 60 }] }] }, heading, footing);
    expect([page.width, page.height]).toEqual([210, 297]);
    for (const path of page.paths) expect(inside(pathsBounds([path.d]), page), path.d).toBe(true);
    for (const t of page.texts) expect(inside(textBox(t), page), t.text).toBe(true);
    expect(JSON.stringify(page)).not.toMatch(/NaN|Infinity/);
  });

  it('prints every row it is given and nothing for a table with none', () => {
    const texts = (tables: typeof rows[]) => buildSchematicPage({ columns: [{ x: 0, w: SCHEMATIC_AREA.width, blocks: [{ tables, w: 60 }] }] }, heading, footing).texts.map(t => t.text);
    const paths = (tables: typeof rows[]) => buildSchematicPage({ columns: [{ x: 0, w: SCHEMATIC_AREA.width, blocks: [{ tables, w: 60 }] }] }, heading, footing).paths.length;
    for (const row of rows) expect(texts([rows])).toEqual(expect.arrayContaining([row.label, row.value]));
    expect(paths([[]])).toBe(paths([]));
    expect(texts([[]])).toEqual(texts([]));
  });

  it('starts the heading, the footing and every block at the left margin', () => {
    const page = buildSchematicPage({ columns: [{ x: 0, w: SCHEMATIC_AREA.width, blocks: [{ view, h: 200 }, { tables: [rows], w: 60 }] }] }, heading, footing);
    const left = -SCHEMATIC_AREA.width / 2;
    const starts = page.texts.filter(t => [heading.title, heading.description, '1 / 2'].includes(t.text)).map(t => [t.anchor, t.x]);
    expect(starts).toEqual([['start', left], ['start', left], ['start', left]]);
    expect(Math.min(...page.paths.map(path => pathsBounds([path.d]).minX))).toBeCloseTo(left, 6);
  });
});

describe('a page of the scaled drawings', () => {
  it('holds the largest drawing each paper takes between its header, its footer and its two scales', () => {
    for (const paper of Object.values(PAPER_FORMATS)) {
      for (const landscape of [false, true]) {
        const page = landscape ? { width: paper.height, height: paper.width } : { width: paper.width, height: paper.height };
        const area = pageContentSize(paper, landscape);
        const content = { width: area.width, height: area.height, paths: [{ d: `M ${-area.width / 2} 0 L ${area.width / 2} 0 L ${area.width / 2} ${area.height} L ${-area.width / 2} ${area.height} Z` }] };
        const built = buildDrawingPage(content, page, heading, footing);
        const drawing = placed(built.paths.find(path => path.transform)!);
        expect(drawing.maxX - drawing.minX).toBeCloseTo(area.width, 3);
        expect(inside(drawing, page), `${paper.name} ${landscape}`).toBe(true);
        for (const t of built.texts) {
          const b = textBox(t);
          expect(inside(b, page), `${paper.name} ${t.text}`).toBe(true);
          const clear = b.maxX <= drawing.minX || b.minX >= drawing.maxX || b.maxY <= drawing.minY || b.minY >= drawing.maxY;
          expect(clear, `${paper.name} ${landscape}: "${t.text}" lies on the drawing`).toBe(true);
        }
      }
    }
  });

  it('draws at full size: the drawing is only moved', () => {
    const built = buildDrawingPage({ width: 200, height: 300, paths: [{ d: box(50, 80), transform: 'translate(10 20)' }] }, { width: 420, height: 594 }, heading, footing);
    const m = parseSvgTransform(built.paths.find(path => path.transform)!.transform);
    expect(m.slice(0, 4)).toEqual([1, 0, 0, 1]);
  });

  it('numbers its scales from the drawing\'s own origin, down the left edge and along the bottom only', () => {
    const page = { width: 420, height: 594 };
    const built = buildDrawingPage({ width: 200, height: 300, paths: [{ d: 'M 0 0 L 0 300' }] }, page, heading, footing);
    const origin = placed(built.paths.find(path => path.transform)!);
    const zeros = built.texts.filter(t => t.text === '0');
    expect(zeros).toHaveLength(2);
    expect(zeros.some(t => Math.abs(t.y - origin.minY) < 1e-6 && t.x < origin.minX)).toBe(true);
    expect(zeros.some(t => Math.abs(t.x - origin.minX) < 1e-6 && t.y < origin.minY)).toBe(true);
    const numbers = built.texts.filter(t => /^-?\d+$/.test(t.text));
    expect(numbers.every(t => t.x < -page.width / 2 + 20 || t.y < 30)).toBe(true);
  });
});
