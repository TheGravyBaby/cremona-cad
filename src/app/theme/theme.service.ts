import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Palette, Theme, ThemeMode, resolveTheme } from './palette';
import { CREMONA } from './palettes/cremona';

// what the canvas is when no stylesheet answers, as in a test
const CANVAS_FALLBACK: Record<ThemeMode, string> = { night: '#1e1e1e', day: '#c3bfb3' };

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);

  readonly mode = signal<ThemeMode>('night');
  readonly palette = signal<Palette>(CREMONA);
  readonly theme = computed<Theme>(() => resolveTheme(this.palette(), this.mode(), this.canvasBackground(this.mode())));

  constructor() {
    // the inks on :root, so a stylesheet can draw in the palette too
    effect(() => {
      const theme = this.theme();
      const root = this.doc.documentElement;
      theme.inks.forEach((ink, i) => root.style.setProperty(`--ink-${i}`, ink.css));
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
