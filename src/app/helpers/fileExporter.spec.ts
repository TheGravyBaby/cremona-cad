import { buildMirroredSvg, PAPER_FORMATS, SvgPathExport } from './fileExporter';

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
  it('centres the sheet on the joint', () => {
    // The instrument is drawn about x = 0, so the viewBox runs from −w/2. A
    // sheet starting at 0 would cut the whole treble side off.
    const svg = buildMirroredSvg(200, 350, [path('M 0 0')]);
    expect(svg).toContain('viewBox="-100 0 200 350"');
  });

  it('flips Y so drafting coordinates land the right way up', () => {
    const svg = buildMirroredSvg(200, 350, [path('M 0 0')]);
    expect(svg).toContain('<g transform="translate(0 350) scale(1 -1)">');
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
    expect(doc.querySelectorAll('path')).toHaveLength(1);
    expect(doc.querySelectorAll('text')).toHaveLength(1);
  });

  it('survives an empty sheet rather than emitting broken markup', () => {
    const doc = new DOMParser().parseFromString(buildMirroredSvg(100, 100, []), 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
  });
});

describe('paper formats', () => {
  it('are all portrait, since the sheet is rotated when it needs to be', () => {
    for (const [key, format] of Object.entries(PAPER_FORMATS)) {
      expect(format.width, `${key} is not portrait`).toBeLessThan(format.height);
    }
  });
});
