// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALERT, CANVAS, NEUTRAL, PALETTES } from './palettes';
import { contrastRatio, makeInk, parseHex, resolveTheme, rgbToHsl } from './theme.service';

const CREMONA = { ...PALETTES.classicCremona, neutral: NEUTRAL, alert: ALERT };

const lightness = (css: string) => rgbToHsl(parseHex(css)).l;
const saturation = (css: string) => rgbToHsl(parseHex(css)).s;
const contrast = (css: string, canvas: string) => contrastRatio(parseHex(css), parseHex(canvas));

describe('an ink', () => {
  it('is its own hex, and mod() with no arguments is the same hex', () => {
    const ink = makeInk('#4d74a8', 'night');
    expect(`${ink}`).toMatch(/^#[0-9a-f]{6}$/);
    expect(ink.mod()).toBe(`${ink}`);
  });

  it('runs its lightness ramp monotonically from -1 to +1 and never past the band', () => {
    for (const mode of ['night', 'day'] as const) {
      for (const base of CREMONA.inks) {
        const ink = makeInk(base, mode);
        const steps = [-1, -0.5, 0, 0.5, 1].map(t => lightness(ink.mod(t)));
        for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
        expect(lightness(ink.mod(2))).toBeCloseTo(lightness(ink.mod(1)), 6);
      }
    }
  });

  it('holds a day base tone to 3:1 and lets its ramp run on to 2:1', () => {
    for (const base of [...CREMONA.inks, CREMONA.neutral, CREMONA.alert]) {
      const ink = makeInk(base, 'day');
      expect(contrast(ink, CANVAS.day)).toBeGreaterThanOrEqual(2.95);
      for (const t of [-1, -0.5, 0.5, 1]) expect(contrast(ink.mod(t), CANVAS.day)).toBeGreaterThanOrEqual(1.95);
      expect(lightness(ink.mod(1))).toBeGreaterThan(lightness(ink) + 0.04);
    }
  });

  it('keeps a night base where the palette put it when that already reads', () => {
    const ink = makeInk('#4d74a8', 'night');
    expect(lightness(ink)).toBeCloseTo(lightness('#4d74a8'), 1);
  });

  it('fades toward the canvas in both modes', () => {
    const night = makeInk('#3f9a63', 'night');
    const day = makeInk('#3f9a63', 'day');
    expect(contrast(night.mod(0, 0.6), CANVAS.night)).toBeLessThan(contrast(night, CANVAS.night));
    expect(contrast(day.mod(0, 0.6), CANVAS.day)).toBeLessThan(contrast(day, CANVAS.day));
  });

  it('applies a fade on top of a lightness step, the way the two chained', () => {
    const ink = makeInk('#3f9a63', 'night');
    expect(contrast(ink.mod(-0.5, 0.6), CANVAS.night)).toBeLessThan(contrast(ink.mod(-0.5), CANVAS.night));
  });

  it('leaves the neutral grey unsaturated by day rather than tinting it', () => {
    expect(saturation(makeInk(CREMONA.neutral, 'day'))).toBeLessThan(0.05);
  });
});

describe('a theme', () => {
  const short = { name: 'Short', inks: ['#c97a35', '#3f9a63'] };

  it('wraps a palette read past its end, so a panel wanting six inks can take two', () => {
    const pal = resolveTheme({ short }, 'night').palette('short');
    expect(pal.inks).toHaveLength(2);
    expect(pal.ink(2)).toBe(pal.ink(0));
    expect(pal.ink(5)).toBe(pal.ink(1));
  });

  it('resolves every palette by id and shares the neutral and alert', () => {
    const theme = resolveTheme({ classicCremona: PALETTES.classicCremona, short }, 'night');
    expect(theme.palette('short').ink(1)).toBe(theme.palette('short').inks[1]);
    expect(theme.palette('short').neutral).toBe(theme.neutral);
  });
});
