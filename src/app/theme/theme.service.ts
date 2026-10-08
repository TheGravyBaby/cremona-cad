import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { ALERT, CANVAS, NEUTRAL, PALETTES, Palette, PaletteId } from './palettes';

export type ThemeMode = 'day' | 'night';
export type Ink = string & { faint(steps?: number): string };

export interface PanelPalette {
  id: string;
  inks: Ink[];
  ink(i: number): Ink;
  neutral: Ink;
  alert: Ink;
}

export interface Theme {
  mode: ThemeMode;
  neutral: Ink;
  alert: Ink;
  palette(id: string): PanelPalette;
}

interface Rgb { r: number; g: number; b: number }
interface Hsl { h: number; s: number; l: number }

// the mode the app draws in and the theme resolved for it, cached since resolving scans contrast
// for every ink; a spec puts its own labelled theme in front with `ThemeService.useTheme`
let currentMode: ThemeMode = 'night';
let override: Theme | undefined;
const resolved: Partial<Record<ThemeMode, Theme>> = {};
const current = (): Theme => override ?? (resolved[currentMode] ??= resolveTheme(PALETTES, currentMode));

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // what a panel draws with: `protected readonly pal = ThemeService.getPalette('varnish')`. The
  // palette is live, every read resolving against the mode at that moment, so a field set once
  // follows a day/night flip
  static getPalette(id: PaletteId): PanelPalette {
    return {
      id,
      get inks() { return current().palette(id).inks; },
      ink: i => current().palette(id).ink(i),
      get neutral() { return current().neutral; },
      get alert() { return current().alert; },
    };
  }

  static useTheme(theme: Theme): void {
    override = theme;
  }

  // the Angular side: the mode as a signal a recipe redraws on, and the canvas and the theme's
  // own two inks on :root so a stylesheet draws on the same ground
  private readonly doc = inject(DOCUMENT);
  readonly mode = signal<ThemeMode>('night');

  constructor() {
    effect(() => {
      const mode = this.mode();
      const root = this.doc.documentElement;
      root.classList.toggle('day-mode', mode === 'day');
      root.style.setProperty('--ui-bg-canvas', CANVAS[mode]);
      root.style.setProperty('--ink-neutral', current().neutral);
      root.style.setProperty('--ink-alert', current().alert);
    });
  }

  setMode(mode: ThemeMode): void {
    currentMode = mode;
    this.mode.set(mode);
  }
}

function ink(css: string, faint: Ink['faint']): Ink {
  return Object.assign(new String(css), { faint }) as unknown as Ink;
}


export function parseHex(hex: string): Rgb {
  const byte = (i: number) => parseInt(hex.substring(i, i + 2), 16) || 0;
  return { r: byte(1), g: byte(3), b: byte(5) };
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

// the contrast a stroke needs against the canvas, low enough that an ink which already reads stays
// where the palette put it. WCAG's 3:1 by day dragged every yellow down to brown, no yellow paler
// than the mid-toned day canvas reaching it. By day the ramp runs on to 1.5:1, since a base sitting
// on the 2:1 edge would leave its siblings nowhere to go
const BASE_FLOOR = 2;
const RAMP_FLOOR: Record<ThemeMode, number> = { day: 1.5, night: 2 };
const LIGHTNESS_LIMITS = { lo: 0.05, hi: 0.94 };
// the base sits at least this far inside the ramp's band, so a ramp has somewhere to go both ways
const BASE_MARGIN = 0.1;
// `faint(n)` takes whole steps, so one step fainter is the same nudge on every panel; five reach
// the band's edge
const FAINT_STEPS = 5;

interface Band { lo: number; hi: number; canvasSide: -1 | 1 }

const wholeSteps = (n: number) => Math.max(-FAINT_STEPS, Math.min(FAINT_STEPS, Math.sign(n) * Math.round(Math.abs(n))));

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

export function makeInk(color: string, mode: ThemeMode): Ink {
  const canvas = parseHex(CANVAS[mode]);
  const { h, s, l: l0 } = rgbToHsl(parseHex(color));
  const band = legibleBand(h, s, canvas, RAMP_FLOOR[mode]);
  const base = legibleBand(h, s, canvas, BASE_FLOOR);
  const margin = BASE_MARGIN * (band.hi - band.lo);
  const lo = Math.max(band.lo + margin, base.lo), hi = Math.min(band.hi - margin, base.hi);
  const l = lo <= hi ? Math.max(lo, Math.min(hi, l0)) : (base.lo + base.hi) / 2;
  const ramp = (from: number, t: number) => (t >= 0 ? from + t * (band.hi - from) : from + t * (from - band.lo));
  const hex = (light: number) => toHex(hslToRgb({ h, s, l: light }));
  return ink(hex(l), (steps = 0) => hex(ramp(l, band.canvasSide * wholeSteps(steps) / FAINT_STEPS)));
}

export function resolveTheme(palettes: Record<string, Palette>, mode: ThemeMode): Theme {
  const neutral = makeInk(NEUTRAL, mode);
  const alert = makeInk(ALERT, mode);
  const resolved: Record<string, PanelPalette> = {};
  for (const [id, palette] of Object.entries(palettes)) {
    const inks = palette.inks.map(color => makeInk(color, mode));
    resolved[id] = { id, inks, ink: i => inks[((i % inks.length) + inks.length) % inks.length], neutral, alert };
  }
  return { mode, neutral, alert, palette: id => resolved[id] };
}

