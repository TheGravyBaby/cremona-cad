// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, rgbToHsl } from './color-math';
import { INK_COUNT, makeInk, resolveTheme } from './palette';
import { CREMONA } from './palettes/cremona';

const NIGHT = '#1e1e1e';
const DAY = '#c3bfb3';
const lightness = (css: string) => rgbToHsl(parseColor(css)!).l;
const saturation = (css: string) => rgbToHsl(parseColor(css)!).s;
const contrast = (css: string, canvas: string) => contrastRatio(parseColor(css)!, parseColor(canvas)!);

describe('an ink', () => {
  it('runs its lightness ramp monotonically from -1 to +1 and never past the band', () => {
    for (const [mode, canvas] of [['night', NIGHT], ['day', DAY]] as const) {
      for (const base of CREMONA.inks) {
        const ink = makeInk(base, mode, canvas);
        const steps = [-1, -0.5, 0, 0.5, 1].map(t => lightness(ink.lightness(t).css));
        for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
        expect(lightness(ink.lightness(2).css)).toBeCloseTo(lightness(ink.lightness(1).css), 6);
      }
    }
  });

  it('holds a day base tone to 3:1 and lets its ramp run on to 2:1', () => {
    for (const base of [...CREMONA.inks, CREMONA.neutral, CREMONA.alert]) {
      const ink = makeInk(base, 'day', DAY);
      expect(contrast(ink.css, DAY)).toBeGreaterThanOrEqual(2.95);
      for (const t of [-1, -0.5, 0.5, 1]) expect(contrast(ink.lightness(t).css, DAY)).toBeGreaterThanOrEqual(1.95);
      expect(lightness(ink.lightness(1).css)).toBeGreaterThan(lightness(ink.css) + 0.04);
    }
  });

  it('keeps a night base where the palette put it when that already reads', () => {
    const ink = makeInk('#4d74a8', 'night', NIGHT);
    expect(lightness(ink.css)).toBeCloseTo(lightness('#4d74a8'), 1);
  });

  it('drains to grey at saturation(-1) and fills at saturation(+1), holding lightness', () => {
    const ink = makeInk('#c97a35', 'night', NIGHT);
    expect(saturation(ink.saturation(-1).css)).toBeLessThan(0.02);
    expect(saturation(ink.saturation(1).css)).toBeGreaterThan(0.95);
    expect(lightness(ink.saturation(-1).css)).toBeCloseTo(lightness(ink.css), 1);
  });

  it('fades toward the canvas in both modes', () => {
    const night = makeInk('#3f9a63', 'night', NIGHT);
    const day = makeInk('#3f9a63', 'day', DAY);
    expect(contrast(night.fade(0.6).css, NIGHT)).toBeLessThan(contrast(night.css, NIGHT));
    expect(contrast(day.fade(0.6).css, DAY)).toBeLessThan(contrast(day.css, DAY));
  });

  it('leaves the neutral grey unsaturated by day rather than tinting it', () => {
    expect(saturation(makeInk(CREMONA.neutral, 'day', DAY).css)).toBeLessThan(0.05);
  });
});

describe('a theme', () => {
  it('always carries INK_COUNT inks, repeating a shorter palette', () => {
    const short = { ...CREMONA, inks: ['#c97a35', '#3f9a63'] };
    const theme = resolveTheme(short, 'night', NIGHT);
    expect(theme.inks).toHaveLength(INK_COUNT);
    expect(theme.inks[2].css).toBe(theme.inks[0].css);
  });
});
