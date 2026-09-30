import { DraftShape, LineShape, TextShape } from './toolbox-shape';
import { shapesToSvg, svgToShapes } from './shape-svg';
import { distanceToShape } from './shape-hit-test';
import { pointOnCircle } from '../../helpers/math/simpleGeometry';

describe('shapesToSvg / svgToShapes', () => {
  const sample: DraftShape[] = [
    { id: 'l', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 5 }, color: '#ff0000', dashed: true, layerId: 'layer-x' },
    { id: 'a', type: 'arc', center: { x: 5, y: 5 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2, color: '#00ff00' },
    { id: 'c', type: 'circle', center: { x: -3, y: 4 }, radius: 2, color: '#0000ff' },
    { id: 'r', type: 'rect', p1: { x: 1, y: 2 }, p2: { x: 11, y: 22 }, color: '#123456' },
    { id: 'p', type: 'path', d: 'M 0 0 L 10 0 A 5 5 0 0 1 10 10 Z', color: '#654321' },
    { id: 't', type: 'text', position: { x: 3, y: 7 }, text: 'a<b>&c\nline 2', fontSize: 4, rotationDeg: 30, color: '#111111' },
    { id: 'd', type: 'dimension', start: { x: 0, y: 0 }, end: { x: 30, y: 0 }, offset: 5, color: '#222222' },
    { id: 's', type: 'section', start: { x: 0, y: 0 }, end: { x: 30, y: 0 }, weights: [1, 2], color2: '#abcdef', label: true, color: '#333333' },
    { id: 'k', type: 'ticks', start: { x: 0, y: 0 }, end: { x: 30, y: 0 }, weights: [1, 1, 1], color: '#444444' },
    { id: 'pt', type: 'point', position: { x: 9, y: 9 }, color: '#555555' },
    { id: 'f', type: 'freehand', points: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 1 }], color: '#666666', opacity: 0.5 },
  ];
  const detached = (s: DraftShape) => { const { id, layerId, ...rest } = s; return rest; };
  const withoutMetadata = (svg: string) => svg.replace(/<metadata>[\s\S]*?<\/metadata>/, '');

  it('round-trips every shape type losslessly through its own metadata', () => {
    const back = svgToShapes(shapesToSvg(sample))!;
    expect(back.map(detached)).toEqual(sample.map(detached));
    expect(back.every(s => s.id === '' && s.layerId === undefined)).toBe(true);
  });

  it('is a real-size SVG document that escapes what it embeds', () => {
    const svg = shapesToSvg(sample);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="')).toBe(true);
    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(svg).not.toContain('a<b>');
    expect(svg).toContain('&lt;');
    // parseable as XML, which is what pasting as text into Inkscape depends on
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
  });

  it('reads its own geometry back without the metadata, flipped the right way up', () => {
    const back = svgToShapes(withoutMetadata(shapesToSvg(sample)))!;
    const line = back.find(s => s.type === 'line') as LineShape;
    expect(line.start).toEqual({ x: 0, y: 0 });
    expect(line.end).toEqual({ x: 10, y: 5 });
    expect(line.color).toBe('#ff0000');
    expect(line.dashed).toBe(true);

    const arc = back.find(s => s.type === 'arc')!;
    // the arc still passes through its own midpoint, so the sweep survived the flip
    expect(distanceToShape(pointOnCircle({ x: 5, y: 5, r: 10 }, Math.PI / 4), arc)).toBeLessThan(1e-3);
    expect(distanceToShape(pointOnCircle({ x: 5, y: 5, r: 10 }, Math.PI), arc)).toBeGreaterThan(1);

    expect(back.find(s => s.type === 'circle')).toMatchObject({ center: { x: -3, y: 4 }, radius: 2 });
    expect(back.find(s => s.type === 'rect')).toMatchObject({ p1: { x: 1, y: 2 }, p2: { x: 11, y: 22 } });

    const text = back.find(s => s.type === 'text' && (s as TextShape).text.includes('a<b>')) as TextShape;
    expect(text.text).toBe('a<b>&c\nline 2');
    expect(text.fontSize).toBeCloseTo(4, 6);
    expect(text.rotationDeg).toBeCloseTo(30, 6);
    expect(text.position.x).toBeCloseTo(3, 6);
    expect(text.position.y).toBeCloseTo(7, 6);
  });

  it('reads Inkscape-style markup: relative paths, style attributes, groups and px units', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">
      <g transform="translate(10,20)">
        <path style="fill:none;stroke:#ff0000;stroke-width:0.3" d="m 0,0 10,0" />
        <ellipse cx="5" cy="5" rx="2" ry="2" style="stroke:#00ff00" />
      </g>
    </svg>`;
    const shapes = svgToShapes(svg)!;
    expect(shapes.map(s => s.type)).toEqual(['line', 'circle']);
    expect(shapes[0]).toMatchObject({ start: { x: 10, y: -20 }, end: { x: 20, y: -20 }, color: '#ff0000' });
    expect(shapes[1]).toMatchObject({ center: { x: 15, y: -25 }, radius: 2, color: '#00ff00' });

    const px = svgToShapes('<svg xmlns="http://www.w3.org/2000/svg" width="96px" viewBox="0 0 96 96"><line x1="0" y1="0" x2="96" y2="0"/></svg>')!;
    expect((px[0] as LineShape).end.x).toBeCloseTo(25.4, 6);
  });

  it('returns null for text that is not SVG', () => {
    expect(svgToShapes('hello')).toBeNull();
    expect(svgToShapes('<div>not svg</div>')).toBeNull();
    expect(svgToShapes('')).toBeNull();
  });
});
