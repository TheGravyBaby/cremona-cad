// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALERT, CANVAS, NEUTRAL, PALETTES } from './palettes';
import { contrastRatio, makeInk, parseHex, resolveTheme, rgbToHsl } from './theme.service';

const CREMONA = { ...PALETTES.classicCremona, neutral: NEUTRAL, alert: ALERT };

const lightness = (css: string) => rgbToHsl(parseHex(css)).l;
const saturation = (css: string) => rgbToHsl(parseHex(css)).s;
const contrast = (css: string, canvas: string) => contrastRatio(parseHex(css), parseHex(canvas));

describe('an ink', () => {
  it('is its own hex, and faint() with no arguments is the same hex', () => {
    const ink = makeInk('#4d74a8', 'night');
    expect(`${ink}`).toMatch(/^#[0-9a-f]{6}$/);
    expect(ink.faint()).toBe(`${ink}`);
  });

  it('steps fainter toward the canvas from -5 to 5 in both modes, and stops at the band', () => {
    for (const mode of ['night', 'day'] as const) {
      for (const base of CREMONA.inks) {
        const ink = makeInk(base, mode);
        const steps = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(n => contrast(ink.faint(n), CANVAS[mode]));
        for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
        expect(ink.faint(9)).toBe(ink.faint(5));
        expect(ink.faint(-9)).toBe(ink.faint(-5));
      }
    }
  });

  it('takes whole steps, rounding a half away from zero', () => {
    const ink = makeInk('#3f9a63', 'night');
    expect(ink.faint(1.4)).toBe(ink.faint(1));
    expect(ink.faint(2.5)).toBe(ink.faint(3));
    expect(ink.faint(-2.5)).toBe(ink.faint(-3));
  });

  it('holds a day base tone to 2:1 and lets its steps run on to 1.5:1', () => {
    for (const base of [...CREMONA.inks, CREMONA.neutral, CREMONA.alert]) {
      const ink = makeInk(base, 'day');
      expect(contrast(ink, CANVAS.day)).toBeGreaterThanOrEqual(1.95);
      for (const n of [-5, -2, 2, 5]) expect(contrast(ink.faint(n), CANVAS.day)).toBeGreaterThanOrEqual(1.45);
    }
  });

  it('keeps a night base where the palette put it when that already reads', () => {
    const ink = makeInk('#4d74a8', 'night');
    expect(lightness(ink)).toBeCloseTo(lightness('#4d74a8'), 1);
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
