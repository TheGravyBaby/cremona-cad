// @vitest-environment node
import { inchFraction, nearestSmallFraction } from './nearestFraction';

describe('nearestSmallFraction', () => {
  it('names ratios the standard limits collapse to 0/1', () => {
    expect(nearestSmallFraction(1 / 72)).toBe('1/72');
    expect(nearestSmallFraction(1 / 35)).toBe('1/35');
    expect(nearestSmallFraction(1 / 64)).toBe('1/64');
  });

  it('reads a measured ratio as the nearest simple reciprocal', () => {
    expect(nearestSmallFraction(2.6 / 205)).toBe('≈ 1/79');
    expect(nearestSmallFraction(0.0138)).toBe('≈ 1/72');
  });

  it('goes past the denominator limit rather than give up', () => {
    expect(nearestSmallFraction(0.0001)).toBe('1/10000');
  });

  it('uses a numerator where no reciprocal is close', () => {
    expect(nearestSmallFraction(2 / 45)).toBe('2/45');
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

describe('inchFraction', () => {
  it('reads common stock sizes as a tape does', () => {
    expect(inchFraction(0.75)).toBe('3/4');
    expect(inchFraction(19 / 25.4)).toBe('≈ 3/4');
    expect(inchFraction(6.35 / 25.4)).toBe('1/4');
  });

  it('carries whole inches and reduces the fraction', () => {
    expect(inchFraction(300 / 25.4)).toBe('≈ 11 13/16');
    expect(inchFraction(12)).toBe('12');
    expect(inchFraction(0.999)).toBe('≈ 1');
  });

  it('keeps the sign and survives junk', () => {
    expect(inchFraction(-0.5)).toBe('-1/2');
    expect(inchFraction(NaN)).toBe('');
  });
});
