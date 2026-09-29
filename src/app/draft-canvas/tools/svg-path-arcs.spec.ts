import { absolutePathData } from './svg-path-arcs';

describe('absolutePathData', () => {
  it('leaves the app\'s own absolute subset alone', () => {
    const d = 'M 0 0 L 10 0 A 5 5 0 0 1 10 10 Q 5 15 0 10 C 1 2 3 4 0 0 Z';
    expect(absolutePathData(d)).toBe(d);
  });

  it('resolves relative commands against the current point', () => {
    expect(absolutePathData('m 1 2 l 3 4 a 5 5 0 0 1 2 2 z')).toBe('M 1 2 L 4 6 A 5 5 0 0 1 6 8 Z');
  });

  it('spells out H and V as lines', () => {
    expect(absolutePathData('M 1 1 H 5 V 7 h 1 v -1')).toBe('M 1 1 L 5 1 L 5 7 L 6 7 L 6 6');
  });

  it('reflects the control point for S and T', () => {
    expect(absolutePathData('M 0 0 C 1 1 2 1 3 0 S 5 -1 6 0')).toBe('M 0 0 C 1 1 2 1 3 0 C 4 -1 5 -1 6 0');
    expect(absolutePathData('M 0 0 Q 1 1 2 0 T 4 0')).toBe('M 0 0 Q 1 1 2 0 Q 3 -1 4 0');
    // a bare S with no curve before it uses the current point as its first control
    expect(absolutePathData('M 0 0 S 1 1 2 2')).toBe('M 0 0 C 0 0 1 1 2 2');
  });

  it('returns to the subpath start after Z', () => {
    expect(absolutePathData('M 1 1 l 2 0 z l 0 5')).toBe('M 1 1 L 3 1 Z L 1 6');
  });
});
