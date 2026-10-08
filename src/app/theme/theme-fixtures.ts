import { PALETTES } from './palettes';
import { Ink, PanelPalette, Theme, resolveTheme } from './theme.service';

// the night theme as the app resolves it, for a spec that draws and doesn't care which colour
export const nightTheme = (): Theme => resolveTheme(PALETTES, 'night', '#1e1e1e');

// an ink that is its own recipe, `ink2+0.6`, `neutral-0.3`, `ink0+0.15s0.4f0.5`, so a spec can
// tell one stroke from another by the ink and tone it was drawn with
export function labelInk(name: string): Ink {
  const signed = (t: number) => `${t < 0 ? '' : '+'}${t}`;
  const mod = (lightness = 0, saturation = 0, fade = 0) =>
    `${name}${lightness ? signed(lightness) : ''}${saturation ? `s${saturation}` : ''}${fade ? `f${fade}` : ''}`;
  return Object.assign(new String(name), { mod }) as unknown as Ink;
}

// every palette the same six labelled inks, so a spec reads the same labels whichever a panel named
export function labelTheme(): Theme {
  const neutral = labelInk('neutral'), alert = labelInk('alert');
  const inks = [0, 1, 2, 3, 4, 5].map(i => labelInk(`ink${i}`));
  const palette = (id: string): PanelPalette => ({ id, inks, ink: i => labelInk(`ink${i}`), neutral, alert });
  return { mode: 'night', neutral, alert, palette };
}
