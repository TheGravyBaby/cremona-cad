import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Theme, ThemeMode, resolveTheme } from './palette';
import { PALETTE_LIST } from './palettes';

// what the canvas is when no stylesheet answers, as in a test
const CANVAS_FALLBACK: Record<ThemeMode, string> = { night: '#1e1e1e', day: '#c3bfb3' };

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);

  readonly mode = signal<ThemeMode>('night');
  readonly theme = computed<Theme>(() => resolveTheme(PALETTE_LIST, this.mode(), this.canvasBackground(this.mode())));

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
