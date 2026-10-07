import { Palette } from '../palette';
import { classicCremona } from './classic-cremona';

// every palette a panel can name, by id. Add a file beside these and list it here
export const PALETTES = { classicCremona } as const satisfies Record<string, Palette>;
export type PaletteId = keyof typeof PALETTES;
export const PALETTE_LIST: readonly Palette[] = Object.values(PALETTES);
