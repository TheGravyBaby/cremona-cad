import { PALETTES } from './palettes';
import { Ink, PanelPalette, Theme, resolveTheme } from './theme.service';

// the night theme as the app resolves it, for a spec that draws and doesn't care which colour
export const nightTheme = (): Theme => resolveTheme(PALETTES, 'night', '#1e1e1e');

// an ink whose css is its own recipe, `ink2+0.6`, `neutral-0.3`, `ink0s0.4+0.15`, so a spec can
// tell one stroke from another by the ink and tone it was drawn with
export function labelInk(name: string): Ink {
  return {
    css: name,
    lightness: t => labelInk(`${name}${t < 0 ? '' : '+'}${t}`),
    saturation: t => labelInk(`${name}s${t}`),
    fade: t => labelInk(`${name}f${t}`),
  };
}

// every palette the same six labelled inks, so a spec reads the same labels whichever a panel named
export function labelTheme(): Theme {
  const neutral = labelInk('neutral'), alert = labelInk('alert');
  const inks = [0, 1, 2, 3, 4, 5].map(i => labelInk(`ink${i}`));
  const palette = (id: string): PanelPalette => ({ id, inks, ink: i => labelInk(`ink${i}`), neutral, alert });
  return { mode: 'night', neutral, alert, palette };
}
