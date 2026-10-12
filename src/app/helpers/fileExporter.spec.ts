import { buildMirroredSvg, buildPackedSvg, packPieces, pageContentSize, paginatePieces, PAPER_FORMATS, paperFor, SvgPathExport, SvgPiece } from './fileExporter';
import { pathsBounds } from './math/pathMath';
import { LASER } from '../theme/palettes';

/**
 * SVG output — the sheet that gets printed and traced against.
 *
 * The whole file turns on one transform. Drafting coordinates are Y-up and SVG
 * is Y-down, so the root group flips Y; that flip would also mirror every
 * glyph, so each label carries a counter-transform. Both halves have to be
 * right, and a sheet with either wrong still opens and still looks like a
 * violin — upside down, or with the labels written backwards.
 */

const path = (d: string, over: Partial<SvgPathExport> = {}): SvgPathExport => ({ d, ...over });

describe('buildMirroredSvg', () => {
  it('starts the sheet at 0 0, with the content centred on it and empty sheet round it', () => {
    // The laser zeroes on the viewBox origin. The instrument is drawn about
    // x = 0, so the root group moves it half a sheet right; without that the
    // treble side would sit off the sheet.
    const svg = buildMirroredSvg(200, 350, [path('M 0 0')]);
    expect(svg).toContain('viewBox="0 0 221 371"');
  });

  it('states its size in mm and boxes the content in whole mm with the dimensions beside it', () => {
    const svg = buildMirroredSvg(200.2, 350, [path('M 0 0')]);
    expect(svg).toContain('width="222mm" height="371mm"');
    expect(svg).toContain('>202 mm</text>');
    expect(svg).toContain('>351 mm</text>');
    expect(svg).toContain('inkscape:document-units="mm"');
  });

  it('flips Y so drafting coordinates land the right way up', () => {
    const svg = buildMirroredSvg(200, 350, [path('M 0 0')]);
    expect(svg).toContain('<g transform="translate(110.5 360.5) scale(1 -1)">');
  });

  it('gives each label its own counter-flip, so the text is not mirrored', () => {
    // Without the inner `scale(1 -1)` the outer flip renders every label as its
    // own reflection — readable enough to miss on a thumbnail, useless on paper.
    const svg = buildMirroredSvg(200, 350, [], [{ text: 'UB', x: 10, y: 20 }]);
    expect(svg).toContain('translate(10 20) scale(1 -1)');
    expect(svg).toContain('>UB</text>');
  });

  it('negates label rotation, because the flip reverses which way is positive', () => {
    const svg = buildMirroredSvg(200, 350, [], [{ text: 'C', x: 0, y: 0, rotationDeg: 90 }]);
    expect(svg).toContain('rotate(-90)');
  });

  it('draws an unfilled, stroked outline by default', () => {
    // A path defaulting to filled would print the plate as a solid black blob.
    const svg = buildMirroredSvg(200, 350, [path('M 0 0 L 1 1')]);
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="black"');
    expect(svg).not.toContain('fill="black"');
  });

  it('carries the SVG namespace, so the file opens outside a browser', () => {
    expect(buildMirroredSvg(10, 10, [])).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('produces a well-formed document that parses back', () => {
    // The markup is assembled by string concatenation, so nothing but a parser
    // will catch an unbalanced tag.
    const svg = buildMirroredSvg(200, 350, [path('M 0 0 L 10 10')], [{ text: 'LB', x: 1, y: 2 }]);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path')).toHaveLength(2);
    expect(doc.querySelectorAll('text')).toHaveLength(3);
  });

  it('survives an empty sheet rather than emitting broken markup', () => {
    const doc = new DOMParser().parseFromString(buildMirroredSvg(100, 100, []), 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
  });
});

describe('buildPackedSvg', () => {
  const rect = (x: number, y: number, w: number, h: number) => path(`M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`);
  // each piece in a frame of its own, nowhere near the origin, so a packer that forgot to move
  // a piece by its own bounds would leave it off the sheet
  const pieces = [[40, 300], [120, 30], [120, 30], [25, 340], [80, 80], [200, 150], [10, 10], [60, 200]]
    .map(([w, h], i) => ({ paths: [rect(500 * i - 900, 70 * i - 200, w, h)] }));

  // in the viewBox's own frame: the root group's move and flip applied on top of each piece's move
  function placed(svg: string) {
    const [tx, ty] = svg.match(/<g transform="translate\(([^ ]+) ([^)]+)\) scale\(1 -1\)">/)!.slice(1).map(Number);
    return [...svg.matchAll(/<g transform="translate\(([^ ]+) ([^)]+)\)"><path d="([^"]+)"/g)].map(m => {
      const b = pathsBounds([m[3]]);
      return { minX: b.minX + +m[1] + tx, maxX: b.maxX + +m[1] + tx, minY: ty - (b.maxY + +m[2]), maxY: ty - (b.minY + +m[2]) };
    });
  }

  it('lands every piece on the sheet, none over another', () => {
    const gap = 10;
    const svg = buildPackedSvg(pieces, gap);
    const boxes = placed(svg);
    expect(boxes).toHaveLength(pieces.length);
    const [vx, vy, vw, vh] = svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    for (const b of boxes) {
      expect(b.minX).toBeGreaterThanOrEqual(vx - 1e-6);
      expect(b.maxX).toBeLessThanOrEqual(vx + vw + 1e-6);
      expect(b.minY).toBeGreaterThanOrEqual(vy - 1e-6);
      expect(b.maxY).toBeLessThanOrEqual(vy + vh + 1e-6);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const apart = a.maxX + gap <= b.minX + 1e-6 || b.maxX + gap <= a.minX + 1e-6
          || a.maxY + gap <= b.minY + 1e-6 || b.maxY + gap <= a.minY + 1e-6;
        expect(apart).toBe(true);
      }
    }
  });

  it('draws every stroke at the laser\'s one width and no label filled, as the laser cuts strokes alone', () => {
    const svg = buildPackedSvg([{ paths: [rect(0, 0, 50, 20), { ...rect(5, 5, 10, 10), laser: 'cut1', strokeWidth: 2 }], texts: [{ text: 'LB', x: 25, y: 10 }] }]);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const widths = [...doc.querySelectorAll('path, text')].map(el => Number(el.getAttribute('stroke-width')));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBe(LASER.hairline);
    for (const t of doc.querySelectorAll('text')) expect(t.getAttribute('fill')).toBe('none');
  });

  it('leaves a single sheet\'s strokes at their own weights', () => {
    expect(buildMirroredSvg(50, 20, [rect(0, 0, 50, 20)])).toContain('stroke-width="0.5"');
  });

  it('keeps each piece\'s labels with it', () => {
    const svg = buildPackedSvg([{ paths: [rect(0, 0, 50, 20)], texts: [{ text: 'LB', x: 25, y: 10 }] }]);
    expect(svg).toMatch(/<g transform="translate\([^)]+\)"><path [^>]+\/><text [^>]+>LB<\/text><\/g>/);
  });
});

