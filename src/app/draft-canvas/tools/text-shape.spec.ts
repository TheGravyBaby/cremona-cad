import { Pt } from '../../models/types';
import { DEFAULT_TEXT_SIZE_MM, TextShape } from './toolbox-shape';
import { distanceToShape, shapeBounds } from './shape-hit-test';
import { endpointGrabbers, withEndpoint } from './shape-grabbers';

function label(over: Partial<TextShape> = {}): TextShape {
  return { id: 't1', type: 'text', position: { x: 0, y: 0 }, text: 'Upper bout', ...over };
}

const at = (x: number, y: number): Pt => ({ x, y });

describe('text hit-testing', () => {
  it('sizes the footprint from the shape, not the camera', () => {
    // The whole point of a world-mm font size: what is under the cursor is a fact about the
    // drawing, so a label's clickable area must not grow and shrink as the camera moves. This
    // used to be derived from a screen-constant px size over pxPerMm, and did exactly that.
    const small = shapeBounds(label({ fontSize: 4 }));
    const large = shapeBounds(label({ fontSize: 8 }));
    expect(large.x1 - large.x0).toBeCloseTo((small.x1 - small.x0) * 2, 9);
    expect(large.y1 - large.y0).toBeCloseTo((small.y1 - small.y0) * 2, 9);
  });

  it('falls back to the default size when the shape carries none', () => {
    // Labels saved before text had a size of its own — no migration, the renderer and the
    // hit-test just have to agree on what missing means.
    expect(shapeBounds(label())).toEqual(shapeBounds(label({ fontSize: DEFAULT_TEXT_SIZE_MM })));
  });

  it('counts the whole block, one line per newline', () => {
    const one = shapeBounds(label({ text: 'Upper bout', fontSize: 5 }));
    const three = shapeBounds(label({ text: 'Upper\nbout\nwidth', fontSize: 5 }));
    expect(three.y1 - three.y0).toBeCloseTo((one.y1 - one.y0) * 3, 9);
    // ...and it is the longest line that sets the width, not the total character count
    expect(three.x1 - three.x0).toBeLessThan(one.x1 - one.x0);
  });

  it('hits inside the label and misses beyond it', () => {
    const shape = label({ fontSize: 5 });
    const box = shapeBounds(shape);
    expect(distanceToShape(at((box.x0 + box.x1) / 2, 0), shape)).toBe(0);
    expect(distanceToShape(at(box.x1 + 20, 0), shape)).toBeGreaterThan(0);
  });

  it('follows the label round when it is turned', () => {
    const level = label({ fontSize: 5 });
    const turned = label({ fontSize: 5, rotationDeg: 90 });
    const box = shapeBounds(level);
    const alongText = at((box.x0 + box.x1) / 2, 0);

    // A point on the level label's body is off the turned one, and the point the text swung to
    // is on it — i.e. the hit region rotated with the glyphs rather than staying put.
    expect(distanceToShape(alongText, level)).toBe(0);
    expect(distanceToShape(alongText, turned)).toBeGreaterThan(0);
    expect(distanceToShape(at(0, (box.x0 + box.x1) / 2), turned)).toBe(0);
  });

  it('bounds a turned label by what is drawn, not by its upright box', () => {
    // Marquee selection reads these bounds, so a quarter-turned label has to report a tall
    // narrow box rather than the wide flat one it would have had level.
    const level = shapeBounds(label({ fontSize: 5 }));
    const turned = shapeBounds(label({ fontSize: 5, rotationDeg: 90 }));
    expect(turned.y1 - turned.y0).toBeCloseTo(level.x1 - level.x0, 6);
    expect(turned.x1 - turned.x0).toBeCloseTo(level.y1 - level.y0, 6);
  });
});

describe('text rotation handle', () => {
  it('is the only handle a label has, and floats above its anchor', () => {
    const grabbers = endpointGrabbers(label({ fontSize: 5 }), 2)!;
    expect(grabbers).toHaveLength(1);
    expect(grabbers[0].key).toBe('rotate');
    expect(grabbers[0].pos.x).toBeCloseTo(0, 9);
    expect(grabbers[0].pos.y).toBeGreaterThan(0);
  });

  it('turns with the label, so it keeps reading as "the top"', () => {
    const [level] = endpointGrabbers(label({ fontSize: 5 }), 2)!;
    const [turned] = endpointGrabbers(label({ fontSize: 5, rotationDeg: 90 }), 2)!;
    expect(turned.pos.x).toBeCloseTo(-level.pos.y, 9);
    expect(turned.pos.y).toBeCloseTo(0, 9);
  });

  it('sets the angle from the drag point\'s bearing, less the handle\'s own quarter turn', () => {
    // Dragging the handle due east means the label has turned a quarter turn clockwise from
    // where it sits due north.
    const turned = withEndpoint(label(), 'rotate', at(30, 0)) as TextShape;
    expect(turned.rotationDeg).toBeCloseTo(270, 9);
    expect(turned.position).toEqual({ x: 0, y: 0 }); // the anchor is the pivot, so it stays put
  });

  it('ignores handle keys that belong to other shape types', () => {
    const shape = label();
    expect(withEndpoint(shape, 'radius', at(10, 10))).toBe(shape);
  });
});
