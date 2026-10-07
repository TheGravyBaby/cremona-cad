import { contrastRatio, hslToRgb, parseColor, Rgb, rgbToHsl, toHex } from './color-math';

export type ThemeMode = 'day' | 'night';

// a palette knows nothing about instruments: a list of inks, as long or short as it likes, that a
// panel reads by position, so swapping a panel's colours is a change of palette, never of key.
// Inks are picked for the night canvas; day mode remaps every ramp into the band that reads there
export interface Palette {
  id: string;
  name: string;
  inks: readonly string[];
}

// the trace grey for earlier work and construction, and the solve-failure red, belong to the
// theme rather than any palette, so they read the same whichever palette a panel took
const NEUTRAL = '#868484';
const ALERT = '#d62828';

// the contrast a stroke needs against the canvas. A base tone clears WCAG's 3:1 non-text floor by
// day; its ramp may run on to 2:1, since the day canvas is mid-toned and holding a light sibling
// to 3:1 would land it on its mid sibling. By night a dark tone on a near-black canvas was never
// held to a floor and 3:1 would lift every one of them, so 2:1 only stops black on black
const BASE_FLOOR: Record<ThemeMode, number> = { day: 3, night: 2 };
const RAMP_FLOOR = 2;
const DAY_SATURATION_BOOST = 0.4;
const LIGHTNESS_LIMITS = { lo: 0.05, hi: 0.94 };
// the base sits at least this far inside the ramp's band, so a ramp has somewhere to go both ways
const BASE_MARGIN = 0.1;

export interface Ink {
  // t in [-1, 1], the fraction of the way from this tone to the band's edge: +1 is as light as the
  // canvas allows, -1 as dark, so no step ever leaves the legible band in either mode
  lightness(t: number): Ink;
  // t in [-1, 1]: -1 is grey, +1 fully saturated
  saturation(t: number): Ink;
  // toward the canvas, whichever side that is in this mode: a guide that should sit behind the
  // subject fades the same way by day and by night
  fade(t: number): Ink;
  readonly css: string;
}

interface Band { lo: number; hi: number; canvasSide: -1 | 1 }

class RampInk implements Ink {
  constructor(private readonly h: number, private readonly s: number, private readonly l: number, private readonly band: Band) {}

  lightness(t: number): Ink {
    const k = Math.max(-1, Math.min(1, t));
    const l = k >= 0 ? this.l + k * (this.band.hi - this.l) : this.l + k * (this.l - this.band.lo);
    return new RampInk(this.h, this.s, l, this.band);
  }

  saturation(t: number): Ink {
    const k = Math.max(-1, Math.min(1, t));
    const s = k >= 0 ? this.s + k * (1 - this.s) : this.s * (1 + k);
    return new RampInk(this.h, s, this.l, this.band);
  }

  fade(t: number): Ink {
    return this.lightness(this.band.canvasSide * Math.max(0, Math.min(1, t)));
  }

  get css(): string {
    return toHex(hslToRgb({ h: this.h, s: this.s, l: this.l }));
  }

  toString(): string {
    return this.css;
  }
}

// what a panel draws with: the palette it named, read by position and wrapping past its end so a
// panel wanting two inks can take a palette of six and one wanting six can take a palette of two,
// plus the theme's own trace grey and solve-failure red, the same whichever palette it took
export interface PanelPalette {
  id: string;
  inks: Ink[];
  ink(i: number): Ink;
  neutral: Ink;
  alert: Ink;
}

// every palette resolved for the mode; `palette(id)` is what a panel reads
export interface Theme {
  mode: ThemeMode;
  neutral: Ink;
  alert: Ink;
  palette(id: string): PanelPalette;
}

// the run of lightness, at this hue and saturation, that clears `floor` against the canvas: the
// longest such run when the canvas is mid-toned enough to allow one on each side. A hue that
// can't clear the floor anywhere gets the whole range rather than no colour at all
function legibleBand(h: number, s: number, canvas: Rgb, floor: number): Band {
  const runs: { lo: number; hi: number }[] = [];
  let run: { lo: number; hi: number } | null = null;
  for (let l = LIGHTNESS_LIMITS.lo; l <= LIGHTNESS_LIMITS.hi + 1e-9; l += 0.01) {
    if (contrastRatio(hslToRgb({ h, s, l }), canvas) >= floor) {
      if (run) run.hi = l; else runs.push(run = { lo: l, hi: l });
    } else run = null;
  }
  const best = runs.sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo))[0] ?? LIGHTNESS_LIMITS;
  const canvasL = rgbToHsl(canvas).l;
  return { ...best, canvasSide: canvasL > (best.lo + best.hi) / 2 ? 1 : -1 };
}

export function makeInk(color: string, mode: ThemeMode, canvasBg: string): Ink {
  const rgb = parseColor(color) ?? { r: 128, g: 128, b: 128 };
  const canvas = parseColor(canvasBg) ?? (mode === 'night' ? { r: 30, g: 30, b: 30 } : { r: 195, g: 191, b: 179 });
  const { h, s: s0, l: l0 } = rgbToHsl(rgb);
  // the day canvas is mid-toned, so colours darken to clear it and would go muddy unsaturated
  const s = mode === 'day' && s0 > 0.1 ? Math.min(1, s0 + DAY_SATURATION_BOOST) : s0;
  const band = legibleBand(h, s, canvas, RAMP_FLOOR);
  const base = legibleBand(h, s, canvas, BASE_FLOOR[mode]);
  const margin = BASE_MARGIN * (band.hi - band.lo);
  const lo = Math.max(band.lo + margin, base.lo), hi = Math.min(band.hi - margin, base.hi);
  const l = lo <= hi ? Math.max(lo, Math.min(hi, l0)) : (base.lo + base.hi) / 2;
  return new RampInk(h, s, l, band);
}

export function resolveTheme(palettes: readonly Palette[], mode: ThemeMode, canvasBg: string): Theme {
  const neutral = makeInk(NEUTRAL, mode, canvasBg);
  const alert = makeInk(ALERT, mode, canvasBg);
  const resolved: Record<string, PanelPalette> = {};
  for (const palette of palettes) {
    const inks = palette.inks.map(color => makeInk(color, mode, canvasBg));
    resolved[palette.id] = { id: palette.id, inks, ink: i => inks[((i % inks.length) + inks.length) % inks.length], neutral, alert };
  }
  const first = resolved[palettes[0].id];
  return { mode, neutral, alert, palette: id => resolved[id] ?? first };
}
