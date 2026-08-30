import { nearestSmallFraction } from './nearestFraction';

describe('nearestSmallFraction', () => {
  it('names ratios the standard limits collapse to 0/1', () => {
    // f-hole eye radius against body width, the default 1/72
    expect(nearestSmallFraction(1 / 72)).toBe('1/72');
    expect(nearestSmallFraction(1 / 35)).toBe('1/35');
    expect(nearestSmallFraction(1 / 64)).toBe('1/64');
  });

  it('reads a measured ratio as the nearest simple reciprocal', () => {
    // 2.6mm eye on a 205mm plate
    expect(nearestSmallFraction(2.6 / 205)).toBe('≈ 1/79');
    expect(nearestSmallFraction(0.0138)).toBe('≈ 1/72');
  });

  it('goes past the denominator limit rather than give up', () => {
    expect(nearestSmallFraction(0.0001)).toBe('1/10000');
  });

  it('uses a numerator where no reciprocal is close', () => {
    expect(nearestSmallFraction(2 / 45)).toBe('2/45');
  });

  it('still handles ordinary values', () => {
    expect(nearestSmallFraction(0.25)).toBe('1/4');
    expect(nearestSmallFraction(1 / 3)).toBe('1/3');
    expect(nearestSmallFraction(1.5)).toBe('3/2');
  });

  it('keeps the sign and survives junk', () => {
    expect(nearestSmallFraction(-1 / 72)).toBe('-1/72');
    expect(nearestSmallFraction(0)).toBe('0/1');
    expect(nearestSmallFraction(NaN)).toBe('0/1');
  });

  it('does not hang a named constant off a large denominator', () => {
    // φ/117 sits within half a percent of this but reads as nothing
    expect(nearestSmallFraction(0.0138)).not.toContain('φ');
  });
});
