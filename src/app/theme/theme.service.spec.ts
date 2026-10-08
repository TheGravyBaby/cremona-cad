// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALERT, NEUTRAL, PALETTES } from './palettes';
import { contrastRatio, makeInk, parseColor, resolveTheme, rgbToHsl } from './theme.service';

const CREMONA = { ...PALETTES.classicCremona, neutral: NEUTRAL, alert: ALERT };

const NIGHT = '#1e1e1e';
const DAY = '#c3bfb3';
const lightness = (css: string) => rgbToHsl(parseColor(css)!).l;
const saturation = (css: string) => rgbToHsl(parseColor(css)!).s;
const contrast = (css: string, canvas: string) => contrastRatio(parseColor(css)!, parseColor(canvas)!);

describe('an ink', () => {
  it('is its own hex, and mod() with no arguments is the same hex', () => {
    const ink = makeInk('#4d74a8', 'night', NIGHT);
    expect(`${ink}`).toMatch(/^#[0-9a-f]{6}$/);
    expect(ink.mod()).toBe(`${ink}`);
  });

  it('runs its lightness ramp monotonically from -1 to +1 and never past the band', () => {
    for (const [mode, canvas] of [['night', NIGHT], ['day', DAY]] as const) {
      for (const base of CREMONA.inks) {
        const ink = makeInk(base, mode, canvas);
        const steps = [-1, -0.5, 0, 0.5, 1].map(t => lightness(ink.mod(t)));
        for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
        expect(lightness(ink.mod(2))).toBeCloseTo(lightness(ink.mod(1)), 6);
      }
    }
  });

  it('holds a day base tone to 3:1 and lets its ramp run on to 2:1', () => {
    for (const base of [...CREMONA.inks, CREMONA.neutral, CREMONA.alert]) {
      const ink = makeInk(base, 'day', DAY);
      expect(contrast(ink, DAY)).toBeGreaterThanOrEqual(2.95);
      for (const t of [-1, -0.5, 0.5, 1]) expect(contrast(ink.mod(t), DAY)).toBeGreaterThanOrEqual(1.95);
      expect(lightness(ink.mod(1))).toBeGreaterThan(lightness(ink) + 0.04);
    }
  });

  it('keeps a night base where the palette put it when that already reads', () => {
    const ink = makeInk('#4d74a8', 'night', NIGHT);
    expect(lightness(ink)).toBeCloseTo(lightness('#4d74a8'), 1);
  });

  it('drains to grey at saturation -1 and fills at +1, holding lightness', () => {
    const ink = makeInk('#c97a35', 'night', NIGHT);
    expect(saturation(ink.mod(0, -1))).toBeLessThan(0.02);
    expect(saturation(ink.mod(0, 1))).toBeGreaterThan(0.95);
    expect(lightness(ink.mod(0, -1))).toBeCloseTo(lightness(ink), 1);
  });

  it('fades toward the canvas in both modes', () => {
    const night = makeInk('#3f9a63', 'night', NIGHT);
    const day = makeInk('#3f9a63', 'day', DAY);
    expect(contrast(night.mod(0, 0, 0.6), NIGHT)).toBeLessThan(contrast(night, NIGHT));
    expect(contrast(day.mod(0, 0, 0.6), DAY)).toBeLessThan(contrast(day, DAY));
  });

  it('applies a fade on top of a lightness step, the way the two chained', () => {
    const ink = makeInk('#3f9a63', 'night', NIGHT);
    expect(contrast(ink.mod(-0.5, 0, 0.6), NIGHT)).toBeLessThan(contrast(ink.mod(-0.5), NIGHT));
  });

  it('leaves the neutral grey unsaturated by day rather than tinting it', () => {
    expect(saturation(makeInk(CREMONA.neutral, 'day', DAY))).toBeLessThan(0.05);
  });
});

describe('a theme', () => {
  const short = { name: 'Short', inks: ['#c97a35', '#3f9a63'] };

  it('wraps a palette read past its end, so a panel wanting six inks can take two', () => {
    const pal = resolveTheme({ short }, 'night', NIGHT).palette('short');
    expect(pal.inks).toHaveLength(2);
    expect(pal.ink(2)).toBe(pal.ink(0));
    expect(pal.ink(5)).toBe(pal.ink(1));
  });

  it('resolves every palette by id, the first standing in for an unknown one, and shares the neutral and alert', () => {
    const theme = resolveTheme({ classicCremona: PALETTES.classicCremona, short }, 'night', NIGHT);
    expect(theme.palette('short').ink(1)).toBe(theme.palette('short').inks[1]);
    expect(theme.palette('nope').id).toBe('classicCremona');
    expect(theme.palette('short').neutral).toBe(theme.neutral);
  });
});
