import { PALETTES } from './palettes';
import { Ink, PanelPalette, Theme, resolveTheme } from './theme.service';

// the night theme as the app resolves it, for a spec that draws and doesn't care which colour
export const nightTheme = (): Theme => resolveTheme(PALETTES, 'night');

// an ink that is its own recipe, `ink2.faint(-3)`, `neutral.faint(5)`, so a spec can tell one
// stroke from another by the ink and tone it was drawn with
export function labelInk(name: string): Ink {
  const faint = (steps = 0) => (steps ? `${name}.faint(${steps})` : name);
  return Object.assign(new String(name), { faint }) as unknown as Ink;
}

// every palette the same six labelled inks, so a spec reads the same labels whichever a panel named
export function labelTheme(): Theme {
  const neutral = labelInk('neutral'), alert = labelInk('alert');
  const inks = [0, 1, 2, 3, 4, 5].map(i => labelInk(`ink${i}`));
  const palette = (id: string): PanelPalette => ({ id, inks, ink: i => labelInk(`ink${i}`), neutral, alert });
  return { mode: 'night', neutral, alert, palette };
}
