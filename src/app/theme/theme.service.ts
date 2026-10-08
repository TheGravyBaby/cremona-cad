import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ALERT, NEUTRAL, PALETTES, Palette } from './palettes';

export type ThemeMode = 'day' | 'night';

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

// what a panel draws with: the palette it named, read by position and wrapping past its end,
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

interface Rgb { r: number; g: number; b: number }
interface Hsl { h: number; s: number; l: number }

export function parseColor(s: string): (Rgb & { a: number }) | null {
  const text = s.trim();
  const hexShort = /^#([0-9a-f]{3})$/i.exec(text);
  if (hexShort) {
    const [r, g, b] = hexShort[1].split('').map(c => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  const hexLong = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text);
  if (hexLong) {
    const byte = (i: number) => parseInt(hexLong[1].substring(i, i + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: hexLong[2] ? parseInt(hexLong[2], 16) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(text);
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(rgb[4]))) : 1 };
  }
  return null;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d + 6) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rn = 0, gn = 0, bn = 0;
  if (h < 60) { rn = c; gn = x; }
  else if (h < 120) { rn = x; gn = c; }
  else if (h < 180) { gn = c; bn = x; }
  else if (h < 240) { gn = x; bn = c; }
  else if (h < 300) { rn = x; bn = c; }
  else { rn = c; bn = x; }
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return { r: to255(rn), g: to255(gn), b: to255(bn) };
}

export function toHex({ r, g, b }: Rgb): string {
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

// WCAG relative luminance / contrast ratio (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance)
function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// what the canvas is when no stylesheet answers, as in a test
export const CANVAS_FALLBACK: Record<ThemeMode, string> = { night: '#1e1e1e', day: '#c3bfb3' };

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
  const canvas = parseColor(canvasBg) ?? parseColor(CANVAS_FALLBACK[mode])!;
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

export function resolveTheme(palettes: Record<string, Palette>, mode: ThemeMode, canvasBg: string): Theme {
  const neutral = makeInk(NEUTRAL, mode, canvasBg);
  const alert = makeInk(ALERT, mode, canvasBg);
  const resolved: Record<string, PanelPalette> = {};
  for (const [id, palette] of Object.entries(palettes)) {
    const inks = palette.inks.map(color => makeInk(color, mode, canvasBg));
    resolved[id] = { id, inks, ink: i => inks[((i % inks.length) + inks.length) % inks.length], neutral, alert };
  }
  const first = Object.values(resolved)[0];
  return { mode, neutral, alert, palette: id => resolved[id] ?? first };
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);

  readonly mode = signal<ThemeMode>('night');
  readonly theme = computed<Theme>(() => resolveTheme(PALETTES, this.mode(), this.canvasBackground(this.mode())));

  constructor() {
    // the theme's own two inks on :root, so a stylesheet can draw in them too
    effect(() => {
      const theme = this.theme();
      const root = this.doc.documentElement;
      root.style.setProperty('--ink-neutral', theme.neutral.css);
      root.style.setProperty('--ink-alert', theme.alert.css);
    });
  }

  // the day-mode class first, so the canvas colour read for the theme is the one being shown
  setMode(mode: ThemeMode): void {
    this.doc.documentElement.classList.toggle('day-mode', mode === 'day');
    this.mode.set(mode);
  }

  private canvasBackground(mode: ThemeMode): string {
    try {
      const view = this.doc.defaultView;
      const value = view?.getComputedStyle(this.doc.documentElement).getPropertyValue('--ui-bg-canvas').trim();
      return value || CANVAS_FALLBACK[mode];
    } catch {
      return CANVAS_FALLBACK[mode];
    }
  }
}