describe('the full plan on one paper', () => {
  const box = (w: number, h: number): SvgPiece => ({ paths: [path(`M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`)] });
  const fits = (page: { width: number; height: number }, paper: typeof PAPER_FORMATS[string]) =>
    [false, true].some(landscape => {
      const area = pageContentSize(paper, landscape);
      return page.width <= area.width + 1e-6 && page.height <= area.height + 1e-6;
    });

  it('picks the smallest paper every drawing fits on, turned if need be', () => {
    expect(paperFor([{ width: 100, height: 100 }])).toBe(PAPER_FORMATS['A5']);
    // too tall for A3 upright, and wider than A3 turned is tall
    expect(paperFor([{ width: 100, height: 100 }, { width: 200, height: 378 }])).toBe(PAPER_FORMATS['A2']);
    expect(paperFor([{ width: 5000, height: 10 }])).toBeNull();
  });

  it('fills to the width it is given, never past it', () => {
    const { width } = packPieces([box(60, 20), box(60, 20), box(60, 20), box(60, 20)], 10, 140);
    expect(width).toBeLessThanOrEqual(140);
  });

  it('puts groups that fit together on one page, and starts a page for one that does not', () => {
    const a4 = PAPER_FORMATS['A4'];
    const small = { label: 'Small', pieces: [box(40, 40), box(40, 40)] };
    const tall = { label: 'Tall', pieces: [box(150, 200)] };
    const pages = paginatePieces([small, { label: 'Also small', pieces: [box(30, 30)] }, tall], a4);
    expect(pages.map(p => p.label)).toEqual(['Small, Also small', 'Tall']);
    for (const page of pages) expect(fits(page, a4)).toBe(true);
  });

  it('splits only a group too big for one page, every piece on some page once', () => {
    const a4 = PAPER_FORMATS['A4'];
    const big = { label: 'Big', pieces: [box(150, 200), box(150, 200), box(150, 200)] };
    const pages = paginatePieces([big], a4);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every(p => p.label === 'Big')).toBe(true);
    expect(pages.reduce((n, p) => n + p.paths.length, 0)).toBe(3);
    for (const page of pages) expect(fits(page, a4)).toBe(true);
  });
});

describe('paper formats', () => {
  it('are all portrait, since the sheet is rotated when it needs to be', () => {
    for (const [key, format] of Object.entries(PAPER_FORMATS)) {
      expect(format.width, `${key} is not portrait`).toBeLessThan(format.height);
    }
  });
});
