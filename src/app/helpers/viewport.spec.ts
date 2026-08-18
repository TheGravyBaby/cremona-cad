import { describe, it, expect, afterEach } from 'vitest';
import { isSmallViewport } from './viewport';

const real = { w: window.innerWidth, h: window.innerHeight };
const size = (w: number, h: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
};

afterEach(() => size(real.w, real.h));

describe('isSmallViewport', () => {
  it('is false on a desktop window', () => {
    size(1440, 900);
    expect(isSmallViewport()).toBe(false);
  });

  // the two orientations that made the bars disagree: a phone is short in landscape and narrow in
  // portrait, and either one has to collapse both bars
  it('is true for a phone in landscape, which is short', () => {
    size(852, 393);
    expect(isSmallViewport()).toBe(true);
  });

  it('is true for a phone in portrait, which is narrow but tall', () => {
    size(390, 844);
    expect(isSmallViewport()).toBe(true);
  });

  it('is true for a tablet held portrait, narrow enough that a panel would crowd it', () => {
    size(820, 1180);
    expect(isSmallViewport()).toBe(true);
  });
});
